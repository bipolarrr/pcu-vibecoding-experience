import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "score-popup",
  install({ events, ui, i18n }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("score-popup", new URL("./style.css", import.meta.url)));
    const layer = document.createElement("div");
    const timers = timeoutGroup();
    layer.className = "score-popup-layer";
    stack.add(ui.mount("effects", layer));
    stack.add(events.on("score:change", ({ delta, reason }) => {
      if (!delta || reason === "soft-drop") return;
      const popup = document.createElement("span");
      popup.className = "score-popup";
      popup.textContent = i18n.t("score.delta", { score: i18n.formatNumber(delta) });
      layer.append(popup);
      timers.set(() => popup.remove(), 700);
    }));
    stack.add(() => timers.clear());
    return () => stack.dispose();
  },
};
