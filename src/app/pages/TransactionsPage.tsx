import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCategoryGroups, getCategoryLabel, getChildCategories, getLeafCategories } from "../../domain/categories/meta";
import { completeGuideStepAction } from "../../domain/guidance/guideRuntime";
import { getLoopCandidateGroup } from "../../domain/loops/loopCandidates";
import {
  getOpenTransactionWorkflowReviews,
  getTransactionWorkflowTransactionIds,
} from "../../domain/reviews/transactionWorkflow";
import { getFilteredTransactions, type TransactionFilters } from "../../domain/transactions/filters";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import type { ImportRecord, ReviewItem, Transaction } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { AppSelect } from "../components/AppSelect";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { ImportsPage } from "./ImportsPage";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";
import { useToast } from "../toast/ToastProvider";

const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  transactionType: "all",
  sourceType: "all",
  ownerPersonId: "all",
  categoryId: "all",
  status: "all",
  nature: "all",
  searchQuery: "",
};

const DEFAULT_CARD_TRANSACTION_FILTERS: TransactionFilters = {
  ...DEFAULT_TRANSACTION_FILTERS,
  nature: "all",
};

type ReviewWorkflowState = {
  activeReviewId: string | null;
  queuedReviewIds: string[];
  preservedFilters: {
    filters: TransactionFilters;
    selectedStatementId: string;
  };
};

type LoopConfirmState = {
  transactionId: string;
  candidateIds: string[];
  suggestedIds: string[];
};

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function getStatementLabel(record: Pick<ImportRecord, "statementMonth" | "fileName">) {
  if (record.statementMonth) return `${formatMonthLabel(record.statementMonth)} 청구`;
  return `${record.fileName} 기록`;
}

function getNextQueuedReviewId(queueIds: string[], currentId: string) {
  const currentIndex = queueIds.indexOf(currentId);
  if (currentIndex < 0) return queueIds[0] ?? null;

  for (let index = currentIndex + 1; index < queueIds.length; index += 1) {
    if (queueIds[index] !== currentId) return queueIds[index];
  }

  for (let index = 0; index < currentIndex; index += 1) {
    if (queueIds[index] !== currentId) return queueIds[index];
  }

  return null;
}

function getInlineReviewPrompt(review: ReviewItem) {
  switch (review.reviewType) {
    case "category_suggestion":
      return "해당 건을 제안 카테고리로 분류할까요?";
    case "duplicate_candidate":
      return "해당 건을 중복으로 보고 제외할까요?";
    case "refund_candidate":
      return "해당 건을 환불로 연결할까요?";
    default:
      return "해당 건을 검토할까요?";
  }
}

export function TransactionsPage() {
  const {
    applyReviewSuggestion,
    assignCategory,
    clearCategory,
    resolveReview,
    snapshotGuideActionState,
    state,
    setTransactionLoopFlagBatch,
    updateTransactionDetails,
    updateTransactionFlags,
  } = useAppState();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = useMemo(() => getWorkspaceScope(state, workspaceId), [state, workspaceId]);
  const categoryMap = useMemo(() => new Map(scope.categories.map((item) => [item.id, item])), [scope.categories]);
  const leafCategories = useMemo(() => getLeafCategories(scope.categories), [scope.categories]);
  const categories = useMemo(
    () => new Map(leafCategories.map((item) => [item.id, getCategoryLabel(item, categoryMap)])),
    [categoryMap, leafCategories],
  );
  const categoryOptions = useMemo(
    () => {
      const grouped = getCategoryGroups(scope.categories).flatMap((group) =>
        getChildCategories(scope.categories, group.id).map((item) => ({
          id: item.id,
          label: getCategoryLabel(item, categoryMap),
        })),
      );
      const groupedIds = new Set(grouped.map((item) => item.id));
      const ungrouped = leafCategories
        .filter((item) => !groupedIds.has(item.id))
        .map((item) => ({ id: item.id, label: getCategoryLabel(item, categoryMap) }));
      return [...grouped, ...ungrouped];
    },
    [categoryMap, leafCategories, scope.categories],
  );
  const [categoryFilterInput, setCategoryFilterInput] = useState("");
  const [isCategoryFilterFocused, setIsCategoryFilterFocused] = useState(false);
  const people = scope.people;
  const peopleMap = new Map(people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));
  const transactionMap = useMemo(() => new Map(scope.transactions.map((transaction) => [transaction.id, transaction])), [scope.transactions]);
  const recentImportRecords = useMemo(() => [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)), [scope.imports]);
  const linkedImportRecordIds = useMemo(
    () => new Set(scope.transactions.map((transaction) => transaction.importRecordId).filter((id): id is string => Boolean(id))),
    [scope.transactions],
  );
  const statementOptions = useMemo(() => {
    const options = recentImportRecords
      .filter((record) => linkedImportRecordIds.has(record.id))
      .map((record) => ({
        id: record.id,
        label: getStatementLabel(record),
      }));

    if (scope.transactions.some((transaction) => !transaction.importRecordId)) {
      options.push({
        id: "legacy",
        label: "기존 데이터",
      });
    }

    return options;
  }, [linkedImportRecordIds, recentImportRecords, scope.transactions]);

  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_CARD_TRANSACTION_FILTERS);
  const [selectedStatementId, setSelectedStatementId] = useState("");
  const [reviewWorkflow, setReviewWorkflow] = useState<ReviewWorkflowState | null>(null);
  const [loopConfirmState, setLoopConfirmState] = useState<LoopConfirmState | null>(null);
  const [loopConfirmDragMode, setLoopConfirmDragMode] = useState<boolean | null>(null);
  const effectiveSelectedStatementId = selectedStatementId || statementOptions[0]?.id || "all";
  const statementTransactions = useMemo(() => {
    if (effectiveSelectedStatementId === "legacy") {
      return scope.transactions.filter((transaction) => !transaction.importRecordId);
    }
    if (effectiveSelectedStatementId === "all") return scope.transactions;
    return scope.transactions.filter((transaction) => transaction.importRecordId === effectiveSelectedStatementId);
  }, [effectiveSelectedStatementId, scope.transactions]);
  const statementTransactionIdSet = useMemo(
    () => new Set(statementTransactions.map((transaction) => transaction.id)),
    [statementTransactions],
  );
  const selectedStatementLabel = useMemo(
    () => statementOptions.find((option) => option.id === effectiveSelectedStatementId)?.label ?? "전체 결제내역",
    [effectiveSelectedStatementId, statementOptions],
  );

  const baseTransactions = useMemo(() => getFilteredTransactions(statementTransactions, filters), [filters, statementTransactions]);
  const filteredTransactions = baseTransactions;
  const uncategorizedGuideTransactionId =
    !reviewWorkflow && filters.nature === "uncategorized" ? filteredTransactions.find((transaction) => !transaction.categoryId)?.id ?? null : null;
  const uncategorizedTransactionCount = useMemo(
    () => statementTransactions.filter((transaction) => !transaction.categoryId).length,
    [statementTransactions],
  );
  const openTransactionReviews = useMemo(
    () =>
      getOpenTransactionWorkflowReviews(
        scope.reviews.filter(
          (review) =>
            statementTransactionIdSet.has(review.primaryTransactionId) ||
            review.relatedTransactionIds.some((transactionId) => statementTransactionIdSet.has(transactionId)),
        ),
        transactionMap,
      ),
    [scope.reviews, statementTransactionIdSet, transactionMap],
  );
  const transactionWorkflowReviews = useMemo(() => {
    if (!reviewWorkflow) return [];
    const reviewsById = new Map(openTransactionReviews.map((review) => [review.id, review]));

    return reviewWorkflow.queuedReviewIds
      .map((reviewId) => reviewsById.get(reviewId) ?? null)
      .filter((review): review is ReviewItem => Boolean(review));
  }, [openTransactionReviews, reviewWorkflow]);
  const activeWorkflowReview = useMemo(() => {
    if (!reviewWorkflow || !transactionWorkflowReviews.length) return null;
    return transactionWorkflowReviews.find((review) => review.id === reviewWorkflow.activeReviewId) ?? transactionWorkflowReviews[0] ?? null;
  }, [reviewWorkflow, transactionWorkflowReviews]);
  const activeWorkflowTransactionIds = useMemo(
    () => new Set(activeWorkflowReview ? getTransactionWorkflowTransactionIds(activeWorkflowReview) : []),
    [activeWorkflowReview],
  );
  const workflowVisibleTransactionIds = useMemo(() => {
    const nextSet = new Set<string>();
    transactionWorkflowReviews.forEach((review) => {
      getTransactionWorkflowTransactionIds(review).forEach((transactionId) => nextSet.add(transactionId));
    });
    return nextSet;
  }, [transactionWorkflowReviews]);
  const transactions = useMemo(
    () => (reviewWorkflow ? filteredTransactions.filter((transaction) => workflowVisibleTransactionIds.has(transaction.id)) : filteredTransactions),
    [filteredTransactions, reviewWorkflow, workflowVisibleTransactionIds],
  );
  const loopConfirmTransactions = useMemo(() => {
    if (!loopConfirmState) return [];
    const selectedIdSet = new Set(loopConfirmState.candidateIds);
    return scope.transactions.filter((transaction) => selectedIdSet.has(transaction.id));
  }, [loopConfirmState, scope.transactions]);
  const loopConfirmTargetTransaction = useMemo(
    () => (loopConfirmState ? transactionMap.get(loopConfirmState.transactionId) ?? null : null),
    [loopConfirmState, transactionMap],
  );
  const loopConfirmPastTransactions = useMemo(
    () => loopConfirmTransactions.filter((transaction) => transaction.id !== loopConfirmState?.transactionId),
    [loopConfirmState?.transactionId, loopConfirmTransactions],
  );

  useEffect(() => {
    if (loopConfirmDragMode === null) return;

    const clearDragMode = () => setLoopConfirmDragMode(null);
    window.addEventListener("mouseup", clearDragMode);

    return () => {
      window.removeEventListener("mouseup", clearDragMode);
    };
  }, [loopConfirmDragMode]);

  const setLoopConfirmCandidateSelection = (transactionId: string, checked: boolean) => {
    setLoopConfirmState((current) => {
      if (!current) return current;
      return {
        ...current,
        candidateIds: checked
          ? current.candidateIds.includes(transactionId)
            ? current.candidateIds
            : [...current.candidateIds, transactionId]
          : current.candidateIds.filter((candidateId) => candidateId !== transactionId),
      };
    });
  };
  const activeWorkflowSuggestedCategoryLabel = useMemo(() => {
    if (!activeWorkflowReview || activeWorkflowReview.reviewType !== "category_suggestion" || !activeWorkflowReview.suggestedCategoryId) {
      return null;
    }

    return categories.get(activeWorkflowReview.suggestedCategoryId) ?? null;
  }, [activeWorkflowReview, categories]);
  const categorySuggestionLabelsByTransactionId = useMemo(() => {
    const nextMap = new Map<string, string>();
    transactionWorkflowReviews.forEach((review) => {
      if (review.reviewType !== "category_suggestion" || !review.suggestedCategoryId) return;
      const label = categories.get(review.suggestedCategoryId);
      if (!label) return;
      nextMap.set(review.primaryTransactionId, label);
    });
    return nextMap;
  }, [categories, transactionWorkflowReviews]);
  const hasOpenTransactionReviews = openTransactionReviews.length > 0;

  useEffect(() => {
    setCategoryFilterInput(filters.categoryId === "all" ? "" : categories.get(filters.categoryId) ?? "");
  }, [categories, filters.categoryId]);

  useEffect(() => {
    const cleanup = searchParams.get("cleanup");
    const nature = searchParams.get("nature");
    const ownerPersonId = searchParams.get("ownerPersonId");
    const categoryId = searchParams.get("categoryId");
    const statementId = searchParams.get("statementId");
    const openFromCategoryUsage = searchParams.get("openFromCategoryUsage") === "1";
    const matchedNature = cleanup === "uncategorized" ? "uncategorized" : nature === "uncategorized" ? "uncategorized" : null;
    const matchedOwnerPersonId =
      ownerPersonId === "all" ? "all" : ownerPersonId && people.some((person) => person.id === ownerPersonId) ? ownerPersonId : null;
    const matchedCategoryId =
      categoryId === "all" ? "all" : categoryId && categoryOptions.some((option) => option.id === categoryId) ? categoryId : null;
    const matchedStatementId = statementId && statementOptions.some((option) => option.id === statementId) ? statementId : null;

    if (matchedNature || openFromCategoryUsage || ownerPersonId === "all" || matchedOwnerPersonId || categoryId === "all" || matchedCategoryId || matchedStatementId) {
      setFilters((current) => ({
        ...current,
        nature: openFromCategoryUsage ? matchedNature ?? "all" : matchedNature ?? current.nature,
        ownerPersonId: matchedOwnerPersonId ?? current.ownerPersonId,
        categoryId: matchedCategoryId ?? current.categoryId,
      }));
      if (matchedStatementId) setSelectedStatementId(matchedStatementId);
      setSearchParams({}, { replace: true });
    }
  }, [categoryOptions, people, searchParams, setSearchParams, statementOptions]);

  useEffect(() => {
    if (selectedStatementId && !statementOptions.some((option) => option.id === selectedStatementId)) {
      setSelectedStatementId(statementOptions[0]?.id ?? "");
    }
  }, [selectedStatementId, statementOptions]);

  useEffect(() => {
    if (!reviewWorkflow) return;

    const availableReviewIds = transactionWorkflowReviews.map((review) => review.id);
    if (!availableReviewIds.length) {
      setFilters(reviewWorkflow.preservedFilters.filters);
      setSelectedStatementId(reviewWorkflow.preservedFilters.selectedStatementId);
      setReviewWorkflow(null);
      return;
    }

    const isQueueChanged =
      availableReviewIds.length !== reviewWorkflow.queuedReviewIds.length ||
      availableReviewIds.some((reviewId, index) => reviewId !== reviewWorkflow.queuedReviewIds[index]);
    const nextActiveReviewId = reviewWorkflow.activeReviewId && availableReviewIds.includes(reviewWorkflow.activeReviewId)
      ? reviewWorkflow.activeReviewId
      : availableReviewIds[0];

    if (isQueueChanged || nextActiveReviewId !== reviewWorkflow.activeReviewId) {
      setReviewWorkflow((current) =>
        current
          ? {
              ...current,
              queuedReviewIds: availableReviewIds,
              activeReviewId: nextActiveReviewId,
            }
          : current,
      );
    }
  }, [reviewWorkflow, transactionWorkflowReviews]);

  useEffect(() => {
    if (!reviewWorkflow || !activeWorkflowReview) return;
    const row = document.querySelector<HTMLElement>(`[data-transaction-review-row="${activeWorkflowReview.primaryTransactionId}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeWorkflowReview, reviewWorkflow]);

  const getTransactionOwnerLabel = (transaction: Transaction) =>
    transaction.ownerPersonId
      ? peopleMap.get(transaction.ownerPersonId) ?? "-"
      : transaction.isSharedExpense
        ? "공동"
        : transaction.accountId && scope.accounts.find((account) => account.id === transaction.accountId)?.isShared
          ? "공동"
          : "-";

  const getTransactionConnectionMeta = (transaction: Transaction) => {
    const parts = [
      getSourceTypeLabel(transaction.sourceType),
      transaction.ownerPersonId ? `사용자 ${peopleMap.get(transaction.ownerPersonId) ?? "-"}` : null,
      transaction.accountId ? `계좌 ${accountMap.get(transaction.accountId) ?? "-"}` : null,
      transaction.cardId ? `카드 ${cardMap.get(transaction.cardId) ?? "-"}` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  };

  const moveGridEditorFocus = (currentTarget: HTMLElement, direction: "next" | "prev") => {
    const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-transaction-grid-editor="true"]'));
    const currentIndex = editors.findIndex((item) => item === currentTarget);
    if (currentIndex < 0) return;

    const target = direction === "next" ? editors[currentIndex + 1] : editors[currentIndex - 1];
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement) target.select();
  };

  const resetVisibleFilters = () => {
    setFilters((current) => ({
      ...current,
      ownerPersonId: "all",
      categoryId: "all",
      nature: "all",
      searchQuery: "",
    }));
  };

  const commitCategoryFilterInput = (rawValue: string) => {
    const normalizedValue = rawValue.trim().toLowerCase();
    if (!normalizedValue) {
      setFilters((current) => ({ ...current, categoryId: "all" }));
      setCategoryFilterInput("");
      return;
    }

    const exactMatch = categoryOptions.find((option) => option.label.trim().toLowerCase() === normalizedValue);
    const prefixMatch =
      exactMatch ?? categoryOptions.find((option) => option.label.trim().toLowerCase().startsWith(normalizedValue));
    const partialMatch =
      prefixMatch ?? categoryOptions.find((option) => option.label.trim().toLowerCase().includes(normalizedValue));

    if (!partialMatch) {
      setCategoryFilterInput(filters.categoryId === "all" ? "" : categories.get(filters.categoryId) ?? "");
      return;
    }

    setFilters((current) => ({ ...current, categoryId: partialMatch.id }));
    setCategoryFilterInput(partialMatch.label);
  };

  const filteredCategoryOptions = useMemo(() => {
    const normalizedValue = categoryFilterInput.trim().toLowerCase();
    if (!normalizedValue) return categoryOptions.slice(0, 12);
    return categoryOptions
      .filter((option) => option.label.trim().toLowerCase().includes(normalizedValue))
      .slice(0, 12);
  }, [categoryFilterInput, categoryOptions]);

  const startAutoReviewWorkflow = () => {
    if (reviewWorkflow) return;
    if (!openTransactionReviews.length) return;

    const preservedFilters = {
      filters,
      selectedStatementId: effectiveSelectedStatementId,
    };

    setReviewWorkflow({
      activeReviewId: openTransactionReviews[0]?.id ?? null,
      queuedReviewIds: openTransactionReviews.map((review) => review.id),
      preservedFilters,
    });

    if (!reviewWorkflow) {
      setFilters(DEFAULT_TRANSACTION_FILTERS);
    }
    completeGuideStepAction(workspaceId, "transactions-review-trigger");
  };

  const exitReviewWorkflow = () => {
    if (!reviewWorkflow) return;
    setFilters(reviewWorkflow.preservedFilters.filters);
    setSelectedStatementId(reviewWorkflow.preservedFilters.selectedStatementId);
    setReviewWorkflow(null);
  };

  const handleActiveReviewDecision = (decision: "apply" | "resolve") => {
    if (!reviewWorkflow || !activeWorkflowReview) return;
    snapshotGuideActionState(workspaceId, "transactions-review-actions");
    completeGuideStepAction(workspaceId, "transactions-review-actions");

    const nextReviewId = getNextQueuedReviewId(reviewWorkflow.queuedReviewIds, activeWorkflowReview.id);
    setReviewWorkflow((current) =>
      current
        ? {
            ...current,
            activeReviewId: nextReviewId,
          }
        : current,
    );

    if (decision === "apply") {
      applyReviewSuggestion(activeWorkflowReview.id);
      return;
    }

    resolveReview(activeWorkflowReview.id);
  };

  const deferActiveReview = () => {
    if (!reviewWorkflow || !activeWorkflowReview) return;
    completeGuideStepAction(workspaceId, "transactions-review-actions");

    const remainingReviewIds = reviewWorkflow.queuedReviewIds.filter((reviewId) => reviewId !== activeWorkflowReview.id);
    if (!remainingReviewIds.length) {
      setFilters(reviewWorkflow.preservedFilters.filters);
      setSelectedStatementId(reviewWorkflow.preservedFilters.selectedStatementId);
      setReviewWorkflow(null);
      showToast("이번 자동검토에서는 보류하고 다음 자동검토에서 다시 보여드립니다.", "info");
      return;
    }

    const nextReviewId = getNextQueuedReviewId(reviewWorkflow.queuedReviewIds, activeWorkflowReview.id);
    setReviewWorkflow((current) =>
      current
        ? {
            ...current,
            activeReviewId: nextReviewId && remainingReviewIds.includes(nextReviewId) ? nextReviewId : remainingReviewIds[0] ?? null,
            queuedReviewIds: remainingReviewIds,
          }
        : current,
    );
    showToast("이번 자동검토에서는 보류하고 다음 자동검토에서 다시 보여드립니다.", "info");
  };

  const getTransactionReviewBadgeLabel = (transaction: Transaction) => {
    if (!activeWorkflowReview || !activeWorkflowTransactionIds.has(transaction.id)) return null;

    if (activeWorkflowReview.reviewType === "category_suggestion") return "카테고리 제안";
    if (activeWorkflowReview.reviewType === "duplicate_candidate") {
      return transaction.id === activeWorkflowReview.primaryTransactionId ? "중복 후보" : "비교 거래";
    }
    if (activeWorkflowReview.reviewType === "refund_candidate") {
      return transaction.id === activeWorkflowReview.primaryTransactionId ? "환불 후보" : "원거래";
    }
    return null;
  };

  const getTransactionReviewHelperText = (transaction: Transaction) => {
    if (!activeWorkflowReview || !activeWorkflowTransactionIds.has(transaction.id)) return null;

    if (activeWorkflowReview.reviewType === "category_suggestion") {
      return `제안 카테고리를 확인해 주세요 · ${getTransactionConnectionMeta(transaction)}`;
    }
    if (activeWorkflowReview.reviewType === "duplicate_candidate") {
      return `${transaction.id === activeWorkflowReview.primaryTransactionId ? "제외할 후보 거래" : "비교 기준 거래"} · ${getTransactionConnectionMeta(transaction)}`;
    }
    if (activeWorkflowReview.reviewType === "refund_candidate") {
      return `${transaction.id === activeWorkflowReview.primaryTransactionId ? "환불로 연결할 거래" : "기준이 되는 원거래"} · ${getTransactionConnectionMeta(transaction)}`;
    }

    return getTransactionConnectionMeta(transaction);
  };

  return (
    <div className="page-stack">
      <ImportsPage />

      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="transactions-page-overview">
        <div className="section-head transaction-grid-head">
          <div>
            <h2 className="section-title">결제내역</h2>
            <p className="transaction-grid-meta">
              {selectedStatementLabel} · 거래 {statementTransactions.length}건 · 미분류 {uncategorizedTransactionCount}건
              {reviewWorkflow ? ` · 자동검토 ${transactionWorkflowReviews.length}건 진행 중` : ""}
            </p>
          </div>
          <div className="transaction-grid-toolbar">
            <label className="transaction-filter-toggle" data-guide-target="transactions-uncategorized-filter">
              <span className="transaction-filter-toggle-label">미분류</span>
              <input
                type="checkbox"
                className="transaction-filter-toggle-input"
                checked={filters.nature === "uncategorized"}
                disabled={Boolean(reviewWorkflow)}
                  onChange={(event) =>
                    {
                      const nextChecked = event.target.checked;
                      setFilters((current) => ({
                        ...current,
                        categoryId: nextChecked ? "all" : current.categoryId,
                        nature: nextChecked ? "uncategorized" : "all",
                      }));
                      if (nextChecked) {
                        setCategoryFilterInput("");
                      }
                      if (nextChecked) {
                        completeGuideStepAction(workspaceId, "transactions-filter-toggle");
                      }
                    }
                  }
              />
              <span className="transaction-filter-toggle-switch" aria-hidden="true" />
            </label>
            {hasOpenTransactionReviews || reviewWorkflow ? (
              <button
                type="button"
                className={`btn btn-sm transaction-auto-review-button${reviewWorkflow ? " is-active" : ""}`}
                data-guide-target="transactions-review-trigger"
                onClick={reviewWorkflow ? exitReviewWorkflow : startAutoReviewWorkflow}
              >
                <span className="transaction-auto-review-button-label">{reviewWorkflow ? "검토 종료" : "자동검토"}</span>
                {!reviewWorkflow ? (
                  <span className="transaction-auto-review-button-count">{openTransactionReviews.length}건</span>
                ) : null}
              </button>
            ) : null}
            <AppSelect
              className="toolbar-select transaction-owner-select"
              value={filters.ownerPersonId}
              disabled={Boolean(reviewWorkflow)}
              onChange={(nextValue) => setFilters((current) => ({ ...current, ownerPersonId: nextValue }))}
              options={[{ value: "all", label: "전체 사용자" }, ...people.map((person) => ({ value: person.id, label: person.displayName || person.name }))]}
              ariaLabel="사용자 필터"
            />
            <div className="transaction-category-filter-field">
              <input
                className="form-control"
                value={categoryFilterInput}
                disabled={Boolean(reviewWorkflow)}
                placeholder="카테고리 입력"
                onChange={(event) => setCategoryFilterInput(event.target.value)}
                onFocus={() => setIsCategoryFilterFocused(true)}
                onBlur={(event) => {
                  setIsCategoryFilterFocused(false);
                  commitCategoryFilterInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  commitCategoryFilterInput(event.currentTarget.value);
                }}
              />
              {isCategoryFilterFocused && filteredCategoryOptions.length ? (
                <div className="transaction-category-suggestion-list transaction-category-suggestion-list--filter" role="listbox" aria-label="카테고리 필터 추천">
                  {filteredCategoryOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`transaction-category-suggestion-item${filters.categoryId === option.id ? " is-active" : ""}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setCategoryFilterInput(option.label);
                        setFilters((current) => ({ ...current, categoryId: option.id }));
                        setIsCategoryFilterFocused(false);
                      }}
                    >
                      <span className="transaction-category-suggestion-name">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {statementOptions.length ? (
              <AppSelect
                className="transaction-month-select"
                value={effectiveSelectedStatementId === "all" ? statementOptions[0]?.id ?? "" : effectiveSelectedStatementId}
                disabled={Boolean(reviewWorkflow)}
                onChange={(nextValue) => setSelectedStatementId(nextValue)}
                options={statementOptions.map((option) => ({ value: option.id, label: option.label }))}
                ariaLabel="청구분 선택"
              />
            ) : null}
            <input
              className="form-control toolbar-search"
              value={filters.searchQuery}
              disabled={Boolean(reviewWorkflow)}
              onChange={(event) => setFilters((current) => ({ ...current, searchQuery: event.target.value }))}
              placeholder="가맹점 또는 설명 검색"
            />
          </div>
        </div>

        {!scope.transactions.length ? (
          <EmptyStateCallout
            kicker="거래 없음"
            title="아직 입력된 결제내역이 없습니다"
            description="결제내역 상단에서 카드 명세서를 가져오면 검토와 통계가 시작됩니다."
            actions={
              <Link to="/connections/assets" className="btn btn-outline-secondary btn-sm">
                자산 관리 보기
              </Link>
            }
          />
        ) : !transactions.length ? (
          <EmptyStateCallout
            kicker="결과 없음"
            title={reviewWorkflow ? "자동검토 대상 거래가 지금은 없습니다" : "조건에 맞는 결제내역이 없습니다"}
            description={
              reviewWorkflow
                ? "현재 자동검토 목록에 남아 있는 거래가 없습니다. 검토 모드를 종료하거나 일반 필터로 돌아가 보세요."
                : "미분류 보기, 사용자 명세서, 검색 조건을 조정해보세요."
            }
            actions={
              reviewWorkflow ? (
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={exitReviewWorkflow}>
                  검토 종료
                </button>
              ) : (
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetVisibleFilters}>
                  필터 초기화
                </button>
              )
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table align-middle transaction-grid-table">
              <colgroup>
                <col className="transaction-grid-col-date" />
                <col className="transaction-grid-col-merchant" />
                <col className="transaction-grid-col-original-amount" />
                <col className="transaction-grid-col-discount" />
                <col className="transaction-grid-col-paid-amount" />
                <col className="transaction-grid-col-owner" />
                <col className="transaction-grid-col-loop" />
                <col className="transaction-grid-col-category" />
                <col className="transaction-grid-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>사용일</th>
                  <th>가맹점</th>
                  <th className="text-end">원금액</th>
                  <th className="text-end">할인</th>
                  <th className="text-end">결제금액</th>
                  <th>사용자</th>
                  <th>루프</th>
                  <th>카테고리</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => {
                  const isWorkflowMatch = reviewWorkflow ? workflowVisibleTransactionIds.has(transaction.id) : false;
                  const isWorkflowFocus = reviewWorkflow ? activeWorkflowTransactionIds.has(transaction.id) : false;
                  const isWorkflowPrimary = activeWorkflowReview?.primaryTransactionId === transaction.id;
                  const categoryReviewHint = categorySuggestionLabelsByTransactionId.get(transaction.id) ?? null;
                  const inlineReview = isWorkflowPrimary ? activeWorkflowReview : null;

                  return (
                    <Fragment key={transaction.id}>
                      <tr
                        style={getMotionStyle(index)}
                        data-transaction-review-row={transaction.id}
                        className={`${isWorkflowMatch ? " transaction-review-row" : ""}${isWorkflowFocus ? " is-review-focus" : ""}${isWorkflowPrimary ? " is-review-primary" : ""}`}
                      >
                        <td className="transaction-date-cell">{transaction.occurredAt.slice(0, 10)}</td>
                        <td>
                          <TransactionRowHeader
                            merchantName={transaction.merchantName}
                            badgeLabel={getTransactionReviewBadgeLabel(transaction)}
                            helperText={getTransactionReviewHelperText(transaction)}
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
                        <td className="transaction-owner-cell">{getTransactionOwnerLabel(transaction)}</td>
                        <td className="transaction-loop-cell">
                          <label className="transaction-loop-toggle">
                            <input
                              type="checkbox"
                              checked={transaction.isLoop ?? false}
                              onChange={(event) => {
                                if (!event.target.checked) {
                                  updateTransactionFlags(workspaceId, transaction.id, { isLoop: false });
                                  return;
                                }
                                const candidateGroup = getLoopCandidateGroup(transaction, scope.transactions);
                                setLoopConfirmState({
                                  transactionId: transaction.id,
                                  candidateIds: candidateGroup.transactionIds,
                                  suggestedIds: candidateGroup.transactionIds,
                                });
                              }}
                            />
                          </label>
                        </td>
                        <td className={isWorkflowFocus && activeWorkflowReview?.reviewType === "category_suggestion" ? "transaction-category-cell is-review-focus" : ""}>
                          <TransactionCategoryEditor
                            transaction={transaction}
                            categories={scope.categories}
                            categoryName={transaction.categoryId ? categories.get(transaction.categoryId) ?? null : null}
                            reviewSuggestionLabel={categoryReviewHint}
                            isReviewFocused={Boolean(
                              activeWorkflowReview?.reviewType === "category_suggestion" &&
                                activeWorkflowReview.primaryTransactionId === transaction.id,
                            )}
                            guideTarget={
                              uncategorizedGuideTransactionId === transaction.id
                                ? "transactions-uncategorized-category-input"
                                : undefined
                            }
                            onCategoryCommit={(categoryId) => {
                              if (uncategorizedGuideTransactionId !== transaction.id || !categoryId) return;
                              snapshotGuideActionState(workspaceId, "transactions-uncategorized");
                              completeGuideStepAction(workspaceId, "transactions-uncategorized");
                            }}
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
                            data-transaction-grid-editor="true"
                            onBlur={(event) => {
                              const nextDescription = event.target.value.trim();
                              if (!nextDescription || nextDescription === transaction.description) return;
                              updateTransactionDetails(workspaceId, transaction.id, { description: nextDescription });
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
                      {inlineReview ? (
                        <tr className="transaction-review-inline-row">
                          <td colSpan={9} className="transaction-review-inline-cell">
                            <div className="transaction-review-inline-panel" data-guide-target="transactions-review-card">
                              <div className="transaction-review-inline-meta">
                                <span className="transaction-review-inline-badge">
                                  신뢰도 {Math.round(inlineReview.confidenceScore * 100)}%
                                </span>
                              </div>
                              <div className="transaction-review-inline-copy">
                                {inlineReview.reviewType === "category_suggestion" && activeWorkflowSuggestedCategoryLabel ? (
                                  <strong className="transaction-review-inline-question">
                                    <span>해당 건을 </span>
                                    <span className="transaction-review-inline-category-badge">{activeWorkflowSuggestedCategoryLabel}</span>
                                    <span>로 분류할까요?</span>
                                  </strong>
                                ) : (
                                  <strong>{getInlineReviewPrompt(inlineReview)}</strong>
                                )}
                              </div>
                              <div className="transaction-review-inline-actions" data-guide-target="transactions-review-actions">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  data-guide-target="transactions-review-defer"
                                  onClick={deferActiveReview}
                                >
                                  보류
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  data-guide-target="transactions-review-resolve"
                                  onClick={() => handleActiveReviewDecision("resolve")}
                                >
                                  아니요
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  data-guide-target="transactions-review-apply"
                                  onClick={() => handleActiveReviewDecision("apply")}
                                >
                                  예
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AppModal
        open={Boolean(loopConfirmState)}
        title="루프 후보 확인"
        description="이번 거래를 기준으로 과거 소비를 함께 보여드릴게요. 같은 반복 소비가 맞는지 보고 묶어서 등록해 주세요."
        onClose={() => {
          setLoopConfirmState(null);
          setLoopConfirmDragMode(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setLoopConfirmState(null);
                setLoopConfirmDragMode(null);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!loopConfirmState?.candidateIds.length}
              onClick={() => {
                if (!loopConfirmState?.candidateIds.length) return;
                setTransactionLoopFlagBatch(workspaceId, loopConfirmState.candidateIds, true);
                setLoopConfirmState(null);
              }}
            >
              {`선택한 ${loopConfirmState?.candidateIds.length ?? 0}건으로 루프 설정`}
            </button>
          </>
        }
      >
        {loopConfirmState ? (
          <div className="loop-confirm-panel">
            <div className="loop-confirm-summary">
              <strong>이번 거래</strong>
              <span>이 거래는 루프 기준으로 고정됩니다. 아래 과거 거래 중 같은 소비만 함께 묶어 주세요.</span>
            </div>

            {loopConfirmTargetTransaction ? (
              <div className="loop-confirm-item is-current is-selected">
                <input type="checkbox" checked readOnly aria-label="현재 거래는 항상 포함됩니다." />
                <div className="loop-confirm-copy">
                  <strong>{loopConfirmTargetTransaction.merchantName}</strong>
                  <span>{`${loopConfirmTargetTransaction.occurredAt.slice(0, 10)} · ${formatCurrency(loopConfirmTargetTransaction.amount)}`}</span>
                  <span>{loopConfirmTargetTransaction.description || "비고 없음"}</span>
                </div>
              </div>
            ) : null}

            <div className="loop-confirm-summary">
              <strong>같이 볼 과거 거래</strong>
              <span>
                {loopConfirmPastTransactions.length
                  ? "같은 거래처럼 보이는 과거 내역입니다. 맞는 것만 남기고 루프를 등록해 주세요."
                  : "지금은 함께 묶을 과거 거래가 없습니다. 이번 거래만 루프로 등록됩니다."}
              </span>
            </div>

            {loopConfirmPastTransactions.length ? (
              <>
                <div className="loop-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      setLoopConfirmState((current) =>
                        current
                          ? {
                              ...current,
                              candidateIds: [...new Set([current.transactionId, ...current.suggestedIds])],
                            }
                          : current,
                      )
                    }
                  >
                    추천 후보 모두 선택
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      setLoopConfirmState((current) =>
                        current
                          ? {
                              ...current,
                              candidateIds: [current.transactionId],
                            }
                          : current,
                      )
                    }
                  >
                    이번 거래만 남기기
                  </button>
                </div>

                {loopConfirmPastTransactions.map((transaction) => {
                  const checked = loopConfirmState.candidateIds.includes(transaction.id);
                  const isSuggested = loopConfirmState.suggestedIds.includes(transaction.id);
                  return (
                    <label
                      key={transaction.id}
                      className={`loop-confirm-item${checked ? " is-selected" : ""}`}
                      onMouseEnter={() => {
                        if (loopConfirmDragMode === null) return;
                        setLoopConfirmCandidateSelection(transaction.id, loopConfirmDragMode);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const nextChecked = !checked;
                          setLoopConfirmDragMode(nextChecked);
                          setLoopConfirmCandidateSelection(transaction.id, nextChecked);
                        }}
                        onChange={() => undefined}
                        onKeyDown={(event) => {
                          if (event.key !== " " && event.key !== "Enter") return;
                          event.preventDefault();
                          setLoopConfirmCandidateSelection(transaction.id, !checked);
                        }}
                      />
                      <div className="loop-confirm-copy">
                        <strong>{transaction.merchantName}</strong>
                        <span>{`${transaction.occurredAt.slice(0, 10)} · ${formatCurrency(transaction.amount)}`}</span>
                        <span>{transaction.description || "비고 없음"}</span>
                        <small>{isSuggested ? "자동으로 묶인 추천 후보" : "직접 선택한 후보"}</small>
                      </div>
                    </label>
                  );
                })}
              </>
            ) : null}
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}

