import { useState } from "react";
import { startGuideReplay } from "../../domain/guidance/guideRuntime";
import { getWorkspaceEntitySummary } from "../../domain/workspace/summary";
import { useAppState } from "../state/AppStateProvider";
import { getActiveWorkspace, getWorkspaceScope } from "../state/selectors";

type DeveloperPageProps = {
  onLockDeveloperMode: () => void;
};

export function DeveloperPage({ onLockDeveloperMode }: DeveloperPageProps) {
  const { createDemoWorkspace, createEmptyWorkspace, resetApp, state } = useAppState();
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const activeWorkspace = getActiveWorkspace(state);
  const scope = activeWorkspace ? getWorkspaceScope(state, activeWorkspace.id) : null;
  const summary = getWorkspaceEntitySummary(scope, state.workspaces.length);

  const handleCreateEmptyWorkspace = () => {
    setIsCreatingWorkspace(true);
    try {
      createEmptyWorkspace(`빈 워크스페이스 ${state.workspaces.length + 1}`);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleCreateDemoWorkspace = async () => {
    setIsCreatingWorkspace(true);
    try {
      await createDemoWorkspace();
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">개발자 모드</span>
            <h2 className="section-title">상태 주입과 빠른 재현</h2>
          </div>
          <button className="btn btn-outline-secondary btn-sm" onClick={onLockDeveloperMode}>
            개발자 모드 잠그기
          </button>
        </div>
        <p className="text-secondary mb-4">테스트용 워크스페이스를 만들고 현재 상태를 빠르게 확인하는 개발자 전용 화면입니다.</p>
        <div className="d-flex flex-wrap gap-2 mb-4">
          <button className="btn btn-outline-primary" disabled={isCreatingWorkspace} onClick={handleCreateEmptyWorkspace}>
            빈 워크스페이스 추가
          </button>
          <button className="btn btn-outline-secondary" disabled={isCreatingWorkspace} onClick={() => void handleCreateDemoWorkspace()}>
            데모 워크스페이스 추가
          </button>
        </div>
        {isCreatingWorkspace ? <p className="text-secondary mb-4">워크스페이스를 준비하고 있습니다.</p> : null}
        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">워크스페이스</span>
            <strong>{summary.workspaces}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">거래</span>
            <strong>{summary.transactions}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">검토 항목</span>
            <strong>{summary.reviews}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">카테고리</span>
            <strong>{summary.categories}</strong>
          </article>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">가이드 테스트</span>
            <h2 className="section-title">메인 가이드 리플레이</h2>
          </div>
        </div>
        <p className="text-secondary mb-4">메인 튜토리얼을 테스트 모드로 단계별 재생합니다. 종료하면 실제 진행 상태로 돌아옵니다.</p>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => {
            if (activeWorkspace) {
              startGuideReplay(activeWorkspace.id);
            }
          }}
          disabled={!activeWorkspace}
        >
          가이드 테스트 시작
        </button>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">위험 작업</span>
            <h2 className="section-title">데이터 초기화</h2>
          </div>
        </div>
        <p className="text-secondary mb-4">앱 전체 로컬 데이터를 초기화하는 개발자 전용 작업입니다.</p>
        <button className="btn btn-outline-danger" onClick={() => void resetApp()}>
          전체 데이터 초기화
        </button>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">디버그</span>
            <h2 className="section-title">현재 워크스페이스 상태</h2>
          </div>
        </div>
        <pre className="debug-pre">
          {JSON.stringify(
            {
              activeWorkspace,
              summary,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}
