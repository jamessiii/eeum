import { useState } from "react";
import type { WorkspaceBundle } from "../../shared/types/models";
import { useAppState } from "../state/AppStateProvider";

export function EmptyWorkspaceScreen() {
  const { commitImportedBundle, createDemoWorkspace, createEmptyWorkspace, previewWorkbookImport } = useAppState();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);

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
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setIsPreparingPreview(true);
                  try {
                    const bundle = await previewWorkbookImport(file);
                    setPreviewBundle(bundle);
                    setPreviewFileName(file.name);
                  } finally {
                    setIsPreparingPreview(false);
                  }
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {isPreparingPreview ? <p className="text-secondary mt-3 mb-0">엑셀 데이터를 분석해서 미리보기를 준비하고 있습니다.</p> : null}
        {previewBundle ? (
          <div className="card shadow-sm mt-4 text-start">
            <div className="section-head">
              <div>
                <span className="section-kicker">업로드 미리보기</span>
                <h2 className="section-title">새 워크스페이스로 가져올 내용을 확인하세요</h2>
              </div>
              <span className="badge text-bg-primary">{previewBundle.workspace.name}</span>
            </div>
            <p className="text-secondary">
              <strong>{previewFileName}</strong> 파일에서 거래 {previewBundle.transactions.length}건과 검토 항목{" "}
              {previewBundle.reviews.length}건을 가져올 예정입니다.
            </p>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                className="btn btn-primary"
                onClick={() => {
                  commitImportedBundle(previewBundle, previewFileName);
                  setPreviewBundle(null);
                  setPreviewFileName("");
                }}
              >
                이 미리보기로 시작하기
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => {
                  setPreviewBundle(null);
                  setPreviewFileName("");
                }}
              >
                다시 선택하기
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
