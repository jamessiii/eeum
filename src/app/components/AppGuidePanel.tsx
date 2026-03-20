import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getWorkspaceGuide } from "../../domain/guidance/workspaceGuide";
import { getJourneyProgress, getUpcomingJourneySteps } from "../../domain/journey/progress";
import { formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { GuideBeaconScene } from "./GuideBeaconScene";
import { matchesGuideTargetPath } from "./guidePathMatch";

type GuideAnchorSide = "left" | "right";
type PanelMorphState = "closed" | "opening" | "open" | "closing";
type BeaconMorphState = "hidden" | "entering" | "idle" | "exiting";

const GUIDE_ANCHOR_SIDE_KEY = "household-webapp.guide-anchor-side";
const GUIDE_BEACON_EXIT_MS = 220;
const GUIDE_BEACON_ENTER_MS = 700;
const GUIDE_PANEL_MORPH_MS = 520;
const GUIDE_BEACON_RETURN_MS = GUIDE_BEACON_ENTER_MS;

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
  const { state } = useAppState();
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
  const [overrideBeaconState, setOverrideBeaconState] = useState<BeaconMorphState | null>(null);
  const relocationTimersRef = useRef<number[]>([]);
  const panelMorphTimersRef = useRef<number[]>([]);
  const dragStartXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [panelMorphState, setPanelMorphState] = useState<PanelMorphState>(() => (forceCollapsed ? "closed" : "open"));

  const guide = useMemo(() => {
    if (!workspaceId) return null;
    return getWorkspaceGuide(state, workspaceId);
  }, [state, workspaceId]);

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
    };
  }, []);

  if (!guide) return null;

  const isPanelCollapsed = forceCollapsed || isCollapsed;
  const activeBeaconState = overrideBeaconState ?? beaconState;
  const shouldRenderBeacon = showBeacon && activeBeaconState !== "hidden";
  const isRelocating = overrideBeaconState === "entering" || overrideBeaconState === "exiting";
  const shouldRenderPanel = !isRelocating && panelMorphState !== "closed";
  const currentStep = guide.currentStep;
  const journeyProgress = getJourneyProgress(guide.steps);
  const completedSteps = journeyProgress.completedCount;
  const totalSteps = journeyProgress.totalCount;
  const currentPath = `${location.pathname || "/"}${location.search || ""}`;
  const upcomingSteps = getUpcomingJourneySteps(guide.steps, 2);
  const isCurrentStepActive = currentStep ? matchesGuideTargetPath(currentPath, currentStep.targetPath) : false;
  const floatingPanelStyle =
    anchorSide === "left"
      ? { ...getMotionStyle(0), left: "2.5rem", right: "auto" }
      : { ...getMotionStyle(0), right: "2.5rem" };
  const floatingFabStyle =
    anchorSide === "left"
      ? { left: "0.35rem", right: "auto", bottom: "0.2rem" }
      : undefined;

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartXRef.current = event.clientX;
    isDraggingRef.current = false;
    setDragTargetSide(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current === null) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 16) {
      isDraggingRef.current = true;
      setDragTargetSide(event.clientX < window.innerWidth / 2 ? "left" : "right");
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current === null) return;

    const dragged = isDraggingRef.current;
    dragStartXRef.current = null;
    isDraggingRef.current = false;
    setDragTargetSide(null);

    if (!dragged) return;

    suppressClickRef.current = true;
    const nextSide: GuideAnchorSide = event.clientX < window.innerWidth / 2 ? "left" : "right";
    relocateBeacon(nextSide);
  };

  const handleBeaconClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isRelocating) return;
    setIsCollapsed((current) => !current);
  };

  return (
    <>
      {shouldRenderPanel ? (
        <div
          className={`floating-guide-panel-shell floating-guide-panel-shell--${panelMorphState}${anchorSide === "left" ? " is-left" : ""}`}
          style={floatingPanelStyle}
          data-guide-anchor="panel"
        >
          <div className="floating-guide-panel-glow" aria-hidden="true" />
          <section className="floating-guide-panel">
            <div className="floating-guide-kicker-row">
              <span className="section-kicker">플로팅 가이드</span>
              <div className="floating-guide-kicker-actions">
                <strong>
                  {completedSteps}/{totalSteps}
                </strong>
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
              <div className="guide-progress-fill" style={{ width: `${journeyProgress.progress * 100}%` }} />
            </div>
            <div className="floating-guide-body">
              <div>
                <h3 className="guide-panel-title">{currentStep ? currentStep.title : "기본 준비가 완료되었습니다."}</h3>
                <p className="guide-panel-copy">
                  {currentStep ? currentStep.tips[0] ?? currentStep.description : "이제 필요한 곳을 눌러서 바로 이어보면 됩니다."}
                </p>
                <div className="small text-secondary">
                  {currentStep
                    ? upcomingSteps.length > 1
                      ? `다음: ${upcomingSteps[1]?.title}`
                      : `${formatPercent(journeyProgress.progress)} 진행`
                    : "필요할 때 다시 열어보면 됩니다."}
                </div>
              </div>
              {currentStep ? (
                <button
                  className={`btn ${isCurrentStepActive ? "btn-outline-light" : "btn-primary"} floating-guide-action`}
                  type="button"
                  onClick={() => navigate(currentStep.targetPath)}
                >
                  {isCurrentStepActive ? "현재 단계 보기" : currentStep.ctaLabel}
                </button>
              ) : (
                <span className="badge text-bg-success">기본 설정 완료</span>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {shouldRenderBeacon ? (
        <button
          type="button"
          className={`floating-guide-fab${isPanelCollapsed ? " collapsed" : ""}${anchorSide === "left" ? " is-left" : ""}${panelMorphState === "opening" ? " is-morphing-out" : ""}${panelMorphState === "open" ? " is-hidden-by-panel" : ""}${panelMorphState === "closing" ? " is-morphing-in" : ""}`}
          data-guide-anchor="fab"
          style={floatingFabStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartXRef.current = null;
            isDraggingRef.current = false;
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
      {dragTargetSide ? (
        <div className="floating-guide-drop-targets" aria-hidden="true">
          <div className={`floating-guide-drop-target left${dragTargetSide === "left" ? " active" : ""}`}>왼쪽으로 이동</div>
          <div className={`floating-guide-drop-target right${dragTargetSide === "right" ? " active" : ""}`}>오른쪽으로 이동</div>
        </div>
      ) : null}
    </>
  );
}
