import { formatCurrency } from "../../shared/utils/format";

type TransactionBatchTagPanelProps = {
  tags: Array<{ id: string; name: string }>;
  selectedTagId: string;
  selectedTagName: string | null;
  transactionCount: number;
  amount: number;
  disabled: boolean;
  onChangeTag: (tagId: string) => void;
  onSubmit: () => void;
};

export function TransactionBatchTagPanel({
  tags,
  selectedTagId,
  selectedTagName,
  transactionCount,
  amount,
  disabled,
  onChangeTag,
  onSubmit,
}: TransactionBatchTagPanelProps) {
  return (
    <div className="review-summary-panel mb-3">
      <div className="review-summary-copy">
        <strong>현재 보이는 거래 태그 정리</strong>
        <p className="mb-0 text-secondary">
          현재 필터 결과에서 실지출로 잡히는 거래는 {transactionCount}건입니다. 같은 맥락의 거래가 모여 있다면 태그를 한 번에 붙여 이후 검색과 분석
          흐름을 더 빠르게 만들 수 있습니다.
        </p>
      </div>
      <form
        className="classification-action-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          onSubmit();
        }}
      >
        <select className="form-select" value={selectedTagId} onChange={(event) => onChangeTag(event.target.value)}>
          <option value="">일괄 적용할 태그 선택</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <div className="small text-secondary d-flex align-items-center">필터된 실지출 거래 전체에 같은 태그를 붙입니다.</div>
        <button className="btn btn-outline-primary" type="submit" disabled={disabled}>
          태그 일괄 적용
        </button>
      </form>
      {selectedTagName ? (
        <div className="small text-secondary mt-2">
          지금 보이는 실지출 거래 {transactionCount}건, {formatCurrency(amount)}에 태그 <strong>{selectedTagName}</strong>를 붙이게 됩니다.
        </div>
      ) : null}
    </div>
  );
}
