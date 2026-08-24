export function levelForLines(lines) {
  return Math.floor(Math.max(0, lines) / 10) + 1;
}

export function gravityForLevel(level) {
  return Math.max(80, 800 * (0.85 ** (Math.max(1, level) - 1)));
}
