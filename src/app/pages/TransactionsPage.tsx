import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  isActiveTransaction,
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isActiveSharedExpenseTransaction,
  isUncategorizedExpenseTransaction,
  isUntaggedExpenseTransaction,
} from "../../domain/transactions/meta";
import { getTransactionActivitySummary } from "../../domain/transactions/transactionActivitySummary";
import { getTransactionFilterContext } from "../../domain/transactions/transactionFilterContext";
import { getSourceTypeCounts } from "../../domain/transactions/sourceTypeCounts";
import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "../../domain/transactions/sourceTypes";
import { getTransactionViewMode } from "../../domain/transactions/transactionViewMode";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionBatchCategoryPanel } from "../components/TransactionBatchCategoryPanel";
import { TransactionBatchTagPanel } from "../components/TransactionBatchTagPanel";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionCleanupQuickActions } from "../components/TransactionCleanupQuickActions";
import { TransactionInlineEditor, type TransactionEditDraft } from "../components/TransactionInlineEditor";
import { TransactionNatureCell } from "../components/TransactionNatureCell";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { TransactionSourceSummaryPanel } from "../components/TransactionSourceSummaryPanel";
import { TransactionStatusBadge } from "../components/TransactionStatusBadge";
import { TransactionTagEditor } from "../components/TransactionTagEditor";
import { TransactionTypeBadge } from "../components/TransactionTypeBadge";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";


const cleanupModeCopy = {
  all: {
    title: "전체 거래를 보고 있습니다",
    description: "필터를 더 좁히면 미분류나 무태그처럼 정리가 많이 필요한 거래만 빠르게 모아볼 수 있습니다.",
  },
  expense: {
    title: "실지출만 보고 있습니다",
    description: "실제 소비에 잡히는 거래만 모아둔 상태라 카테고리와 태그를 정리하기 좋은 흐름입니다.",
  },
  shared: {
    title: "공동지출만 보고 있습니다",
    description: "정산과 공동생활비 흐름에 직접 연결되는 거래만 보고 있어 공동지출 정리에 집중하기 좋습니다.",
  },
  internal_transfer: {
    title: "내부이체만 보고 있습니다",
    description: "소비로 잡히면 안 되는 자금 이동 위주로 확인하는 상태입니다.",
  },
  uncategorized: {
    title: "미분류 거래만 보고 있습니다",
    description: "카테고리가 비어 있는 거래만 모아둔 상태라 카테고리 일괄 정리에 가장 적합합니다.",
  },
  untagged: {
    title: "무태그 거래만 보고 있습니다",
    description: "태그가 없는 거래만 모아둔 상태라 같은 맥락의 소비를 태그로 빠르게 묶기 좋습니다.",
  },
} as const;

const transactionDraftGuide = {
  expense: {
    title: "지출 입력 중",
    description: "실제 소비가 발생한 거래입니다. 생활비, 식비, 쇼핑처럼 소비 분석에 포함될 항목에 맞습니다.",
    helper: "공동으로 부담한 지출이면 공동지출도 함께 체크해두세요.",
  },
  income: {
    title: "수입 입력 중",
    description: "월급, 용돈, 환급처럼 들어온 돈을 기록합니다. 일반적으로 지출 분석에는 포함하지 않습니다.",
    helper: "수입은 공동지출이나 내부이체와 성격이 다르므로 지출 반영은 꺼두는 편이 자연스럽습니다.",
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
    assignCategoryBatch,
    assignTag,
    assignTagBatch,
    clearCategory,
    removeTag,
    state,
    updateTransactionDetails,
    updateTransactionFlags,
  } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categories = new Map(scope.categories.map((item) => [item.id, item.name]));
  const tags = new Map(scope.tags.map((item) => [item.id, item]));
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));
  const people = scope.people;
  const cards = scope.cards;
  const accounts = scope.accounts;

  const [filters, setFilters] = useState({
    transactionType: "all",
    sourceType: "all",
    ownerPersonId: "all",
    status: "all",
    nature: "all",
    tagId: "all",
    searchQuery: "",
  });
  const [draftType, setDraftType] = useState<"expense" | "income" | "transfer" | "adjustment">("expense");
  const [draftExpenseImpact, setDraftExpenseImpact] = useState(true);
  const [draftSharedExpense, setDraftSharedExpense] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TransactionEditDraft>({
    sourceType: "manual",
    ownerPersonId: "",
    accountId: "",
    cardId: "",
    occurredAt: "",
    settledAt: "",
    merchantName: "",
    description: "",
    amount: "",
  });
  const [pendingCategoryByTransaction, setPendingCategoryByTransaction] = useState<Record<string, string>>({});
  const [pendingTagByTransaction, setPendingTagByTransaction] = useState<Record<string, string>>({});
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkTagId, setBulkTagId] = useState("");

  const transactions = useMemo(
      () =>
        scope.transactions
          .filter((item) => (filters.transactionType === "all" ? true : item.transactionType === filters.transactionType))
          .filter((item) => (filters.sourceType === "all" ? true : item.sourceType === filters.sourceType))
          .filter((item) => (filters.ownerPersonId === "all" ? true : item.ownerPersonId === filters.ownerPersonId))
        .filter((item) => (filters.status === "all" ? true : item.status === filters.status))
        .filter((item) => {
          if (filters.nature === "all") return true;
          if (filters.nature === "expense") return isActiveExpenseImpactTransaction(item);
          if (filters.nature === "shared") return isActiveSharedExpenseTransaction(item);
          if (filters.nature === "internal_transfer") return isActiveInternalTransferTransaction(item);
          if (filters.nature === "uncategorized") return isUncategorizedExpenseTransaction(item);
          if (filters.nature === "untagged") return isUntaggedExpenseTransaction(item);
          return true;
        })
        .filter((item) => (filters.tagId === "all" ? true : item.tagIds.includes(filters.tagId)))
        .filter((item) => {
          const query = filters.searchQuery.trim().toLowerCase();
          if (!query) return true;
          return [item.merchantName, item.description]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(query));
        })
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      [filters.nature, filters.ownerPersonId, filters.searchQuery, filters.sourceType, filters.status, filters.tagId, filters.transactionType, scope.transactions],
    );

  const sourceTypeCounts = getSourceTypeCounts(transactions);
  const {
    expenseImpactTransactions,
    activeExpenseCount,
    internalTransferCount,
    sharedExpenseCount,
    uncategorizedCount,
    untaggedCount,
    expenseImpactAmount,
  } = getTransactionActivitySummary(transactions);
  const categorizableTransactions = expenseImpactTransactions;
  const taggableTransactions = expenseImpactTransactions;
  const taggableAmount = expenseImpactAmount;
  const categorizableAmount = expenseImpactAmount;
  const selectedBulkTagName = scope.tags.find((tag) => tag.id === bulkTagId)?.name ?? null;
  const selectedBulkCategoryName = scope.categories.find((category) => category.id === bulkCategoryId)?.name ?? null;
  const activeCleanupMode = cleanupModeCopy[filters.nature as keyof typeof cleanupModeCopy] ?? cleanupModeCopy.all;
  const { activeOwnerName, activeSourceTypeLabel } = getTransactionFilterContext({
    ownerPersonId: filters.ownerPersonId,
    sourceType: filters.sourceType as "all" | "manual" | "account" | "card" | "import",
    people,
  });
  const {
    isFocusedCleanupMode,
    isFlowAuditMode,
    currentCleanupRemaining,
    currentFlowAuditCount,
  } = getTransactionViewMode({
    nature: filters.nature as "all" | "expense" | "shared" | "internal_transfer" | "uncategorized" | "untagged",
    uncategorizedCount,
    untaggedCount,
    sharedExpenseCount,
    internalTransferCount,
  });

  useEffect(() => {
    const cleanup = searchParams.get("cleanup");
    const nature = searchParams.get("nature");
    const ownerPersonId = searchParams.get("ownerPersonId");
    const sourceType = searchParams.get("sourceType");
    if (cleanup === "uncategorized" || cleanup === "untagged") {
      setFilters((current) => ({ ...current, nature: cleanup }));
      setSearchParams({}, { replace: true });
      return;
    }
    if (nature === "shared" || nature === "internal_transfer") {
      setFilters((current) => ({
        ...current,
        nature,
        ownerPersonId: ownerPersonId && people.some((person) => person.id === ownerPersonId) ? ownerPersonId : current.ownerPersonId,
      }));
      setSearchParams({}, { replace: true });
      return;
    }
    if (ownerPersonId && people.some((person) => person.id === ownerPersonId)) {
      setFilters((current) => ({ ...current, ownerPersonId }));
      setSearchParams({}, { replace: true });
      return;
    }
    const matchedSourceType = SOURCE_TYPE_OPTIONS.find((item) => item === sourceType);
    if (matchedSourceType) {
      setFilters((current) => ({ ...current, sourceType: matchedSourceType }));
      setSearchParams({}, { replace: true });
    }
  }, [people, searchParams, setSearchParams]);

  const beginTransactionEdit = (transaction: (typeof transactions)[number]) => {
    setEditingTransactionId(transaction.id);
    setEditDraft({
      sourceType: transaction.sourceType,
      ownerPersonId: transaction.ownerPersonId ?? "",
      accountId: transaction.accountId ?? "",
      cardId: transaction.cardId ?? "",
      occurredAt: transaction.occurredAt.slice(0, 10),
      settledAt: transaction.settledAt?.slice(0, 10) ?? "",
      merchantName: transaction.merchantName,
      description: transaction.description,
      amount: String(transaction.amount),
    });
  };

  const cancelTransactionEdit = () => {
    setEditingTransactionId(null);
    setEditDraft({
      sourceType: "manual",
      ownerPersonId: "",
      accountId: "",
      cardId: "",
      occurredAt: "",
      settledAt: "",
      merchantName: "",
      description: "",
      amount: "",
    });
  };

  const updateEditDraft = (patch: Partial<TransactionEditDraft>) => {
    setEditDraft((current) => ({ ...current, ...patch }));
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
          업로드로 들어오지 않은 거래나 빠진 항목은 여기서 직접 추가할 수 있습니다. 사용일과 결제일을 분리해서 넣어두면 카드 소비와
          실제 현금흐름을 나눠서 볼 수 있습니다.
        </p>
        <div className="transaction-mode-grid mb-4">
          <article className="resource-card">
            <h3>실지출로 넣을 때</h3>
            <p className="mb-0 text-secondary">생활비, 외식, 쇼핑처럼 실제 소비가 발생한 거래는 `지출 반영`을 켠 상태로 등록합니다.</p>
          </article>
          <article className="resource-card">
            <h3>공동지출일 때</h3>
            <p className="mb-0 text-secondary">함께 부담할 거래라면 `공동지출`도 함께 켜두면 정산 화면에서 자동으로 계산됩니다.</p>
          </article>
          <article className="resource-card">
            <h3>내부이체일 때</h3>
            <p className="mb-0 text-secondary">내 계좌끼리 옮긴 돈은 `이체`로 넣고 `지출 반영`을 꺼야 과소비로 잡히지 않습니다.</p>
          </article>
        </div>
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>{transactionDraftGuide[draftType].title}</strong>
            <p className="mb-0 text-secondary">{transactionDraftGuide[draftType].description}</p>
          </div>
          <div className="small text-secondary">{transactionDraftGuide[draftType].helper}</div>
        </div>
        <form
          className="manual-transaction-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            addTransaction({
              workspaceId,
              occurredAt: String(formData.get("occurredAt") || ""),
              settledAt: String(formData.get("settledAt") || ""),
              transactionType: String(formData.get("transactionType") || "expense") as "expense" | "income" | "transfer" | "adjustment",
              sourceType: String(formData.get("sourceType") || "manual") as "card" | "account" | "manual" | "import",
              ownerPersonId: String(formData.get("ownerPersonId") || "") || null,
              cardId: String(formData.get("cardId") || "") || null,
              accountId: String(formData.get("accountId") || "") || null,
              merchantName: String(formData.get("merchantName") || ""),
              description: String(formData.get("description") || ""),
              amount: Number(formData.get("amount") || 0),
              categoryId: String(formData.get("categoryId") || "") || null,
              tagIds: String(formData.get("tagId") || "")
                ? [String(formData.get("tagId") || "")]
                : [],
              isSharedExpense: String(formData.get("isSharedExpense") || "") === "on",
              isExpenseImpact: String(formData.get("isExpenseImpact") || "") === "on",
            });
            form.reset();
            setDraftType("expense");
            setDraftExpenseImpact(true);
            setDraftSharedExpense(false);
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
                setDraftSharedExpense(false);
              }
            }}
          >
            <option value="expense">지출</option>
            <option value="income">수입</option>
            <option value="transfer">이체</option>
            <option value="adjustment">조정</option>
          </select>
          <select name="sourceType" className="form-select" defaultValue="manual">
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
                {person.name}
              </option>
            ))}
          </select>
          <select name="accountId" className="form-select" defaultValue="">
            <option value="">계좌 연결 없음</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select name="cardId" className="form-select" defaultValue="">
            <option value="">카드 연결 없음</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          <select name="categoryId" className="form-select" defaultValue="">
            <option value="">카테고리 선택 없음</option>
            {scope.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select name="tagId" className="form-select" defaultValue="">
            <option value="">태그 선택 없음</option>
            {scope.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
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
          <label className="form-check compact-check">
            <input
              checked={draftSharedExpense}
              disabled={draftType !== "expense"}
              name="isSharedExpense"
              type="checkbox"
              className="form-check-input"
              onChange={(event) => setDraftSharedExpense(event.target.checked)}
            />
            <span className="form-check-label">공동지출</span>
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
            description="업로드 화면에서 엑셀을 가져오거나, 위 수동 입력 폼으로 첫 거래를 넣으면 검토와 통계가 시작됩니다."
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
              <article className="stat-card">
                <span className="stat-label">공동지출</span>
                <strong>{sharedExpenseCount}건</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">무태그 거래</span>
                <strong>{untaggedCount}건</strong>
              </article>
            </div>

            {isFocusedCleanupMode ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>업로드 후 정리 모드로 바로 들어왔습니다</strong>
                  <p className="mb-0 text-secondary">
                    지금은 {filters.nature === "uncategorized" ? "미분류 거래" : "무태그 거래"}만 모아둔 상태입니다. 아래 일괄 정리 도구로
                    먼저 묶고, 남은 작업이 있으면 다른 정리 모드로 이어가면 됩니다.
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {filters.nature === "uncategorized" && untaggedCount ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "untagged" }))}>
                      무태그 정리로 이어가기
                    </button>
                  ) : null}
                  {filters.nature === "untagged" && uncategorizedCount ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "uncategorized" }))}>
                      미분류 정리로 이어가기
                    </button>
                  ) : null}
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "all", tagId: "all", searchQuery: "" }))}>
                    전체 거래로 돌아가기
                  </button>
                  <Link className="btn btn-outline-dark btn-sm" to="/">
                    대시보드 보기
                  </Link>
                </div>
              </div>
            ) : null}

            {isFocusedCleanupMode && currentCleanupRemaining === 0 ? (
              <CompletionBanner
                className="mb-3"
                title={filters.nature === "uncategorized" ? "미분류 거래 정리가 끝났습니다" : "무태그 거래 정리가 끝났습니다"}
                description={
                  filters.nature === "uncategorized"
                    ? "이제 남은 무태그 거래를 묶거나 대시보드에서 이번 달 진단을 확인하면 됩니다."
                    : "이제 카테고리와 태그 기준 정리가 끝난 흐름으로 대시보드와 정산 화면을 더 믿고 볼 수 있습니다."
                }
                actions={
                  <>
                    {filters.nature === "uncategorized" && untaggedCount ? (
                      <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "untagged" }))}>
                        무태그 {untaggedCount}건 정리
                      </button>
                    ) : null}
                    <Link className="btn btn-outline-dark btn-sm" to="/">
                      대시보드 보기
                    </Link>
                    <Link className="btn btn-outline-secondary btn-sm" to="/settlements">
                      정산 화면 보기
                    </Link>
                  </>
                }
              />
            ) : null}

            {isFlowAuditMode ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>{filters.nature === "shared" ? "공동지출 점검 모드입니다" : "내부이체 점검 모드입니다"}</strong>
                  <p className="mb-0 text-secondary">
                    {filters.nature === "shared"
                      ? "정산과 연결되는 공동지출만 모아 보고 있습니다. 실제로 함께 부담할 항목이 맞는지, 정산 화면으로 이어질 흐름인지 빠르게 확인해보세요."
                      : "소비 통계에 바로 잡히지 않아야 하는 내부이체만 모아 보고 있습니다. 내 계좌 간 이동이나 생활비 이동이 지출로 잘못 보이지 않는지 먼저 점검하면 좋습니다."}
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {filters.nature === "shared" && internalTransferCount ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "internal_transfer" }))}>
                      내부이체 {internalTransferCount}건 보기
                    </button>
                  ) : null}
                  {filters.nature === "internal_transfer" && sharedExpenseCount ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "shared" }))}>
                      공동지출 {sharedExpenseCount}건 보기
                    </button>
                  ) : null}
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "all", tagId: "all", searchQuery: "" }))}>
                    전체 거래로 돌아가기
                  </button>
                  {filters.nature === "shared" ? (
                    <Link className="btn btn-outline-dark btn-sm" to="/settlements">
                      정산 화면 보기
                    </Link>
                  ) : (
                    <Link className="btn btn-outline-dark btn-sm" to="/">
                      대시보드 보기
                    </Link>
                  )}
                </div>
              </div>
            ) : null}

            {activeOwnerName ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>{activeOwnerName}의 거래 흐름을 보고 있습니다</strong>
                  <p className="mb-0 text-secondary">
                    지금 화면은 {activeOwnerName}에게 연결된 거래만 좁혀서 보고 있습니다. 정산 화면에서 넘어온 경우라면 이 사람의 공동지출 흐름을 바로 확인하는 용도입니다.
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, ownerPersonId: "all" }))}
                  >
                    사람 필터 해제
                  </button>
                  {filters.nature !== "shared" ? (
                    <button
                      className="btn btn-outline-primary btn-sm"
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, nature: "shared" }))}
                    >
                      공동지출만 보기
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeSourceTypeLabel ? (
              <div className="review-summary-panel mb-3">
                <div className="review-summary-copy">
                  <strong>{activeSourceTypeLabel} 거래만 보고 있습니다</strong>
                  <p className="mb-0 text-secondary">
                    지금 화면은 {activeSourceTypeLabel} 경로로 들어온 거래만 좁혀서 보고 있습니다. 수단별 정리 상태를 점검하거나 연결값을 수정하기 좋은 흐름입니다.
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "all" }))}>
                    수단 필터 해제
                  </button>
                  {filters.sourceType !== "card" ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "card" }))}>
                      카드 흐름 보기
                    </button>
                  ) : null}
                  {filters.sourceType !== "account" ? (
                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, sourceType: "account" }))}>
                      계좌 흐름 보기
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isFlowAuditMode && currentFlowAuditCount === 0 ? (
              <CompletionBanner
                className="mb-3"
                title={filters.nature === "shared" ? "공동지출 점검이 끝났습니다" : "내부이체 점검이 끝났습니다"}
                description={
                  filters.nature === "shared"
                    ? "현재 보이는 조건에서는 정산 후보가 될 공동지출이 남아 있지 않습니다. 정산 화면이나 전체 거래 흐름으로 넘어가도 좋습니다."
                    : "현재 보이는 조건에서는 따로 점검할 내부이체가 남아 있지 않습니다. 이제 소비 분석이나 공동지출 정산 흐름으로 넘어가도 좋습니다."
                }
                actions={
                  <>
                    {filters.nature === "shared" ? (
                      <Link className="btn btn-outline-primary btn-sm" to="/settlements">
                        정산 화면 보기
                      </Link>
                    ) : sharedExpenseCount ? (
                      <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "shared" }))}>
                        공동지출 {sharedExpenseCount}건 보기
                      </button>
                    ) : null}
                    <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "all", tagId: "all", searchQuery: "" }))}>
                      전체 거래로 돌아가기
                    </button>
                    <Link className="btn btn-outline-dark btn-sm" to="/">
                      대시보드 보기
                    </Link>
                  </>
                }
              />
            ) : null}

            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>{activeCleanupMode.title}</strong>
                <p className="mb-0 text-secondary">{activeCleanupMode.description}</p>
              </div>
              <div className="small text-secondary">
                현재 보이는 거래 {transactions.length}건 중 실지출 {activeExpenseCount}건, 미분류 {uncategorizedCount}건, 무태그 {untaggedCount}건입니다.
              </div>
            </div>
              <TransactionCleanupQuickActions
                transactionCount={transactions.length}
                activeExpenseCount={activeExpenseCount}
                uncategorizedCount={uncategorizedCount}
                untaggedCount={untaggedCount}
                onShowUncategorized={() => setFilters((current) => ({ ...current, nature: "uncategorized" }))}
                onShowUntagged={() => setFilters((current) => ({ ...current, nature: "untagged" }))}
                onShowShared={() => setFilters((current) => ({ ...current, nature: "shared" }))}
                onShowInternalTransfer={() => setFilters((current) => ({ ...current, nature: "internal_transfer" }))}
                onResetCleanupFilters={() => setFilters((current) => ({ ...current, nature: "all", tagId: "all", searchQuery: "" }))}
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
                  onChange={(event) => setFilters((current) => ({ ...current, transactionType: event.target.value }))}
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
                  onChange={(event) => setFilters((current) => ({ ...current, sourceType: event.target.value }))}
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
                    {person.name}
                  </option>
                ))}
              </select>
              <select
                className="form-select toolbar-select"
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">전체 상태</option>
                <option value="active">활성</option>
                <option value="cancelled">제외됨</option>
                <option value="refunded">환불됨</option>
              </select>
              <select
                className="form-select toolbar-select"
                value={filters.nature}
                onChange={(event) => setFilters((current) => ({ ...current, nature: event.target.value }))}
              >
                <option value="all">전체 성격</option>
                <option value="expense">실지출만</option>
                <option value="shared">공동지출만</option>
                <option value="internal_transfer">내부이체만</option>
                <option value="uncategorized">미분류만</option>
                <option value="untagged">무태그만</option>
              </select>
              <select
                className="form-select toolbar-select"
                value={filters.tagId}
                onChange={(event) => setFilters((current) => ({ ...current, tagId: event.target.value }))}
              >
                <option value="all">?꾩껜 ?쒓렇</option>
                {scope.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <input
                className="form-control toolbar-search"
                value={filters.searchQuery}
                onChange={(event) => setFilters((current) => ({ ...current, searchQuery: event.target.value }))}
                placeholder="가맹점 또는 설명 검색"
              />
            </div>

            <TransactionBatchTagPanel
              tags={scope.tags}
              selectedTagId={bulkTagId}
              selectedTagName={selectedBulkTagName}
              transactionCount={taggableTransactions.length}
              amount={taggableAmount}
              disabled={!bulkTagId || !taggableTransactions.length}
              onChangeTag={setBulkTagId}
              onSubmit={() => {
                if (!bulkTagId || !taggableTransactions.length) return;
                assignTagBatch(
                  workspaceId,
                  taggableTransactions.map((item) => item.id),
                  bulkTagId,
                );
                setBulkTagId("");
              }}
            />

            <TransactionBatchCategoryPanel
              categories={scope.categories}
              selectedCategoryId={bulkCategoryId}
              selectedCategoryName={selectedBulkCategoryName}
              transactionCount={categorizableTransactions.length}
              amount={categorizableAmount}
              disabled={!bulkCategoryId || !categorizableTransactions.length}
              onChangeCategory={setBulkCategoryId}
              onSubmit={() => {
                if (!bulkCategoryId || !categorizableTransactions.length) return;
                assignCategoryBatch(
                  workspaceId,
                  categorizableTransactions.map((item) => item.id),
                  bulkCategoryId,
                );
                setBulkCategoryId("");
              }}
            />

            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th>사용일</th>
                    <th>결제일</th>
                    <th>유형</th>
                    <th>상태</th>
                    <th>성격</th>
                    <th>가맹점/설명</th>
                    <th>사용자</th>
                    <th>카테고리</th>
                    <th className="text-end">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction, index) => (
                    <tr key={transaction.id} style={getMotionStyle(index)}>
                      <td>{transaction.occurredAt.slice(0, 10)}</td>
                      <td>{transaction.settledAt?.slice(0, 10) ?? "-"}</td>
                      <td>
                        <TransactionTypeBadge transaction={transaction} />
                      </td>
                      <td>
                        <TransactionStatusBadge transaction={transaction} />
                      </td>
                        <td>
                          <TransactionNatureCell
                            transaction={transaction}
                            onToggleSharedExpense={() =>
                              updateTransactionFlags(workspaceId, transaction.id, {
                                isSharedExpense: !transaction.isSharedExpense,
                              })
                            }
                            onToggleInternalTransfer={() =>
                              updateTransactionFlags(workspaceId, transaction.id, {
                                isInternalTransfer: !transaction.isInternalTransfer,
                              })
                            }
                            onToggleExpenseImpact={() =>
                              updateTransactionFlags(workspaceId, transaction.id, {
                                isExpenseImpact: !transaction.isExpenseImpact,
                              })
                            }
                          />
                        </td>
                        <td>
                          <TransactionRowHeader
                            merchantName={transaction.merchantName}
                            description={transaction.description || (transaction.isInternalTransfer ? "내부이체로 처리된 거래" : null)}
                            connectionSummary={
                              [
                                `수단 ${getSourceTypeLabel(transaction.sourceType)}`,
                                transaction.ownerPersonId ? `사용자 ${peopleMap.get(transaction.ownerPersonId) ?? "-"}` : null,
                                transaction.accountId ? `계좌 ${accountMap.get(transaction.accountId) ?? "-"}` : null,
                                transaction.cardId ? `카드 ${cardMap.get(transaction.cardId) ?? "-"}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "연결 정보 없음"
                            }
                            canEdit={isActiveTransaction(transaction)}
                            isEditing={editingTransactionId === transaction.id}
                            onToggleEdit={() => {
                              if (editingTransactionId === transaction.id) {
                                cancelTransactionEdit();
                                return;
                              }
                              beginTransactionEdit(transaction);
                            }}
                          />
                          {editingTransactionId === transaction.id ? (
                            <TransactionInlineEditor
                              draft={editDraft}
                              people={people}
                              accounts={accounts}
                              cards={cards}
                              saveDisabled={!editDraft.occurredAt || !editDraft.merchantName.trim() || !editDraft.amount || Number(editDraft.amount) <= 0}
                              onDraftChange={updateEditDraft}
                              onSave={() => {
                                updateTransactionDetails(workspaceId, transaction.id, {
                                  sourceType: editDraft.sourceType,
                                  ownerPersonId: editDraft.ownerPersonId || null,
                                  accountId: editDraft.accountId || null,
                                  cardId: editDraft.cardId || null,
                                  occurredAt: editDraft.occurredAt,
                                  settledAt: editDraft.settledAt || null,
                                  merchantName: editDraft.merchantName.trim(),
                                  description: editDraft.description.trim(),
                                  amount: Number(editDraft.amount),
                                });
                                cancelTransactionEdit();
                              }}
                              onCancel={cancelTransactionEdit}
                            />
                          ) : null}
                          <TransactionTagEditor
                            transaction={transaction}
                            tags={scope.tags}
                            pendingTagId={pendingTagByTransaction[transaction.id] ?? ""}
                            selectedTagName={tags.get(pendingTagByTransaction[transaction.id] ?? "")?.name ?? null}
                            onPendingTagChange={(tagId) =>
                              setPendingTagByTransaction((current) => ({
                                ...current,
                                [transaction.id]: tagId,
                              }))
                            }
                            onApplyTag={() => {
                              const tagId = pendingTagByTransaction[transaction.id];
                              if (!tagId) return;
                              assignTag(workspaceId, transaction.id, tagId);
                              setPendingTagByTransaction((current) => ({ ...current, [transaction.id]: "" }));
                            }}
                            onRemoveTag={(tagId) => removeTag(workspaceId, transaction.id, tagId)}
                          />
                        </td>
                        <td>{peopleMap.get(transaction.ownerPersonId ?? "") ?? "-"}</td>
                        <td>
                          <TransactionCategoryEditor
                            transaction={transaction}
                            categories={scope.categories}
                            categoryName={transaction.categoryId ? categories.get(transaction.categoryId) ?? null : null}
                            pendingCategoryId={pendingCategoryByTransaction[transaction.id] ?? ""}
                            selectedCategoryName={categories.get(pendingCategoryByTransaction[transaction.id] ?? "") ?? null}
                            onPendingCategoryChange={(categoryId) =>
                              setPendingCategoryByTransaction((current) => ({
                                ...current,
                                [transaction.id]: categoryId,
                              }))
                            }
                            onApplyCategory={() => {
                              const categoryId = pendingCategoryByTransaction[transaction.id];
                              if (!categoryId) return;
                              assignCategory(workspaceId, transaction.id, categoryId);
                              setPendingCategoryByTransaction((current) => ({ ...current, [transaction.id]: "" }));
                            }}
                            onClearCategory={() => clearCategory(workspaceId, transaction.id)}
                          />
                        </td>
                      <td className="text-end transaction-amount-cell">
                        <strong>{formatCurrency(transaction.amount)}</strong>
                        {!transaction.isExpenseImpact ? <div className="small text-secondary">통계 제외 흐름</div> : null}
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

