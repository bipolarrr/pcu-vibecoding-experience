import { createI18n } from "/src/i18n/index.js";

const i18n = createI18n({
  locale: "ko",
  localStorage: window.localStorage,
  document: window.document,
});
const result = document.querySelector("#result");
const progress = document.querySelector("#progress");
const progressStage = document.querySelector("#progress-stage");
const progressSteps = document.querySelector("#progress-steps");
const stageItems = [...progressSteps.querySelectorAll("[data-stage]")];
const freshStages = stageItems.map((item) => item.dataset.stage);
const actionButtons = [...document.querySelectorAll("[data-action]")];
let token = null;
let instanceId = null;
let busy = false;
let armedButton = null;
let armedTimer = null;
let observedJob = false;
let progressAction = null;
let progressPhase = null;

const translateResult = (code) => {
  try {
    return i18n.t(`control.result.${code}`);
  } catch {
    return i18n.t("control.result.command-failed");
  }
};

function showResult(code, ok = true) {
  result.textContent = translateResult(code);
  result.className = `result ${ok ? "success" : "error"}`;
}

function statusText(prefix, value) {
  const node = document.querySelector(`#${prefix}-status`);
  node.textContent = i18n.t(`control.state.${value}`);
  node.dataset.state = value;
}

function showProgress(action, stage = "working") {
  progressAction = action;
  progressPhase = stage;
  progress.hidden = false;
  const fresh = action === "fresh-start";
  progressSteps.hidden = !fresh;
  const stageKey = fresh && freshStages.includes(stage) ? stage : "working";
  progressStage.textContent = i18n.t(`control.progress.${stageKey}`);
  const current = freshStages.indexOf(stage);
  for (const [index, item] of stageItems.entries()) {
    item.dataset.state = index < current ? "complete" : index === current ? "current" : "pending";
  }
}

function hideProgress() {
  progress.hidden = true;
  progressAction = null;
  progressPhase = null;
}

async function refresh() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const body = await response.json();
    if (instanceId && body.instanceId !== instanceId) await acquireSession();
    statusText("git", body.showcase.kind);
    statusText("verification", body.showcase.verification.verified ? "verified" : "verification-needed");
    statusText("game", body.services.game ? "running" : "stopped");
    statusText("watch", body.services.watch ? "running" : "stopped");
    if (body.activeJob) {
      observedJob = true;
      showProgress(body.activeJob, body.activeStage ?? "working");
    } else if (!busy) {
      hideProgress();
      if (observedJob && body.lastResult) showResult(body.lastResult.code, body.lastResult.ok);
      observedJob = false;
    }
  } catch {
    statusText("git", "unavailable");
    statusText("verification", "unavailable");
    statusText("game", "unavailable");
    statusText("watch", "unavailable");
    if (!busy) hideProgress();
    showResult("control-unavailable", false);
  }
}

async function acquireSession() {
  const response = await fetch("/api/session", { cache: "no-store" });
  const session = await response.json();
  token = session.token;
  instanceId = session.instanceId;
}

function setBusy(value) {
  busy = value;
  for (const button of actionButtons) button.disabled = value;
}

function disarm() {
  clearTimeout(armedTimer);
  if (armedButton) {
    armedButton.classList.remove("armed");
    armedButton.textContent = i18n.t(armedButton.dataset.i18n);
  }
  armedButton = null;
}

async function execute(action) {
  setBusy(true);
  showProgress(action, action === "fresh-start" ? "reset" : "working");
  showResult("working");
  try {
    let response = await fetch(`/api/actions/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "X-Showcase-Token": token },
    });
    if (response.status === 403) {
      await acquireSession();
      response = await fetch(`/api/actions/${encodeURIComponent(action)}`, {
        method: "POST",
        headers: { "X-Showcase-Token": token },
      });
    }
    const body = await response.json();
    showResult(body.code, body.ok);
  } catch {
    showResult("control-unavailable", false);
  } finally {
    setBusy(false);
    await refresh();
    hideProgress();
  }
}

for (const button of actionButtons) {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if (action === "refresh") {
      await refresh();
      return;
    }
    if (button.dataset.confirm === "true" && armedButton !== button) {
      disarm();
      armedButton = button;
      button.classList.add("armed");
      button.textContent = i18n.t("control.confirmAgain");
      showResult("confirm-required", false);
      armedTimer = setTimeout(disarm, 5000);
      return;
    }
    disarm();
    await execute(action);
  });
}

i18n.onChange(() => {
  disarm();
  if (progressAction) showProgress(progressAction, progressPhase);
  refresh();
});

try {
  await acquireSession();
  await refresh();
  setInterval(refresh, 2500);
} catch {
  showResult("control-unavailable", false);
}
