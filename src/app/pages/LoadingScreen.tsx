export function LoadingScreen() {
  return (
    <div className="app-loading">
      <div className="spinner-border text-primary" role="status" />
      <p className="mt-3 text-secondary">가계부 상태를 불러오는 중입니다.</p>
    </div>
  );
}
