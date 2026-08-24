import { getPieceCells } from "./pieces.js";

const HIDDEN_ROWS = 2;

export class BoardRenderer {
  #layers = new Map();
  #decorators = new Map();

  constructor(root) {
    this.root = root;
    this.cells = new Map();
    for (let y = HIDDEN_ROWS; y < 22; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute("role", "gridcell");
        root.append(cell);
        this.cells.set(`${x},${y}`, cell);
      }
    }
  }

  registerLayer(id, priority, renderLayer) {
    this.#layers.set(id, { priority, renderLayer });
    return () => this.#layers.delete(id);
  }

  registerDecorator(id, decorate) {
    this.#decorators.set(id, decorate);
    return () => this.#decorators.delete(id);
  }

  getCell(x, y) {
    return this.cells.get(`${x},${y}`);
  }

  render(snapshot) {
    for (const cell of this.cells.values()) {
      cell.className = "cell";
      delete cell.dataset.type;
    }

    for (let y = HIDDEN_ROWS; y < snapshot.board.length; y += 1) {
      for (let x = 0; x < snapshot.board[y].length; x += 1) {
        const type = snapshot.board[y][x];
        if (type) this.#paint(x, y, "is-filled", type);
      }
    }

    const layers = [...this.#layers.values()].sort((a, b) => a.priority - b.priority);
    for (const { renderLayer } of layers) {
      for (const item of renderLayer(snapshot) ?? []) {
        this.#paint(item.x, item.y, item.className, item.type);
      }
    }

    if (snapshot.activePiece) {
      for (const { x, y } of getPieceCells(snapshot.activePiece)) {
        this.#paint(x, y, "is-active", snapshot.activePiece.type);
      }
    }

    for (const decorate of this.#decorators.values()) decorate(this.root, snapshot);
  }

  #paint(x, y, className, type) {
    const cell = this.getCell(x, y);
    if (!cell) return;
    for (const name of String(className ?? "").split(" ").filter(Boolean)) cell.classList.add(name);
    if (type) cell.dataset.type = type;
  }
}
