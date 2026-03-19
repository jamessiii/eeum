import type { Transaction } from "../../shared/types/models";
import { getSourceTypeSummary } from "./sourceTypeSummary";

export interface SourceBreakdownItem {
  sourceType: Transaction["sourceType"];
  count: number;
  expenseAmount: number;
}

export function getSourceBreakdown(transactions: Transaction[]): SourceBreakdownItem[] {
  return getSourceTypeSummary(transactions)
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || b.expenseAmount - a.expenseAmount);
}
