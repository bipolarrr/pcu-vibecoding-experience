import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { codexTerminalCommand } from "../.showcase/demo.mjs";
import {
  projectRoot,
  replaceExistingControl,
  startControlServer,
} from "./showcase-control-server.js";

function fakeServices() {
  return {
    stopped: 0,
    async status() { return { game: false, watch: false }; },
    async stopAll() { this.stopped += 1; },
  };
}

test("the Windows Codex terminal is a directly tracked command process", () => {
  const command = codexTerminalCommand("win32", { ComSpec: "cmd.exe" });
  assert.deepEqual(command, {
    command: "cmd.exe",
    args: ["/d", "/s", "/k", "node", ".showcase\\demo.mjs", "session"],
  });
});

test("a same-project control server is shut down and its port can be reused", async () => {
  const services = fakeServices();
  const first = await startControlServer({
    port: 0,
    services,
    execute: async () => ({ code: "unused" }),
  });
  const port = first.server.address().port;

  assert.equal(await replaceExistingControl({ root: projectRoot, port }), true);
  assert.equal(services.stopped, 1);

  const second = await startControlServer({
    port,
    services: fakeServices(),
    execute: async () => ({ code: "unused" }),
  });
  await second.shutdown();
});

test("shutdown waits for the active action before stopping services", async () => {
  const services = fakeServices();
  let finishAction;
  const actionFinished = new Promise((accept) => { finishAction = accept; });
  const app = await startControlServer({
    port: 0,
    services,
    execute: async () => {
      await actionFinished;
      return { code: "finished" };
    },
  });
  const port = app.server.address().port;
  const running = app.runAction("test-action");
  const replacing = replaceExistingControl({ root: projectRoot, port });

  await new Promise((accept) => setTimeout(accept, 50));
  assert.equal(services.stopped, 0);
  finishAction();

  assert.equal(await replacing, true);
  assert.equal((await running).code, "finished");
  assert.equal(services.stopped, 1);
});

test("a foreign service on the control port is never shut down", async () => {
  let shutdownRequested = false;
  const foreign = createServer((request, response) => {
    if (request.url === "/api/session") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ token: "foreign", root: "/another/project" }));
      return;
    }
    shutdownRequested = true;
    response.writeHead(500).end();
  });
  await new Promise((accept) => foreign.listen(0, "127.0.0.1", accept));
  const port = foreign.address().port;

  await assert.rejects(
    replaceExistingControl({ root: projectRoot, port }),
    (error) => error.code === "EADDRINUSE",
  );
  assert.equal(shutdownRequested, false);
  await new Promise((accept) => foreign.close(accept));
});
