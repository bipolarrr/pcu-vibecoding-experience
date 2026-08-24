import test from "node:test";
import assert from "node:assert/strict";

import { dropPoints, lineClearPoints } from "../.showcase/packs/score/rules.js";
import { gravityForLevel, levelForLines } from "../.showcase/packs/level/rules.js";

test("표준 라인 점수를 레벨 배수로 계산한다", () => {
  assert.equal(lineClearPoints(1, 1), 100);
  assert.equal(lineClearPoints(2, 3), 900);
  assert.equal(lineClearPoints(4, 2), 1600);
});

test("soft drop과 hard drop 점수를 구분한다", () => {
  assert.equal(dropPoints("soft-drop", 1), 1);
  assert.equal(dropPoints("hard-drop", 8), 16);
  assert.equal(dropPoints("move", 4), 0);
});

test("10라인마다 레벨이 증가하고 중력은 80ms 이하로 내려가지 않는다", () => {
  assert.equal(levelForLines(0), 1);
  assert.equal(levelForLines(19), 2);
  assert.equal(levelForLines(20), 3);
  assert.equal(gravityForLevel(1), 800);
  assert.ok(gravityForLevel(5) < gravityForLevel(4));
  assert.equal(gravityForLevel(100), 80);
});
