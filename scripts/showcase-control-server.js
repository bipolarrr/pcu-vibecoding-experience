#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  clearCurrentVerification,
  codexTerminalCommand,
  interactiveTerminalEnvironment,
  inspectShowcase,
  inspectVerification,
  recordCurrentVerification,
} from "../.showcase/demo.mjs";
import { DEV_SERVER_HEALTH_PATH } from "./dev-server.js";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
export const projectRoot = resolve(dirname(scriptPath), "..");
export const DEFAULT_CONTROL_PORT = 5174;
export const DEFAULT_GAME_PORT = 5173;
const CONTROL_SHUTDOWN_TIMEOUT = 5 * 60_000;

const delay = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds));
const now = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });
const log = (message) => console.log(`[${now()}] ${message}`);

const ACTION_LABELS = new Map([
  ["fresh-start", "시연 처음부터 시작"],
  ["dev-start", "게임 서버 시작"],
  ["dev-restart", "게임 서버 재시작"],
  ["dev-stop", "게임 서버 중지"],
  ["watch-start", "변경 감시 창 열기"],
  ["watch-stop", "변경 감시 창 닫기"],
  ["showcase-start", "인공지능 도우미 열기"],
  ["showcase-prepare", "인공지능 도우미 미리 준비"],
  ["showcase-status", "시연 상태 확인"],
  ["showcase-reset", "기준판으로 초기화"],
  ["showcase-baseline", "현재 커밋을 기준판으로 확정"],
  ["test", "시연 환경 점검"],
]);

export function npmCommand(name, {
  platform = process.platform,
  execPath = process.execPath,
  environment = process.env,
} = {}) {
  const npmCli = environment.npm_execpath;
  if (typeof npmCli === "string" && /\.(?:c?js|mjs)$/i.test(npmCli)) {
    return { command: execPath, args: [npmCli, "run", name] };
  }
  if (platform === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd run ${name}`],
    };
  }
  return { command: "npm", args: ["run", name] };
}

function safeStatus() {
  try {
    const showcase = inspectShowcase();
    return {
      kind: showcase.kind,
      branch: showcase.branch,
      commit: showcase.head?.slice(0, 7),
      reasons: showcase.reasons ?? [],
      verification: inspectVerification(showcase.baseline),
    };
  } catch {
    return { kind: "error", reasons: ["status-unavailable"], verification: { verified: false } };
  }
}

export function classifyCommandFailure(error) {
  const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  if (error?.code === "ENOENT") return "tool-missing";
  if (error?.code === "ETIMEDOUT") return "command-timeout";
  if (error?.code === 10 || error?.exitCode === 10) return "reset-required";
  if (/EADDRINUSE|포트.*사용 중|address already in use/i.test(output)) return "port-in-use";
  if (/작업 트리가 깨끗하지 않다|working tree.*not clean/i.test(output)) return "working-tree-dirty";
  if (/showcase 브랜치가 없다|기준판을 먼저 확정/i.test(output)) return "baseline-missing";
  if (/다른 worktree에서 사용 중/i.test(output)) return "other-worktree";
  if (/시연 환경 점검 실패|fail(?:ed|ure)|not ok/i.test(output)) return "tests-failed";
  if (/Codex .*실패|codex.*(?:not found|failed)/i.test(output)) return "codex-failed";
  if (/Git (?:merge|rebase|cherry-pick|revert)|진행 중인 Git/i.test(output)) return "git-operation-active";
  return "command-failed";
}

async function runNpmScript(name, { root = projectRoot, timeout = 5 * 60_000 } = {}) {
  log(`명령 실행: npm run ${name}`);
  return new Promise((accept, reject) => {
    const specification = npmCommand(name);
    const child = spawn(specification.command, specification.args, {
      cwd: root,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) => `${current}${chunk}`.slice(-16 * 1024 * 1024);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
      process.stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      const failure = new Error(`npm script failed: ${name}`);
      failure.code = classifyCommandFailure(error);
      failure.cause = error;
      reject(failure);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (exitCode === 0 && !timedOut) {
        log(`명령 완료: npm run ${name}`);
        accept({ stdout, stderr });
        return;
      }
      const cause = { stdout, stderr, exitCode, code: timedOut ? "ETIMEDOUT" : exitCode };
      const failure = new Error(`npm script failed: ${name}`);
      failure.code = classifyCommandFailure(cause);
      failure.exitCode = exitCode;
      failure.cause = cause;
      reject(failure);
    });
  });
}

async function controlIsInBaseline(root) {
  try {
    await execFileAsync("git", [
      "-C",
      root,
      "cat-file",
      "-e",
      "showcase:scripts/showcase-control-server.js",
    ], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function resetFeaturesDuringDevelopment(root) {
  const status = inspectShowcase();
  if (status.kind === "error" || status.kind === "reset-needed") {
    const error = new Error("repository must be reset before a development-mode start");
    error.code = "reset-required";
    throw error;
  }
  log("운영 페이지 개발 변경을 보호하면서 게임 기능만 기준 상태로 되돌립니다.");
  await execFileAsync("git", [
    "-C",
    root,
    "restore",
    "--source",
    "showcase",
    "--staged",
    "--worktree",
    "--",
    "src/features",
  ], { windowsHide: true });
  await execFileAsync("git", [
    "-C",
    root,
    "clean",
    "-f",
    "-d",
    "--",
    "src/features",
  ], { windowsHide: true });
  log("개발 중 상태이므로 시연 필수 환경을 점검합니다.");
  await runNpmScript("test", { root });
}

export function browserCommand(url, platform = process.platform) {
  if (platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] };
  }
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

export function watchTerminalCommand(
  platform = process.platform,
  environment = process.env,
  root = projectRoot,
) {
  if (platform === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/k", "node", "scripts\\showcase-watch.js"],
    };
  }
  if (platform === "darwin") {
    const escaped = root.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    return {
      command: "osascript",
      args: [
        "-e",
        `tell application "Terminal" to do script "cd \\\"${escaped}\\\" && node scripts/showcase-watch.js"`,
      ],
    };
  }
  return {
    command: "x-terminal-emulator",
    args: ["-e", "bash", "-lc", "node scripts/showcase-watch.js; exec bash"],
  };
}

function launchDetached(specification) {
  return new Promise((accept, reject) => {
    const child = spawn(specification.command, specification.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      accept();
    });
  });
}

async function gameHealth(port = DEFAULT_GAME_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${DEV_SERVER_HEALTH_PATH}`, {
      signal: AbortSignal.timeout(700),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function portResponds(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function killProcessTree(pid, platform = process.platform, detachedGroup = false) {
  if (!Number.isInteger(pid) || pid < 1) return;
  if (platform === "win32") {
    await execFileAsync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
    return;
  }
  try {
    process.kill(detachedGroup ? -pid : pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

export class ServiceManager {
  constructor({ root = projectRoot, gamePort = DEFAULT_GAME_PORT } = {}) {
    this.root = root;
    this.gamePort = gamePort;
    this.watchProcess = null;
    this.codexProcess = null;
    this.gameProcess = null;
  }

  #spawnScript(name) {
    const specification = npmCommand(name);
    const child = spawn(specification.command, specification.args, {
      cwd: this.root,
      env: { ...process.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
    }
    child.startupError = null;
    child.on("error", (error) => { child.startupError = error; });
    return child;
  }

  #spawnWatchTerminal() {
    const specification = watchTerminalCommand(process.platform, process.env, this.root);
    const child = spawn(specification.command, specification.args, {
      cwd: this.root,
      detached: true,
      env: interactiveTerminalEnvironment(),
      stdio: "ignore",
      windowsHide: false,
    });
    child.startupError = null;
    child.on("error", (error) => { child.startupError = error; });
    child.unref();
    return child;
  }

  #spawnCodexTerminal() {
    const specification = codexTerminalCommand(process.platform, process.env);
    const child = spawn(specification.command, specification.args, {
      cwd: this.root,
      detached: true,
      env: interactiveTerminalEnvironment(),
      stdio: "ignore",
      windowsHide: false,
    });
    child.startupError = null;
    child.on("error", (error) => { child.startupError = error; });
    child.unref();
    return child;
  }

  async startGame() {
    const existing = await gameHealth(this.gamePort);
    if (existing) {
      if (resolve(existing.root ?? "") !== resolve(this.root)) {
        const error = new Error("game port belongs to another project");
        error.code = "port-in-use";
        throw error;
      }
      log("게임 서버가 이미 실행 중입니다.");
      return { alreadyRunning: true };
    }
    if (await portResponds(this.gamePort)) {
      const error = new Error("game port belongs to another process");
      error.code = "port-in-use";
      throw error;
    }
    const child = this.#spawnScript("dev");
    log("게임 서버가 준비되기를 기다립니다.");
    this.gameProcess = child;
    child.once("exit", () => {
      if (this.gameProcess === child) this.gameProcess = null;
    });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await delay(100);
      const health = await gameHealth(this.gamePort);
      if (health && resolve(health.root ?? "") === resolve(this.root)) {
        log(`게임 서버 준비 완료: http://127.0.0.1:${this.gamePort}`);
        return { alreadyRunning: false };
      }
      if (child.startupError || child.exitCode !== null) break;
    }
    const error = new Error("game server did not become ready");
    error.code = "game-start-failed";
    throw error;
  }

  async stopGame() {
    const health = await gameHealth(this.gamePort);
    if (!health) {
      log("게임 서버는 이미 중지되어 있습니다.");
      return { alreadyStopped: true };
    }
    if (resolve(health.root ?? "") !== resolve(this.root)) {
      const error = new Error("game port belongs to another project");
      error.code = "port-in-use";
      throw error;
    }
    await killProcessTree(Number(health.pid));
    for (let attempt = 0; attempt < 30 && await gameHealth(this.gamePort); attempt += 1) await delay(100);
    this.gameProcess = null;
    log("게임 서버를 중지했습니다.");
    return { alreadyStopped: false };
  }

  async restartGame() {
    await this.stopGame();
    return this.startGame();
  }

  async startWatch() {
    if (this.watchProcess?.exitCode === null) {
      log("변경 감시는 이미 실행 중입니다.");
      return { alreadyRunning: true };
    }
    const child = this.#spawnWatchTerminal();
    this.watchProcess = child;
    child.once("exit", () => {
      if (this.watchProcess === child) this.watchProcess = null;
    });
    await Promise.race([
      new Promise((accept) => child.once("spawn", accept)),
      new Promise((_, reject) => child.once("error", reject)),
    ]);
    await delay(150);
    if (child.exitCode !== null) {
      const error = new Error("watch process exited");
      error.code = "watch-start-failed";
      throw error;
    }
    log("별도 터미널에서 변경 감시를 시작했습니다.");
    return { alreadyRunning: false };
  }

  async stopWatch() {
    if (!this.watchProcess || this.watchProcess.exitCode !== null) {
      log("변경 감시는 이미 중지되어 있습니다.");
      return { alreadyStopped: true };
    }
    await killProcessTree(this.watchProcess.pid, process.platform, true);
    this.watchProcess = null;
    log("변경 감시를 중지했습니다.");
    return { alreadyStopped: false };
  }

  async startCodex() {
    if (this.codexProcess?.exitCode === null) {
      log("인공지능 도우미는 이미 실행 중입니다.");
      return { alreadyRunning: true };
    }
    const child = this.#spawnCodexTerminal();
    this.codexProcess = child;
    child.once("exit", () => {
      if (this.codexProcess === child) this.codexProcess = null;
    });
    await Promise.race([
      new Promise((accept) => child.once("spawn", accept)),
      new Promise((_, reject) => child.once("error", reject)),
    ]);
    await delay(150);
    if (child.exitCode !== null) {
      const error = new Error("codex process exited");
      error.code = "codex-failed";
      throw error;
    }
    log("새 명령 창에서 인공지능 도우미를 열었습니다.");
    return { alreadyRunning: false };
  }

  async stopCodex() {
    if (!this.codexProcess || this.codexProcess.exitCode !== null) {
      log("인공지능 도우미는 이미 중지되어 있습니다.");
      return { alreadyStopped: true };
    }
    await killProcessTree(this.codexProcess.pid, process.platform, true);
    this.codexProcess = null;
    log("인공지능 도우미를 중지했습니다.");
    return { alreadyStopped: false };
  }

  async stopAll() {
    const results = await Promise.allSettled([
      this.stopCodex(),
      this.stopWatch(),
      this.stopGame(),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  async status() {
    const health = await gameHealth(this.gamePort);
    return {
      game: Boolean(health && resolve(health.root ?? "") === resolve(this.root)),
      watch: Boolean(this.watchProcess && this.watchProcess.exitCode === null),
    };
  }
}

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const staticFiles = new Map([
  ["/", "scripts/showcase-control.html"],
  ["/showcase-control.js", "scripts/showcase-control.js"],
  ["/showcase-control.css", "scripts/showcase-control.css"],
  ["/src/i18n/index.js", "src/i18n/index.js"],
  ["/src/i18n/ko.js", "src/i18n/ko.js"],
  ["/src/i18n/en.js", "src/i18n/en.js"],
  ["/src/i18n/ja.js", "src/i18n/ja.js"],
  ["/src/i18n/vi.js", "src/i18n/vi.js"],
  ["/src/i18n/zh.js", "src/i18n/zh.js"],
]);

function json(response, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
  });
  response.end(data);
}

export function createActionExecutor({ root = projectRoot, services = new ServiceManager({ root }) } = {}) {
  return async function execute(action) {
    if (action === "dev-start") return { ...(await services.startGame()), code: "game-started" };
    if (action === "dev-restart") return { ...(await services.restartGame()), code: "game-restarted" };
    if (action === "dev-stop") return { ...(await services.stopGame()), code: "game-stopped" };
    if (action === "watch-start") return { ...(await services.startWatch()), code: "watch-started" };
    if (action === "watch-stop") return { ...(await services.stopWatch()), code: "watch-stopped" };
    if (action === "showcase-start") {
      log("인공지능 도우미를 새 명령 창에서 엽니다.");
      await services.startCodex();
      return { code: "codex-launched" };
    }
    if (action === "fresh-start") {
      log("1/6 이전 시연을 정리하고 기준판으로 되돌립니다.");
      if (await controlIsInBaseline(root)) await runNpmScript("showcase:reset", { root });
      else await resetFeaturesDuringDevelopment(root);
      log("2/6 게임 서버를 준비합니다.");
      await services.startGame();
      log("3/6 게임 화면을 브라우저에서 엽니다.");
      await launchDetached(browserCommand(`http://127.0.0.1:${services.gamePort}/`));
      log("4/6 코드 변경 감시를 준비합니다.");
      await services.startWatch();
      log("5/6 인공지능 도우미가 프로젝트를 미리 파악합니다.");
      await runNpmScript("showcase:prepare", { root });
      log("6/6 인공지능 도우미를 새 명령 창에서 엽니다.");
      await services.startCodex();
      return { code: "fresh-started" };
    }

    const scripts = new Map([
      ["showcase-status", "showcase:status"],
      ["showcase-reset", "showcase:reset"],
      ["showcase-baseline", "showcase:baseline"],
      ["showcase-prepare", "showcase:prepare"],
      ["test", "test"],
    ]);
    const script = scripts.get(action);
    if (!script) {
      const error = new Error("unknown action");
      error.code = "unknown-action";
      throw error;
    }
    if (action === "test") clearCurrentVerification();
    await runNpmScript(script, { root });
    if (action === "test") recordCurrentVerification();
    return { code: `${action}-complete` };
  };
}

export async function startControlServer({
  root = projectRoot,
  port = DEFAULT_CONTROL_PORT,
  token = randomBytes(24).toString("base64url"),
  services = new ServiceManager({ root }),
  execute = null,
  instanceId = randomBytes(16).toString("base64url"),
} = {}) {
  const canonicalRoot = await realpath(root);
  const actionExecutor = execute ?? createActionExecutor({ root: canonicalRoot, services });
  let activeJob = null;
  let activeJobPromise = null;
  let lastResult = null;
  let shuttingDown = false;
  let shutdownPromise = null;

  const runAction = async (action) => {
    if (shuttingDown) {
      const error = new Error("control server is shutting down");
      error.code = "control-unavailable";
      throw error;
    }
    if (activeJob) {
      const error = new Error("another job is running");
      error.code = "job-running";
      error.activeJob = activeJob;
      throw error;
    }
    activeJob = action;
    const label = ACTION_LABELS.get(action) ?? action;
    const startedAt = Date.now();
    log(`▶ 작업 시작: ${label}`);
    activeJobPromise = (async () => {
      try {
        const result = await actionExecutor(action);
        lastResult = { ok: true, action, code: result.code, finishedAt: new Date().toISOString() };
        log(`✓ 작업 완료: ${label} (${((Date.now() - startedAt) / 1000).toFixed(1)}초)`);
        return lastResult;
      } catch (error) {
        const code = typeof error.code === "string" ? error.code : classifyCommandFailure(error);
        console.error(`[${now()}] ✗ 작업 실패: ${label} · ${code}`);
        const detail = error.cause ?? error;
        if (detail.stdout || detail.stderr) console.error(String(detail.stderr || detail.stdout).trim());
        else console.error(detail.message ?? String(detail));
        lastResult = { ok: false, action, code, finishedAt: new Date().toISOString() };
        throw Object.assign(error, { result: lastResult });
      } finally {
        activeJob = null;
        activeJobPromise = null;
      }
    })();
    return activeJobPromise;
  };

  const closeServer = () => new Promise((accept, reject) => {
    server.close((error) => error ? reject(error) : accept());
    server.closeAllConnections();
  });

  const shutdown = ({ stopAll = true } = {}) => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      if (activeJobPromise) {
        try { await activeJobPromise; } catch { /* The result was already logged. */ }
      }
      try {
        if (stopAll) await services.stopAll();
        else await services.stopWatch();
      } finally {
        await closeServer();
      }
    })();
    return shutdownPromise;
  };

  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'");
    const host = request.headers.host ?? "";
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) {
      json(response, 403, { ok: false, code: "request-denied" });
      return;
    }
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      json(response, 400, { ok: false, code: "invalid-request" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      json(response, 200, { ok: true, token, root: canonicalRoot, pid: process.pid, instanceId });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      json(response, 200, {
        ok: true,
        instanceId,
        showcase: safeStatus(),
        services: await services.status(),
        activeJob,
        lastResult,
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/shutdown") {
      const expectedOrigin = `http://${request.headers.host}`;
      if (request.headers.origin !== expectedOrigin || request.headers["x-showcase-token"] !== token) {
        json(response, 403, { ok: false, code: "request-denied" });
        return;
      }
      json(response, 202, { ok: true, code: "shutdown-started", instanceId });
      setImmediate(() => shutdown().catch((error) => {
        console.error(`[${now()}] 운영 서버 종료 실패: ${error.message}`);
      }));
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/actions/")) {
      const expectedOrigin = `http://${request.headers.host}`;
      if (request.headers.origin !== expectedOrigin || request.headers["x-showcase-token"] !== token) {
        json(response, 403, { ok: false, code: "request-denied" });
        return;
      }
      if (activeJob || shuttingDown) {
        json(response, 409, { ok: false, code: "job-running", activeJob });
        return;
      }
      let action;
      try {
        action = decodeURIComponent(url.pathname.slice("/api/actions/".length));
      } catch {
        json(response, 400, { ok: false, code: "invalid-request" });
        return;
      }
      try {
        json(response, 200, await runAction(action));
      } catch (error) {
        const result = error.result ?? { ok: false, action, code: error.code ?? "command-failed" };
        json(response, result.code === "unknown-action" ? 404 : 500, result);
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD, POST");
      json(response, 405, { ok: false, code: "method-not-allowed" });
      return;
    }
    const relativePath = staticFiles.get(url.pathname);
    if (!relativePath) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(resolve(canonicalRoot, relativePath));
      if (url.pathname === "/") log("운영 페이지가 연결되었습니다.");
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": CONTENT_TYPES[extname(relativePath)] ?? "application/octet-stream",
        "Content-Length": body.length,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500).end();
    }
  });

  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      accept();
    });
  });
  return { server, services, token, instanceId, runAction, shutdown };
}

export async function replaceExistingControl({ root = projectRoot, port = DEFAULT_CONTROL_PORT } = {}) {
  const canonicalRoot = await realpath(root);
  const origin = `http://127.0.0.1:${port}`;
  let session;
  try {
    const response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return false;
    session = await response.json();
  } catch {
    return false;
  }
  if (resolve(session.root ?? "") !== canonicalRoot || typeof session.token !== "string") {
    const error = new Error("control port belongs to another process");
    error.code = "EADDRINUSE";
    throw error;
  }
  log("기존 시연 운영 서버를 종료하고 전체 시연을 다시 시작합니다.");
  const response = await fetch(`${origin}/api/shutdown`, {
    method: "POST",
    headers: { Origin: origin, "X-Showcase-Token": session.token },
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    const error = new Error("existing control server refused shutdown");
    error.code = "EADDRINUSE";
    throw error;
  }
  const deadline = Date.now() + CONTROL_SHUTDOWN_TIMEOUT;
  while (Date.now() < deadline) {
    await delay(100);
    try {
      await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(500) });
    } catch {
      return true;
    }
  }
  const error = new Error("existing control server did not stop in time");
  error.code = "ETIMEDOUT";
  throw error;
}

async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) : DEFAULT_CONTROL_PORT;
  const allowed = args.every((argument, index) => (
    argument === "--no-open" || argument === "--port" || (index === portIndex + 1 && /^\d+$/.test(argument))
  ));
  if (!allowed || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("사용법: npm run showcase:control -- [--port 5174] [--no-open]");
  }
  const replacedExisting = await replaceExistingControl({ port });
  const app = await startControlServer({ port });
  const stop = async () => {
    await app.shutdown({ stopAll: false });
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const url = `http://127.0.0.1:${app.server.address().port}/`;
  console.log("");
  console.log("시연 운영 서버가 시작되었습니다.");
  console.log(`운영 페이지: ${url}`);
  console.log(`게임 화면: http://127.0.0.1:${DEFAULT_GAME_PORT}/`);
  console.log("버튼을 누르면 이 창에 진행 과정과 명령 출력이 표시됩니다.");
  console.log("이 창을 닫으면 운영 페이지도 종료됩니다. 종료: Ctrl+C");
  console.log("");
  if (!args.includes("--no-open")) await launchDetached(browserCommand(url));
  if (replacedExisting) {
    try {
      await app.runAction("fresh-start");
    } catch {
      console.error("전체 시연 재시작을 완료하지 못했습니다. 운영 페이지에서 상태를 확인해 주세요.");
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.code === "EADDRINUSE"
      ? "운영 페이지 포트가 이미 사용 중입니다. 기존 운영 서버 창을 확인해 주세요."
      : `시연 운영 서버 시작 실패: ${error.message}`);
    process.exitCode = 2;
  });
}
