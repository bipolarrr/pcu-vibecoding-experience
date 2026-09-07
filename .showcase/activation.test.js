import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

const files = [
  join(root, "src/main.js"),
  join(root, "src/bootstrap.js"),
  join(root, "src/features/enabled.js"),
  ...javascriptFiles(join(root, "src/features")),
];

for (const file of new Set(files)) {
  test(`current game module syntax: ${file}`, () => {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  });
}
