import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getWorkspaceGuide } from "../../domain/guidance/workspaceGuide";
import { formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";

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
  const completedSteps = guide.steps.filter((step) => step.completed).length;
  const currentPath = location.pathname || "/";

  return (
    <section className="guide-panel" style={getMotionStyle(0)}>
      <div className="guide-panel-main">
        <div>
          <span className="section-kicker">시작 가이드</span>
          <h3 className="guide-panel-title">
            {currentStep ? currentStep.title : "기본 설정과 분류가 완료되었습니다"}
          </h3>
          <p className="guide-panel-copy">
            {currentStep
              ? currentStep.description
              : "이제 대시보드와 정산, 검토함을 중심으로 데이터를 다듬으면 됩니다."}
          </p>
        </div>
        {currentStep ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate(currentStep.targetPath)}
          >
            {currentPath === currentStep.targetPath ? "현재 이 단계 진행 중" : currentStep.ctaLabel}
          </button>
        ) : (
          <span className="badge text-bg-success">기본 흐름 완료</span>
        )}
      </div>

      <div className="guide-progress-bar" aria-hidden="true">
        <div className="guide-progress-fill" style={{ width: `${guide.progress * 100}%` }} />
      </div>

      <div className="guide-panel-meta">
        <span>{completedSteps} / {guide.steps.length} 단계 완료</span>
        <strong>{formatPercent(guide.progress)}</strong>
      </div>

      <div className="guide-step-list">
        {guide.steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`guide-step-chip${step.completed ? " completed" : ""}${currentStep?.id === step.id ? " current" : ""}`}
            style={getMotionStyle(index)}
            onClick={() => navigate(step.targetPath)}
          >
            <span>{step.title}</span>
            <small>{step.completed ? "완료" : "진행 필요"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
