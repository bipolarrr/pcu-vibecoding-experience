import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createObserver,
  diffSnapshots,
  snapshotTree,
} from "../scripts/showcase-watch.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "showcase-watch-"));
  const source = join(root, "src");
  await mkdir(source);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, source };
}

test("초기 snapshot은 변경으로 출력하지 않는다", async (t) => {
  const { root, source } = await fixture(t);
  await writeFile(join(source, "initial.js"), "export const initial = true;\n");
  const batches = [];
  const observer = createObserver({ rootDir: source, baseDir: root, pollMs: 10, debounceMs: 30, onChanges: (changes) => batches.push(changes) });
  await observer.start();
  await wait(80);
  await observer.stop();
  assert.deepEqual(batches, []);
});

test("파일 생성, 수정, 삭제를 실제 before/after로 계산한다", () => {
  const before = new Map([
    ["src/updated.js", "const value = 1;\n"],
    ["src/deleted.js", "old line\n"],
  ]);
  const after = new Map([
    ["src/updated.js", "const value = 2;\n"],
    ["src/created.js", "new line\n"],
  ]);
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.map(({ path, status }) => ({ path, status })), [
    { path: "src/created.js", status: "CREATED" },
    { path: "src/deleted.js", status: "DELETED" },
    { path: "src/updated.js", status: "UPDATED" },
  ]);
  assert.deepEqual(changes[0].lines, ["+ new line"]);
  assert.deepEqual(changes[1].lines, ["- old line"]);
  assert.deepEqual(changes[2].lines, ["- const value = 1;", "+ const value = 2;"]);
  assert.equal(changes[2].before, "const value = 1;\n");
  assert.equal(changes[2].after, "const value = 2;\n");
});

test("연속 write를 하나의 최종 diff로 debounce한다", async (t) => {
  const { root, source } = await fixture(t);
  const target = join(source, "rapid.js");
  await writeFile(target, "const step = 0;\n");
  const batches = [];
  const observer = createObserver({ rootDir: source, baseDir: root, pollMs: 10, debounceMs: 70, onChanges: (changes) => batches.push(changes) });
  await observer.start();
  await writeFile(target, "const step = 1;\n");
  await wait(25);
  await writeFile(target, "const step = 2;\n");
  await wait(25);
  await writeFile(target, "const step = 3;\n");
  await wait(130);
  await observer.stop();
  assert.equal(batches.length, 1);
  assert.equal(batches[0][0].before, "const step = 0;\n");
  assert.equal(batches[0][0].after, "const step = 3;\n");
});

test("제외 디렉터리와 임시파일을 snapshot에서 무시한다", async (t) => {
  const { root, source } = await fixture(t);
  await mkdir(join(source, "node_modules"));
  await mkdir(join(source, ".git"));
  await writeFile(join(source, "kept.js"), "kept\n");
  await writeFile(join(source, "scratch.js~"), "ignored\n");
  await writeFile(join(source, "draft.swp"), "ignored\n");
  await writeFile(join(source, "node_modules", "dependency.js"), "ignored\n");
  await writeFile(join(source, ".git", "state"), "ignored\n");
  const snapshot = await snapshotTree(source, { baseDir: root });
  assert.deepEqual([...snapshot.keys()], ["src/kept.js"]);
});

test("observer는 감시하는 source 파일을 수정하지 않는다", async (t) => {
  const { root, source } = await fixture(t);
  const target = join(source, "untouched.js");
  const original = "export const untouched = true;\n";
  await writeFile(target, original);
  const observer = createObserver({ rootDir: source, baseDir: root, pollMs: 10, debounceMs: 20, onChanges: () => {} });
  await observer.start();
  await wait(60);
  await observer.stop();
  assert.equal(await readFile(target, "utf8"), original);
});
