interface TransactionRowHeaderProps {
  merchantName: string;
  badgeLabel?: string | null;
  helperText?: string | null;
}

export function TransactionRowHeader({
  merchantName,
  badgeLabel,
  helperText,
}: TransactionRowHeaderProps) {
  return (
    <div className="transaction-row-header d-flex flex-wrap justify-content-between align-items-start gap-2">
      <div className="transaction-row-header-copy">
        {badgeLabel ? <span className="transaction-row-header-badge">{badgeLabel}</span> : null}
        <strong>{merchantName}</strong>
        {helperText ? <p className="transaction-row-header-helper mb-0">{helperText}</p> : null}
      </div>
    </div>
  );
}
