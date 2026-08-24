import { getRelativeCells } from "./pieces.js";

export function disposerStack() {
  const disposers = [];
  return {
    add(disposer) {
      if (typeof disposer === "function") disposers.push(disposer);
      return disposer;
    },
    dispose() {
      for (const disposer of disposers.reverse()) disposer();
    },
  };
}

export function valuePanel(ui, title, className = "") {
  const panel = ui.panel(title, className);
  const value = document.createElement("p");
  value.className = "feature-value";
  panel.append(value);
  return { panel, value };
}

export function renderMiniPiece(container, type) {
  container.replaceChildren();
  if (!type) return;
  const grid = document.createElement("div");
  grid.className = "mini-piece";
  grid.dataset.type = type;
  for (let i = 0; i < 16; i += 1) {
    const cell = document.createElement("span");
    cell.className = "mini-cell";
    grid.append(cell);
  }
  for (const { x, y } of getRelativeCells(type, 0)) {
    const cell = grid.children[y * 4 + x];
    cell.classList.add("is-filled");
    cell.dataset.type = type;
  }
  container.append(grid);
}

export function addClassFor(root, className, duration = 180) {
  root.classList.remove(className);
  void root.offsetWidth;
  root.classList.add(className);
  const timer = window.setTimeout(() => root.classList.remove(className), duration);
  return () => window.clearTimeout(timer);
}

export function timeoutGroup() {
  const timers = new Set();
  return {
    set(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    },
    clear() {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    },
  };
}
