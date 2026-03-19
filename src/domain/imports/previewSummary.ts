import type { ReviewItem, Transaction } from "../../shared/types/models";
import { getSortedReviewTypeSummary } from "../reviews/summary";
import { getExpenseImpactStats } from "../transactions/expenseImpactStats";
import { getTransactionTypeCounts } from "../transactions/transactionTypeCounts";

export function getImportPreviewTransactionSummary(transactions: Transaction[]) {
  const previewStats = getExpenseImpactStats(transactions);

  return {
    byType: getTransactionTypeCounts(transactions),
    expenseCount: previewStats.activeExpenseCount,
    expenseAmount: previewStats.expenseImpactAmount,
    internalTransferCount: previewStats.internalTransferCount,
    sharedExpenseCount: previewStats.sharedExpenseCount,
  };
}

export function getImportPreviewReviewSummary(reviews: ReviewItem[]) {
  return getSortedReviewTypeSummary(reviews);
}
