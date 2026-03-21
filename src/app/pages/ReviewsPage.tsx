import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getFilteredReviews } from "../../domain/reviews/filters";
import { REVIEW_ACTION_LABELS, REVIEW_TYPE_LABELS, type ReviewType } from "../../domain/reviews/meta";
import { getReviewSummary, getReviewTypeCounts } from "../../domain/reviews/summary";
import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";
import { getWorkspaceHealthSummary } from "../../domain/workspace/health";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { NextStepCallout } from "../components/NextStepCallout";
import { ReviewTypeFilterBar } from "../components/ReviewTypeFilterBar";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const [activeFilter, setActiveFilter] = useState<"all" | ReviewType>("all");
  const [activeSourceType, setActiveSourceType] = useState<"all" | (typeof SOURCE_TYPE_OPTIONS)[number]>("all");
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const transactions = useMemo(() => new Map(scope.transactions.map((item) => [item.id, item])), [scope.transactions]);
  const peopleMap = useMemo(() => new Map(scope.people.map((person) => [person.id, person.displayName || person.name])), [scope.people]);
  const accountMap = useMemo(() => new Map(scope.accounts.map((account) => [account.id, account.alias || account.name])), [scope.accounts]);
  const cardMap = useMemo(() => new Map(scope.cards.map((card) => [card.id, card.name])), [scope.cards]);

  const {
    openReviews: reviews,
    openReviewCount,
    resolvedReviewCount,
    dismissedReviewCount,
    dominantType,
    totalReviewCount,
    reviewProgress,
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
  const uncategorizedCount = health.uncategorizedCount;

  const nextReviewAction = uncategorizedCount
    ? {
        title: "지금 가장 먼저 할 일",
        description: `${uncategorizedCount}건의 미분류 거래를 먼저 정리하면 검토 이후 흐름이 더 깔끔해집니다.`,
        to: "/transactions?cleanup=uncategorized",
        actionLabel: `미분류 ${uncategorizedCount}건 정리`,
      }
    : null;

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

  const getReviewTransactionLink = (reviewType: ReviewType) => {
    const searchParams = new URLSearchParams();
    if (reviewType === "uncategorized_transaction") {
      searchParams.set("cleanup", "uncategorized");
    }
    if (reviewType === "internal_transfer_candidate") {
      searchParams.set("nature", "internal_transfer");
    }
    if (activeSourceType !== "all") {
      searchParams.set("sourceType", activeSourceType);
    }
    const query = searchParams.toString();
    return query ? `/transactions?${query}` : "/transactions";
  };

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">검토함</span>
          <h2 className="section-title">자동 검토 결과</h2>
        </div>
        <span className="badge text-bg-warning">{openReviewCount}건</span>
      </div>

      <div className="review-progress-box">
        <div className="d-flex justify-content-between align-items-center gap-3">
          <div>
            <span className="section-kicker">진행률</span>
            <div className="small text-secondary mt-1">
              전체 {totalReviewCount}건 중 해결 {resolvedReviewCount}건 · 보류 {dismissedReviewCount}건 · 남음 {openReviewCount}건
            </div>
          </div>
          <strong>{Math.round(reviewProgress * 100)}%</strong>
        </div>
        <div className="guide-progress-bar mt-3" aria-hidden="true">
          <div className="guide-progress-fill" style={{ width: `${reviewProgress * 100}%` }} />
        </div>
      </div>

      {openReviewCount ? (
        <div className="review-summary-panel mt-3">
          <div className="review-summary-copy">
            <strong>{dominantType ? `${REVIEW_TYPE_LABELS[dominantType.type]} 검토가 가장 많습니다` : "자동 검토 후보를 보고 있습니다"}</strong>
            <p className="mb-0 text-secondary">같은 유형부터 묶어서 처리하면 더 빠르게 정리됩니다.</p>
          </div>
          <ReviewTypeFilterBar
            activeFilter={activeFilter}
            counts={filteredReviewCounts}
            totalCount={filteredReviewsByContext.length}
            onChange={setActiveFilter}
          />
        </div>
      ) : null}

      {openReviewCount ? (
        <div className="toolbar-row mt-3">
          <select
            className="form-select toolbar-select"
            value={activeSourceType}
            onChange={(event) => setActiveSourceType(event.target.value as "all" | (typeof SOURCE_TYPE_OPTIONS)[number])}
          >
            <option value="all">전체 수단</option>
            {SOURCE_TYPE_OPTIONS.map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {getSourceTypeLabel(sourceType)}
              </option>
            ))}
          </select>
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
      ) : null}

      {nextReviewAction ? (
        <NextStepCallout
          className="mt-3"
          title={nextReviewAction.title}
          description={nextReviewAction.description}
          actionLabel={nextReviewAction.actionLabel}
          to={nextReviewAction.to}
        />
      ) : null}

      {!openReviewCount ? (
        <CompletionBanner
          className="mt-3"
          title="검토함 정리가 끝났습니다"
          description="자동 검토 후보가 모두 처리되었습니다. 이제 미분류 거래 정리와 대시보드 확인만 이어가면 됩니다."
          actions={
            <>
              {uncategorizedCount ? (
                <Link className="btn btn-outline-primary btn-sm" to="/transactions?cleanup=uncategorized">
                  미분류 {uncategorizedCount}건 정리
                </Link>
              ) : null}
              <Link className="btn btn-outline-secondary btn-sm" to="/">
                대시보드 보기
              </Link>
            </>
          }
        />
      ) : !filteredReviews.length ? (
        <EmptyStateCallout
          kicker="필터 결과 없음"
          title="현재 조건에 맞는 검토가 없습니다"
          description="필터를 바꾸거나 전체 검토 기준으로 다시 확인해 보세요."
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
                <Link className="btn btn-outline-primary btn-sm" to="/transactions">
                  카드내역 보기
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

            return (
              <article key={review.id} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div className="review-card-main">
                    <span className="review-type">{REVIEW_TYPE_LABELS[review.reviewType] ?? review.reviewType}</span>
                    <h3>{review.summary}</h3>
                    {primaryTransaction ? (
                      <p className="mb-1 text-secondary">
                        기준 거래: {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.merchantName} ·{" "}
                        {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {primaryTransaction ? (
                      <p className="mb-0 text-secondary">{getTransactionConnectionMeta(primaryTransaction.id)}</p>
                    ) : null}
                    {relatedTransactions.length ? (
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
                  <Link className="btn btn-sm btn-outline-primary" to={getReviewTransactionLink(review.reviewType)}>
                    카드내역 보기
                  </Link>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => dismissReview(review.id)}>
                    보류
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
