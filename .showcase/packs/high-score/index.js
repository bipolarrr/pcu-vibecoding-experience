import { disposerStack, valuePanel } from "/src/core/feature-utils.js";

export default {
  id: "high-score",
  install({ events, capabilities, storage, ui, i18n }) {
    const score = capabilities.get("score");
    if (!score) throw new Error("high-score requires score");
    const stack = disposerStack();
    const { panel, value } = valuePanel(ui, "panel.best", "high-score-panel");
    stack.add(ui.mount("hud-left", panel));
    let best = Number(storage.getItem("show-tetris:high-score") ?? 0);
    const render = () => {
      value.textContent = i18n.formatNumber(best, { minimumIntegerDigits: 6, useGrouping: false });
    };
    stack.add(events.on("score:change", ({ score: current }) => {
      if (current <= best) return;
      best = current;
      storage.setItem("show-tetris:high-score", String(best));
      render();
    }));
    stack.add(i18n.onChange(render));
    render();
    return () => stack.dispose();
  },
};
