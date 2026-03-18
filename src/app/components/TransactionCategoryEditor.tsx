import type { Category, Transaction } from "../../shared/types/models";

interface TransactionCategoryEditorProps {
  transaction: Transaction;
  categories: Category[];
  categoryName: string | null;
  pendingCategoryId: string;
  selectedCategoryName: string | null;
  onPendingCategoryChange: (categoryId: string) => void;
  onApplyCategory: () => void;
  onClearCategory: () => void;
}

export function TransactionCategoryEditor({
  transaction,
  categories,
  categoryName,
  pendingCategoryId,
  selectedCategoryName,
  onPendingCategoryChange,
  onApplyCategory,
  onClearCategory,
}: TransactionCategoryEditorProps) {
  const canEdit = transaction.status === "active" && transaction.isExpenseImpact;

  return (
    <>
      <div>{categoryName ?? "미분류"}</div>
      {canEdit && transaction.categoryId ? (
        <div className="mt-2">
          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onClearCategory}>
            카테고리 해제
          </button>
        </div>
      ) : null}
      {canEdit ? (
        <>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 180 }}
              value={pendingCategoryId}
              onChange={(event) => onPendingCategoryChange(event.target.value)}
            >
              <option value="">카테고리 선택</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button className="btn btn-outline-primary btn-sm" type="button" disabled={!pendingCategoryId} onClick={onApplyCategory}>
              {transaction.categoryId ? "분류 변경" : "분류 적용"}
            </button>
          </div>
          {pendingCategoryId ? (
            <div className="small text-secondary mt-2">
              이 거래의 카테고리를 <strong>{selectedCategoryName ?? "선택한 카테고리"}</strong>로
              {transaction.categoryId ? " 변경" : " 지정"}합니다.
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
