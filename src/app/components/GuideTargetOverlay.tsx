import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GuideBeaconScene } from "./GuideBeaconScene";

type MeasuredTarget = {
  top: number;
  left: number;
  width: number;
  height: number;
  insideTopbar: boolean;
};

function measureTarget(selector: string): MeasuredTarget | null {
  if (typeof document === "undefined") return null;
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return null;

  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    insideTopbar: Boolean(target.closest(".app-topbar")),
  };
}

export function GuideTargetOverlay({
  selector,
  label,
}: {
  selector: string | null;
  label: string;
}) {
  const [targetRect, setTargetRect] = useState<MeasuredTarget | null>(null);

  useEffect(() => {
    if (!selector || typeof window === "undefined") {
      setTargetRect(null);
      return;
    }

    let frameId = 0;

    const updateTarget = () => {
      frameId = 0;
      setTargetRect(measureTarget(selector));
    };

    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateTarget);
    };

    scheduleUpdate();

    const mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            scheduleUpdate();
          })
        : null;

    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [selector]);

  if (!selector || !targetRect || typeof document === "undefined") return null;

  const beaconSize = 4.75 * 16;
  const beaconLeft = targetRect.left + targetRect.width - beaconSize * 0.42;
  const beaconTop = targetRect.top - beaconSize * 0.42;
  const badgeTop = targetRect.top - 18;
  const badgeLeft = targetRect.left + 18;

  return createPortal(
    <div
      className={`guide-target-overlay${targetRect.insideTopbar ? " guide-target-overlay--topbar" : " guide-target-overlay--content"}`}
      aria-hidden="true"
    >
      <div
        className="guide-target-highlight"
        style={{
          top: `${targetRect.top - 10}px`,
          left: `${targetRect.left - 10}px`,
          width: `${targetRect.width + 20}px`,
          height: `${targetRect.height + 20}px`,
        }}
      />
      <div
        className="guide-target-badge"
        style={{
          top: `${Math.max(12, badgeTop)}px`,
          left: `${Math.max(12, badgeLeft)}px`,
        }}
      >
        {label}
      </div>
      <div
        className="guide-target-beacon"
        style={{
          top: `${Math.max(4, beaconTop)}px`,
          left: `${Math.max(4, beaconLeft)}px`,
          width: `${beaconSize}px`,
          height: `${beaconSize}px`,
        }}
      >
        <GuideBeaconScene variant="v7" state="idle" mode="floating" />
      </div>
    </div>,
    document.body,
  );
}
