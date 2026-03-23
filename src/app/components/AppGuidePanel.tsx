import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  GUIDE_V1_RESET_EVENT,
  advanceGuideReplay,
  dismissGuideTip,
  finishGuideReplay,
  markGuideStepVisited,
  readGuideRuntime,
  rewindGuideReplay,
  snoozeGuideFlow,
  startGuideFlow,
} from "../../domain/guidance/guideRuntime";
import { getWorkspaceGuide, type GuideStep } from "../../domain/guidance/workspaceGuide";
import { formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppButton } from "./AppButton";
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

const GUIDE_ANCHOR_SIDE_KEY = "household-webapp.guide-anchor-side";
const GUIDE_BEACON_EXIT_MS = 220;
const GUIDE_BEACON_ENTER_MS = 700;
const GUIDE_PANEL_MORPH_MS = 520;
const GUIDE_BEACON_RETURN_MS = GUIDE_BEACON_ENTER_MS;
const GUIDE_PANEL_RELOCATE_OUT_MS = 180;
const GUIDE_PANEL_RELOCATE_IN_MS = 260;

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
  if (matchesGuideTargetPath(currentPath, step.targetPath) && hasGuideTarget(step.targetSelector)) {
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
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

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
  const { clearGuideSampleData, loadGuideSampleData, state } = useAppState();
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
  const dragStartXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [panelMorphState, setPanelMorphState] = useState<PanelMorphState>(() => (forceCollapsed ? "closed" : "open"));

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
  const availableBlockingSteps = blockingSteps.filter((step) => step.available !== false);
  const completedBlockingCount = availableBlockingSteps.filter(isStepComplete).length;
  const liveCurrentStep =
    !isGuidePromptVisible && guideRuntime.flowMode === "active"
      ? availableBlockingSteps.find((step) => !isStepComplete(step)) ?? null
      : null;
  const currentStep = isReplayActive ? replaySteps[replayIndex] ?? null : liveCurrentStep;
  const currentPath = `${location.pathname || "/"}${location.search || ""}`;
  const isCurrentStepActive = currentStep ? matchesGuideTargetPath(currentPath, currentStep.targetPath) : false;
  const primaryStepTargetSelector = currentStep ? resolveStepTargetSelector(currentStep, currentPath) : null;
  const totalProgressCount = isReplayActive ? replaySteps.length : guide.totalCount;
  const completedProgressCount = isReplayActive ? replayIndex ?? 0 : isGuidePromptVisible ? 0 : completedBlockingCount;
  const progressRatio = totalProgressCount ? completedProgressCount / totalProgressCount : 1;
  const shouldShowSupportTips =
    !isGuidePromptVisible &&
    !isReplayActive &&
    guideRuntime.flowMode === "tips" &&
    completedBlockingCount >= totalProgressCount;
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
  const nextStep = currentStep && currentStepIndex >= 0 ? replaySteps[currentStepIndex + 1] ?? null : null;
  const canResumeMainGuide =
    !isReplayActive && guideRuntime.flowMode === "tips" && !primarySupportTip && completedBlockingCount < totalProgressCount;
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
    ? "메뉴와 주요 페이지를 짧게 둘러본 뒤, 카드내역 화면에서 샘플 업로드와 검토, 미분류 수정까지 직접 따라갈 수 있습니다."
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
          : nextStep
            ? `다음: ${nextStep.title}`
            : `${formatPercent(progressRatio)} 진행`
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
          : isCurrentStepActive
            ? currentStep.activeLabel ?? (currentStep.requiresTargetVisit ? "확인했습니다" : "이 위치 보기")
            : currentStep.ctaLabel
        : canResumeMainGuide
          ? "메인 가이드 시작"
          : null;
  const secondaryActionLabel = isGuidePromptVisible ? "나중에 보기" : null;
  const primaryActionVariant = primarySupportTip ? "primary" : currentStep && isCurrentStepActive ? "outlinePrimary" : "primary";

  useEffect(() => {
    if (!workspaceId || guideRuntime.replayStepIndex !== null) return;

    const newlyCompletedStepIds = guide.steps
      .filter((step) => step.completed && !guideRuntime.visitedStepIds.includes(step.id))
      .map((step) => step.id);

    if (!newlyCompletedStepIds.length) return;

    newlyCompletedStepIds.forEach((stepId) => {
      markGuideStepVisited(workspaceId, stepId);
    });
    refreshGuideRuntime();
  }, [guide.steps, guideRuntime.replayStepIndex, guideRuntime.visitedStepIds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || isReplayActive || isGuidePromptVisible) return;
    if (completedBlockingCount < totalProgressCount) return;
    clearGuideSampleData();
  }, [clearGuideSampleData, completedBlockingCount, isGuidePromptVisible, isReplayActive, totalProgressCount, workspaceId]);

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

    if (currentStep.requiresTargetVisit) {
      markGuideStepVisited(workspaceId, currentStep.id);
      refreshGuideRuntime();
      return;
    }

    scrollToGuideTarget(currentStep.targetSelector);
  };

  const handleSecondaryAction = () => {
    if (!isGuidePromptVisible) return;
    snoozeGuideFlow(workspaceId);
    refreshGuideRuntime();
    setIsCollapsed(true);
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

  const handleLoadGuideSample = () => {
    if (!canLoadGuideSample) return;
    loadGuideSampleData();
    navigate("/transactions");
  };

  const floatingGuide = (
    <>
      <GuideTargetOverlay selector={highlightSelector} label={highlightLabel} />
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
                <strong>
                  {completedProgressCount}/{totalProgressCount}
                </strong>
                {isReplayActive ? (
                  <button type="button" className="floating-guide-toggle" onClick={handleReplayStop}>
                    테스트 종료
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
            </div>
            <div className="floating-guide-body guide-panel-main">
              <div className="guide-panel-copy-block">
                <h3 className="guide-panel-title">{panelTitle}</h3>
                <p className="guide-panel-copy">{panelCopy}</p>
                <div className="small text-secondary">{panelMeta}</div>
              </div>
              {primaryActionLabel ? (
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
                  </div>
                  <div className="floating-guide-action-group-right">
                    {secondaryActionLabel ? (
                      <AppButton variant="secondary" size="sm" className="floating-guide-action" onClick={handleSecondaryAction}>
                        {secondaryActionLabel}
                      </AppButton>
                    ) : null}
                    <AppButton
                      variant={primaryActionVariant}
                      size="sm"
                      className="floating-guide-action"
                      onClick={handlePrimaryAction}
                    >
                      {primaryActionLabel}
                    </AppButton>
                  </div>
                </div>
              ) : (
                <span className="badge text-bg-success">흐름 완료</span>
              )}
            </div>

            {canLoadGuideSample ? (
              <section className="guide-support-card mt-3">
                <div>
                  <span className="section-kicker">샘플로 따라오기</span>
                  <h4>업로드 파일이 없어도 가이드를 이어갈 수 있어요</h4>
                  <p>작은 샘플 카드내역을 불러와서 업로드, 검토, 미분류 정리 단계를 직접 따라가 볼 수 있습니다.</p>
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
                  <p>{secondarySupportTip.description}</p>
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

  return createPortal(floatingGuide, document.body);
}
