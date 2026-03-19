import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getWorkspaceGuide } from "../../domain/guidance/workspaceGuide";
import { useAppState } from "../state/AppStateProvider";

export function PageStepBanner() {
  const { state } = useAppState();
  const location = useLocation();
  const workspaceId = state.activeWorkspaceId;
  const currentPath = `${location.pathname || "/"}${location.search || ""}`;

  const currentStep = useMemo(() => {
    if (!workspaceId) return null;
    return getWorkspaceGuide(state, workspaceId).currentStep;
  }, [state, workspaceId]);

  if (!currentStep || currentStep.targetPath !== currentPath) return null;

  return (
    <section className="page-step-banner">
      <div>
        <span className="section-kicker">이 화면에서 할 일</span>
        <h3 className="page-step-banner-title">{currentStep.title}</h3>
        <p className="page-step-banner-copy">{currentStep.description}</p>
      </div>
      <ul className="page-step-banner-list">
        {currentStep.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="page-step-banner-foot">
        이 단계를 끝내면 시작 가이드가 자동으로 다음 단계로 이어집니다.
      </div>
    </section>
  );
}
