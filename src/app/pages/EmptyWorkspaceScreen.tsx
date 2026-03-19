import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkspaceBundle } from "../../shared/types/models";
import { useAppState } from "../state/AppStateProvider";

export function EmptyWorkspaceScreen() {
  const { commitImportedBundle, createDemoWorkspace, createEmptyWorkspace, previewWorkbookImport } = useAppState();
  const navigate = useNavigate();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [startMode, setStartMode] = useState<"empty" | "demo" | null>(null);
  const isBusy = isPreparingPreview || startMode !== null;

  const previewPostImportPath = previewBundle
    ? previewBundle.reviews.length > 0
      ? "/reviews"
      : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)
        ? "/transactions?cleanup=uncategorized"
        : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0)
          ? "/transactions?cleanup=untagged"
          : "/transactions"
    : "/transactions";

  const previewPostImportLabel = previewBundle
    ? previewBundle.reviews.length > 0
      ? `리뷰 ${previewBundle.reviews.length}건 확인`
      : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)
        ? "미분류 거래 정리"
        : previewBundle.transactions.some((transaction) => transaction.isExpenseImpact && transaction.tagIds.length === 0)
          ? "무태그 거래 정리"
          : "거래 화면 보기"
    : "거래 화면 보기";

  const commitPreviewAndMoveNext = () => {
    if (!previewBundle) return;
    commitImportedBundle(previewBundle, previewFileName);
    setPreviewBundle(null);
    setPreviewFileName("");
    void navigate(previewPostImportPath);
  };

  const handleStartEmptyWorkspace = () => {
    setStartMode("empty");
    try {
      createEmptyWorkspace();
      void navigate("/people");
    } finally {
      setStartMode(null);
    }
  };

  const handleStartDemoWorkspace = async () => {
    setStartMode("demo");
    try {
      await createDemoWorkspace();
      await navigate("/");
    } finally {
      setStartMode(null);
    }
  };

  return (
    <main className="container py-5">
      <section className="hero-panel shadow-sm">
        <span className="hero-kicker">Household Web App</span>
        <h1>가계부를 시작합니다</h1>
        <p className="hero-copy">빈 모드, 테스트 모드, 엑셀 업로드 중 하나로 바로 시작할 수 있습니다.</p>

        <div className="d-flex flex-wrap gap-3 mt-4">
          <label className={`btn btn-primary btn-lg${isBusy ? " disabled" : ""}`} aria-disabled={isBusy}>
            엑셀 업로드
            <input
              hidden
              type="file"
              accept=".xlsx,.xls"
              disabled={isBusy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setIsPreparingPreview(true);
                  setPreviewBundle(null);
                  setPreviewFileName("");
                  try {
                    const bundle = await previewWorkbookImport(file);
                    setPreviewBundle(bundle);
                    setPreviewFileName(file.name);
                  } catch (error) {
                    setPreviewBundle(null);
                    setPreviewFileName("");
                    throw error;
                  } finally {
                    setIsPreparingPreview(false);
                  }
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button className="btn btn-outline-primary btn-lg" disabled={isBusy} onClick={handleStartEmptyWorkspace}>
            빈 가계부로 시작
          </button>
          <button className="btn btn-outline-secondary btn-lg" disabled={isBusy} onClick={() => void handleStartDemoWorkspace()}>
            테스트 모드
          </button>
        </div>

        {isPreparingPreview ? (
          <p className="text-secondary mt-3 mb-0">업로드 미리보기를 준비하고 있습니다.</p>
        ) : null}
        {startMode === "empty" ? (
          <p className="text-secondary mt-3 mb-0">빈 가계부를 만들고 있습니다.</p>
        ) : null}
        {startMode === "demo" ? (
          <p className="text-secondary mt-3 mb-0">테스트 워크스페이스를 준비하고 있습니다.</p>
        ) : null}

        {previewBundle ? (
          <div className="card shadow-sm mt-4 text-start">
            <div className="section-head">
              <div>
                <span className="section-kicker">업로드 미리보기</span>
                <h2 className="section-title">가져올 내용 확인</h2>
              </div>
              <span className="badge text-bg-primary">{previewBundle.workspace.name}</span>
            </div>
            <p className="text-secondary">
              <strong>{previewFileName}</strong> · 거래 {previewBundle.transactions.length}건 · 검토 {previewBundle.reviews.length}건
            </p>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                className="btn btn-primary"
                disabled={isBusy}
                onClick={commitPreviewAndMoveNext}
              >
                이 미리보기로 시작하고 {previewPostImportLabel}
              </button>
              <button
                className="btn btn-outline-secondary"
                disabled={isBusy}
                onClick={() => {
                  setPreviewBundle(null);
                  setPreviewFileName("");
                }}
              >
                업로드 다시 선택
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
