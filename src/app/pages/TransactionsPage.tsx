import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const transactionTypeLabel = {
  expense: "지출",
  income: "수입",
  transfer: "이체",
  adjustment: "조정",
} as const;

const transactionStatusLabel = {
  active: "활성",
  refunded: "환불됨",
  cancelled: "제외됨",
} as const;

const flowModeLabel = {
  expense: "실지출",
  non_expense: "비지출 흐름",
} as const;

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
  const { addTransaction, assignCategoryBatch, assignTagBatch, state } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categories = new Map(scope.categories.map((item) => [item.id, item.name]));
  const tags = new Map(scope.tags.map((item) => [item.id, item]));
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.name]));
  const people = scope.people;
  const cards = scope.cards;
  const accounts = scope.accounts;

  const [filters, setFilters] = useState({
    transactionType: "all",
    ownerPersonId: "all",
    status: "all",
    nature: "all",
    tagId: "all",
    searchQuery: "",
  });
  const [draftType, setDraftType] = useState<"expense" | "income" | "transfer" | "adjustment">("expense");
  const [draftExpenseImpact, setDraftExpenseImpact] = useState(true);
  const [draftSharedExpense, setDraftSharedExpense] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkTagId, setBulkTagId] = useState("");

  const transactions = useMemo(
    () =>
      scope.transactions
        .filter((item) => (filters.transactionType === "all" ? true : item.transactionType === filters.transactionType))
        .filter((item) => (filters.ownerPersonId === "all" ? true : item.ownerPersonId === filters.ownerPersonId))
        .filter((item) => (filters.status === "all" ? true : item.status === filters.status))
        .filter((item) => {
          if (filters.nature === "all") return true;
          if (filters.nature === "expense") return item.isExpenseImpact;
          if (filters.nature === "shared") return item.isSharedExpense;
          if (filters.nature === "internal_transfer") return item.isInternalTransfer;
          if (filters.nature === "uncategorized") return item.isExpenseImpact && !item.categoryId;
          if (filters.nature === "untagged") return item.isExpenseImpact && item.tagIds.length === 0;
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
    [filters.nature, filters.ownerPersonId, filters.searchQuery, filters.status, filters.tagId, filters.transactionType, scope.transactions],
  );

  const activeTransactions = transactions.filter((item) => item.status === "active");
  const categorizableTransactions = activeTransactions.filter((item) => item.isExpenseImpact);
  const taggableTransactions = activeTransactions.filter((item) => item.isExpenseImpact);
  const activeExpenseCount = activeTransactions.filter((item) => item.isExpenseImpact).length;
  const internalTransferCount = activeTransactions.filter((item) => item.isInternalTransfer).length;
  const sharedExpenseCount = activeTransactions.filter((item) => item.isSharedExpense).length;
  const uncategorizedCount = activeTransactions.filter((item) => item.isExpenseImpact && !item.categoryId).length;
  const untaggedCount = activeTransactions.filter((item) => item.isExpenseImpact && item.tagIds.length === 0).length;
  const activeCleanupMode = cleanupModeCopy[filters.nature as keyof typeof cleanupModeCopy] ?? cleanupModeCopy.all;
  const isFocusedCleanupMode = filters.nature === "uncategorized" || filters.nature === "untagged";

  useEffect(() => {
    const cleanup = searchParams.get("cleanup");
    if (cleanup === "uncategorized" || cleanup === "untagged") {
      setFilters((current) => ({ ...current, nature: cleanup }));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
            <option value="manual">수동입력</option>
            <option value="account">계좌</option>
            <option value="card">카드</option>
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

            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>{activeCleanupMode.title}</strong>
                <p className="mb-0 text-secondary">{activeCleanupMode.description}</p>
              </div>
              <div className="small text-secondary">
                현재 보이는 거래 {transactions.length}건 중 실지출 {activeExpenseCount}건, 미분류 {uncategorizedCount}건, 무태그 {untaggedCount}건입니다.
              </div>
            </div>
            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>빠르게 정리할 거래 고르기</strong>
                <p className="mb-0 text-secondary">남은 정리 작업이 많은 거래만 바로 좁혀 보고, 아래 일괄 정리 도구로 이어서 정리할 수 있습니다.</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "uncategorized" }))}>
                  미분류만 보기
                </button>
                <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "untagged" }))}>
                  무태그만 보기
                </button>
                <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setFilters((current) => ({ ...current, nature: "all", tagId: "all", searchQuery: "" }))}>
                  정리 필터 초기화
                </button>
              </div>
            </div>

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

            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>현재 보이는 거래 정리</strong>
                <p className="mb-0 text-secondary">
                  현재 필터 결과에서 실지출로 잡히는 거래는 {taggableTransactions.length}건입니다. 같은 맥락의 거래가 모여 있다면 태그를 한 번에 붙여 이후 검색과 분석 흐름을 더 빠르게 만들 수 있습니다.
                </p>
              </div>
              <form
                className="classification-action-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!bulkTagId || !taggableTransactions.length) return;
                  assignTagBatch(
                    workspaceId,
                    taggableTransactions.map((item) => item.id),
                    bulkTagId,
                  );
                  setBulkTagId("");
                }}
              >
                <select className="form-select" value={bulkTagId} onChange={(event) => setBulkTagId(event.target.value)}>
                  <option value="">일괄 적용할 태그 선택</option>
                  {scope.tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <div className="small text-secondary d-flex align-items-center">필터된 실지출 거래 전체에 같은 태그를 붙입니다.</div>
                <button className="btn btn-outline-primary" type="submit" disabled={!bulkTagId || !taggableTransactions.length}>
                  태그 일괄 적용
                </button>
              </form>
            </div>

            <div className="review-summary-panel mb-3">
              <div className="review-summary-copy">
                <strong>현재 보이는 거래 카테고리 정리</strong>
                <p className="mb-0 text-secondary">
                  현재 필터 결과에서 카테고리를 정리할 수 있는 실지출 거래는 {categorizableTransactions.length}건입니다. 같은 소비 묶음이 보이면 카테고리를 한 번에 맞춰 통계 정확도를 빠르게 높일 수 있습니다.
                </p>
              </div>
              <form
                className="classification-action-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!bulkCategoryId || !categorizableTransactions.length) return;
                  assignCategoryBatch(
                    workspaceId,
                    categorizableTransactions.map((item) => item.id),
                    bulkCategoryId,
                  );
                  setBulkCategoryId("");
                }}
              >
                <select className="form-select" value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)}>
                  <option value="">일괄 적용할 카테고리 선택</option>
                  {scope.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="small text-secondary d-flex align-items-center">필터된 실지출 거래 전체에 같은 카테고리를 붙입니다.</div>
                <button className="btn btn-outline-primary" type="submit" disabled={!bulkCategoryId || !categorizableTransactions.length}>
                  카테고리 일괄 적용
                </button>
              </form>
            </div>

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
                        <span className={`badge ${transaction.isExpenseImpact ? "text-bg-danger-subtle" : "text-bg-secondary"}`}>
                          {transactionTypeLabel[transaction.transactionType]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            transaction.status === "active"
                              ? "text-bg-success"
                              : transaction.status === "cancelled"
                                ? "text-bg-secondary"
                                : "text-bg-info"
                          }`}
                        >
                          {transactionStatusLabel[transaction.status]}
                        </span>
                      </td>
                      <td>
                        <div className="transaction-nature-stack">
                          <span className={`badge ${transaction.isExpenseImpact ? "text-bg-danger-subtle" : "text-bg-secondary-subtle"}`}>
                            {transaction.isExpenseImpact ? flowModeLabel.expense : flowModeLabel.non_expense}
                          </span>
                          {transaction.isInternalTransfer ? <span className="badge text-bg-info-subtle">내부이체</span> : null}
                          {transaction.isSharedExpense ? <span className="badge text-bg-warning-subtle">공동지출</span> : null}
                        </div>
                      </td>
                      <td>
                        <strong>{transaction.merchantName}</strong>
                        <div className="small text-secondary">
                          {transaction.description || (transaction.isInternalTransfer ? "내부이체로 처리된 거래" : "설명 없음")}
                        </div>
                        {transaction.tagIds.length ? (
                          <div className="transaction-tag-row">
                            {transaction.tagIds
                              .map((tagId) => tags.get(tagId))
                              .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
                              .map((tag) => (
                                <span key={tag.id} className="tag-pill" style={{ ["--tag-color" as string]: tag.color }}>
                                  {tag.name}
                                </span>
                              ))}
                          </div>
                        ) : null}
                      </td>
                      <td>{peopleMap.get(transaction.ownerPersonId ?? "") ?? "-"}</td>
                      <td>{transaction.categoryId ? categories.get(transaction.categoryId) : "미분류"}</td>
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
