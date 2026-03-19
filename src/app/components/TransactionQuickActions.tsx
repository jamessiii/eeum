import type { Transaction } from "../../shared/types/models";

interface TransactionQuickActionsProps {
  transaction: Transaction;
  onToggleSharedExpense: () => void;
  onToggleInternalTransfer: () => void;
}

export function TransactionQuickActions({
  transaction,
  onToggleSharedExpense,
  onToggleInternalTransfer,
}: TransactionQuickActionsProps) {
  if (transaction.status !== "active") {
    return null;
  }

  return (
    <div className="d-flex flex-wrap gap-2 mt-2">
      {transaction.transactionType === "expense" ? (
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onToggleSharedExpense}>
          {transaction.isSharedExpense ? "공동 해제" : "공동지출"}
        </button>
      ) : null}
      {transaction.transactionType === "transfer" ? (
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onToggleInternalTransfer}>
          {transaction.isInternalTransfer ? "내부이체 해제" : "내부이체"}
        </button>
      ) : null}
    </div>
  );
}
