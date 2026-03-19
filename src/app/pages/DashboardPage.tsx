import { Link } from "react-router-dom";
import { getWorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { CompletionBanner } from "../components/CompletionBanner";
import { SourceBreakdownSection } from "../components/SourceBreakdownSection";
import { getWorkspaceScope } from "../state/selectors";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
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

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 요약</span>
            <h2 className="section-title">가계 상태 요약</h2>
          </div>
          <span className="badge text-bg-primary">{insights.month}</span>
        </div>

        <div className="stats-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <span className="stat-label">월수입 기준</span>
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
            <span className="stat-label">미분류 거래</span>
            <strong>{insights.uncategorizedCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(6)}>
            <span className="stat-label">내부이체</span>
            <strong>{insights.internalTransferCount}건</strong>
          </article>
        </div>

        <div className="resource-grid mt-4">
          {insights.headlineCards.map((card, index) => (
            <article key={card.title} className="resource-card" style={getMotionStyle(index + 7)}>
              <h3>{card.title}</h3>
              <p className="mb-0 text-secondary">{card.description}</p>
            </article>
          ))}
        </div>

        <div className="insight-status-grid mt-4">
          <article className={`insight-status-card ${toneClass(insights.spendTone)}`} style={getMotionStyle(10)}>
            <span className="stat-label">지출률</span>
            <strong>{formatPercent(insights.spendRate)}</strong>
          </article>
          <article className={`insight-status-card ${toneClass(insights.savingsTone)}`} style={getMotionStyle(11)}>
            <span className="stat-label">저축률</span>
            <strong>{formatPercent(insights.savingsRate)}</strong>
          </article>
          <article className={`insight-status-card ${toneClass(insights.fixedTone)}`} style={getMotionStyle(12)}>
            <span className="stat-label">고정지출 비중</span>
            <strong>{formatPercent(insights.fixedExpenseRate)}</strong>
          </article>
        </div>

        <div className="coach-box mt-4">
          <h3>이번 달 메모</h3>
          <p className="mb-0">{insights.coaching}</p>
        </div>

        {insights.isDiagnosisReady ? (
          <CompletionBanner
            className="mt-4"
            title="대시보드 해석 준비가 끝났습니다"
            description="검토와 분류, 기준선 설정이 마무리되어 이번 달 흐름을 안정적으로 볼 수 있습니다."
            actions={
              <>
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
            <span className="section-kicker">기본 정보</span>
            <h2 className="section-title">자산 설정 현황</h2>
          </div>
        </div>
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>
              {foundationRemainingCount
                ? `아직 ${foundationRemainingCount}개의 연결 설정이 남아 있습니다`
                : "기본 연결 설정이 모두 준비되었습니다"}
            </strong>
            <p className="mb-0 text-secondary">
              {foundationRemainingCount ? "사용자, 계좌, 카드 연결만 먼저 맞추면 됩니다." : "이제 거래와 대시보드 흐름에 집중하면 됩니다."}
            </p>
          </div>
          <Link to={peopleSetupRemaining ? "/people" : unmappedAccountCount > 0 ? "/accounts" : "/cards"} className="btn btn-outline-primary btn-sm">
            설정 이어가기
          </Link>
        </div>
        <div className="resource-grid foundation-resource-grid">
          <article className="resource-card" style={getMotionStyle(2)}>
            <h3>사용자</h3>
            <p className="mb-0 text-secondary">활성 {activePeopleCount}명 / 전체 {scope.people.length}명</p>
            <span className={`badge ${peopleSetupRemaining ? "text-bg-warning" : "text-bg-success"}`}>
              {peopleSetupRemaining ? "설정 필요" : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{peopleSetupRemaining ? "사용자 정보부터 정리해 주세요." : "사용자 정보가 준비되었습니다."}</p>
            <Link to="/people" className="btn btn-outline-primary btn-sm mt-3">
              사용자 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(3)}>
            <h3>계좌</h3>
            <p className="mb-0 text-secondary">연결 완료 {ownedAccountCount}개 / 전체 {scope.accounts.length}개</p>
            <span className={`badge ${unmappedAccountCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedAccountCount ? `${unmappedAccountCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedAccountCount ? "소유자 없는 계좌가 남아 있습니다." : "계좌 정보가 준비되었습니다."}</p>
            <Link to="/accounts" className="btn btn-outline-primary btn-sm mt-3">
              계좌 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(4)}>
            <h3>카드</h3>
            <p className="mb-0 text-secondary">연결 완료 {linkedCardCount}개 / 전체 {scope.cards.length}개</p>
            <span className={`badge ${unmappedCardCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedCardCount ? `${unmappedCardCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedCardCount ? "카드 연결 정보가 덜 정리됐습니다." : "카드 정보가 준비되었습니다."}</p>
            <Link to="/cards" className="btn btn-outline-primary btn-sm mt-3">
              카드 관리
            </Link>
          </article>
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
              <div key={item.categoryName} className="mini-breakdown-row" style={getMotionStyle(index + 4)}>
                <span>{item.categoryName}</span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
            ))}
            {!insights.topCategories.length ? <div className="text-secondary">아직 분석 가능한 지출 데이터가 충분하지 않습니다.</div> : null}
          </div>

          <SourceBreakdownSection
            items={insights.sourceBreakdown}
            emptyMessage="아직 수단별 흐름을 보여줄 만큼 거래 데이터가 충분하지 않습니다."
            motionStartIndex={8}
          />
        </section>
      </div>
    </div>
  );
}
