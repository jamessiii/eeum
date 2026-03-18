import { TRANSACTION_STATUS_LABELS } from "../../domain/transactions/meta";
import type { Transaction } from "../../shared/types/models";

interface TransactionStatusBadgeProps {
  transaction: Pick<Transaction, "status">;
}

export function TransactionStatusBadge({ transaction }: TransactionStatusBadgeProps) {
  return (
    <span
      className={`badge ${
        transaction.status === "active"
          ? "text-bg-success"
          : transaction.status === "cancelled"
            ? "text-bg-secondary"
            : "text-bg-info"
      }`}
    >
      {TRANSACTION_STATUS_LABELS[transaction.status]}
    </span>
  );
}
