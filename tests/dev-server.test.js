import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startDevServer } from "../scripts/dev-server.js";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "showcase-server 공간-"));
  let server;
  t.after(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const directory of ["src", "assets", ".showcase/packs/hold", ".showcase/.codex", ".git"]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const [path, body] of [
    ["index.html", "<!doctype html><p>game</p>"],
    ["src/main.js", "export const version = 1;"],
    ["src/base.css", "body { color: black; }"],
    ["assets/font.woff2", "font bytes"],
    [".showcase/packs/hold/index.js", "export default {};"],
    [".showcase/.codex/config.toml", "private config"],
    [".git/config", "private git config"],
  ]) await writeFile(join(root, path), body);
  server = await startDevServer({ rootDir: root, port: 0 });
  return { root, server, url: `http://127.0.0.1:${server.address().port}` };
}

test("개발 서버는 같은 주소에서 HTML, module, CSS, font를 올바른 형식으로 제공한다", async (t) => {
  const { url } = await fixture(t);
  for (const [path, type, body] of [
    ["/?lang=ko", "text/html; charset=utf-8", "<!doctype html><p>game</p>"],
    ["/src/main.js", "text/javascript; charset=utf-8", "export const version = 1;"],
    ["/src/base.css", "text/css; charset=utf-8", "body { color: black; }"],
    ["/assets/font.woff2", "font/woff2", "font bytes"],
    ["/.showcase/packs/hold/index.js", "text/javascript; charset=utf-8", "export default {};"],
  ]) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), type);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), body);
  }
  const head = await fetch(url + "/src/main.js", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get("content-length")) > 0);
  assert.equal(await head.text(), "");
});

test("파일 수정·삭제·복원 후에도 서버를 재시작하지 않고 최신 내용을 제공한다", async (t) => {
  const { root, url } = await fixture(t);
  const path = join(root, "src/main.js");
  await writeFile(path, "export const version = 2;");
  assert.equal(await (await fetch(url + "/src/main.js")).text(), "export const version = 2;");
  await rm(path);
  assert.equal((await fetch(url + "/src/main.js")).status, 404);
  await writeFile(path, "export const version = 1;");
  assert.equal(await (await fetch(url + "/src/main.js")).text(), "export const version = 1;");
  assert.equal((await fetch(url + "/")).status, 200);
});

test("잘못된 요청과 내부 설정 요청은 거절하고 다음 요청은 처리한다", async (t) => {
  const { url } = await fixture(t);
  for (const [path, status] of [
    ["/.git/config", 403],
    ["/.showcase/.codex/config.toml", 403],
    ["/%2e%2e%2foutside", 403],
    ["/%FF", 400],
    ["/%00", 400],
    ["/%5coutside", 400],
    ["/missing.js", 404],
  ]) assert.equal((await fetch(url + path)).status, status, path);
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  assert.equal((await fetch(url)).status, 200);
});

test("사용 중인 포트로 서버를 시작하면 명확한 오류를 반환한다", async (t) => {
  const { root, server } = await fixture(t);
  await assert.rejects(startDevServer({ rootDir: root, port: server.address().port }), { code: "EADDRINUSE" });
});
