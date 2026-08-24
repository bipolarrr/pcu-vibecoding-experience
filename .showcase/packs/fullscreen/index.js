export default {
  id: "fullscreen",
  install({ commands, ui }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feature-button fullscreen-button";
    ui.text(button, "button.fullscreen");
    const toggle = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    };
    button.addEventListener("click", toggle);
    const removeCommand = commands.register("KeyF", "command.fullscreen", toggle);
    const unmount = ui.mount("settings", button);
    return () => { removeCommand(); button.removeEventListener("click", toggle); unmount(); };
  },
};
