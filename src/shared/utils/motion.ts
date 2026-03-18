import type { CSSProperties } from "react";

export function getMotionStyle(index = 0): CSSProperties {
  return {
    ["--motion-index" as string]: index,
  };
}
