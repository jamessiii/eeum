import type { Transaction } from "../../shared/types/models";

export type TransactionTypeCounts = Record<Transaction["transactionType"], number>;

export function getTransactionTypeCounts(transactions: Transaction[]): TransactionTypeCounts {
  return transactions.reduce<TransactionTypeCounts>(
    (accumulator, transaction) => {
      accumulator[transaction.transactionType] += 1;
      return accumulator;
    },
    {
      expense: 0,
      income: 0,
      transfer: 0,
      adjustment: 0,
    },
  );
}
