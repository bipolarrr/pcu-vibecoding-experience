import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  browserCommand,
  contentType,
  createShowcaseServer,
  injectLiveReload,
  resolveRequestPath,
  serverStatePath,
} from "../scripts/showcase-server.js";

test("정적 서버는 운영체제와 무관한 MIME 및 안전한 경로를 사용한다", () => {
  assert.equal(contentType("main.js"), "text/javascript; charset=utf-8");
  assert.equal(contentType("style.css"), "text/css; charset=utf-8");
  assert.equal(resolveRequestPath("/showcase", "/..%2Fsecret.txt"), null);
  assert.match(injectLiveReload("<body></body>"), /EventSource/);
  assert.equal(serverStatePath("/showcase"), serverStatePath("/showcase"));
  assert.notEqual(serverStatePath("/showcase"), serverStatePath("/another-showcase"));
});

test("기본 브라우저 실행 명령은 플랫폼별로 구성된다", () => {
  assert.deepEqual(browserCommand("http://127.0.0.1:4173", "win32"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "start", "", "http://127.0.0.1:4173"],
  });
  assert.deepEqual(browserCommand("http://127.0.0.1:4173", "darwin"), {
    command: "open",
    args: ["http://127.0.0.1:4173"],
  });
  assert.equal(browserCommand("http://127.0.0.1:4173", "linux").command, "xdg-open");
});

test("서버는 HTML에 자동 새로고침을 넣고 정적 module을 제공한다", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "showcase-server-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "index.html"), "<!doctype html><body>game</body>\n");
  await writeFile(join(root, "src", "main.js"), "export const ready = true;\n");
  t.after(() => rm(root, { recursive: true, force: true }));

  const app = createShowcaseServer({ root });
  await new Promise((resolveListen) => app.server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose) => app.server.close(resolveClose)));
  const { port } = app.server.address();

  const health = await fetch(`http://127.0.0.1:${port}/__showcase_health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { pid: process.pid, root });

  const html = await fetch(`http://127.0.0.1:${port}/index.html`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-type"), /^text\/html/);
  assert.match(await html.text(), /EventSource/);

  const module = await fetch(`http://127.0.0.1:${port}/src/main.js`);
  assert.equal(module.status, 200);
  assert.equal(module.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.match(await module.text(), /ready = true/);
});
