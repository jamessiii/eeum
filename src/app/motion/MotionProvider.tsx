import { useEffect, type PropsWithChildren } from "react";

export function MotionProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => {
      root.classList.toggle("reduce-motion", media.matches);
      root.classList.add("motion-ready");
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return children;
}
