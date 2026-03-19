import { Link } from "react-router-dom";
import { getAccountUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function AccountsPage() {
  const { addAccount, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const accounts = scope.accounts;
  const transactions = getActiveTransactions(scope.transactions);

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">자산 관리</span>
            <h2 className="section-title">계좌</h2>
          </div>
        </div>
        <p className="text-secondary">
          계좌를 등록해두면 내부이체와 실제 지출을 구분하기 쉬워지고, 생활비 통장처럼 공동 자금 흐름도 더 정확하게 파악할 수 있습니다.
        </p>
        <form
          className="simple-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
            const institutionInput = form.elements.namedItem("institution") as HTMLInputElement | null;
            const name = nameInput?.value.trim() ?? "";
            const institutionName = institutionInput?.value.trim() ?? "";
            if (!name) return;
            addAccount(workspaceId, name, institutionName || "직접입력");
            form.reset();
          }}
        >
          <input name="name" className="form-control" placeholder="계좌 이름" />
          <input name="institution" className="form-control" placeholder="금융기관" />
          <button className="btn btn-primary" type="submit">
            계좌 추가
          </button>
        </form>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">계좌 목록</span>
            <h2 className="section-title">등록된 계좌 보기</h2>
          </div>
          <span className="badge text-bg-dark">{accounts.length}개</span>
        </div>
        {!accounts.length ? (
          <EmptyStateCallout
            kicker="자산 준비"
            title="분석 전에 계좌를 등록해주세요"
            description="내부이체와 실제 소비를 구분하려면 계좌 정보가 먼저 필요합니다. 생활비용 공동 계좌가 있으면 함께 등록해두세요."
            actions={
              <Link to="/cards" className="btn btn-outline-secondary btn-sm">
                카드 관리로 이동
              </Link>
            }
          />
        ) : (
          <div className="resource-grid">
            {accounts.map((account, index) => (
              (() => {
                const usage = getAccountUsageSummary(transactions, account.id);
                return (
                  <article key={account.id} className="resource-card" style={getMotionStyle(index + 2)}>
                    <h3>{account.name}</h3>
                    <p className="mb-1 text-secondary">{account.institutionName}</p>
                    <p className="mb-1 text-secondary">
                      {account.isShared ? "공동 계좌" : "개인 계좌"} · {account.accountNumberMasked || "마스킹 없음"}
                    </p>
                    <p className="mb-1 text-secondary">연결 거래 {usage.transactionCount}건</p>
                    <p className="mb-0 text-secondary">
                      실지출 {formatCurrency(usage.expenseAmount)} · 내부이체 {usage.internalTransferCount}건
                    </p>
                  </article>
                );
              })()
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
