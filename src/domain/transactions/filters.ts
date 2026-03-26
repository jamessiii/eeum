import type { Transaction } from "../../shared/types/models";
import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isUncategorizedExpenseTransaction,
} from "./meta";

export interface TransactionFilters {
  transactionType: "all" | Transaction["transactionType"];
  sourceType: "all" | Transaction["sourceType"];
  ownerPersonId: string;
  categoryId: string;
  status: "all" | Transaction["status"];
  nature: "all" | "expense" | "internal_transfer" | "uncategorized";
  searchQuery: string;
}

export function resetTransactionCleanupFilters(filters: TransactionFilters): TransactionFilters {
  return {
    ...filters,
    nature: "all",
    searchQuery: "",
  };
}

export function clearTransactionSearchQuery(filters: TransactionFilters): TransactionFilters {
  return {
    ...filters,
    searchQuery: "",
  };
}

export function getFilteredTransactions(transactions: Transaction[], filters: TransactionFilters) {
  const query = filters.searchQuery.trim().toLowerCase();

  return transactions
    .filter((item) => (filters.transactionType === "all" ? true : item.transactionType === filters.transactionType))
    .filter((item) => (filters.sourceType === "all" ? true : item.sourceType === filters.sourceType))
    .filter((item) => (filters.ownerPersonId === "all" ? true : item.ownerPersonId === filters.ownerPersonId))
    .filter((item) => (filters.categoryId === "all" ? true : item.categoryId === filters.categoryId))
    .filter((item) => (filters.status === "all" ? true : item.status === filters.status))
    .filter((item) => {
      if (filters.nature === "all") return true;
      if (filters.nature === "expense") return isActiveExpenseImpactTransaction(item);
      if (filters.nature === "internal_transfer") return isActiveInternalTransferTransaction(item);
      if (filters.nature === "uncategorized") return isUncategorizedExpenseTransaction(item);
      return true;
    })
    .filter((item) => {
      if (!query) return true;
      return [item.merchantName, item.description]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
