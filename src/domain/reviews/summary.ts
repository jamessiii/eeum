import type { ReviewItem, Transaction } from "../../shared/types/models";
import { REVIEW_TYPE_ORDER, type ReviewType } from "./meta";
import { SOURCE_TYPE_OPTIONS } from "../transactions/sourceTypes";

export interface ReviewSummary {
  openReviews: ReviewItem[];
  openReviewCount: number;
  resolvedReviews: ReviewItem[];
  resolvedReviewCount: number;
  dismissedReviews: ReviewItem[];
  dismissedReviewCount: number;
  reviewCounts: Partial<Record<ReviewType, number>>;
  openSharedReviewCount: number;
  openInternalTransferReviewCount: number;
  resolvedCounts: Partial<Record<ReviewType, number>>;
  dominantType: { type: ReviewType; count: number } | null;
  sourceTypeReviewCounts: Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>;
  totalReviewCount: number;
  reviewProgress: number;
}

export function getReviewTypeCounts(reviews: ReviewItem[]) {
  return reviews.reduce<Partial<Record<ReviewType, number>>>((accumulator, review) => {
    accumulator[review.reviewType] = (accumulator[review.reviewType] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function getSortedReviewTypeSummary(reviews: ReviewItem[]) {
  return Object.entries(getReviewTypeCounts(reviews)).sort((a, b) => b[1] - a[1]);
}

export function getOpenReviews(reviews: ReviewItem[]) {
  return reviews.filter((review) => review.status === "open" && review.reviewType !== "shared_expense_candidate");
}

export function getOpenReviewTypeSummary(reviews: ReviewItem[]) {
  return getSortedReviewTypeSummary(getOpenReviews(reviews));
}

export function getReviewSummary(
  reviews: ReviewItem[],
  transactionMap: Map<string, Transaction>,
): ReviewSummary {
  const visibleReviews = reviews.filter((review) => review.reviewType !== "shared_expense_candidate");
  const openReviews = getOpenReviews(visibleReviews);
  const openReviewCount = openReviews.length;
  const resolvedReviews: ReviewItem[] = [];
  const dismissedReviews: ReviewItem[] = [];
  const sourceTypeReviewCounts = SOURCE_TYPE_OPTIONS.reduce<Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>>(
    (accumulator, sourceType) => {
      accumulator[sourceType] = 0;
      return accumulator;
    },
    { manual: 0, account: 0, card: 0, import: 0 },
  );

  for (const review of visibleReviews) {
    if (review.status === "open") {
      const sourceType = transactionMap.get(review.primaryTransactionId)?.sourceType;
      if (sourceType) {
        sourceTypeReviewCounts[sourceType] += 1;
      }
      continue;
    }

    if (review.status === "resolved") {
      resolvedReviews.push(review);
      continue;
    }

    dismissedReviews.push(review);
  }

  const reviewCounts = getReviewTypeCounts(openReviews);
  const openSharedReviewCount = reviewCounts.shared_expense_candidate ?? 0;
  const openInternalTransferReviewCount = reviewCounts.internal_transfer_candidate ?? 0;
  const resolvedCounts = getReviewTypeCounts(resolvedReviews);
  const resolvedReviewCount = resolvedReviews.length;
  const dismissedReviewCount = dismissedReviews.length;
  const totalReviewCount = visibleReviews.length;
  const reviewProgress = totalReviewCount ? (resolvedReviewCount + dismissedReviewCount) / totalReviewCount : 1;
  const dominantType =
    REVIEW_TYPE_ORDER.map((type) => ({ type, count: reviewCounts[type] ?? 0 })).sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    openReviews,
    openReviewCount,
    resolvedReviews,
    resolvedReviewCount,
    dismissedReviews,
    dismissedReviewCount,
    reviewCounts,
    openSharedReviewCount,
    openInternalTransferReviewCount,
    resolvedCounts,
    dominantType,
    sourceTypeReviewCounts,
    totalReviewCount,
    reviewProgress,
  };
}
