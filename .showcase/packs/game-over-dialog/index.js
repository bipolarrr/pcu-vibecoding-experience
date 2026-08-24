import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "game-over-dialog",
  install({ game, events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("game-over-dialog", new URL("./style.css", import.meta.url)));
    const dialog = document.createElement("div");
    dialog.className = "game-over-dialog";
    const title = document.createElement("strong");
    const instruction = document.createElement("span");
    ui.text(title, "gameOver.title");
    ui.text(instruction, "gameOver.instruction");
    dialog.append(title, instruction);
    stack.add(ui.mount("overlay", dialog));
    stack.add(events.on("game:over", () => dialog.classList.add("is-visible")));
    stack.add(events.on("game:restart", () => dialog.classList.remove("is-visible")));
    const status = document.querySelector("#baseline-status");
    status.classList.add("has-game-over-dialog");
    stack.add(() => status.classList.remove("has-game-over-dialog"));
    return () => stack.dispose();
  },
};
