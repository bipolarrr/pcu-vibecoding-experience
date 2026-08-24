import { disposerStack } from "/src/core/feature-utils.js";

const POINTS = [400, 800, 1200, 1600];

export default {
  id: "tspin",
  install({ events, capabilities }) {
    const score = capabilities.get("score");
    if (!score || !capabilities.has("srs")) throw new Error("tspin requires srs and score");
    const stack = disposerStack();
    let pending = false;
    let lastClear = false;
    const level = () => capabilities.get("level")?.get() ?? 1;
    stack.add(events.on("piece:lock", ({ piece, board, lastAction }) => {
      pending = false;
      lastClear = false;
      if (piece.type !== "T" || lastAction !== "rotate") return;
      const cx = piece.x + 1;
      const cy = piece.y + 1;
      const occupied = [[-1,-1],[1,-1],[-1,1],[1,1]].filter(([dx, dy]) => {
        const x = cx + dx;
        const y = cy + dy;
        return x < 0 || x >= 10 || y < 0 || y >= 22 || Boolean(board[y][x]);
      }).length;
      pending = occupied >= 3;
      if (pending) queueMicrotask(() => {
        if (!pending) return;
        const points = POINTS[0] * level();
        score.add(points, "t-spin");
        events.emit("tspin:clear", { count: 0, points });
        pending = false;
      });
    }));
    stack.add(score.setLineScorer(({ count }) => {
      if (!pending) return [0, 100, 300, 500, 800][count] * level();
      lastClear = true;
      return POINTS[count] * level();
    }));
    stack.add(events.on("lines:clear", ({ count }) => {
      if (!pending) return;
      const points = POINTS[count] * level();
      events.emit("tspin:clear", { count, points });
      pending = false;
    }));
    stack.add(capabilities.provide("tspin", { wasLastClear: () => lastClear }));
    return () => stack.dispose();
  },
};
