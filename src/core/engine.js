import { createPiece, getPieceCells, PIECE_TYPES } from "./pieces.js";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 22;

function emptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
}

function clonePiece(piece) {
  return piece ? { ...piece } : null;
}

export class TetrisEngine {
  constructor(events, options = {}) {
    this.events = events;
    this.rng = options.rng ?? Math.random;
    this.board = emptyBoard();
    this.activePiece = null;
    this.queue = [];
    this.phase = "idle";
    this.gravityAccumulator = 0;
    this.gravityInterval = 800;
    this.groundedElapsed = 0;
    this.lockDelay = 0;
    this.lockResetLimit = 0;
    this.lockResetCount = 0;
    this.lastAction = null;
    this.pieceSource = () => PIECE_TYPES[Math.floor(this.rng() * PIECE_TYPES.length)];
    this.rotationResolver = ({ candidate }) => candidate;
  }

  start() {
    if (this.phase !== "idle") return;
    this.phase = "playing";
    this.#spawnNext();
    this.events.emit("game:start", { snapshot: this.getSnapshot() });
    this.#changed();
  }

  restart() {
    this.board = emptyBoard();
    this.activePiece = null;
    this.queue = [];
    this.phase = "playing";
    this.gravityAccumulator = 0;
    this.groundedElapsed = 0;
    this.lockResetCount = 0;
    this.lastAction = null;
    this.#spawnNext();
    this.events.emit("game:restart", { snapshot: this.getSnapshot() });
    this.#changed();
  }

  tick(deltaMs) {
    if (this.phase !== "playing" || !this.activePiece) return;
    const delta = Math.min(100, Math.max(0, deltaMs));
    this.gravityAccumulator += delta;

    if (this.#isGrounded()) {
      if (this.lockDelay === 0) {
        this.#lockPiece();
        return;
      }
      this.groundedElapsed += delta;
      if (this.groundedElapsed >= this.lockDelay) {
        this.#lockPiece();
        return;
      }
    } else {
      this.groundedElapsed = 0;
    }

    if (this.gravityAccumulator >= this.gravityInterval) {
      this.gravityAccumulator %= this.gravityInterval;
      this.move(0, 1, "gravity");
    }
  }

  move(dx, dy = 0, reason = "move") {
    if (this.phase !== "playing" || !this.activePiece) return false;
    const candidate = { ...this.activePiece, x: this.activePiece.x + dx, y: this.activePiece.y + dy };
    if (this.collides(candidate)) {
      if (dy > 0 && this.lockDelay === 0) this.#lockPiece();
      return false;
    }
    const wasGrounded = this.#isGrounded();
    this.activePiece = candidate;
    this.lastAction = reason;
    if (wasGrounded && this.lockResetCount < this.lockResetLimit) {
      this.groundedElapsed = 0;
      this.lockResetCount += 1;
    }
    this.events.emit("piece:move", { dx, dy, reason, piece: clonePiece(candidate) });
    this.#changed();
    return true;
  }

  softDrop() {
    return this.move(0, 1, "soft-drop");
  }

  hardDrop() {
    if (this.phase !== "playing" || !this.activePiece) return 0;
    let distance = 0;
    let candidate = { ...this.activePiece };
    while (!this.collides({ ...candidate, y: candidate.y + 1 })) {
      candidate.y += 1;
      distance += 1;
    }
    this.activePiece = candidate;
    this.lastAction = "hard-drop";
    this.events.emit("piece:move", { dx: 0, dy: distance, distance, reason: "hard-drop", piece: clonePiece(candidate) });
    this.#changed();
    this.#lockPiece();
    return distance;
  }

  rotate(direction = 1) {
    if (this.phase !== "playing" || !this.activePiece) return false;
    const from = this.activePiece.rotation;
    const to = (from + direction + 4) % 4;
    const candidate = { ...this.activePiece, rotation: to };
    const resolved = this.rotationResolver({
      piece: clonePiece(this.activePiece),
      candidate,
      from,
      to,
      collides: (piece) => this.collides(piece),
    });
    if (!resolved || this.collides(resolved)) return false;
    const wasGrounded = this.#isGrounded();
    this.activePiece = { ...resolved };
    this.lastAction = "rotate";
    if (wasGrounded && this.lockResetCount < this.lockResetLimit) {
      this.groundedElapsed = 0;
      this.lockResetCount += 1;
    }
    this.events.emit("piece:rotate", { from, to, direction, piece: clonePiece(this.activePiece) });
    this.#changed();
    return true;
  }

  pause() {
    if (this.phase !== "playing") return false;
    this.phase = "paused";
    this.events.emit("game:pause", { snapshot: this.getSnapshot() });
    this.#changed();
    return true;
  }

  resume() {
    if (this.phase !== "paused") return false;
    this.phase = "playing";
    this.events.emit("game:resume", { snapshot: this.getSnapshot() });
    this.#changed();
    return true;
  }

  exchangeActivePiece(type = null) {
    if (this.phase !== "playing" || !this.activePiece) return null;
    const previous = this.activePiece.type;
    const nextType = type ?? this.#takeNextType();
    this.activePiece = createPiece(nextType);
    this.lastAction = "hold";
    this.groundedElapsed = 0;
    this.lockResetCount = 0;
    if (this.collides(this.activePiece)) this.#gameOver();
    else this.events.emit("piece:spawn", { piece: clonePiece(this.activePiece), reason: "hold" });
    this.#changed();
    return previous;
  }

  peekNext(count = 5) {
    this.#fillQueue(count);
    return this.queue.slice(0, count);
  }

  getGhostY() {
    if (!this.activePiece) return null;
    let y = this.activePiece.y;
    while (!this.collides({ ...this.activePiece, y: y + 1 })) y += 1;
    return y;
  }

  collides(piece) {
    return getPieceCells(piece).some(({ x, y }) => (
      x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT || (y >= 0 && this.board[y][x] !== null)
    ));
  }

  setPieceSource(source) {
    const previous = this.pieceSource;
    this.pieceSource = source;
    this.queue = [];
    return () => {
      this.pieceSource = previous;
      this.queue = [];
    };
  }

  setRotationResolver(resolver) {
    const previous = this.rotationResolver;
    this.rotationResolver = resolver;
    return () => { this.rotationResolver = previous; };
  }

  setLockPolicy({ delayMs = 0, resetLimit = 0 }) {
    const previous = { delayMs: this.lockDelay, resetLimit: this.lockResetLimit };
    this.lockDelay = delayMs;
    this.lockResetLimit = resetLimit;
    return () => {
      this.lockDelay = previous.delayMs;
      this.lockResetLimit = previous.resetLimit;
    };
  }

  setGravityInterval(interval) {
    const previous = this.gravityInterval;
    this.gravityInterval = interval;
    this.gravityAccumulator = 0;
    return () => {
      this.gravityInterval = previous;
      this.gravityAccumulator = 0;
    };
  }

  getSnapshot() {
    return Object.freeze({
      board: this.board.map((row) => Object.freeze([...row])),
      activePiece: clonePiece(this.activePiece),
      next: Object.freeze(this.peekNext(5)),
      phase: this.phase,
      gravityInterval: this.gravityInterval,
      lastAction: this.lastAction,
    });
  }

  #fillQueue(count = 7) {
    while (this.queue.length < count) this.queue.push(this.pieceSource());
  }

  #takeNextType() {
    this.#fillQueue(7);
    return this.queue.shift();
  }

  #spawnNext() {
    this.activePiece = createPiece(this.#takeNextType());
    this.groundedElapsed = 0;
    this.lockResetCount = 0;
    this.lastAction = "spawn";
    if (this.collides(this.activePiece)) {
      this.#gameOver();
      return;
    }
    this.events.emit("piece:spawn", { piece: clonePiece(this.activePiece), reason: "queue" });
  }

  #isGrounded() {
    return Boolean(this.activePiece && this.collides({ ...this.activePiece, y: this.activePiece.y + 1 }));
  }

  #lockPiece() {
    if (!this.activePiece || this.phase !== "playing") return;
    const lockedPiece = clonePiece(this.activePiece);
    for (const { x, y } of getPieceCells(lockedPiece)) {
      if (y >= 0) this.board[y][x] = lockedPiece.type;
    }
    this.events.emit("piece:lock", {
      piece: lockedPiece,
      lastAction: this.lastAction,
      board: this.board.map((row) => [...row]),
    });

    const clearedRows = [];
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (this.board[y].every(Boolean)) clearedRows.push(y);
    }
    if (clearedRows.length > 0) {
      this.board = this.board.filter((_, index) => !clearedRows.includes(index));
      while (this.board.length < BOARD_HEIGHT) this.board.unshift(Array(BOARD_WIDTH).fill(null));
      this.events.emit("lines:clear", {
        count: clearedRows.length,
        rows: clearedRows,
        pieceType: lockedPiece.type,
        lastAction: this.lastAction,
      });
    }
    this.#spawnNext();
    this.#changed();
  }

  #gameOver() {
    this.phase = "gameover";
    this.activePiece = null;
    this.events.emit("game:over", { snapshot: this.getSnapshot() });
  }

  #changed() {
    this.events.emit("state:change", { snapshot: this.getSnapshot() });
  }
}
