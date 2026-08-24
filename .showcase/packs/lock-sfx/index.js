export default {
  id: "lock-sfx",
  install({ events, audio }) {
    return events.on("piece:lock", () => audio.tone(85, 0.08, { type: "square", gain: 0.22 }));
  },
};
