import type { Transaction } from "../../shared/types/models";
import { isActiveExpenseImpactTransaction } from "./meta";
import { SOURCE_TYPE_OPTIONS } from "./sourceTypes";

export interface SourceBreakdownItem {
  sourceType: Transaction["sourceType"];
  count: number;
  expenseAmount: number;
}

export function getSourceBreakdown(transactions: Transaction[]): SourceBreakdownItem[] {
  return SOURCE_TYPE_OPTIONS.map((sourceType) => {
    const sourceTransactions = transactions.filter((transaction) => transaction.sourceType === sourceType);

    return {
      sourceType,
      count: sourceTransactions.length,
      expenseAmount: sourceTransactions.filter(isActiveExpenseImpactTransaction).reduce((sum, transaction) => sum + transaction.amount, 0),
    };
  }).filter((item) => item.count > 0);
}
