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
  const activeTransactions = transactions.filter(isActiveTransaction);
  const expenseImpactTransactions = activeTransactions.filter(isActiveExpenseImpactTransaction);

  return {
    activeTransactions,
    expenseImpactTransactions,
    activeExpenseCount: expenseImpactTransactions.length,
    internalTransferCount: activeTransactions.filter(isActiveInternalTransferTransaction).length,
    sharedExpenseCount: activeTransactions.filter(isActiveSharedExpenseTransaction).length,
    uncategorizedCount: activeTransactions.filter(isUncategorizedExpenseTransaction).length,
    untaggedCount: activeTransactions.filter(isUntaggedExpenseTransaction).length,
    expenseImpactAmount: expenseImpactTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
  };
}
