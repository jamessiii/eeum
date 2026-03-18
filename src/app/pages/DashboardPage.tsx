import { Link } from "react-router-dom";
import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { CompletionBanner } from "../components/CompletionBanner";

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

interface DashboardJourneyStep {
  key: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  completed: boolean;
}

export function DashboardPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const insights = getWorkspaceInsights(state, workspaceId);
  const hasPreparedTransactions = insights.transactionCount > 0;
  const isDiagnosisReady = insights.isDiagnosisReady;
  const journeySteps: DashboardJourneyStep[] = [
    {
      key: "import",
      title: "거래 준비",
      description: hasPreparedTransactions ? "거래 흐름이 이미 들어와 있어 검토와 분류 단계로 바로 이어갈 수 있습니다." : "엑셀 업로드나 수동 입력으로 첫 거래 흐름을 넣어야 진단이 시작됩니다.",
      to: "/imports",
      actionLabel: hasPreparedTransactions ? "거래 흐름 확인하기" : "거래 가져오기",
      completed: hasPreparedTransactions,
    },
    {
      key: "reviews",
      title: "검토함 정리",
      description: insights.reviewCount > 0 ? `${insights.reviewCount}건의 검토 후보가 남아 있습니다.` : "열린 검토 항목이 없어 다음 단계로 넘어갈 수 있습니다.",
      to: "/reviews",
      actionLabel: "검토함 열기",
      completed: insights.reviewCount === 0,
    },
    {
      key: "categories",
      title: "카테고리 정리",
      description: insights.uncategorizedCount > 0 ? `${insights.uncategorizedCount}건의 미분류 거래가 남아 있습니다.` : "미분류 거래가 없어 소비 통계를 더 믿고 볼 수 있습니다.",
      to: insights.uncategorizedCount > 0 ? "/transactions?cleanup=uncategorized" : "/categories",
      actionLabel: insights.uncategorizedCount > 0 ? "미분류 정리" : "분류 화면 보기",
      completed: insights.uncategorizedCount === 0,
    },
    {
      key: "tags",
      title: "태그 흐름 정리",
      description: insights.untaggedCount > 0 ? `${insights.untaggedCount}건의 무태그 거래를 묶으면 같은 맥락의 소비 흐름을 더 빠르게 비교할 수 있습니다.` : "무태그 거래가 없어 태그 기준 흐름도 바로 확인할 수 있습니다.",
      to: insights.untaggedCount > 0 ? "/transactions?cleanup=untagged" : "/transactions",
      actionLabel: insights.untaggedCount > 0 ? "무태그 정리" : "거래 화면 보기",
      completed: insights.untaggedCount === 0,
    },
    {
      key: "profile",
      title: "재무 기준선 설정",
      description: insights.isFinancialProfileReady ? "월 수입과 목표 저축률이 설정돼 있어 경고 단계와 가이드가 활성화됩니다." : "월 수입과 목표 저축률을 넣어야 진단 톤과 가이드가 더 정확해집니다.",
      to: "/settings",
      actionLabel: insights.isFinancialProfileReady ? "기준선 다시 보기" : "기준선 설정",
      completed: insights.isFinancialProfileReady,
    },
    {
      key: "diagnosis",
      title: "진단 확인",
      description:
        isDiagnosisReady
          ? "핵심 정리가 끝나 이번 달 진단과 저축 가이드를 비교적 안정적으로 볼 수 있습니다."
          : "검토와 분류, 태그, 기준선 설정을 마치면 진단 해석이 더 정교해집니다.",
      to: "/",
      actionLabel: "지금 대시보드 읽기",
      completed: isDiagnosisReady,
    },
  ];
  const journeyProgress = journeySteps.filter((step) => step.completed).length / journeySteps.length;
  const isJourneyReady = journeySteps.every((step) => step.completed);
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
          to: "/transactions?cleanup=uncategorized",
        }
      : null,
    insights.untaggedCount > 0
      ? {
          key: "untagged",
          title: "무태그 거래를 묶어두면 해석이 더 좋아집니다",
          description: `${insights.untaggedCount}건의 지출에 아직 태그가 없어 같은 맥락의 소비 흐름을 한 번에 보기 어렵습니다.`,
          actionLabel: "무태그 거래 정리",
          to: "/transactions?cleanup=untagged",
        }
      : null,
    insights.sharedExpenseCount > 0
      ? {
          key: "shared",
          title: "공동지출 흐름을 한 번 더 점검해보세요",
          description: `${insights.sharedExpenseCount}건의 공동지출이 있어 정산으로 이어지는 흐름을 한 번 더 확인해보면 좋습니다.`,
          actionLabel: "공동지출 점검하기",
          to: "/transactions?nature=shared",
        }
      : null,
    insights.internalTransferCount > 0
      ? {
          key: "internal-transfer",
          title: "내부이체 흐름을 모아서 점검해보세요",
          description: `${insights.internalTransferCount}건의 내부이체가 있어 소비 통계에 과하게 잡히지 않는지 다시 보면 좋습니다.`,
          actionLabel: "내부이체 점검하기",
          to: "/transactions?nature=internal_transfer",
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
          <article className="stat-card" style={getMotionStyle(5)}>
            <span className="stat-label">무태그 거래</span>
            <strong>{insights.untaggedCount}건</strong>
          </article>
        </div>

        <div className="insight-status-grid mt-4">
          <article className={`insight-status-card ${toneClass(insights.spendTone)}`} style={getMotionStyle(6)}>
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
          <article className={`insight-status-card ${toneClass(insights.savingsTone)}`} style={getMotionStyle(7)}>
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
          <article className={`insight-status-card ${toneClass(insights.fixedTone)}`} style={getMotionStyle(8)}>
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

        {isJourneyReady ? (
          <CompletionBanner
            className="mt-4"
            title="진단 준비를 마쳤습니다."
            description="검토와 카테고리, 태그, 기준선 설정까지 끝나서 이번 달 진단과 저축 가이드를 비교적 안정적으로 볼 수 있습니다."
            actions={
              <>
                <Link to="/transactions" className="btn btn-outline-primary btn-sm">
                  거래 화면 보기
                </Link>
                <Link to="/settlements" className="btn btn-outline-secondary btn-sm">
                  정산 화면 보기
                </Link>
              </>
            }
          />
        ) : null}
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

      <section className="card shadow-sm" style={getMotionStyle(2)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">전체 여정</span>
            <h2 className="section-title">지금 어디까지 정리됐는지</h2>
          </div>
          <span className="badge text-bg-dark">{Math.round(journeyProgress * 100)}%</span>
        </div>
        <div className="guide-progress">
          <div className="guide-progress-bar" aria-hidden="true">
            <div className="guide-progress-fill" style={{ width: `${journeyProgress * 100}%` }} />
          </div>
          <div className="small text-secondary mt-3">
            전체 여정 {journeySteps.length}단계 중 {journeySteps.filter((step) => step.completed).length}단계가 준비됐습니다.
          </div>
        </div>
        <div className="resource-grid mt-4">
          {journeySteps.map((step, index) => (
            <article key={step.key} className="resource-card" style={getMotionStyle(index + 3)}>
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <h3>{step.title}</h3>
                  <p className="mb-0 text-secondary">{step.description}</p>
                </div>
                <span className={`badge ${step.completed ? "text-bg-success" : "text-bg-light"}`}>{step.completed ? "완료" : "진행 중"}</span>
              </div>
              <Link to={step.to} className={`btn btn-sm mt-3 ${step.completed ? "btn-outline-secondary" : "btn-outline-primary"}`}>
                {step.actionLabel}
              </Link>
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
      ) : (
        <section className="card shadow-sm" style={getMotionStyle(2)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">정리 상태</span>
              <h2 className="section-title">지금은 비교적 안정적으로 볼 수 있습니다</h2>
            </div>
          </div>
          <CompletionBanner
            title="핵심 정리가 끝난 상태입니다"
            description="열린 검토, 미분류, 무태그, 기준선 입력까지 모두 정리돼서 이번 달 진단과 저축 흐름을 비교적 안정적으로 읽을 수 있습니다."
            actions={
              <>
                <Link to="/transactions" className="btn btn-outline-primary btn-sm">
                  거래 화면 보기
                </Link>
                <Link to="/settlements" className="btn btn-outline-secondary btn-sm">
                  정산 화면 보기
                </Link>
              </>
            }
          />
        </section>
      )}

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
