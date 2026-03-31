import type { Transaction } from "../../shared/types/models";
import { isLoopEligibleTransaction } from "./loopMatcher";
import { buildLoopRules, matchTransactionToLoopRule, type LoopRule } from "./loopRules";

export type ManagedLoopGroup = {
  key: string;
  merchantName: string;
  transactionIds: string[];
  transactions: Transaction[];
  latestOccurredAt: string;
  latestAmount: number;
  averageAmount: number;
  averageIntervalDays: number | null;
  transactionCount: number;
  categoryId: string | null;
  descriptionSamples: string[];
};

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function diffDays(left: string, right: string) {
  const leftDate = new Date(`${toDateKey(left)}T00:00:00Z`);
  const rightDate = new Date(`${toDateKey(right)}T00:00:00Z`);
  return Math.max(0, Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000));
}

export function getManagedLoopGroups(transactions: Transaction[], loopRules = buildLoopRules(transactions)) {
  const groups = new Map<string, Transaction[]>();
  const ruleMap = new Map<string, LoopRule>(loopRules.map((rule) => [rule.key, rule]));

  for (const transaction of transactions) {
    if (!isLoopEligibleTransaction(transaction) || transaction.isLoopIgnored) continue;
    const merchantName = transaction.merchantName.trim();
    if (!merchantName) continue;

    const matchedRule = loopRules.find((rule) => matchTransactionToLoopRule(rule, transaction));
    if (!matchedRule) continue;
    const key = matchedRule.key;
    const current = groups.get(key);
    if (current) {
      current.push(transaction);
      continue;
    }
    groups.set(key, [transaction]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const ordered = [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
      const latest = ordered[0];
      const rule = ruleMap.get(key) ?? null;
      const intervals = ordered
        .slice(0, -1)
        .map((transaction, index) => diffDays(transaction.occurredAt, ordered[index + 1].occurredAt))
        .filter((value) => value > 0);
      const averageIntervalDays = intervals.length
        ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
        : null;
      const averageAmount = Math.round(ordered.reduce((sum, transaction) => sum + transaction.amount, 0) / ordered.length);
      const categoryCounts = new Map<string, number>();

      ordered.forEach((transaction) => {
        if (!transaction.categoryId) return;
        categoryCounts.set(transaction.categoryId, (categoryCounts.get(transaction.categoryId) ?? 0) + 1);
      });

      const categoryId =
        [...categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? latest.categoryId ?? null;

      return {
        key,
        merchantName: rule?.displayName ?? latest.loopDisplayName?.trim() ?? latest.merchantName,
        transactionIds: ordered.map((transaction) => transaction.id),
        transactions: ordered,
        latestOccurredAt: toDateKey(latest.occurredAt),
        latestAmount: latest.amount,
        averageAmount,
        averageIntervalDays: rule?.intervalDays ?? averageIntervalDays,
        transactionCount: ordered.length,
        categoryId: rule?.categoryId ?? categoryId,
        descriptionSamples: Array.from(
          new Set(ordered.map((transaction) => transaction.description.trim()).filter(Boolean)),
        ).slice(0, 3),
      } satisfies ManagedLoopGroup;
    })
    .sort(
      (left, right) =>
        right.transactionCount - left.transactionCount ||
        right.latestOccurredAt.localeCompare(left.latestOccurredAt) ||
        left.merchantName.localeCompare(right.merchantName, "ko"),
    );
}
