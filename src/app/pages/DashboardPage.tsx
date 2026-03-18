import { Link } from "react-router-dom";
import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
}

interface DashboardAttentionItem {
  key: string;
  title: string;
  description: string;
  actionLabel: string;
  to: string;
}

export function DashboardPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const insights = getWorkspaceInsights(state, workspaceId);
  const attentionItems = [
    insights.reviewCount > 0
      ? {
          key: "reviews",
          title: "검토함 정리가 필요합니다",
          description: `${insights.reviewCount}건의 자동 검토 후보가 남아 있어 지출 해석이 달라질 수 있습니다.`,
          actionLabel: "검토함 열기",
          to: "/reviews",
        }
      : null,
    insights.recurringSuggestionCount > 0
      ? {
          key: "recurring",
          title: "반복 지출 제안을 먼저 적용해보세요",
          description: `${insights.recurringSuggestionCount}개의 반복 지출 후보가 있어 카테고리를 한 번에 정리할 수 있습니다.`,
          actionLabel: "분류 화면 열기",
          to: "/categories",
        }
      : null,
    insights.uncategorizedCount > 0
      ? {
          key: "uncategorized",
          title: "미분류 거래가 남아 있습니다",
          description: `${insights.uncategorizedCount}건이 아직 미분류 상태라 상위 지출 분석이 왜곡될 수 있습니다.`,
          actionLabel: "미분류 거래 정리",
          to: "/categories",
        }
      : null,
    !insights.isFinancialProfileReady
      ? {
          key: "profile",
          title: "재무 기준선 입력이 필요합니다",
          description: "월 순수입과 목표 저축률이 비어 있어 지출률과 저축률 진단이 약하게 동작하고 있습니다.",
          actionLabel: "기준선 설정하기",
          to: "/settings",
        }
      : null,
  ].filter((item): item is DashboardAttentionItem => Boolean(item));

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

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">핵심 해석</span>
            <h2 className="section-title">이번 달에 먼저 읽을 포인트</h2>
          </div>
        </div>
        <div className="resource-grid">
          {insights.headlineCards.map((card, index) => (
            <article key={card.title} className="resource-card" style={getMotionStyle(index + 2)}>
              <h3>{card.title}</h3>
              <p className="mb-0 text-secondary">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      {attentionItems.length ? (
        <section className="card shadow-sm" style={getMotionStyle(2)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">먼저 정리할 것</span>
              <h2 className="section-title">아직 숫자를 더 다듬을 수 있습니다</h2>
            </div>
          </div>
          <div className="resource-grid">
            {attentionItems.map((item, index) => (
              <article key={item.key} className="resource-card" style={getMotionStyle(index + 2)}>
                <h3>{item.title}</h3>
                <p className="mb-0 text-secondary">{item.description}</p>
                <Link to={item.to} className="btn btn-outline-primary btn-sm mt-3">
                  {item.actionLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(attentionItems.length ? 3 : 2)}>
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

        <section className="card shadow-sm" style={getMotionStyle(attentionItems.length ? 4 : 3)}>
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
          <div className="guide-progress mt-4">
            <span className="section-kicker">태그 기준 흐름</span>
            <div className="resource-grid mt-3">
              {insights.topTags.map((item, index) => (
                <article key={item.tagName} className="resource-card" style={getMotionStyle(index + 5)}>
                  <div className="d-flex align-items-center gap-2">
                    <span className="tag-pill" style={{ ["--tag-color" as string]: item.color }}>
                      {item.tagName}
                    </span>
                    <span className="small text-secondary">{item.count}건</span>
                  </div>
                  <p className="mb-0 text-secondary">이 태그가 붙은 지출 합계는 {formatCurrency(item.amount)}입니다.</p>
                </article>
              ))}
              {!insights.topTags.length ? (
                <div className="text-secondary">아직 태그가 붙은 지출이 적어 태그 흐름을 보여드리기 어렵습니다.</div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
