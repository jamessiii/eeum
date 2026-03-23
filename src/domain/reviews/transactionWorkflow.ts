import type { ReviewItem, Transaction } from "../../shared/types/models";

export const TRANSACTION_REVIEW_TYPES = ["duplicate_candidate", "refund_candidate", "category_suggestion"] as const;

export type TransactionReviewType = (typeof TRANSACTION_REVIEW_TYPES)[number];

export function isTransactionReviewType(reviewType: ReviewItem["reviewType"]): reviewType is TransactionReviewType {
  return TRANSACTION_REVIEW_TYPES.includes(reviewType as TransactionReviewType);
}

export function getOpenTransactionWorkflowReviews(reviews: ReviewItem[], transactionMap: Map<string, Transaction>) {
  return reviews
    .filter((review) => review.status === "open" && isTransactionReviewType(review.reviewType))
    .sort((left, right) => {
      if (left.reviewType !== right.reviewType) {
        return (
          TRANSACTION_REVIEW_TYPES.indexOf(left.reviewType as TransactionReviewType) -
          TRANSACTION_REVIEW_TYPES.indexOf(right.reviewType as TransactionReviewType)
        );
      }

      const leftOccurredAt = transactionMap.get(left.primaryTransactionId)?.occurredAt ?? "";
      const rightOccurredAt = transactionMap.get(right.primaryTransactionId)?.occurredAt ?? "";
      if (leftOccurredAt !== rightOccurredAt) {
        return rightOccurredAt.localeCompare(leftOccurredAt);
      }

      return right.confidenceScore - left.confidenceScore;
    });
}

export function getTransactionWorkflowCounts(reviews: ReviewItem[]) {
  return TRANSACTION_REVIEW_TYPES.reduce<Record<TransactionReviewType, number>>(
    (accumulator, reviewType) => ({
      ...accumulator,
      [reviewType]: reviews.filter((review) => review.reviewType === reviewType).length,
    }),
    {
      category_suggestion: 0,
      duplicate_candidate: 0,
      refund_candidate: 0,
    },
  );
}

export function getTransactionWorkflowTransactionIds(review: Pick<ReviewItem, "primaryTransactionId" | "relatedTransactionIds">) {
  return [review.primaryTransactionId, ...review.relatedTransactionIds];
}
