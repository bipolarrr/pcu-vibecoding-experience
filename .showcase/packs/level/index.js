import { disposerStack, valuePanel } from "/src/core/feature-utils.js";
import { gravityForLevel, levelForLines } from "./rules.js";

export default {
  id: "level",
  install({ game, events, capabilities, ui, i18n }) {
    const stack = disposerStack();
    const { panel, value } = valuePanel(ui, "panel.level", "level-panel");
    stack.add(ui.mount("hud-left", panel));
    let lines = 0;
    let level = 1;
    let restoreGravity = () => {};
    const apply = () => {
      restoreGravity();
      restoreGravity = game.setGravityInterval(gravityForLevel(level));
      value.textContent = i18n.formatNumber(level);
      events.emit("level:change", { level, lines });
    };
    stack.add(events.on("lines:clear", ({ count }) => {
      lines += count;
      const next = levelForLines(lines);
      if (next !== level) { level = next; apply(); }
    }));
    stack.add(events.on("game:restart", () => { lines = 0; level = 1; apply(); }));
    stack.add(i18n.onChange(() => { value.textContent = i18n.formatNumber(level); }));
    stack.add(capabilities.provide("level", { get: () => level }));
    apply();
    stack.add(() => restoreGravity());
    return () => stack.dispose();
  },
};
