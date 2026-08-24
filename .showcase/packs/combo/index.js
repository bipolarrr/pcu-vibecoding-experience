import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "combo",
  install({ events, capabilities }) {
    const score = capabilities.get("score");
    if (!score) throw new Error("combo requires score");
    const stack = disposerStack();
    let combo = -1;
    let cleared = false;
    const level = () => capabilities.get("level")?.get() ?? 1;
    stack.add(events.on("piece:lock", () => {
      cleared = false;
      queueMicrotask(() => { if (!cleared) combo = -1; });
    }));
    stack.add(events.on("lines:clear", () => {
      cleared = true;
      combo += 1;
      if (combo > 0) {
        const points = 50 * combo * level();
        score.add(points, "combo");
        events.emit("combo:change", { combo, points });
      }
    }));
    return () => stack.dispose();
  },
};
