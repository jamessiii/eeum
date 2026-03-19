import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getCategoryCleanupSummary,
  type RecurringMerchantSuggestion,
} from "../../domain/classification/suggestions";
import { getExpenseImpactStats } from "../../domain/transactions/expenseImpactStats";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { CompletionBanner } from "../components/CompletionBanner";
import { NextStepCallout } from "../components/NextStepCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const recurringConfidenceLabel = {
  high: "신뢰도 높음",
  medium: "검토 후 적용 권장",
} as const;

function getRecurringConfidenceLabel(confidence: RecurringMerchantSuggestion["confidence"]) {
  return recurringConfidenceLabel[confidence];
}

export function CategoriesPage() {
  const { addCategory, assignCategory, assignCategoryByMerchant, state } = useAppState();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [expandedSuggestionKey, setExpandedSuggestionKey] = useState<string | null>(null);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));
  const transactionMap = new Map(scope.transactions.map((transaction) => [transaction.id, transaction]));
  const {
    recurringSuggestions,
    uncategorizedTransactions,
    categorizedCount,
    remainingWorkCount,
    isCategoryCleanupComplete,
  } = getCategoryCleanupSummary(scope.transactions, scope.categories);
  const expenseStats = getExpenseImpactStats(scope.transactions);
  const expenseTransactions = expenseStats.activeExpenseTransactions;
  const classificationProgress = expenseTransactions.length ? categorizedCount / expenseTransactions.length : 0;
  const categoryUsage = new Map<string, { count: number; amount: number }>();
  for (const transaction of expenseTransactions) {
    if (!transaction.categoryId) continue;
    const current = categoryUsage.get(transaction.categoryId) ?? { count: 0, amount: 0 };
    categoryUsage.set(transaction.categoryId, {
      count: current.count + 1,
      amount: current.amount + transaction.amount,
    });
  }
  const getTransactionConnectionSummary = (transaction: { ownerPersonId: string | null; accountId: string | null; cardId: string | null }) => {
    const parts = [
      transaction.ownerPersonId ? `사용자 ${peopleMap.get(transaction.ownerPersonId) ?? "-"}` : null,
      transaction.accountId ? `계좌 ${accountMap.get(transaction.accountId) ?? "-"}` : null,
      transaction.cardId ? `카드 ${cardMap.get(transaction.cardId) ?? "-"}` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(" · ") : "연결 정보 없음";
  };
  const recurringConnectionSummary = recurringSuggestions
    .slice(0, 3)
    .map((suggestion) => {
      const referenceTransaction = suggestion.transactionIds
        .map((transactionId) => transactionMap.get(transactionId))
        .find((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction));

      if (!referenceTransaction) return null;
      return `${suggestion.merchantName}: ${getTransactionConnectionSummary(referenceTransaction)}`;
    })
    .filter(Boolean);
  const nextCategoryAction = recurringSuggestions.length
    ? {
        title: "지금 가장 먼저 할 일",
        description: `${recurringSuggestions.length}개의 반복 지출 제안을 먼저 적용하면 뒤쪽 분류 작업이 훨씬 빨라집니다.`,
        to: "#recurring-suggestions",
        actionLabel: `반복 제안 ${recurringSuggestions.length}개 보기`,
      }
    : uncategorizedTransactions.length
      ? {
          title: "지금 가장 먼저 할 일",
          description: `${uncategorizedTransactions.length}건의 미분류 거래를 먼저 줄이면 대시보드 해석이 더 빨리 살아납니다.`,
          to: "/transactions?cleanup=uncategorized",
          actionLabel: `미분류 ${uncategorizedTransactions.length}건 정리`,
        }
      : null;

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">분류 흐름</span>
            <h2 className="section-title">분류 정리</h2>
          </div>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <span className="stat-label">반복 지출 자동 제안</span>
            <strong>{recurringSuggestions.length}개</strong>
            <div className="small text-secondary mt-2">먼저 처리할 후보</div>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <span className="stat-label">미분류 거래</span>
            <strong>{uncategorizedTransactions.length}건</strong>
            <div className="small text-secondary mt-2">직접 분류 필요</div>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <span className="stat-label">남은 작업</span>
            <strong>{remainingWorkCount}건</strong>
            <div className="small text-secondary mt-2">현재 정리 대상</div>
          </article>
        </div>
        <div className="guide-progress mt-4">
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="section-kicker">전체 분류 진행률</span>
            <strong>{formatPercent(classificationProgress)}</strong>
          </div>
          <div className="guide-progress-bar mt-3" aria-hidden="true">
            <div className="guide-progress-fill" style={{ width: `${classificationProgress * 100}%` }} />
          </div>
          <div className="small text-secondary mt-3">
            실지출 거래 {expenseTransactions.length}건 중 {categorizedCount}건이 분류되었습니다. 아직 정리할 작업은 약 {remainingWorkCount}건입니다.
          </div>
        </div>
        {nextCategoryAction ? (
          <NextStepCallout
            className="mt-4"
            title={nextCategoryAction.title}
            description={nextCategoryAction.description}
            actionLabel={nextCategoryAction.actionLabel}
            to={nextCategoryAction.to}
          />
        ) : null}
        <div className="review-summary-panel mt-4">
          <div className="review-summary-copy">
            <strong>{uncategorizedTransactions.length ? "지금 바로 이어서 할 작업" : "분류 정리가 거의 끝났습니다"}</strong>
            <p className="mb-0 text-secondary">
              {uncategorizedTransactions.length
                ? "반복 제안과 미분류 거래를 먼저 줄이면 됩니다."
                : "카테고리 정리가 모두 끝났습니다."}
            </p>
          </div>
          <div className="action-row">
            {uncategorizedTransactions.length ? (
              <Link to="/transactions?cleanup=uncategorized" className="btn btn-outline-primary btn-sm">
                미분류 {uncategorizedTransactions.length}건 정리
              </Link>
            ) : null}
            <Link to="/" className="btn btn-outline-secondary btn-sm">
              대시보드 보기
            </Link>
          </div>
        </div>
        {isCategoryCleanupComplete ? (
          <CompletionBanner
            className="mt-3"
            title="카테고리 분류 정리가 끝났습니다"
            description="반복 제안과 미분류 거래가 모두 정리됐습니다."
            actions={
              <>
                <Link to="/transactions" className="btn btn-outline-secondary btn-sm">
                  거래 화면 보기
                </Link>
                <Link to="/" className="btn btn-outline-secondary btn-sm">
                  대시보드 보기
                </Link>
              </>
            }
          />
        ) : null}
      </section>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(2)} id="recurring-suggestions">
          <div className="section-head">
            <div>
              <span className="section-kicker">자동 제안</span>
              <h2 className="section-title">반복 지출 카테고리 지정</h2>
            </div>
          </div>
          {recurringConnectionSummary.length ? (
            <p className="small text-secondary mb-3">{recurringConnectionSummary.join(" / ")}</p>
          ) : null}
          <div className="review-list">
            {recurringSuggestions.map((suggestion, index) => (
              <article key={suggestion.merchantName} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">고정지출 후보</span>
                    <h3>{suggestion.merchantName}</h3>
                    <p className="mb-1 text-secondary">
                      반복 {suggestion.count}건 · {suggestion.monthCount}개월 · 평균 {formatCurrency(suggestion.amountAverage)}
                    </p>
                    <p className="mb-0 text-secondary">{suggestion.lastOccurredAt.slice(0, 10)} · 금액 편차 {Math.round(suggestion.amountSpreadRate * 100)}%</p>
                  </div>
                  <div className="compact-card-actions">
                    <span className={`badge ${suggestion.confidence === "high" ? "text-bg-primary" : "text-bg-light"}`}>
                      {getRecurringConfidenceLabel(suggestion.confidence)}
                    </span>
                    <button
                      type="button"
                      className="expand-toggle-button"
                      onClick={() =>
                        setExpandedSuggestionKey((current) => (current === suggestion.merchantName ? null : suggestion.merchantName))
                      }
                      aria-expanded={expandedSuggestionKey === suggestion.merchantName}
                      aria-label={expandedSuggestionKey === suggestion.merchantName ? "상세 접기" : "상세 펼치기"}
                    >
                      {expandedSuggestionKey === suggestion.merchantName ? "▴" : "▾"}
                    </button>
                  </div>
                </div>
                {expandedSuggestionKey === suggestion.merchantName ? (
                  <div className="compact-card-details mt-3">
                    <div className="compact-detail-grid">
                      <div>
                        <span className="section-kicker">신뢰도</span>
                        <strong>{getRecurringConfidenceLabel(suggestion.confidence)}</strong>
                      </div>
                      <div>
                        <span className="section-kicker">연결 정보</span>
                        <strong>
                          {recurringConnectionSummary.find((item) => item?.startsWith(`${suggestion.merchantName}:`))?.replace(`${suggestion.merchantName}: `, "") ??
                            "연결 정보 없음"}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : null}
                <form
                  className="classification-action-row compact-action-row mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const select = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
                    const categoryId = select?.value ?? "";
                    if (!categoryId) return;
                    assignCategoryByMerchant(workspaceId, suggestion.merchantName, categoryId);
                    form.reset();
                  }}
                >
                  <select name="categoryId" className="form-select">
                    <option value="">카테고리 선택</option>
                    {scope.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" type="submit">
                    반복 거래에 적용
                  </button>
                </form>
              </article>
            ))}
            {!recurringSuggestions.length ? (
              <p className="text-secondary mb-0">
                지금은 여러 달에 걸쳐 반복된 미분류 지출이 없습니다. 거래가 더 쌓이거나 카테고리 정보가 정리되면 후보가 자동으로 잡힙니다.
              </p>
            ) : null}
          </div>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(3)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">수동 분류</span>
              <h2 className="section-title">미분류 거래 처리</h2>
            </div>
          </div>
          <div className="review-list">
            {uncategorizedTransactions.slice(0, 20).map((transaction, index) => (
              <article key={transaction.id} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">분류 필요</span>
                    <h3>{transaction.merchantName}</h3>
                    <p className="mb-1 text-secondary">
                      {transaction.occurredAt.slice(0, 10)} · {formatCurrency(transaction.amount)}
                    </p>
                    <p className="mb-0 text-secondary">{transaction.description || "세부 정보는 펼쳐서 확인"}</p>
                  </div>
                  <button
                    type="button"
                    className="expand-toggle-button"
                    onClick={() => setExpandedTransactionId((current) => (current === transaction.id ? null : transaction.id))}
                    aria-expanded={expandedTransactionId === transaction.id}
                    aria-label={expandedTransactionId === transaction.id ? "상세 접기" : "상세 펼치기"}
                  >
                    {expandedTransactionId === transaction.id ? "▴" : "▾"}
                  </button>
                </div>
                {expandedTransactionId === transaction.id ? (
                  <div className="compact-card-details mt-3">
                    <div className="compact-detail-grid">
                      <div>
                        <span className="section-kicker">연결 정보</span>
                        <strong>{getTransactionConnectionSummary(transaction)}</strong>
                      </div>
                      {transaction.description ? (
                        <div>
                          <span className="section-kicker">메모</span>
                          <strong>{transaction.description}</strong>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <form
                  className="classification-action-row compact-action-row mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const select = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
                    const categoryId = select?.value ?? "";
                    if (!categoryId) return;
                    assignCategory(workspaceId, transaction.id, categoryId);
                    form.reset();
                  }}
                >
                  <select name="categoryId" className="form-select">
                    <option value="">카테고리 선택</option>
                    {scope.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-outline-primary" type="submit">
                    이 거래 분류
                  </button>
                </form>
              </article>
            ))}
            {!uncategorizedTransactions.length ? (
              <p className="text-secondary mb-0">미분류 거래가 없습니다. 이제 통계와 문제 지출 진단을 더 믿고 볼 수 있습니다.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(4)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">분류 관리</span>
              <h2 className="section-title">카테고리</h2>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setIsCategoryModalOpen(true)}>
              카테고리 추가
            </button>
          </div>
          <div className="resource-grid compact-resource-grid mt-2">
            {scope.categories.map((category) => (
              <article key={category.id} className="resource-card compact-resource-card">
                <div className="compact-card-meta">
                  <span className="badge text-bg-secondary" title={`방향: ${category.direction}`}>
                    {category.direction}
                  </span>
                  <span
                    className="compact-card-caption"
                    title={`성격: ${category.fixedOrVariable} / 필요도: ${category.necessity}`}
                  >
                    {category.fixedOrVariable}
                  </span>
                </div>
                <h3 title={`${category.name} · ${category.necessity}`}>{category.name}</h3>
                <p className="mb-1 text-secondary" title={`필요도: ${category.necessity}`}>
                  {category.necessity}
                </p>
                <p className="mb-0 text-secondary">
                  사용 {categoryUsage.get(category.id)?.count ?? 0}건 · {formatCurrency(categoryUsage.get(category.id)?.amount ?? 0)}
                </p>
              </article>
            ))}
          </div>
        </section>

      </div>

      <AppModal
        open={isCategoryModalOpen}
        title="카테고리 추가"
        description="간단히 이름만 추가하고, 실제 사용은 바로 분류 화면에서 시작할 수 있습니다."
        onClose={() => setIsCategoryModalOpen(false)}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (!value) return;
            addCategory(workspaceId, value);
            setIsCategoryModalOpen(false);
            event.currentTarget.reset();
          }}
        >
          <label style={{ gridColumn: "1 / -1" }}>
            카테고리 이름
            <input name="name" className="form-control" placeholder="예: 식비" />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              저장
            </button>
          </div>
        </form>
      </AppModal>

    </div>
  );
}
