import type { ReviewItem } from "../../shared/types/models";

export type ReviewType = ReviewItem["reviewType"];

export const REVIEW_TYPE_ORDER: ReviewType[] = [
  "duplicate_candidate",
  "refund_candidate",
  "uncategorized_transaction",
  "internal_transfer_candidate",
  "shared_expense_candidate",
];

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  duplicate_candidate: "중복 후보",
  refund_candidate: "환불 연결 후보",
  uncategorized_transaction: "미분류 거래",
  internal_transfer_candidate: "내부이체 후보",
  shared_expense_candidate: "공동지출 후보",
};

export const REVIEW_ACTION_LABELS: Record<ReviewType, string> = {
  duplicate_candidate: "중복으로 제외",
  refund_candidate: "환불로 연결",
  uncategorized_transaction: "검토 완료",
  internal_transfer_candidate: "내부이체로 확정",
  shared_expense_candidate: "공동지출로 확정",
};
