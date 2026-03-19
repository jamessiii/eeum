import type { ReviewItem, Transaction } from "../../shared/types/models";
import { REVIEW_TYPE_ORDER, type ReviewType } from "./meta";
import { SOURCE_TYPE_OPTIONS } from "../transactions/sourceTypes";

export interface ReviewSummary {
  openReviews: ReviewItem[];
  resolvedReviews: ReviewItem[];
  dismissedReviews: ReviewItem[];
  reviewCounts: Partial<Record<ReviewType, number>>;
  resolvedCounts: Partial<Record<ReviewType, number>>;
  dominantType: { type: ReviewType; count: number } | null;
  sourceTypeReviewCounts: Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>;
  totalReviewCount: number;
  reviewProgress: number;
}

export function getReviewSummary(
  reviews: ReviewItem[],
  transactionMap: Map<string, Transaction>,
): ReviewSummary {
  const openReviews: ReviewItem[] = [];
  const resolvedReviews: ReviewItem[] = [];
  const dismissedReviews: ReviewItem[] = [];
  const reviewCounts: Partial<Record<ReviewType, number>> = {};
  const resolvedCounts: Partial<Record<ReviewType, number>> = {};
  const sourceTypeReviewCounts = SOURCE_TYPE_OPTIONS.reduce<Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>>(
    (accumulator, sourceType) => {
      accumulator[sourceType] = 0;
      return accumulator;
    },
    { manual: 0, account: 0, card: 0, import: 0 },
  );

  for (const review of reviews) {
    if (review.status === "open") {
      openReviews.push(review);
      reviewCounts[review.reviewType] = (reviewCounts[review.reviewType] ?? 0) + 1;

      const sourceType = transactionMap.get(review.primaryTransactionId)?.sourceType;
      if (sourceType) {
        sourceTypeReviewCounts[sourceType] += 1;
      }
      continue;
    }

    if (review.status === "resolved") {
      resolvedReviews.push(review);
      resolvedCounts[review.reviewType] = (resolvedCounts[review.reviewType] ?? 0) + 1;
      continue;
    }

    dismissedReviews.push(review);
  }

  const totalReviewCount = reviews.length;
  const reviewProgress = totalReviewCount ? (resolvedReviews.length + dismissedReviews.length) / totalReviewCount : 1;
  const dominantType =
    REVIEW_TYPE_ORDER.map((type) => ({ type, count: reviewCounts[type] ?? 0 })).sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    openReviews,
    resolvedReviews,
    dismissedReviews,
    reviewCounts,
    resolvedCounts,
    dominantType,
    sourceTypeReviewCounts,
    totalReviewCount,
    reviewProgress,
  };
}
