import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getFilteredReviews } from "../../domain/reviews/filters";
import { REVIEW_ACTION_LABELS, REVIEW_DISMISS_LABELS, REVIEW_TYPE_LABELS, type ReviewType } from "../../domain/reviews/meta";
import { getReviewSummary, getReviewTypeCounts } from "../../domain/reviews/summary";
import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { AppSelect } from "../components/AppSelect";
import { ReviewTypeFilterBar } from "../components/ReviewTypeFilterBar";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const [activeFilter, setActiveFilter] = useState<"all" | ReviewType>("all");
  const [activeSourceType, setActiveSourceType] = useState<"all" | (typeof SOURCE_TYPE_OPTIONS)[number]>("all");
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const transactions = useMemo(() => new Map(scope.transactions.map((item) => [item.id, item])), [scope.transactions]);
  const peopleMap = useMemo(() => new Map(scope.people.map((person) => [person.id, person.displayName || person.name])), [scope.people]);
  const accountMap = useMemo(() => new Map(scope.accounts.map((account) => [account.id, account.alias || account.name])), [scope.accounts]);
  const cardMap = useMemo(() => new Map(scope.cards.map((card) => [card.id, card.name])), [scope.cards]);
  const categoryLabelMap = useMemo(() => {
    const groupNameById = new Map(
      scope.categories.filter((category) => category.categoryType === "group").map((category) => [category.id, category.name]),
    );
    return new Map(
      scope.categories
        .filter((category) => category.categoryType === "category")
        .map((category) => [category.id, `${groupNameById.get(category.parentCategoryId ?? "") ?? ""} > ${category.name}`.replace(/^ > /, "")]),
    );
  }, [scope.categories]);

  const {
    openReviews: reviews,
    openReviewCount,
    resolvedReviewCount,
    dismissedReviewCount,
    dominantType,
    totalReviewCount,
  } = getReviewSummary(scope.reviews, transactions);

  const filteredReviews = getFilteredReviews({
    reviews,
    transactionMap: transactions,
    activeFilter,
    activeTagId: "all",
    activeSourceType,
  });
  const filteredReviewsByContext = getFilteredReviews({
    reviews,
    transactionMap: transactions,
    activeFilter: "all",
    activeTagId: "all",
    activeSourceType,
  });
  const filteredReviewCounts = getReviewTypeCounts(filteredReviewsByContext);
  const hasActiveReviewFilters = activeFilter !== "all" || activeSourceType !== "all";

  const getTransactionConnectionMeta = (transactionId: string) => {
    const transaction = transactions.get(transactionId);
    if (!transaction) return null;

    const parts = [
      `수단 ${getSourceTypeLabel(transaction.sourceType)}`,
      transaction.ownerPersonId ? `사용자 ${peopleMap.get(transaction.ownerPersonId) ?? "-"}` : null,
      transaction.accountId ? `계좌 ${accountMap.get(transaction.accountId) ?? "-"}` : null,
      transaction.cardId ? `카드 ${cardMap.get(transaction.cardId) ?? "-"}` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  };

  return (
    <section className="card shadow-sm" data-guide-target="transactions-reviews">
      <div className="section-head">
        <div>
          <span className="section-kicker">검토함</span>
          <h2 className="section-title">자동 검토 결과</h2>
          <p className="review-section-meta">
            전체 {totalReviewCount}건 · 해결 {resolvedReviewCount}건 · 보류 {dismissedReviewCount}건 · 남음 {openReviewCount}건
          </p>
        </div>
        <span className="badge text-bg-warning">{openReviewCount}건</span>
      </div>

      {openReviewCount && dominantType ? (
        <div className="review-context-block mt-3">
          <div className="review-context-note">
            <strong>{REVIEW_TYPE_LABELS[dominantType.type]} 검토가 가장 많습니다</strong>
            <p>같은 유형부터 묶어서 처리하면 더 빠르게 정리됩니다.</p>
          </div>
        </div>
      ) : null}

      {openReviewCount ? (
        <div className="review-list-toolbar mt-3">
          <div className="review-list-toolbar-main">
<AppSelect
              className="toolbar-select"
              value={activeSourceType}
              onChange={(nextValue) => setActiveSourceType(nextValue as "all" | (typeof SOURCE_TYPE_OPTIONS)[number])}
              options={[{ value: "all", label: "전체 수단" }, ...SOURCE_TYPE_OPTIONS.map((sourceType) => ({ value: sourceType, label: getSourceTypeLabel(sourceType) }))]}
              ariaLabel="검토 수단 필터"
            />
            {hasActiveReviewFilters ? (
              <button
                className="btn btn-outline-secondary btn-sm"
                type="button"
                onClick={() => {
                  setActiveFilter("all");
                  setActiveSourceType("all");
                }}
              >
                필터 초기화
              </button>
            ) : null}
          </div>
          <ReviewTypeFilterBar
            activeFilter={activeFilter}
            counts={filteredReviewCounts}
            totalCount={filteredReviewsByContext.length}
            onChange={setActiveFilter}
          />
        </div>
      ) : null}

      {!openReviewCount ? (
        <div className="review-complete-copy mt-3">
          <strong>검토함 정리가 완료됐습니다</strong>
          <p>자동 검토 후보가 모두 처리됐습니다. 이제 미분류 거래 정리와 대시보드 확인만 이어가면 됩니다.</p>
        </div>
      ) : !filteredReviews.length ? (
        <EmptyStateCallout
          kicker="필터 결과 없음"
          title="현재 조건에 맞는 검토가 없습니다"
          description="필터를 바꾸거나 전체 검토 기준으로 다시 확인해보세요."
          actions={
            hasActiveReviewFilters ? (
              <>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  onClick={() => {
                    setActiveFilter("all");
                    setActiveSourceType("all");
                  }}
                >
                  필터 초기화
                </button>
                <Link className="btn btn-outline-secondary btn-sm" to="/collections/card">
                  결제내역 보기
                </Link>
              </>
            ) : undefined
          }
        />
      ) : (
        <div className="review-list mt-3">
          {filteredReviews.map((review, index) => {
            const primaryTransaction = transactions.get(review.primaryTransactionId) ?? null;
            const relatedTransactions = review.relatedTransactionIds
              .map((id) => transactions.get(id))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
            const isCategorySuggestion = review.reviewType === "category_suggestion";
            const suggestedCategoryLabel =
              isCategorySuggestion && review.suggestedCategoryId
                ? categoryLabelMap.get(review.suggestedCategoryId) ?? null
                : null;
            const reviewTitle =
              isCategorySuggestion ? primaryTransaction?.merchantName ?? review.summary : review.summary;

            return (
              <article
                key={review.id}
                className="review-card review-card--compact"
                style={getMotionStyle(index)}
                data-guide-target={index === 0 ? "transactions-review-card" : undefined}
              >
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div className="review-card-main">
                    <span className="review-type">{REVIEW_TYPE_LABELS[review.reviewType] ?? review.reviewType}</span>
                    <h3>{reviewTitle}</h3>
                    {isCategorySuggestion && suggestedCategoryLabel ? (
                      <p className="mb-1 text-secondary">이 항목은 {suggestedCategoryLabel}로 분류할까요?</p>
                    ) : null}
                    {primaryTransaction && !isCategorySuggestion ? (
                      <p className="mb-1 text-secondary">
                        기준 거래: {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.merchantName} ·{" "}
                        {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {primaryTransaction && isCategorySuggestion ? (
                      <p className="mb-1 text-secondary">
                        {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {primaryTransaction ? (
                      <p className="mb-0 text-secondary">{getTransactionConnectionMeta(primaryTransaction.id)}</p>
                    ) : null}
                    {relatedTransactions.length && !isCategorySuggestion ? (
                      <div className="small text-secondary review-inline-list mt-2">
                        연관 거래: {relatedTransactions.map((item) => `${item.merchantName} ${item.amount.toLocaleString("ko-KR")}원`).join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="review-card-side">
                    <span className="badge text-bg-light">신뢰도 {Math.round(review.confidenceScore * 100)}%</span>
                  </div>
                </div>
                <div className="action-row mt-3">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      if (review.reviewType === "uncategorized_transaction") {
                        resolveReview(review.id);
                        return;
                      }
                      applyReviewSuggestion(review.id);
                    }}
                  >
                    {REVIEW_ACTION_LABELS[review.reviewType] ?? "적용"}
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => dismissReview(review.id)}>
                    {REVIEW_DISMISS_LABELS[review.reviewType] ?? "보류"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
