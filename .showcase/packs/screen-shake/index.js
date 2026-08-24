import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "screen-shake",
  install({ events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("screen-shake", new URL("./style.css", import.meta.url)));
    const shell = document.querySelector("#game-shell");
    const timers = timeoutGroup();
    stack.add(() => timers.clear());
    stack.add(events.on("lines:clear", ({ count }) => {
      const className = count >= 4 ? "shake-strong" : "shake-soft";
      shell.classList.remove("shake-soft", "shake-strong");
      void shell.offsetWidth;
      shell.classList.add(className);
      timers.set(() => shell.classList.remove(className), 220);
    }));
    return () => stack.dispose();
  },
};
