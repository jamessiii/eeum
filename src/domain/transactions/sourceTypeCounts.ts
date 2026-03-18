import { SOURCE_TYPE_OPTIONS } from "./sourceTypes";
import type { Transaction } from "../../shared/types/models";

export function getSourceTypeCounts(transactions: Transaction[]) {
  return SOURCE_TYPE_OPTIONS.reduce<Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>>((accumulator, sourceType) => {
    accumulator[sourceType] = transactions.filter((transaction) => transaction.sourceType === sourceType).length;
    return accumulator;
  }, {
    manual: 0,
    account: 0,
    card: 0,
    import: 0,
  });
}
