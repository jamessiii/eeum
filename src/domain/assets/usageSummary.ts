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
