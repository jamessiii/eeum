import { monthKey } from "../../shared/utils/date";
import type { Account, Card, Category, SettlementRecord, Transaction } from "../../shared/types/models";
import { isActiveExpenseTransaction } from "../transactions/meta";

export interface FlowTransferCategoryAmount {
  categoryId: string;
  name: string;
  amount: number;
}

export interface FlowTransferCardAmount {
  cardId: string;
  name: string;
  amount: number;
  transactionCount: number;
}

export interface FlowTransferRow {
  transferKey: string;
  fromAccountId: string;
  toAccountId: string;
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  transactionCount: number;
  categoryAmounts: FlowTransferCategoryAmount[];
  cardAmounts: FlowTransferCardAmount[];
}

export interface MonthlyFlowSummary {
  rows: FlowTransferRow[];
  totalAmount: number;
  totalTransactionCount: number;
}

export interface FlowStatusRow extends FlowTransferRow {
  confirmationRecord: SettlementRecord | null;
  isConfirmed: boolean;
}

export interface FlowStatusSummary {
  rows: FlowStatusRow[];
  confirmationHistory: SettlementRecord[];
  confirmedAmount: number;
  confirmedCount: number;
}

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

function toTransferKey(fromAccountId: string, toAccountId: string) {
  return `${fromAccountId}->${toAccountId}`;
}

export function getMonthlyFlowSummary(
  transactions: Transaction[],
  categories: Category[],
  cards: Card[],
  accounts: Account[],
): MonthlyFlowSummary {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const rowsByKey = new Map<
    string,
    {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      transactionCount: number;
      categoryAmounts: Map<string, FlowTransferCategoryAmount>;
      cardAmounts: Map<string, FlowTransferCardAmount>;
    }
  >();

  for (const transaction of transactions) {
    if (!isActiveExpenseTransaction(transaction)) continue;
    if (!transaction.cardId || !transaction.categoryId) continue;

    const card = cardMap.get(transaction.cardId);
    const category = categoryMap.get(transaction.categoryId);
    if (!card?.linkedAccountId || !category?.linkedAccountId) continue;
    if (card.linkedAccountId === category.linkedAccountId) continue;

    const fromAccount = accountMap.get(category.linkedAccountId);
    const toAccount = accountMap.get(card.linkedAccountId);
    if (!fromAccount || !toAccount) continue;

    const transferKey = toTransferKey(fromAccount.id, toAccount.id);
    const row =
      rowsByKey.get(transferKey) ??
      {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: 0,
        transactionCount: 0,
        categoryAmounts: new Map<string, FlowTransferCategoryAmount>(),
        cardAmounts: new Map<string, FlowTransferCardAmount>(),
      };

    row.amount += transaction.amount;
    row.transactionCount += 1;

    const categoryAmount = row.categoryAmounts.get(category.id) ?? {
      categoryId: category.id,
      name: category.name,
      amount: 0,
    };
    categoryAmount.amount += transaction.amount;
    row.categoryAmounts.set(category.id, categoryAmount);

    const cardAmount = row.cardAmounts.get(card.id) ?? {
      cardId: card.id,
      name: card.name,
      amount: 0,
      transactionCount: 0,
    };
    cardAmount.amount += transaction.amount;
    cardAmount.transactionCount += 1;
    row.cardAmounts.set(card.id, cardAmount);

    rowsByKey.set(transferKey, row);
  }

  const rows = [...rowsByKey.entries()]
    .map(([transferKey, row]) => ({
      transferKey,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      fromAccountName: accountMap.get(row.fromAccountId)?.alias || accountMap.get(row.fromAccountId)?.name || "출금 계좌",
      toAccountName: accountMap.get(row.toAccountId)?.alias || accountMap.get(row.toAccountId)?.name || "카드값 계좌",
      amount: row.amount,
      transactionCount: row.transactionCount,
      categoryAmounts: [...row.categoryAmounts.values()].sort((a, b) => b.amount - a.amount),
      cardAmounts: [...row.cardAmounts.values()].sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    rows,
    totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    totalTransactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0),
  };
}

export function getFlowStatusSummary(
  baseRows: FlowTransferRow[],
  settlements: SettlementRecord[],
  month = monthKey(new Date()),
): FlowStatusSummary {
  const confirmationHistory = [...settlements]
    .filter((item) => item.month === month)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const confirmationMap = new Map<string, SettlementRecord>();
  confirmationHistory.forEach((item) => {
    if (!confirmationMap.has(item.transferKey)) {
      confirmationMap.set(item.transferKey, item);
    }
  });

  const rows = baseRows.map((row) => {
    const confirmationRecord = confirmationMap.get(row.transferKey) ?? null;
    return {
      ...row,
      confirmationRecord,
      isConfirmed: Boolean(confirmationRecord && confirmationRecord.amount === row.amount),
    };
  });

  const confirmedRows = rows.filter((row) => row.isConfirmed);

  return {
    rows,
    confirmationHistory,
    confirmedAmount: confirmedRows.reduce((sum, row) => sum + row.amount, 0),
    confirmedCount: confirmedRows.length,
  };
}

export function getMonthlySharedSettlementSummary(
  transactions: Transaction[],
  _peopleCount: number,
  month = monthKey(new Date()),
): MonthlySharedSettlementSummary {
  const activeTransactions = transactions.filter((transaction) => isActiveExpenseTransaction(transaction) && monthKey(transaction.occurredAt) === month);
  const totalAmount = activeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  return {
    sharedTransactions: activeTransactions,
    totalSharedExpense: totalAmount,
    splitTarget: totalAmount,
    participantCount: 1,
    baseRows: activeTransactions.length
      ? [
          {
            personId: "flow",
            amount: totalAmount,
            delta: totalAmount,
          },
        ]
      : [],
  };
}

export function getSettlementBalanceSummary(
  baseRows: SettlementBaseRow[],
  settlements: SettlementRecord[],
  month = monthKey(new Date()),
): SettlementBalanceSummary {
  const settlementHistory = [...settlements].filter((item) => item.month === month).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const completedSettlementAmount = settlementHistory.reduce((sum, item) => sum + item.amount, 0);
  const rows = baseRows.map((row) => ({
    ...row,
    remainingDelta: Math.max(row.delta - completedSettlementAmount, 0),
  }));

  return {
    settlementHistory,
    completedSettlementAmount,
    rows,
  };
}
