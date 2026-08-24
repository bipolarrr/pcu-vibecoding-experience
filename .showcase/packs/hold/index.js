import { disposerStack, renderMiniPiece } from "/src/core/feature-utils.js";

export default {
  id: "hold",
  install({ game, events, commands, capabilities, ui }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("hold", new URL("./style.css", import.meta.url)));
    const panel = ui.panel("panel.hold", "hold-panel");
    const preview = document.createElement("div");
    panel.append(preview);
    stack.add(ui.mount("hud-left", panel));
    let held = null;
    let available = true;
    const update = () => {
      renderMiniPiece(preview, held);
      panel.classList.toggle("is-disabled", !available);
    };
    const performHold = () => {
      if (!available || game.getSnapshot().phase !== "playing") return;
      held = game.exchangeActivePiece(held);
      available = false;
      events.emit("hold:change", { held, available });
      update();
    };
    stack.add(commands.register("KeyC", "command.hold", performHold));
    stack.add(events.on("piece:lock", () => { available = true; update(); }));
    stack.add(events.on("game:restart", () => { held = null; available = true; update(); }));
    stack.add(capabilities.provide("hold", { get: () => held }));
    update();
    return () => stack.dispose();
  },
};
