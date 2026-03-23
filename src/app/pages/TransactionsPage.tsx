import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCategoryLabel, getLeafCategories } from "../../domain/categories/meta";
import { getFilteredTransactions, type TransactionFilters } from "../../domain/transactions/filters";
import type { Transaction } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { ImportsPage } from "./ImportsPage";
import { ReviewsPage } from "./ReviewsPage";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function TransactionsPage() {
  const { assignCategory, clearCategory, state, updateTransactionDetails } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categoryMap = new Map(scope.categories.map((item) => [item.id, item]));
  const leafCategories = getLeafCategories(scope.categories);
  const categories = new Map(leafCategories.map((item) => [item.id, getCategoryLabel(item, categoryMap)]));
  const people = scope.people;
  const peopleMap = new Map(people.map((person) => [person.id, person.displayName || person.name]));
  const monthOptions = useMemo(
    () =>
      Array.from(new Set(scope.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [scope.transactions],
  );

  const [filters, setFilters] = useState<TransactionFilters>({
    transactionType: "all",
    sourceType: "all",
    ownerPersonId: "all",
    status: "all",
    nature: "all",
    searchQuery: "",
  });
  const [selectedMonth, setSelectedMonth] = useState("all");

  const baseTransactions = useMemo(() => getFilteredTransactions(scope.transactions, filters), [filters, scope.transactions]);
  const transactions = useMemo(
    () => (selectedMonth === "all" ? baseTransactions : baseTransactions.filter((transaction) => transaction.occurredAt.slice(0, 7) === selectedMonth)),
    [baseTransactions, selectedMonth],
  );
  const uncategorizedGuideTransactionId =
    filters.nature === "uncategorized" ? transactions.find((transaction) => !transaction.categoryId)?.id ?? null : null;
  const uncategorizedTransactionCount = useMemo(
    () => scope.transactions.filter((transaction) => !transaction.categoryId).length,
    [scope.transactions],
  );

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

  const getTransactionOwnerLabel = (transaction: Transaction) =>
    transaction.ownerPersonId
      ? peopleMap.get(transaction.ownerPersonId) ?? "-"
      : transaction.isSharedExpense
        ? "공동"
        : transaction.accountId && scope.accounts.find((account) => account.id === transaction.accountId)?.isShared
          ? "공동"
          : "-";

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

  return (
    <div className="page-stack">
      <ImportsPage />
      <ReviewsPage />

      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="transactions-page-overview">
        <div className="section-head transaction-grid-head">
          <div>
            <h2 className="section-title">카드내역</h2>
            <p className="transaction-grid-meta">
              전체 {scope.transactions.length}건 · 미분류 {uncategorizedTransactionCount}건
            </p>
          </div>
          <div className="transaction-grid-toolbar">
            <label className="transaction-filter-toggle" data-guide-target="transactions-uncategorized-filter">
              <span className="transaction-filter-toggle-label">미분류</span>
              <input
                type="checkbox"
                className="transaction-filter-toggle-input"
                checked={filters.nature === "uncategorized"}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    nature: event.target.checked ? "uncategorized" : "all",
                  }))
                }
              />
              <span className="transaction-filter-toggle-switch" aria-hidden="true" />
            </label>
            <select
              className="form-select"
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
            <select className="form-select" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
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
            title="조건에 맞는 카드내역이 없습니다"
            description="미분류 보기, 사용자, 월, 검색 조건을 조정해보세요."
            actions={
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetVisibleFilters}>
                필터 초기화
              </button>
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
                {transactions.map((transaction, index) => (
                  <tr key={transaction.id} style={getMotionStyle(index)}>
                    <td>{transaction.occurredAt.slice(0, 10)}</td>
                    <td>
                      <TransactionRowHeader merchantName={transaction.merchantName} />
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
                        defaultValue=""
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
