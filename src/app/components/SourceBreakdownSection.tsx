import { Link } from "react-router-dom";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import type { Transaction } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";

interface SourceBreakdownItem {
  sourceType: Transaction["sourceType"];
  count: number;
  expenseAmount: number;
}

interface SourceBreakdownSectionProps {
  items: SourceBreakdownItem[];
  kicker?: string;
  emptyMessage: string;
  buttonVariant?: "primary" | "secondary";
  motionStartIndex?: number;
}

export function SourceBreakdownSection({
  items,
  kicker = "수단 기준 흐름",
  emptyMessage,
  buttonVariant = "primary",
  motionStartIndex = 0,
}: SourceBreakdownSectionProps) {
  return (
    <div className="guide-progress mt-4">
      <span className="section-kicker">{kicker}</span>
      <div className="resource-grid mt-3">
        {items.map((item, index) => (
          <article key={item.sourceType} className="resource-card" style={getMotionStyle(index + motionStartIndex)}>
            <h3>{getSourceTypeLabel(item.sourceType)}</h3>
            <p className="mb-1 text-secondary">이번 달 거래 {item.count}건</p>
            <p className="mb-0 text-secondary">
              이 경로에서 실지출로 반영된 금액은 {formatCurrency(item.expenseAmount)}입니다.
            </p>
            <Link to={`/transactions?sourceType=${item.sourceType}`} className={`btn btn-outline-${buttonVariant} btn-sm mt-3`}>
              {getSourceTypeLabel(item.sourceType)} 거래 보기
            </Link>
          </article>
        ))}
        {!items.length ? <div className="text-secondary">{emptyMessage}</div> : null}
      </div>
    </div>
  );
}
