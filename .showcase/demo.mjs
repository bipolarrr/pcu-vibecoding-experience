import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";

export const DEMO_BRANCH = "showcase";
export const EXIT_READY = 0;
export const EXIT_ERROR = 2;
export const EXIT_RESET_NEEDED = 10;
export const PREPARED_SESSIONS_VERSION = 1;
export const VERIFICATION_CACHE_VERSION = 2;

export const PREPARATION_PROMPT = `시연 시작 전 내부 준비 작업이다. 체험자의 게임 요청으로 처리하지 말고 파일을 절대 변경하지 마라.

다음 문맥을 지금 이 세션 안에서 충분히 파악하라.
- npm run showcase:status로 현재 시연 상태를 확인한다.
- 저장소 루트 AGENTS.md와 현재 디렉터리에 적용되는 AGENTS.override.md의 운영 규칙을 정리한다.
- .showcase/ACTIVATION.md와 .showcase/CATALOG.md, 모든 .showcase/packs/*/manifest.json을 읽어 기능별 requires, conflicts, replaces와 스타일 축을 파악한다.
- package.json, index.html, src/features/enabled.js 전체와 src/features/의 현재 폴더 목록을 읽어 활성 상태를 파악한다.
- src/core/, src/i18n/, scripts/의 파일 지형을 확인하고, 기능 구현에 쓰는 공개 event·capability·UI·i18n 계약과 브라우저 확인 방법을 파악한다. 기존 게임 코드의 테스트 파일은 읽거나 분석하지 않는다.
- 현재 Git 변경 목록을 읽어 이미 누적된 시연 변경을 구분한다.

웹 검색, 서버 시작·종료, 파일 수정, Git 변경은 하지 마라. 준비 이후 체험자의 요청이 오면 프로젝트 전체를 다시 훑지 말고, 운영 규칙상 매 요청마다 필수인 현재 활성 상태와 요청에 직접 관련된 파일만 확인하라. 마지막 응답은 정확히 "시연 준비 완료" 한 줄만 출력하라.`;

const scriptPath = fileURLToPath(import.meta.url);
export const repositoryRoot = resolve(dirname(scriptPath), "..");
export const showcaseDirectory = resolve(repositoryRoot, ".showcase");

function run(command, args, { cwd = repositoryRoot, stdio = "pipe" } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio,
  });

  if (result.error) {
    return {
      ...result,
      status: typeof result.status === "number" ? result.status : 1,
      stderr: `${result.stderr ?? ""}${result.error.message}`,
      stdout: result.stdout ?? "",
    };
  }

  return result;
}

function git(args, options) {
  return run("git", ["-C", repositoryRoot, ...args], options);
}

function outputOf(result) {
  return String(result.stdout ?? "").trim();
}

function errorOf(result) {
  return String(result.stderr ?? "").trim();
}

function requireSuccess(result, operation) {
  if (result.status === 0) return result;

  const detail = errorOf(result) || outputOf(result) || `exit ${result.status}`;
  throw new Error(`${operation} 실패: ${detail}`);
}

function gitOutput(args, operation) {
  return outputOf(requireSuccess(git(args), operation));
}

function refExists(ref) {
  return git(["show-ref", "--verify", "--quiet", ref]).status === 0;
}

function resolveCommit(ref) {
  const result = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return result.status === 0 ? outputOf(result) : null;
}

function currentBranch() {
  const result = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return result.status === 0 ? outputOf(result) : "(detached HEAD)";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-");
}

function uniqueRef(prefix) {
  let candidate = prefix;
  let suffix = 2;
  while (refExists(`refs/heads/${candidate}`) || refExists(`refs/tags/${candidate}`)) {
    candidate = `${prefix}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function gitPath(name) {
  return gitOutput(["rev-parse", "--git-path", name], `${name} 경로 확인`);
}

function activeGitOperation() {
  const operationPaths = [
    ["MERGE_HEAD", "merge"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
  ];

  for (const [pathName, operation] of operationPaths) {
    const path = gitPath(pathName);
    if (existsSync(resolve(repositoryRoot, path))) return operation;
  }
  return null;
}

function targetBranchInAnotherWorktree() {
  const result = git(["worktree", "list", "--porcelain"]);
  if (result.status !== 0) return null;

  let worktree = null;
  for (const line of outputOf(result).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) worktree = line.slice("worktree ".length);
    if (line === `branch refs/heads/${DEMO_BRANCH}` && resolve(worktree) !== repositoryRoot) {
      return worktree;
    }
  }
  return null;
}

export function inspectShowcase() {
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || outputOf(inside) !== "true") {
    return { kind: "error", message: "시연 저장소의 Git 작업 트리를 확인할 수 없다." };
  }

  const operation = activeGitOperation();
  if (operation) {
    return { kind: "error", message: `진행 중인 Git ${operation} 작업이 있다.` };
  }

  const baseline = resolveCommit(`refs/heads/${DEMO_BRANCH}`);
  if (!baseline) {
    return {
      kind: "error",
      message: `${DEMO_BRANCH} 브랜치가 없다. 운영자가 npm run showcase:baseline을 실행해야 한다.`,
    };
  }

  const head = resolveCommit("HEAD");
  if (!head) return { kind: "error", message: "현재 HEAD 커밋을 확인할 수 없다." };

  const branch = currentBranch();
  const changes = gitOutput(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    "작업 트리 상태 확인",
  );
  const reasons = [];
  if (branch !== DEMO_BRANCH) reasons.push(`현재 브랜치: ${branch}`);
  if (head !== baseline) reasons.push("HEAD가 기준판과 다름");

  if (reasons.length > 0) {
    return { kind: "reset-needed", branch, head, baseline, changes, reasons };
  }
  if (changes) return { kind: "active", branch, head, baseline, changes };
  return { kind: "ready", branch, head, baseline, changes };
}

function printStatus(status) {
  if (status.kind === "ready") {
    console.log(`시연 준비 완료 · ${DEMO_BRANCH} · ${status.head.slice(0, 7)}`);
    return;
  }
  if (status.kind === "active") {
    console.log(`시연 진행 중 · 기존 변경 유지 · ${DEMO_BRANCH} · ${status.head.slice(0, 7)}`);
    return;
  }
  if (status.kind === "reset-needed") {
    console.log("시연 환경 수동 초기화 필요");
    for (const reason of status.reasons) console.log(`- ${reason}`);
    return;
  }
  console.error(`시연 환경 확인 실패 · ${status.message}`);
}

export function statusCommand() {
  try {
    const status = inspectShowcase();
    printStatus(status);
    if (status.kind === "ready" || status.kind === "active") {
      const verification = inspectVerification(status.baseline);
      console.log(verification.verified
        ? `시연 환경 점검 완료 · ${verification.verifiedAt}`
        : "시연 환경 점검 필요");
      return EXIT_READY;
    }
    if (status.kind === "reset-needed") return EXIT_RESET_NEEDED;
    return EXIT_ERROR;
  } catch (error) {
    console.error(`시연 환경 확인 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

function runReadinessCheck() {
  console.log("시연 필수 환경 점검");
  const result = run(process.execPath, ["scripts/showcase-readiness.js"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("시연 환경 점검에 실패했다.");
}

function verificationCachePath() {
  return resolve(repositoryRoot, gitPath("showcase-verification.json"));
}

function readVerificationCache() {
  try {
    const parsed = JSON.parse(readFileSync(verificationCachePath(), "utf8"));
    if (parsed.version !== VERIFICATION_CACHE_VERSION || typeof parsed.fingerprint !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function verificationFingerprint(baseline) {
  const gitVersion = outputOf(requireSuccess(git(["--version"]), "Git 버전 확인"));
  const autocrlfResult = git(["config", "--get", "core.autocrlf"]);
  const autocrlf = autocrlfResult.status === 0 ? outputOf(autocrlfResult) : "unset";
  return createHash("sha256").update(JSON.stringify({
    version: VERIFICATION_CACHE_VERSION,
    baseline,
    node: process.version,
    platform: platform,
    arch: arch,
    git: gitVersion,
    autocrlf,
  })).digest("hex");
}

function writeVerificationCache(baseline) {
  const cache = {
    version: VERIFICATION_CACHE_VERSION,
    fingerprint: verificationFingerprint(baseline),
    baseline,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(verificationCachePath(), `${JSON.stringify(cache, null, 2)}\n`);
  return cache;
}

export function clearCurrentVerification() {
  rmSync(verificationCachePath(), { force: true });
}

export function inspectVerification(baseline = resolveCommit(`refs/heads/${DEMO_BRANCH}`)) {
  if (!baseline) return { verified: false, reason: "baseline-missing" };
  try {
    const cache = readVerificationCache();
    if (!cache) return { verified: false, reason: "cache-missing" };
    if (cache.fingerprint !== verificationFingerprint(baseline)) {
      return { verified: false, reason: "environment-changed", verifiedAt: cache.verifiedAt };
    }
    return { verified: true, reason: "unchanged", verifiedAt: cache.verifiedAt };
  } catch {
    return { verified: false, reason: "cache-unavailable" };
  }
}

export function recordCurrentVerification() {
  const status = inspectShowcase();
  if (status.kind !== "ready") return false;
  writeVerificationCache(status.baseline);
  return true;
}

function ensureVerified(baseline) {
  console.log("시연 시작 전 필수 환경을 다시 점검합니다.");
  clearCurrentVerification();
  runReadinessCheck();
  const cache = writeVerificationCache(baseline);
  console.log("시연 환경 검증 완료");
  return { verified: true, reason: "verified-now", verifiedAt: cache.verifiedAt };
}

export function baselineCommand() {
  try {
    const operation = activeGitOperation();
    if (operation) throw new Error(`진행 중인 Git ${operation} 작업이 있다.`);

    const changes = gitOutput(
      ["status", "--porcelain=v1", "--untracked-files=all"],
      "작업 트리 상태 확인",
    );
    if (changes) throw new Error("작업 트리가 깨끗하지 않다. 변경 사항을 먼저 커밋해야 한다.");

    clearCurrentVerification();
    runReadinessCheck();
    const head = gitOutput(["rev-parse", "HEAD"], "현재 커밋 확인");
    const previous = resolveCommit(`refs/heads/${DEMO_BRANCH}`);
    if (currentBranch() === DEMO_BRANCH) {
      writeVerificationCache(head);
      console.log(`기준판 유지 · ${DEMO_BRANCH} · ${head.slice(0, 7)}`);
      return EXIT_READY;
    }

    const occupiedWorktree = targetBranchInAnotherWorktree();
    if (occupiedWorktree) {
      throw new Error(`${DEMO_BRANCH} 브랜치가 다른 worktree에서 사용 중이다: ${occupiedWorktree}`);
    }

    requireSuccess(git(["branch", "-f", DEMO_BRANCH, head]), "시연 기준 브랜치 지정");
    writeVerificationCache(head);
    console.log(`기준판 확정 · ${DEMO_BRANCH} · ${head.slice(0, 7)}`);
    if (previous && previous !== head) console.log(`이전 기준 커밋 · ${previous.slice(0, 7)}`);
    return EXIT_READY;
  } catch (error) {
    console.error(`기준판 확정 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

function createArchiveBranch(head) {
  const name = uniqueRef(`showcase-archive/${timestamp()}-${head.slice(0, 7)}`);
  requireSuccess(git(["branch", name, head]), "체험 커밋 보관");
  return name;
}

function stashChanges() {
  const message = `showcase reset ${timestamp()}`;
  requireSuccess(
    git(["stash", "push", "--include-untracked", "--message", message]),
    "미커밋 변경 보관",
  );
  const latest = gitOutput(["stash", "list", "-1", "--format=%gd"], "stash 식별자 확인");
  return latest || message;
}

export function resetCommand() {
  try {
    const operation = activeGitOperation();
    if (operation) throw new Error(`진행 중인 Git ${operation} 작업이 있다.`);

    const baseline = resolveCommit(`refs/heads/${DEMO_BRANCH}`);
    if (!baseline) {
      throw new Error(`${DEMO_BRANCH} 브랜치가 없다. 운영자가 기준판을 먼저 확정해야 한다.`);
    }

    const occupiedWorktree = targetBranchInAnotherWorktree();
    if (occupiedWorktree && currentBranch() !== DEMO_BRANCH) {
      throw new Error(`${DEMO_BRANCH} 브랜치가 다른 worktree에서 사용 중이다: ${occupiedWorktree}`);
    }

    const head = gitOutput(["rev-parse", "HEAD"], "현재 커밋 확인");
    const changes = gitOutput(
      ["status", "--porcelain=v1", "--untracked-files=all"],
      "작업 트리 상태 확인",
    );
    const demoChanges = currentBranch() === DEMO_BRANCH && head === baseline;
    const archiveBranch = head !== baseline ? createArchiveBranch(head) : null;
    const stashRef = changes && !demoChanges ? stashChanges() : null;

    if (currentBranch() === DEMO_BRANCH) {
      requireSuccess(git(["reset", "--hard", baseline], { stdio: "inherit" }), "기준판 복원");
    } else {
      requireSuccess(
        git(["switch", "-C", DEMO_BRANCH, baseline], { stdio: "inherit" }),
        "시연 브랜치 전환",
      );
    }
    requireSuccess(git(["clean", "-f", "-d"], { stdio: "inherit" }), "untracked 파일 정리");

    const finalStatus = inspectShowcase();
    if (finalStatus.kind !== "ready") {
      throw new Error(
        finalStatus.kind === "error" ? finalStatus.message : finalStatus.reasons.join(", "),
      );
    }

    ensureVerified(baseline);

    console.log(`시연 환경 복원 완료 · ${baseline.slice(0, 7)}`);
    if (archiveBranch) console.log(`체험 커밋 보관 · ${archiveBranch}`);
    if (stashRef) console.log(`미커밋 변경 보관 · ${stashRef}`);
    if (changes && demoChanges) console.log("이전 시연 변경 정리 완료");
    return EXIT_READY;
  } catch (error) {
    console.error(`시연 환경 복원 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

export function codexExecutableForPlatform(platform = process.platform) {
  return platform === "win32" ? "codex.exe" : "codex";
}

export function threadIdFromJsonLines(output) {
  for (const line of String(output ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        return event.thread_id;
      }
    } catch {
      // Ignore non-JSON diagnostics and continue looking for the thread event.
    }
  }
  return null;
}

const preparationFiles = [
  "AGENTS.md",
  ".showcase/AGENTS.override.md",
  ".showcase/ACTIVATION.md",
  ".showcase/CATALOG.md",
  ".showcase/.codex/config.toml",
  "package.json",
  "index.html",
];

const preparationDirectories = ["src/core", "src/features", "src/i18n", "scripts"];

function filesIn(directory, predicate = () => true) {
  const absoluteDirectory = resolve(repositoryRoot, directory);
  if (!existsSync(absoluteDirectory)) return [];

  const files = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...filesIn(relative, predicate));
    else if (entry.isFile() && predicate(relative)) files.push(relative);
  }
  return files.sort();
}

export function preparationFingerprint(baseline) {
  const hash = createHash("sha256");
  hash.update(`version:${PREPARED_SESSIONS_VERSION}\nbaseline:${baseline}\nprompt:${PREPARATION_PROMPT}\n`);

  const files = [
    ...preparationFiles,
    ...preparationDirectories.flatMap((directory) => filesIn(directory)),
    ...filesIn(".showcase/packs", (path) => path.endsWith("/manifest.json")),
  ].sort();

  for (const file of files) {
    const absolute = resolve(repositoryRoot, file);
    hash.update(`\nfile:${file}\n`);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      hash.update("<missing>");
      continue;
    }
    hash.update(readFileSync(absolute));
  }
  return hash.digest("hex");
}

function preparedSessionsPath() {
  return resolve(repositoryRoot, gitPath("showcase-prepared-sessions.json"));
}

function readPreparedSessions() {
  try {
    const parsed = JSON.parse(readFileSync(preparedSessionsPath(), "utf8"));
    if (
      parsed.version !== PREPARED_SESSIONS_VERSION
      || !parsed.sessions
      || typeof parsed.sessions !== "object"
      || Array.isArray(parsed.sessions)
    ) {
      return { version: PREPARED_SESSIONS_VERSION, sessions: {} };
    }
    return parsed;
  } catch {
    return { version: PREPARED_SESSIONS_VERSION, sessions: {} };
  }
}

function writePreparedSessions(cache) {
  writeFileSync(preparedSessionsPath(), `${JSON.stringify(cache, null, 2)}\n`);
}

function forgetPreparedSession(fingerprint) {
  const cache = readPreparedSessions();
  if (!cache.sessions[fingerprint]) return;
  delete cache.sessions[fingerprint];
  if (Object.keys(cache.sessions).length === 0) rmSync(preparedSessionsPath(), { force: true });
  else writePreparedSessions(cache);
}

function ensurePreparedSession(status, executable = codexExecutableForPlatform()) {
  const fingerprint = preparationFingerprint(status.baseline);
  const cache = readPreparedSessions();
  const existing = cache.sessions[fingerprint];
  if (existing && typeof existing.threadId === "string") {
    return { fingerprint, threadId: existing.threadId, reused: true };
  }

  console.log("골든 시연 문맥 준비 중 · 현재 프로젝트 상태 최초 1회");
  const preparation = run(
    executable,
    ["exec", "--json", "-C", showcaseDirectory, PREPARATION_PROMPT],
  );
  if (preparation.status !== 0) {
    const detail = errorOf(preparation) || outputOf(preparation) || `exit ${preparation.status}`;
    throw new Error(`Codex 준비 실패 · ${detail}`);
  }

  const threadId = threadIdFromJsonLines(`${preparation.stdout ?? ""}\n${preparation.stderr ?? ""}`);
  if (!threadId) throw new Error("Codex 준비 실패 · 준비된 세션 식별자를 확인할 수 없다.");

  cache.sessions[fingerprint] = { threadId, createdAt: new Date().toISOString() };
  writePreparedSessions(cache);
  return { fingerprint, threadId, reused: false };
}

function startableShowcaseStatus() {
  const status = inspectShowcase();
  printStatus(status);
  if (status.kind === "error") return { exitCode: EXIT_ERROR, status };
  if (status.kind === "reset-needed") {
    console.error("시연 세션을 시작하지 않았다. 운영자가 npm run showcase:reset을 실행해야 한다.");
    return { exitCode: EXIT_RESET_NEEDED, status };
  }
  return { exitCode: null, status };
}

export function prepareCommand() {
  try {
    const readiness = startableShowcaseStatus();
    if (readiness.exitCode !== null) return readiness.exitCode;
    const prepared = ensurePreparedSession(readiness.status);
    console.log(prepared.reused ? "골든 시연 문맥 준비 완료 · 기존 세션 재사용" : "골든 시연 문맥 준비 완료");
    return EXIT_READY;
  } catch (error) {
    console.error(error.message);
    return EXIT_ERROR;
  }
}

export function codexTerminalCommand(
  platformName = process.platform,
  environment = process.env,
) {
  if (platformName === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "start",
        "",
        "cmd.exe",
        "/d",
        "/k",
        "node",
        ".showcase\\demo.mjs",
        "session",
      ],
    };
  }
  if (platformName === "darwin") {
    const escaped = repositoryRoot.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    return {
      command: "osascript",
      args: [
        "-e",
        `tell application "Terminal" to do script "cd \\\"${escaped}\\\" && node .showcase/demo.mjs session"`,
      ],
    };
  }
  return {
    command: "x-terminal-emulator",
    args: ["-e", "bash", "-lc", "node .showcase/demo.mjs session; exec bash"],
  };
}

export function interactiveTerminalEnvironment(environment = process.env) {
  const interactiveEnvironment = { ...environment };
  for (const [name, value] of Object.entries(interactiveEnvironment)) {
    if (name.toUpperCase() === "TERM" && String(value).toLowerCase() === "dumb") {
      delete interactiveEnvironment[name];
    }
  }
  return interactiveEnvironment;
}

export function startCommand({
  platformName = process.platform,
  environment = process.env,
  spawnImpl = spawn,
} = {}) {
  try {
    const specification = codexTerminalCommand(platformName, environment);
    const child = spawnImpl(specification.command, specification.args, {
      cwd: repositoryRoot,
      detached: true,
      env: interactiveTerminalEnvironment(environment),
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    console.log("새 명령 창에서 Codex 시연 세션을 엽니다.");
    return EXIT_READY;
  } catch (error) {
    console.error(`Codex 명령 창 실행 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

export function sessionCommand() {
  try {
    const readiness = startableShowcaseStatus();
    if (readiness.exitCode !== null) return readiness.exitCode;

    const executable = codexExecutableForPlatform();
    const prepared = ensurePreparedSession(readiness.status, executable);
    console.log(
      prepared.reused
        ? "골든 시연 문맥 복제 · 대화형 세션 시작"
        : "골든 시연 문맥 준비 완료 · 첫 복제 세션 시작",
    );

    const result = spawnSync(executable, ["fork", "-C", showcaseDirectory, prepared.threadId], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: interactiveTerminalEnvironment(),
      shell: false,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0) {
      forgetPreparedSession(prepared.fingerprint);
      const detail = result.error?.message ?? `exit ${result.status}`;
      console.error(`Codex 실행 실패 · ${detail}`);
      console.error("저장된 골든 세션 정보를 비웠다. 다시 실행하면 새로 준비한다.");
      return EXIT_ERROR;
    }
    return EXIT_READY;
  } catch (error) {
    console.error(error.message);
    return EXIT_ERROR;
  }
}

function usage() {
  console.log("사용법: npm run showcase:status|reset|baseline|prepare|start");
}

export function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (command === "status") return statusCommand();
  if (command === "reset") return resetCommand();
  if (command === "baseline") return baselineCommand();
  if (command === "prepare") return prepareCommand();
  if (command === "start") return startCommand();
  if (command === "session") return sessionCommand();
  usage();
  return EXIT_ERROR;
}

if (resolve(process.argv[1] ?? "") === scriptPath) process.exitCode = main();
