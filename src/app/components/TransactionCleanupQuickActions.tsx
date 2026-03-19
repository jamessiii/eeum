interface TransactionCleanupQuickActionsProps {
  transactionCount: number;
  activeExpenseCount: number;
  uncategorizedCount: number;
  onShowUncategorized: () => void;
  onShowInternalTransfer: () => void;
  onResetCleanupFilters: () => void;
}

export function TransactionCleanupQuickActions({
  transactionCount,
  activeExpenseCount,
  uncategorizedCount,
  onShowUncategorized,
  onShowInternalTransfer,
  onResetCleanupFilters,
}: TransactionCleanupQuickActionsProps) {
  return (
    <div className="review-summary-panel mb-3">
      <div className="review-summary-copy">
        <strong>빠르게 정리할 거래 고르기</strong>
        <p className="mb-0 text-secondary">
          지금 정리가 많이 필요한 거래만 바로 좁혀 보고, 아래 빠른 정리 도구로 이어서 정리할 수 있습니다.
        </p>
      </div>
      <div className="small text-secondary">
        현재 보이는 거래 {transactionCount}건 중 실지출 {activeExpenseCount}건, 미분류 {uncategorizedCount}건입니다.
      </div>
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={onShowUncategorized}>
          미분류만 보기
        </button>
        <button className="btn btn-outline-primary btn-sm" type="button" onClick={onShowInternalTransfer}>
          내부이체만 보기
        </button>
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onResetCleanupFilters}>
          정리 필터 초기화
        </button>
      </div>
    </div>
  );
}
