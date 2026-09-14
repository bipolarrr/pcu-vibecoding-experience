import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEV_SERVER_RELOAD_CLIENT_PATH,
  DEV_SERVER_RELOAD_PATH,
  startDevServer,
} from "./dev-server.js";

async function readWithTimeout(reader) {
  let timer;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("reload event timeout")), 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("served pages reload after a project file changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-reload-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "index.html"), "<!doctype html><body><main></main></body>\n");
  await writeFile(join(root, "src", "main.js"), "export const value = 1;\n");
  const server = await startDevServer({ rootDir: root, port: 0 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();

  try {
    const page = await (await fetch(`${origin}/`)).text();
    assert.match(page, new RegExp(DEV_SERVER_RELOAD_CLIENT_PATH.replace(".", "\\.")));

    const events = await fetch(`${origin}${DEV_SERVER_RELOAD_PATH}`, { signal: abort.signal });
    const reader = events.body.getReader();
    const decoder = new TextDecoder();
    let output = "";
    const deadline = Date.now() + 2_000;

    while (!output.includes("event: ready") && Date.now() < deadline) {
      output += decoder.decode((await reader.read()).value, { stream: true });
    }
    await writeFile(join(root, "src", "main.js"), "export const value = 2;\n");
    while (!output.includes("event: reload") && Date.now() < deadline) {
      const chunk = await readWithTimeout(reader);
      output += decoder.decode(chunk.value, { stream: true });
    }
    assert.match(output, /event: reload/);
  } finally {
    abort.abort();
    server.close();
    server.closeAllConnections();
    await rm(root, { recursive: true, force: true });
  }
});
