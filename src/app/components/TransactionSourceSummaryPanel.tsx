import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";

interface TransactionSourceSummaryPanelProps {
  totalCount: number;
  sourceTypeCounts: Record<(typeof SOURCE_TYPE_OPTIONS)[number], number>;
  onSelectSourceType: (sourceType: "all" | (typeof SOURCE_TYPE_OPTIONS)[number]) => void;
}

export function TransactionSourceSummaryPanel({
  totalCount,
  sourceTypeCounts,
  onSelectSourceType,
}: TransactionSourceSummaryPanelProps) {
  return (
    <div className="review-summary-panel mb-3">
      <div className="review-summary-copy">
        <strong>현재 보이는 거래 수단 구성</strong>
        <p className="mb-0 text-secondary">거래가 어떤 경로로 들어온 것인지 빠르게 보고, 필요한 수단만 바로 좁혀서 점검할 수 있습니다.</p>
      </div>
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => onSelectSourceType("all")}>
          전체 {totalCount}건
        </button>
        {SOURCE_TYPE_OPTIONS.map((sourceType) => (
          <button
            key={sourceType}
            className="btn btn-outline-secondary btn-sm"
            type="button"
            onClick={() => onSelectSourceType(sourceType)}
          >
            {getSourceTypeLabel(sourceType)} {sourceTypeCounts[sourceType]}건
          </button>
        ))}
      </div>
    </div>
  );
}
