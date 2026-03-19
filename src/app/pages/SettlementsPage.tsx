import { Link, useSearchParams } from "react-router-dom";
import { monthKey } from "../../shared/utils/date";
import { getMonthlySharedSettlementSummary, getSettlementBalanceSummary } from "../../domain/settlements/summary";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { NextStepCallout } from "../components/NextStepCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

interface SettlementHeadlineCard {
  title: string;
  description: string;
}

export function SettlementsPage() {
  const { addSettlement, state } = useAppState();
  const [searchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const activePeople = scope.people.filter((person) => person.isActive);
  const peopleMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const cardMap = new Map(scope.cards.map((card) => [card.id, card.name]));

  const activeSourceType = (() => {
    const value = searchParams.get("sourceType");
    return value === "card" || value === "account" || value === "manual" || value === "import" ? value : null;
  })();
  const activeOwnerPersonId = (() => {
    const value = searchParams.get("ownerPersonId");
    return value && scope.people.some((person) => person.id === value) ? value : null;
  })();
  const activeTagId = (() => {
    const value = searchParams.get("tagId");
    return value && scope.tags.some((tag) => tag.id === value) ? value : null;
  })();
  const activeSettlementFilterSummary =
    [
      activeSourceType ? `수단 ${activeSourceType === "card" ? "카드" : activeSourceType === "account" ? "계좌" : activeSourceType}` : null,
      activeOwnerPersonId ? `사람 ${peopleMap.get(activeOwnerPersonId) ?? "-"}` : null,
      activeTagId ? `태그 ${scope.tags.find((tag) => tag.id === activeTagId)?.name ?? "-"}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  const appendCurrentTransactionFilters = (path: string) => {
    const [pathname, queryString = ""] = path.split("?");
    const searchParams = new URLSearchParams();
    for (const [key, value] of new URLSearchParams(queryString).entries()) {
      searchParams.set(key, value);
    }
    if (activeSourceType && !searchParams.has("sourceType")) searchParams.set("sourceType", activeSourceType);
    if (activeOwnerPersonId && !searchParams.has("ownerPersonId")) searchParams.set("ownerPersonId", activeOwnerPersonId);
    if (activeTagId && !searchParams.has("tagId")) searchParams.set("tagId", activeTagId);
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const getTransactionListLink = (params: {
    nature?: "shared" | "internal_transfer";
    sourceType?: "card" | "account";
    ownerPersonId?: string | null;
  }) => {
    const transactionSearchParams = new URLSearchParams();
    if (params.nature) transactionSearchParams.set("nature", params.nature);
    if (params.sourceType) transactionSearchParams.set("sourceType", params.sourceType);
    if (params.ownerPersonId) transactionSearchParams.set("ownerPersonId", params.ownerPersonId);
    const query = transactionSearchParams.toString();
    return appendCurrentTransactionFilters(query ? `/transactions?${query}` : "/transactions");
  };
  const getTransactionConnectionSummary = (transaction: { ownerPersonId: string | null; accountId: string | null; cardId: string | null }) =>
    [
      `사용자 ${(transaction.ownerPersonId ? peopleMap.get(transaction.ownerPersonId) : null) ?? "공동"}`,
      transaction.cardId ? `카드 ${cardMap.get(transaction.cardId) ?? "-"}` : null,
      transaction.accountId ? `계좌 ${accountMap.get(transaction.accountId) ?? "-"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const currentMonth = monthKey(new Date());
  const settlementSummary = getMonthlySharedSettlementSummary(scope.transactions, activePeople.length, currentMonth);
  const sharedTransactions = settlementSummary.sharedTransactions;
  const scopedSharedTransactions = sharedTransactions.filter((transaction) => {
    if (activeSourceType && transaction.sourceType !== activeSourceType) return false;
    if (activeOwnerPersonId && transaction.ownerPersonId !== activeOwnerPersonId) return false;
    if (activeTagId && !transaction.tagIds.includes(activeTagId)) return false;
    return true;
  });

  const totalSharedExpense = settlementSummary.totalSharedExpense;
  const splitTarget = settlementSummary.splitTarget;

  const baseRows = settlementSummary.baseRows
    .map((row) => ({
      ...row,
      name: peopleMap.get(row.personId) ?? "공동 계정",
    }));

  const { settlementHistory, completedSettlementAmount, rows } = getSettlementBalanceSummary(
    baseRows,
    scope.settlements,
    currentMonth,
  );
  const settlementRows = rows.map((row) => ({
    ...row,
    name: peopleMap.get(row.personId) ?? "공동 계정",
  }));

  const receiver = settlementRows.find((row) => row.remainingDelta > 0);
  const sender = settlementRows.find((row) => row.remainingDelta < 0);
  const suggestedSettlementAmount =
    receiver && sender ? Math.min(receiver.remainingDelta, Math.abs(sender.remainingDelta)) : 0;
  const settlementHeadlineCards = settlementRows.length
    ? [
        receiver
          ? {
              title: "가장 많이 부담한 사람",
              description: `${receiver.name}이(가) 현재 기준으로 ${formatCurrency(receiver.amount)}를 부담했고, 아직 ${formatCurrency(
                receiver.remainingDelta,
              )} 더 부담한 상태입니다.`,
            }
          : null,
        sender
          ? {
              title: "정산이 가장 필요한 사람",
              description: `${sender.name}은(는) 현재 ${formatCurrency(Math.abs(sender.remainingDelta))}만큼 덜 부담한 상태로 계산됩니다.`,
            }
          : null,
        {
          title: "정산 진행 상태",
          description: settlementHistory.length
            ? `이번 달 정산 ${settlementHistory.length}건이 이미 기록되어 있고, 완료 금액은 ${formatCurrency(completedSettlementAmount)}입니다.`
            : "아직 기록된 정산이 없습니다. 추천 정산을 확인한 뒤 완료로 남겨보세요.",
        },
      ].filter((card): card is SettlementHeadlineCard => Boolean(card))
    : [];
  const nextSettlementAction = sharedTransactions.length
    ? receiver && sender && suggestedSettlementAmount > 0
      ? {
          title: "지금 가장 먼저 할 일",
          description: `${sender.name}에서 ${receiver.name} 쪽으로 ${formatCurrency(suggestedSettlementAmount)} 정산 흐름이 잡혀 있습니다. 거래 화면에서 공동지출 흐름을 다시 보고, 맞다면 정산 완료로 기록해보세요.`,
          to: "/transactions?nature=shared",
          actionLabel: "공동지출 점검하기",
        }
      : {
          title: "지금 가장 먼저 할 일",
          description: "이번 달 공동지출은 잡혀 있지만 남은 정산 편차는 크지 않습니다. 공동지출 흐름과 완료 기록이 맞는지 한 번 더 확인해보세요.",
          to: "/transactions?nature=shared",
          actionLabel: "공동지출 거래 보기",
        }
    : {
        title: "지금 가장 먼저 할 일",
        description: "아직 이번 달 공동지출 거래가 없습니다. 거래 화면에서 공동지출로 표시된 항목이 있는지 먼저 확인해보세요.",
        to: "/transactions?nature=shared",
        actionLabel: "공동지출 거래 보기",
      };
  const isSettlementBalanced = sharedTransactions.length > 0 && !receiver && !sender;
  const settlementQuickStatus =
    !sharedTransactions.length
      ? {
          title: "아직 이번 달 공동지출이 없습니다",
          description: "거래 화면에서 공동지출로 표시한 거래가 생기면 여기서 바로 분담과 정산 흐름을 이어서 볼 수 있습니다.",
        }
      : receiver && sender && suggestedSettlementAmount > 0
        ? {
            title: "추천 정산 금액이 바로 계산되었습니다",
            description: `${sender.name}에서 ${receiver.name} 쪽으로 ${formatCurrency(suggestedSettlementAmount)} 정산하면 현재 차이를 가장 빠르게 줄일 수 있습니다.`,
          }
        : {
            title: "공동지출은 있지만 추가 정산은 거의 남지 않았습니다",
            description: "이미 기록된 정산이 반영되었거나, 현재 잔여 차이가 작아서 거래 확인만 해도 충분한 상태입니다.",
          };

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
          공동지출로 표시된 거래만 합산해서 각 사람이 얼마나 부담했는지 비교합니다. 이번 달 정산 후보를 보고, 끝낸 정산은 아래 기록으로 남길 수 있습니다.
        </p>
        <div className="review-summary-panel mt-4">
          <div className="review-summary-copy">
            <strong>{settlementQuickStatus.title}</strong>
            <p className="mb-0 text-secondary">{settlementQuickStatus.description}</p>
          </div>
          <div className="status-badge-row">
            <span className="badge text-bg-light">공동지출 {sharedTransactions.length}건</span>
            <span className="badge text-bg-light">완료 기록 {settlementHistory.length}건</span>
            {suggestedSettlementAmount > 0 ? (
              <span className="badge text-bg-warning">추천 정산 {formatCurrency(suggestedSettlementAmount)}</span>
            ) : null}
          </div>
          <Link
            to={appendCurrentTransactionFilters(sharedTransactions.length ? "/transactions?nature=shared" : "/transactions")}
            className="btn btn-outline-secondary btn-sm"
          >
            {sharedTransactions.length ? "공동지출 거래 보기" : "거래 화면 보기"}
          </Link>
        </div>
        {activeSettlementFilterSummary ? (
          <div className="review-summary-panel compact-summary-panel mt-3">
            <div className="review-summary-copy">
              <strong>현재 이어진 맥락</strong>
              <p className="mb-0 text-secondary">{activeSettlementFilterSummary}</p>
            </div>
            <Link className="btn btn-outline-secondary btn-sm" to="/settlements">
              전체 정산 보기
            </Link>
          </div>
        ) : null}
        <NextStepCallout
          className="mt-4"
          title={nextSettlementAction.title}
          description={nextSettlementAction.description}
          actionLabel={nextSettlementAction.actionLabel}
          to={appendCurrentTransactionFilters(nextSettlementAction.to)}
        />
        {isSettlementBalanced ? (
          <CompletionBanner
            className="mt-3"
            title="이번 달 정산 균형이 맞춰졌습니다"
            description="공동지출은 있었지만 남아 있는 정산 편차는 거의 없습니다. 거래 흐름과 완료 기록만 가볍게 확인하면 됩니다."
            actions={
              <>
                <Link to={appendCurrentTransactionFilters("/transactions?nature=shared")} className="btn btn-outline-primary btn-sm">
                  공동지출 거래 보기
                </Link>
                <Link to="/" className="btn btn-outline-secondary btn-sm">
                  대시보드 보기
                </Link>
              </>
            }
          />
        ) : null}
      </section>

      {settlementHeadlineCards.length ? (
        <section className="card shadow-sm" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">핵심 해석</span>
              <h2 className="section-title">정산에서 먼저 볼 포인트</h2>
            </div>
          </div>
          <div className="resource-grid">
            {settlementHeadlineCards.map((card, index) => (
              <article key={card.title} className="resource-card" style={getMotionStyle(index + 2)}>
                <h3>{card.title}</h3>
                <p className="mb-0 text-secondary">{card.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="page-grid">
        <section className="card shadow-sm" style={getMotionStyle(settlementHeadlineCards.length ? 2 : 1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">정산 요약</span>
              <h2 className="section-title">누가 더 냈는지 보기</h2>
            </div>
          </div>
          {!settlementRows.length ? (
            <>
            <div className="review-summary-panel mb-4">
              <div className="review-summary-copy">
                <strong>공동지출 거래가 생기면 여기서 바로 정산 흐름이 시작됩니다</strong>
                <p className="mb-0 text-secondary">먼저 거래 화면에서 공동지출 체크를 붙이거나, 사람 구성을 정리해 두면 정산 계산이 자연스럽게 이어집니다.</p>
              </div>
              <div className="action-row">
                <Link to={appendCurrentTransactionFilters("/transactions")} className="btn btn-outline-primary btn-sm">
                  거래 화면 보기
                </Link>
                <Link to="/people" className="btn btn-outline-secondary btn-sm">
                  사람 관리 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 화면 보기
                </Link>
                <Link to="/" className="btn btn-outline-secondary btn-sm">
                  대시보드 보기
                </Link>
              </div>
            </div>
            <EmptyStateCallout
              kicker="정산 대기"
              title="아직 공동지출 데이터가 없습니다"
              description="거래 입력이나 업로드 뒤에 공동지출 체크를 해두면 여기서 사람별 부담과 정산 후보를 계산합니다."
            />
            </>
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
                <div className="status-badge-row mt-3">
                  <span className="badge text-bg-light">완료 금액 {formatCurrency(completedSettlementAmount)}</span>
                  <span className="badge text-bg-light">남은 후보 {receiver && sender ? "있음" : "없음"}</span>
                </div>
                {receiver && sender ? (
                  <div className="action-row mt-3">
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

              <div className="review-summary-panel mt-4">
                <div className="review-summary-copy">
                  <strong>최근 공동지출 근거 거래</strong>
                  <p className="mb-0 text-secondary">
                    정산 계산에 들어간 최근 공동지출을 바로 확인할 수 있습니다. 흐름이 어색하면 먼저 공동지출 표기부터 다시 점검해보세요.
                  </p>
                </div>
                <div className="action-row">
                  <Link to={appendCurrentTransactionFilters("/transactions?nature=shared")} className="btn btn-outline-primary btn-sm">
                    공동지출 전체 보기
                  </Link>
                </div>
              </div>

              <div className="review-list mt-4">
                {scopedSharedTransactions.slice(0, 8).map((transaction, index) => (
                  <article key={transaction.id} className="review-card" style={getMotionStyle(index + 2)}>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div className="review-card-main">
                        <span className="review-type">공동지출 근거</span>
                        <h3>{transaction.merchantName}</h3>
                        <p className="mb-1 text-secondary">
                          {transaction.occurredAt.slice(0, 10)} · {(transaction.ownerPersonId ? peopleMap.get(transaction.ownerPersonId) : "공동") ?? "공동"}
                        </p>
                        <p className="mb-1 text-secondary">{getTransactionConnectionSummary(transaction)}</p>
                        <p className="mb-0 text-secondary">{transaction.description || "설명 없음"}</p>
                      </div>
                      <div className="review-card-side">
                        <strong>{formatCurrency(transaction.amount)}</strong>
                        {transaction.cardId ? (
                          <Link
                            to={getTransactionListLink({ nature: "shared", sourceType: "card", ownerPersonId: transaction.ownerPersonId })}
                            className="btn btn-outline-secondary btn-sm"
                          >
                            카드 거래 보기
                          </Link>
                        ) : null}
                        {transaction.accountId ? (
                          <Link
                            to={getTransactionListLink({ nature: "shared", sourceType: "account", ownerPersonId: transaction.ownerPersonId })}
                            className="btn btn-outline-secondary btn-sm"
                          >
                            계좌 거래 보기
                          </Link>
                        ) : null}
                        {transaction.ownerPersonId ? (
                          <Link
                            to={getTransactionListLink({ nature: "shared", ownerPersonId: transaction.ownerPersonId })}
                            className="btn btn-outline-secondary btn-sm"
                          >
                            이 사람 거래 보기
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="review-list mt-4">
                {settlementRows.map((row, index) => (
                  <article key={row.personId} className="review-card" style={getMotionStyle(index + 2)}>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div className="review-card-main">
                        <span className="review-type">정산 요약</span>
                        <h3>{row.name}</h3>
                        <p className="mb-1 text-secondary">현재 부담액 {formatCurrency(row.amount)}</p>
                        <p className="mb-0 text-secondary">
                          정산 전 편차 {formatCurrency(Math.abs(row.delta))} · 남은 편차 {formatCurrency(Math.abs(row.remainingDelta))}
                        </p>
                      </div>
                      <div className="review-card-side">
                        <span className={`badge ${row.remainingDelta > 0 ? "text-bg-warning" : "text-bg-success"}`}>
                          {row.remainingDelta > 0
                            ? `${formatCurrency(row.remainingDelta)} 더 부담`
                            : `${formatCurrency(Math.abs(row.remainingDelta))} 덜 부담`}
                        </span>
                        {row.personId !== "shared" ? (
                          <Link
                            to={getTransactionListLink({ nature: "shared", ownerPersonId: row.personId })}
                            className="btn btn-outline-secondary btn-sm"
                          >
                            이 사람 공동지출 보기
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card shadow-sm" style={getMotionStyle(settlementHeadlineCards.length ? 3 : 2)}>
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
              actions={
                <Link to={appendCurrentTransactionFilters("/transactions?nature=shared")} className="btn btn-outline-primary btn-sm">
                  공동지출 거래 보기
                </Link>
              }
            />
          ) : (
            <div className="review-list">
              {settlementHistory.map((item, index) => (
                <article key={item.id} className="review-card" style={getMotionStyle(index + 3)}>
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div className="review-card-main">
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
