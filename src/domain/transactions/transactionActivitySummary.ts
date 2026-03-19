import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isActiveSharedExpenseTransaction,
  isActiveTransaction,
  isUncategorizedExpenseTransaction,
  isUntaggedExpenseTransaction,
} from "./meta";
import type { Transaction } from "../../shared/types/models";

export function getTransactionActivitySummary(transactions: Transaction[]) {
  const activeTransactions: Transaction[] = [];
  const expenseImpactTransactions: Transaction[] = [];
  let internalTransferCount = 0;
  let sharedExpenseCount = 0;
  let uncategorizedCount = 0;
  let untaggedCount = 0;
  let expenseImpactAmount = 0;

  for (const transaction of transactions) {
    if (!isActiveTransaction(transaction)) continue;

    activeTransactions.push(transaction);

    if (isActiveExpenseImpactTransaction(transaction)) {
      expenseImpactTransactions.push(transaction);
      expenseImpactAmount += transaction.amount;
    }
    if (isActiveInternalTransferTransaction(transaction)) {
      internalTransferCount += 1;
    }
    if (isActiveSharedExpenseTransaction(transaction)) {
      sharedExpenseCount += 1;
    }
    if (isUncategorizedExpenseTransaction(transaction)) {
      uncategorizedCount += 1;
    }
    if (isUntaggedExpenseTransaction(transaction)) {
      untaggedCount += 1;
    }
  }

  return {
    activeTransactions,
    expenseImpactTransactions,
    activeExpenseCount: expenseImpactTransactions.length,
    internalTransferCount,
    sharedExpenseCount,
    uncategorizedCount,
    untaggedCount,
    expenseImpactAmount,
  };
}
