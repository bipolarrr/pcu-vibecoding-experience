import { spawnSync } from "node:child_process";

const MINIMUM_NODE_MAJOR = 18;
const CONNECTIVITY_URL = "https://api.openai.com/v1/models";
const TIMEOUT_MS = 8_000;

function pass(label, detail) {
  console.log(`통과 · ${label} · ${detail}`);
}

function fail(label, detail) {
  console.error(`실패 · ${label} · ${detail}`);
  process.exitCode = 1;
}

function commandOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isInteger(major) && major >= MINIMUM_NODE_MAJOR) {
    pass("Node.js", process.version);
    return;
  }
  fail("Node.js", `v${MINIMUM_NODE_MAJOR} 이상이 필요합니다. 현재 ${process.version}`);
}

function checkCodex() {
  const executable = process.platform === "win32" ? "codex.exe" : "codex";
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", shell: false });
  if (version.error || version.status !== 0) {
    fail("Codex", "PATH에서 Codex CLI를 실행할 수 없습니다.");
    return;
  }
  pass("Codex", commandOutput(version).split(/\r?\n/)[0]);

  const login = spawnSync(executable, ["login", "status"], { encoding: "utf8", shell: false });
  if (login.error || login.status !== 0) {
    fail("Codex 로그인", commandOutput(login) || "로그인 상태를 확인할 수 없습니다.");
    return;
  }
  pass("Codex 로그인", commandOutput(login).split(/\r?\n/)[0]);
}

async function checkConnectivity() {
  try {
    const response = await fetch(CONNECTIVITY_URL, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 500) {
      fail("인터넷 연결", `OpenAI 서비스가 HTTP ${response.status}로 응답했습니다.`);
      return;
    }
    pass("인터넷 연결", "OpenAI 서비스에 연결할 수 있습니다.");
  } catch (error) {
    fail("인터넷 연결", `OpenAI 서비스에 연결할 수 없습니다: ${error.message}`);
  }
}

console.log("시연 필수 환경 점검");
checkNode();
checkCodex();
await checkConnectivity();

if (process.exitCode) {
  console.error("시연 환경 점검 실패");
} else {
  console.log("시연 환경 준비 완료");
}
