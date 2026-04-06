import { useEffect, useMemo, useState } from "react";
import { getCategoryLabel } from "../../domain/categories/meta";
import { Link } from "react-router-dom";
import { createId } from "../../shared/utils/id";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

type RecommendationMergeState = {
  sourceKey: string;
  targetKey: string;
  includeRelated: boolean;
};

type ManagedLoopMergeState = {
  sourceKey: string;
  targetKey: string;
};

type ManagedLoopSplitState = {
  sourceKey: string;
  transactionIds: string[];
  displayName: string;
};

type LoopDetailState =
  | { kind: "recommendation"; key: string }
  | { kind: "managed"; key: string };

function formatDateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}.${month}.${day}`;
}

function formatCadenceLabel(value: number | null) {
  if (value === null) return "주기 계산 중";
  return `${value}일 주기`;
}

function getRecommendationSignature(value: string) {
  const [merchantKey, categoryId = "uncategorized"] = value.split("::");
  return { merchantKey, categoryId };
}

function getRecommendationFamilyKey(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/20\d{2}[./-]?\d{1,2}(?:[./-]?\d{1,2})?/gu, " ")
    .replace(/\d{1,2}[./-]\d{1,2}(?:[./-]\d{1,2})?/gu, " ")
    .replace(/\d{1,2}\s*월\s*(?:분|차|건|사용분|청구분|결제분)?/gu, " ")
    .replace(/\d+\s*(?:건|차|개월|회)/gu, " ")
    .replace(/[()[\]{}<>|#]/g, " ")
    .replace(/[-/:,+*&._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function LoopStationPage() {
  const {
    setTransactionLoopFlagBatch,
    setTransactionLoopDisplayNameBatch,
    setTransactionLoopGroupOverrideBatch,
    setTransactionLoopIgnoredBatch,
    state,
    workspaceLoopDataByWorkspaceId,
  } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);

  const [draggingRecommendationKey, setDraggingRecommendationKey] = useState<string | null>(null);
  const [dropTargetRecommendationKey, setDropTargetRecommendationKey] = useState<string | null>(null);
  const [recommendationMergeState, setRecommendationMergeState] = useState<RecommendationMergeState | null>(null);
  const [draggingManagedLoopKey, setDraggingManagedLoopKey] = useState<string | null>(null);
  const [dropTargetManagedLoopKey, setDropTargetManagedLoopKey] = useState<string | null>(null);
  const [managedLoopMergeState, setManagedLoopMergeState] = useState<ManagedLoopMergeState | null>(null);
  const [managedLoopSplitState, setManagedLoopSplitState] = useState<ManagedLoopSplitState | null>(null);
  const [detailState, setDetailState] = useState<LoopDetailState | null>(null);
  const [selectedManagedTransactionIds, setSelectedManagedTransactionIds] = useState<string[]>([]);
  const [managedSelectionDragMode, setManagedSelectionDragMode] = useState<boolean | null>(null);
  const [editingManagedLoopKey, setEditingManagedLoopKey] = useState<string | null>(null);
  const [managedLoopNameDraft, setManagedLoopNameDraft] = useState("");
  const [isSplitNameEditing, setIsSplitNameEditing] = useState(false);
  const [isDetailNameEditing, setIsDetailNameEditing] = useState(false);

  const loopData = workspaceLoopDataByWorkspaceId.get(workspaceId);
  const managedLoops = loopData?.managedLoops ?? [];
  const loopInsights = loopData?.loopInsights ?? [];
  const loopRecommendations = loopData?.loopRecommendations ?? [];

  const insightByGroupKey = useMemo(() => new Map(loopInsights.map((item) => [item.groupKey, item])), [loopInsights]);
  const managedLoopByKey = useMemo(() => new Map(managedLoops.map((item) => [item.key, item])), [managedLoops]);
  const recommendationByKey = useMemo(() => new Map(loopRecommendations.map((item) => [item.merchantKey, item])), [loopRecommendations]);
  const categoryMap = useMemo(() => new Map(scope.categories.map((category) => [category.id, category])), [scope.categories]);
  const categoryNameMap = useMemo(() => new Map(scope.categories.map((category) => [category.id, category.name])), [scope.categories]);
  const ownerNameMap = useMemo(() => new Map(scope.people.map((person) => [person.id, person.displayName || person.name])), [scope.people]);
  const transactionMap = useMemo(() => new Map(scope.transactions.map((transaction) => [transaction.id, transaction])), [scope.transactions]);

  useEffect(() => {
    if (managedSelectionDragMode === null) return;
    const clearDragMode = () => setManagedSelectionDragMode(null);
    window.addEventListener("mouseup", clearDragMode);
    return () => window.removeEventListener("mouseup", clearDragMode);
  }, [managedSelectionDragMode]);

  const mergedRecommendationIds = useMemo(() => {
    if (!recommendationMergeState) return [];
    const source = recommendationByKey.get(recommendationMergeState.sourceKey);
    const target = recommendationByKey.get(recommendationMergeState.targetKey);
    if (!source || !target) return [];

    const exactSignatures = new Set([source.merchantKey, target.merchantKey]);
    const familySignatures = new Set(
      [source, target].map((item) => {
        const { categoryId } = getRecommendationSignature(item.merchantKey);
        return `${getRecommendationFamilyKey(item.merchantName)}::${categoryId}`;
      }),
    );

    const matchedRecommendations = recommendationMergeState.includeRelated
      ? loopRecommendations.filter((item) => {
          if (exactSignatures.has(item.merchantKey)) return true;
          const { categoryId } = getRecommendationSignature(item.merchantKey);
          return familySignatures.has(`${getRecommendationFamilyKey(item.merchantName)}::${categoryId}`);
        })
      : loopRecommendations.filter((item) => exactSignatures.has(item.merchantKey));

    return Array.from(new Set(matchedRecommendations.flatMap((item) => item.matchedTransactionIds)));
  }, [loopRecommendations, recommendationByKey, recommendationMergeState]);

  const recommendationMergePreviewTransactions = useMemo(
    () =>
      mergedRecommendationIds
        .map((transactionId) => transactionMap.get(transactionId))
        .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [mergedRecommendationIds, transactionMap],
  );

  const managedLoopMergedIds = useMemo(() => {
    if (!managedLoopMergeState) return [];
    const source = managedLoopByKey.get(managedLoopMergeState.sourceKey);
    const target = managedLoopByKey.get(managedLoopMergeState.targetKey);
    if (!source || !target) return [];
    return Array.from(new Set([...source.transactionIds, ...target.transactionIds]));
  }, [managedLoopByKey, managedLoopMergeState]);

  const managedMergePreviewTransactions = useMemo(
    () =>
      managedLoopMergedIds
        .map((transactionId) => transactionMap.get(transactionId))
        .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [managedLoopMergedIds, transactionMap],
  );

  const managedSplitPreviewTransactions = useMemo(
    () =>
      (managedLoopSplitState?.transactionIds ?? [])
        .map((transactionId) => transactionMap.get(transactionId))
        .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [managedLoopSplitState, transactionMap],
  );

  const detailTransactions = useMemo(() => {
    if (!detailState) return [];
    if (detailState.kind === "recommendation") {
      const recommendation = recommendationByKey.get(detailState.key);
      if (!recommendation) return [];
      const idSet = new Set(recommendation.matchedTransactionIds);
      return scope.transactions.filter((transaction) => idSet.has(transaction.id)).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    }
    const managedLoop = managedLoopByKey.get(detailState.key);
    return managedLoop ? [...managedLoop.transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)) : [];
  }, [detailState, managedLoopByKey, recommendationByKey, scope.transactions]);

  const detailTitle =
    detailState?.kind === "recommendation"
      ? "추천 거래 상세"
      : detailState?.kind === "managed"
        ? managedLoopByKey.get(detailState.key)?.merchantName ?? "등록된 루프 상세"
        : "";

  const detailManagedLoop = detailState?.kind === "managed" ? managedLoopByKey.get(detailState.key) ?? null : null;

  const openRecommendationMergeModal = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setRecommendationMergeState({ sourceKey, targetKey, includeRelated: false });
  };

  const openManagedLoopMergeModal = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setManagedLoopMergeState({ sourceKey, targetKey });
  };

  const beginManagedLoopNameEdit = (loopKey: string, currentName: string) => {
    setEditingManagedLoopKey(loopKey);
    setManagedLoopNameDraft(currentName);
  };

  const saveManagedLoopName = (transactionIds: string[]) => {
    setTransactionLoopDisplayNameBatch(workspaceId, transactionIds, managedLoopNameDraft.trim() || null);
    setEditingManagedLoopKey(null);
    setManagedLoopNameDraft("");
  };

  const confirmRecommendationMerge = () => {
    if (!mergedRecommendationIds.length) return;
    setTransactionLoopGroupOverrideBatch(workspaceId, mergedRecommendationIds, createId("loop"), false);
    setRecommendationMergeState(null);
    setDraggingRecommendationKey(null);
    setDropTargetRecommendationKey(null);
  };

  const confirmManagedLoopMerge = () => {
    if (!managedLoopMergedIds.length) return;
    setTransactionLoopGroupOverrideBatch(workspaceId, managedLoopMergedIds, createId("loop"), true);
    setManagedLoopMergeState(null);
    setDraggingManagedLoopKey(null);
    setDropTargetManagedLoopKey(null);
  };

  const openManagedLoopSplitModal = () => {
    if (detailState?.kind !== "managed" || !selectedManagedTransactionIds.length) return;
    const currentLoop = managedLoopByKey.get(detailState.key);
    if (!currentLoop) return;
    setIsSplitNameEditing(false);
    setManagedLoopSplitState({
      sourceKey: currentLoop.key,
      transactionIds: selectedManagedTransactionIds,
      displayName: currentLoop.merchantName,
    });
  };

  const confirmManagedLoopSplit = () => {
    if (!managedLoopSplitState?.transactionIds.length) return;
    const nextLoopKey = createId("loop");
    setTransactionLoopGroupOverrideBatch(workspaceId, managedLoopSplitState.transactionIds, nextLoopKey, true);
    setTransactionLoopDisplayNameBatch(workspaceId, managedLoopSplitState.transactionIds, managedLoopSplitState.displayName.trim() || null);
    setManagedLoopSplitState(null);
    setSelectedManagedTransactionIds([]);
    setDetailState(null);
    setIsSplitNameEditing(false);
  };

  const setManagedTransactionSelection = (transactionId: string, checked: boolean) => {
    setSelectedManagedTransactionIds((current) => {
      if (checked) {
        return current.includes(transactionId) ? current : [...current, transactionId];
      }
      return current.filter((item) => item !== transactionId);
    });
  };

  return (
    <div className="page-stack">
      <section className="page-section" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <h2 className="section-title">루프 제안</h2>
          </div>
          <div className="section-head-actions">
            <span className="badge text-bg-light">{loopRecommendations.length}</span>
          </div>
        </div>
        {loopRecommendations.length ? (
          <div className="loop-station-grid">
            {loopRecommendations.map((item, index) => (
              <article
                key={item.merchantKey}
                className={`loop-station-card loop-station-card--recommendation${draggingRecommendationKey === item.merchantKey ? " is-dragging" : ""}${
                  dropTargetRecommendationKey === item.merchantKey ? " is-drop-target" : ""
                }`}
                style={getMotionStyle(index + 1.2)}
                draggable
                onDragStart={() => setDraggingRecommendationKey(item.merchantKey)}
                onDragEnd={() => {
                  setDraggingRecommendationKey(null);
                  setDropTargetRecommendationKey(null);
                }}
                onDragOver={(event) => {
                  if (!draggingRecommendationKey || draggingRecommendationKey === item.merchantKey) return;
                  event.preventDefault();
                  setDropTargetRecommendationKey(item.merchantKey);
                }}
                onDragLeave={() => {
                  if (dropTargetRecommendationKey === item.merchantKey) setDropTargetRecommendationKey(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingRecommendationKey || draggingRecommendationKey === item.merchantKey) return;
                  openRecommendationMergeModal(draggingRecommendationKey, item.merchantKey);
                }}
              >
                <div className="loop-station-card-head">
                  <div>
                    <h3>{item.merchantName}</h3>
                  </div>
                  <strong>{formatCurrency(item.latestAmount)}</strong>
                </div>
                <div className="loop-station-card-meta">
                  <span>{categoryNameMap.get(item.categoryId ?? "") ?? "미분류"}</span>
                </div>
                <div className="loop-station-card-stats">
                  <div>
                    <span>최근 금액</span>
                    <strong>{formatCurrency(item.latestAmount)}</strong>
                  </div>
                  <div>
                    <span>직전 금액</span>
                    <strong>{formatCurrency(item.previousAmount)}</strong>
                  </div>
                  <div>
                    <span>묶은 거래</span>
                    <strong>{item.matchedTransactionIds.length}건</strong>
                  </div>
                </div>
                <div className="dashboard-summary-action loop-station-card-actions" style={{ marginLeft: 0 }}>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setDetailState({ kind: "recommendation", key: item.merchantKey })}>
                    상세보기
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setTransactionLoopIgnoredBatch(workspaceId, item.matchedTransactionIds, true)}>
                    추가 안 함
                  </button>
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setTransactionLoopFlagBatch(workspaceId, item.matchedTransactionIds, true)}>
                    추가
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyStateCallout
            kicker="루프 제안"
            title="새로 제안할 루프가 없습니다"
            description="거래가 더 쌓이거나 추천 카테고리를 조정하면 여기에서 반복 소비 후보를 볼 수 있습니다."
          />
        )}
      </section>

      <section className="page-section" style={getMotionStyle(1.2)}>
        <div className="section-head">
          <div>
            <h2 className="section-title">루프스테이션</h2>
          </div>
          <div className="section-head-actions">
            <span className="badge text-bg-light">{managedLoops.length}</span>
          </div>
        </div>
        {managedLoops.length ? (
          <div className="loop-station-grid">
            {managedLoops.map((loop, index) => {
              const insight = insightByGroupKey.get(loop.key) ?? null;
              const categoryName = loop.categoryId ? categoryNameMap.get(loop.categoryId) ?? "미분류" : "미분류";

              return (
                <article
                  key={loop.key}
                  className={`loop-station-card${draggingManagedLoopKey === loop.key ? " is-dragging" : ""}${dropTargetManagedLoopKey === loop.key ? " is-drop-target" : ""}`}
                  style={getMotionStyle(index + 2)}
                  draggable
                  onDragStart={() => setDraggingManagedLoopKey(loop.key)}
                  onDragEnd={() => {
                    setDraggingManagedLoopKey(null);
                    setDropTargetManagedLoopKey(null);
                  }}
                  onDragOver={(event) => {
                    if (!draggingManagedLoopKey || draggingManagedLoopKey === loop.key) return;
                    event.preventDefault();
                    setDropTargetManagedLoopKey(loop.key);
                  }}
                  onDragLeave={() => {
                    if (dropTargetManagedLoopKey === loop.key) setDropTargetManagedLoopKey(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingManagedLoopKey || draggingManagedLoopKey === loop.key) return;
                    openManagedLoopMergeModal(draggingManagedLoopKey, loop.key);
                  }}
                >
                  <div className="loop-station-card-head">
                    <div>
                      <span className="loop-station-card-kicker">{formatCadenceLabel(loop.averageIntervalDays)}</span>
                      {editingManagedLoopKey === loop.key ? (
                        <div className="loop-station-name-edit">
                          <input
                            className="form-control"
                            value={managedLoopNameDraft}
                            onChange={(event) => setManagedLoopNameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveManagedLoopName(loop.transactionIds);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setEditingManagedLoopKey(null);
                                setManagedLoopNameDraft("");
                              }
                            }}
                            onBlur={() => saveManagedLoopName(loop.transactionIds)}
                            placeholder={loop.merchantName}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="loop-station-name-row">
                          <h3>{loop.merchantName}</h3>
                          <button type="button" className="board-case-edit-button" onClick={() => beginManagedLoopNameEdit(loop.key, loop.merchantName)} aria-label={`${loop.merchantName} 루프 이름 수정`}>
                            ✎
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="loop-station-card-meta">
                    <span>최근 구매 {formatDateLabel(loop.latestOccurredAt)}</span>
                    <span>반복 {loop.transactionCount}건</span>
                    <span>{categoryName}</span>
                  </div>
                  <div className="loop-station-card-stats">
                    <div>
                      <span>최근 금액</span>
                      <strong>{formatCurrency(loop.latestAmount)}</strong>
                    </div>
                    <div>
                      <span>평균 금액</span>
                      <strong>{formatCurrency(loop.averageAmount)}</strong>
                    </div>
                    <div>
                      <span>다음 예상</span>
                      <strong>{insight?.nextExpectedAt ? formatDateLabel(insight.nextExpectedAt) : "-"}</strong>
                    </div>
                  </div>
                  {loop.descriptionSamples.length ? <p className="loop-station-card-copy">{loop.descriptionSamples.join(" / ")}</p> : null}
                  <div className="dashboard-summary-action loop-station-card-actions" style={{ marginLeft: 0 }}>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setDetailState({ kind: "managed", key: loop.key });
                        setSelectedManagedTransactionIds([]);
                      }}
                    >
                      상세보기
                    </button>
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setTransactionLoopFlagBatch(workspaceId, loop.transactionIds, false)}>
                      삭제
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyStateCallout
            kicker="루프스테이션"
            title="관리할 루프가 아직 없습니다"
            description="결제내역에서 고정비를 고르거나 제안 목록에서 반복 소비를 루프로 등록해보세요."
            actions={
              <Link to="/collections/card" className="btn btn-outline-primary btn-sm">
                결제내역으로 가기
              </Link>
            }
          />
        )}
      </section>

      <AppModal
        open={Boolean(recommendationMergeState)}
        title="추천 루프 합치기"
        description="이 거래들을 같은 추천 묶음으로 합칠지 먼저 확인해주세요. 추천을 합친 뒤 실제 루프로 추가할지는 따로 결정할 수 있습니다."
        onClose={() => {
          setRecommendationMergeState(null);
          setDraggingRecommendationKey(null);
          setDropTargetRecommendationKey(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setRecommendationMergeState(null);
                setDraggingRecommendationKey(null);
                setDropTargetRecommendationKey(null);
              }}
            >
              취소
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={confirmRecommendationMerge}>
              추천만 합치기
            </button>
          </>
        }
      >
        <div className="loop-confirm-panel">
          <div className="loop-confirm-summary">
            <strong>같은 추천으로 묶을 거래</strong>
            <span>확인하면 추천 카드만 하나로 합쳐집니다. 루프 등록은 이후에 따로 선택할 수 있습니다.</span>
          </div>
          <label className="transaction-filter-toggle" style={{ alignSelf: "flex-start" }}>
            <span className="transaction-filter-toggle-label">같은 패턴 추천도 함께 묶기</span>
            <input
              type="checkbox"
              className="transaction-filter-toggle-input"
              checked={recommendationMergeState?.includeRelated ?? false}
              onChange={(event) =>
                setRecommendationMergeState((current) =>
                  current
                    ? {
                        ...current,
                        includeRelated: event.target.checked,
                      }
                    : current,
                )
              }
            />
            <span className="transaction-filter-toggle-switch" />
          </label>
          {recommendationMergePreviewTransactions.map((transaction) => (
            <div key={transaction.id} className="loop-confirm-item is-selected">
              <div className="loop-confirm-copy">
                <strong>{transaction.merchantName}</strong>
                <span>{`${transaction.occurredAt.slice(0, 10)} · ${formatCurrency(transaction.amount)}`}</span>
                <small>{transaction.description || "비고 없음"}</small>
              </div>
            </div>
          ))}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(managedLoopMergeState)}
        title="등록된 루프 합치기"
        description="두 루프를 하나의 등록된 루프로 합칠지 확인해주세요."
        onClose={() => {
          setManagedLoopMergeState(null);
          setDraggingManagedLoopKey(null);
          setDropTargetManagedLoopKey(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setManagedLoopMergeState(null);
                setDraggingManagedLoopKey(null);
                setDropTargetManagedLoopKey(null);
              }}
            >
              취소
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={confirmManagedLoopMerge}>
              루프 합치기
            </button>
          </>
        }
      >
        <div className="loop-confirm-panel">
          <div className="loop-confirm-summary">
            <strong>같은 루프로 묶을 거래</strong>
            <span>확인하면 두 등록 루프가 하나의 루프로 합쳐집니다.</span>
          </div>
          {managedMergePreviewTransactions.map((transaction) => (
            <div key={transaction.id} className="loop-confirm-item is-selected">
              <div className="loop-confirm-copy">
                <strong>{transaction.merchantName}</strong>
                <span>{`${transaction.occurredAt.slice(0, 10)} 쨌 ${formatCurrency(transaction.amount)}`}</span>
                <small>{transaction.description || "鍮꾧퀬 ?놁쓬"}</small>
              </div>
            </div>
          ))}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(managedLoopSplitState)}
        title={
          isSplitNameEditing ? (
            <div className="loop-station-modal-title-edit">
              <input
                className="form-control"
                value={managedLoopSplitState?.displayName ?? ""}
                onChange={(event) =>
                  setManagedLoopSplitState((current) =>
                    current
                      ? {
                          ...current,
                          displayName: event.target.value,
                        }
                      : current,
                  )
                }
                onBlur={() => setIsSplitNameEditing(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    setIsSplitNameEditing(false);
                  }
                }}
                autoFocus
              />
            </div>
          ) : (
            <div className="loop-station-name-row">
              <h3>{managedLoopSplitState?.displayName ?? "새 루프"}</h3>
              <button type="button" className="board-case-edit-button" onClick={() => setIsSplitNameEditing(true)} aria-label="새 루프 이름 수정">
                ✎
              </button>
            </div>
          )
        }
        ariaLabel="루프 분리 확인"
        onClose={() => {
          setManagedLoopSplitState(null);
          setIsSplitNameEditing(false);
        }}
        dialogClassName="loop-detail-modal"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setManagedLoopSplitState(null);
                setIsSplitNameEditing(false);
              }}
            >
              취소
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={confirmManagedLoopSplit}>
              이렇게 분리할게요
            </button>
          </>
        }
      >
        <div className="loop-confirm-panel">
          <div className="table-responsive loop-detail-table-wrap">
            <table className="table align-middle transaction-grid-table">
              <colgroup>
                <col className="transaction-grid-col-date" />
                <col className="transaction-grid-col-merchant" />
                <col className="transaction-grid-col-paid-amount" />
                <col className="transaction-grid-col-owner" />
                <col className="transaction-grid-col-category" />
              </colgroup>
              <thead>
                <tr>
                  <th>사용일</th>
                  <th>가맹점</th>
                  <th className="text-end">결제금액</th>
                  <th>사용자</th>
                  <th>카테고리</th>
                </tr>
              </thead>
              <tbody>
                {managedSplitPreviewTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.occurredAt.slice(0, 10)}</td>
                    <td>
                      <TransactionRowHeader merchantName={transaction.merchantName} />
                    </td>
                    <td className="text-end transaction-amount-cell">
                      <strong>{formatCurrency(transaction.amount)}</strong>
                    </td>
                    <td>{transaction.ownerPersonId ? ownerNameMap.get(transaction.ownerPersonId) ?? "-" : "-"}</td>
                    <td>{transaction.categoryId && categoryMap.get(transaction.categoryId) ? getCategoryLabel(categoryMap.get(transaction.categoryId)!, categoryMap) : "미분류"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(detailState)}
        title={
          detailState?.kind === "managed" && detailManagedLoop ? (
            isDetailNameEditing ? (
              <div className="loop-station-modal-title-edit">
                <input
                  className="form-control"
                  value={managedLoopNameDraft}
                  onChange={(event) => setManagedLoopNameDraft(event.target.value)}
                  onBlur={() => {
                    saveManagedLoopName(detailManagedLoop.transactionIds);
                    setIsDetailNameEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveManagedLoopName(detailManagedLoop.transactionIds);
                      setIsDetailNameEditing(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setManagedLoopNameDraft(detailManagedLoop.merchantName);
                      setIsDetailNameEditing(false);
                    }
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <div className="loop-station-name-row">
                <h3>{detailManagedLoop.merchantName}</h3>
                <button
                  type="button"
                  className="board-case-edit-button"
                  onClick={() => {
                    setManagedLoopNameDraft(detailManagedLoop.merchantName);
                    setIsDetailNameEditing(true);
                  }}
                  aria-label={`${detailManagedLoop.merchantName} 루프 이름 수정`}
                >
                  ✎
                </button>
              </div>
            )
          ) : (
            detailTitle
          )
        }
        description={
          detailState?.kind === "managed"
            ? "등록된 루프에 묶인 실제 거래입니다. 필요한 거래를 골라 루프에서 분리할 수 있습니다."
            : "제안 카드에 포함된 실제 거래입니다."
        }
        onClose={() => {
          setDetailState(null);
          setSelectedManagedTransactionIds([]);
          setIsDetailNameEditing(false);
          setManagedLoopNameDraft("");
        }}
        footer={
          detailState?.kind === "managed" ? (
            <>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setDetailState(null);
                  setSelectedManagedTransactionIds([]);
                  setIsDetailNameEditing(false);
                  setManagedLoopNameDraft("");
                }}
              >
                닫기
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={openManagedLoopSplitModal} disabled={!selectedManagedTransactionIds.length}>
                선택 항목 분리
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setDetailState(null);
                setSelectedManagedTransactionIds([]);
                setIsDetailNameEditing(false);
                setManagedLoopNameDraft("");
              }}
            >
              닫기
            </button>
          )
        }
        dialogClassName="loop-detail-modal"
      >
        <div className="table-responsive loop-detail-table-wrap">
          <table className="table align-middle transaction-grid-table">
            <colgroup>
              {detailState?.kind === "managed" ? <col style={{ width: "64px" }} /> : null}
              <col className="transaction-grid-col-date" />
              <col className="transaction-grid-col-merchant" />
              <col className="transaction-grid-col-paid-amount" />
              <col className="transaction-grid-col-owner" />
              <col className="transaction-grid-col-category" />
            </colgroup>
            <thead>
              <tr>
                {detailState?.kind === "managed" ? <th className="text-center">선택</th> : null}
                <th>사용일</th>
                <th>가맹점</th>
                <th className="text-end">결제금액</th>
                <th>사용자</th>
                <th>카테고리</th>
              </tr>
            </thead>
            <tbody>
              {detailTransactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  onMouseEnter={() => {
                    if (detailState?.kind !== "managed" || managedSelectionDragMode === null) return;
                    setManagedTransactionSelection(transaction.id, managedSelectionDragMode);
                  }}
                >
                  {detailState?.kind === "managed" ? (
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedManagedTransactionIds.includes(transaction.id)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const nextChecked = !selectedManagedTransactionIds.includes(transaction.id);
                          setManagedSelectionDragMode(nextChecked);
                          setManagedTransactionSelection(transaction.id, nextChecked);
                        }}
                        onChange={() => undefined}
                        onKeyDown={(event) => {
                          if (event.key !== " " && event.key !== "Enter") return;
                          event.preventDefault();
                          const nextChecked = !selectedManagedTransactionIds.includes(transaction.id);
                          setManagedTransactionSelection(transaction.id, nextChecked);
                        }}
                      />
                    </td>
                  ) : null}
                  <td>{transaction.occurredAt.slice(0, 10)}</td>
                  <td>
                    <TransactionRowHeader merchantName={transaction.merchantName} />
                  </td>
                  <td className="text-end transaction-amount-cell">
                    <strong>{formatCurrency(transaction.amount)}</strong>
                  </td>
                  <td>{transaction.ownerPersonId ? ownerNameMap.get(transaction.ownerPersonId) ?? "-" : "-"}</td>
                  <td>{transaction.categoryId && categoryMap.get(transaction.categoryId) ? getCategoryLabel(categoryMap.get(transaction.categoryId)!, categoryMap) : "미분류"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppModal>
    </div>
  );
}

