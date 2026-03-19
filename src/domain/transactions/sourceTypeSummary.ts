import type { Transaction } from "../../shared/types/models";
import { isActiveExpenseImpactTransaction } from "./meta";
import { SOURCE_TYPE_OPTIONS } from "./sourceTypes";

type SourceType = (typeof SOURCE_TYPE_OPTIONS)[number];

export interface SourceTypeSummaryItem {
  sourceType: SourceType;
  count: number;
  expenseAmount: number;
}

export function getSourceTypeSummary(transactions: Transaction[]): SourceTypeSummaryItem[] {
  const summary = SOURCE_TYPE_OPTIONS.reduce<Record<SourceType, SourceTypeSummaryItem>>(
    (accumulator, sourceType) => {
      accumulator[sourceType] = {
        sourceType,
        count: 0,
        expenseAmount: 0,
      };
      return accumulator;
    },
    {
      manual: { sourceType: "manual", count: 0, expenseAmount: 0 },
      account: { sourceType: "account", count: 0, expenseAmount: 0 },
      card: { sourceType: "card", count: 0, expenseAmount: 0 },
      import: { sourceType: "import", count: 0, expenseAmount: 0 },
    },
  );

  for (const transaction of transactions) {
    const current = summary[transaction.sourceType];
    current.count += 1;
    if (isActiveExpenseImpactTransaction(transaction)) {
      current.expenseAmount += transaction.amount;
    }
  }

  return SOURCE_TYPE_OPTIONS.map((sourceType) => summary[sourceType]);
}
