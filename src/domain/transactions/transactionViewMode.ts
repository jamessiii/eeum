export type TransactionNatureFilter =
  | "all"
  | "expense"
  | "internal_transfer"
  | "uncategorized";

interface TransactionViewModeInput {
  nature: TransactionNatureFilter;
  uncategorizedCount: number;
  internalTransferCount: number;
}

export function getTransactionViewMode(input: TransactionViewModeInput) {
  const isFocusedCleanupMode = input.nature === "uncategorized";
  const isFlowAuditMode = input.nature === "internal_transfer";

  const currentCleanupRemaining = input.nature === "uncategorized" ? input.uncategorizedCount : null;

  const currentFlowAuditCount = input.nature === "internal_transfer" ? input.internalTransferCount : null;

  return {
    isFocusedCleanupMode,
    isFlowAuditMode,
    currentCleanupRemaining,
    currentFlowAuditCount,
  };
}
