import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";

export function DashboardPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const insights = getWorkspaceInsights(state, workspaceId);

  return (
    <div className="page-grid">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 진단</span>
            <h2 className="section-title">가계 상태 요약</h2>
          </div>
          <span className="badge text-bg-primary">{insights.month}</span>
        </div>
        <div className="stats-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <span className="stat-label">월 기준 순수입</span>
            <strong>{formatCurrency(insights.income)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <span className="stat-label">이번 달 소비</span>
            <strong>{formatCurrency(insights.expense)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <span className="stat-label">지출률</span>
            <strong>{formatPercent(insights.spendRate)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(4)}>
            <span className="stat-label">저축률</span>
            <strong>{formatPercent(insights.savingsRate)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(5)}>
            <span className="stat-label">고정지출</span>
            <strong>{formatCurrency(insights.fixedExpense)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(6)}>
            <span className="stat-label">공동지출</span>
            <strong>{formatCurrency(insights.sharedExpense)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(7)}>
            <span className="stat-label">검토 필요 항목</span>
            <strong>{insights.reviewCount}건</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">내부이체 후보</span>
            <strong>{insights.internalTransferCount}건</strong>
          </article>
        </div>
        <div className="coach-box mt-4">
          <h3>코칭 메모</h3>
          <p>{insights.coaching}</p>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">다음 행동</span>
            <h2 className="section-title">인앱 가이드</h2>
          </div>
        </div>
        <ul className="next-step-list">
          {insights.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <div className="guide-progress mt-4">
          <span>상위 지출 카테고리</span>
          <div className="mini-breakdown-list mt-3">
            {insights.topCategories.map((item) => (
              <div key={item.categoryName} className="mini-breakdown-row" style={getMotionStyle(2)}>
                <span>{item.categoryName}</span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
            ))}
            {!insights.topCategories.length ? <div className="text-secondary">아직 분석 가능한 지출 데이터가 없습니다.</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
