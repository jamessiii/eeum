import { useState } from "react";
import { getWorkspaceEntitySummary } from "../../domain/workspace/summary";
import { useAppState } from "../state/AppStateProvider";
import { getActiveWorkspace, getWorkspaceScope } from "../state/selectors";

type DeveloperPageProps = {
  onLockDeveloperMode: () => void;
};

export function DeveloperPage({ onLockDeveloperMode }: DeveloperPageProps) {
  const { createDemoWorkspace, createEmptyWorkspace, state } = useAppState();
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
        <p className="text-secondary mb-4">
          테스트 워크스페이스 생성과 현재 상태 확인을 빠르게 할 수 있습니다. 잠금 해제 뒤에만 메뉴가 노출됩니다.
        </p>
        <div className="d-flex flex-wrap gap-2 mb-4">
          <button className="btn btn-outline-primary" disabled={isCreatingWorkspace} onClick={handleCreateEmptyWorkspace}>
            빈 워크스페이스 추가
          </button>
          <button
            className="btn btn-outline-secondary"
            disabled={isCreatingWorkspace}
            onClick={() => void handleCreateDemoWorkspace()}
          >
            테스트 워크스페이스 추가
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
            <span className="section-kicker">디버그</span>
            <h2 className="section-title">활성 워크스페이스 상태</h2>
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
