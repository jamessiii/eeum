import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function SettlementsPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.name]));

  const sharedTransactions = scope.transactions
    .filter((transaction) => transaction.status === "active" && transaction.isSharedExpense && transaction.isExpenseImpact)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const totalsByPerson = new Map<string, number>();
  for (const transaction of sharedTransactions) {
    const key = transaction.ownerPersonId ?? "shared";
    totalsByPerson.set(key, (totalsByPerson.get(key) ?? 0) + transaction.amount);
  }

  const participantCount = Math.max(scope.people.length, 1);
  const totalSharedExpense = [...totalsByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const splitTarget = totalSharedExpense / participantCount;

  const rows = [...totalsByPerson.entries()]
    .map(([personId, amount]) => ({
      personId,
      name: peopleMap.get(personId) ?? "공동 계정",
      amount,
      delta: amount - splitTarget,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const receiver = rows.find((row) => row.delta > 0);
  const sender = rows.find((row) => row.delta < 0);
  const suggestedSettlementAmount =
    receiver && sender ? Math.min(receiver.delta, Math.abs(sender.delta)) : 0;

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">공동지출 정산</span>
            <h2 className="section-title">이번 달 정산 흐름</h2>
          </div>
        </div>
        <p className="text-secondary mb-0">
          공동지출로 표시된 거래만 합산해서 각 사람이 얼마나 부담했는지 비교합니다. 생활비 계좌처럼 공동 자금에서 결제한 거래도 이
          화면에서 함께 점검할 수 있습니다.
        </p>
      </section>

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">정산 요약</span>
              <h2 className="section-title">누가 더 냈는지 보기</h2>
            </div>
          </div>
          {!rows.length ? (
            <EmptyStateCallout
              kicker="정산 대기"
              title="아직 공동지출 데이터가 없습니다"
              description="거래 입력이나 업로드 뒤에 공동지출 체크를 해두면 여기서 사람별 부담과 정산 후보를 계산해 보여줍니다."
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

              <div className="settlement-summary-box mt-4">
                <span className="section-kicker">추천 정산</span>
                <h3 className="settlement-summary-title">
                  {receiver && sender
                    ? `${sender.name} → ${receiver.name} ${formatCurrency(suggestedSettlementAmount)}`
                    : "현재는 정산 후보를 계산할 수 없습니다"}
                </h3>
                <p className="text-secondary mb-0">
                  {receiver && sender
                    ? "가장 단순한 정산 흐름을 기준으로 보여줍니다. 이후 단계에서 정산 완료 처리와 비율 조정도 붙일 예정입니다."
                    : "공동지출 참여자와 거래가 더 쌓이면 정산 방향을 자동으로 제안합니다."}
                </p>
              </div>

              <div className="review-list mt-4">
                {rows.map((row, index) => (
                  <article key={row.personId} className="review-card" style={getMotionStyle(index + 2)}>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <span className="review-type">정산 요약</span>
                        <h3>{row.name}</h3>
                        <p className="mb-0 text-secondary">현재 부담액 {formatCurrency(row.amount)}</p>
                      </div>
                      <span className={`badge ${row.delta > 0 ? "text-bg-warning" : "text-bg-success"}`}>
                        {row.delta > 0
                          ? `${formatCurrency(row.delta)} 더 부담`
                          : `${formatCurrency(Math.abs(row.delta))} 덜 부담`}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card shadow-sm" style={getMotionStyle(2)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">최근 공동지출</span>
              <h2 className="section-title">정산 근거 거래</h2>
            </div>
          </div>
          {!sharedTransactions.length ? (
            <EmptyStateCallout
              kicker="공동지출 없음"
              title="공동지출 거래가 아직 잡히지 않았습니다"
              description="거래 화면이나 검토함에서 공동지출 여부를 표시하면 이 목록에 쌓이고 정산 계산에도 반영됩니다."
            />
          ) : (
            <div className="mini-breakdown-list">
              {sharedTransactions.slice(0, 8).map((transaction, index) => (
                <div key={transaction.id} className="mini-breakdown-row" style={getMotionStyle(index + 3)}>
                  <div>
                    <strong>{transaction.merchantName}</strong>
                    <div className="small text-secondary">
                      {transaction.occurredAt.slice(0, 10)} · {peopleMap.get(transaction.ownerPersonId ?? "") ?? "공동"}
                    </div>
                  </div>
                  <strong>{formatCurrency(transaction.amount)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="guide-progress">
            <span className="section-kicker">정산 가이드</span>
            <ul className="next-step-list mt-3">
              <li>공동지출이 맞는 거래만 표시해야 정산 금액이 과하게 잡히지 않습니다.</li>
              <li>생활비 계좌에서 나간 결제는 개인 부담인지 공동 부담인지 함께 확인해보세요.</li>
              <li>다음 단계에서는 정산 완료 처리와 분담 비율 조정 기능을 붙일 예정입니다.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
