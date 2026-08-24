import { getPieceCells } from "/src/core/pieces.js";

export default {
  id: "ghost",
  install({ game, render, ui }) {
    const removeStyle = ui.addStyles("ghost", new URL("./style.css", import.meta.url));
    const removeLayer = render.registerLayer("ghost", 20, (snapshot) => {
      if (!snapshot.activePiece || snapshot.phase === "gameover") return [];
      const ghost = { ...snapshot.activePiece, y: game.getGhostY() };
      return getPieceCells(ghost).map((cell) => ({ ...cell, type: ghost.type, className: "is-ghost" }));
    });
    return () => { removeLayer(); removeStyle(); };
  },
};
