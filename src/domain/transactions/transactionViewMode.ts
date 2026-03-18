export type TransactionNatureFilter =
  | "all"
  | "expense"
  | "shared"
  | "internal_transfer"
  | "uncategorized"
  | "untagged";

interface TransactionViewModeInput {
  nature: TransactionNatureFilter;
  uncategorizedCount: number;
  untaggedCount: number;
  sharedExpenseCount: number;
  internalTransferCount: number;
}

export function getTransactionViewMode(input: TransactionViewModeInput) {
  const isFocusedCleanupMode = input.nature === "uncategorized" || input.nature === "untagged";
  const isFlowAuditMode = input.nature === "shared" || input.nature === "internal_transfer";

  const currentCleanupRemaining =
    input.nature === "uncategorized" ? input.uncategorizedCount : input.nature === "untagged" ? input.untaggedCount : null;

  const currentFlowAuditCount =
    input.nature === "shared" ? input.sharedExpenseCount : input.nature === "internal_transfer" ? input.internalTransferCount : null;

  return {
    isFocusedCleanupMode,
    isFlowAuditMode,
    currentCleanupRemaining,
    currentFlowAuditCount,
  };
}
