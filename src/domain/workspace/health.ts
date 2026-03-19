import type { WorkspaceScope } from "../../app/state/selectors";
import {
  isActiveExpenseImpactTransaction,
  isUncategorizedExpenseTransaction,
  isUntaggedExpenseTransaction,
} from "../transactions/meta";

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

export function getWorkspaceHealthSummary(scope: Pick<WorkspaceScope, "transactions" | "reviews">): WorkspaceHealthSummary {
  const openReviews = scope.reviews.filter((item) => item.status === "open");
  const activeExpenseTransactions: WorkspaceScope["transactions"] = [];
  const uncategorizedExpenseTransactions: WorkspaceScope["transactions"] = [];
  const untaggedExpenseTransactions: WorkspaceScope["transactions"] = [];

  for (const transaction of scope.transactions) {
    if (!isActiveExpenseImpactTransaction(transaction)) continue;
    activeExpenseTransactions.push(transaction);

    if (isUncategorizedExpenseTransaction(transaction)) {
      uncategorizedExpenseTransactions.push(transaction);
    }
    if (isUntaggedExpenseTransaction(transaction)) {
      untaggedExpenseTransactions.push(transaction);
    }
  }

  return {
    openReviews,
    activeExpenseTransactions,
    uncategorizedExpenseTransactions,
    untaggedExpenseTransactions,
    openReviewCount: openReviews.length,
    uncategorizedCount: uncategorizedExpenseTransactions.length,
    untaggedCount: untaggedExpenseTransactions.length,
    postImportReady:
      openReviews.length === 0 &&
      uncategorizedExpenseTransactions.length === 0 &&
      untaggedExpenseTransactions.length === 0,
  };
}
