import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkspaceBundle } from "../../shared/types/models";
import { useAppState } from "../state/AppStateProvider";

function getNextPath(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return "/reviews";
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "/transactions?cleanup=uncategorized";
  }
  return "/transactions";
}

function getNextLabel(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return `검토 ${bundle.reviews.length}건 확인`;
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "미분류 거래 정리";
  }
  return "거래 화면 보기";
}

export function EmptyWorkspaceScreen() {
  const { commitImportedBundle, createDemoWorkspace, createEmptyWorkspace, previewWorkbookImport } = useAppState();
  const navigate = useNavigate();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [startMode, setStartMode] = useState<"empty" | "demo" | null>(null);
  const isBusy = isPreparingPreview || startMode !== null;

  const handleCommitPreview = () => {
    if (!previewBundle) return;
    commitImportedBundle(previewBundle, previewFileName);
    const nextPath = getNextPath(previewBundle);
    setPreviewBundle(null);
    setPreviewFileName("");
    void navigate(nextPath);
  };

  return (
    <main className="container py-5">
      <section className="hero-panel shadow-sm">
        <span className="hero-kicker">Household Web App</span>
        <h1>가계부를 시작합니다</h1>
        <p className="hero-copy">빈 워크스페이스로 시작하거나, 데모를 보거나, 거래 파일을 업로드해서 바로 이어갈 수 있습니다.</p>

        <div className="d-flex flex-wrap gap-3 mt-4">
          <label className={`btn btn-primary btn-lg${isBusy ? " disabled" : ""}`} aria-disabled={isBusy}>
            파일 업로드
            <input
              hidden
              type="file"
              accept=".xlsx,.xls"
              disabled={isBusy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setIsPreparingPreview(true);
                try {
                  const bundle = await previewWorkbookImport(file);
                  setPreviewBundle(bundle);
                  setPreviewFileName(file.name);
                } finally {
                  setIsPreparingPreview(false);
                  event.currentTarget.value = "";
                }
              }}
            />
          </label>
          <button
            className="btn btn-outline-primary btn-lg"
            disabled={isBusy}
            onClick={() => {
              setStartMode("empty");
              try {
                createEmptyWorkspace();
                void navigate("/people");
              } finally {
                setStartMode(null);
              }
            }}
          >
            빈 가계부로 시작
          </button>
          <button
            className="btn btn-outline-secondary btn-lg"
            disabled={isBusy}
            onClick={async () => {
              setStartMode("demo");
              try {
                await createDemoWorkspace();
                await navigate("/");
              } finally {
                setStartMode(null);
              }
            }}
          >
            데모 보기
          </button>
        </div>

        {isPreparingPreview ? <p className="text-secondary mt-3 mb-0">업로드 미리보기를 준비하고 있습니다.</p> : null}
        {startMode === "empty" ? <p className="text-secondary mt-3 mb-0">새 워크스페이스를 만드는 중입니다.</p> : null}
        {startMode === "demo" ? <p className="text-secondary mt-3 mb-0">데모 데이터를 준비하는 중입니다.</p> : null}

        {previewBundle ? (
          <div className="card shadow-sm mt-4 text-start">
            <div className="section-head">
              <div>
                <span className="section-kicker">업로드 미리보기</span>
                <h2 className="section-title">{previewFileName}</h2>
              </div>
            </div>
            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">거래</span>
                <strong>{previewBundle.transactions.length}건</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">검토</span>
                <strong>{previewBundle.reviews.length}건</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">사용자</span>
                <strong>{previewBundle.people.length}명</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">계좌/카드</span>
                <strong>
                  {previewBundle.accounts.length} / {previewBundle.cards.length}
                </strong>
              </article>
            </div>
            <div className="action-row mt-4">
              <button className="btn btn-primary" type="button" onClick={handleCommitPreview}>
                {getNextLabel(previewBundle)}
              </button>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setPreviewBundle(null)}>
                미리보기 닫기
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
