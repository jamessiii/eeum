import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
}

export function DashboardPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const insights = getWorkspaceInsights(state, workspaceId);

  return (
    <div className="page-stack">
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
            <span className="stat-label">남은 저축 여력</span>
            <strong>{formatCurrency(insights.savings)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(4)}>
            <span className="stat-label">검토 필요 항목</span>
            <strong>{insights.reviewCount}건</strong>
          </article>
        </div>

        <div className="insight-status-grid mt-4">
          <article className={`insight-status-card ${toneClass(insights.spendTone)}`} style={getMotionStyle(5)}>
            <span className="stat-label">지출률</span>
            <strong>{formatPercent(insights.spendRate)}</strong>
            <p className="mb-0 small">
              {insights.spendTone === "warning"
                ? "경고 기준을 넘은 상태입니다."
                : insights.spendTone === "caution"
                  ? "경계선에 가까운 수준입니다."
                  : "안정적인 범위 안에 있습니다."}
            </p>
          </article>
          <article className={`insight-status-card ${toneClass(insights.savingsTone)}`} style={getMotionStyle(6)}>
            <span className="stat-label">저축률</span>
            <strong>{formatPercent(insights.savingsRate)}</strong>
            <p className="mb-0 small">
              {insights.savingsTone === "warning"
                ? "목표보다 크게 부족합니다."
                : insights.savingsTone === "caution"
                  ? "목표보다 조금 낮습니다."
                  : "목표 수준을 잘 지키고 있습니다."}
            </p>
          </article>
          <article className={`insight-status-card ${toneClass(insights.fixedTone)}`} style={getMotionStyle(7)}>
            <span className="stat-label">고정지출 비중</span>
            <strong>{formatPercent(insights.fixedExpenseRate)}</strong>
            <p className="mb-0 small">
              {insights.fixedTone === "warning"
                ? "구조적인 비용 부담이 높습니다."
                : insights.fixedTone === "caution"
                  ? "고정비를 한 번 점검해볼 시점입니다."
                  : "현재는 무난한 수준입니다."}
            </p>
          </article>
        </div>

        <div className="coach-box mt-4">
          <h3>재무 코치 메모</h3>
          <p className="mb-0">{insights.coaching}</p>
        </div>
      </section>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">다음 행동</span>
              <h2 className="section-title">지금 하면 좋은 일</h2>
            </div>
          </div>
          <ul className="next-step-list">
            {insights.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(2)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">상위 지출</span>
              <h2 className="section-title">문제 가능성이 큰 영역</h2>
            </div>
          </div>
          <div className="mini-breakdown-list">
            {insights.topCategories.map((item, index) => (
              <div key={item.categoryName} className="mini-breakdown-row" style={getMotionStyle(index + 3)}>
                <span>{item.categoryName}</span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
            ))}
            {!insights.topCategories.length ? (
              <div className="text-secondary">아직 분석 가능한 지출 데이터가 충분하지 않습니다.</div>
            ) : null}
          </div>

          <div className="guide-progress mt-4">
            <span className="section-kicker">보조 지표</span>
            <div className="stats-grid mt-3">
              <article className="stat-card">
                <span className="stat-label">공동지출</span>
                <strong>{formatCurrency(insights.sharedExpense)}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">내부이체</span>
                <strong>{insights.internalTransferCount}건</strong>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
