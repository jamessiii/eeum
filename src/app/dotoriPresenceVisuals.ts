export function getPresenceAccent(seed: string) {
  const palette = [
    { background: "rgba(77, 135, 255, 0.12)", border: "rgba(77, 135, 255, 0.28)", text: "#436fd4" },
    { background: "rgba(239, 128, 69, 0.12)", border: "rgba(239, 128, 69, 0.26)", text: "#c7672b" },
    { background: "rgba(87, 167, 124, 0.14)", border: "rgba(87, 167, 124, 0.24)", text: "#3f8a60" },
    { background: "rgba(171, 105, 209, 0.13)", border: "rgba(171, 105, 209, 0.24)", text: "#8f55b3" },
    { background: "rgba(59, 168, 174, 0.14)", border: "rgba(59, 168, 174, 0.26)", text: "#2f8a90" },
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}
