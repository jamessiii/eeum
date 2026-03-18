import { monthKey } from "../../shared/utils/date";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function SettlementsPage() {
  const { addSettlement, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.name]));

  const currentMonth = monthKey(new Date());
  const sharedTransactions = scope.transactions
    .filter(
      (transaction) =>
        transaction.status === "active" &&
        transaction.isSharedExpense &&
        transaction.isExpenseImpact &&
        monthKey(transaction.occurredAt) === currentMonth,
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const totalsByPerson = new Map<string, number>();
  for (const transaction of sharedTransactions) {
    const key = transaction.ownerPersonId ?? "shared";
    totalsByPerson.set(key, (totalsByPerson.get(key) ?? 0) + transaction.amount);
  }

  const participantCount = Math.max(scope.people.length, 1);
  const totalSharedExpense = [...totalsByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const splitTarget = totalSharedExpense / participantCount;

  const baseRows = [...totalsByPerson.entries()]
    .map(([personId, amount]) => ({
      personId,
      name: peopleMap.get(personId) ?? "공동 계정",
      amount,
      delta: amount - splitTarget,
    }));

  const settlementHistory = [...scope.settlements]
    .filter((item) => item.month === currentMonth)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const completedSettlementAmount = settlementHistory.reduce((sum, item) => sum + item.amount, 0);

  const remainingDeltaByPerson = new Map(baseRows.map((row) => [row.personId, row.delta]));
  for (const item of settlementHistory) {
    const fromKey = item.fromPersonId ?? "shared";
    const toKey = item.toPersonId ?? "shared";
    if (remainingDeltaByPerson.has(fromKey)) {
      remainingDeltaByPerson.set(fromKey, (remainingDeltaByPerson.get(fromKey) ?? 0) + item.amount);
    }
    if (remainingDeltaByPerson.has(toKey)) {
      remainingDeltaByPerson.set(toKey, (remainingDeltaByPerson.get(toKey) ?? 0) - item.amount);
    }
  }

  const rows = baseRows
    .map((row) => ({
      ...row,
      remainingDelta: remainingDeltaByPerson.get(row.personId) ?? row.delta,
    }))
    .sort((a, b) => Math.abs(b.remainingDelta) - Math.abs(a.remainingDelta));

  const receiver = rows.find((row) => row.remainingDelta > 0);
  const sender = rows.find((row) => row.remainingDelta < 0);
  const suggestedSettlementAmount =
    receiver && sender ? Math.min(receiver.remainingDelta, Math.abs(sender.remainingDelta)) : 0;

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
          공동지출로 표시된 거래만 합산해서 각 사람이 얼마나 부담했는지 비교합니다. 이번 달 정산 후보를 보고 실제로 끝낸 정산은 아래
          기록으로 남길 수 있습니다.
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
                <article className="stat-card">
                  <span className="stat-label">완료된 정산</span>
                  <strong>{formatCurrency(completedSettlementAmount)}</strong>
                </article>
              </div>

              <div className="settlement-summary-box mt-4">
                <span className="section-kicker">남은 정산 기준</span>
                <h3 className="settlement-summary-title">
                  {receiver && sender
                    ? `${sender.name} → ${receiver.name} ${formatCurrency(suggestedSettlementAmount)}`
                    : "현재는 남은 정산 후보가 없습니다"}
                </h3>
                <p className="text-secondary mb-0">
                  {receiver && sender
                    ? "이미 기록한 정산을 반영한 뒤, 아직 남아 있는 최소 정산 흐름을 기준으로 보여줍니다."
                    : settlementHistory.length
                      ? "현재 기록 기준으로는 이번 달 정산이 거의 끝난 상태입니다."
                      : "공동지출 참여자와 거래가 더 쌓이면 정산 방향을 자동으로 제안합니다."}
                </p>
                {receiver && sender ? (
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        addSettlement({
                          workspaceId,
                          month: currentMonth,
                          fromPersonId: sender.personId === "shared" ? null : sender.personId,
                          toPersonId: receiver.personId === "shared" ? null : receiver.personId,
                          amount: suggestedSettlementAmount,
                          note: "자동 제안 기준 정산 완료",
                        })
                      }
                    >
                      추천 정산 완료로 기록
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="review-list mt-4">
                {rows.map((row, index) => (
                  <article key={row.personId} className="review-card" style={getMotionStyle(index + 2)}>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <span className="review-type">정산 요약</span>
                        <h3>{row.name}</h3>
                        <p className="mb-1 text-secondary">현재 부담액 {formatCurrency(row.amount)}</p>
                        <p className="mb-0 text-secondary">
                          정산 전 편차 {formatCurrency(Math.abs(row.delta))} · 남은 편차 {formatCurrency(Math.abs(row.remainingDelta))}
                        </p>
                      </div>
                      <span className={`badge ${row.remainingDelta > 0 ? "text-bg-warning" : "text-bg-success"}`}>
                        {row.remainingDelta > 0
                          ? `${formatCurrency(row.remainingDelta)} 더 부담`
                          : `${formatCurrency(Math.abs(row.remainingDelta))} 덜 부담`}
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
              <span className="section-kicker">이번 달 정산 기록</span>
              <h2 className="section-title">완료된 정산 내역</h2>
            </div>
          </div>
          {!settlementHistory.length ? (
            <EmptyStateCallout
              kicker="기록 없음"
              title="아직 완료로 남긴 정산이 없습니다"
              description="추천 정산이 맞다면 완료로 기록해서 이번 달 정산 내역을 남겨보세요."
            />
          ) : (
            <div className="review-list">
              {settlementHistory.map((item, index) => (
                <article key={item.id} className="review-card" style={getMotionStyle(index + 3)}>
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <span className="review-type">정산 완료</span>
                      <h3>
                        {(item.fromPersonId ? peopleMap.get(item.fromPersonId) : "공동") ?? "공동"} →{" "}
                        {(item.toPersonId ? peopleMap.get(item.toPersonId) : "공동") ?? "공동"}
                      </h3>
                      <p className="mb-1 text-secondary">{formatCurrency(item.amount)}</p>
                      <p className="mb-0 text-secondary">
                        {item.completedAt.slice(0, 19).replace("T", " ")} · {item.note || "메모 없음"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="guide-progress mt-4">
            <span className="section-kicker">정산 가이드</span>
            <ul className="next-step-list mt-3">
              <li>공동지출이 맞는 거래만 표시해야 정산 금액이 과하게 잡히지 않습니다.</li>
              <li>생활비 계좌에서 나간 결제는 개인 부담인지 공동 부담인지 함께 확인해보세요.</li>
              <li>다음 단계에서는 분담 비율 조정과 정산 취소/수정 기능을 붙일 수 있습니다.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
