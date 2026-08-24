import test from "node:test";
import assert from "node:assert/strict";

import { CapabilityRegistry } from "../src/core/capabilities.js";
import { FeatureHost } from "../src/core/feature-host.js";

test("FeatureHost는 설치 역순으로 기능을 정리한다", () => {
  const calls = [];
  const host = new FeatureHost({});
  host.install([
    { id: "first", install: () => { calls.push("install:first"); return () => calls.push("dispose:first"); } },
    { id: "second", install: () => { calls.push("install:second"); return () => calls.push("dispose:second"); } },
  ]);
  host.destroy();
  assert.deepEqual(calls, ["install:first", "install:second", "dispose:second", "dispose:first"]);
});

test("capability는 중복 제공을 거부하고 disposer로 제거된다", () => {
  const capabilities = new CapabilityRegistry();
  const remove = capabilities.provide("score", { value: 10 });
  assert.equal(capabilities.get("score").value, 10);
  assert.throws(() => capabilities.provide("score", {}));
  remove();
  assert.equal(capabilities.has("score"), false);
});
