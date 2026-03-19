import type { Transaction } from "../../shared/types/models";
import { getActiveTransactions } from "../transactions/meta";

export function getPersonUsageSummary(transactions: Transaction[], personId: string) {
  const ownedTransactions = getActiveTransactions(transactions).filter((item) => item.ownerPersonId === personId);
  const sharedExpenseAmount = ownedTransactions.reduce(
    (sum, item) => sum + Number(item.isExpenseImpact && item.isSharedExpense) * item.amount,
    0,
  );

  return {
    ownedTransactions,
    transactionCount: ownedTransactions.length,
    sharedExpenseAmount,
  };
}

export function getAccountUsageSummary(transactions: Transaction[], accountId: string) {
  const linkedTransactions = getActiveTransactions(transactions).filter(
    (item) => item.accountId === accountId || item.fromAccountId === accountId || item.toAccountId === accountId,
  );
  const expenseAmount = linkedTransactions.reduce((sum, item) => sum + Number(item.isExpenseImpact) * item.amount, 0);
  const internalTransferCount = linkedTransactions.reduce(
    (count, item) => count + Number(item.isInternalTransfer),
    0,
  );

  return {
    linkedTransactions,
    transactionCount: linkedTransactions.length,
    expenseAmount,
    internalTransferCount,
  };
}

export function getCardUsageSummary(transactions: Transaction[], cardId: string) {
  const cardTransactions = getActiveTransactions(transactions).filter((item) => item.cardId === cardId);
  const expenseAmount = cardTransactions.reduce((sum, item) => sum + Number(item.isExpenseImpact) * item.amount, 0);

  return {
    cardTransactions,
    transactionCount: cardTransactions.length,
    expenseAmount,
  };
}
