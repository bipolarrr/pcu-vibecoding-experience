import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "countdown",
  install({ game, events, ui, i18n }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("countdown", new URL("./style.css", import.meta.url)));
    const overlay = document.createElement("div");
    overlay.className = "countdown-overlay";
    stack.add(ui.mount("overlay", overlay));
    const timers = new Set();
    let currentKey = null;
    const render = () => {
      if (currentKey) overlay.textContent = i18n.t(currentKey);
    };
    const begin = () => {
      if (game.getSnapshot().phase === "playing") game.pause();
      const values = ["countdown.three", "countdown.two", "countdown.one", "countdown.go"];
      overlay.classList.add("is-visible");
      values.forEach((key, index) => {
        const timer = window.setTimeout(() => {
          currentKey = key;
          render();
          if (index === values.length - 1) {
            const end = window.setTimeout(() => {
              overlay.classList.remove("is-visible");
              game.resume();
            }, 450);
            timers.add(end);
          }
        }, index * 600);
        timers.add(timer);
      });
    };
    stack.add(events.on("game:start", begin));
    stack.add(events.on("game:restart", begin));
    stack.add(i18n.onChange(render));
    stack.add(() => { for (const timer of timers) window.clearTimeout(timer); });
    return () => stack.dispose();
  },
};
