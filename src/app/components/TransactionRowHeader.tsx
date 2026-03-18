interface TransactionRowHeaderProps {
  merchantName: string;
  description: string | null;
  connectionSummary: string;
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
}

export function TransactionRowHeader({
  merchantName,
  description,
  connectionSummary,
  canEdit,
  isEditing,
  onToggleEdit,
}: TransactionRowHeaderProps) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
      <div>
        <strong>{merchantName}</strong>
        <div className="small text-secondary">{description ?? "설명 없음"}</div>
        <div className="small text-secondary mt-1">{connectionSummary}</div>
      </div>
      {canEdit ? (
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onToggleEdit}>
          {isEditing ? "수정 닫기" : "기본 정보 수정"}
        </button>
      ) : null}
    </div>
  );
}
