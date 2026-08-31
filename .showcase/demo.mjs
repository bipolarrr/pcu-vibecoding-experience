import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_BRANCH = "showcase";
export const EXIT_READY = 0;
export const EXIT_ERROR = 2;
export const EXIT_RESET_NEEDED = 10;

const scriptPath = fileURLToPath(import.meta.url);
export const repositoryRoot = resolve(dirname(scriptPath), "..");
export const showcaseDirectory = resolve(repositoryRoot, ".showcase");

function run(command, args, { cwd = repositoryRoot, stdio = "pipe" } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
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
    if (status.kind === "ready" || status.kind === "active") return EXIT_READY;
    if (status.kind === "reset-needed") return EXIT_RESET_NEEDED;
    return EXIT_ERROR;
  } catch (error) {
    console.error(`시연 환경 확인 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

function runTests() {
  console.log("시연 환경 테스트 실행");
  const result = run(process.execPath, ["--test"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("테스트가 통과하지 않았다.");
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

    runTests();
    const head = gitOutput(["rev-parse", "HEAD"], "현재 커밋 확인");
    const previous = resolveCommit(`refs/heads/${DEMO_BRANCH}`);
    if (currentBranch() === DEMO_BRANCH) {
      console.log(`기준판 유지 · ${DEMO_BRANCH} · ${head.slice(0, 7)}`);
      return EXIT_READY;
    }

    const occupiedWorktree = targetBranchInAnotherWorktree();
    if (occupiedWorktree) {
      throw new Error(`${DEMO_BRANCH} 브랜치가 다른 worktree에서 사용 중이다: ${occupiedWorktree}`);
    }

    requireSuccess(git(["branch", "-f", DEMO_BRANCH, head]), "시연 기준 브랜치 지정");
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
    const archiveBranch = head !== baseline ? createArchiveBranch(head) : null;
    const stashRef = changes ? stashChanges() : null;

    if (currentBranch() === DEMO_BRANCH) {
      requireSuccess(git(["reset", "--hard", baseline], { stdio: "inherit" }), "기준판 복원");
    } else {
      requireSuccess(
        git(["switch", "-C", DEMO_BRANCH, baseline], { stdio: "inherit" }),
        "시연 브랜치 전환",
      );
    }
    requireSuccess(git(["clean", "-f", "-d"], { stdio: "inherit" }), "untracked 파일 정리");

    runTests();
    const finalStatus = inspectShowcase();
    if (finalStatus.kind !== "ready") {
      throw new Error(
        finalStatus.kind === "error" ? finalStatus.message : finalStatus.reasons.join(", "),
      );
    }

    console.log(`시연 환경 복원 완료 · ${baseline.slice(0, 7)}`);
    if (archiveBranch) console.log(`체험 커밋 보관 · ${archiveBranch}`);
    if (stashRef) console.log(`미커밋 변경 보관 · ${stashRef}`);
    return EXIT_READY;
  } catch (error) {
    console.error(`시연 환경 복원 실패 · ${error.message}`);
    return EXIT_ERROR;
  }
}

export function codexExecutableForPlatform(platform = process.platform) {
  return platform === "win32" ? "codex.cmd" : "codex";
}

export function startCommand() {
  let status;
  try {
    status = inspectShowcase();
    printStatus(status);
  } catch (error) {
    console.error(`시연 환경 확인 실패 · ${error.message}`);
    return EXIT_ERROR;
  }

  if (status.kind === "error") return EXIT_ERROR;
  if (status.kind === "reset-needed") {
    console.error("시연 세션을 시작하지 않았다. 운영자가 npm run showcase:reset을 실행해야 한다.");
    return EXIT_RESET_NEEDED;
  }
  console.log("시연 세션 시작");

  const executable = codexExecutableForPlatform();
  const result = spawnSync(executable, ["-C", showcaseDirectory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? `exit ${result.status}`;
    console.error(`Codex 실행 실패 · ${detail}`);
    return EXIT_ERROR;
  }
  return EXIT_READY;
}

function usage() {
  console.log("사용법: npm run showcase:status|reset|baseline|start");
}

export function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (command === "status") return statusCommand();
  if (command === "reset") return resetCommand();
  if (command === "baseline") return baselineCommand();
  if (command === "start") return startCommand();
  usage();
  return EXIT_ERROR;
}

if (resolve(process.argv[1] ?? "") === scriptPath) process.exitCode = main();
