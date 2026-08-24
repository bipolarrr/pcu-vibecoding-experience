import { disposerStack } from "/src/core/feature-utils.js";

export default {
  id: "input-sfx",
  install({ events, audio }) {
    const stack = disposerStack();
    stack.add(events.on("piece:move", ({ reason }) => {
      if (reason === "move") audio.tone(180, 0.035, { gain: 0.12 });
      if (reason === "soft-drop") audio.tone(120, 0.025, { gain: 0.08 });
      if (reason === "hard-drop") audio.tone(95, 0.09, { toFrequency: 55, gain: 0.25 });
    }));
    stack.add(events.on("piece:rotate", () => audio.tone(330, 0.045, { type: "triangle", gain: 0.14 })));
    return () => stack.dispose();
  },
};
