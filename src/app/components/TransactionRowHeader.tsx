interface TransactionRowHeaderProps {
  merchantName: string;
}

export function TransactionRowHeader({
  merchantName,
}: TransactionRowHeaderProps) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
      <div>
        <strong>{merchantName}</strong>
      </div>
    </div>
  );
}
