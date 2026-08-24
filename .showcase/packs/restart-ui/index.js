export default {
  id: "restart-ui",
  install({ game, ui }) {
    const button = document.createElement("button");
    button.className = "feature-button restart-button";
    button.type = "button";
    ui.text(button, "button.restart");
    const restart = () => game.restart();
    button.addEventListener("click", restart);
    const unmount = ui.mount("settings", button);
    return () => { button.removeEventListener("click", restart); unmount(); };
  },
};
