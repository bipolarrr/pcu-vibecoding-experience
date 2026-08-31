import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packsRoot = new URL("../.showcase/packs/", import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

async function loadCatalog() {
  const entries = await readdir(packsRoot);
  const manifests = new Map();
  for (const entry of entries) {
    const directory = new URL(`${entry}/`, packsRoot);
    if (!(await stat(directory)).isDirectory()) continue;
    const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
    manifests.set(entry, manifest);
    assert.equal(manifest.id, entry);
    assert.ok(Array.isArray(manifest.requires));
    assert.ok(Array.isArray(manifest.conflicts));
    assert.ok(Array.isArray(manifest.replaces));
    assert.ok(Array.isArray(manifest.uiSlots));
    await stat(new URL("index.js", directory));
  }
  return manifests;
}

test("모든 기능 팩은 유효한 manifest와 entry module을 보유한다", async () => {
  const manifests = await loadCatalog();
  assert.equal(manifests.size, 50);
  for (const manifest of manifests.values()) {
    for (const requirement of manifest.requires) assert.ok(manifests.has(requirement), `${manifest.id}: ${requirement}`);
  }
});

test("같은 디자인 축의 충돌 관계는 상호 대칭이다", async () => {
  const manifests = await loadCatalog();
  for (const manifest of manifests.values()) {
    for (const conflict of manifest.conflicts) {
      assert.ok(manifests.get(conflict)?.conflicts.includes(manifest.id), `${manifest.id} ↔ ${conflict}`);
    }
  }
});

test("기능 팩은 다른 기능 팩을 직접 import하지 않는다", async () => {
  const entries = await readdir(packsRoot);
  for (const entry of entries) {
    const source = await readFile(new URL(`${entry}/index.js`, packsRoot), "utf8");
    assert.doesNotMatch(source, /(?:\.\.\/)+features\//, entry);
    assert.doesNotMatch(source, /(?:\.\.\/)+\.showcase\/packs\//, entry);
  }
});

test("커밋된 기준 상태에는 활성 기능이 없다", () => {
  const result = spawnSync("git", ["show", "HEAD:src/features/enabled.js"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /enabledFeatures\s*=\s*\[\]/);
});
