import { getRecurringMerchantSuggestions, getUncategorizedTransactions } from "../../domain/classification/suggestions";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function CategoriesPage() {
  const { addCategory, addTag, assignCategory, assignCategoryByMerchant, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const uncategorizedTransactions = getUncategorizedTransactions(scope.transactions);
  const recurringSuggestions = getRecurringMerchantSuggestions(scope.transactions, scope.categories);

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
            <div className="small text-secondary mt-2">같은 가맹점이 반복되면 고정지출 후보로 먼저 보여줍니다.</div>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <span className="stat-label">미분류 거래</span>
            <strong>{uncategorizedTransactions.length}건</strong>
            <div className="small text-secondary mt-2">반복 규칙에 안 걸린 거래는 사용자가 직접 분류합니다.</div>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <span className="stat-label">분류 후 가능 작업</span>
            <strong>통계 / 진단</strong>
            <div className="small text-secondary mt-2">카테고리 지정이 끝나야 대시보드와 코칭이 더 정확해집니다.</div>
          </article>
        </div>
      </section>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(1)}>
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
                      반복 {suggestion.count}건 · 평균 {formatCurrency(suggestion.amountAverage)}
                    </p>
                    <p className="mb-0 text-secondary">반복적으로 등장하는 거래이므로 카테고리 일괄 적용을 먼저 제안합니다.</p>
                  </div>
                </div>
                <form
                  className="classification-action-row mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const select = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
                    const categoryId = select?.value ?? "";
                    if (!categoryId) return;
                    assignCategoryByMerchant(workspaceId, suggestion.merchantName, categoryId);
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
                  <button className="btn btn-primary" type="submit">
                    반복 거래에 적용
                  </button>
                </form>
              </article>
            ))}
            {!recurringSuggestions.length ? (
              <p className="text-secondary mb-0">아직 반복 지출 자동 제안이 없습니다. 업로드 데이터가 더 쌓이면 후보가 생깁니다.</p>
            ) : null}
          </div>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(2)}>
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
                    const categoryId = select?.value ?? "";
                    if (!categoryId) return;
                    assignCategory(workspaceId, transaction.id, categoryId);
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
                  <button className="btn btn-outline-primary" type="submit">
                    이 거래 분류
                  </button>
                </form>
              </article>
            ))}
            {!uncategorizedTransactions.length ? <p className="text-secondary mb-0">미분류 거래가 없습니다. 이제 통계를 더 신뢰할 수 있습니다.</p> : null}
          </div>
        </section>
      </div>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(3)}>
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
                <p className="mb-0 text-secondary">{category.necessity}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card shadow-sm" style={getMotionStyle(4)}>
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
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
