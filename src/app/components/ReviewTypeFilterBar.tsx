import type { ReviewItem } from "../../shared/types/models";
import { REVIEW_TYPE_LABELS, REVIEW_TYPE_ORDER } from "../../domain/reviews/meta";

type ReviewFilterValue = "all" | ReviewItem["reviewType"];

interface ReviewTypeFilterBarProps {
  activeFilter: ReviewFilterValue;
  counts: Partial<Record<ReviewItem["reviewType"], number>>;
  totalCount: number;
  onChange: (nextFilter: ReviewFilterValue) => void;
}

export function ReviewTypeFilterBar({ activeFilter, counts, totalCount, onChange }: ReviewTypeFilterBarProps) {
  return (
    <div className="review-filter-bar" role="tablist" aria-label="검토 유형 필터">
      <button
        type="button"
        className={`review-filter-chip${activeFilter === "all" ? " active" : ""}`}
        onClick={() => onChange("all")}
      >
        <span>전체</span>
        <small>{totalCount}건</small>
      </button>
      {REVIEW_TYPE_ORDER.filter((type) => (counts[type] ?? 0) > 0).map((type) => (
        <button
          key={type}
          type="button"
          className={`review-filter-chip${activeFilter === type ? " active" : ""}`}
          onClick={() => onChange(type)}
        >
          <span>{REVIEW_TYPE_LABELS[type]}</span>
          <small>{counts[type] ?? 0}건</small>
        </button>
      ))}
    </div>
  );
}
