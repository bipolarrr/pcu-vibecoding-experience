import { disposerStack, timeoutGroup } from "/src/core/feature-utils.js";

export default {
  id: "landing-pulse",
  install({ events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("landing-pulse", new URL("./style.css", import.meta.url)));
    const board = document.querySelector("#board");
    const timers = timeoutGroup();
    stack.add(() => timers.clear());
    stack.add(events.on("piece:lock", () => {
      board.classList.remove("is-landing");
      void board.offsetWidth;
      board.classList.add("is-landing");
      timers.set(() => board.classList.remove("is-landing"), 160);
    }));
    return () => stack.dispose();
  },
};
