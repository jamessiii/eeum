import { TRANSACTION_TYPE_LABELS } from "../../domain/transactions/meta";
import type { Transaction } from "../../shared/types/models";

interface TransactionTypeBadgeProps {
  transaction: Pick<Transaction, "transactionType" | "isExpenseImpact">;
}

export function TransactionTypeBadge({ transaction }: TransactionTypeBadgeProps) {
  return (
    <span className={`badge ${transaction.isExpenseImpact ? "text-bg-danger-subtle" : "text-bg-secondary"}`}>
      {TRANSACTION_TYPE_LABELS[transaction.transactionType]}
    </span>
  );
}
