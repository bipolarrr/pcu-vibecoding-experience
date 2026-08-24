import { AudioService } from "./core/audio.js";
import { CapabilityRegistry } from "./core/capabilities.js";
import { CommandRegistry } from "./core/commands.js";
import { TetrisEngine } from "./core/engine.js";
import { EventBus } from "./core/events.js";
import { FeatureHost } from "./core/feature-host.js";
import { BoardRenderer } from "./core/renderer.js";
import { UiService } from "./core/ui.js";
import { createI18n } from "./i18n/index.js";

export function bootstrapTetris(featureModules = []) {
  const events = new EventBus();
  const game = new TetrisEngine(events);
  const commands = new CommandRegistry(window);
  const capabilities = new CapabilityRegistry();
  const i18n = createI18n(window);
  const ui = new UiService(document, i18n);
  const audio = new AudioService(window.localStorage);
  const renderer = new BoardRenderer(document.querySelector("#board"));
  const status = document.querySelector("#baseline-status");
  const context = { game, events, commands, capabilities, ui, i18n, audio, render: renderer, storage: window.localStorage, document };
  const host = new FeatureHost(context);
  host.install(featureModules);

  commands.register("ArrowLeft", "command.left", () => game.move(-1, 0, "move"));
  commands.register("ArrowRight", "command.right", () => game.move(1, 0, "move"));
  commands.register("ArrowDown", "command.softDrop", () => game.softDrop());
  commands.register("ArrowUp", "command.rotate", () => game.rotate(1));
  commands.register("Enter", "command.restart", () => {
    if (game.getSnapshot().phase === "gameover") game.restart();
  });

  events.on("state:change", ({ snapshot }) => renderer.render(snapshot));
  const renderStatus = () => {
    status.textContent = game.getSnapshot().phase === "gameover" ? i18n.t("status.gameOver") : "";
  };
  events.on("game:over", renderStatus);
  events.on("game:restart", renderStatus);
  i18n.onChange(renderStatus);
  game.start();
  renderer.render(game.getSnapshot());

  let previousTime = performance.now();
  let frameId = 0;
  const frame = (now) => {
    game.tick(now - previousTime);
    previousTime = now;
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  const app = {
    game, events, commands, capabilities, renderer, host, i18n,
    destroy() {
      cancelAnimationFrame(frameId);
      host.destroy();
      commands.destroy();
      events.clear();
      audio.stopMusic();
    },
  };
  window.__TETRIS__ = Object.freeze(app);
  return app;
}
