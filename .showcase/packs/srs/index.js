const JLSTZ = {
  "0>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], "1>0": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "1>2": [[0,0],[1,0],[1,1],[0,-2],[1,-2]], "2>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "2>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]], "3>2": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "3>0": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "0>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const I_KICKS = {
  "0>1": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]], "1>0": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  "1>2": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]], "2>1": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "2>3": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]], "3>2": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "3>0": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]], "0>3": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};

export default {
  id: "srs",
  install({ game, capabilities }) {
    const restore = game.setRotationResolver(({ piece, candidate, from, to, collides }) => {
      if (piece.type === "O") return candidate;
      const kicks = (piece.type === "I" ? I_KICKS : JLSTZ)[`${from}>${to}`] ?? [[0, 0]];
      for (const [dx, dy] of kicks) {
        const kicked = { ...candidate, x: candidate.x + dx, y: candidate.y + dy };
        if (!collides(kicked)) return kicked;
      }
      return null;
    });
    const removeCapability = capabilities.provide("srs", true);
    return () => { removeCapability(); restore(); };
  },
};
