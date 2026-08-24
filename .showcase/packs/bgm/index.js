import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "bgm",
  install({ events, audio }) {
    const stack = disposerStack();
    let stopMusic = () => {};
    const begin = () => {
      stopMusic();
      stopMusic = audio.startMusic();
      window.removeEventListener("keydown", begin);
      window.removeEventListener("pointerdown", begin);
    };
    window.addEventListener("keydown", begin, { once: true });
    window.addEventListener("pointerdown", begin, { once: true });
    stack.add(() => { window.removeEventListener("keydown", begin); window.removeEventListener("pointerdown", begin); stopMusic(); });
    stack.add(events.on("game:pause", () => audio.stopMusic()));
    stack.add(events.on("game:resume", () => { stopMusic = audio.startMusic(); }));
    stack.add(events.on("game:over", () => audio.stopMusic()));
    stack.add(events.on("game:restart", () => { stopMusic = audio.startMusic(); }));
    return () => stack.dispose();
  },
};
