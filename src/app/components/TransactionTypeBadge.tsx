import { TRANSACTION_TYPE_LABELS } from "../../domain/transactions/meta";
import type { Transaction } from "../../shared/types/models";

interface TransactionTypeBadgeProps {
  transaction: Pick<Transaction, "transactionType" | "isExpenseImpact" | "isInternalTransfer">;
}

export function TransactionTypeBadge({ transaction }: TransactionTypeBadgeProps) {
  const label = transaction.isInternalTransfer ? "내부이체" : TRANSACTION_TYPE_LABELS[transaction.transactionType];
  const toneClass = transaction.isInternalTransfer
    ? "text-bg-secondary"
    : transaction.isExpenseImpact
      ? "text-bg-danger-subtle"
      : "text-bg-secondary";

  return (
    <span className={`badge ${toneClass}`}>
      {label}
    </span>
  );
}
