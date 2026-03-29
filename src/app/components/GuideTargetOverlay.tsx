import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GuideBeaconScene } from "./GuideBeaconScene";

type GuideInteractionKind = "press" | "drag" | "drop";

type MeasuredTarget = {
  top: number;
  left: number;
  width: number;
  height: number;
  insideTopbar: boolean;
  isSideZone: boolean;
  interactionKind: GuideInteractionKind | null;
};

function isSameMeasuredTarget(left: MeasuredTarget | null, right: MeasuredTarget | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height &&
    left.insideTopbar === right.insideTopbar &&
    left.isSideZone === right.isSideZone &&
    left.interactionKind === right.interactionKind
  );
}

function getInteractionKind(target: HTMLElement): GuideInteractionKind | null {
  if (target.closest(".category-side-zone") || target.matches('[data-guide-target="people-restore-drop"]')) {
    return "drop";
  }

  if (target.draggable || target.closest('[draggable="true"]') || target.querySelector('[draggable="true"]')) {
    return "drag";
  }

  if (target.closest('button, a, input, select, textarea, [role="button"]') || target.querySelector('button, a, input, select, textarea, [role="button"]')) {
    return "press";
  }

  return null;
}

function measureTarget(selector: string): MeasuredTarget | null {
  if (typeof document === "undefined") return null;
  const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (!targets.length) return null;

  const measuredTargets = targets
    .map((target) => {
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);

      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        visibleArea,
        insideTopbar: Boolean(target.closest(".app-topbar, .app-top-nav")),
        isSideZone: Boolean(target.closest(".category-side-zone")),
        interactionKind: getInteractionKind(target),
      };
    })
    .filter((target): target is MeasuredTarget & { visibleArea: number } => Boolean(target));

  if (!measuredTargets.length) return null;

  measuredTargets.sort((left, right) => right.visibleArea - left.visibleArea);
  const [target] = measuredTargets;
  return {
    top: target.top,
    left: target.left,
    width: target.width,
    height: target.height,
    insideTopbar: target.insideTopbar,
    isSideZone: target.isSideZone,
    interactionKind: target.interactionKind,
  };
}

export function GuideTargetOverlay({
  selector,
  label,
  interactionKind,
  interactionLabel,
}: {
  selector: string | null;
  label: string;
  interactionKind?: GuideInteractionKind | null;
  interactionLabel?: string | null;
}) {
  const [targetRect, setTargetRect] = useState<MeasuredTarget | null>(null);

  useEffect(() => {
    if (!selector || typeof window === "undefined") {
      setTargetRect(null);
      return;
    }

    let frameId = 0;
    let settleFrameId = 0;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleUpdate();
          })
        : null;

    const updateTarget = () => {
      frameId = 0;
      setTargetRect((current) => {
        const next = measureTarget(selector);
        return isSameMeasuredTarget(current, next) ? current : next;
      });
    };

    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateTarget);
    };

    const observeTargets = () => {
      resizeObserver?.disconnect();
      document.querySelectorAll<HTMLElement>(selector).forEach((target) => {
        resizeObserver?.observe(target);
      });
    };

    const settleTarget = (remainingFrames: number) => {
      scheduleUpdate();
      observeTargets();
      if (remainingFrames <= 0) return;
      settleFrameId = window.requestAnimationFrame(() => {
        settleTarget(remainingFrames - 1);
      });
    };

    settleTarget(10);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (settleFrameId) window.cancelAnimationFrame(settleFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [selector]);

  if (!selector || !targetRect || typeof document === "undefined") return null;

  const beaconSize = 4.75 * 16;
  const badgeWidthEstimate = 220;
  const badgeHeightEstimate = 36;
  const rawBeaconLeft = targetRect.left + targetRect.width - beaconSize * 0.42;
  const rawBeaconTop = targetRect.top - beaconSize * 0.42;
  const rawBadgeTop = targetRect.top - 18;
  const rawBadgeLeft = targetRect.left + 18;
  const rawCueLeft = targetRect.left + targetRect.width * 0.5;
  const rawCueTop = targetRect.isSideZone ? targetRect.top + targetRect.height * 0.5 : targetRect.top + targetRect.height + 18;
  const beaconLeft = Math.min(Math.max(4, rawBeaconLeft), Math.max(4, window.innerWidth - beaconSize - 4));
  const beaconTop = Math.min(Math.max(4, rawBeaconTop), Math.max(4, window.innerHeight - beaconSize - 4));
  const badgeLeft = Math.min(Math.max(12, rawBadgeLeft), Math.max(12, window.innerWidth - badgeWidthEstimate - 12));
  const badgeTop = Math.min(Math.max(12, rawBadgeTop), Math.max(12, window.innerHeight - badgeHeightEstimate - 12));
  const cueLeft = Math.min(Math.max(76, rawCueLeft), Math.max(76, window.innerWidth - 76));
  const cueTop = Math.min(Math.max(18, rawCueTop), Math.max(18, window.innerHeight - 68));
  const cueKind = interactionKind ?? null;
  const cueLabel = interactionLabel ?? (cueKind === "drag" ? "끌어보세요" : cueKind === "drop" ? "여기로 놓아보세요" : "눌러보세요");

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
          top: `${badgeTop}px`,
          left: `${badgeLeft}px`,
        }}
      >
        {label}
      </div>
      {cueKind ? (
        <div
          className={`guide-target-cue guide-target-cue--${cueKind}`}
          style={{
            top: `${cueTop}px`,
            left: `${cueLeft}px`,
          }}
        >
          <span className="guide-target-cue-arrow" aria-hidden="true" />
          <span className="guide-target-cue-label">{cueLabel}</span>
        </div>
      ) : null}
      <div
        className="guide-target-beacon"
        style={{
          top: `${beaconTop}px`,
          left: `${beaconLeft}px`,
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
