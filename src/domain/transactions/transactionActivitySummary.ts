import { isActiveTransaction } from "./meta";
import { getExpenseImpactStats } from "./expenseImpactStats";
import type { Transaction } from "../../shared/types/models";

export function getTransactionActivitySummary(transactions: Transaction[]) {
  const activeTransactions: Transaction[] = [];
  const expenseStats = getExpenseImpactStats(transactions);

  for (const transaction of transactions) {
    if (!isActiveTransaction(transaction)) continue;

    activeTransactions.push(transaction);
  }

  return {
    activeTransactions,
    expenseImpactTransactions: expenseStats.activeExpenseTransactions,
    activeExpenseCount: expenseStats.activeExpenseCount,
    internalTransferCount: expenseStats.internalTransferCount,
    sharedExpenseCount: expenseStats.sharedExpenseCount,
    uncategorizedCount: expenseStats.uncategorizedCount,
    untaggedCount: expenseStats.untaggedCount,
    expenseImpactAmount: expenseStats.expenseImpactAmount,
  };
}
