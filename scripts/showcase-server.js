#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createObserver, renderChanges } from "./showcase-watch.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const HEALTH_PATH = "/__showcase_health";
const LIVE_RELOAD_PATH = "/__showcase_live_reload";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
]);

const scriptPath = fileURLToPath(import.meta.url);
export const projectRoot = resolve(dirname(scriptPath), "..");

export function serverStatePath(root = projectRoot) {
  const id = createHash("sha256").update(resolve(root)).digest("hex").slice(0, 16);
  return join(tmpdir(), `showcase-server-${id}.json`);
}

async function readServerState(root = projectRoot) {
  try {
    return JSON.parse(await readFile(serverStatePath(root), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function serverHealth(state) {
  try {
    const response = await fetch(`http://${state.host}:${state.port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(700),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function stopExistingServer({ root = projectRoot, kill = process.kill } = {}) {
  const state = await readServerState(root);
  if (!state) return false;

  const health = await serverHealth(state);
  if (health?.pid !== state.pid || resolve(health.root ?? "") !== resolve(root)) {
    await rm(serverStatePath(root), { force: true });
    return false;
  }

  kill(state.pid, "SIGTERM");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!await serverHealth(state)) break;
    await delay(50);
  }
  await rm(serverStatePath(root), { force: true });
  return true;
}

export function contentType(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

export function resolveRequestPath(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const target = resolve(root, `.${requested}`);
  const localPath = relative(root, target);
  if (localPath.startsWith("..") || isAbsolute(localPath)) return null;
  return target;
}

export function injectLiveReload(html) {
  const script = `<script type="module">\nconst events = new EventSource("${LIVE_RELOAD_PATH}");\nevents.addEventListener("reload", () => location.reload());\n</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${script}\n</body>`) : `${html}\n${script}`;
}

export function browserCommand(url, platform = process.platform) {
  if (platform === "win32") return { command: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

export function openBrowser(url, { platform = process.platform, spawnImpl = spawn } = {}) {
  const { command, args } = browserCommand(url, platform);
  const child = spawnImpl(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on?.("error", (error) => console.error(`브라우저 자동 실행 실패 · ${error.message}`));
  child.unref?.();
}

export function createShowcaseServer({ root = projectRoot } = {}) {
  const reloadClients = new Set();
  const server = createServer(async (request, response) => {
    const requestUrl = request.url ?? "/";
    if (new URL(requestUrl, "http://localhost").pathname === HEALTH_PATH) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ pid: process.pid, root }));
      return;
    }
    if (new URL(requestUrl, "http://localhost").pathname === LIVE_RELOAD_PATH) {
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      reloadClients.add(response);
      request.on("close", () => reloadClients.delete(response));
      return;
    }

    const filePath = resolveRequestPath(root, requestUrl);
    if (!filePath) {
      response.writeHead(400).end("Bad request");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
      const type = contentType(filePath);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", type);
      if (type.startsWith("text/html")) {
        response.end(injectLiveReload(await readFile(filePath, "utf8")));
      } else {
        createReadStream(filePath).on("error", () => response.destroy()).pipe(response);
      }
    } catch (error) {
      if (error.code === "ENOENT") response.writeHead(404).end("Not found");
      else response.writeHead(500).end("Internal server error");
    }
  });

  return {
    server,
    reload() {
      for (const client of reloadClients) client.write("event: reload\ndata: changed\n\n");
    },
    closeClients() {
      for (const client of reloadClients) client.end();
      reloadClients.clear();
    },
  };
}

async function main() {
  const portValue = Number.parseInt(process.env.SHOWCASE_PORT ?? "", 10);
  const port = Number.isInteger(portValue) && portValue > 0 ? portValue : DEFAULT_PORT;
  const host = process.env.SHOWCASE_HOST || DEFAULT_HOST;
  const shouldOpen = !process.argv.includes("--no-open");
  const shouldRestart = process.argv.includes("--restart");
  if (shouldRestart) {
    const stopped = await stopExistingServer();
    console.log(stopped ? "기존 게임 서버를 종료했습니다." : "실행 중인 게임 서버가 없습니다.");
  }
  const app = createShowcaseServer();
  const observer = createObserver({
    rootDir: projectRoot,
    baseDir: projectRoot,
    onChanges: async (changes) => {
      process.stdout.write(`\n${renderChanges(changes)}\n`);
      app.reload();
    },
  });

  app.server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`게임 서버 실행 실패 · ${host}:${port} 포트를 다른 프로그램이 사용 중입니다.`);
    } else {
      console.error(`게임 서버 실행 실패 · ${error.message}`);
    }
    process.exitCode = 2;
  });

  app.server.listen(port, host, async () => {
    await writeFile(
      serverStatePath(),
      `${JSON.stringify({ pid: process.pid, root: projectRoot, host, port })}\n`,
      "utf8",
    );
    await observer.start();
    const url = `http://${host}:${port}/index.html`;
    console.log(`게임 서버 실행 중 · ${url}`);
    console.log("코드가 변경되면 브라우저가 자동으로 새로고침됩니다.");
    if (shouldOpen) openBrowser(url);
  });

  const stop = async () => {
    await observer.stop();
    app.closeClients();
    await rm(serverStatePath(), { force: true });
    app.server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
