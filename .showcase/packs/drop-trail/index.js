import { getPieceCells } from "/src/core/pieces.js";
import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "drop-trail",
  install({ events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("drop-trail", new URL("./style.css", import.meta.url)));
    const layer = document.createElement("div");
    const timers = timeoutGroup();
    layer.className = "drop-trail-layer";
    stack.add(ui.mount("effects", layer));
    stack.add(events.on("piece:move", ({ reason, distance, piece }) => {
      if (reason !== "hard-drop" || !distance) return;
      for (const { x, y } of getPieceCells(piece)) {
        if (y < 2) continue;
        const trail = document.createElement("i");
        trail.className = "drop-trail";
        trail.style.setProperty("--x", String(x));
        trail.style.setProperty("--y", String(y - 2));
        trail.style.setProperty("--distance", String(distance));
        layer.append(trail);
        timers.set(() => trail.remove(), 260);
      }
    }));
    stack.add(() => timers.clear());
    return () => stack.dispose();
  },
};
