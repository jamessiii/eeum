import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCategoryLabel, getLeafCategories } from "../../domain/categories/meta";
import {
  getOpenTransactionWorkflowReviews,
  getTransactionWorkflowTransactionIds,
} from "../../domain/reviews/transactionWorkflow";
import { getFilteredTransactions, type TransactionFilters } from "../../domain/transactions/filters";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import type { ReviewItem, Transaction } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { ImportsPage } from "./ImportsPage";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  transactionType: "all",
  sourceType: "all",
  ownerPersonId: "all",
  status: "all",
  nature: "all",
  searchQuery: "",
};

type ReviewWorkflowState = {
  activeReviewId: string | null;
  queuedReviewIds: string[];
  preservedFilters: {
    filters: TransactionFilters;
    selectedMonth: string;
  };
};

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
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
  const { applyReviewSuggestion, assignCategory, clearCategory, dismissReview, state, updateTransactionDetails } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categoryMap = new Map(scope.categories.map((item) => [item.id, item]));
  const leafCategories = getLeafCategories(scope.categories);
  const categories = new Map(leafCategories.map((item) => [item.id, getCategoryLabel(item, categoryMap)]));
  const people = scope.people;
  const peopleMap = new Map(people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));
  const transactionMap = useMemo(() => new Map(scope.transactions.map((transaction) => [transaction.id, transaction])), [scope.transactions]);
  const monthOptions = useMemo(
    () =>
      Array.from(new Set(scope.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [scope.transactions],
  );

  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [reviewWorkflow, setReviewWorkflow] = useState<ReviewWorkflowState | null>(null);

  const baseTransactions = useMemo(() => getFilteredTransactions(scope.transactions, filters), [filters, scope.transactions]);
  const filteredTransactions = useMemo(
    () => (selectedMonth === "all" ? baseTransactions : baseTransactions.filter((transaction) => transaction.occurredAt.slice(0, 7) === selectedMonth)),
    [baseTransactions, selectedMonth],
  );
  const uncategorizedGuideTransactionId =
    !reviewWorkflow && filters.nature === "uncategorized" ? filteredTransactions.find((transaction) => !transaction.categoryId)?.id ?? null : null;
  const uncategorizedTransactionCount = useMemo(
    () => scope.transactions.filter((transaction) => !transaction.categoryId).length,
    [scope.transactions],
  );
  const openTransactionReviews = useMemo(
    () => getOpenTransactionWorkflowReviews(scope.reviews, transactionMap),
    [scope.reviews, transactionMap],
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
    const cleanup = searchParams.get("cleanup");
    const nature = searchParams.get("nature");
    const ownerPersonId = searchParams.get("ownerPersonId");
    const month = searchParams.get("month");
    const matchedNature = cleanup === "uncategorized" ? "uncategorized" : nature === "uncategorized" ? "uncategorized" : null;
    const matchedOwnerPersonId =
      ownerPersonId === "all" ? "all" : ownerPersonId && people.some((person) => person.id === ownerPersonId) ? ownerPersonId : null;
    const matchedMonth = month === "all" ? "all" : month && monthOptions.includes(month) ? month : null;

    if (matchedNature || ownerPersonId === "all" || matchedOwnerPersonId || matchedMonth) {
      setFilters((current) => ({
        ...current,
        nature: matchedNature ?? current.nature,
        ownerPersonId: matchedOwnerPersonId ?? current.ownerPersonId,
      }));
      if (matchedMonth) setSelectedMonth(matchedMonth);
      setSearchParams({}, { replace: true });
    }
  }, [monthOptions, people, searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedMonth !== "all" && !monthOptions.includes(selectedMonth)) {
      setSelectedMonth("all");
    }
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    if (!reviewWorkflow) return;

    const availableReviewIds = transactionWorkflowReviews.map((review) => review.id);
    if (!availableReviewIds.length) {
      setFilters(reviewWorkflow.preservedFilters.filters);
      setSelectedMonth(reviewWorkflow.preservedFilters.selectedMonth);
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
      nature: "all",
      searchQuery: "",
    }));
    setSelectedMonth("all");
  };

  const startAutoReviewWorkflow = () => {
    if (reviewWorkflow) return;
    if (!openTransactionReviews.length) return;

    const preservedFilters = {
      filters,
      selectedMonth,
    };

    setReviewWorkflow({
      activeReviewId: openTransactionReviews[0]?.id ?? null,
      queuedReviewIds: openTransactionReviews.map((review) => review.id),
      preservedFilters,
    });

    if (!reviewWorkflow) {
      setFilters(DEFAULT_TRANSACTION_FILTERS);
      setSelectedMonth("all");
    }
  };

  const exitReviewWorkflow = () => {
    if (!reviewWorkflow) return;
    setFilters(reviewWorkflow.preservedFilters.filters);
    setSelectedMonth(reviewWorkflow.preservedFilters.selectedMonth);
    setReviewWorkflow(null);
  };

  const handleActiveReviewDecision = (decision: "apply" | "dismiss") => {
    if (!reviewWorkflow || !activeWorkflowReview) return;

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

    dismissReview(activeWorkflowReview.id);
  };

  const deferActiveReview = () => {
    if (!reviewWorkflow || !activeWorkflowReview) return;

    const nextReviewId = getNextQueuedReviewId(reviewWorkflow.queuedReviewIds, activeWorkflowReview.id);
    if (!nextReviewId) return;

    setReviewWorkflow((current) =>
      current
        ? {
            ...current,
            activeReviewId: nextReviewId,
          }
        : current,
    );
  };

  const getTransactionReviewBadgeLabel = (transaction: Transaction) => {
    if (!activeWorkflowReview || !activeWorkflowTransactionIds.has(transaction.id)) return null;

    if (activeWorkflowReview.reviewType === "category_suggestion") return "카테고리 제안";
    if (activeWorkflowReview.reviewType === "duplicate_candidate") {
      return transaction.id === activeWorkflowReview.primaryTransactionId ? "중복 후보" : "기준 거래";
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
      return `${transaction.id === activeWorkflowReview.primaryTransactionId ? "제외될 후보 거래" : "비교 기준 거래"} · ${getTransactionConnectionMeta(transaction)}`;
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
            <h2 className="section-title">카드내역</h2>
            <p className="transaction-grid-meta">
              전체 {scope.transactions.length}건 · 미분류 {uncategorizedTransactionCount}건
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
                  setFilters((current) => ({
                    ...current,
                    nature: event.target.checked ? "uncategorized" : "all",
                  }))
                }
              />
              <span className="transaction-filter-toggle-switch" aria-hidden="true" />
            </label>
            {hasOpenTransactionReviews || reviewWorkflow ? (
              <button
                type="button"
                className={`btn btn-sm transaction-auto-review-button${reviewWorkflow ? " is-active" : ""}`}
                onClick={reviewWorkflow ? exitReviewWorkflow : startAutoReviewWorkflow}
              >
                <span className="transaction-auto-review-button-label">{reviewWorkflow ? "검토 종료" : "자동검토"}</span>
                {!reviewWorkflow ? (
                  <span className="transaction-auto-review-button-count">{openTransactionReviews.length}건</span>
                ) : null}
              </button>
            ) : null}
            <select
              className="form-select"
              value={filters.ownerPersonId}
              disabled={Boolean(reviewWorkflow)}
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
              className="form-select"
              value={selectedMonth}
              disabled={Boolean(reviewWorkflow)}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              <option value="all">전체 월</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
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
            title="아직 입력된 카드내역이 없습니다"
            description="카드내역 상단에서 카드 명세서를 가져오면 검토와 통계가 시작됩니다."
            actions={
              <Link to="/people" className="btn btn-outline-secondary btn-sm">
                사용자 관리 보기
              </Link>
            }
          />
        ) : !transactions.length ? (
          <EmptyStateCallout
            kicker="결과 없음"
            title={reviewWorkflow ? "자동검토 대상 거래가 지금은 없습니다" : "조건에 맞는 카드내역이 없습니다"}
            description={
              reviewWorkflow
                ? "현재 자동검토 큐에 남아 있는 거래가 없습니다. 검토 모드를 종료하거나 일반 필터로 돌아가 보세요."
                : "미분류 보기, 사용자, 월, 검색 조건을 조정해보세요."
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
                        className={`${
                          isWorkflowMatch ? " transaction-review-row" : ""
                        }${isWorkflowFocus ? " is-review-focus" : ""}${isWorkflowPrimary ? " is-review-primary" : ""}`}
                      >
                        <td>{transaction.occurredAt.slice(0, 10)}</td>
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
                        <td>{getTransactionOwnerLabel(transaction)}</td>
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
                          <td colSpan={8} className="transaction-review-inline-cell">
                            <div className="transaction-review-inline-panel">
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
                              <div className="transaction-review-inline-actions">
                                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={deferActiveReview}>
                                  보류
                                </button>
                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleActiveReviewDecision("dismiss")}>
                                  아니오
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleActiveReviewDecision("apply")}>
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
    </div>
  );
}
