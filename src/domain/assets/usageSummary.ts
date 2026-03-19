import type { Transaction } from "../../shared/types/models";

export function getPersonUsageSummary(transactions: Transaction[], personId: string) {
  const ownedTransactions = transactions.filter((item) => item.ownerPersonId === personId);
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
  const linkedTransactions = transactions.filter(
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
  const cardTransactions = transactions.filter((item) => item.cardId === cardId);
  const expenseAmount = cardTransactions.reduce((sum, item) => sum + Number(item.isExpenseImpact) * item.amount, 0);

  return {
    cardTransactions,
    transactionCount: cardTransactions.length,
    expenseAmount,
  };
}
