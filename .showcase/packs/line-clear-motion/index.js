import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "line-clear-motion",
  install({ events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("line-clear-motion", new URL("./style.css", import.meta.url)));
    const layer = document.createElement("div");
    const timers = timeoutGroup();
    layer.className = "line-flash-layer";
    stack.add(ui.mount("effects", layer));
    stack.add(events.on("lines:clear", ({ rows }) => {
      for (const row of rows.filter((value) => value >= 2)) {
        const flash = document.createElement("span");
        flash.className = "line-flash";
        flash.style.setProperty("--row", String(row - 2));
        layer.append(flash);
        timers.set(() => flash.remove(), 320);
      }
    }));
    stack.add(() => timers.clear());
    return () => stack.dispose();
  },
};
