import type { Transaction } from "../../shared/types/models";
import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isActiveSharedExpenseTransaction,
  isUncategorizedExpenseTransaction,
  isUntaggedExpenseTransaction,
} from "./meta";

export interface ExpenseImpactStats {
  activeExpenseTransactions: Transaction[];
  uncategorizedExpenseTransactions: Transaction[];
  untaggedExpenseTransactions: Transaction[];
  activeExpenseCount: number;
  uncategorizedCount: number;
  untaggedCount: number;
  expenseImpactAmount: number;
  sharedExpenseCount: number;
  sharedExpenseAmount: number;
  internalTransferCount: number;
}

export function getExpenseImpactStats(transactions: Transaction[]): ExpenseImpactStats {
  const activeExpenseTransactions: Transaction[] = [];
  const uncategorizedExpenseTransactions: Transaction[] = [];
  const untaggedExpenseTransactions: Transaction[] = [];
  let expenseImpactAmount = 0;
  let sharedExpenseCount = 0;
  let sharedExpenseAmount = 0;
  let internalTransferCount = 0;

  for (const transaction of transactions) {
    if (isActiveExpenseImpactTransaction(transaction)) {
      const amount = Math.abs(transaction.amount);
      activeExpenseTransactions.push(transaction);
      expenseImpactAmount += amount;

      if (isActiveSharedExpenseTransaction(transaction)) {
        sharedExpenseCount += 1;
        sharedExpenseAmount += amount;
      }
      if (isUncategorizedExpenseTransaction(transaction)) {
        uncategorizedExpenseTransactions.push(transaction);
      }
      if (isUntaggedExpenseTransaction(transaction)) {
        untaggedExpenseTransactions.push(transaction);
      }
    }

    if (isActiveInternalTransferTransaction(transaction)) {
      internalTransferCount += 1;
    }
  }

  return {
    activeExpenseTransactions,
    uncategorizedExpenseTransactions,
    untaggedExpenseTransactions,
    activeExpenseCount: activeExpenseTransactions.length,
    uncategorizedCount: uncategorizedExpenseTransactions.length,
    untaggedCount: untaggedExpenseTransactions.length,
    expenseImpactAmount,
    sharedExpenseCount,
    sharedExpenseAmount,
    internalTransferCount,
  };
}
