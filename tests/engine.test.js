import test from "node:test";
import assert from "node:assert/strict";

import { TetrisEngine } from "../src/core/engine.js";
import { EventBus } from "../src/core/events.js";

function createGame(rng = () => 0) {
  const events = new EventBus();
  const game = new TetrisEngine(events, { rng });
  return { game, events };
}

test("기준 게임은 10×22 보드와 플레이 중인 블록으로 시작한다", () => {
  const { game } = createGame();
  game.start();
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.board.length, 22);
  assert.equal(snapshot.board[0].length, 10);
  assert.equal(snapshot.phase, "playing");
  assert.equal(snapshot.activePiece.type, "I");
});

test("블록은 보드의 좌우 경계를 통과하지 않는다", () => {
  const { game } = createGame();
  game.start();
  while (game.move(-1)) {}
  const leftmost = game.getSnapshot().activePiece.x;
  assert.equal(game.move(-1), false);
  assert.equal(game.getSnapshot().activePiece.x, leftmost);
});

test("회전 성공 시 rotation 상태와 이벤트가 갱신된다", () => {
  const { game, events } = createGame();
  let rotations = 0;
  events.on("piece:rotate", () => { rotations += 1; });
  game.start();
  assert.equal(game.rotate(1), true);
  assert.equal(game.getSnapshot().activePiece.rotation, 1);
  assert.equal(rotations, 1);
});

test("완성된 한 줄을 제거하고 lines:clear를 발행한다", () => {
  const { game, events } = createGame();
  let cleared = 0;
  events.on("lines:clear", ({ count }) => { cleared += count; });
  game.start();
  game.board[21] = ["T", "T", "T", null, null, null, null, "T", "T", "T"];
  game.activePiece = { type: "I", x: 3, y: 20, rotation: 0 };
  game.hardDrop();
  assert.equal(cleared, 1);
  assert.ok(game.board[21].every((cell) => cell === null));
});

test("새 블록의 spawn 위치가 막히면 게임오버가 된다", () => {
  const { game } = createGame();
  game.start();
  for (let x = 3; x <= 6; x += 1) game.board[1][x] = "Z";
  game.exchangeActivePiece("I");
  assert.equal(game.getSnapshot().phase, "gameover");
});

test("주입한 RNG는 블록 순서를 재현한다", () => {
  const sequence = [0, 0.999, 0.5];
  let index = 0;
  const { game } = createGame(() => sequence[index++ % sequence.length]);
  game.start();
  assert.deepEqual(game.peekNext(3), ["Z", "O", "I"]);
});
