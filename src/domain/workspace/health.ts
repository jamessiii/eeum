import type { WorkspaceScope } from "../../app/state/selectors";
import { getOpenReviews } from "../reviews/summary";
import { getExpenseImpactStats } from "../transactions/expenseImpactStats";

export interface WorkspaceHealthSummary {
  openReviews: WorkspaceScope["reviews"];
  activeExpenseTransactions: WorkspaceScope["transactions"];
  uncategorizedExpenseTransactions: WorkspaceScope["transactions"];
  untaggedExpenseTransactions: WorkspaceScope["transactions"];
  openReviewCount: number;
  uncategorizedCount: number;
  untaggedCount: number;
  postImportReady: boolean;
}

export function getOpenReviewCount(reviews: Pick<WorkspaceScope, "reviews">["reviews"]) {
  return getOpenReviews(reviews).length;
}

export function getWorkspaceHealthSummary(scope: Pick<WorkspaceScope, "transactions" | "reviews">): WorkspaceHealthSummary {
  const openReviews = getOpenReviews(scope.reviews);
  const openReviewCount = getOpenReviewCount(scope.reviews);
  const stats = getExpenseImpactStats(scope.transactions);

  return {
    openReviews,
    activeExpenseTransactions: stats.activeExpenseTransactions,
    uncategorizedExpenseTransactions: stats.uncategorizedExpenseTransactions,
    untaggedExpenseTransactions: stats.untaggedExpenseTransactions,
    openReviewCount,
    uncategorizedCount: stats.uncategorizedCount,
    untaggedCount: stats.untaggedCount,
    postImportReady:
      openReviewCount === 0 &&
      stats.uncategorizedCount === 0 &&
      stats.untaggedCount === 0,
  };
}
