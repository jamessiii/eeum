import type { Transaction } from "../../shared/types/models";
import type { ManagedLoopGroup } from "./managedLoops";
import { getLoopGroupKey, isLoopEligibleTransaction } from "./loopMatcher";

export type LoopStationInsight = {
  groupKey: string;
  merchantName: string;
  latestOccurredAt: string;
  previousOccurredAt: string | null;
  latestAmount: number;
  averageAmount: number;
  amountDelta: number;
  amountDeltaRate: number | null;
  averageIntervalDays: number;
  latestIntervalDays: number | null;
  intervalSampleCount: number;
  nextExpectedAt: string | null;
  daysUntilNextPurchase: number | null;
  cadenceLabel: string;
  transactionCount: number;
  stabilityScore: number;
};

type LoopCandidate = {
  groupKey: string;
  merchantName: string;
  transactions: Transaction[];
};

function toDateKey(dateLike: string) {
  return dateLike.slice(0, 10);
}

function toUtcDate(dateLike: string) {
  const [year, month, day] = toDateKey(dateLike).split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function diffDays(left: string, right: string) {
  const leftDate = toUtcDate(left);
  const rightDate = toUtcDate(right);
  return Math.max(0, Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000));
}

function addDays(dateLike: string, days: number) {
  const date = toUtcDate(dateLike);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getCadenceLabel(intervalDays: number) {
  if (intervalDays <= 9) return "거의 매주";
  if (intervalDays <= 18) return "격주";
  if (intervalDays <= 40) return "매달";
  if (intervalDays <= 75) return "두 달 주기";
  if (intervalDays <= 120) return "분기 주기";
  return "긴 주기";
}

function getStabilityScore(intervals: number[]) {
  if (!intervals.length) return 0;
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (average <= 0) return 0;
  const variance = intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  const deviation = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - deviation / average));
}

function createLoopInsight(candidate: LoopCandidate, today: string): LoopStationInsight | null {
  const ordered = [...candidate.transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  if (ordered.length < 2) return null;

  const intervals = ordered
    .slice(0, -1)
    .map((transaction, index) => diffDays(transaction.occurredAt, ordered[index + 1].occurredAt))
    .filter((value) => value > 0);

  if (!intervals.length) return null;

  const latest = ordered[0];
  const previous = ordered[1] ?? null;
  const averageIntervalDays = Math.max(1, Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
  const averageAmount = Math.round(ordered.reduce((sum, transaction) => sum + transaction.amount, 0) / ordered.length);
  const amountDelta = previous ? latest.amount - previous.amount : 0;
  const amountDeltaRate = previous && previous.amount !== 0 ? amountDelta / previous.amount : null;
  const nextExpectedAt = addDays(latest.occurredAt, averageIntervalDays);
  const daysUntilNextPurchase = diffDays(nextExpectedAt, today) * -1;
  const clampedDaysUntilNextPurchase = diffDays(today, nextExpectedAt) === 0 ? 0 : daysUntilNextPurchase;

  return {
    groupKey: candidate.groupKey,
    merchantName: latest.merchantName,
    latestOccurredAt: toDateKey(latest.occurredAt),
    previousOccurredAt: previous ? toDateKey(previous.occurredAt) : null,
    latestAmount: latest.amount,
    averageAmount,
    amountDelta,
    amountDeltaRate,
    averageIntervalDays,
    latestIntervalDays: previous ? diffDays(latest.occurredAt, previous.occurredAt) : null,
    intervalSampleCount: intervals.length,
    nextExpectedAt,
    daysUntilNextPurchase: clampedDaysUntilNextPurchase,
    cadenceLabel: getCadenceLabel(averageIntervalDays),
    transactionCount: ordered.length,
    stabilityScore: getStabilityScore(intervals),
  };
}

export function getLoopStationInsights(transactions: Transaction[], today = new Date().toISOString().slice(0, 10)) {
  const candidates = new Map<string, LoopCandidate>();

  for (const transaction of transactions) {
    if (!isLoopEligibleTransaction(transaction)) continue;
    const merchantName = transaction.merchantName.trim();
    if (!merchantName) continue;

    const key = getLoopGroupKey(transaction);
    const current = candidates.get(key);
    if (current) {
      current.transactions.push(transaction);
      continue;
    }

    candidates.set(key, {
      groupKey: key,
      merchantName,
      transactions: [transaction],
    });
  }

  return [...candidates.values()]
    .map((candidate) => createLoopInsight(candidate, today))
    .filter((value): value is LoopStationInsight => Boolean(value))
    .filter((item) => item.transactionCount >= 2 && item.averageIntervalDays <= 180)
    .sort(
      (left, right) =>
        Number(right.stabilityScore > left.stabilityScore) ||
        right.transactionCount - left.transactionCount ||
        Math.abs(left.daysUntilNextPurchase ?? Number.MAX_SAFE_INTEGER) - Math.abs(right.daysUntilNextPurchase ?? Number.MAX_SAFE_INTEGER),
    );
}

export function getLoopStationInsightsFromManagedLoops(managedLoops: ManagedLoopGroup[], today = new Date().toISOString().slice(0, 10)) {
  return managedLoops
    .map((loop) =>
      createLoopInsight(
        {
          groupKey: loop.key,
          merchantName: loop.merchantName,
          transactions: loop.transactions,
        },
        today,
      ),
    )
    .filter((value): value is LoopStationInsight => Boolean(value))
    .sort(
      (left, right) =>
        Number(right.stabilityScore > left.stabilityScore) ||
        right.transactionCount - left.transactionCount ||
        Math.abs(left.daysUntilNextPurchase ?? Number.MAX_SAFE_INTEGER) - Math.abs(right.daysUntilNextPurchase ?? Number.MAX_SAFE_INTEGER),
    );
}
