import type { Transaction } from "../../shared/types/models";
import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isActiveSharedExpenseTransaction,
  isUncategorizedExpenseTransaction,
  isUntaggedExpenseTransaction,
} from "./meta";

export interface TransactionFilters {
  transactionType: "all" | Transaction["transactionType"];
  sourceType: "all" | Transaction["sourceType"];
  ownerPersonId: string;
  status: "all" | Transaction["status"];
  nature: "all" | "expense" | "shared" | "internal_transfer" | "uncategorized" | "untagged";
  tagId: string;
  searchQuery: string;
}

export function getFilteredTransactions(transactions: Transaction[], filters: TransactionFilters) {
  const query = filters.searchQuery.trim().toLowerCase();

  return transactions
    .filter((item) => (filters.transactionType === "all" ? true : item.transactionType === filters.transactionType))
    .filter((item) => (filters.sourceType === "all" ? true : item.sourceType === filters.sourceType))
    .filter((item) => (filters.ownerPersonId === "all" ? true : item.ownerPersonId === filters.ownerPersonId))
    .filter((item) => (filters.status === "all" ? true : item.status === filters.status))
    .filter((item) => {
      if (filters.nature === "all") return true;
      if (filters.nature === "expense") return isActiveExpenseImpactTransaction(item);
      if (filters.nature === "shared") return isActiveSharedExpenseTransaction(item);
      if (filters.nature === "internal_transfer") return isActiveInternalTransferTransaction(item);
      if (filters.nature === "uncategorized") return isUncategorizedExpenseTransaction(item);
      if (filters.nature === "untagged") return isUntaggedExpenseTransaction(item);
      return true;
    })
    .filter((item) => (filters.tagId === "all" ? true : item.tagIds.includes(filters.tagId)))
    .filter((item) => {
      if (!query) return true;
      return [item.merchantName, item.description]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
