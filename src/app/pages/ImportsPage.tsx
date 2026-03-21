import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { WorkspaceBundle } from "../../shared/types/models";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function normalizeCardKey(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function getPostImportPath(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return "/reviews";
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "/transactions?cleanup=uncategorized";
  }
  return "/transactions";
}

function getPostImportLabel(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return `검토 ${bundle.reviews.length}건 확인`;
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "미분류 거래 정리";
  }
  return "거래 화면 보기";
}

export function ImportsPage() {
  const { commitImportedBundle, previewWorkbookImport, state } = useAppState();
  const navigate = useNavigate();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [selectedImportOwnerId, setSelectedImportOwnerId] = useState("");
  const [importCardNameDrafts, setImportCardNameDrafts] = useState<Record<string, string>>({});
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const recentImports = [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));

  const previewCardMatches = (previewBundle?.cards ?? []).map((card) => {
    const matchedCard =
      scope.cards.find(
        (existing) =>
          existing.issuerName === card.issuerName &&
          existing.cardNumberMasked &&
          card.cardNumberMasked &&
          normalizeCardKey(existing.cardNumberMasked) === normalizeCardKey(card.cardNumberMasked),
      ) ??
      scope.cards.find((existing) => normalizeCardKey(existing.name) === normalizeCardKey(card.name));

    return {
      card,
      matchedCard,
      draftName: importCardNameDrafts[card.id] ?? card.name,
    };
  });

  const commitPreview = () => {
    if (!previewBundle || !selectedImportOwnerId) return;
    const renamedCards = previewBundle.cards.map((card) => {
      const matchedCard =
        scope.cards.find(
          (existing) =>
            existing.issuerName === card.issuerName &&
            existing.cardNumberMasked &&
            card.cardNumberMasked &&
            normalizeCardKey(existing.cardNumberMasked) === normalizeCardKey(card.cardNumberMasked),
        ) ??
        scope.cards.find((existing) => normalizeCardKey(existing.name) === normalizeCardKey(card.name));

      return {
        ...card,
        name: matchedCard?.name ?? ((importCardNameDrafts[card.id] ?? card.name).trim() || card.name),
      };
    });
    const normalizedBundle: WorkspaceBundle = {
      ...previewBundle,
      people: [],
      accounts: previewBundle.accounts.map((account) => ({
        ...account,
        ownerPersonId: account.isShared ? null : selectedImportOwnerId,
      })),
      cards: renamedCards.map((card) => ({
        ...card,
        ownerPersonId: selectedImportOwnerId,
      })),
      transactions: previewBundle.transactions.map((transaction) => ({
        ...transaction,
        ownerPersonId: selectedImportOwnerId,
      })),
    };
    const nextPath = getPostImportPath(normalizedBundle);
    commitImportedBundle(normalizedBundle, previewFileName);
    setPreviewBundle(null);
    setPreviewFileName("");
    setSelectedImportOwnerId("");
    setImportCardNameDrafts({});
    void navigate(nextPath);
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 센터</span>
            <h2 className="section-title">거래 파일 가져오기</h2>
          </div>
        </div>
        <p className="text-secondary">
          엑셀 파일을 올리면 바로 반영하지 않고 먼저 미리보기로 검토합니다. 확인 후 한 번에 가져오면 됩니다.
        </p>

        <div className="d-flex flex-wrap gap-2 mb-4">
          <Link to="/people" className="btn btn-outline-secondary btn-sm">
            사용자 관리
          </Link>
          <Link to="/accounts" className="btn btn-outline-secondary btn-sm">
            계좌 관리
          </Link>
          <Link to="/cards" className="btn btn-outline-secondary btn-sm">
            카드 관리
          </Link>
        </div>

        <label className="upload-dropzone">
          <div>
            <strong>가계부 파일 업로드</strong>
            <p className="mb-0 text-secondary">미리보기에서 거래 수, 검토 수, 자산 정보를 먼저 확인합니다.</p>
          </div>
          <input
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setIsPreparingPreview(true);
              try {
                const bundle = await previewWorkbookImport(file);
                setPreviewBundle(bundle);
                setPreviewFileName(file.name);
                setSelectedImportOwnerId("");
                setImportCardNameDrafts(
                  Object.fromEntries(bundle.cards.map((card) => [card.id, card.name])),
                );
              } finally {
                setIsPreparingPreview(false);
                event.currentTarget.value = "";
              }
            }}
          />
        </label>

        {isPreparingPreview ? <p className="text-secondary mt-3 mb-0">업로드 미리보기를 준비하고 있습니다.</p> : null}

        {previewBundle ? (
          <div className="card shadow-sm mt-4">
            <div className="section-head">
              <div>
                <span className="section-kicker">미리보기</span>
                <h3 className="section-title">{previewFileName}</h3>
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
            <div className="mt-4">
              <label className="form-label" htmlFor="import-owner-person">
                사용자 선택
              </label>
              <select
                id="import-owner-person"
                className="form-select"
                value={selectedImportOwnerId}
                onChange={(event) => setSelectedImportOwnerId(event.target.value)}
                disabled={!scope.people.length}
              >
                <option value="">누구의 명세서인지 선택</option>
                {scope.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName || person.name}
                  </option>
                ))}
              </select>
              {!scope.people.length ? (
                <p className="text-secondary mt-2 mb-0">업로드 전에 사용자를 먼저 등록해야 합니다.</p>
              ) : (
                <p className="text-secondary mt-2 mb-0">선택한 사용자에게 이번 명세서의 카드와 거래를 연결합니다.</p>
              )}
            </div>
            {previewCardMatches.length ? (
              <div className="mt-4">
                <label className="form-label mb-2">카드 확인</label>
                <div className="review-list">
                  {previewCardMatches.map(({ card, matchedCard, draftName }) => (
                    <article key={card.id} className="review-card">
                      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                        <div>
                          <h3 className="mb-1">{card.name}</h3>
                          <p className="mb-0 text-secondary">
                            {card.issuerName}
                            {card.cardNumberMasked ? ` · ${card.cardNumberMasked}` : ""}
                          </p>
                        </div>
                        {matchedCard ? (
                          <span className="badge text-bg-success">기존 카드 사용</span>
                        ) : (
                          <span className="badge text-bg-warning">새 카드 인식</span>
                        )}
                      </div>
                      {matchedCard ? (
                        <p className="text-secondary mt-2 mb-0">
                          기존 카드 <strong>{matchedCard.name}</strong>에 연결해서 가져옵니다.
                        </p>
                      ) : (
                        <div className="mt-3">
                          <label className="form-label mb-1" htmlFor={`import-card-name-${card.id}`}>
                            새 카드 이름
                          </label>
                          <input
                            id={`import-card-name-${card.id}`}
                            className="form-control"
                            value={draftName}
                            onChange={(event) =>
                              setImportCardNameDrafts((current) => ({
                                ...current,
                                [card.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="action-row mt-4">
              <button
                className="btn btn-primary"
                type="button"
                onClick={commitPreview}
                disabled={!selectedImportOwnerId || !scope.people.length}
              >
                {getPostImportLabel(previewBundle)}
              </button>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setPreviewBundle(null)}>
                미리보기 닫기
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">최근 업로드</span>
            <h2 className="section-title">가져온 기록</h2>
          </div>
        </div>
        {!recentImports.length ? (
          <p className="text-secondary mb-0">아직 업로드한 기록이 없습니다.</p>
        ) : (
          <div className="review-list">
            {recentImports.slice(0, 8).map((item, index) => (
              <article key={item.id} className="review-card" style={getMotionStyle(index + 2)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <h3>{item.fileName}</h3>
                    <p className="mb-1 text-secondary">{item.importedAt.slice(0, 16).replace("T", " ")}</p>
                    <p className="mb-0 text-secondary">
                      거래 {item.rowCount}건 · 검토 {item.reviewCount}건
                    </p>
                  </div>
                  <Link className="btn btn-outline-secondary btn-sm" to={item.reviewCount > 0 ? "/reviews" : "/transactions"}>
                    {item.reviewCount > 0 ? "검토 보기" : "거래 보기"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
