import { useAppState } from "../state/AppStateProvider";
import { getActiveWorkspace, getWorkspaceScope } from "../state/selectors";

export function DeveloperPage() {
  const { createDemoWorkspace, createEmptyWorkspace, state } = useAppState();
  const activeWorkspace = getActiveWorkspace(state);
  const scope = activeWorkspace ? getWorkspaceScope(state, activeWorkspace.id) : null;

  const summary = {
    workspaces: state.workspaces.length,
    people: scope?.people.length ?? 0,
    accounts: scope?.accounts.length ?? 0,
    cards: scope?.cards.length ?? 0,
    categories: scope?.categories.length ?? 0,
    tags: scope?.tags.length ?? 0,
    transactions: scope?.transactions.length ?? 0,
    reviews: scope?.reviews.filter((item) => item.status === "open").length ?? 0,
  };

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">개발자 모드</span>
            <h2 className="section-title">상태 주입과 빠른 재현</h2>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 mb-4">
          <button className="btn btn-outline-primary" onClick={() => createEmptyWorkspace(`빈 워크스페이스 ${state.workspaces.length + 1}`)}>
            빈 워크스페이스 추가
          </button>
          <button className="btn btn-outline-dark" onClick={() => createDemoWorkspace()}>
            테스트 워크스페이스 추가
          </button>
        </div>
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
            <span className="stat-label">검토함</span>
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
