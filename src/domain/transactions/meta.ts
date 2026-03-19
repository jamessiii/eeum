import type { Transaction } from "../../shared/types/models";

export const TRANSACTION_TYPE_LABELS: Record<Transaction["transactionType"], string> = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
  adjustment: "조정",
};

export const TRANSACTION_STATUS_LABELS: Record<Transaction["status"], string> = {
  active: "활성",
  refunded: "환불",
  cancelled: "취소",
};

export const FLOW_MODE_LABELS = {
  expense: "실지출",
  nonExpense: "비지출 흐름",
} as const;

export function isActiveTransaction(transaction: Transaction) {
  return transaction.status === "active";
}

export function getActiveTransactions(transactions: Transaction[]) {
  return transactions.filter(isActiveTransaction);
}

export function isActiveExpenseImpactTransaction(transaction: Transaction) {
  return isActiveTransaction(transaction) && transaction.isExpenseImpact;
}

export function isActiveExpenseTransaction(transaction: Transaction) {
  return isActiveExpenseImpactTransaction(transaction) && transaction.transactionType === "expense";
}

export function isActiveSharedExpenseTransaction(transaction: Transaction) {
  return isActiveExpenseTransaction(transaction) && transaction.isSharedExpense;
}

export function isActiveInternalTransferTransaction(transaction: Transaction) {
  return isActiveTransaction(transaction) && transaction.isInternalTransfer;
}

export function isUncategorizedExpenseTransaction(transaction: Transaction) {
  return isActiveExpenseImpactTransaction(transaction) && !transaction.categoryId;
}

export function isUntaggedExpenseTransaction(transaction: Transaction) {
  return isActiveExpenseImpactTransaction(transaction) && transaction.tagIds.length === 0;
}

export function getTransactionFlowSummary(
  transaction: Pick<Transaction, "transactionType" | "isExpenseImpact" | "isInternalTransfer" | "isSharedExpense">,
) {
  if (transaction.isInternalTransfer) {
    return "내부이체로 처리되어 소비 통계에서는 제외됩니다.";
  }

  if (transaction.isSharedExpense) {
    return "공동지출로 계산되어 정산 화면에도 함께 반영됩니다.";
  }

  if (transaction.isExpenseImpact) {
    return "실지출로 계산되어 소비 통계와 진단에 반영됩니다.";
  }

  if (transaction.transactionType === "income") {
    return "수입 흐름으로 기록되어 지출 통계에서는 제외됩니다.";
  }

  if (transaction.transactionType === "adjustment") {
    return "조정 흐름으로 기록되어 일반 소비 흐름과 분리됩니다.";
  }

  return "비지출 흐름으로 기록되어 소비 통계에서는 제외됩니다.";
}
