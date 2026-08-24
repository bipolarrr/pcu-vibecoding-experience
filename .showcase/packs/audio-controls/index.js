import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "audio-controls",
  install({ commands, events, audio, ui, i18n }) {
    const stack = disposerStack();
    stack.add(ui.addStyles("audio-controls", new URL("./style.css", import.meta.url)));
    const panel = document.createElement("section");
    panel.className = "audio-controls feature-panel";
    const mute = document.createElement("button");
    mute.type = "button";
    mute.className = "feature-button audio-mute";
    const createVolumeControl = (className, labelKey, ariaLabelKey) => {
      const label = document.createElement("label");
      const text = document.createElement("span");
      const input = document.createElement("input");
      input.className = className;
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      ui.text(text, labelKey);
      ui.attribute(input, "aria-label", ariaLabelKey);
      label.append(text, input);
      return { label, input };
    };
    const sfxControl = createVolumeControl("sfx-volume", "audio.sfx", "audio.sfxAriaLabel");
    const musicControl = createVolumeControl("music-volume", "audio.music", "audio.musicAriaLabel");
    const sfx = sfxControl.input;
    const music = musicControl.input;
    panel.append(mute, sfxControl.label, musicControl.label);
    sfx.value = String(audio.sfxVolume);
    music.value = String(audio.musicVolume);
    const render = () => { mute.textContent = i18n.t(audio.muted ? "audio.unmute" : "audio.mute"); };
    const toggle = () => { audio.setMuted(!audio.muted); render(); events.emit("audio:change", { muted: audio.muted }); };
    const onSfx = () => audio.setVolume("sfx", sfx.value);
    const onMusic = () => audio.setVolume("music", music.value);
    mute.addEventListener("click", toggle);
    sfx.addEventListener("input", onSfx);
    music.addEventListener("input", onMusic);
    stack.add(commands.register("KeyM", "command.mute", toggle));
    stack.add(i18n.onChange(render));
    stack.add(ui.mount("settings", panel));
    stack.add(() => { mute.removeEventListener("click", toggle); sfx.removeEventListener("input", onSfx); music.removeEventListener("input", onMusic); });
    render();
    return () => stack.dispose();
  },
};
