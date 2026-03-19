import { Link } from "react-router-dom";
import {
  getRecurringMerchantSuggestions,
  getUncategorizedTransactions,
  type RecurringMerchantSuggestion,
} from "../../domain/classification/suggestions";
import { isActiveExpenseTransaction } from "../../domain/transactions/meta";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { NextStepCallout } from "../components/NextStepCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const recurringConfidenceLabel = {
  high: "신뢰도 높음",
  medium: "검토 후 적용 권장",
} as const;

function getRecurringConfidenceLabel(confidence: RecurringMerchantSuggestion["confidence"]) {
  return recurringConfidenceLabel[confidence];
}

export function CategoriesPage() {
  const { addCategory, addTag, assignCategory, assignCategoryByMerchant, assignTag, assignTagByMerchant, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const uncategorizedTransactions = getUncategorizedTransactions(scope.transactions);
  const recurringSuggestions = getRecurringMerchantSuggestions(scope.transactions, scope.categories);
  const isCategoryCleanupComplete = recurringSuggestions.length === 0 && uncategorizedTransactions.length === 0;
  const expenseTransactions = scope.transactions.filter(isActiveExpenseTransaction);
  const untaggedExpenseCount = expenseTransactions.filter((item) => item.tagIds.length === 0).length;
  const categorizedCount = expenseTransactions.filter((item) => item.categoryId).length;
  const classificationProgress = expenseTransactions.length ? categorizedCount / expenseTransactions.length : 0;
  const remainingWorkCount = recurringSuggestions.reduce((sum, suggestion) => sum + suggestion.transactionIds.length, 0) + uncategorizedTransactions.length;
  const categoryUsage = new Map<string, { count: number; amount: number }>();
  for (const transaction of expenseTransactions) {
    if (!transaction.categoryId) continue;
    const current = categoryUsage.get(transaction.categoryId) ?? { count: 0, amount: 0 };
    categoryUsage.set(transaction.categoryId, {
      count: current.count + 1,
      amount: current.amount + transaction.amount,
    });
  }
  const usedTagIds = new Set(scope.transactions.flatMap((transaction) => transaction.tagIds));
  const nextCategoryAction = recurringSuggestions.length
    ? {
        title: "지금 가장 먼저 할 일",
        description: `${recurringSuggestions.length}개의 반복 지출 제안을 먼저 적용하면 뒤쪽 분류 작업이 훨씬 빨라집니다.`,
        to: "#recurring-suggestions",
        actionLabel: `반복 제안 ${recurringSuggestions.length}개 보기`,
      }
    : uncategorizedTransactions.length
      ? {
          title: "지금 가장 먼저 할 일",
          description: `${uncategorizedTransactions.length}건의 미분류 거래를 먼저 줄이면 대시보드 해석이 더 빨리 살아납니다.`,
          to: "/transactions?cleanup=uncategorized",
          actionLabel: `미분류 ${uncategorizedTransactions.length}건 정리`,
        }
      : untaggedExpenseCount
        ? {
            title: "지금 가장 먼저 할 일",
            description: `${untaggedExpenseCount}건의 무태그 거래를 묶으면 태그 기준 소비 흐름까지 더 선명해집니다.`,
            to: "/transactions?cleanup=untagged",
            actionLabel: `무태그 ${untaggedExpenseCount}건 정리`,
          }
        : null;

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">분류 흐름</span>
            <h2 className="section-title">업로드 후 분류 우선 처리</h2>
          </div>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <span className="stat-label">반복 지출 자동 제안</span>
            <strong>{recurringSuggestions.length}개</strong>
            <div className="small text-secondary mt-2">여러 달에 걸쳐 반복되고 금액 편차가 작은 거래를 우선적으로 보여줍니다.</div>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <span className="stat-label">미분류 거래</span>
            <strong>{uncategorizedTransactions.length}건</strong>
            <div className="small text-secondary mt-2">반복 규칙에 안 걸린 거래는 사용자가 직접 분류합니다.</div>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <span className="stat-label">분류 완료 거래</span>
            <strong>{categorizedCount}건</strong>
            <div className="small text-secondary mt-2">분류가 쌓일수록 통계와 문제 지출 진단 정확도가 올라갑니다.</div>
          </article>
        </div>
        <div className="guide-progress mt-4">
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="section-kicker">전체 분류 진행률</span>
            <strong>{formatPercent(classificationProgress)}</strong>
          </div>
          <div className="guide-progress-bar mt-3" aria-hidden="true">
            <div className="guide-progress-fill" style={{ width: `${classificationProgress * 100}%` }} />
          </div>
          <div className="small text-secondary mt-3">
            실지출 거래 {expenseTransactions.length}건 중 {categorizedCount}건이 분류되었습니다. 아직 정리할 작업은 약 {remainingWorkCount}건입니다.
          </div>
        </div>
        {nextCategoryAction ? (
          <NextStepCallout
            className="mt-4"
            title={nextCategoryAction.title}
            description={nextCategoryAction.description}
            actionLabel={nextCategoryAction.actionLabel}
            to={nextCategoryAction.to}
          />
        ) : null}
        <div className="review-summary-panel mt-4">
          <div className="review-summary-copy">
            <strong>{uncategorizedTransactions.length ? "분류 뒤에 이어서 할 일" : "카테고리 분류는 거의 끝났습니다"}</strong>
            <p className="mb-0 text-secondary">
              {uncategorizedTransactions.length
                ? "반복 지출 제안과 미분류 거래를 먼저 줄인 뒤, 무태그 거래를 묶고 대시보드에서 이번 달 진단을 확인하는 흐름이 가장 자연스럽습니다."
                : untaggedExpenseCount
                  ? "카테고리는 정리됐고, 이제 무태그 거래만 묶어두면 태그 기준 소비 흐름까지 더 선명하게 볼 수 있습니다."
                  : "카테고리와 태그 정리가 모두 끝난 상태라 이제 대시보드 해석과 정산 화면을 더 믿고 볼 수 있습니다."}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {uncategorizedTransactions.length ? (
              <Link to="/transactions?cleanup=uncategorized" className="btn btn-outline-primary btn-sm">
                미분류 {uncategorizedTransactions.length}건 정리
              </Link>
            ) : null}
            {untaggedExpenseCount ? (
              <Link to="/transactions?cleanup=untagged" className="btn btn-outline-secondary btn-sm">
                무태그 {untaggedExpenseCount}건 정리
              </Link>
            ) : null}
            <Link to="/" className="btn btn-outline-dark btn-sm">
              대시보드 보기
            </Link>
          </div>
        </div>
        {isCategoryCleanupComplete ? (
          <CompletionBanner
            className="mt-3"
            title="카테고리 분류 정리가 끝났습니다"
            description="반복 지출 제안과 미분류 거래가 모두 정리됐습니다. 이제 무태그 거래를 묶거나 대시보드와 정산 화면에서 이번 달 흐름을 확인하면 됩니다."
            actions={
              <>
                {untaggedExpenseCount ? (
                  <Link to="/transactions?cleanup=untagged" className="btn btn-outline-secondary btn-sm">
                    무태그 {untaggedExpenseCount}건 정리
                  </Link>
                ) : null}
                <Link to="/" className="btn btn-outline-dark btn-sm">
                  대시보드 보기
                </Link>
                <Link to="/settlements" className="btn btn-outline-primary btn-sm">
                  정산 화면 보기
                </Link>
              </>
            }
          />
        ) : null}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">분류 진행도</span>
            <h2 className="section-title">지금 어디까지 끝났는지 보기</h2>
          </div>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card">
            <span className="stat-label">1단계</span>
            <strong>{recurringSuggestions.length ? "반복 지출 검토 필요" : "반복 지출 정리됨"}</strong>
            <div className="small text-secondary mt-2">
              반복적으로 등장하는 가맹점부터 카테고리를 한 번에 적용해보세요. 현재 후보는 {recurringSuggestions.length}개입니다.
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-label">2단계</span>
            <strong>{uncategorizedTransactions.length ? "미분류 거래 남음" : "미분류 거래 없음"}</strong>
            <div className="small text-secondary mt-2">
              반복 규칙에서 빠진 거래는 개별 분류로 마무리하면 됩니다. 지금 남은 직접 분류 거래는 {uncategorizedTransactions.length}건입니다.
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-label">3단계</span>
            <strong>통계 확인</strong>
            <div className="small text-secondary mt-2">
              분류를 정리한 뒤 대시보드에서 이번 달 문제 지출과 저축률을 확인해보세요. 현재 진행률은 {formatPercent(classificationProgress)}입니다.
            </div>
            <Link to="/" className="btn btn-outline-primary btn-sm mt-3">
              대시보드로 이동
            </Link>
          </article>
        </div>
      </section>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(2)} id="recurring-suggestions">
          <div className="section-head">
            <div>
              <span className="section-kicker">자동 제안</span>
              <h2 className="section-title">반복 지출 카테고리 지정</h2>
            </div>
          </div>
          <div className="review-list">
            {recurringSuggestions.map((suggestion, index) => (
              <article key={suggestion.merchantName} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">고정지출 후보</span>
                    <h3>{suggestion.merchantName}</h3>
                    <p className="mb-1 text-secondary">
                      반복 {suggestion.count}건 · {suggestion.monthCount}개월 · 평균 {formatCurrency(suggestion.amountAverage)}
                    </p>
                    <p className="mb-0 text-secondary">
                      {getRecurringConfidenceLabel(suggestion.confidence)} · 최근 {suggestion.lastOccurredAt.slice(0, 10)} · 금액 편차{" "}
                      {Math.round(suggestion.amountSpreadRate * 100)}%
                    </p>
                  </div>
                  <span className={`badge ${suggestion.confidence === "high" ? "text-bg-primary" : "text-bg-light"}`}>
                    {getRecurringConfidenceLabel(suggestion.confidence)}
                  </span>
                </div>
                <form
                  className="classification-action-row mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const select = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
                    const tagSelect = form.elements.namedItem("tagId") as HTMLSelectElement | null;
                    const categoryId = select?.value ?? "";
                    const tagId = tagSelect?.value ?? "";
                    if (!categoryId) return;
                    assignCategoryByMerchant(workspaceId, suggestion.merchantName, categoryId);
                    if (tagId) {
                      assignTagByMerchant(workspaceId, suggestion.merchantName, tagId);
                    }
                    form.reset();
                  }}
                >
                  <select name="categoryId" className="form-select">
                    <option value="">카테고리 선택</option>
                    {scope.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <select name="tagId" className="form-select" defaultValue="">
                    <option value="">태그 선택 안 함</option>
                    {scope.tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" type="submit">
                    반복 거래에 적용
                  </button>
                </form>
              </article>
            ))}
            {!recurringSuggestions.length ? (
              <p className="text-secondary mb-0">
                지금은 여러 달에 걸쳐 반복된 미분류 지출이 없습니다. 거래가 더 쌓이거나 카테고리 정보가 정리되면 후보가 자동으로 잡힙니다.
              </p>
            ) : null}
          </div>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(3)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">수동 분류</span>
              <h2 className="section-title">미분류 거래 처리</h2>
            </div>
          </div>
          <div className="review-list">
            {uncategorizedTransactions.slice(0, 20).map((transaction, index) => (
              <article key={transaction.id} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">분류 필요</span>
                    <h3>{transaction.merchantName}</h3>
                    <p className="mb-1 text-secondary">
                      {transaction.occurredAt.slice(0, 10)} · {formatCurrency(transaction.amount)}
                    </p>
                    {transaction.description ? <p className="mb-0 text-secondary">{transaction.description}</p> : null}
                  </div>
                </div>
                <form
                  className="classification-action-row mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const select = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
                    const tagSelect = form.elements.namedItem("tagId") as HTMLSelectElement | null;
                    const categoryId = select?.value ?? "";
                    const tagId = tagSelect?.value ?? "";
                    if (!categoryId) return;
                    assignCategory(workspaceId, transaction.id, categoryId);
                    if (tagId) {
                      assignTag(workspaceId, transaction.id, tagId);
                    }
                    form.reset();
                  }}
                >
                  <select name="categoryId" className="form-select">
                    <option value="">카테고리 선택</option>
                    {scope.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <select name="tagId" className="form-select" defaultValue="">
                    <option value="">태그 선택 안 함</option>
                    {scope.tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-outline-primary" type="submit">
                    이 거래 분류
                  </button>
                </form>
              </article>
            ))}
            {!uncategorizedTransactions.length ? (
              <p className="text-secondary mb-0">미분류 거래가 없습니다. 이제 통계와 문제 지출 진단을 더 믿고 볼 수 있습니다.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(4)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">분류 관리</span>
              <h2 className="section-title">카테고리</h2>
            </div>
          </div>
          <form
            className="simple-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
              const value = input?.value.trim() ?? "";
              if (!value) return;
              addCategory(workspaceId, value);
              event.currentTarget.reset();
            }}
          >
            <input name="name" className="form-control" placeholder="카테고리 이름" />
            <button className="btn btn-primary" type="submit">
              카테고리 추가
            </button>
          </form>
          <div className="resource-grid mt-4">
            {scope.categories.map((category) => (
              <article key={category.id} className="resource-card">
                <h3>{category.name}</h3>
                <p className="mb-1 text-secondary">
                  {category.direction} · {category.fixedOrVariable}
                </p>
                <p className="mb-1 text-secondary">{category.necessity}</p>
                <p className="mb-0 text-secondary">
                  사용 {categoryUsage.get(category.id)?.count ?? 0}건 · {formatCurrency(categoryUsage.get(category.id)?.amount ?? 0)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(5)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">분류 관리</span>
              <h2 className="section-title">태그</h2>
            </div>
          </div>
          <form
            className="simple-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
              const value = input?.value.trim() ?? "";
              if (!value) return;
              addTag(workspaceId, value);
              event.currentTarget.reset();
            }}
          >
            <input name="name" className="form-control" placeholder="태그 이름" />
            <button className="btn btn-primary" type="submit">
              태그 추가
            </button>
          </form>
          <div className="resource-grid mt-4">
            {scope.tags.map((tag) => (
              <article key={tag.id} className="resource-card">
                <h3>{tag.name}</h3>
                <div className="tag-color-chip" style={{ backgroundColor: tag.color }} />
                <p className="mb-0 text-secondary">{usedTagIds.has(tag.id) ? "거래에 사용 중" : "아직 미사용"}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
