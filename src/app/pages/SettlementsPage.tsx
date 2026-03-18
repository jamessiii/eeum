import { formatCurrency } from "../../shared/utils/format";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function SettlementsPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.name]));
  const sharedTransactions = scope.transactions.filter((transaction) => transaction.isSharedExpense && transaction.isExpenseImpact);

  const totalsByPerson = new Map<string, number>();
  for (const transaction of sharedTransactions) {
    const key = transaction.ownerPersonId ?? "shared";
    totalsByPerson.set(key, (totalsByPerson.get(key) ?? 0) + transaction.amount);
  }

  const totalSharedExpense = [...totalsByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const splitTarget = scope.people.length > 0 ? totalSharedExpense / scope.people.length : 0;
  const rows = [...totalsByPerson.entries()].map(([personId, amount]) => ({
    personId,
    name: peopleMap.get(personId) ?? "공동 계정",
    amount,
    delta: amount - splitTarget,
  }));

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">공동지출 정산</span>
            <h2 className="section-title">이번 달 정산 후보</h2>
          </div>
        </div>
        {!rows.length ? (
          <EmptyStateCallout
            kicker="정산 대기"
            title="아직 공동지출 데이터가 없습니다"
            description="거래 입력 또는 업로드 후 공동지출 여부를 체크하면 이 화면에서 사람별 부담과 정산 후보를 계산할 수 있습니다."
          />
        ) : (
          <>
            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">공동지출 총액</span>
                <strong>{formatCurrency(totalSharedExpense)}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">1인 기준 부담액</span>
                <strong>{formatCurrency(splitTarget)}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">공동지출 건수</span>
                <strong>{sharedTransactions.length}건</strong>
              </article>
            </div>
            <div className="review-list mt-4">
              {rows.map((row) => (
                <article key={row.personId} className="review-card">
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <span className="review-type">정산 요약</span>
                      <h3>{row.name}</h3>
                      <p className="mb-0 text-secondary">현재 부담액 {formatCurrency(row.amount)}</p>
                    </div>
                    <span className={`badge ${row.delta > 0 ? "text-bg-warning" : "text-bg-success"}`}>
                      {row.delta > 0 ? `받을 가능성 ${formatCurrency(row.delta)}` : `보낼 가능성 ${formatCurrency(Math.abs(row.delta))}`}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">정산 가이드</span>
            <h2 className="section-title">다음 단계</h2>
          </div>
        </div>
        <ul className="next-step-list">
          <li>공동지출이 맞는 거래만 공동지출로 표시하면 정산 후보가 더 정확해집니다.</li>
          <li>생활비 계좌에서 결제된 거래는 실제 개인 부담과 다를 수 있으니 검토함과 함께 보세요.</li>
          <li>다음 단계에서는 정산 완료 처리와 분담 비율 조정을 붙일 예정입니다.</li>
        </ul>
      </section>
    </div>
  );
}
