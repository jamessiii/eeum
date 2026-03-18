import type { Category, Transaction } from "../../shared/types/models";

export interface RecurringMerchantSuggestion {
  merchantName: string;
  count: number;
  amountAverage: number;
  transactionIds: string[];
}

export function getUncategorizedTransactions(transactions: Transaction[]) {
  return transactions
    .filter(
      (transaction) =>
        transaction.status === "active" &&
        transaction.isExpenseImpact &&
        transaction.transactionType === "expense" &&
        !transaction.categoryId,
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function getRecurringMerchantSuggestions(transactions: Transaction[], categories: Category[]) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const merchantMap = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.status !== "active") continue;
    if (!transaction.isExpenseImpact || transaction.transactionType !== "expense") continue;
    if (transaction.categoryId && categoryIds.has(transaction.categoryId)) continue;
    const key = transaction.merchantName.trim();
    if (!key) continue;
    merchantMap.set(key, [...(merchantMap.get(key) ?? []), transaction]);
  }

  return [...merchantMap.entries()]
    .map(([merchantName, items]) => ({
      merchantName,
      count: items.length,
      amountAverage: Math.round(items.reduce((sum, item) => sum + item.amount, 0) / items.length),
      transactionIds: items.map((item) => item.id),
    }))
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.amountAverage - a.amountAverage);
}
