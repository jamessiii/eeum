import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { AppModal } from "../components/AppModal";
import type { Account, Card, ImportRecord, WorkspaceBundle } from "../../shared/types/models";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function normalizeCardKey(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function getVisibleCardIdentifier(cardNumberMasked: string) {
  const trimmed = cardNumberMasked.trim();
  if (!trimmed) return "";
  return /\d/.test(trimmed) ? trimmed : "";
}

function isWorkbookFile(file: File) {
  return /\.xlsx?$/.test(file.name.toLowerCase());
}

function findMatchedCardInCandidates(existingCards: Card[], previewCard: Card) {
  const previewCardIdentifier = getVisibleCardIdentifier(previewCard.cardNumberMasked);
  return (
    existingCards.find(
      (existing) =>
        existing.issuerName === previewCard.issuerName &&
        getVisibleCardIdentifier(existing.cardNumberMasked) &&
        previewCardIdentifier &&
        normalizeCardKey(getVisibleCardIdentifier(existing.cardNumberMasked)) === normalizeCardKey(previewCardIdentifier),
    ) ??
    existingCards.find((existing) => normalizeCardKey(existing.name) === normalizeCardKey(previewCard.name)) ??
    null
  );
}

function findMatchedCard(existingCards: Card[], previewCard: Card, ownerPersonId: string | null) {
  if (!ownerPersonId) return null;

  const ownedCards = existingCards.filter((existing) => (existing.ownerPersonId ?? null) === ownerPersonId);
  const unownedCards = existingCards.filter((existing) => (existing.ownerPersonId ?? null) === null);

  return findMatchedCardInCandidates(ownedCards, previewCard) ?? findMatchedCardInCandidates(unownedCards, previewCard) ?? null;
}

function isCardPaymentAccount(account: Pick<Account, "usageType" | "name" | "alias">) {
  if (account.usageType === "card_payment") return true;
  const normalizedLabel = normalizeCardKey(`${account.name} ${account.alias}`);
  return (
    normalizedLabel.includes("카드값") ||
    normalizedLabel.includes("카드결제") ||
    normalizedLabel.includes("결제계좌") ||
    normalizedLabel.includes("결제통장") ||
    normalizedLabel.includes("납부")
  );
}

type LinkedAccountCandidate = Pick<
  Account,
  "id" | "name" | "alias" | "institutionName" | "accountNumberMasked" | "isShared" | "usageType" | "ownerPersonId"
> & {
  source: "existing" | "preview";
};
const EMPTY_LINKED_ACCOUNT_CANDIDATES: LinkedAccountCandidate[] = [];

function buildLinkedAccountCandidates(existingAccounts: Account[], previewAccounts: Account[], ownerPersonId: string) {
  const dedupedCandidates = new Map<string, LinkedAccountCandidate>();

  const upsertCandidate = (account: Account, source: LinkedAccountCandidate["source"]) => {
    if (!isCardPaymentAccount(account)) return;
    if (source === "existing" && !account.isShared && account.ownerPersonId !== ownerPersonId) return;

    const dedupeKey = `${normalizeCardKey(account.alias || account.name)}:${normalizeCardKey(account.accountNumberMasked)}`;
    const candidate: LinkedAccountCandidate = {
      id: account.id,
      name: account.name,
      alias: account.alias,
      institutionName: account.institutionName,
      accountNumberMasked: account.accountNumberMasked,
      isShared: account.isShared,
      usageType: account.usageType,
      ownerPersonId: account.ownerPersonId,
      source,
    };
    const existingCandidate = dedupedCandidates.get(dedupeKey);

    if (!existingCandidate || (existingCandidate.source === "preview" && source === "existing")) {
      dedupedCandidates.set(dedupeKey, candidate);
    }
  };

  existingAccounts.forEach((account) => upsertCandidate(account, "existing"));
  previewAccounts.forEach((account) =>
    upsertCandidate(
      {
        ...account,
        ownerPersonId: account.isShared ? null : ownerPersonId,
      },
      "preview",
    ),
  );

  return Array.from(dedupedCandidates.values()).sort((left, right) => {
    if (left.source !== right.source) return left.source === "existing" ? -1 : 1;
    if (left.isShared !== right.isShared) return left.isShared ? 1 : -1;
    return (left.alias || left.name).localeCompare(right.alias || right.name, "ko");
  });
}

function getPostImportLabel(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return `검토 ${bundle.reviews.length}건 확인`;
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "미분류 거래 정리";
  }
  return "결제내역 보기";
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatBillingMonthLabel(value: string) {
  return `${formatMonthLabel(value)} 청구`;
}

function addMonthKey(value: string, monthsToAdd: number) {
  const [year, month] = value.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getUsageMonths(bundle: WorkspaceBundle | null) {
  if (!bundle) return [];
  const uniqueMonths = new Set(
    bundle.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter((monthKey) => Boolean(monthKey)),
  );
  return [...uniqueMonths].sort((left, right) => left.localeCompare(right));
}

function getPreviewStatementMonthOptions(bundle: WorkspaceBundle | null) {
  const usageMonths = getUsageMonths(bundle);
  const latestUsageMonth = usageMonths.at(-1) ?? null;
  if (!latestUsageMonth) return [];

  if (usageMonths.length >= 3) {
    return [addMonthKey(latestUsageMonth, -1), latestUsageMonth, addMonthKey(latestUsageMonth, 1)];
  }

  return [latestUsageMonth, addMonthKey(latestUsageMonth, 1)];
}

function getStatementRecordLabel(record: Pick<ImportRecord, "statementMonth" | "fileName">) {
  if (record.statementMonth) return formatBillingMonthLabel(record.statementMonth);
  return `${record.fileName} 기록`;
}

export function ImportsPage() {
  const { commitImportedBundle, deleteImportRecord, previewWorkbookImport, state } = useAppState();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [selectedImportOwnerId, setSelectedImportOwnerId] = useState("");
  const [selectedStatementMonth, setSelectedStatementMonth] = useState("");
  const [importCardNameDrafts, setImportCardNameDrafts] = useState<Record<string, string>>({});
  const [importCardLinkedAccountDrafts, setImportCardLinkedAccountDrafts] = useState<Record<string, string>>({});
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false);
  const [isLinkedAccountModalOpen, setIsLinkedAccountModalOpen] = useState(false);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [isDropzoneInvalid, setIsDropzoneInvalid] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const workspaceId = state.activeWorkspaceId!;
  const scope = useMemo(() => getWorkspaceScope(state, workspaceId), [state, workspaceId]);
  const recentImports = useMemo(() => [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)), [scope.imports]);
  const previewStatementMonthOptions = useMemo(() => getPreviewStatementMonthOptions(previewBundle), [previewBundle]);
  const defaultPreviewStatementMonth = previewStatementMonthOptions.at(-1) ?? "";
  const linkedImportRecordIds = useMemo(
    () => new Set(scope.transactions.map((transaction) => transaction.importRecordId).filter((id): id is string => Boolean(id))),
    [scope.transactions],
  );

  const previewCardMatches = useMemo(
    () =>
      (previewBundle?.cards ?? []).map((card) => {
        const matchedCard = findMatchedCard(scope.cards, card, selectedImportOwnerId || null);
        return {
          card,
          matchedCard,
          draftName: importCardNameDrafts[card.id] ?? card.name,
        };
      }),
    [importCardNameDrafts, previewBundle, scope.cards, selectedImportOwnerId],
  );
  const previewCardMatchMap = useMemo(() => new Map(previewCardMatches.map((entry) => [entry.card.id, entry])), [previewCardMatches]);
  const newCreditPreviewCards = useMemo(
    () => previewCardMatches.filter(({ card, matchedCard }) => !matchedCard && card.cardType === "credit"),
    [previewCardMatches],
  );
  const linkedAccountCandidates = useMemo(
    () =>
      previewBundle && selectedImportOwnerId
        ? buildLinkedAccountCandidates(scope.accounts, previewBundle.accounts, selectedImportOwnerId)
        : EMPTY_LINKED_ACCOUNT_CANDIDATES,
    [previewBundle, scope.accounts, selectedImportOwnerId],
  );
  const shouldPromptLinkedAccounts = newCreditPreviewCards.length > 0 && linkedAccountCandidates.length > 0;

  useEffect(() => {
    if (!previewBundle) {
      setSelectedImportOwnerId("");
      return;
    }

    if (scope.people.length === 1) {
      const onlyPersonId = scope.people[0]?.id ?? "";
      if (selectedImportOwnerId !== onlyPersonId) {
        setSelectedImportOwnerId(onlyPersonId);
      }
      return;
    }

    if (selectedImportOwnerId && scope.people.some((person) => person.id === selectedImportOwnerId)) return;
    setSelectedImportOwnerId("");
  }, [previewBundle, scope.people, selectedImportOwnerId]);

  useEffect(() => {
    if (!previewBundle) {
      setSelectedStatementMonth("");
      return;
    }

    if (selectedStatementMonth && previewStatementMonthOptions.includes(selectedStatementMonth)) return;
    setSelectedStatementMonth(defaultPreviewStatementMonth);
  }, [defaultPreviewStatementMonth, previewBundle, previewStatementMonthOptions, selectedStatementMonth]);

  useEffect(() => {
    if (!previewBundle || !shouldPromptLinkedAccounts) {
      setImportCardLinkedAccountDrafts({});
      setIsLinkedAccountModalOpen(false);
      return;
    }

    const validCardIds = new Set(newCreditPreviewCards.map(({ card }) => card.id));
    const validAccountIds = new Set(linkedAccountCandidates.map((account) => account.id));
    const defaultAccountId = linkedAccountCandidates.length === 1 ? linkedAccountCandidates[0]?.id ?? "" : "";

    setImportCardLinkedAccountDrafts((current) => {
      const nextDrafts: Record<string, string> = {};
      let changed = false;

      newCreditPreviewCards.forEach(({ card }) => {
        const hasCurrentSelection = Object.prototype.hasOwnProperty.call(current, card.id);
        const currentValue = current[card.id] ?? "";
        const nextValue =
          hasCurrentSelection && (!currentValue || validAccountIds.has(currentValue))
            ? currentValue
            : defaultAccountId;
        nextDrafts[card.id] = nextValue;
        if (nextValue !== currentValue) {
          changed = true;
        }
      });

      Object.keys(current).forEach((cardId) => {
        if (!validCardIds.has(cardId)) {
          changed = true;
        }
      });

      if (!changed && Object.keys(current).length === Object.keys(nextDrafts).length) {
        return current;
      }
      return nextDrafts;
    });
  }, [linkedAccountCandidates, newCreditPreviewCards, previewBundle, shouldPromptLinkedAccounts]);

  const resetDropzoneState = () => {
    dragDepthRef.current = 0;
    setIsDropzoneActive(false);
    setIsDropzoneInvalid(false);
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearPreview = () => {
    setPreviewBundle(null);
    setPreviewFileName("");
    setSelectedImportOwnerId("");
    setSelectedStatementMonth("");
    setImportCardNameDrafts({});
    setImportCardLinkedAccountDrafts({});
    setIsLinkedAccountModalOpen(false);
    resetFileInput();
  };

  const preparePreview = async (file: File) => {
    setIsPreparingPreview(true);
    resetDropzoneState();
    try {
      const bundle = await previewWorkbookImport(file);
      setPreviewBundle(bundle);
      setPreviewFileName(file.name);
      setSelectedImportOwnerId("");
      setSelectedStatementMonth("");
      setImportCardNameDrafts(Object.fromEntries(bundle.cards.map((card) => [card.id, card.name])));
      setImportCardLinkedAccountDrafts({});
      setIsLinkedAccountModalOpen(false);
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handlePickedFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!isWorkbookFile(file)) {
      setIsDropzoneInvalid(true);
      setIsDropzoneActive(false);
      return;
    }
    await preparePreview(file);
  };

  const handleDropzoneDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropzoneActive(true);
  };

  const handleDropzoneDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    const isValid = !file || isWorkbookFile(file);
    event.dataTransfer.dropEffect = isValid ? "copy" : "none";
    setIsDropzoneActive(true);
    setIsDropzoneInvalid(!isValid);
  };

  const handleDropzoneDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropzoneActive(false);
      setIsDropzoneInvalid(false);
    }
  };

  const handleDropzoneDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    resetDropzoneState();
    await handlePickedFile(file);
  };

  const commitPreview = () => {
    if (!previewBundle || !selectedImportOwnerId || !selectedStatementMonth) return;
    const renamedCards = previewBundle.cards.map((card) => {
      const matchedCard = previewCardMatchMap.get(card.id)?.matchedCard ?? null;
      const selectedLinkedAccountId = importCardLinkedAccountDrafts[card.id] || null;

      return {
        ...card,
        name: matchedCard?.name ?? ((importCardNameDrafts[card.id] ?? card.name).trim() || card.name),
        linkedAccountId: matchedCard?.linkedAccountId ?? selectedLinkedAccountId ?? card.linkedAccountId ?? null,
      };
    });
    const linkedAccountIdByPreviewCardId = new Map(renamedCards.map((card) => [card.id, card.linkedAccountId ?? null]));

    const normalizedBundle: WorkspaceBundle = {
      ...previewBundle,
      people: [],
      imports: previewBundle.imports.map((record, index) =>
        index === 0
          ? {
              ...record,
              statementMonth: selectedStatementMonth,
            }
          : record,
      ),
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
        accountId: transaction.cardId ? linkedAccountIdByPreviewCardId.get(transaction.cardId) ?? transaction.accountId : transaction.accountId,
      })),
    };

    commitImportedBundle(normalizedBundle, previewFileName);
    clearPreview();
  };

  const handleCommitPreview = () => {
    if (!previewBundle || !selectedImportOwnerId || !selectedStatementMonth) return;
    if (shouldPromptLinkedAccounts) {
      setIsLinkedAccountModalOpen(true);
      return;
    }
    commitPreview();
  };

  const handleDeleteImportRecord = (record: ImportRecord) => {
    if (!linkedImportRecordIds.has(record.id)) return;
    const confirmed = window.confirm(`${getStatementRecordLabel(record)} 명세서를 삭제할까요?\n관련 결제내역과 검토 기록도 함께 삭제됩니다.`);
    if (!confirmed) return;
    deleteImportRecord(workspaceId, record.id);
  };

  const dropzoneTitle = isDropzoneInvalid
    ? "엑셀 파일만 업로드할 수 있어요"
    : isDropzoneActive
      ? "여기에 파일을 놓으면 미리보기를 준비합니다"
      : "클릭하거나 파일을 끌어놓으세요";

  const dropzoneDescription = isDropzoneInvalid
    ? "지원 형식: .xlsx, .xls"
    : "미리보기에서 거래 수, 검토 수, 자산 정보를 먼저 확인합니다.";

  return (
    <>
      <div className="page-stack">
        <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="transactions-upload">
            <div className="section-head">
              <div>
                <span className="section-kicker">업로드 센터</span>
                <h2 className="section-title">카드 명세서 가져오기</h2>
              </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              data-guide-target="transactions-import-history"
              onClick={() => setIsImportHistoryOpen(true)}
            >
              명세서 관리
            </button>
          </div>
          <p className="text-secondary">
            엑셀 파일을 올리면 바로 반영하지 않고 먼저 미리보기로 검토합니다. 확인 후 한 번에 가져오면 됩니다.
          </p>

          <label
            className={`upload-dropzone${isDropzoneActive ? " is-active" : ""}${isDropzoneInvalid ? " is-invalid" : ""}`}
            data-guide-target="transactions-upload-action"
            onDragEnter={handleDropzoneDragEnter}
            onDragOver={handleDropzoneDragOver}
            onDragLeave={handleDropzoneDragLeave}
            onDrop={handleDropzoneDrop}
          >
            <div className="upload-dropzone-copy">
              <div className="upload-dropzone-kicker-row">
                <span className="upload-dropzone-kicker">카드 이용 내역 명세서 업로드</span>
                <span className="upload-dropzone-format-badge" aria-hidden="true">
                  .xlsx / .xls
                </span>
              </div>
              <strong>{dropzoneTitle}</strong>
              <p className="mb-0 text-secondary">{dropzoneDescription}</p>
            </div>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".xlsx,.xls"
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                try {
                  await handlePickedFile(file);
                } finally {
                  event.currentTarget.value = "";
                }
              }}
            />
          </label>

          {isPreparingPreview ? <p className="text-secondary mt-3 mb-0">업로드 미리보기를 준비하고 있습니다.</p> : null}

          {previewBundle ? (
            <div className="card shadow-sm mt-4 import-preview-panel" data-guide-target="transactions-upload-preview">
              <div className="section-head">
                <div>
                  <span className="section-kicker">미리보기</span>
                  <h3 className="section-title">{previewFileName}</h3>
                </div>
              </div>
              <div className="stats-grid import-preview-stats">
                <article className="stat-card">
                  <span className="stat-label">거래</span>
                  <strong>{previewBundle.transactions.length}건</strong>
                </article>
                <article className="stat-card">
                  <span className="stat-label">검토</span>
                  <strong>{previewBundle.reviews.length}건</strong>
                </article>
                <article className="stat-card">
                  <span className="stat-label">카드</span>
                  <strong>{previewBundle.cards.length}장</strong>
                </article>
              </div>

              <div className="import-preview-control-grid mt-4">
                <div className="import-preview-control-card">
                <label className="form-label" htmlFor="import-owner-person">
                  누구의 카드인가요?
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
                </div>

                <div className="import-preview-control-card">
                <label className="form-label" htmlFor="import-statement-month">
                  언제 청구된 명세서 인가요?
                </label>
                <select
                  id="import-statement-month"
                  className="form-select"
                  value={selectedStatementMonth}
                  onChange={(event) => setSelectedStatementMonth(event.target.value)}
                  disabled={!previewStatementMonthOptions.length}
                >
                  {!previewStatementMonthOptions.length ? <option value="">청구월 후보를 만들 수 없습니다</option> : null}
                  {previewStatementMonthOptions.map((month) => (
                    <option key={month} value={month}>
                      {formatBillingMonthLabel(month)}
                    </option>
                  ))}
                </select>
                </div>
              </div>

              {previewCardMatches.length ? (
                <div className="people-subboard import-preview-card-section mt-4">
                  <div className="people-subboard-head">
                    <div>
                      <span className="section-kicker">업로드 자산 확인</span>
                      <h4>카드 확인</h4>
                    </div>
                  </div>
                  <div className="board-case-section-body">
                    <div className="category-case-grid import-preview-card-grid">
                    {previewCardMatches.map(({ card, matchedCard, draftName }) => (
                      <article
                        key={card.id}
                        className="category-case-card people-board-card import-preview-card"
                      >
                        <div className="category-case-card-copy people-board-card-copy import-preview-card-copy">
                          {!selectedImportOwnerId || matchedCard ? <strong>{card.name}</strong> : null}
                          {selectedImportOwnerId && !matchedCard ? (
                            <>
                              <div className="import-preview-card-input-block">
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
                              <span>
                                {card.issuerName}
                                {card.cardNumberMasked ? ` (${card.cardNumberMasked})` : ""}
                              </span>
                            </>
                          ) : (
                            <span>
                              {card.issuerName}
                              {card.cardNumberMasked ? ` (${card.cardNumberMasked})` : ""}
                            </span>
                          )}
                          {!selectedImportOwnerId ? <span>사용자를 선택하면 해당 사용자의 카드인지 확인합니다.</span> : null}
                        </div>
                        <div className="import-preview-card-footer">
                          <div
                            className={`category-case-pill import-preview-card-pill${
                              !selectedImportOwnerId
                                ? ""
                                : matchedCard
                                  ? " is-success"
                                  : " is-warning"
                            }`}
                          >
                            {!selectedImportOwnerId ? "사용자 선택 후 확인" : matchedCard ? "기존 카드" : "새 카드"}
                          </div>
                        </div>
                      </article>
                    ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="action-row mt-4">
                <button
                  className="btn btn-primary"
                  type="button"
                  data-guide-target="transactions-upload-commit"
                  onClick={handleCommitPreview}
                  disabled={!selectedImportOwnerId || !selectedStatementMonth || !scope.people.length}
                >
                  {getPostImportLabel(previewBundle)}
                </button>
                <button className="btn btn-outline-secondary" type="button" onClick={clearPreview}>
                  미리보기 닫기
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <AppModal
        open={isImportHistoryOpen}
        title="명세서 관리"
        description="가져온 명세서를 청구월별로 관리하고, 결제내역으로 이동하거나 삭제할 수 있습니다."
        onClose={() => setIsImportHistoryOpen(false)}
      >
        {!recentImports.length ? (
          <p className="text-secondary mb-0">아직 가져온 명세서가 없습니다.</p>
        ) : (
          <div className="import-record-list" role="list">
            {recentImports.map((item) => (
              <article key={item.id} className="import-record-row" role="listitem">
                <div className="import-record-row-copy">
                  <div className="import-record-row-title">
                    <strong>{getStatementRecordLabel(item)}</strong>
                    {!linkedImportRecordIds.has(item.id) ? <span className="badge text-bg-light">기존 기록</span> : null}
                  </div>
                  <p className="import-record-row-file">{item.fileName}</p>
                  <div className="import-record-row-meta">
                    <span>{item.importedAt.slice(0, 16).replace("T", " ")}</span>
                    <span>거래 {item.rowCount}건</span>
                    <span>검토 {item.reviewCount}건</span>
                  </div>
                </div>
                <div className="import-record-row-actions">
                  {linkedImportRecordIds.has(item.id) ? (
                    <Link
                      className="btn btn-outline-secondary btn-sm"
                      to={`/collections/card?statementId=${item.id}`}
                      onClick={() => setIsImportHistoryOpen(false)}
                    >
                      결제내역 보기
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    disabled={!linkedImportRecordIds.has(item.id)}
                    onClick={() => handleDeleteImportRecord(item)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppModal>

      <AppModal
        open={Boolean(previewBundle) && shouldPromptLinkedAccounts && isLinkedAccountModalOpen}
        title="납부계좌 빠른 연결"
        description="카드값 계좌가 있습니다. 연결할 계좌가 있으면 선택하세요."
        onClose={() => setIsLinkedAccountModalOpen(false)}
        footer={
          <div className="import-linked-account-footer-actions">
            <button type="button" className="btn btn-primary" onClick={commitPreview}>
              선택 반영 후 가져오기
            </button>
          </div>
        }
      >
        <div className="import-linked-account-modal">
          <div className="import-linked-account-summary">
            <strong>새로 등록될 신용카드 {newCreditPreviewCards.length}장</strong>
            <span>납부계좌 후보 {linkedAccountCandidates.length}개를 찾았습니다.</span>
          </div>

          <div className="import-linked-account-list">
            {newCreditPreviewCards.map(({ card }, index) => {
              const selectedLinkedAccountId = importCardLinkedAccountDrafts[card.id] ?? "";

              return (
                <article key={card.id} className="review-card import-linked-card" style={getMotionStyle(index + 1)}>
                  <div className="import-linked-card-head">
                    <div>
                      <span className="import-linked-card-kicker">새 카드</span>
                      <h3 className="mb-1">{importCardNameDrafts[card.id] ?? card.name}</h3>
                      <p className="mb-0 text-secondary">
                        {card.issuerName}
                        {card.cardNumberMasked ? ` · ${card.cardNumberMasked}` : ""}
                      </p>
                    </div>
                    <span className="badge text-bg-light">납부계좌 선택</span>
                  </div>

                  <div className="category-case-grid import-linked-account-option-grid">
                    <label
                      className={`category-case-card people-board-card import-linked-account-option import-linked-account-option-skip${
                        selectedLinkedAccountId === "" ? " is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`import-linked-account-${card.id}`}
                        checked={selectedLinkedAccountId === ""}
                        onChange={() =>
                          setImportCardLinkedAccountDrafts((current) => ({
                            ...current,
                            [card.id]: "",
                          }))
                        }
                      />
                      <div className="category-case-card-copy people-board-card-copy import-linked-account-option-skip-copy">
                        <span className="import-linked-account-option-skip-badge">지금은 연결하지 않기</span>
                      </div>
                    </label>

                    {linkedAccountCandidates.map((account) => (
                      <label
                        key={`${card.id}-${account.id}`}
                        className={`category-case-card people-board-card import-linked-account-option${
                          selectedLinkedAccountId === account.id ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`import-linked-account-${card.id}`}
                          checked={selectedLinkedAccountId === account.id}
                          onChange={() =>
                            setImportCardLinkedAccountDrafts((current) => ({
                              ...current,
                              [card.id]: account.id,
                            }))
                          }
                        />
                        <div className="category-case-card-copy people-board-card-copy">
                          <strong>{account.alias || account.name}</strong>
                          <span>{account.institutionName || "직접 입력"}</span>
                          <span>{account.accountNumberMasked || "계좌번호 미입력"}</span>
                          <div className="people-linked-category-block">
                            <span className={`people-linked-category-count${account.isShared ? "" : " is-empty"}`}>
                              {account.isShared ? "공동 계좌" : "개인 계좌"}
                            </span>
                          </div>
                        </div>
                        <div className="category-case-pill">{account.source === "existing" ? "기존 계좌" : "이번 업로드"}</div>
                      </label>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </AppModal>
    </>
  );
}
