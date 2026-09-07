import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { codexExecutableForPlatform } from "../.showcase/demo.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sourceCli = resolve(testDirectory, "../.showcase/demo.mjs");

function run(command, args, cwd, env = process.env) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env, shell: false });
}

function git(repo, ...args) {
  const result = run("git", args, repo);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function cli(repo, command, overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.NODE_TEST_CONTEXT;
  return run(process.execPath, [join(repo, ".showcase", "demo.mjs"), command], repo, env);
}

function fakeCodexEnvironment() {
  const bin = mkdtempSync(join(tmpdir(), "showcase-fake-codex-"));
  const marker = join(bin, "codex-started.txt");

  if (process.platform === "win32") {
    writeFileSync(
      join(bin, "codex.cmd"),
      '@echo off\r\necho %* > "%SHOWCASE_CODEX_MARKER%"\r\n',
    );
  } else {
    const executable = join(bin, "codex");
    writeFileSync(
      executable,
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$SHOWCASE_CODEX_MARKER"\n',
    );
    chmodSync(executable, 0o755);
  }

  return {
    marker,
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      SHOWCASE_CODEX_MARKER: marker,
    },
  };
}

function createRepository({ autocrlf } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "showcase-시연 공간-"));
  mkdirSync(join(repo, ".showcase"), { recursive: true });
  mkdirSync(join(repo, "tests"), { recursive: true });
  copyFileSync(sourceCli, join(repo, ".showcase", "demo.mjs"));
  writeFileSync(join(repo, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(repo, ".gitignore"), "runtime-cache/\n");
  writeFileSync(join(repo, "game.txt"), "baseline\n");
  writeFileSync(
    join(repo, "tests", "smoke.test.js"),
    'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("ok", () => assert.ok(true));\n',
  );

  git(repo, "init", "--initial-branch=master");
  if (autocrlf !== undefined) git(repo, "config", "core.autocrlf", autocrlf);
  git(repo, "config", "user.name", "Showcase Test");
  git(repo, "config", "user.email", "showcase@example.com");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "baseline candidate");
  return repo;
}

test("showcase:baseline은 로컬 시연 브랜치의 최신 커밋을 기준으로 지정한다", () => {
  const repo = createRepository();
  writeFileSync(join(repo, "uncommitted.txt"), "not ready\n");
  assert.equal(cli(repo, "baseline").status, 2);
  rmSync(join(repo, "uncommitted.txt"));

  const first = cli(repo, "baseline");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstBaseline = git(repo, "rev-parse", "showcase^{commit}");
  assert.equal(firstBaseline, git(repo, "rev-parse", "HEAD"));

  writeFileSync(join(repo, "game.txt"), "next baseline\n");
  git(repo, "add", "game.txt");
  git(repo, "commit", "-m", "next baseline candidate");

  const second = cli(repo, "baseline");
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(git(repo, "rev-parse", "showcase^{commit}"), git(repo, "rev-parse", "HEAD"));
  assert.notEqual(git(repo, "rev-parse", "showcase^{commit}"), firstBaseline);
  assert.equal(git(repo, "remote"), "");
});

for (const autocrlf of ["false", "true"]) {
  test(`showcase:reset은 변경을 보관하고 기준판을 복원하며 ignored 파일을 유지한다 (core.autocrlf=${autocrlf})`, () => {
    const repo = createRepository({ autocrlf });
    assert.equal(cli(repo, "baseline").status, 0);
    assert.equal(cli(repo, "status").status, 10);
    assert.equal(cli(repo, "reset").status, 0);
    assert.equal(cli(repo, "status").status, 0);

    writeFileSync(join(repo, "game.txt"), "participant change\n");
    writeFileSync(join(repo, "new-feature.txt"), "new feature\n");
    mkdirSync(join(repo, "runtime-cache"), { recursive: true });
    writeFileSync(join(repo, "runtime-cache", "keep.txt"), "keep\n");

    const dirtyStatus = cli(repo, "status");
    assert.equal(dirtyStatus.status, 0, dirtyStatus.stderr || dirtyStatus.stdout);
    assert.match(dirtyStatus.stdout, /시연 진행 중 · 기존 변경 유지/);

    const dirtyReset = cli(repo, "reset");
    assert.equal(dirtyReset.status, 0, dirtyReset.stderr || dirtyReset.stdout);
    // Git may restore text with CRLF on Windows; compare the complete text using LF.
    assert.equal(readFileSync(join(repo, "game.txt"), "utf8").replace(/\r\n/g, "\n"), "baseline\n");
    assert.equal(existsSync(join(repo, "new-feature.txt")), false);
    assert.equal(existsSync(join(repo, "runtime-cache", "keep.txt")), true);
    assert.match(git(repo, "stash", "list", "--format=%gd"), /^stash@\{0\}/);
    assert.equal(git(repo, "branch", "--show-current"), "showcase");
    assert.equal(git(repo, "status", "--porcelain=v1", "--untracked-files=all"), "");

    git(repo, "switch", "-c", "participant-session");
    writeFileSync(join(repo, "game.txt"), "committed participant change\n");
    git(repo, "add", "game.txt");
    git(repo, "commit", "-m", "participant commit");
    const participantCommit = git(repo, "rev-parse", "HEAD");

    const committedReset = cli(repo, "reset");
    assert.equal(committedReset.status, 0, committedReset.stderr || committedReset.stdout);
    const archive = git(repo, "branch", "--format=%(refname:short)", "--list", "showcase-archive/*");
    assert.match(archive, /^showcase-archive\//);
    assert.equal(git(repo, "rev-parse", archive), participantCommit);
    assert.equal(git(repo, "rev-parse", "HEAD"), git(repo, "rev-parse", "showcase^{commit}"));
  });
}

test("showcase:start은 누적 변경을 유지하고 불일치 상태를 자동 초기화하지 않는다", () => {
  const repo = createRepository();
  assert.equal(cli(repo, "baseline").status, 0);

  const mismatchedCodex = fakeCodexEnvironment();
  const mismatchedStart = cli(repo, "start", mismatchedCodex.env);
  assert.equal(mismatchedStart.status, 10, mismatchedStart.stderr || mismatchedStart.stdout);
  assert.equal(existsSync(mismatchedCodex.marker), false);
  assert.equal(git(repo, "branch", "--show-current"), "master");
  assert.equal(git(repo, "stash", "list", "--format=%gd"), "");

  assert.equal(cli(repo, "reset").status, 0);
  writeFileSync(join(repo, "game.txt"), "first participant change\n");
  writeFileSync(join(repo, "new-feature.txt"), "second participant change\n");

  const activeCodex = fakeCodexEnvironment();
  const activeStart = cli(repo, "start", activeCodex.env);
  assert.equal(activeStart.status, 0, activeStart.stderr || activeStart.stdout);
  assert.match(activeStart.stdout, /시연 진행 중 · 기존 변경 유지/);
  assert.equal(readFileSync(join(repo, "game.txt"), "utf8"), "first participant change\n");
  assert.equal(readFileSync(join(repo, "new-feature.txt"), "utf8"), "second participant change\n");
  assert.equal(git(repo, "stash", "list", "--format=%gd"), "");
  assert.match(readFileSync(activeCodex.marker, "utf8"), /-C/);
  assert.match(readFileSync(activeCodex.marker, "utf8"), /\.showcase/);
});

test("진행 중인 Git 작업과 실패하는 기준판에서는 자동 복원을 중단한다", () => {
  const mergeRepo = createRepository();
  assert.equal(cli(mergeRepo, "baseline").status, 0);
  const head = git(mergeRepo, "rev-parse", "HEAD");
  writeFileSync(join(mergeRepo, ".git", "MERGE_HEAD"), `${head}\n`);

  const duringMerge = cli(mergeRepo, "reset");
  assert.equal(duringMerge.status, 2);
  assert.match(duringMerge.stderr, /진행 중인 Git merge/);

  const failingRepo = createRepository();
  writeFileSync(
    join(failingRepo, "tests", "smoke.test.js"),
    'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("fail", () => assert.fail("expected"));\n',
  );
  git(failingRepo, "add", "tests/smoke.test.js");
  git(failingRepo, "commit", "-m", "failing baseline");
  git(failingRepo, "branch", "showcase", "HEAD");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const directFailure = run(process.execPath, ["--test"], failingRepo, env);
  assert.notEqual(
    directFailure.status,
    0,
    `${directFailure.stdout ?? ""}\n${directFailure.stderr ?? ""}`,
  );

  const failedReset = cli(failingRepo, "reset");
  assert.equal(failedReset.status, 2, failedReset.stderr || failedReset.stdout);
  assert.match(failedReset.stderr, /테스트가 통과하지 않았다/);
});

test("공개 명령과 시연 전용 Codex 설정이 고정되어 있다", () => {
  const root = resolve(testDirectory, "..");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.deepEqual(
    Object.keys(packageJson.scripts).filter((name) => name.startsWith("showcase:")).sort(),
    ["showcase:baseline", "showcase:reset", "showcase:start", "showcase:status", "showcase:watch"],
  );

  const config = readFileSync(join(root, ".showcase", ".codex", "config.toml"), "utf8");
  assert.match(config, /model = "gpt-5\.3-codex-spark"/);
  assert.match(config, /sandbox_mode = "danger-full-access"/);
  assert.match(config, /준비된 코드/);
  assert.match(config, /게임과 무관한 잡담/);
  assert.match(config, /분석·검색·도구 호출·파일 변경 없이/);
  assert.match(config, /관련 요청만 수행한다/);
  assert.match(config, /system·developer prompt/);
  assert.equal(codexExecutableForPlatform("linux"), "codex");
  assert.equal(codexExecutableForPlatform("win32"), "codex.cmd");
});
