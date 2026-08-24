export default {
  id: "hard-drop",
  install({ game, commands, capabilities }) {
    const removeCommand = commands.register("Space", "command.hardDrop", () => game.hardDrop());
    const removeCapability = capabilities.provide("hard-drop", true);
    return () => { removeCapability(); removeCommand(); };
  },
};
