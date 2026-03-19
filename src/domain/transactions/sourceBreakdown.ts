import type { Transaction } from "../../shared/types/models";
import { getSourceTypeSummary } from "./sourceTypeSummary";

export interface SourceBreakdownItem {
  sourceType: Transaction["sourceType"];
  count: number;
  expenseAmount: number;
}

export interface DominantSourceBreakdownItem extends SourceBreakdownItem {
  share: number;
}

export function getSourceBreakdown(transactions: Transaction[]): SourceBreakdownItem[] {
  return getSourceTypeSummary(transactions)
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || b.expenseAmount - a.expenseAmount);
}

export function getDominantSourceBreakdown(
  items: SourceBreakdownItem[],
  totalTransactionCount: number,
): DominantSourceBreakdownItem | null {
  const dominantSource = items[0];
  if (!dominantSource) return null;

  return {
    ...dominantSource,
    share: dominantSource.count / Math.max(1, totalTransactionCount),
  };
}
