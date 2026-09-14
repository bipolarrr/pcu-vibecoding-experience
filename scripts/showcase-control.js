import { createI18n } from "/src/i18n/index.js";

const i18n = createI18n({
  locale: "ko",
  localStorage: window.localStorage,
  document: window.document,
});
const result = document.querySelector("#result");
const actionButtons = [...document.querySelectorAll("[data-action]")];
let token = null;
let busy = false;
let armedButton = null;
let armedTimer = null;

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

async function refresh() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const body = await response.json();
    statusText("git", body.showcase.kind);
    statusText("verification", body.showcase.verification.verified ? "verified" : "verification-needed");
    statusText("game", body.services.game ? "running" : "stopped");
    statusText("watch", body.services.watch ? "running" : "stopped");
    if (body.activeJob && !busy) showResult("job-running", false);
  } catch {
    statusText("git", "unavailable");
    statusText("verification", "unavailable");
    statusText("game", "unavailable");
    statusText("watch", "unavailable");
    showResult("control-unavailable", false);
  }
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
  showResult("working");
  try {
    const response = await fetch(`/api/actions/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "X-Showcase-Token": token },
    });
    const body = await response.json();
    showResult(body.code, body.ok);
  } catch {
    showResult("control-unavailable", false);
  } finally {
    setBusy(false);
    await refresh();
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
  refresh();
});

try {
  const response = await fetch("/api/session", { cache: "no-store" });
  token = (await response.json()).token;
  await refresh();
  setInterval(refresh, 2500);
} catch {
  showResult("control-unavailable", false);
}
