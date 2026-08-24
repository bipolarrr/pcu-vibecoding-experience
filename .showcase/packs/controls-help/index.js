import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "controls-help",
  install({ commands, ui, i18n }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("controls-help", new URL("./style.css", import.meta.url)));
    const panel = ui.panel("panel.controls", "controls-panel");
    const list = document.createElement("dl");
    panel.append(list);
    stack.add(ui.mount("hud-right", panel));
    const render = () => {
      list.replaceChildren();
      for (const binding of commands.list()) {
        const key = document.createElement("dt");
        const label = document.createElement("dd");
        key.textContent = i18n.t(`key.${binding.code}`);
        label.textContent = i18n.t(binding.labelKey);
        list.append(key, label);
      }
    };
    queueMicrotask(render);
    stack.add(i18n.onChange(render));
    return () => stack.dispose();
  },
};
