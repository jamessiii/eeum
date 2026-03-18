import { useState } from "react";
import { Link } from "react-router-dom";
import { REVIEW_ACTION_LABELS, REVIEW_TYPE_LABELS, REVIEW_TYPE_ORDER, type ReviewType } from "../../domain/reviews/meta";
import { getWorkspaceHealthSummary } from "../../domain/workspace/health";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { ReviewTypeFilterBar } from "../components/ReviewTypeFilterBar";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const [activeFilter, setActiveFilter] = useState<"all" | ReviewType>("all");
  const [activeTagId, setActiveTagId] = useState<string>("all");
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const transactions = new Map(scope.transactions.map((item) => [item.id, item]));
  const tags = new Map(scope.tags.map((item) => [item.id, item]));
  const reviews = scope.reviews.filter((item) => item.status === "open");
  const resolvedReviews = scope.reviews.filter((item) => item.status === "resolved");
  const dismissedReviews = scope.reviews.filter((item) => item.status === "dismissed");
  const uncategorizedCount = health.uncategorizedCount;
  const untaggedCount = health.untaggedCount;
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
  const filteredReviews = reviews
    .filter((item) => (activeFilter === "all" ? true : item.reviewType === activeFilter))
    .filter((item) => {
      if (activeTagId === "all") return true;
      const relatedTagIds = [item.primaryTransactionId, ...item.relatedTransactionIds]
        .map((id) => transactions.get(id))
        .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
        .flatMap((transaction) => transaction.tagIds);
      return relatedTagIds.includes(activeTagId);
    });
  const dominantType =
    REVIEW_TYPE_ORDER
      .map((type) => ({ type, count: reviewCounts[type] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0] ?? null;
  const nextReviewAction = uncategorizedCount
    ? {
        title: "지금 가장 먼저 할 일",
        description: `${uncategorizedCount}건의 미분류 거래를 먼저 정리하면 검토 이후 흐름이 가장 빠르게 정리됩니다.`,
        to: "/transactions?cleanup=uncategorized",
        actionLabel: `미분류 ${uncategorizedCount}건 정리`,
      }
    : untaggedCount
      ? {
          title: "지금 가장 먼저 할 일",
          description: `${untaggedCount}건의 무태그 거래를 먼저 묶으면 같은 맥락의 소비를 더 빠르게 비교할 수 있습니다.`,
          to: "/transactions?cleanup=untagged",
          actionLabel: `무태그 ${untaggedCount}건 정리`,
        }
      : null;

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
          <div className="toolbar-row mt-2">
            <select
              className="form-select toolbar-select"
              value={activeTagId}
              onChange={(event) => setActiveTagId(event.target.value)}
            >
              <option value="all">전체 태그</option>
              {scope.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
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

      {nextReviewAction ? (
        <div className="review-summary-panel mt-3">
          <div className="review-summary-copy">
            <strong>{nextReviewAction.title}</strong>
            <p className="mb-0 text-secondary">{nextReviewAction.description}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link className="btn btn-outline-primary btn-sm" to={nextReviewAction.to}>
              {nextReviewAction.actionLabel}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="review-summary-panel mt-3">
        <div className="review-summary-copy">
          <strong>{reviews.length ? "검토 후 바로 이어서 할 일" : "검토는 끝났고 다음 단계만 남았습니다"}</strong>
          <p className="mb-0 text-secondary">
            {reviews.length
              ? "검토 후보를 줄인 뒤에는 미분류 거래와 무태그 거래를 정리해야 대시보드 해석이 더 정확해집니다."
              : "열린 검토 항목은 모두 정리됐습니다. 이제 분류와 태그 정리를 끝내고 진단 화면으로 넘어가면 됩니다."}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {uncategorizedCount ? (
            <Link className="btn btn-outline-primary btn-sm" to="/transactions?cleanup=uncategorized">
              미분류 {uncategorizedCount}건 정리
            </Link>
          ) : null}
          {untaggedCount ? (
            <Link className="btn btn-outline-secondary btn-sm" to="/transactions?cleanup=untagged">
              무태그 {untaggedCount}건 정리
            </Link>
          ) : null}
          <Link className="btn btn-outline-dark btn-sm" to="/">
            대시보드 보기
          </Link>
        </div>
      </div>

      {!reviews.length ? (
        <CompletionBanner
          className="mt-3"
          title="검토함 정리가 끝났습니다"
          description="자동 검토 후보가 모두 처리됐습니다. 이제 미분류와 무태그 거래를 마무리하고 대시보드와 정산 화면의 흐름을 확인하면 됩니다."
          actions={
            <>
              {uncategorizedCount ? (
                <Link className="btn btn-outline-primary btn-sm" to="/transactions?cleanup=uncategorized">
                  미분류 {uncategorizedCount}건 정리
                </Link>
              ) : null}
              {untaggedCount ? (
                <Link className="btn btn-outline-secondary btn-sm" to="/transactions?cleanup=untagged">
                  무태그 {untaggedCount}건 정리
                </Link>
              ) : null}
              <Link className="btn btn-outline-dark btn-sm" to="/">
                대시보드 보기
              </Link>
              <Link className="btn btn-outline-primary btn-sm" to="/settlements">
                정산 화면 보기
              </Link>
            </>
          }
        />
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
                    {primaryTransaction?.tagIds.length ? (
                      <div className="transaction-tag-row mt-2">
                        {primaryTransaction.tagIds
                          .map((tagId) => tags.get(tagId))
                          .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
                          .map((tag) => (
                            <span key={tag.id} className="tag-pill" style={{ ["--tag-color" as string]: tag.color }}>
                              {tag.name}
                            </span>
                          ))}
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
