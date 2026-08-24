import { disposerStack, valuePanel } from "/src/core/feature-utils.js";
import { dropPoints, lineClearPoints } from "./rules.js";

export default {
  id: "score",
  install({ events, capabilities, ui, i18n }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("score", new URL("./style.css", import.meta.url)));
    const { panel, value } = valuePanel(ui, "panel.score", "score-panel");
    stack.add(ui.mount("hud-left", panel));
    let score = 0;
    let level = 1;
    let lineScorer = ({ count }) => lineClearPoints(count, level);
    const render = () => {
      value.textContent = i18n.formatNumber(score, { minimumIntegerDigits: 6, useGrouping: false });
    };
    const publish = (delta = 0, reason = "reset") => {
      render();
      events.emit("score:change", { score, delta, reason, level });
    };
    const add = (points, reason = "bonus") => {
      const delta = Math.max(0, Math.round(points));
      score += delta;
      publish(delta, reason);
    };
    stack.add(events.on("lines:clear", (payload) => add(lineScorer(payload), "line-clear")));
    stack.add(events.on("piece:move", ({ reason, distance, dy }) => {
      const points = dropPoints(reason, distance ?? dy);
      if (points > 0) add(points, reason);
    }));
    stack.add(events.on("level:change", ({ level: nextLevel }) => { level = nextLevel; }));
    stack.add(events.on("game:restart", () => { score = 0; level = 1; publish(); }));
    stack.add(i18n.onChange(render));
    stack.add(capabilities.provide("score", {
      get: () => score,
      add,
      setLineScorer(scorer) {
        const previous = lineScorer;
        lineScorer = scorer;
        return () => { lineScorer = previous; };
      },
    }));
    publish();
    return () => stack.dispose();
  },
};
