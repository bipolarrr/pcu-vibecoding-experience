import { bootstrapTetris } from "/src/bootstrap.js";
import hardDrop from "/.showcase/packs/hard-drop/index.js";
import ghost from "/.showcase/packs/ghost/index.js";
import next from "/.showcase/packs/next/index.js";
import hold from "/.showcase/packs/hold/index.js";
import sevenBag from "/.showcase/packs/seven-bag/index.js";
import lockDelay from "/.showcase/packs/lock-delay/index.js";
import pause from "/.showcase/packs/pause/index.js";
import score from "/.showcase/packs/score/index.js";
import lines from "/.showcase/packs/lines/index.js";
import level from "/.showcase/packs/level/index.js";
import highScore from "/.showcase/packs/high-score/index.js";
import restartUi from "/.showcase/packs/restart-ui/index.js";
import countdown from "/.showcase/packs/countdown/index.js";
import fullscreen from "/.showcase/packs/fullscreen/index.js";
import gameOverDialog from "/.showcase/packs/game-over-dialog/index.js";
import moveMotion from "/.showcase/packs/move-motion/index.js";
import landingPulse from "/.showcase/packs/landing-pulse/index.js";
import lineClearMotion from "/.showcase/packs/line-clear-motion/index.js";
import particles from "/.showcase/packs/particles/index.js";
import dropTrail from "/.showcase/packs/drop-trail/index.js";
import screenShake from "/.showcase/packs/screen-shake/index.js";
import scorePopup from "/.showcase/packs/score-popup/index.js";
import inputSfx from "/.showcase/packs/input-sfx/index.js";
import lockSfx from "/.showcase/packs/lock-sfx/index.js";
import clearLevelSfx from "/.showcase/packs/clear-level-sfx/index.js";
import bgm from "/.showcase/packs/bgm/index.js";
import audioControls from "/.showcase/packs/audio-controls/index.js";
import controlsHelp from "/.showcase/packs/controls-help/index.js";

const parameters = new URLSearchParams(window.location.search);
const theme = ["neon", "pixel", "minimal"].includes(parameters.get("theme")) ? parameters.get("theme") : "neon";
const styleAxes = ["palette", "typography", "layout", "board-skin", "background", "chrome"];
const styleFeatures = await Promise.all(styleAxes.map(async (axis) => (
  (await import(`/.showcase/packs/${axis}-${theme}/index.js`)).default
)));
const advancedFeatures = parameters.get("advanced") === "1"
  ? await Promise.all(["srs", "tspin", "combo", "back-to-back"].map(async (id) => (
      (await import(`/.showcase/packs/${id}/index.js`)).default
    )))
  : [];

const features = [
  hardDrop, ghost, next, hold, sevenBag, lockDelay, pause,
  score, lines, level, highScore, restartUi, countdown, fullscreen, gameOverDialog,
  moveMotion, landingPulse, lineClearMotion, particles, dropTrail, screenShake, scorePopup,
  inputSfx, lockSfx, clearLevelSfx, bgm, audioControls,
  ...styleFeatures, ...advancedFeatures, controlsHelp,
];

const app = bootstrapTetris(features);
window.__INTERACTION_RESULT__ = { pauseWorked: false, initialLocale: app.i18n.locale };
window.setTimeout(() => {
  const press = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
  press("ArrowRight");
  press("Space");
  press("KeyC");
  press("KeyP");
  window.__INTERACTION_RESULT__.pauseWorked = app.game.getSnapshot().phase === "paused";
  press("KeyP");
  app.game.board[21] = ["T", "T", "T", null, null, null, null, "T", "T", "T"];
  app.game.activePiece = { type: "I", x: 3, y: 20, rotation: 0 };
  app.game.hardDrop();
}, 2400);

window.setTimeout(() => {
  if (parameters.get("switchLocale") === "1") {
    app.i18n.setLocale(app.i18n.locale === "ko" ? "en" : "ko");
  }
}, 2800);

window.setTimeout(() => {
  window.__TEST_RESULT__ = {
    installed: app.host.installed.length,
    cells: document.querySelectorAll("#board .cell").length,
    panels: document.querySelectorAll(".feature-panel").length,
    styleLinks: document.querySelectorAll("link[data-feature-style]").length,
    phase: app.game.getSnapshot().phase,
    boardWidth: document.querySelector("#board").getBoundingClientRect().width,
    boardScrollWidth: document.querySelector("#board").scrollWidth,
    boardHeight: document.querySelector("#board").getBoundingClientRect().height,
    boardScrollHeight: document.querySelector("#board").scrollHeight,
    score: app.capabilities.get("score").get(),
    held: app.capabilities.get("hold").get(),
    pauseWorked: window.__INTERACTION_RESULT__.pauseWorked,
    lines: document.querySelector(".lines-panel .feature-value").textContent,
    transientEffects: document.querySelector("#effects").querySelectorAll("i, span").length,
    locale: app.i18n.locale,
    documentLanguage: document.documentElement.lang,
    documentTitle: document.title,
    controlsTitle: document.querySelector(".controls-panel h2").textContent,
    restartLabel: document.querySelector(".restart-button").textContent,
    boardAriaLabel: document.querySelector("#board").getAttribute("aria-label"),
    initialLocale: window.__INTERACTION_RESULT__.initialLocale,
  };
  document.querySelector("#test-result").textContent = JSON.stringify(window.__TEST_RESULT__);
  document.documentElement.dataset.testReady = "true";
}, 3000);
