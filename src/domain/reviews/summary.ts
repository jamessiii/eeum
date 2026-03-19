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
  return reviews.filter((review) => review.status === "open");
}

export function getReviewSummary(
  reviews: ReviewItem[],
  transactionMap: Map<string, Transaction>,
): ReviewSummary {
  const openReviews = getOpenReviews(reviews);
  const resolvedReviews: ReviewItem[] = [];
  const dismissedReviews: ReviewItem[] = [];
  const sourceTypeReviewCounts = SOURCE_TYPE_OPTIONS.reduce<Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>>(
    (accumulator, sourceType) => {
      accumulator[sourceType] = 0;
      return accumulator;
    },
    { manual: 0, account: 0, card: 0, import: 0 },
  );

  for (const review of reviews) {
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
  const resolvedCounts = getReviewTypeCounts(resolvedReviews);
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
