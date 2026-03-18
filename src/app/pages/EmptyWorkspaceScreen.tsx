import { useAppState } from "../state/AppStateProvider";

export function EmptyWorkspaceScreen() {
  const { createDemoWorkspace, createEmptyWorkspace, importWorkbook } = useAppState();

  return (
    <main className="container py-5">
      <section className="hero-panel shadow-sm">
        <span className="hero-kicker">Household Web App</span>
        <h1>서버리스 가계부를 시작합니다</h1>
        <p className="hero-copy">
          빈 모드로 바로 시작하거나 <strong>가계부 v2</strong> 기반 테스트 모드를 먼저 둘러볼 수 있습니다.
          엑셀 파일을 업로드하면 실제 데이터 기반 워크스페이스를 생성합니다.
        </p>
        <div className="d-flex flex-wrap gap-3 mt-4">
          <button className="btn btn-primary btn-lg" onClick={() => createEmptyWorkspace()}>
            데이터 없는 모드
          </button>
          <button className="btn btn-outline-primary btn-lg" onClick={() => createDemoWorkspace()}>
            테스트 모드
          </button>
          <label className="btn btn-dark btn-lg">
            엑셀 업로드
            <input
              hidden
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importWorkbook(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </main>
  );
}
