import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ImportsPage() {
  const { importWorkbook, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const imports = getWorkspaceScope(state, workspaceId).imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt));

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">업로드 센터</span>
          <h2 className="section-title">워크북 가져오기</h2>
        </div>
      </div>
      <p className="text-secondary">
        현재는 <strong>가계부 v2 워크북</strong> 업로드를 지원합니다. 현대카드, 우리카드, 삼성카드 명세서 전용 파서와 일반화된 규칙 기반 파서는 2차 작업으로 남겨두었습니다.
      </p>
      <label className="upload-dropzone">
        <div>
          <strong>엑셀 워크북 업로드</strong>
          <p className="mb-0 text-secondary">업로드한 파일로 새로운 워크스페이스를 생성하고 거래를 정규화합니다.</p>
        </div>
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

      <div className="mt-4">
        <h3 className="mb-3">업로드 이력</h3>
        <div className="review-list">
          {imports.map((item) => (
            <article key={item.id} className="review-card">
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <span className="review-type">{item.parserId}</span>
                  <h3>{item.fileName}</h3>
                  <p className="mb-0 text-secondary">
                    {item.importedAt.slice(0, 19).replace("T", " ")} · 행 {item.rowCount}개 · 검토 {item.reviewCount}건
                  </p>
                </div>
              </div>
            </article>
          ))}
          {!imports.length ? <p className="text-secondary mb-0">아직 업로드 이력이 없습니다.</p> : null}
        </div>
      </div>
    </section>
  );
}
