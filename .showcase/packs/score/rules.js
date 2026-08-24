export const BASE_LINE_POINTS = Object.freeze([0, 100, 300, 500, 800]);

export function lineClearPoints(count, level = 1) {
  return (BASE_LINE_POINTS[count] ?? 0) * level;
}

export function dropPoints(reason, distance) {
  if (reason === "soft-drop") return Math.max(1, distance);
  if (reason === "hard-drop") return Math.max(0, distance) * 2;
  return 0;
}
