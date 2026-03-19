import { Link } from "react-router-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function PeoplePage() {
  const { addPerson, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const people = scope.people;
  const transactions = getActiveTransactions(scope.transactions);

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 관리</span>
            <h2 className="section-title">사람</h2>
          </div>
        </div>
        <p className="text-secondary">
          가계부를 함께 쓰는 사람을 먼저 등록해두면 개인지출과 공동지출을 나누고, 정산 화면에서도 누가 얼마나 부담했는지 더 자연스럽게
          볼 수 있습니다.
        </p>
        <form
          className="simple-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (!value) return;
            addPerson(workspaceId, value);
            event.currentTarget.reset();
          }}
        >
          <input name="name" className="form-control" placeholder="이름" />
          <button className="btn btn-primary" type="submit">
            사람 추가
          </button>
        </form>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 목록</span>
            <h2 className="section-title">등록된 사람 보기</h2>
          </div>
          <span className="badge text-bg-dark">{people.length}명</span>
        </div>
        {!people.length ? (
          <EmptyStateCallout
            kicker="첫 단계"
            title="함께 관리할 사람을 먼저 등록해주세요"
            description="개인지출과 공동지출을 나누고 정산까지 보려면 구성원 정보가 먼저 필요합니다."
            actions={
              <Link to="/accounts" className="btn btn-outline-secondary btn-sm">
                다음 단계 미리 보기
              </Link>
            }
          />
        ) : (
          <div className="resource-grid">
            {people.map((person, index) => (
              (() => {
                const usage = getPersonUsageSummary(transactions, person.id);
                return (
                  <article key={person.id} className="resource-card" style={getMotionStyle(index + 2)}>
                    <h3>{person.name}</h3>
                    <p className="mb-1 text-secondary">{person.role === "owner" ? "기본 사용자" : "구성원"}</p>
                    <p className="mb-1 text-secondary">거래 {usage.transactionCount}건</p>
                    <p className="mb-0 text-secondary">공동지출 {formatCurrency(usage.sharedExpenseAmount)}</p>
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
