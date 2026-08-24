import { disposerStack, renderMiniPiece } from "/src/core/feature-utils.js";

export default {
  id: "next",
  install({ game, events, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("next", new URL("./style.css", import.meta.url)));
    const panel = ui.panel("panel.next", "next-panel");
    const list = document.createElement("div");
    list.className = "next-list";
    panel.append(list);
    stack.add(ui.mount("hud-right", panel));
    const update = () => {
      list.replaceChildren();
      for (const type of game.peekNext(5)) {
        const item = document.createElement("div");
        renderMiniPiece(item, type);
        list.append(item);
      }
    };
    stack.add(events.on("piece:spawn", update));
    stack.add(events.on("game:restart", update));
    update();
    return () => stack.dispose();
  },
};
