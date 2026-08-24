import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "pause",
  install({ game, events, commands, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("pause", new URL("./style.css", import.meta.url)));
    const overlay = document.createElement("div");
    overlay.className = "pause-overlay";
    ui.text(overlay, "pause.label");
    const toggle = () => {
      const phase = game.getSnapshot().phase;
      if (phase === "playing") game.pause();
      else if (phase === "paused") game.resume();
    };
    const render = ({ type }) => overlay.classList.toggle("is-visible", type === "game:pause");
    stack.add(ui.mount("overlay", overlay));
    stack.add(commands.register("KeyP", "command.pause", toggle));
    stack.add(commands.register("Escape", "command.pause", toggle));
    stack.add(events.on("game:pause", render));
    stack.add(events.on("game:resume", render));
    stack.add(events.on("game:restart", render));
    return () => stack.dispose();
  },
};
