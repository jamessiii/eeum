export function LoadingScreen({ message = "이음을 불러오는 중입니다." }: { message?: string }) {
  return (
    <div className="app-loading">
      <div className="spinner-border text-primary" role="status" />
      <p className="mt-3 text-secondary">{message}</p>
    </div>
  );
}
