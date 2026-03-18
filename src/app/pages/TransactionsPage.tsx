import { useMemo, useState } from "react";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function TransactionsPage() {
  const { addTransaction, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categories = new Map(scope.categories.map((item) => [item.id, item.name]));
  const people = scope.people;
  const cards = scope.cards;
  const accounts = scope.accounts;

  const [filters, setFilters] = useState({
    transactionType: "all",
    ownerPersonId: "all",
  });

  const transactions = useMemo(
    () =>
      scope.transactions
        .filter((item) => (filters.transactionType === "all" ? true : item.transactionType === filters.transactionType))
        .filter((item) => (filters.ownerPersonId === "all" ? true : item.ownerPersonId === filters.ownerPersonId))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [filters.ownerPersonId, filters.transactionType, scope.transactions],
  );

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">거래 입력</span>
            <h2 className="section-title">수동 거래 추가</h2>
          </div>
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
              isSharedExpense: String(formData.get("isSharedExpense") || "") === "on",
              isExpenseImpact: String(formData.get("isExpenseImpact") || "") === "on",
            });
            form.reset();
          }}
        >
          <input name="occurredAt" type="date" className="form-control" required />
          <input name="settledAt" type="date" className="form-control" />
          <select name="transactionType" className="form-select" defaultValue="expense">
            <option value="expense">지출</option>
            <option value="income">수입</option>
            <option value="transfer">이체</option>
            <option value="adjustment">조정</option>
          </select>
          <select name="sourceType" className="form-select" defaultValue="manual">
            <option value="manual">수동입력</option>
            <option value="account">계좌</option>
            <option value="card">카드</option>
          </select>
          <select name="ownerPersonId" className="form-select" defaultValue="">
            <option value="">사용자 선택 안 함</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select name="accountId" className="form-select" defaultValue="">
            <option value="">계좌 연결 안 함</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select name="cardId" className="form-select" defaultValue="">
            <option value="">카드 연결 안 함</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          <select name="categoryId" className="form-select" defaultValue="">
            <option value="">카테고리 선택 안 함</option>
            {scope.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <input name="merchantName" className="form-control" placeholder="가맹점 또는 거래명" required />
          <input name="description" className="form-control" placeholder="설명" />
          <input name="amount" type="number" min="0" step="1" className="form-control" placeholder="금액" required />
          <label className="form-check compact-check">
            <input defaultChecked name="isExpenseImpact" type="checkbox" className="form-check-input" />
            <span className="form-check-label">지출 반영</span>
          </label>
          <label className="form-check compact-check">
            <input name="isSharedExpense" type="checkbox" className="form-check-input" />
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
            <h2 className="section-title">정규화된 거래 데이터</h2>
          </div>
          <span className="badge text-bg-dark">{transactions.length}건</span>
        </div>
        <div className="toolbar-row mb-3">
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
        </div>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>발생일</th>
                <th>결제일</th>
                <th>유형</th>
                <th>가맹점/설명</th>
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
                    <span className={`badge ${transaction.isExpenseImpact ? "text-bg-danger-subtle" : "text-bg-secondary"}`}>
                      {transaction.transactionType}
                    </span>
                  </td>
                  <td>
                    <strong>{transaction.merchantName}</strong>
                    {transaction.description ? <div className="small text-secondary">{transaction.description}</div> : null}
                  </td>
                  <td>{transaction.categoryId ? categories.get(transaction.categoryId) : "미분류"}</td>
                  <td className="text-end">{formatCurrency(transaction.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
