import type { Transaction } from "../../shared/types/models";
import { getSourceTypeSummary } from "./sourceTypeSummary";

export function getSourceTypeCounts(transactions: Transaction[]) {
  return getSourceTypeSummary(transactions).reduce<Record<"manual" | "account" | "card" | "import", number>>((accumulator, item) => {
    accumulator[item.sourceType] = item.count;
    return accumulator;
  }, {
    manual: 0,
    account: 0,
    card: 0,
    import: 0,
  });
}
