import { Link } from "react-router-dom";
import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { getJourneyProgress } from "../../domain/journey/progress";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { CompletionBanner } from "../components/CompletionBanner";
import { SourceBreakdownSection } from "../components/SourceBreakdownSection";
import { getWorkspaceScope } from "../state/selectors";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
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
  const scope = getWorkspaceScope(state, workspaceId);
  const activePeopleCount = scope.people.filter((person) => person.isActive).length;
  const ownedAccountCount = scope.accounts.filter((account) => account.ownerPersonId || account.isShared).length;
  const linkedCardCount = scope.cards.filter((card) => card.ownerPersonId && card.linkedAccountId).length;
  const unmappedAccountCount = scope.accounts.length - ownedAccountCount;
  const unmappedCardCount = scope.cards.length - linkedCardCount;
  const peopleSetupRemaining = activePeopleCount > 0 ? 0 : 1;
  const foundationRemainingCount = peopleSetupRemaining + unmappedAccountCount + unmappedCardCount;
  const hasPreparedTransactions = insights.transactionCount > 0;
  const isDiagnosisReady = insights.isDiagnosisReady;
  const importFollowUpAction = hasPreparedTransactions
    ? insights.reviewCount > 0
      ? { to: "/reviews", actionLabel: `리뷰 ${insights.reviewCount}건 확인` }
      : insights.uncategorizedCount > 0
        ? { to: "/transactions?cleanup=uncategorized", actionLabel: `미분류 ${insights.uncategorizedCount}건 정리` }
        : insights.untaggedCount > 0
          ? { to: "/transactions?cleanup=untagged", actionLabel: `무태그 ${insights.untaggedCount}건 정리` }
          : { to: "/transactions", actionLabel: "거래 화면 보기" }
    : { to: "/imports", actionLabel: "거래 가져오기" };

  const journeySteps: DashboardJourneyStep[] = [
    {
      key: "import",
      title: "거래 준비",
      description: hasPreparedTransactions ? "거래 흐름이 이미 들어와 있어 검토와 분류 단계로 바로 이어갈 수 있습니다." : "엑셀 업로드나 수동 입력으로 첫 거래 흐름을 넣어야 진단이 시작됩니다.",
      to: importFollowUpAction.to,
      actionLabel: importFollowUpAction.actionLabel,
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

  const {
    progress: journeyProgress,
    isReady: isJourneyReady,
    completedCount: journeyCompletedCount,
    totalCount: journeyTotalCount,
  } = getJourneyProgress(journeySteps);

  const nextFoundationAction =
    peopleSetupRemaining > 0
      ? { to: "/people", label: "사용자 등록하기" }
      : unmappedAccountCount > 0
        ? { to: "/accounts", label: "계좌 연결 정리" }
        : unmappedCardCount > 0
          ? { to: "/cards", label: "카드 연결 정리" }
          : null;

  const prioritizedJourneySteps = [...journeySteps]
    .sort((left, right) => Number(left.completed) - Number(right.completed))
    .slice(0, 4);

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

        <div className="resource-grid mt-4">
          {insights.headlineCards.map((card, index) => (
            <article key={card.title} className="resource-card" style={getMotionStyle(index + 6)}>
              <h3>{card.title}</h3>
              <p className="mb-0 text-secondary" title={card.description}>{card.description}</p>
            </article>
          ))}
        </div>

        <div className="insight-status-grid mt-4">
          <article className={`insight-status-card ${toneClass(insights.spendTone)}`} style={getMotionStyle(9)}>
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
          <article className={`insight-status-card ${toneClass(insights.savingsTone)}`} style={getMotionStyle(10)}>
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
          <article className={`insight-status-card ${toneClass(insights.fixedTone)}`} style={getMotionStyle(11)}>
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
          <h3>이번 달 메모</h3>
          <p className="mb-0">{insights.coaching}</p>
        </div>

        {isJourneyReady ? (
          <CompletionBanner
            className="mt-4"
            title="진단 준비를 마쳤습니다."
            description="검토와 카테고리, 태그, 기준선 설정까지 끝나서 이번 달 진단과 저축 가이드를 비교적 안정적으로 볼 수 있습니다."
            actions={
              <>
                <Link to="/settlements" className="btn btn-outline-primary btn-sm">
                  정산 화면 보기
                </Link>
                <Link to="/transactions" className="btn btn-outline-secondary btn-sm">
                  거래 화면 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 기록 보기
                </Link>
              </>
            }
          />
        ) : null}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">기반 정보</span>
            <h2 className="section-title">자산 설정 현황</h2>
          </div>
        </div>
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>
              {foundationRemainingCount
                ? `아직 ${foundationRemainingCount}개의 연결 설정이 남아 있습니다`
                : "사용자·계좌·카드 기본 연결이 모두 준비되었습니다"}
            </strong>
            <p className="mb-0 text-secondary">{foundationRemainingCount ? "사용자, 계좌, 카드 연결만 먼저 맞추면 됩니다." : "기본 연결 정리가 끝났습니다."}</p>
          </div>
          {nextFoundationAction && nextFoundationAction.to !== "/accounts" ? (
            <Link to={nextFoundationAction.to} className="btn btn-outline-primary btn-sm">
              {nextFoundationAction.label}
            </Link>
          ) : (
            <Link to="/imports" className="btn btn-outline-secondary btn-sm">
              업로드 이어서 보기
            </Link>
          )}
        </div>
        <div className="resource-grid foundation-resource-grid">
          <article className="resource-card" style={getMotionStyle(2)}>
            <h3>사용자</h3>
            <p className="mb-0 text-secondary">활성 {activePeopleCount}명 / 전체 {scope.people.length}명</p>
            <span className={`badge ${peopleSetupRemaining ? "text-bg-warning" : "text-bg-success"}`}>
              {peopleSetupRemaining ? "설정 필요" : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{peopleSetupRemaining ? "사용자 정보부터 먼저 정리해주세요" : "사용자 정보가 준비됐습니다"}</p>
            <Link to="/people" className="btn btn-outline-primary btn-sm mt-3">
              사용자 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(3)}>
            <h3>계좌</h3>
            <p className="mb-0 text-secondary">소유자 또는 공동 설정 {ownedAccountCount}개 / 전체 {scope.accounts.length}개</p>
            <span className={`badge ${unmappedAccountCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedAccountCount ? `${unmappedAccountCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedAccountCount ? "소유자 없는 계좌가 남아 있습니다" : "계좌 연결이 준비됐습니다"}</p>
            <Link to="/accounts" className="btn btn-outline-primary btn-sm mt-3">
              계좌 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(4)}>
            <h3>카드</h3>
            <p className="mb-0 text-secondary">소유자+결제계좌 연결 {linkedCardCount}개 / 전체 {scope.cards.length}개</p>
            <span className={`badge ${unmappedCardCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedCardCount ? `${unmappedCardCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedCardCount ? "카드 연결 정보가 덜 정리됐습니다" : "카드 연결이 준비됐습니다"}</p>
            <Link to="/cards" className="btn btn-outline-primary btn-sm mt-3">
              카드 관리
            </Link>
          </article>
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
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>{isJourneyReady ? "지금은 숫자 해석과 정산 확인에 집중하면 됩니다" : "아직 남은 준비 항목부터 순서대로 정리하면 됩니다"}</strong>
            <p className="mb-0 text-secondary">{isJourneyReady ? "핵심 준비가 끝났습니다." : `전체 ${journeyTotalCount}단계 중 ${journeyCompletedCount}단계 완료`}</p>
          </div>
          <Link to={isJourneyReady ? "/settlements" : journeySteps.find((step) => !step.completed)?.to ?? "/transactions"} className="btn btn-outline-secondary btn-sm">
            {isJourneyReady ? "정산 화면 보기" : "다음 단계로 이동"}
          </Link>
        </div>
        <div className="guide-progress">
          <div className="guide-progress-bar" aria-hidden="true">
            <div className="guide-progress-fill" style={{ width: `${journeyProgress * 100}%` }} />
          </div>
          <div className="small text-secondary mt-3">미완료 단계부터 우선 보여줍니다.</div>
        </div>
        <div className="resource-grid mt-4">
          {prioritizedJourneySteps.map((step, index) => (
            <article key={step.key} className="resource-card" style={getMotionStyle(index + 3)}>
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <h3>{step.title}</h3>
                  <p className="mb-0 text-secondary" title={step.description}>
                    {step.completed ? "정리됨" : "다음으로 처리할 항목"}
                  </p>
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

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(2)}>
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

        <section className="card shadow-sm" style={getMotionStyle(3)}>
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

          <SourceBreakdownSection
            items={insights.sourceBreakdown}
            emptyMessage="아직 수단 기준으로 볼 거래 데이터가 충분하지 않습니다."
            motionStartIndex={9}
          />
        </section>
      </div>
    </div>
  );
}
