import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  clearTransactionSearchQuery,
  getFilteredTransactions,
  resetTransactionCleanupFilters,
  type TransactionFilters,
} from "../../domain/transactions/filters";
import { getTransactionActivitySummary } from "../../domain/transactions/transactionActivitySummary";
import { getTransactionFilterContext } from "../../domain/transactions/transactionFilterContext";
import { getSourceTypeCounts } from "../../domain/transactions/sourceTypeCounts";
import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";
import { getTransactionViewMode } from "../../domain/transactions/transactionViewMode";
import { getCategoryLabel, getLeafCategories } from "../../domain/categories/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionCleanupQuickActions } from "../components/TransactionCleanupQuickActions";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { TransactionSourceSummaryPanel } from "../components/TransactionSourceSummaryPanel";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";


const cleanupModeCopy = {
  all: {
    title: "전체 거래를 보고 있습니다",
    description: "필터를 더 좁히면 미분류처럼 정리가 많이 필요한 거래만 빠르게 모아볼 수 있습니다.",
  },
  expense: {
    title: "실지출만 보고 있습니다",
    description: "실제 소비에 잡히는 거래만 모아둔 상태라 카테고리를 정리하기 좋은 흐름입니다.",
  },
  internal_transfer: {
    title: "내부이체만 보고 있습니다",
    description: "소비로 잡히면 안 되는 자금 이동 위주로 확인하는 상태입니다.",
  },
  uncategorized: {
    title: "미분류 거래만 보고 있습니다",
    description: "카테고리가 비어 있는 거래만 모아둔 상태라 카테고리 일괄 정리에 가장 적합합니다.",
  },
} as const;

const transactionDraftGuide = {
  expense: {
    title: "지출 입력 중",
    description: "실제 소비가 발생한 거래입니다. 생활비, 식비, 쇼핑처럼 소비 분석에 포함될 항목에 맞습니다.",
    helper: "실제 소비가 맞다면 지출 반영을 켜두고 분류를 이어가면 됩니다.",
  },
  income: {
    title: "수입 입력 중",
    description: "월급, 용돈, 환급처럼 들어온 돈을 기록합니다. 일반적으로 지출 분석에는 포함하지 않습니다.",
    helper: "수입은 소비 통계와 성격이 다르므로 지출 반영은 꺼두는 편이 자연스럽습니다.",
  },
  transfer: {
    title: "이체 입력 중",
    description: "내 계좌 간 이동이나 공동 계좌로 옮긴 돈처럼 현금 이동만 있는 경우에 사용합니다.",
    helper: "내부이체 성격이 강하므로 보통 지출 반영은 끄는 것이 맞습니다.",
  },
  adjustment: {
    title: "조정 입력 중",
    description: "정정, 보정, 예외 처리성 거래를 기록합니다. 일반 거래 흐름과 분리해서 다루는 용도입니다.",
    helper: "조정 거래는 통계에 바로 반영하지 않는 편이 안전합니다.",
  },
} as const;

export function TransactionsPage() {
  const {
    addTransaction,
    assignCategory,
    clearCategory,
    state,
    updateTransactionDetails,
    updateTransactionFlags,
  } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categoryMap = new Map(scope.categories.map((item) => [item.id, item]));
  const leafCategories = getLeafCategories(scope.categories);
  const categories = new Map(leafCategories.map((item) => [item.id, getCategoryLabel(item, categoryMap)]));
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountSharedMap = new Map(scope.accounts.map((account) => [account.id, account.isShared]));
  const getTransactionOwnerLabel = (transaction: (typeof transactions)[number]) =>
    transaction.ownerPersonId
      ? peopleMap.get(transaction.ownerPersonId) ?? "-"
      : transaction.isSharedExpense
        ? "공동"
      : transaction.accountId && scope.accounts.find((account) => account.id === transaction.accountId)?.isShared
        ? "공동"
        : "-";
  const people = scope.people;
  const cards = scope.cards;
  const accounts = scope.accounts;

  const [filters, setFilters] = useState<TransactionFilters>({
    transactionType: "all",
    sourceType: "all",
    ownerPersonId: "all",
    status: "all",
    nature: "all",
    searchQuery: "",
  });
  const [draftType, setDraftType] = useState<"expense" | "income" | "transfer" | "adjustment">("expense");
  const [draftExpenseImpact, setDraftExpenseImpact] = useState(true);
  const transactions = useMemo(
    () => getFilteredTransactions(scope.transactions, filters),
    [filters, scope.transactions],
  );

  const sourceTypeCounts = getSourceTypeCounts(transactions);
  const {
    activeExpenseCount,
    internalTransferCount,
    uncategorizedCount,
  } = getTransactionActivitySummary(transactions);
  const activeCleanupMode = cleanupModeCopy[filters.nature as keyof typeof cleanupModeCopy] ?? cleanupModeCopy.all;
  const { activeOwnerName, activeSourceTypeLabel, activeSearchQuery } = getTransactionFilterContext({
    ownerPersonId: filters.ownerPersonId,
    sourceType: filters.sourceType as "all" | "manual" | "account" | "card" | "import",
    searchQuery: filters.searchQuery,
    people,
  });
  const {
    isFocusedCleanupMode,
    isFlowAuditMode,
    currentCleanupRemaining,
    currentFlowAuditCount,
  } = getTransactionViewMode({
    nature: filters.nature as "all" | "expense" | "internal_transfer" | "uncategorized",
    uncategorizedCount,
    internalTransferCount,
  });
  const activeFilterSummary =
    [
      filters.transactionType !== "all" ? `유형 ${filters.transactionType}` : null,
      activeSourceTypeLabel ? `수단 ${activeSourceTypeLabel}` : null,
      activeOwnerName ? `사용자 ${activeOwnerName}` : null,
      filters.status !== "all" ? `상태 ${filters.status}` : null,
      filters.nature !== "all" ? `정리 ${filters.nature}` : null,
      activeSearchQuery ? `검색 ${activeSearchQuery}` : null,
    ].filter(Boolean).join(" · ") || null;


  const getTransactionTypeValue = (transaction: (typeof transactions)[number]) =>
    transaction.isInternalTransfer ? "internal_transfer" : transaction.transactionType;

  const moveGridEditorFocus = (currentTarget: HTMLElement, direction: "next" | "prev") => {
    const editors = Array.from(
      document.querySelectorAll<HTMLElement>('[data-transaction-grid-editor="true"]'),
    );
    const currentIndex = editors.findIndex((item) => item === currentTarget);
    if (currentIndex < 0) return;

    const target = direction === "next" ? editors[currentIndex + 1] : editors[currentIndex - 1];
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  };

  const handleTransactionTypeChange = (
    transaction: (typeof transactions)[number],
    nextValue: "expense" | "income" | "transfer" | "adjustment" | "internal_transfer",
  ) => {
    if (nextValue === "internal_transfer") {
      updateTransactionDetails(workspaceId, transaction.id, { transactionType: "transfer" });
      updateTransactionFlags(workspaceId, transaction.id, {
        isInternalTransfer: true,
        isExpenseImpact: false,
        isSharedExpense: false,
      });
      return;
    }

    updateTransactionDetails(workspaceId, transaction.id, { transactionType: nextValue });
    updateTransactionFlags(workspaceId, transaction.id, {
      isInternalTransfer: false,
      isExpenseImpact: transaction.isExpenseImpact,
      isSharedExpense: false,
    });
  };

  useEffect(() => {
    const cleanup = searchParams.get("cleanup");
    const nature = searchParams.get("nature");
    const ownerPersonId = searchParams.get("ownerPersonId");
    const sourceType = searchParams.get("sourceType");
    const matchedNature =
      cleanup === "uncategorized"
        ? cleanup

        : nature === "internal_transfer"

          ? nature
          : null;
    const matchedOwnerPersonId =
      ownerPersonId === "all" ? "all" : ownerPersonId && people.some((person) => person.id === ownerPersonId) ? ownerPersonId : null;
    const matchedSourceType = SOURCE_TYPE_OPTIONS.find((item) => item === sourceType);
    if (matchedNature || ownerPersonId === "all" || matchedOwnerPersonId || matchedSourceType) {
      setFilters((current) => ({
        ...current,
        nature: matchedNature ?? current.nature,
        ownerPersonId: matchedOwnerPersonId ?? current.ownerPersonId,
        sourceType: matchedSourceType ?? current.sourceType,
      }));
      setSearchParams({}, { replace: true });
    }
  }, [people, searchParams, setSearchParams]);

  const normalizeTransactionConnectionFields = ({
    sourceType,
    ownerPersonId,
    accountId,
    cardId,
  }: {
    sourceType: "card" | "account" | "manual" | "import";
    ownerPersonId: string | null;
    accountId: string | null;
    cardId: string | null;
  }) => {
    const resolvedSourceType =
      sourceType === "card" && !cardId
        ? accountId
          ? "account"
          : "manual"
        : sourceType === "account" && !accountId
          ? "manual"
          : sourceType;

    if (resolvedSourceType === "manual" || resolvedSourceType === "import") {
      return {
        sourceType: resolvedSourceType,
        ownerPersonId: ownerPersonId ?? null,
        accountId: null,
        cardId: null,
      };
    }

    if (resolvedSourceType === "account") {
      const selectedAccount = accountId ? accounts.find((account) => account.id === accountId) : null;
      return {
        sourceType: resolvedSourceType,
        ownerPersonId: selectedAccount?.isShared ? null : selectedAccount?.ownerPersonId ?? ownerPersonId ?? null,
        accountId: accountId ?? null,
        cardId: null,
      };
    }

    const selectedCard = cardId ? cards.find((card) => card.id === cardId) : null;
    return {
      sourceType: resolvedSourceType,
      ownerPersonId: selectedCard?.ownerPersonId ?? ownerPersonId ?? null,
      accountId: selectedCard?.linkedAccountId ?? accountId ?? null,
      cardId: cardId ?? null,
    };
  };

  const syncFormWithSourceType = (form: HTMLFormElement, sourceType: "card" | "account" | "manual" | "import") => {
    const accountField = form.elements.namedItem("accountId") as HTMLSelectElement | null;
    const cardField = form.elements.namedItem("cardId") as HTMLSelectElement | null;
    const ownerField = form.elements.namedItem("ownerPersonId") as HTMLSelectElement | null;

    if (sourceType === "manual") {
      if (accountField) accountField.value = "";
      if (cardField) cardField.value = "";
      if (ownerField) ownerField.disabled = false;
      return;
    }

    if (sourceType === "account") {
      if (cardField) cardField.value = "";
      if (ownerField) {
        const selectedAccount = accountField?.value ? accounts.find((account) => account.id === accountField.value) : null;
        ownerField.disabled = Boolean(selectedAccount?.isShared);
        ownerField.value = selectedAccount?.isShared ? "" : selectedAccount?.ownerPersonId ?? "";
      }
      return;
    }

    if (ownerField) ownerField.disabled = false;
  };

  const syncFormWithAccount = (form: HTMLFormElement, accountId: string) => {
    const selectedAccount = accounts.find((account) => account.id === accountId);
    const sourceTypeField = form.elements.namedItem("sourceType") as HTMLSelectElement | null;
    const cardField = form.elements.namedItem("cardId") as HTMLSelectElement | null;
    const ownerField = form.elements.namedItem("ownerPersonId") as HTMLSelectElement | null;
    if (!selectedAccount) {
      if (sourceTypeField?.value === "account") sourceTypeField.value = "manual";
      if (ownerField) {
        ownerField.disabled = false;
        ownerField.value = "";
      }
      return;
    }

    if (sourceTypeField) sourceTypeField.value = "account";
    if (ownerField) {
      ownerField.disabled = selectedAccount.isShared;
      ownerField.value = selectedAccount.isShared ? "" : selectedAccount.ownerPersonId ?? "";
    }
    if (cardField) cardField.value = "";
  };

  const syncFormWithCard = (form: HTMLFormElement, cardId: string) => {
    const selectedCard = cards.find((card) => card.id === cardId);
    const sourceTypeField = form.elements.namedItem("sourceType") as HTMLSelectElement | null;
    const ownerField = form.elements.namedItem("ownerPersonId") as HTMLSelectElement | null;
    const accountField = form.elements.namedItem("accountId") as HTMLSelectElement | null;
    if (!selectedCard) {
      if (sourceTypeField?.value === "card") sourceTypeField.value = accountField?.value ? "account" : "manual";
      if (ownerField) {
        const fallbackAccount = accountField?.value ? accounts.find((account) => account.id === accountField.value) : null;
        ownerField.disabled = Boolean(fallbackAccount?.isShared);
        ownerField.value = fallbackAccount?.isShared ? "" : fallbackAccount?.ownerPersonId ?? "";
      }
      if (accountField && !accountField.value) accountField.value = "";
      return;
    }

    if (sourceTypeField) sourceTypeField.value = "card";
    if (ownerField) {
      ownerField.disabled = false;
      ownerField.value = selectedCard.ownerPersonId ?? "";
    }
    if (accountField) accountField.value = selectedCard.linkedAccountId ?? "";
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">거래 입력</span>
            <h2 className="section-title">수동 거래 추가</h2>
          </div>
        </div>
        <p className="text-secondary">
          업로드로 들어오지 않은 거래나 빠진 항목은 여기서 직접 추가할 수 있습니다. 사용일과 결제일을 나눠 넣으면 카드 소비와 실제 현금흐름을 따로 보기 쉽습니다.
        </p>
        <div className="transaction-mode-grid mb-4">
          <article className="resource-card">
            <h3>실지출로 넣을 때</h3>
            <p className="mb-0 text-secondary">생활비, 외식, 쇼핑처럼 실제 소비가 생긴 거래는 `지출 반영`을 켠 상태로 등록합니다.</p>
          </article>

          <article className="resource-card">
            <h3>내부이체일 때</h3>
            <p className="mb-0 text-secondary">내 계좌끼리 옮긴 돈은 `이체`로 넣고 `지출 반영`을 꺼야 과소비로 잡히지 않습니다.</p>
          </article>
        </div>
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>{transactionDraftGuide[draftType].title}</strong>
            <p className="mb-0 text-secondary">{transactionDraftGuide[draftType].helper}</p>
          </div>
          <div className="small text-secondary" title={transactionDraftGuide[draftType].description}>
            상세 설명 보기
          </div>
        </div>
        <form
          className="manual-transaction-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const sourceType = String(formData.get("sourceType") || "manual") as "card" | "account" | "manual" | "import";
            const normalizedConnections = normalizeTransactionConnectionFields({
              sourceType,
              ownerPersonId: String(formData.get("ownerPersonId") || "") || null,
              cardId: String(formData.get("cardId") || "") || null,
              accountId: String(formData.get("accountId") || "") || null,
            });
            addTransaction({
              workspaceId,
              occurredAt: String(formData.get("occurredAt") || ""),
              settledAt: String(formData.get("settledAt") || ""),
              transactionType: String(formData.get("transactionType") || "expense") as "expense" | "income" | "transfer" | "adjustment",
              sourceType: normalizedConnections.sourceType,
              ownerPersonId: normalizedConnections.ownerPersonId,
              cardId: normalizedConnections.cardId,
              accountId: normalizedConnections.accountId,
              merchantName: String(formData.get("merchantName") || ""),
              description: String(formData.get("description") || ""),
              amount: Number(formData.get("amount") || 0),
              categoryId: String(formData.get("categoryId") || "") || null,
              tagIds: [],

              isSharedExpense: false,

              isExpenseImpact: String(formData.get("isExpenseImpact") || "") === "on",
            });
            form.reset();
            setDraftType("expense");
            setDraftExpenseImpact(true);

          }}
        >
          <input name="occurredAt" type="date" className="form-control" required />
          <input name="settledAt" type="date" className="form-control" />
          <select
            name="transactionType"
            className="form-select"
            value={draftType}
            onChange={(event) => {
              const nextType = event.target.value as "expense" | "income" | "transfer" | "adjustment";
              setDraftType(nextType);
              if (nextType === "expense") {
                setDraftExpenseImpact(true);
              } else {
                setDraftExpenseImpact(false);
    
              }
            }}
          >
            <option value="expense">지출</option>
            <option value="income">수입</option>
            <option value="transfer">이체</option>
            <option value="adjustment">조정</option>
          </select>
          <select
            name="sourceType"
            className="form-select"
            defaultValue="manual"
            onChange={(event) => syncFormWithSourceType(event.currentTarget.form!, event.currentTarget.value as "card" | "account" | "manual" | "import")}
          >
            {SOURCE_TYPE_OPTIONS.filter((sourceType) => sourceType !== "import").map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {getSourceTypeLabel(sourceType)}
              </option>
            ))}
          </select>
          <select name="ownerPersonId" className="form-select" defaultValue="">
            <option value="">사용자 선택 없음</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName || person.name}
              </option>
            ))}
          </select>
          <select
            name="accountId"
            className="form-select"
            defaultValue=""
            onChange={(event) => syncFormWithAccount(event.currentTarget.form!, event.currentTarget.value)}
          >
            <option value="">계좌 연결 없음</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.alias || account.name}
                {account.isShared ? " (공동)" : ""}
              </option>
            ))}
          </select>
          <select
            name="cardId"
            className="form-select"
            defaultValue=""
            onChange={(event) => syncFormWithCard(event.currentTarget.form!, event.currentTarget.value)}
          >
            <option value="">카드 연결 없음</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
                {card.linkedAccountId && accountSharedMap.get(card.linkedAccountId) ? " (공동 계좌)" : ""}
              </option>
            ))}
          </select>
          <select name="categoryId" className="form-select" defaultValue="">
            <option value="">카테고리 선택 없음</option>
            {leafCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categories.get(category.id) ?? category.name}
              </option>
            ))}
          </select>
          <input name="merchantName" className="form-control" placeholder="가맹점 또는 거래명" required />
          <input name="description" className="form-control" placeholder="설명" />
          <input name="amount" type="number" min="0" step="1" className="form-control" placeholder="금액" required />
          <label className="form-check compact-check">
            <input
              checked={draftExpenseImpact}
              name="isExpenseImpact"
              type="checkbox"
              className="form-check-input"
              onChange={(event) => setDraftExpenseImpact(event.target.checked)}
            />
            <span className="form-check-label">지출 반영</span>
          </label>
          <button className="btn btn-primary" type="submit">
            거래 추가
          </button>
        </form>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">거래 목록</span>
            <h2 className="section-title">정리된 거래 데이터</h2>
          </div>
          <span className="badge text-bg-dark">{transactions.length}건</span>
        </div>

        {!transactions.length ? (
          <EmptyStateCallout
            kicker="거래 없음"
            title="아직 입력된 거래가 없습니다"
            description="업로드 화면에서 엑셀을 가져오거나, 위 입력 폼으로 첫 거래를 넣으면 검토와 통계가 시작됩니다."
            actions={
              <>
                <Link to="/imports" className="btn btn-outline-primary btn-sm">
                  엑셀 업로드 먼저 하기
                </Link>
                <Link to="/people" className="btn btn-outline-secondary btn-sm">
                  사용자 관리 보기
                </Link>
              </>
            }
          />
        ) : (
          <>
            <div className="stats-grid mb-4">
              <article className="stat-card">
                <span className="stat-label">활성 지출 거래</span>
                <strong>{activeExpenseCount}건</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">미분류 거래</span>
                <strong>{uncategorizedCount}건</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">내부이체</span>
                <strong>{internalTransferCount}건</strong>
              </article>
            </div>

            {isFocusedCleanupMode ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>업로드 후 정리 모드로 바로 들어왔습니다</strong>
                  <p className="mb-0 text-secondary">지금은 미분류 거래만 보고 있습니다.</p>
                </div>
                <div className="action-row">
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters(resetTransactionCleanupFilters)}>
                    전체 거래로 돌아가기
                  </button>
                  {filters.sourceType === "all" && filters.ownerPersonId === "all" ? (
                    <Link className="btn btn-outline-secondary btn-sm" to="/">
                      대시보드 보기
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isFocusedCleanupMode && currentCleanupRemaining === 0 ? (
              <CompletionBanner
                className="mb-3"
                title="미분류 거래 정리가 끝났습니다"
                description="카테고리 기준으로 정리가 끝난 흐름이라 이제 대시보드 수치를 더 믿고 볼 수 있습니다."
                actions={
                  <>
                    {filters.sourceType === "all" && filters.ownerPersonId === "all" ? (
                      <Link className="btn btn-outline-secondary btn-sm" to="/">
                        대시보드 보기
                      </Link>
                    ) : null}
                  </>
                }
              />
            ) : null}

            {isFlowAuditMode ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>내부이체 점검 모드입니다</strong>
                  <p className="mb-0 text-secondary">지출로 잡히면 안 되는 내부이체만 보고 있습니다.</p>
                </div>
                <div className="action-row">
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters(resetTransactionCleanupFilters)}>
                    전체 거래로 돌아가기
                  </button>
                  {filters.sourceType === "all" && filters.ownerPersonId === "all" ? (
                    <Link className="btn btn-outline-secondary btn-sm" to="/">
                      대시보드 보기
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeOwnerName ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>{activeOwnerName}의 거래 흐름을 보고 있습니다</strong>
                  <p className="mb-0 text-secondary">이 사용자에게 연결된 거래만 보고 있습니다.</p>
                </div>
                <div className="action-row">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, ownerPersonId: "all" }))}
                  >
                    사용자 필터 해제
                  </button>
                </div>
              </div>
            ) : null}

            {activeSourceTypeLabel ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>{activeSourceTypeLabel} 거래만 보고 있습니다</strong>
                  <p className="mb-0 text-secondary">{activeSourceTypeLabel} 경로 거래만 보고 있습니다.</p>
                </div>
                <div className="action-row">
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "all" }))}>
                    수단 필터 해제
                  </button>
                  {filters.sourceType !== "card" ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "card" }))}>
                      카드 거래 보기
                    </button>
                  ) : null}
                  {filters.sourceType !== "account" ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "account" }))}>
                      계좌 거래 보기
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeSearchQuery ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>검색어 &quot;{activeSearchQuery}&quot;로 좁혀 보고 있습니다</strong>
                  <p className="mb-0 text-secondary">검색어가 들어간 거래만 보고 있습니다.</p>
                </div>
                <div className="action-row">
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters(clearTransactionSearchQuery)}>
                    검색 해제
                  </button>
                </div>
              </div>
            ) : null}

            {isFlowAuditMode && currentFlowAuditCount === 0 ? (
              <CompletionBanner
                className="mb-3"
                title="내부이체 점검이 끝났습니다"
                description="현재 보이는 조건에서는 따로 점검할 내부이체가 남아 있지 않습니다. 이제 소비 분석이나 전체 거래 흐름으로 넘어가도 좋습니다."
                actions={
                  <>
                    <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters(resetTransactionCleanupFilters)}>
                      전체 거래로 돌아가기
                    </button>
                    {filters.sourceType === "all" && filters.ownerPersonId === "all" ? (
                      <Link className="btn btn-outline-secondary btn-sm" to="/">
                        대시보드 보기
                      </Link>
                    ) : null}
                  </>
                }
              />
            ) : null}

            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>{activeCleanupMode.title}</strong>
                <p className="mb-0 text-secondary">실지출 {activeExpenseCount}건 · 미분류 {uncategorizedCount}건</p>
              </div>
              <div className="small text-secondary" title={activeCleanupMode.description}>
                총 {transactions.length}건
              </div>
            </div>
            {activeFilterSummary ? (
              <div className="review-summary-panel compact-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>현재 적용된 필터</strong>
                  <p className="mb-0 text-secondary">{activeFilterSummary}</p>
                </div>
                <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters(resetTransactionCleanupFilters)}>
                  현재 필터 초기화
                </button>
              </div>
            ) : null}
            <TransactionCleanupQuickActions
              transactionCount={transactions.length}
              activeExpenseCount={activeExpenseCount}
              uncategorizedCount={uncategorizedCount}
              onShowUncategorized={() => setFilters((current) => ({ ...current, nature: "uncategorized" }))}
              onShowInternalTransfer={() => setFilters((current) => ({ ...current, nature: "internal_transfer" }))}
              onResetCleanupFilters={() => setFilters(resetTransactionCleanupFilters)}
            />

            <TransactionSourceSummaryPanel
              totalCount={transactions.length}
              sourceTypeCounts={sourceTypeCounts}
              onSelectSourceType={(sourceType) => setFilters((current) => ({ ...current, sourceType }))}
            />

            <div className="toolbar-row transaction-filter-row mb-3">
                <select
                  className="form-select toolbar-select"
                  value={filters.transactionType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      transactionType: event.target.value as TransactionFilters["transactionType"],
                    }))
                  }
              >
                <option value="all">전체 유형</option>
                <option value="expense">지출</option>
                <option value="income">수입</option>
                  <option value="transfer">이체</option>
                  <option value="adjustment">조정</option>
                </select>
                <select
                  className="form-select toolbar-select"
                  value={filters.sourceType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      sourceType: event.target.value as TransactionFilters["sourceType"],
                    }))
                  }
                >
                  <option value="all">전체 수단</option>
                  <option value="manual">수동입력</option>
                  <option value="account">계좌</option>
                  <option value="card">카드</option>
                  <option value="import">가져오기</option>
                </select>
                <select
                  className="form-select toolbar-select"
                  value={filters.ownerPersonId}
                  onChange={(event) => setFilters((current) => ({ ...current, ownerPersonId: event.target.value }))}
                >
                  <option value="all">전체 사용자</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName || person.name}
                    </option>
                  ))}
                </select>
                <select
                  className="form-select toolbar-select"
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      status: event.target.value as TransactionFilters["status"],
                    }))
                  }
                >
                  <option value="all">전체 상태</option>
                  <option value="active">활성</option>
                  <option value="cancelled">제외됨</option>
                  <option value="refunded">환불됨</option>
                </select>
                <select
                  className="form-select toolbar-select"
                  value={filters.nature}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      nature: event.target.value as TransactionFilters["nature"],
                    }))
                  }
                >
                  <option value="all">전체 성격</option>
                  <option value="expense">실지출만</option>

                  <option value="internal_transfer">내부이체만</option>
                  <option value="uncategorized">미분류만</option>
                </select>
                <input
                  className="form-control toolbar-search"
                  value={filters.searchQuery}
                  onChange={(event) => setFilters((current) => ({ ...current, searchQuery: event.target.value }))}
                  placeholder="가맹점 또는 설명 검색"
                />
            </div>

            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th>사용일</th>
                    <th>유형</th>
                    <th>가맹점</th>
                    <th className="text-end">원금</th>
                    <th className="text-end">할인</th>
                    <th className="text-end">결제금액</th>
                    <th>사용자</th>
                    <th>카테고리</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction, index) => (
                    <tr key={transaction.id} style={getMotionStyle(index)}>
                      <td>{transaction.occurredAt.slice(0, 10)}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          style={{ maxWidth: 132 }}
                          data-transaction-grid-editor="true"
                          value={getTransactionTypeValue(transaction)}
                          onChange={(event) =>
                            handleTransactionTypeChange(
                              transaction,
                              event.target.value as "expense" | "income" | "transfer" | "adjustment" | "internal_transfer",
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              moveGridEditorFocus(event.currentTarget, "next");
                              return;
                            }

                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveGridEditorFocus(event.currentTarget, "next");
                              return;
                            }

                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveGridEditorFocus(event.currentTarget, "prev");
                            }
                          }}
                        >
                          <option value="expense">지출</option>
                          <option value="internal_transfer">내부이체</option>
                          <option value="income">수입</option>
                          <option value="transfer">이체</option>
                          <option value="adjustment">조정</option>
                        </select>
                      </td>
                      <td>
                        <TransactionRowHeader
                          merchantName={transaction.merchantName}
                        />
                      </td>
                      <td className="text-end transaction-amount-cell">
                        <strong>{formatCurrency(transaction.originalAmount ?? transaction.amount)}</strong>
                      </td>
                      <td className="text-end transaction-amount-cell">
                        <strong>{transaction.discountAmount ? formatCurrency(transaction.discountAmount) : "-"}</strong>
                      </td>
                      <td className="text-end transaction-amount-cell">
                        <strong>{formatCurrency(transaction.amount)}</strong>
                      </td>
                        <td>{getTransactionOwnerLabel(transaction)}</td>
                        <td>
                          <TransactionCategoryEditor
                            transaction={transaction}
                            categories={scope.categories}
                            categoryName={transaction.categoryId ? categories.get(transaction.categoryId) ?? null : null}
                            onCategoryChange={(categoryId) => {
                              if (!categoryId) {
                                clearCategory(workspaceId, transaction.id);
                                return;
                              }
                              assignCategory(workspaceId, transaction.id, categoryId);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            defaultValue={transaction.description}
                            placeholder="비고"
                            data-transaction-grid-editor="true"
                            onBlur={(event) => {
                              const nextDescription = event.target.value.trim();
                              if (nextDescription === transaction.description) return;
                              updateTransactionDetails(workspaceId, transaction.id, {
                                description: nextDescription,
                              });
                            }}
                            onFocus={(event) => event.currentTarget.select()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                                moveGridEditorFocus(event.currentTarget, "next");
                                return;
                              }

                              if (event.key === "ArrowDown") {
                                event.preventDefault();
                                event.currentTarget.blur();
                                moveGridEditorFocus(event.currentTarget, "next");
                                return;
                              }

                              if (event.key === "ArrowUp") {
                                event.preventDefault();
                                event.currentTarget.blur();
                                moveGridEditorFocus(event.currentTarget, "prev");
                              }
                            }}
                          />
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}


