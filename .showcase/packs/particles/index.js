import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "particles",
  install({ events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("particles", new URL("./style.css", import.meta.url)));
    const layer = document.createElement("div");
    const timers = timeoutGroup();
    layer.className = "particle-layer";
    stack.add(ui.mount("effects", layer));
    stack.add(events.on("lines:clear", ({ rows, count }) => {
      for (const row of rows) {
        for (let i = 0; i < 10; i += 1) {
          const particle = document.createElement("i");
          particle.className = "line-particle";
          particle.style.setProperty("--x", `${(i + 0.5) * 10}%`);
          particle.style.setProperty("--y", `${((row - 2) + 0.5) * 5}%`);
          particle.style.setProperty("--dx", `${(i - 4.5) * 7}px`);
          particle.style.setProperty("--dy", `${-18 - Math.random() * 45 - count * 5}px`);
          particle.style.setProperty("--delay", `${Math.random() * 70}ms`);
          layer.append(particle);
          timers.set(() => particle.remove(), 650);
        }
      }
    }));
    stack.add(() => timers.clear());
    return () => stack.dispose();
  },
};
