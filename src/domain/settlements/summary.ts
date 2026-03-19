import { monthKey } from "../../shared/utils/date";
import type { Transaction } from "../../shared/types/models";
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
