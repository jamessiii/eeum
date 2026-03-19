import type { Category, Transaction } from "../../shared/types/models";
import { isActiveExpenseTransaction, isUncategorizedExpenseTransaction } from "../transactions/meta";

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

export interface CategoryCleanupSummary {
  recurringSuggestions: RecurringMerchantSuggestion[];
  recurringSuggestionCount: number;
  uncategorizedTransactions: Transaction[];
  uncategorizedCount: number;
}

interface RecurringMerchantAccumulator {
  merchantName: string;
  count: number;
  minAmount: number;
  maxAmount: number;
  amountSum: number;
  lastOccurredAt: string;
  transactionIds: string[];
  monthKeys: Set<string>;
}

function isRecurringSuggestionCandidate(transaction: Transaction) {
  return isActiveExpenseTransaction(transaction) && !transaction.categoryId;
}

export function getUncategorizedTransactions(transactions: Transaction[]) {
  return transactions
    .filter(isUncategorizedExpenseTransaction)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function getRecurringMerchantSuggestions(transactions: Transaction[], categories: Category[]) {
  void categories;
  const merchantMap = new Map<string, RecurringMerchantAccumulator>();

  for (const transaction of transactions) {
    if (!isRecurringSuggestionCandidate(transaction)) continue;
    const key = transaction.merchantName.trim();
    if (!key) continue;
    const current = merchantMap.get(key);

    if (!current) {
      merchantMap.set(key, {
        merchantName: key,
        count: 1,
        minAmount: transaction.amount,
        maxAmount: transaction.amount,
        amountSum: transaction.amount,
        lastOccurredAt: transaction.occurredAt,
        transactionIds: [transaction.id],
        monthKeys: new Set([transaction.occurredAt.slice(0, 7)]),
      });
      continue;
    }

    current.count += 1;
    current.minAmount = Math.min(current.minAmount, transaction.amount);
    current.maxAmount = Math.max(current.maxAmount, transaction.amount);
    current.amountSum += transaction.amount;
    if (transaction.occurredAt > current.lastOccurredAt) {
      current.lastOccurredAt = transaction.occurredAt;
    }
    current.transactionIds.push(transaction.id);
    current.monthKeys.add(transaction.occurredAt.slice(0, 7));
  }

  return [...merchantMap.entries()]
    .map<RecurringMerchantSuggestion>(([merchantName, item]) => {
      const amountAverage = Math.round(item.amountSum / item.count);
      const amountSpreadRate = amountAverage ? (item.maxAmount - item.minAmount) / amountAverage : 0;
      const confidence: RecurringMerchantSuggestion["confidence"] =
        item.monthKeys.size >= 2 && amountSpreadRate <= 0.35 ? "high" : "medium";

      return {
        merchantName,
        count: item.count,
        monthCount: item.monthKeys.size,
        amountAverage,
        amountSpreadRate,
        confidence,
        lastOccurredAt: item.lastOccurredAt,
        transactionIds: item.transactionIds,
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

export function getRecurringMerchantSuggestionCount(transactions: Transaction[], categories: Category[]) {
  return getRecurringMerchantSuggestions(transactions, categories).length;
}

export function getCategoryCleanupSummary(transactions: Transaction[], categories: Category[]): CategoryCleanupSummary {
  const recurringSuggestions = getRecurringMerchantSuggestions(transactions, categories);
  const uncategorizedTransactions = getUncategorizedTransactions(transactions);

  return {
    recurringSuggestions,
    recurringSuggestionCount: recurringSuggestions.length,
    uncategorizedTransactions,
    uncategorizedCount: uncategorizedTransactions.length,
  };
}
