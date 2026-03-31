import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  GUIDE_V1_RESET_EVENT,
  advanceGuideReplay,
  dismissGuideTip,
  finishGuideReplay,
  finishGuideFlow,
  markGuideStepVisited,
  readGuideRuntime,
  revertGuideStepAction,
  rewindGuideReplay,
  snoozeGuideFlow,
  startGuideFlow,
} from "../../domain/guidance/guideRuntime";
import { getWorkspaceGuide, type GuideStep } from "../../domain/guidance/workspaceGuide";
import { formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppButton } from "./AppButton";
import { AppModal } from "./AppModal";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";
import { GuideBeaconScene } from "./GuideBeaconScene";
import { matchesGuideTargetPath } from "./guidePathMatch";
import { GuideTargetOverlay } from "./GuideTargetOverlay";

type GuideAnchorSide = "left" | "right";
type GuideDragSurface = "beacon" | "panel";
type PanelMorphState = "closed" | "opening" | "open" | "closing";
type BeaconMorphState = "hidden" | "entering" | "idle" | "exiting";
type PanelRelocationPhase = "out" | "in";

const LEFT_ANCHORED_GUIDE_STEP_IDS = new Set([
  "people-category-link-resize",
  "transactions-review-actions",
  "transactions-uncategorized",
  "settlements-confirm-action",
]);

const GUIDE_ANCHOR_SIDE_KEY = "household-webapp.guide-anchor-side";
const GUIDE_BEACON_EXIT_MS = 220;
const GUIDE_BEACON_ENTER_MS = 700;
const GUIDE_PANEL_MORPH_MS = 520;
const GUIDE_BEACON_RETURN_MS = GUIDE_BEACON_ENTER_MS;
const GUIDE_PANEL_RELOCATE_OUT_MS = 180;
const GUIDE_PANEL_RELOCATE_IN_MS = 260;
const GUIDE_HIGHLIGHT_CHANGE_EVENT = "household-webapp:guide-highlight-change";

function isGuideDragBlocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, select, textarea, summary, [role='button']"));
}

function clearGuideSelection() {
  if (typeof window === "undefined") return;
  window.getSelection()?.removeAllRanges();
}

function hasGuideTarget(selector?: string | null) {
  if (!selector || typeof document === "undefined") return false;
  return Boolean(document.querySelector(selector));
}

function resolveStepTargetSelector(step: GuideStep, currentPath: string) {
  const shouldPreferExactTarget = Boolean(step.interactionKind);

  if (matchesGuideTargetPath(currentPath, step.targetPath) && hasGuideTarget(step.targetSelector)) {
    return step.targetSelector;
  }

  if (matchesGuideTargetPath(currentPath, step.targetPath) && shouldPreferExactTarget) {
    return step.targetSelector;
  }

  if (step.fallbackSelector && hasGuideTarget(step.fallbackSelector)) {
    return step.fallbackSelector;
  }

  return matchesGuideTargetPath(currentPath, step.targetPath) ? step.targetSelector : step.fallbackSelector ?? null;
}

function scrollToGuideTarget(selector?: string | null) {
  if (!selector || typeof document === "undefined") return;
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;

  const topbar = document.querySelector<HTMLElement>(".app-topbar");
  const topbarHeight = topbar?.getBoundingClientRect().height ?? 0;
  const viewportPadding = 20;
  const targetRect = target.getBoundingClientRect();
  const absoluteTargetTop = window.scrollY + targetRect.top;
  const availableViewportHeight = Math.max(120, window.innerHeight - topbarHeight - viewportPadding * 2);
  const desiredOffsetWithinViewport =
    targetRect.height >= availableViewportHeight
      ? viewportPadding
      : viewportPadding + Math.max(0, (availableViewportHeight - targetRect.height) / 2);
  const rawTop = absoluteTargetTop - topbarHeight - desiredOffsetWithinViewport;
  const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const nextTop = Math.min(Math.max(0, rawTop), maxTop);

  window.scrollTo({
    top: nextTop,
    behavior: "smooth",
  });
}

function renderGuideInlineRichText(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong className="guide-rich-strong" key={`${keyPrefix}-${index}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>;
  });
}

function splitLeadSentence(text: string) {
  const match = text.match(/^(.+?[.!?])(\s+|$)([\s\S]*)$/);
  if (!match) {
    return { lead: text.trim(), rest: "" };
  }

  return {
    lead: match[1].trim(),
    rest: match[3].trim(),
  };
}

function renderGuideRichText(text: string, options?: { emphasizeLeadSentence?: boolean }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, index) => {
    const paragraphKey = `guide-rich-paragraph-${index}`;
    const shouldEmphasizeLead = Boolean(options?.emphasizeLeadSentence) && !paragraph.includes("**");

    if (!shouldEmphasizeLead) {
      return (
        <span className="guide-rich-paragraph" key={paragraphKey}>
          {renderGuideInlineRichText(paragraph, paragraphKey)}
        </span>
      );
    }

    const { lead, rest } = splitLeadSentence(paragraph);
    return (
      <span className="guide-rich-paragraph" key={paragraphKey}>
        <strong className="guide-rich-lead">{lead}</strong>
        {rest ? <> {renderGuideInlineRichText(rest, `${paragraphKey}-rest`)}</> : null}
      </span>
    );
  });
}

const GUIDE_RESTORABLE_ACTION_STEP_IDS = new Set(["transactions-review-actions", "transactions-uncategorized"]);

export function AppGuidePanel({
  beaconState = "idle",
  showBeacon = true,
  expandSignal = 0,
  forceCollapsed = false,
}: {
  beaconState?: "hidden" | "entering" | "idle" | "exiting";
  showBeacon?: boolean;
  expandSignal?: number;
  forceCollapsed?: boolean;
}) {
  const { clearGuideSampleData, loadGuideSampleData, restoreGuideActionState, state } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = state.activeWorkspaceId;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [anchorSide, setAnchorSide] = useState<GuideAnchorSide>(() => {
    if (typeof window === "undefined") return "right";
    const stored = window.localStorage.getItem(GUIDE_ANCHOR_SIDE_KEY);
    return stored === "left" ? "left" : "right";
  });
  const [dragTargetSide, setDragTargetSide] = useState<GuideAnchorSide | null>(null);
  const [dragSurface, setDragSurface] = useState<GuideDragSurface | null>(null);
  const [panelRelocationPhase, setPanelRelocationPhase] = useState<PanelRelocationPhase | null>(null);
  const [overrideBeaconState, setOverrideBeaconState] = useState<BeaconMorphState | null>(null);
  const [guideRuntime, setGuideRuntime] = useState<ReturnType<typeof readGuideRuntime>>(() =>
    workspaceId
      ? readGuideRuntime(workspaceId)
      : { flowMode: "prompt", replayStepIndex: null, visitedStepIds: [], dismissedTipIds: [], replaySnapshot: null },
  );
  const relocationTimersRef = useRef<number[]>([]);
  const panelMorphTimersRef = useRef<number[]>([]);
  const panelRelocationTimersRef = useRef<number[]>([]);
  const autoScrollKeyRef = useRef<string | null>(null);
  const guideSampleModeRef = useRef<"sample" | "live" | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [panelMorphState, setPanelMorphState] = useState<PanelMorphState>(() => (forceCollapsed ? "closed" : "open"));
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);

  const guide = useMemo(() => {
    if (!workspaceId) return null;
    return getWorkspaceGuide(state, workspaceId);
  }, [state, workspaceId]);
  const workspaceScope = useMemo(() => {
    if (!workspaceId) return null;
    return getWorkspaceScope(state, workspaceId);
  }, [state, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setGuideRuntime(readGuideRuntime(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) return;

    const handleGuideReset = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId && detail.workspaceId !== workspaceId) return;
      setGuideRuntime(readGuideRuntime(workspaceId));
    };

    window.addEventListener(GUIDE_V1_RESET_EVENT, handleGuideReset as EventListener);
    return () => window.removeEventListener(GUIDE_V1_RESET_EVENT, handleGuideReset as EventListener);
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const syncViewport = () => {
      setIsCollapsed(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!expandSignal) return;
    setIsCollapsed(false);
  }, [expandSignal]);

  useEffect(() => {
    if (!forceCollapsed) return;
    setIsCollapsed(true);
  }, [forceCollapsed]);

  useEffect(() => {
    return () => {
      relocationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      relocationTimersRef.current = [];
      panelMorphTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      panelMorphTimersRef.current = [];
      panelRelocationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      panelRelocationTimersRef.current = [];
    };
  }, []);

  if (!guide || !workspaceId) return null;

  const refreshGuideRuntime = () => {
    setGuideRuntime(readGuideRuntime(workspaceId));
  };

  const isStepComplete = (step: GuideStep) => {
    return guideRuntime.visitedStepIds.includes(step.id) || step.completed;
  };

  const replaySteps = guide.steps;
  const replayIndex =
    guideRuntime.replayStepIndex !== null &&
    guideRuntime.replayStepIndex >= 0 &&
    guideRuntime.replayStepIndex < replaySteps.length
      ? guideRuntime.replayStepIndex
      : null;
  const isReplayActive = replayIndex !== null;
  const isGuidePromptVisible = !isReplayActive && guideRuntime.flowMode === "prompt";
  const blockingSteps = guide.steps.filter((step) => step.blocking !== false);
  const actionableBlockingSteps = blockingSteps.filter((step) => step.available !== false);
  const totalBlockingCount = blockingSteps.length;
  const visitedBlockingCount = blockingSteps.filter((step) => guideRuntime.visitedStepIds.includes(step.id)).length;
  const completedBlockingCount = blockingSteps.filter(isStepComplete).length;
  const liveCurrentStep =
    !isGuidePromptVisible && guideRuntime.flowMode === "active"
      ? actionableBlockingSteps.find((step) => !isStepComplete(step)) ?? null
      : null;
  const currentStep = isReplayActive ? replaySteps[replayIndex] ?? null : liveCurrentStep;
  const currentLiveStepIndex = currentStep ? actionableBlockingSteps.findIndex((step) => step.id === currentStep.id) : -1;
  const previousLiveStep = currentLiveStepIndex > 0 ? actionableBlockingSteps[currentLiveStepIndex - 1] ?? null : null;
  const currentPath = `${location.pathname || "/"}${location.search || ""}`;
  const isCurrentStepActive = currentStep ? matchesGuideTargetPath(currentPath, currentStep.targetPath) : false;
  const primaryStepTargetSelector = currentStep ? resolveStepTargetSelector(currentStep, currentPath) : null;
  const totalProgressCount = isReplayActive ? replaySteps.length : totalBlockingCount;
  const isMainGuideComplete = !isReplayActive && completedBlockingCount >= totalBlockingCount;
  const isMainGuideFinished = !isReplayActive && guideRuntime.flowMode === "completed";
  const canInterruptMainGuide = !isReplayActive && !isGuidePromptVisible && guideRuntime.flowMode === "active" && !isMainGuideComplete;
  const completedProgressCount = isReplayActive
    ? replayIndex ?? 0
    : isGuidePromptVisible
      ? 0
      : isMainGuideComplete
        ? totalBlockingCount
        : Math.min(totalBlockingCount, visitedBlockingCount);
  const displayProgressCount = isReplayActive
    ? Math.min(totalProgressCount, Math.max(1, (replayIndex ?? 0) + 1))
    : isGuidePromptVisible
      ? Math.min(totalProgressCount, 1)
      : isMainGuideComplete || isMainGuideFinished
        ? totalProgressCount
        : currentLiveStepIndex >= 0
          ? Math.min(totalProgressCount, currentLiveStepIndex + 1)
          : Math.min(totalProgressCount, Math.max(1, completedProgressCount));
  const progressRatio = totalProgressCount ? completedProgressCount / totalProgressCount : 1;
  const shouldShowSupportTips =
    !isGuidePromptVisible &&
    !isReplayActive &&
    guideRuntime.flowMode === "tips" &&
    completedBlockingCount >= totalBlockingCount;
  const orderedSupportTips = !shouldShowSupportTips
    ? []
    : [...guide.supportTips]
        .filter((tip) => !guideRuntime.dismissedTipIds.includes(tip.id))
        .sort((left, right) => Number(Boolean(right.targetPath)) - Number(Boolean(left.targetPath)));
  const activeSupportTip =
    orderedSupportTips.find((tip) => {
      if (tip.targetPath && !matchesGuideTargetPath(currentPath, tip.targetPath)) return false;
      return hasGuideTarget(tip.targetSelector);
    }) ?? null;
  const primarySupportTip = activeSupportTip && (!currentStep || !isCurrentStepActive) ? activeSupportTip : null;
  const secondarySupportTip = activeSupportTip && currentStep && isCurrentStepActive ? activeSupportTip : null;
  const highlightSelector = isGuidePromptVisible ? null : primarySupportTip ? primarySupportTip.targetSelector : primaryStepTargetSelector;
  const highlightLabel = isGuidePromptVisible ? "가이드 시작" : primarySupportTip?.title ?? currentStep?.title ?? "가이드";
  const currentStepIndex = currentStep ? replaySteps.findIndex((step) => step.id === currentStep.id) : -1;
  const canResumeMainGuide =
    !isReplayActive && guideRuntime.flowMode === "tips" && !primarySupportTip && completedBlockingCount < totalBlockingCount;
  const canRestartMainGuide = isMainGuideFinished && !primarySupportTip;
  const canLoadGuideSample = Boolean(
    currentStep?.id === "transactions-upload" &&
      workspaceScope &&
      workspaceScope.transactions.length === 0 &&
      workspaceScope.imports.length === 0,
  );
  const isPanelCollapsed = forceCollapsed || isCollapsed;
  const activeBeaconState = overrideBeaconState ?? beaconState;
  const shouldRenderBeacon = showBeacon && activeBeaconState !== "hidden";
  const isRelocating = overrideBeaconState === "entering" || overrideBeaconState === "exiting";
  const shouldRenderPanel = !isRelocating && panelMorphState !== "closed";
  const floatingPanelStyle =
    anchorSide === "left"
      ? { ...getMotionStyle(0), left: "2.5rem", right: "auto" }
      : { ...getMotionStyle(0), right: "2.5rem" };
  const floatingFabStyle =
    anchorSide === "left"
      ? { left: "0.35rem", right: "auto", bottom: "0.2rem" }
      : undefined;
  const oppositeAnchorSide: GuideAnchorSide = anchorSide === "left" ? "right" : "left";
  const activeInteractionKind = currentStep?.interactionKind ?? null;
  const activeInteractionLabel = currentStep?.interactionLabel ?? null;
  const activeInteractionSelectors = currentStep?.allowedInteractionSelectors ?? (primaryStepTargetSelector ? [primaryStepTargetSelector] : []);

  const panelTitle = isGuidePromptVisible
    ? "짧은 튜토리얼을 시작할까요?"
    : primarySupportTip
      ? primarySupportTip.title
      : currentStep
        ? currentStep.title
        : canResumeMainGuide
          ? "메인 가이드를 다시 시작할 수 있어요"
          : "기본 가이드가 완료되었습니다.";
  const panelCopy = isGuidePromptVisible
    ? "메뉴와 주요 페이지를 짧게 둘러본 뒤, 결제내역 화면에서 샘플 업로드와 검토, 미분류 수정까지 직접 따라갈 수 있습니다."
    : primarySupportTip
      ? primarySupportTip.description
      : currentStep
        ? currentStep.description
        : canResumeMainGuide
          ? "지금은 비콘 중심 안내만 남겨둔 상태입니다. 준비되면 메인 가이드를 다시 이어서 볼 수 있습니다."
          : "이제는 필요할 때 편의 기능 팁만 확인하면 됩니다.";
  const panelMeta = isGuidePromptVisible
    ? "원하지 않으면 나중에 보고 비콘만 남겨둘 수 있습니다."
    : primarySupportTip
      ? primarySupportTip.tips[0] ?? "이 기능은 필요할 때만 확인해도 됩니다."
      : currentStep
        ? isReplayActive
          ? "실제 데이터는 건드리지 않고 단계만 테스트합니다. 종료하면 실제 진행 상태로 돌아갑니다."
          : ""
        : canResumeMainGuide
          ? "소개 흐름을 멈춘 상태라서, 원할 때 다시 시작할 수 있습니다."
          : "메인 흐름은 끝났고, 편의 기능 팁은 페이지에 따라 이어집니다.";
  const primaryActionLabel = isGuidePromptVisible
    ? "튜토리얼 시작"
    : primarySupportTip
      ? primarySupportTip.ctaLabel ?? "알겠어요"
      : currentStep
        ? isReplayActive
          ? isCurrentStepActive
            ? currentStepIndex >= replaySteps.length - 1
              ? "가이드 종료"
              : "다음 단계"
            : currentStep.ctaLabel
          : currentStep.interactionKind && isCurrentStepActive
            ? null
            : isCurrentStepActive
            ? currentStep.activeLabel ?? (currentStep.requiresTargetVisit ? "확인했습니다" : "이 위치 보기")
            : currentStep.ctaLabel
        : canResumeMainGuide
          ? "메인 가이드 시작"
          : null;
  const secondaryActionLabel = isGuidePromptVisible
    ? "나중에 보기"
    : previousLiveStep && !isReplayActive && !isMainGuideComplete && guideRuntime.flowMode === "active"
      ? "이전"
      : null;
  const primaryActionVariant = primarySupportTip ? "primary" : currentStep && isCurrentStepActive ? "outlinePrimary" : "primary";
  const displayPrimaryActionLabel = canRestartMainGuide && !primaryActionLabel ? "튜토리얼 다시 시작" : primaryActionLabel;
  const hasActionGroup = Boolean(displayPrimaryActionLabel || secondaryActionLabel || isReplayActive);
  const passiveActionStatusLabel = currentStep?.interactionKind ? "직접 해보는 단계" : "안내 완료";

  useEffect(() => {
    if (!currentStep?.interactionKind || !activeInteractionSelectors.length || typeof document === "undefined") return;

    const isAllowedInteractionTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('[data-guide-anchor="panel"], [data-guide-anchor="fab"]')) return true;
      return activeInteractionSelectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some((element) => element === target || element.contains(target)),
      );
    };

    const blockInteraction = (event: Event) => {
      if (isAllowedInteractionTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    document.addEventListener("click", blockInteraction, true);
    document.addEventListener("pointerdown", blockInteraction, true);
    document.addEventListener("dragstart", blockInteraction, true);

    return () => {
      document.removeEventListener("click", blockInteraction, true);
      document.removeEventListener("pointerdown", blockInteraction, true);
      document.removeEventListener("dragstart", blockInteraction, true);
    };
  }, [activeInteractionSelectors, currentStep?.interactionKind]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent(GUIDE_HIGHLIGHT_CHANGE_EVENT, {
        detail: {
          selector: highlightSelector,
          stepId: currentStep?.id ?? null,
        },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(GUIDE_HIGHLIGHT_CHANGE_EVENT, {
          detail: {
            selector: null,
            stepId: currentStep?.id ?? null,
          },
        }),
      );
    };
  }, [currentStep?.id, highlightSelector]);

  useEffect(() => {
    if (!workspaceId) return;

    guideSampleModeRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;

    const shouldUseGuideSample = isReplayActive || (guideRuntime.flowMode === "active" && !isMainGuideComplete);
    const shouldRestoreLiveData =
      !shouldUseGuideSample &&
      (guideRuntime.flowMode === "prompt" || guideRuntime.flowMode === "tips" || guideRuntime.flowMode === "completed" || isMainGuideComplete);
    const nextGuideSampleMode = shouldUseGuideSample ? "sample" : shouldRestoreLiveData ? "live" : null;

    if (guideSampleModeRef.current === nextGuideSampleMode) return;
    guideSampleModeRef.current = nextGuideSampleMode;

    if (nextGuideSampleMode === "sample") {
      loadGuideSampleData();
      return;
    }

    if (nextGuideSampleMode === "live") {
      clearGuideSampleData();
    }
  }, [clearGuideSampleData, guideRuntime.flowMode, isMainGuideComplete, isReplayActive, loadGuideSampleData, workspaceId]);

  useEffect(() => {
    if (!workspaceId || isReplayActive) return;
    if (guideRuntime.flowMode !== "active" || !isMainGuideComplete) return;

    clearGuideSampleData();
    finishGuideFlow(workspaceId);
    navigate("/dashboard");
    setIsCompletionModalOpen(true);
    refreshGuideRuntime();
  }, [clearGuideSampleData, finishGuideFlow, guideRuntime.flowMode, isMainGuideComplete, isReplayActive, navigate, workspaceId]);

  useEffect(() => {
    if (isGuidePromptVisible || !currentStep || !isCurrentStepActive || !primaryStepTargetSelector) {
      autoScrollKeyRef.current = null;
      return;
    }

    const autoScrollKey = `${currentStep.id}:${currentPath}:${primaryStepTargetSelector}`;
    if (autoScrollKeyRef.current === autoScrollKey) return;

    autoScrollKeyRef.current = autoScrollKey;
    let frameA = 0;
    let frameB = 0;

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        scrollToGuideTarget(primaryStepTargetSelector);
      });
    });

    return () => {
      if (frameA) window.cancelAnimationFrame(frameA);
      if (frameB) window.cancelAnimationFrame(frameB);
    };
  }, [currentPath, currentStep, isCurrentStepActive, isGuidePromptVisible, primaryStepTargetSelector]);

  useEffect(() => {
    if (isRelocating) {
      setPanelMorphState("closed");
      return;
    }

    if (isPanelCollapsed) {
      if (panelMorphState === "closed") {
        if (overrideBeaconState === "hidden") {
          panelMorphTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
          panelMorphTimersRef.current = [];
          setOverrideBeaconState("entering");
          panelMorphTimersRef.current = [
            window.setTimeout(() => {
              setOverrideBeaconState(null);
            }, GUIDE_BEACON_ENTER_MS),
          ];
        }
        return;
      }

      if (panelMorphState === "closing") return;

      panelMorphTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      panelMorphTimersRef.current = [];
      setPanelMorphState("closing");
      setOverrideBeaconState("hidden");
      panelMorphTimersRef.current = [
        window.setTimeout(() => {
          setPanelMorphState("closed");
          setOverrideBeaconState("entering");
        }, GUIDE_PANEL_MORPH_MS),
        window.setTimeout(() => {
          setOverrideBeaconState(null);
        }, GUIDE_PANEL_MORPH_MS + GUIDE_BEACON_RETURN_MS),
      ];
      return;
    }

    if (panelMorphState === "open" || panelMorphState === "opening") return;

    if (activeBeaconState === "hidden") {
      panelMorphTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      panelMorphTimersRef.current = [];
      setPanelMorphState("opening");
      panelMorphTimersRef.current = [
        window.setTimeout(() => {
          setPanelMorphState("open");
        }, GUIDE_PANEL_MORPH_MS),
      ];
      return;
    }

    panelMorphTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    panelMorphTimersRef.current = [];
    setOverrideBeaconState("exiting");
    panelMorphTimersRef.current = [
      window.setTimeout(() => {
        setOverrideBeaconState("hidden");
        setPanelMorphState("opening");
      }, GUIDE_BEACON_EXIT_MS),
      window.setTimeout(() => {
        setPanelMorphState("open");
      }, GUIDE_BEACON_EXIT_MS + GUIDE_PANEL_MORPH_MS),
    ];
  }, [activeBeaconState, isPanelCollapsed, isRelocating, overrideBeaconState, panelMorphState]);

  const relocateBeacon = (targetSide: GuideAnchorSide) => {
    if (targetSide === anchorSide || isRelocating) return;

    const shouldRestorePanel = !isPanelCollapsed;
    relocationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    relocationTimersRef.current = [];

    if (shouldRestorePanel) {
      setIsCollapsed(true);
    }

    setOverrideBeaconState("exiting");

    relocationTimersRef.current.push(
      window.setTimeout(() => {
        setAnchorSide(targetSide);
        window.localStorage.setItem(GUIDE_ANCHOR_SIDE_KEY, targetSide);
        setOverrideBeaconState("entering");
      }, GUIDE_BEACON_EXIT_MS),
    );

    relocationTimersRef.current.push(
      window.setTimeout(() => {
        setOverrideBeaconState(null);
      }, GUIDE_BEACON_EXIT_MS + GUIDE_BEACON_ENTER_MS),
    );

    if (shouldRestorePanel) {
      relocationTimersRef.current.push(
        window.setTimeout(() => {
          setIsCollapsed(false);
        }, GUIDE_BEACON_EXIT_MS + GUIDE_BEACON_ENTER_MS + 220),
      );
    }
  };

  const relocatePanel = (targetSide: GuideAnchorSide) => {
    if (targetSide === anchorSide || isRelocating || panelRelocationPhase) return;

    panelRelocationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    panelRelocationTimersRef.current = [];
    setPanelRelocationPhase("out");

    panelRelocationTimersRef.current.push(
      window.setTimeout(() => {
        setAnchorSide(targetSide);
        window.localStorage.setItem(GUIDE_ANCHOR_SIDE_KEY, targetSide);
        setPanelRelocationPhase("in");
      }, GUIDE_PANEL_RELOCATE_OUT_MS),
    );

    panelRelocationTimersRef.current.push(
      window.setTimeout(() => {
        setPanelRelocationPhase(null);
      }, GUIDE_PANEL_RELOCATE_OUT_MS + GUIDE_PANEL_RELOCATE_IN_MS),
    );
  };

  useEffect(() => {
    if (isPanelCollapsed || isReplayActive || isGuidePromptVisible || !currentStep || !isCurrentStepActive) return;

    const targetSide: GuideAnchorSide = LEFT_ANCHORED_GUIDE_STEP_IDS.has(currentStep.id) ? "left" : "right";
    if (targetSide !== anchorSide) {
      relocatePanel(targetSide);
    }
  }, [anchorSide, currentStep, isCurrentStepActive, isGuidePromptVisible, isPanelCollapsed, isReplayActive, panelRelocationPhase]);

  const beginGuideDrag = (event: ReactPointerEvent<HTMLElement>, surface: GuideDragSurface) => {
    if (surface === "panel") {
      event.preventDefault();
      clearGuideSelection();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartXRef.current = event.clientX;
    isDraggingRef.current = false;
    setDragSurface(surface);
    setDragTargetSide(null);
  };

  const handleBeaconPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    beginGuideDrag(event, "beacon");
  };

  const handlePanelPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || panelRelocationPhase || isGuideDragBlocked(event.target)) return;
    beginGuideDrag(event, "panel");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStartXRef.current === null) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 16) {
      if (dragSurface === "panel") {
        clearGuideSelection();
      }
      isDraggingRef.current = true;
      setDragTargetSide(event.clientX < window.innerWidth / 2 ? "left" : "right");
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStartXRef.current === null) return;

    const dragged = isDraggingRef.current;
    const sourceSurface = dragSurface;
    dragStartXRef.current = null;
    isDraggingRef.current = false;
    setDragSurface(null);
    setDragTargetSide(null);
    clearGuideSelection();

    if (!dragged) return;

    suppressClickRef.current = true;
    const nextSide: GuideAnchorSide = event.clientX < window.innerWidth / 2 ? "left" : "right";
    if (sourceSurface === "panel") {
      relocatePanel(nextSide);
      return;
    }
    relocateBeacon(nextSide);
  };

  const handleBeaconClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isRelocating || panelRelocationPhase) return;
    setIsCollapsed((current) => !current);
  };

  const handlePrimaryAction = () => {
    if (isGuidePromptVisible || canResumeMainGuide) {
      startGuideFlow(workspaceId);
      refreshGuideRuntime();
      return;
    }

    if (canRestartMainGuide) {
      startGuideFlow(workspaceId);
      refreshGuideRuntime();
      return;
    }

    if (primarySupportTip) {
      dismissGuideTip(workspaceId, primarySupportTip.id);
      refreshGuideRuntime();
      return;
    }

    if (!currentStep) return;

    if (isReplayActive) {
      if (!isCurrentStepActive) {
        navigate(currentStep.targetPath);
        return;
      }

      scrollToGuideTarget(currentStep.targetSelector);

      if (currentStepIndex >= replaySteps.length - 1) {
        clearGuideSampleData();
        finishGuideReplay(workspaceId);
      } else {
        advanceGuideReplay(workspaceId, replaySteps.length);
      }
      refreshGuideRuntime();
      return;
    }

    if (!isCurrentStepActive) {
      navigate(currentStep.targetPath);
      return;
    }

    if (currentStep.interactionKind) {
      scrollToGuideTarget(primaryStepTargetSelector ?? currentStep.targetSelector);
      return;
    }

    if (currentStep.requiresTargetVisit) {
      markGuideStepVisited(workspaceId, currentStep.id);
      refreshGuideRuntime();
      return;
    }

    scrollToGuideTarget(currentStep.targetSelector);
  };

  const handleSecondaryAction = () => {
    if (isGuidePromptVisible) {
      snoozeGuideFlow(workspaceId);
      refreshGuideRuntime();
      setIsCollapsed(true);
      return;
    }

    if (previousLiveStep && !isReplayActive && guideRuntime.flowMode === "active") {
      if (GUIDE_RESTORABLE_ACTION_STEP_IDS.has(previousLiveStep.id)) {
        restoreGuideActionState(workspaceId, previousLiveStep.id);
      }
      revertGuideStepAction(workspaceId, previousLiveStep.id);
      refreshGuideRuntime();
    }
  };

  const handleReplayBack = () => {
    if (!isReplayActive) return;
    rewindGuideReplay(workspaceId);
    refreshGuideRuntime();
  };

  const handleReplayStop = () => {
    if (!isReplayActive) return;
    clearGuideSampleData();
    finishGuideReplay(workspaceId);
    refreshGuideRuntime();
  };

  const handleGuideStop = () => {
    if (!canInterruptMainGuide) return;
    clearGuideSampleData();
    snoozeGuideFlow(workspaceId);
    refreshGuideRuntime();
  };

  const handleLoadGuideSample = () => {
    if (!canLoadGuideSample) return;
    loadGuideSampleData();
    navigate("/collections/card");
  };

  const floatingGuide = (
    <>
      <GuideTargetOverlay
        selector={highlightSelector}
        label={highlightLabel}
        interactionKind={activeInteractionKind}
        interactionLabel={activeInteractionLabel}
      />
      {shouldRenderPanel ? (
        <div
          className={`floating-guide-panel-shell floating-guide-panel-shell--${panelMorphState}${anchorSide === "left" ? " is-left" : ""}${
            panelRelocationPhase ? ` is-relocating-${panelRelocationPhase}` : ""
          }${
            dragSurface === "panel" ? " is-dragging-panel" : ""
          }`}
          style={floatingPanelStyle}
          data-guide-anchor="panel"
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartXRef.current = null;
            isDraggingRef.current = false;
            setDragSurface(null);
            setDragTargetSide(null);
          }}
        >
          <div className="floating-guide-panel-glow" aria-hidden="true" />
          <section className="floating-guide-panel">
            <div className="floating-guide-kicker-row">
              <span className="section-kicker">
                {isGuidePromptVisible ? "튜토리얼 제안" : primarySupportTip ? "편의 기능 안내" : isReplayActive ? "가이드 테스트" : "메인 가이드"}
              </span>
              <div className="floating-guide-kicker-actions">
                <strong>{displayProgressCount}/{totalProgressCount}</strong>
              </div>
              <div className="floating-guide-kicker-buttons">
                {isReplayActive ? (
                  <button type="button" className="floating-guide-toggle" onClick={handleReplayStop}>
                    테스트 종료
                  </button>
                ) : null}
                {canInterruptMainGuide ? (
                  <button type="button" className="floating-guide-toggle" onClick={handleGuideStop}>
                    중단
                  </button>
                ) : null}
                <button
                  type="button"
                  className="floating-guide-toggle"
                  onClick={() => setIsCollapsed(true)}
                  aria-expanded="true"
                  aria-label="가이드 닫기"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="guide-progress-bar" aria-hidden="true">
              <div className="guide-progress-fill" style={{ width: `${progressRatio * 100}%` }} />
              {!isGuidePromptVisible && !primarySupportTip ? (
                <span className="guide-progress-label">{formatPercent(progressRatio)}</span>
              ) : null}
            </div>
            <div className="floating-guide-body guide-panel-main">
              {currentStep?.illustration === "drag-drop" ? (
                <div className="guide-action-illustration" aria-hidden="true">
                  <span className="guide-action-illustration-pill">잡고 끌기</span>
                  <span className="guide-action-illustration-arrow">→</span>
                  <span className="guide-action-illustration-pill">여기에 놓기</span>
                </div>
              ) : null}
              <div className="guide-panel-copy-block">
                <h3 className="guide-panel-title">{panelTitle}</h3>
                <p className="guide-panel-copy">{renderGuideRichText(panelCopy, { emphasizeLeadSentence: true })}</p>
                {panelMeta ? <div className="small text-secondary">{renderGuideRichText(panelMeta)}</div> : null}
              </div>
              {hasActionGroup ? (
                <div className="floating-guide-action-group">
                  <div className="floating-guide-action-group-left">
                    {isReplayActive ? (
                      <AppButton
                        variant="secondary"
                        size="sm"
                        className="floating-guide-action"
                        onClick={handleReplayBack}
                        disabled={(replayIndex ?? 0) <= 0}
                      >
                        이전 단계
                      </AppButton>
                    ) : null}
                    {secondaryActionLabel ? (
                      <AppButton variant="secondary" size="sm" className="floating-guide-action" onClick={handleSecondaryAction}>
                        {secondaryActionLabel}
                      </AppButton>
                    ) : null}
                  </div>
                  <div className="floating-guide-action-group-right">
                    {displayPrimaryActionLabel ? (
                      <AppButton
                        variant={primaryActionVariant}
                        size="sm"
                        className="floating-guide-action"
                        onClick={handlePrimaryAction}
                      >
                        {displayPrimaryActionLabel}
                      </AppButton>
                    ) : null}
                  </div>
                </div>
              ) : (
                <span className="badge text-bg-light">{passiveActionStatusLabel}</span>
              )}
            </div>

            {canLoadGuideSample ? (
              <section className="guide-support-card mt-3">
                <div>
                  <span className="section-kicker">샘플로 따라오기</span>
                  <h4>업로드 파일이 없어도 가이드를 이어갈 수 있어요</h4>
                  <p>
                    {renderGuideRichText("작은 샘플 결제내역을 불러와서 **업로드**, **검토**, **미분류 정리** 단계를 직접 따라가 볼 수 있습니다.", {
                      emphasizeLeadSentence: true,
                    })}
                  </p>
                </div>
                <AppButton variant="outlinePrimary" size="sm" onClick={handleLoadGuideSample}>
                  샘플 불러오기
                </AppButton>
              </section>
            ) : null}

            {secondarySupportTip ? (
              <section className="guide-support-card">
                <div>
                  <span className="section-kicker">추가 팁</span>
                  <h4>{secondarySupportTip.title}</h4>
                  <p>{renderGuideRichText(secondarySupportTip.description, { emphasizeLeadSentence: true })}</p>
                </div>
                <AppButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    dismissGuideTip(workspaceId, secondarySupportTip.id);
                    refreshGuideRuntime();
                  }}
                >
                  {secondarySupportTip.dismissLabel ?? "확인했어요"}
                </AppButton>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}
      {shouldRenderBeacon ? (
        <button
          type="button"
          className={`floating-guide-fab${isPanelCollapsed ? " collapsed" : ""}${anchorSide === "left" ? " is-left" : ""}${
            panelMorphState === "opening" ? " is-morphing-out" : ""
          }${panelMorphState === "open" ? " is-hidden-by-panel" : ""}${panelMorphState === "closing" ? " is-morphing-in" : ""}`}
          data-guide-anchor="fab"
          style={floatingFabStyle}
          onPointerDown={handleBeaconPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartXRef.current = null;
            isDraggingRef.current = false;
            setDragSurface(null);
            setDragTargetSide(null);
          }}
          onClick={handleBeaconClick}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "가이드 열기" : "가이드 닫기"}
        >
          <span className="floating-guide-fab-beacon" aria-hidden="true">
            <GuideBeaconScene key={`floating-${anchorSide}-${activeBeaconState}`} variant="v7" state={activeBeaconState} mode="floating" />
          </span>
        </button>
      ) : null}
      {dragSurface ? (
        <div className="floating-guide-drop-targets" aria-hidden="true">
          <div
            className={`floating-guide-drop-target floating-guide-drop-target--${dragSurface} ${oppositeAnchorSide}${
              dragTargetSide === oppositeAnchorSide ? " active" : ""
            }`}
          />
        </div>
      ) : null}
    </>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {floatingGuide}
      <AppModal
        open={isCompletionModalOpen}
        title="모든 튜토리얼이 끝났습니다"
        description="이제 실제 데이터로 첫장부터 다시 둘러보거나, 필요할 때 패널에서 튜토리얼을 다시 시작할 수 있습니다."
        onClose={() => setIsCompletionModalOpen(false)}
        footer={
          <AppButton variant="primary" size="sm" onClick={() => setIsCompletionModalOpen(false)}>
            확인했어요
          </AppButton>
        }
      >
        <p className="mb-0">
          업로드, 검토, 미분류 정리, 흐름 확인, 통계, 설정까지 한 바퀴 모두 끝났습니다. 이제부터는 실제 가계부 작업을 이어가면 됩니다.
        </p>
      </AppModal>
    </>,
    document.body,
  );
}
