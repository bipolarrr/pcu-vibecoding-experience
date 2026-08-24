import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "back-to-back",
  install({ events, capabilities }) {
    const score = capabilities.get("score");
    if (!score) throw new Error("back-to-back requires score");
    const stack = disposerStack();
    let chain = false;
    let tspinPoints = null;
    const level = () => capabilities.get("level")?.get() ?? 1;
    stack.add(events.on("tspin:clear", ({ points }) => { tspinPoints = points; }));
    stack.add(events.on("lines:clear", ({ count }) => {
      const qualifies = count === 4 || tspinPoints !== null;
      if (qualifies && chain) {
        const base = tspinPoints ?? 800 * level();
        score.add(base * 0.5, "back-to-back");
        events.emit("back-to-back:change", { active: true });
      }
      if (count > 0) chain = qualifies;
      tspinPoints = null;
    }));
    stack.add(events.on("game:restart", () => { chain = false; tspinPoints = null; }));
    return () => stack.dispose();
  },
};
