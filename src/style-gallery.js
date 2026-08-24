import { TetrisEngine } from "./core/engine.js";
import { EventBus } from "./core/events.js";
import { BoardRenderer } from "./core/renderer.js";
import { createI18n } from "./i18n/index.js";

const i18n = createI18n(window);

function renderLocalizedNumbers() {
  for (const node of document.querySelectorAll("[data-preview-number]")) {
    node.textContent = i18n.formatNumber(Number(node.dataset.previewNumber), {
      minimumIntegerDigits: 2,
      useGrouping: false,
    });
  }
  for (const node of document.querySelectorAll("[data-preview-score]")) {
    node.textContent = i18n.formatNumber(Number(node.dataset.previewScore), {
      minimumIntegerDigits: 6,
      useGrouping: false,
    });
  }
  for (const node of document.querySelectorAll("[data-preview-level]")) {
    node.textContent = i18n.formatNumber(Number(node.dataset.previewLevel), {
      minimumIntegerDigits: 2,
      useGrouping: false,
    });
  }
}

const backLink = document.querySelector(".back-link");
const localizeGallery = () => {
  renderLocalizedNumbers();
  const backUrl = new URL(backLink.href);
  backUrl.searchParams.set("lang", i18n.locale);
  backLink.href = backUrl;
};
localizeGallery();
i18n.onChange(localizeGallery);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const previews = [...document.querySelectorAll(".preview-card")].map((card) => {
  const events = new EventBus();
  const game = new TetrisEngine(events, { rng: seededRandom(20260824) });
  const renderer = new BoardRenderer(card.querySelector(".preview-board"));
  events.on("state:change", ({ snapshot }) => renderer.render(snapshot));
  game.start();
  for (const offset of [-3, 2, -1, 3, 0, -2]) {
    const direction = Math.sign(offset);
    for (let i = 0; i < Math.abs(offset); i += 1) game.move(direction, 0, "preview");
    game.hardDrop();
  }
  renderer.render(game.getSnapshot());
  return { game, renderer };
});

let step = 0;
window.setInterval(() => {
  for (const { game, renderer } of previews) {
    if (game.getSnapshot().phase === "gameover") game.restart();
    if (step % 4 === 0) game.rotate(1);
    else if (step % 4 === 1) game.move(-1, 0, "preview");
    else if (step % 4 === 2) game.move(1, 0, "preview");
    else game.hardDrop();
    game.tick(300);
    renderer.render(game.getSnapshot());
  }
  step += 1;
}, 520);
