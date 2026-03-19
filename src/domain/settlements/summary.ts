import { monthKey } from "../../shared/utils/date";
import type { SettlementRecord, Transaction } from "../../shared/types/models";
import { isActiveSharedExpenseTransaction } from "../transactions/meta";

export interface SettlementBaseRow {
  personId: string;
  amount: number;
  delta: number;
}

export interface MonthlySharedSettlementSummary {
  sharedTransactions: Transaction[];
  totalSharedExpense: number;
  splitTarget: number;
  participantCount: number;
  baseRows: SettlementBaseRow[];
}

export interface SettlementBalanceRow extends SettlementBaseRow {
  remainingDelta: number;
}

export interface SettlementBalanceSummary {
  settlementHistory: SettlementRecord[];
  completedSettlementAmount: number;
  rows: SettlementBalanceRow[];
}

export function getMonthlySharedSettlementSummary(
  transactions: Transaction[],
  peopleCount: number,
  month = monthKey(new Date()),
): MonthlySharedSettlementSummary {
  const sharedTransactions = transactions
    .filter((transaction) => isActiveSharedExpenseTransaction(transaction) && monthKey(transaction.occurredAt) === month)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const totalsByPerson = new Map<string, number>();
  for (const transaction of sharedTransactions) {
    const key = transaction.ownerPersonId ?? "shared";
    totalsByPerson.set(key, (totalsByPerson.get(key) ?? 0) + transaction.amount);
  }

  const participantCount = Math.max(peopleCount, 1);
  const totalSharedExpense = [...totalsByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const splitTarget = totalSharedExpense / participantCount;
  const baseRows = [...totalsByPerson.entries()].map(([personId, amount]) => ({
    personId,
    amount,
    delta: amount - splitTarget,
  }));

  return {
    sharedTransactions,
    totalSharedExpense,
    splitTarget,
    participantCount,
    baseRows,
  };
}

export function getSettlementBalanceSummary(
  baseRows: SettlementBaseRow[],
  settlements: SettlementRecord[],
  month = monthKey(new Date()),
): SettlementBalanceSummary {
  const settlementHistory = [...settlements]
    .filter((item) => item.month === month)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const completedSettlementAmount = settlementHistory.reduce((sum, item) => sum + item.amount, 0);

  const remainingDeltaByPerson = new Map(baseRows.map((row) => [row.personId, row.delta]));
  for (const item of settlementHistory) {
    const fromKey = item.fromPersonId ?? "shared";
    const toKey = item.toPersonId ?? "shared";
    if (remainingDeltaByPerson.has(fromKey)) {
      remainingDeltaByPerson.set(fromKey, (remainingDeltaByPerson.get(fromKey) ?? 0) + item.amount);
    }
    if (remainingDeltaByPerson.has(toKey)) {
      remainingDeltaByPerson.set(toKey, (remainingDeltaByPerson.get(toKey) ?? 0) - item.amount);
    }
  }

  const rows = baseRows
    .map((row) => ({
      ...row,
      remainingDelta: remainingDeltaByPerson.get(row.personId) ?? row.delta,
    }))
    .sort((a, b) => Math.abs(b.remainingDelta) - Math.abs(a.remainingDelta));

  return {
    settlementHistory,
    completedSettlementAmount,
    rows,
  };
}
