import { useState } from "react";
import { REVIEW_ACTION_LABELS, REVIEW_TYPE_LABELS, REVIEW_TYPE_ORDER, type ReviewType } from "../../domain/reviews/meta";
import { getMotionStyle } from "../../shared/utils/motion";
import { ReviewTypeFilterBar } from "../components/ReviewTypeFilterBar";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const [activeFilter, setActiveFilter] = useState<"all" | ReviewType>("all");
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const transactions = new Map(scope.transactions.map((item) => [item.id, item]));
  const reviews = scope.reviews.filter((item) => item.status === "open");
  const resolvedReviews = scope.reviews.filter((item) => item.status === "resolved");
  const dismissedReviews = scope.reviews.filter((item) => item.status === "dismissed");
  const totalReviewCount = scope.reviews.length;
  const reviewProgress = totalReviewCount ? (resolvedReviews.length + dismissedReviews.length) / totalReviewCount : 1;
  const reviewCounts = reviews.reduce<Partial<Record<ReviewType, number>>>((accumulator, item) => {
    accumulator[item.reviewType] = (accumulator[item.reviewType] ?? 0) + 1;
    return accumulator;
  }, {});
  const resolvedCounts = resolvedReviews.reduce<Partial<Record<ReviewType, number>>>((accumulator, item) => {
    accumulator[item.reviewType] = (accumulator[item.reviewType] ?? 0) + 1;
    return accumulator;
  }, {});
  const filteredReviews =
    activeFilter === "all" ? reviews : reviews.filter((item) => item.reviewType === activeFilter);
  const dominantType =
    REVIEW_TYPE_ORDER
      .map((type) => ({ type, count: reviewCounts[type] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0] ?? null;

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">검토함</span>
          <h2 className="section-title">자동 감지 결과 검토</h2>
        </div>
        <span className="badge text-bg-warning">{reviews.length}건</span>
      </div>
      <p className="text-secondary">
        팝업으로 즉답을 강요하지 않고, 확인이 필요한 항목을 여기에 모아둡니다. 거래 흐름을 보고 한 번에 정리할 수 있게 만드는
        화면입니다.
      </p>
      <div className="review-progress-box">
        <div className="d-flex justify-content-between align-items-center gap-3">
          <div>
            <span className="section-kicker">검토 진행률</span>
            <div className="small text-secondary mt-1">
              전체 {totalReviewCount}건 중 해결 {resolvedReviews.length}건 · 보류 {dismissedReviews.length}건 · 남음 {reviews.length}건
            </div>
          </div>
          <strong>{Math.round(reviewProgress * 100)}%</strong>
        </div>
        <div className="guide-progress-bar mt-3" aria-hidden="true">
          <div className="guide-progress-fill" style={{ width: `${reviewProgress * 100}%` }} />
        </div>
      </div>
      {reviews.length ? (
        <div className="review-summary-panel">
          <div className="review-summary-copy">
            <strong>지금 먼저 볼 것</strong>
            <p className="mb-0 text-secondary">
              {dominantType && dominantType.count > 0
                ? `${REVIEW_TYPE_LABELS[dominantType.type]}가 ${dominantType.count}건으로 가장 많습니다. 같은 유형끼리 모아 처리하면 더 빠르게 정리할 수 있습니다.`
                : "검토 유형을 골라서 같은 성격의 항목부터 한 번에 정리해보세요."}
            </p>
          </div>
          <ReviewTypeFilterBar
            activeFilter={activeFilter}
            counts={reviewCounts}
            totalCount={reviews.length}
            onChange={setActiveFilter}
          />
          {resolvedReviews.length ? (
            <div className="resource-grid">
              {REVIEW_TYPE_ORDER.filter((type) => (resolvedCounts[type] ?? 0) > 0).map((type) => (
                <article key={type} className="resource-card">
                  <h3>{REVIEW_TYPE_LABELS[type]}</h3>
                  <p className="mb-0 text-secondary">처리 완료 {resolvedCounts[type] ?? 0}건</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!reviews.length ? (
        <EmptyStateCallout
          kicker="검토 완료"
          title="열려 있는 검토 항목이 없습니다"
          description="중복, 환불, 내부이체, 공동지출 후보를 모두 정리했습니다. 이제 대시보드와 정산 화면의 수치를 더 믿고 볼 수 있습니다."
        />
      ) : (
        <div className="review-list">
          {filteredReviews.map((review, index) => {
            const primaryTransaction = transactions.get(review.primaryTransactionId) ?? null;
            const relatedTransactions = review.relatedTransactionIds
              .map((id) => transactions.get(id))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));

            return (
              <article key={review.id} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">{REVIEW_TYPE_LABELS[review.reviewType] ?? review.reviewType}</span>
                    <h3>{review.summary}</h3>
                    {primaryTransaction ? (
                      <p className="mb-2 text-secondary">
                        기준 거래: {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.merchantName} ·{" "}
                        {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {relatedTransactions.length ? (
                      <div className="small text-secondary">
                        관련 거래:{" "}
                        {relatedTransactions
                          .map((item) => `${item.merchantName} ${item.amount.toLocaleString("ko-KR")}원`)
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <span className="badge text-bg-light">신뢰도 {Math.round(review.confidenceScore * 100)}%</span>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
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
                    나중에 보기
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
