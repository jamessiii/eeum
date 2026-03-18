import type { Tag, Transaction } from "../../shared/types/models";

interface TransactionTagEditorProps {
  transaction: Transaction;
  tags: Tag[];
  pendingTagId: string;
  selectedTagName: string | null;
  onPendingTagChange: (tagId: string) => void;
  onApplyTag: () => void;
  onRemoveTag: (tagId: string) => void;
}

export function TransactionTagEditor({
  transaction,
  tags,
  pendingTagId,
  selectedTagName,
  onPendingTagChange,
  onApplyTag,
  onRemoveTag,
}: TransactionTagEditorProps) {
  const canEdit = transaction.status === "active" && transaction.isExpenseImpact;

  return (
    <>
      {transaction.tagIds.length ? (
        <div className="transaction-tag-row">
          {transaction.tagIds
            .map((tagId) => tags.find((tag) => tag.id === tagId))
            .filter((tag): tag is Tag => Boolean(tag))
            .map((tag) => (
              <span key={tag.id} className="tag-pill" style={{ ["--tag-color" as string]: tag.color }}>
                {tag.name}
                {canEdit ? (
                  <button
                    className="btn btn-link btn-sm p-0 ms-1 text-reset text-decoration-none"
                    type="button"
                    aria-label={`${tag.name} 태그 제거`}
                    onClick={() => onRemoveTag(tag.id)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
        </div>
      ) : null}

      {canEdit ? (
        <>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={pendingTagId} onChange={(event) => onPendingTagChange(event.target.value)}>
              <option value="">태그 선택</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <button className="btn btn-outline-secondary btn-sm" type="button" disabled={!pendingTagId} onClick={onApplyTag}>
              {transaction.tagIds.length ? "태그 더하기" : "태그 추가"}
            </button>
          </div>
          {pendingTagId ? (
            <div className="small text-secondary mt-2">
              이 거래에 태그 <strong>{selectedTagName ?? "선택한 태그"}</strong>를
              {transaction.tagIds.length ? " 추가" : " 적용"}합니다.
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
