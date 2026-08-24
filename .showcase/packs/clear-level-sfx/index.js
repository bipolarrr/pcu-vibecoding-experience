import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "clear-level-sfx",
  install({ events, audio }) {
    const stack = disposerStack();
    stack.add(events.on("lines:clear", ({ count }) => {
      [440, 554.37, 659.25, 880].slice(0, Math.max(1, count)).forEach((note, index) => {
        audio.tone(note, 0.12, { delay: index * 0.045, type: "triangle", gain: 0.2 });
      });
    }));
    stack.add(events.on("level:change", ({ level }) => {
      if (level > 1) [523.25, 659.25, 783.99].forEach((note, index) => audio.tone(note, 0.15, { delay: index * 0.08, gain: 0.18 }));
    }));
    return () => stack.dispose();
  },
};
