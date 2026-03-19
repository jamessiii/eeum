import { useState } from "react";
import { Link } from "react-router-dom";
import { getFilteredReviews } from "../../domain/reviews/filters";
import { REVIEW_ACTION_LABELS, REVIEW_TYPE_LABELS, type ReviewType } from "../../domain/reviews/meta";
import { getReviewSummary, getSortedReviewTypeSummary } from "../../domain/reviews/summary";
import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";
import { getWorkspaceHealthSummary } from "../../domain/workspace/health";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { ReviewTypeFilterBar } from "../components/ReviewTypeFilterBar";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { NextStepCallout } from "../components/NextStepCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const [activeFilter, setActiveFilter] = useState<"all" | ReviewType>("all");
  const [activeTagId, setActiveTagId] = useState<string>("all");
  const [activeSourceType, setActiveSourceType] = useState<"all" | (typeof SOURCE_TYPE_OPTIONS)[number]>("all");
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const transactions = new Map(scope.transactions.map((item) => [item.id, item]));
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));
  const tags = new Map(scope.tags.map((item) => [item.id, item]));
  const {
    openReviews: reviews,
    openReviewCount,
    resolvedReviews,
    resolvedReviewCount,
    dismissedReviewCount,
    reviewCounts,
    openSharedReviewCount,
    openInternalTransferReviewCount,
    dominantType,
    sourceTypeReviewCounts,
    totalReviewCount,
    reviewProgress,
  } =
    getReviewSummary(scope.reviews, transactions);
  const uncategorizedCount = health.uncategorizedCount;
  const untaggedCount = health.untaggedCount;
  const filteredReviews = getFilteredReviews({
    reviews,
    transactionMap: transactions,
    activeFilter,
    activeTagId,
    activeSourceType,
  });
  const hasActiveReviewFilters = activeFilter !== "all" || activeTagId !== "all" || activeSourceType !== "all";
  const filteredReviewSummary = [
    activeFilter !== "all" ? `유형 ${REVIEW_TYPE_LABELS[activeFilter]}` : null,
    activeSourceType !== "all" ? `수단 ${getSourceTypeLabel(activeSourceType)}` : null,
    activeTagId !== "all" ? `태그 ${tags.get(activeTagId)?.name ?? "-"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const resolvedReviewTypeSummary = getSortedReviewTypeSummary(resolvedReviews);
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
      : openSharedReviewCount
        ? {
            title: "지금 가장 먼저 할 일",
            description: `${openSharedReviewCount}건의 공동지출 후보를 거래 화면에서 다시 보면 정산 흐름을 더 빨리 안정화할 수 있습니다.`,
            to: "/transactions?nature=shared",
            actionLabel: `공동지출 ${openSharedReviewCount}건 점검`,
          }
        : openInternalTransferReviewCount
          ? {
              title: "지금 가장 먼저 할 일",
              description: `${openInternalTransferReviewCount}건의 내부이체 후보를 거래 화면에서 다시 보면 지출 통계가 더 깔끔해집니다.`,
              to: "/transactions?nature=internal_transfer",
              actionLabel: `내부이체 ${openInternalTransferReviewCount}건 점검`,
            }
      : null;

  const getReviewTransactionLink = (reviewType: ReviewType) => {
    switch (reviewType) {
      case "uncategorized_transaction":
        return "/transactions?cleanup=uncategorized";
      case "shared_expense_candidate":
        return "/transactions?nature=shared";
      case "internal_transfer_candidate":
        return "/transactions?nature=internal_transfer";
      default:
        return "/transactions";
    }
  };

  const getReviewTransactionLinkLabel = (reviewType: ReviewType) => {
    switch (reviewType) {
      case "uncategorized_transaction":
        return "미분류 거래 보기";
      case "shared_expense_candidate":
        return "공동지출 흐름 보기";
      case "internal_transfer_candidate":
        return "내부이체 흐름 보기";
      default:
        return "거래 화면 보기";
    }
  };

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">검토함</span>
          <h2 className="section-title">자동 감지 결과 검토</h2>
        </div>
        <span className="badge text-bg-warning">{openReviewCount}건</span>
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
            totalCount={openReviewCount}
            onChange={setActiveFilter}
          />
          <div className="toolbar-row mt-2">
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
          <div className="d-flex flex-wrap gap-2 mt-2">
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveSourceType("all")}>
              전체 {openReviewCount}건
            </button>
            {SOURCE_TYPE_OPTIONS.map((sourceType) => (
              <button
                key={sourceType}
                className="btn btn-outline-secondary btn-sm"
                type="button"
                onClick={() => setActiveSourceType(sourceType)}
              >
                {getSourceTypeLabel(sourceType)} {sourceTypeReviewCounts[sourceType]}건
              </button>
            ))}
          </div>
          {resolvedReviewTypeSummary.length ? (
            <div className="resource-grid">
              {resolvedReviewTypeSummary.map(([type, count]) => (
                <article key={type} className="resource-card">
                  <h3>{REVIEW_TYPE_LABELS[type as keyof typeof REVIEW_TYPE_LABELS] ?? type}</h3>
                  <p className="mb-0 text-secondary">처리 완료 {count}건</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeSourceType !== "all" ? (
        <div className="review-summary-panel mt-3">
          <div className="review-summary-copy">
            <strong>{getSourceTypeLabel(activeSourceType)} 검토 항목만 보고 있습니다</strong>
            <p className="mb-0 text-secondary">
              지금은 {getSourceTypeLabel(activeSourceType)} 경로로 들어온 검토 후보만 모아 보고 있습니다. 같은 수단끼리 한 번에 정리하면 연결값 오류를 더 빨리 찾을 수 있습니다.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveSourceType("all")}>
              수단 필터 해제
            </button>
            <Link className="btn btn-outline-primary btn-sm" to={`/transactions?sourceType=${activeSourceType}`}>
              {getSourceTypeLabel(activeSourceType)} 거래 보기
            </Link>
          </div>
        </div>
      ) : null}

      {openReviewCount ? (
        <div className="review-summary-panel mt-3">
          <div className="review-summary-copy">
            <strong>{hasActiveReviewFilters ? "지금 보는 리뷰 범위" : "전체 리뷰를 보고 있습니다"}</strong>
            <p className="mb-0 text-secondary">
              {hasActiveReviewFilters
                ? `${filteredReviewSummary} 기준으로 ${filteredReviews.length}건을 추려서 보고 있습니다. 같은 맥락끼리 먼저 처리하면 판단이 더 빨라집니다.`
                : `열린 리뷰 ${openReviewCount}건을 전체 기준으로 보고 있습니다. 유형이나 수단으로 좁히면 비슷한 항목을 연속으로 처리하기 좋습니다.`}
            </p>
          </div>
          {hasActiveReviewFilters ? (
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveFilter("all")}>
                유형 초기화
              </button>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveSourceType("all")}>
                수단 초기화
              </button>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveTagId("all")}>
                태그 초기화
              </button>
            </div>
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

      {openReviewCount ? (
        <div className="review-summary-panel mt-3">
          <div className="review-summary-copy">
            <strong>업로드 다음 순서</strong>
            <p className="mb-0 text-secondary">
              검토 항목을 먼저 정리한 뒤 미분류와 무태그 거래를 마무리하면, 대시보드와 정산 화면에서 이번 달 흐름을 훨씬 안정적으로 볼 수
              있습니다.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link className="btn btn-outline-primary btn-sm" to="/transactions?cleanup=uncategorized">
              미분류 정리
            </Link>
            <Link className="btn btn-outline-secondary btn-sm" to="/transactions?cleanup=untagged">
              태그 정리
            </Link>
            <Link className="btn btn-outline-dark btn-sm" to="/settlements">
              정산 화면 보기
            </Link>
          </div>
        </div>
      ) : null}

      <div className="review-summary-panel mt-3">
        <div className="review-summary-copy">
          <strong>{openReviewCount ? "검토 후 바로 이어서 할 일" : "검토는 끝났고 다음 단계만 남았습니다"}</strong>
          <p className="mb-0 text-secondary">
            {openReviewCount
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
          {!uncategorizedCount && !untaggedCount && openSharedReviewCount ? (
            <Link className="btn btn-outline-primary btn-sm" to="/transactions?nature=shared">
              공동지출 {openSharedReviewCount}건 점검
            </Link>
          ) : null}
          {!uncategorizedCount && !untaggedCount && !openSharedReviewCount && openInternalTransferReviewCount ? (
            <Link className="btn btn-outline-secondary btn-sm" to="/transactions?nature=internal_transfer">
              내부이체 {openInternalTransferReviewCount}건 점검
            </Link>
          ) : null}
          <Link className="btn btn-outline-dark btn-sm" to="/">
            대시보드 보기
          </Link>
        </div>
      </div>

      {!openReviewCount ? (
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
              {!uncategorizedCount && !untaggedCount && openSharedReviewCount ? (
                <Link className="btn btn-outline-primary btn-sm" to="/transactions?nature=shared">
                  공동지출 {openSharedReviewCount}건 점검
                </Link>
              ) : null}
              {!uncategorizedCount && !untaggedCount && !openSharedReviewCount && openInternalTransferReviewCount ? (
                <Link className="btn btn-outline-secondary btn-sm" to="/transactions?nature=internal_transfer">
                  내부이체 {openInternalTransferReviewCount}건 점검
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

      {!openReviewCount ? (
        <EmptyStateCallout
          kicker="검토 완료"
          title="열려 있는 검토 항목이 없습니다"
          description="중복, 환불, 내부이체, 공동지출 후보를 모두 정리했습니다. 이제 대시보드와 정산 화면의 수치를 더 믿고 볼 수 있습니다."
          actions={
            <>
              <Link className="btn btn-outline-secondary btn-sm" to="/">
                대시보드 보기
              </Link>
              <Link className="btn btn-outline-primary btn-sm" to="/settlements">
                정산 화면 보기
              </Link>
            </>
          }
        />
      ) : !filteredReviews.length ? (
        <EmptyStateCallout
          kicker="필터 결과 없음"
          title="지금 선택한 조건에 맞는 리뷰가 없습니다"
          description={
            hasActiveReviewFilters
              ? `${filteredReviewSummary} 조건에서는 열린 리뷰가 없습니다. 필터를 풀고 다른 항목을 이어서 확인해 보세요.`
              : "열린 리뷰가 없어서 여기에는 더 보여줄 항목이 없습니다."
          }
          actions={
            hasActiveReviewFilters ? (
              <>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  onClick={() => {
                    setActiveFilter("all");
                    setActiveTagId("all");
                    setActiveSourceType("all");
                  }}
                >
                  필터 전체 초기화
                </button>
                <Link className="btn btn-outline-primary btn-sm" to="/transactions">
                  거래 화면 보기
                </Link>
              </>
            ) : undefined
          }
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
                      <p className="mb-1 text-secondary">
                        기준 거래: {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.merchantName} ·{" "}
                        {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {primaryTransaction ? (
                      <p className="mb-2 text-secondary">
                        {primaryTransaction.ownerPersonId ? `사용자 ${peopleMap.get(primaryTransaction.ownerPersonId) ?? "-"}` : "사용자 미지정"} ·{" "}
                        {primaryTransaction.accountId ? `계좌 ${accountMap.get(primaryTransaction.accountId) ?? "-"}` : "계좌 미연결"} ·{" "}
                        {primaryTransaction.cardId ? `카드 ${cardMap.get(primaryTransaction.cardId) ?? "-"}` : "카드 미연결"}
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
                  <Link className="btn btn-sm btn-outline-primary" to={getReviewTransactionLink(review.reviewType)}>
                    {getReviewTransactionLinkLabel(review.reviewType)}
                  </Link>
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
