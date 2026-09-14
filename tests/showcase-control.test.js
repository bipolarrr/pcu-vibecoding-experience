import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";

import {
  browserCommand,
  classifyCommandFailure,
  createActionExecutor,
  npmCommand,
  startControlServer,
} from "../scripts/showcase-control-server.js";

async function fixture(t, execute = async (action) => ({ code: `${action}-complete` })) {
  const services = {
    async status() { return { game: false, watch: false }; },
    async stopWatch() {},
  };
  const app = await startControlServer({ port: 0, services, execute, token: "test-token" });
  t.after(() => new Promise((accept) => app.server.close(accept)));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, origin };
}

test("운영 서버는 화면과 세션 토큰, 상태를 같은 출처에서 제공한다", async (t) => {
  const { origin } = await fixture(t);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await page.text(), /data-action="fresh-start"/);
  assert.doesNotMatch(await (await fetch(origin)).text(), /data-action="fresh-start" data-confirm/);

  const session = await (await fetch(`${origin}/api/session`)).json();
  assert.equal(session.token, "test-token");
  const status = await (await fetch(`${origin}/api/status`)).json();
  assert.equal(status.ok, true);
  assert.deepEqual(status.services, { game: false, watch: false });
});

test("운영 페이지는 브라우저 언어와 관계없이 한국어로 고정한다", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../scripts/showcase-control.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /locale: "ko"/);
});

test("실행 API는 동일 출처와 세션 토큰을 모두 요구한다", async (t) => {
  let calls = 0;
  const { origin } = await fixture(t, async () => {
    calls += 1;
    return { code: "done" };
  });
  for (const headers of [
    {},
    { Origin: origin },
    { "X-Showcase-Token": "test-token" },
    { Origin: origin, "X-Showcase-Token": "wrong" },
  ]) {
    const response = await fetch(`${origin}/api/actions/test`, { method: "POST", headers });
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);

  const response = await fetch(`${origin}/api/actions/test`, {
    method: "POST",
    headers: { Origin: origin, "X-Showcase-Token": "test-token" },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);

  const reboundStatus = await new Promise((accept, reject) => {
    const url = new URL(origin);
    const req = request({
      hostname: url.hostname,
      port: url.port,
      path: "/api/session",
      headers: { Host: "example.test:5174" },
    }, (res) => {
      res.resume();
      res.once("end", () => accept(res.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
  assert.equal(reboundStatus, 403);
});

test("작업 실행 중에는 충돌하는 두 번째 요청을 거절한다", async (t) => {
  let release;
  const pending = new Promise((accept) => { release = accept; });
  const { origin } = await fixture(t, async () => {
    await pending;
    return { code: "done" };
  });
  const headers = { Origin: origin, "X-Showcase-Token": "test-token" };
  const first = fetch(`${origin}/api/actions/test`, { method: "POST", headers });
  await new Promise((accept) => setTimeout(accept, 30));
  const second = await fetch(`${origin}/api/actions/showcase-status`, { method: "POST", headers });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "job-running");
  release();
  assert.equal((await first).status, 200);
});

test("운영체제별 브라우저 명령을 명시적으로 구성한다", () => {
  assert.equal(browserCommand("http://127.0.0.1:5174", "win32").command, "cmd.exe");
  assert.equal(browserCommand("http://127.0.0.1:5174", "linux").command, "xdg-open");
});

test("Windows에서는 npm.cmd를 직접 spawn하지 않고 npm CLI를 Node로 실행한다", () => {
  const command = npmCommand("showcase:reset", {
    platform: "win32",
    execPath: "C:\\Program Files\\nodejs\\node.exe",
    environment: { npm_execpath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" },
  });
  assert.equal(command.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(command.args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "run",
    "showcase:reset",
  ]);

  const fallback = npmCommand("test", {
    platform: "win32",
    environment: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  });
  assert.equal(fallback.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(fallback.args, ["/d", "/s", "/c", "npm.cmd run test"]);
});

test("명령 실패를 운영자가 이해할 수 있는 안정적인 오류 코드로 분류한다", () => {
  assert.equal(classifyCommandFailure({ code: "ENOENT" }), "tool-missing");
  assert.equal(classifyCommandFailure({ stderr: "EADDRINUSE" }), "port-in-use");
  assert.equal(classifyCommandFailure({ stderr: "작업 트리가 깨끗하지 않다" }), "working-tree-dirty");
  assert.equal(classifyCommandFailure({ stderr: "테스트가 통과하지 않았다." }), "tests-failed");
  assert.equal(classifyCommandFailure({ exitCode: 10 }), "reset-required");
  assert.equal(classifyCommandFailure({ stderr: "unexpected" }), "command-failed");
});

test("실행기는 allowlist 밖의 action을 명령으로 해석하지 않는다", async () => {
  const execute = createActionExecutor({
    services: {
      startGame: async () => ({}),
      stopGame: async () => ({}),
      restartGame: async () => ({}),
      startWatch: async () => ({}),
      stopWatch: async () => ({}),
    },
  });
  await assert.rejects(execute("npm run anything"), { code: "unknown-action" });
});
