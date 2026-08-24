import { disposerStack, valuePanel } from "/src/core/feature-utils.js";

export default {
  id: "lines",
  install({ events, ui, i18n }) {
    const stack = disposerStack();
    const { panel, value } = valuePanel(ui, "panel.lines", "lines-panel");
    stack.add(ui.mount("hud-left", panel));
    let lines = 0;
    const render = () => { value.textContent = i18n.formatNumber(lines); };
    stack.add(events.on("lines:clear", ({ count }) => { lines += count; render(); }));
    stack.add(events.on("game:restart", () => { lines = 0; render(); }));
    stack.add(i18n.onChange(render));
    render();
    return () => stack.dispose();
  },
};
