import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSettlementSummary, type AnalysisSettlementSummaryResponse } from "../api/analysis";
import { isAnalysisApiConfigured } from "../api/analysisConfig";
import { completeGuideStepAction } from "../../domain/guidance/guideRuntime";
import { getFlowStatusSummary, getMonthlyFlowSummary } from "../../domain/settlements/summary";
import type { ImportRecord } from "../../shared/types/models";
import { monthKey } from "../../shared/utils/date";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { NextStepCallout } from "../components/NextStepCallout";
import { AppSelect } from "../components/AppSelect";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function getStatementMonthOptions(imports: ImportRecord[]) {
  return Array.from(
    new Set(
      imports
        .map((record) => record.statementMonth?.trim() ?? "")
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => right.localeCompare(left));
}

function getStatementImportIds(imports: ImportRecord[], statementMonth: string) {
  return new Set(
    imports
      .filter((record) => record.statementMonth?.trim() === statementMonth)
      .map((record) => record.id),
  );
}

function formatCardSummary(items: Array<{ name: string; amount: number; transactionCount: number }>) {
  return items.map((item) => `${item.name} ${formatCurrency(item.amount)} (${item.transactionCount}건)`).join(" · ");
}

function formatAccountMeta(account?: { institutionName: string; accountNumberMasked: string } | null) {
  if (!account) return "";

  const parts = [account.institutionName, account.accountNumberMasked].filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

function mapRemoteSettlementSummary(response: AnalysisSettlementSummaryResponse, workspaceId: string) {
  return {
    flowSummary: {
      rows: response.rows.map((row) => ({
        transferKey: row.transferKey,
        fromAccountId: row.fromAssetId === null ? "" : String(row.fromAssetId),
        toAccountId: row.toAssetId === null ? "" : String(row.toAssetId),
        fromAccountName: row.fromAssetName,
        toAccountName: row.toAssetName,
        amount: row.amount,
        transactionCount: row.transactionCount,
        categoryAmounts: row.categoryAmounts.map((item) => ({
          categoryId: item.categoryId === null ? "" : String(item.categoryId),
          name: item.name,
          amount: item.amount,
        })),
        cardAmounts: row.cardAmounts.map((item) => ({
          cardId: item.cardAssetId === null ? "" : String(item.cardAssetId),
          name: item.name,
          amount: item.amount,
          transactionCount: item.transactionCount,
        })),
      })),
      totalAmount: response.totalAmount,
      totalTransactionCount: response.totalTransactionCount,
    },
    flowStatus: {
      rows: response.rows.map((row) => ({
        transferKey: row.transferKey,
        fromAccountId: row.fromAssetId === null ? "" : String(row.fromAssetId),
        toAccountId: row.toAssetId === null ? "" : String(row.toAssetId),
        fromAccountName: row.fromAssetName,
        toAccountName: row.toAssetName,
        amount: row.amount,
        transactionCount: row.transactionCount,
        categoryAmounts: row.categoryAmounts.map((item) => ({
          categoryId: item.categoryId === null ? "" : String(item.categoryId),
          name: item.name,
          amount: item.amount,
        })),
        cardAmounts: row.cardAmounts.map((item) => ({
          cardId: item.cardAssetId === null ? "" : String(item.cardAssetId),
          name: item.name,
          amount: item.amount,
          transactionCount: item.transactionCount,
        })),
        confirmationRecord: row.confirmationRecord
          ? {
              id: String(row.confirmationRecord.settlementId),
              workspaceId,
              month: response.monthKey,
              transferKey: row.confirmationRecord.transferKey,
              fromAccountId: row.fromAssetId === null ? null : String(row.fromAssetId),
              toAccountId: row.toAssetId === null ? null : String(row.toAssetId),
              amount: row.confirmationRecord.amount,
              note: row.confirmationRecord.note,
              completedAt: row.confirmationRecord.completedAt,
            }
          : null,
        isConfirmed: row.confirmed,
      })),
      confirmationHistory: response.confirmationHistory.map((item) => ({
        id: String(item.settlementId),
        workspaceId,
        month: response.monthKey,
        transferKey: item.transferKey,
        fromAccountId: null,
        toAccountId: null,
        amount: item.amount,
        note: item.note,
        completedAt: item.completedAt,
      })),
      confirmedAmount: response.confirmedAmount,
      confirmedCount: response.confirmedCount,
    },
  };
}

export function SettlementsPage() {
  const { addSettlement, removeSettlement, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentMonth = monthKey(new Date());
  const [remoteSettlementSummary, setRemoteSettlementSummary] = useState<ReturnType<typeof mapRemoteSettlementSummary> | null>(null);
  const statementMonthOptions = useMemo(() => getStatementMonthOptions(scope.imports), [scope.imports]);
  const [selectedStatementMonth, setSelectedStatementMonth] = useState(
    statementMonthOptions.includes(currentMonth) ? currentMonth : statementMonthOptions[0] ?? currentMonth,
  );
  const [expandedTransferKeys, setExpandedTransferKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const nextMonth = statementMonthOptions.includes(selectedStatementMonth)
      ? selectedStatementMonth
      : statementMonthOptions.includes(currentMonth)
        ? currentMonth
        : statementMonthOptions[0] ?? currentMonth;

    if (nextMonth !== selectedStatementMonth) {
      setSelectedStatementMonth(nextMonth);
    }
  }, [currentMonth, selectedStatementMonth, statementMonthOptions]);

  useEffect(() => {
    setExpandedTransferKeys(new Set());
  }, [selectedStatementMonth]);

  const selectedStatementImportIds = useMemo(
    () => getStatementImportIds(scope.imports, selectedStatementMonth),
    [scope.imports, selectedStatementMonth],
  );

  const selectedImports = useMemo(
    () => scope.imports.filter((record) => selectedStatementImportIds.has(record.id)),
    [scope.imports, selectedStatementImportIds],
  );

  const selectedStatementTransactions = useMemo(
    () =>
      scope.transactions.filter(
        (transaction) => Boolean(transaction.importRecordId && selectedStatementImportIds.has(transaction.importRecordId)),
      ),
    [scope.transactions, selectedStatementImportIds],
  );

  const flowSummary = useMemo(
    () => getMonthlyFlowSummary(selectedStatementTransactions, scope.categories, scope.cards, scope.accounts),
    [scope.accounts, scope.cards, scope.categories, selectedStatementTransactions],
  );

  const flowStatus = useMemo(
    () => getFlowStatusSummary(flowSummary.rows, scope.settlements, selectedStatementMonth),
    [flowSummary.rows, scope.settlements, selectedStatementMonth],
  );
  const effectiveFlowSummary = remoteSettlementSummary?.flowSummary ?? flowSummary;
  const effectiveFlowStatus = remoteSettlementSummary?.flowStatus ?? flowStatus;

  useEffect(() => {
    if (!isAnalysisApiConfigured()) {
      setRemoteSettlementSummary(null);
      return;
    }

    const controller = new AbortController();
    void fetchSettlementSummary(selectedStatementMonth, controller.signal)
      .then((response) => {
        setRemoteSettlementSummary(mapRemoteSettlementSummary(response, workspaceId));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("settlement summary fetch failed", error);
        setRemoteSettlementSummary(null);
      });

    return () => controller.abort();
  }, [selectedStatementMonth, workspaceId]);

  const unconfirmedRows = effectiveFlowStatus.rows.filter((row) => !row.isConfirmed);
  const allConfirmed = effectiveFlowStatus.rows.length > 0 && unconfirmedRows.length === 0;

  const selectedStatementExpenseTotal = useMemo(
    () =>
      selectedStatementTransactions.reduce((sum, transaction) => {
        if (transaction.status !== "active" || transaction.transactionType !== "expense") return sum;
        return sum + transaction.amount;
      }, 0),
    [selectedStatementTransactions],
  );
  const selectedStatementLabel = `${formatMonthLabel(selectedStatementMonth)} 청구분`;

  return (
    <div className="page-stack">
      <section className="page-section" style={getMotionStyle(0)} data-guide-target="settlements-page-overview">
        <div className="section-head">
          <div>
            <span className="section-kicker">이번달 자산 흐름</span>
            <h2 className="section-title">카드값 이체를 확인하는 마지막 단계</h2>
          </div>
<AppSelect
            className="settlements-month-select"
            dataGuideTarget="settlements-month-select"
            value={selectedStatementMonth}
            onChange={setSelectedStatementMonth}
            style={{ maxWidth: 180 }}
            options={statementMonthOptions.map((option) => ({ value: option, label: formatMonthLabel(option) }))}
            ariaLabel="청구분 기준 연월"
          />
        </div>

        <p className="text-secondary mb-0">
          {selectedStatementLabel} 명세서에 연결된 거래를 기준으로, 카테고리별 연결 계좌에서 카드값 계좌로 얼마를 이체해야 하는지
          정리하고 이체 여부를 확인하는 곳입니다.
        </p>

        <div className="stats-grid mt-4">
          <article className="stat-card">
            <span className="stat-label">명세서 업로드</span>
            <strong>{selectedImports.length}건</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">이번 달 결제금액</span>
            <strong>{formatCurrency(selectedStatementExpenseTotal)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">확인할 이체</span>
            <strong>{effectiveFlowStatus.rows.length}건</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">확인 완료</span>
            <strong>{effectiveFlowStatus.confirmedCount}건</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">이체 필요 금액</span>
            <strong>{formatCurrency(effectiveFlowSummary.totalAmount)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">확인 완료 금액</span>
            <strong>{formatCurrency(effectiveFlowStatus.confirmedAmount)}</strong>
          </article>
        </div>

        <NextStepCallout
          className="mt-4"
          title={allConfirmed ? `${selectedStatementLabel} 흐름 정리가 완료되었습니다` : "아직 확인이 남은 이체가 있습니다"}
          description={
            allConfirmed
              ? "모든 이체 항목을 확인했습니다. 이제 이 달의 기록을 한 번에 돌아볼 수 있습니다."
              : `아직 ${unconfirmedRows.length}건의 이체 확인이 남아 있습니다.`
          }
          actions={
            allConfirmed
              ? [
                  { label: "달 기록 보기", to: "/records/moon", variant: "primary" },
                  { label: "결제내역 보기", to: "/collections/card", variant: "secondary" },
                ]
              : [{ label: "결제내역 다시 보기", to: "/collections/card", variant: "primary" }]
          }
        />
      </section>

      {!statementMonthOptions.length ? (
        <section className="page-section" style={getMotionStyle(2)}>
          <EmptyStateCallout
            kicker="흐름 준비 중"
            title="먼저 청구분 명세서를 올려 주세요"
            description="흐름 페이지는 청구분이 지정된 명세서 업로드를 기준으로 이체 금액과 확인 상태를 계산합니다."
            actions={
              <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
                결제내역 보기
              </Link>
            }
          />
        </section>
      ) : !effectiveFlowStatus.rows.length ? (
        <section className="page-section" style={getMotionStyle(1)}>
          <EmptyStateCallout
            kicker="흐름 준비 중"
            title={`${selectedStatementLabel}에 확인할 이체가 아직 없습니다`}
            description="선택한 청구분 명세서를 아직 불러오지 않았거나, 카드와 카테고리 연결 기준으로 이체가 필요한 항목이 없습니다."
            actions={
              <>
                <Link to="/connections/assets" className="btn btn-outline-secondary btn-sm">
                  자산 보기
                </Link>
                <Link to="/connections/categories" className="btn btn-outline-secondary btn-sm">
                  분류 보기
                </Link>
                <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
                  결제내역 보기
                </Link>
              </>
            }
          />
        </section>
      ) : (
        <section className="page-section" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">이체 확인</span>
              <h2 className="section-title">{selectedStatementLabel} 계좌별 이체 정리</h2>
            </div>
          </div>

          <div className="review-list settlement-flow-list" data-guide-target="settlements-transfer-list">
            {(() => {
              const firstPendingTransferKey =
                effectiveFlowStatus.rows.find((candidate) => !candidate.isConfirmed)?.transferKey ?? effectiveFlowStatus.rows[0]?.transferKey;

              return effectiveFlowStatus.rows.map((row, index) => {
              const isExpanded = expandedTransferKeys.has(row.transferKey);
              const confirmationRecord = row.confirmationRecord;
              const toAccount = scope.accounts.find((account) => account.id === row.toAccountId);

              return (
                <article
                  key={row.transferKey}
                  className="review-card review-card--compact settlement-flow-item"
                  style={getMotionStyle(index + 2)}
                >
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div className="review-card-main">
                      <span className={`badge ${row.isConfirmed ? "text-bg-success" : "text-bg-warning"}`}>
                        {row.isConfirmed ? "확인 완료" : "확인 필요"}
                      </span>
                      <h3>{`${row.fromAccountName}→${row.toAccountName}${formatAccountMeta(toAccount)}`}</h3>
                      <p className="mb-1 text-secondary">{`${formatCurrency(row.amount)} (${row.transactionCount}건)`}</p>
                      <p className="mb-0 text-secondary">{formatCardSummary(row.cardAmounts)}</p>
                      {confirmationRecord && !row.isConfirmed ? (
                        <p className="small text-secondary mt-2 mb-0">
                          이전 확인 금액은 {formatCurrency(confirmationRecord.amount)}이었고 현재 계산 금액과 달라 다시 확인이
                          필요합니다.
                        </p>
                      ) : null}

                      <div className={`settlement-flow-details${isExpanded ? " is-expanded" : ""}`}>
                        <div className="settlement-flow-category-grid mt-2">
                          {row.categoryAmounts.map((item) => (
                            <article key={item.categoryId} className="settlement-flow-category-card">
                              <span>{item.name}</span>
                              <strong>{formatCurrency(item.amount)}</strong>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="review-card-side settlement-flow-actions">
                      <strong className="settlement-flow-inline-amount">{formatCurrency(row.amount)}</strong>
                      <div className="settlement-flow-action-row">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() =>
                            setExpandedTransferKeys((current) => {
                              const next = new Set(current);
                              if (next.has(row.transferKey)) next.delete(row.transferKey);
                              else next.add(row.transferKey);
                              return next;
                            })
                          }
                        >
                          {isExpanded ? "상세 닫기" : "상세보기"}
                        </button>
                        {row.isConfirmed && confirmationRecord ? (
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => removeSettlement(workspaceId, selectedStatementMonth, row.transferKey)}
                          >
                            확인 취소
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            data-guide-target={row.transferKey === firstPendingTransferKey ? "settlements-confirm-action" : undefined}
                            onClick={() => {
                              addSettlement({
                                workspaceId,
                                month: selectedStatementMonth,
                                transferKey: row.transferKey,
                                fromAccountId: row.fromAccountId,
                                toAccountId: row.toAccountId,
                                amount: row.amount,
                                note: "흐름 페이지에서 이체 여부를 확인함",
                              });
                              completeGuideStepAction(workspaceId, "settlements-confirm-action");
                            }}
                          >
                            이체 확인
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
              });
            })()}
          </div>
        </section>
      )}
    </div>
  );
}
