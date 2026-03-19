import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getWorkspaceGuide } from "../../domain/guidance/workspaceGuide";
import { getJourneyProgress, getUpcomingJourneySteps } from "../../domain/journey/progress";
import { formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { matchesGuideTargetPath } from "./guidePathMatch";

export function AppGuidePanel() {
  const { state } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = state.activeWorkspaceId;

  const guide = useMemo(() => {
    if (!workspaceId) return null;
    return getWorkspaceGuide(state, workspaceId);
  }, [state, workspaceId]);

  if (!guide) return null;

  const currentStep = guide.currentStep;
  const journeyProgress = getJourneyProgress(guide.steps);
  const completedSteps = journeyProgress.completedCount;
  const totalSteps = journeyProgress.totalCount;
  const currentPath = `${location.pathname || "/"}${location.search || ""}`;
  const upcomingSteps = getUpcomingJourneySteps(guide.steps, 2);
  const isCurrentStepActive = currentStep ? matchesGuideTargetPath(currentPath, currentStep.targetPath) : false;

  return (
    <section className="floating-guide-panel" style={getMotionStyle(0)}>
      <div className="floating-guide-kicker-row">
        <span className="section-kicker">플로팅 가이드</span>
        <strong>
          {completedSteps}/{totalSteps}
        </strong>
      </div>
      <div className="guide-progress-bar" aria-hidden="true">
        <div className="guide-progress-fill" style={{ width: `${journeyProgress.progress * 100}%` }} />
      </div>
      <div className="floating-guide-body">
        <div>
          <h3 className="guide-panel-title">
            {currentStep ? currentStep.title : "기본 설정과 분류가 완료되었습니다"}
          </h3>
          <p className="guide-panel-copy">
            {currentStep
              ? currentStep.tips[0] ?? currentStep.description
              : "이제 필요한 화면만 오가며 계속 데이터를 다듬으면 됩니다."}
          </p>
          <div className="small text-secondary">
            {currentStep
              ? upcomingSteps.length > 1
                ? `다음 단계: ${upcomingSteps[1]?.title}`
                : `${formatPercent(journeyProgress.progress)} 진행`
              : "가이드는 필요할 때만 다시 떠오릅니다."}
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
          <span className="badge text-bg-success">기본 흐름 완료</span>
        )}
      </div>
    </section>
  );
}
