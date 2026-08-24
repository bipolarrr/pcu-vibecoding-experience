import { PIECE_TYPES } from "/src/core/pieces.js";

export default {
  id: "seven-bag",
  install({ game, capabilities }) {
    let bag = [];
    const take = () => {
      if (bag.length === 0) {
        bag = [...PIECE_TYPES];
        for (let i = bag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(game.rng() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop();
    };
    const restore = game.setPieceSource(take);
    const removeCapability = capabilities.provide("seven-bag", true);
    return () => { removeCapability(); restore(); };
  },
};
