import type { Category, Transaction } from "../../shared/types/models";

export interface RecurringMerchantSuggestion {
  merchantName: string;
  count: number;
  monthCount: number;
  amountAverage: number;
  amountSpreadRate: number;
  confidence: "high" | "medium";
  lastOccurredAt: string;
  transactionIds: string[];
}

function getAmountSpreadRate(amounts: number[]) {
  if (!amounts.length) return 0;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  if (!average) return 0;
  return (max - min) / average;
}

function isUncategorizedExpenseCandidate(transaction: Transaction) {
  return (
    transaction.status === "active" &&
    transaction.isExpenseImpact &&
    transaction.transactionType === "expense" &&
    !transaction.categoryId
  );
}

function isRecurringSuggestionCandidate(transaction: Transaction, categoryIds: Set<string>) {
  if (!isUncategorizedExpenseCandidate(transaction)) return false;
  if (transaction.categoryId && categoryIds.has(transaction.categoryId)) return false;
  return true;
}

export function getUncategorizedTransactions(transactions: Transaction[]) {
  return transactions
    .filter(isUncategorizedExpenseCandidate)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function getRecurringMerchantSuggestions(transactions: Transaction[], categories: Category[]) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const merchantMap = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (!isRecurringSuggestionCandidate(transaction, categoryIds)) continue;
    const key = transaction.merchantName.trim();
    if (!key) continue;
    merchantMap.set(key, [...(merchantMap.get(key) ?? []), transaction]);
  }

  return [...merchantMap.entries()]
    .map<RecurringMerchantSuggestion>(([merchantName, items]) => {
      const monthSet = new Set(items.map((item) => item.occurredAt.slice(0, 7)));
      const amounts = items.map((item) => item.amount);
      const amountAverage = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length);
      const amountSpreadRate = getAmountSpreadRate(amounts);
      const confidence: RecurringMerchantSuggestion["confidence"] =
        monthSet.size >= 2 && amountSpreadRate <= 0.35 ? "high" : "medium";

      return {
        merchantName,
        count: items.length,
        monthCount: monthSet.size,
        amountAverage,
        amountSpreadRate,
        confidence,
        lastOccurredAt: [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]?.occurredAt ?? "",
        transactionIds: items.map((item) => item.id),
      };
    })
    .filter((item) => item.count >= 2 && item.monthCount >= 2)
    .sort(
      (a, b) =>
        Number(b.confidence === "high") - Number(a.confidence === "high") ||
        b.monthCount - a.monthCount ||
        b.count - a.count ||
        b.amountAverage - a.amountAverage,
    );
}
