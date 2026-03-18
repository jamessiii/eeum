import {
  FLOW_MODE_LABELS,
  getTransactionFlowSummary,
} from "../../domain/transactions/meta";
import type { Transaction } from "../../shared/types/models";
import { TransactionQuickActions } from "./TransactionQuickActions";

interface TransactionNatureCellProps {
  transaction: Transaction;
  onToggleSharedExpense: () => void;
  onToggleInternalTransfer: () => void;
  onToggleExpenseImpact: () => void;
}

export function TransactionNatureCell({
  transaction,
  onToggleSharedExpense,
  onToggleInternalTransfer,
  onToggleExpenseImpact,
}: TransactionNatureCellProps) {
  return (
    <>
      <div className="transaction-nature-stack">
        <span className={`badge ${transaction.isExpenseImpact ? "text-bg-danger-subtle" : "text-bg-secondary-subtle"}`}>
          {transaction.isExpenseImpact ? FLOW_MODE_LABELS.expense : FLOW_MODE_LABELS.nonExpense}
        </span>
        {transaction.isInternalTransfer ? <span className="badge text-bg-info-subtle">내부이체</span> : null}
        {transaction.isSharedExpense ? <span className="badge text-bg-warning-subtle">공동지출</span> : null}
      </div>
      <div className="small text-secondary mt-2">{getTransactionFlowSummary(transaction)}</div>
      <TransactionQuickActions
        transaction={transaction}
        onToggleSharedExpense={onToggleSharedExpense}
        onToggleInternalTransfer={onToggleInternalTransfer}
        onToggleExpenseImpact={onToggleExpenseImpact}
      />
    </>
  );
}
