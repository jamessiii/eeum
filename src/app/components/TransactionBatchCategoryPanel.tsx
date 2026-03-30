import { AppSelect } from "./AppSelect";
import { formatCurrency } from "../../shared/utils/format";

type TransactionBatchCategoryPanelProps = {
  categories: Array<{ id: string; name: string }>;
  selectedCategoryId: string;
  selectedCategoryName: string | null;
  scopeSummary: string | null;
  transactionCount: number;
  amount: number;
  disabled: boolean;
  onChangeCategory: (categoryId: string) => void;
  onSubmit: () => void;
};

export function TransactionBatchCategoryPanel({
  categories,
  selectedCategoryId,
  selectedCategoryName,
  scopeSummary,
  transactionCount,
  amount,
  disabled,
  onChangeCategory,
  onSubmit,
}: TransactionBatchCategoryPanelProps) {
  return (
    <div className="review-summary-panel mb-3">
      <div className="review-summary-copy">
        <strong>현재 보이는 거래 카테고리 정리</strong>
        <p className="mb-0 text-secondary">
          현재 필터 결과에서 카테고리를 정리하지 않은 추가 거래가 {transactionCount}건 있습니다. 같은 소비 묶음이 보이면
          카테고리를 한 번에 맞춰 통계를 빠르게 정리할 수 있습니다.
        </p>
        {scopeSummary ? <p className="mb-0 mt-2 text-secondary">{scopeSummary}</p> : null}
      </div>
      <form
        className="classification-action-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          onSubmit();
        }}
      >
        <AppSelect
          value={selectedCategoryId}
          onChange={onChangeCategory}
          placeholder="일괄 적용할 카테고리 선택"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          ariaLabel="일괄 카테고리 선택"
        />
        <div className="small text-secondary d-flex align-items-center">
          필터된 추가 거래 전체에 같은 카테고리를 붙입니다.
        </div>
        <button className="btn btn-outline-primary" type="submit" disabled={disabled}>
          카테고리 일괄 적용
        </button>
      </form>
      {selectedCategoryName ? (
        <div className="small text-secondary mt-2">
          지금 보이는 추가 거래 {transactionCount}건 {formatCurrency(amount)}에 카테고리{" "}
          <strong>{selectedCategoryName}</strong>를 적용하게 됩니다.
        </div>
      ) : null}
    </div>
  );
}
