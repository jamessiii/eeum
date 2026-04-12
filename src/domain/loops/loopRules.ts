import type { Transaction } from "../../shared/types/models";
import {
  getLoopAmountSimilarity,
  getLoopDescriptionKey,
  getLoopGroupKey,
  isLoopEligibleTransaction,
  normalizeLoopText,
  tokenizeLoopDescription,
} from "./loopMatcher";

export type LoopRule = {
  key: string;
  displayName: string;
  merchantKey: string;
  categoryId: string | null;
  descriptionTokens: string[];
  amountAnchor: number;
  intervalDays: number | null;
  sourceTransactionIds: string[];
};

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function diffDays(left: string, right: string) {
  const leftDate = new Date(`${toDateKey(left)}T00:00:00Z`);
  const rightDate = new Date(`${toDateKey(right)}T00:00:00Z`);
  return Math.max(0, Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000));
}

export function buildLoopRules(transactions: Transaction[]) {
  const seedGroups = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    if (!transaction.isLoop || !isLoopEligibleTransaction(transaction)) return;
    const key = getLoopGroupKey(transaction);
    const current = seedGroups.get(key) ?? [];
    current.push(transaction);
    seedGroups.set(key, current);
  });

  return [...seedGroups.entries()].map(([key, items]) => {
    const ordered = [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const merchantKey = normalizeLoopText(ordered[0]?.merchantName ?? "");
    const categoryCounts = new Map<string, number>();
    const descriptionTokenCounts = new Map<string, number>();

    ordered.forEach((transaction) => {
      if (transaction.categoryId) {
        categoryCounts.set(transaction.categoryId, (categoryCounts.get(transaction.categoryId) ?? 0) + 1);
      }
      tokenizeLoopDescription(transaction.description).forEach((token) => {
        descriptionTokenCounts.set(token, (descriptionTokenCounts.get(token) ?? 0) + 1);
      });
    });

    const intervals = ordered
      .slice(0, -1)
      .map((transaction, index) => diffDays(transaction.occurredAt, ordered[index + 1].occurredAt))
      .filter((value) => value > 0);

    return {
      key,
      displayName:
        ordered.find((transaction) => transaction.loopDisplayName?.trim())?.loopDisplayName?.trim() ??
        ordered[0]?.merchantName ??
        "",
      merchantKey,
      categoryId: [...categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ordered[0]?.categoryId ?? null,
      descriptionTokens: [...descriptionTokenCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
        .slice(0, 5)
        .map(([token]) => token),
      amountAnchor: Math.round(ordered.reduce((sum, transaction) => sum + transaction.amount, 0) / Math.max(ordered.length, 1)),
      intervalDays: intervals.length ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) : null,
      sourceTransactionIds: ordered.map((transaction) => transaction.id),
    } satisfies LoopRule;
  });
}

export function matchTransactionToLoopRule(rule: LoopRule, transaction: Transaction) {
  if (!isLoopEligibleTransaction(transaction) || transaction.isLoopIgnored) return false;
  if (transaction.loopGroupOverrideKey?.trim()) {
    return `manual::${transaction.loopGroupOverrideKey.trim()}` === rule.key;
  }
  if (rule.key.startsWith("manual::")) {
    return false;
  }

  const merchantMatches = normalizeLoopText(transaction.merchantName) === rule.merchantKey;
  if (!merchantMatches) return false;

  const categoryMatches = rule.categoryId && transaction.categoryId ? rule.categoryId === transaction.categoryId : true;
  if (!categoryMatches) return false;

  const amountMatches = getLoopAmountSimilarity(rule.amountAnchor, transaction.amount) >= 0.72;
  const descriptionKeyMatches = getLoopDescriptionKey(transaction) !== "memo" && rule.descriptionTokens.includes(getLoopDescriptionKey(transaction));
  const transactionTokenSet = new Set(tokenizeLoopDescription(transaction.description));
  const sharedToken = rule.descriptionTokens.some((token) => transactionTokenSet.has(token));

  return amountMatches || descriptionKeyMatches || sharedToken;
}
