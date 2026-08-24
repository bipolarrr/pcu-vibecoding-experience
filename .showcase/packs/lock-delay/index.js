export default {
  id: "lock-delay",
  install({ game, capabilities }) {
    const restore = game.setLockPolicy({ delayMs: 500, resetLimit: 15 });
    const removeCapability = capabilities.provide("lock-delay", true);
    return () => { removeCapability(); restore(); };
  },
};
