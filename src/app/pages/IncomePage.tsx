import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { monthKey } from "../../shared/utils/date";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { AppSelect } from "../components/AppSelect";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

type IncomeSourceSuggestion = {
  sourceName: string;
  latestOccurredAt: string;
  latestAmount: number;
  latestOwnerPersonId: string | null;
};

function getTodayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function normalizeSourceKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getPreviousMonthKey(dateValue: string) {
  const [yearValue, monthValue] = dateValue.split("-").map(Number);
  if (!yearValue || !monthValue) return null;
  const date = new Date(yearValue, monthValue - 2, 1);
  return monthKey(date);
}

export function IncomePage() {
  const { addIncomeEntry, deleteIncomeEntry, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = useMemo(() => getWorkspaceScope(state, workspaceId), [state, workspaceId]);
  const currentYear = new Date().getFullYear();
  const todayInputValue = getTodayInputValue();
  const sourceFieldRef = useRef<HTMLDivElement | null>(null);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(currentYear);

  const people = useMemo(
    () =>
      [...scope.people]
        .filter((person) => person.isHidden !== true)
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)),
    [scope.people],
  );
  const selectablePeople = people.filter((person) => person.isActive !== false);
  const visiblePeople = selectablePeople.length ? selectablePeople : people;
  const peopleMap = useMemo(
    () => new Map(scope.people.map((person) => [person.id, person.displayName || person.name])),
    [scope.people],
  );
  const allIncomeEntriesByRecency = useMemo(
    () =>
      [...scope.incomeEntries].sort((left, right) => {
        if (left.occurredAt !== right.occurredAt) {
          return right.occurredAt.localeCompare(left.occurredAt);
        }
        return right.createdAt.localeCompare(left.createdAt);
      }),
    [scope.incomeEntries],
  );
  const sourceSuggestions = useMemo(() => {
    const nextSuggestions: IncomeSourceSuggestion[] = [];
    const seenKeys = new Set<string>();

    allIncomeEntriesByRecency.forEach((entry) => {
      const key = normalizeSourceKey(entry.sourceName);
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      nextSuggestions.push({
        sourceName: entry.sourceName,
        latestOccurredAt: entry.occurredAt,
        latestAmount: entry.amount,
        latestOwnerPersonId: entry.ownerPersonId,
      });
    });

    return nextSuggestions;
  }, [allIncomeEntriesByRecency]);
  const incomeHistoryYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    scope.incomeEntries.forEach((entry) => years.add(new Date(entry.occurredAt).getFullYear()));
    return [...years].sort((left, right) => right - left);
  }, [currentYear, scope.incomeEntries]);

  const [ownerPersonId, setOwnerPersonId] = useState(visiblePeople[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(todayInputValue);
  const [sourceName, setSourceName] = useState("");
  const [amount, setAmount] = useState("");
  const [isAmountDirty, setIsAmountDirty] = useState(false);
  const [isSourceSuggestionOpen, setIsSourceSuggestionOpen] = useState(false);
  const [pendingDeleteIncomeEntryId, setPendingDeleteIncomeEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!visiblePeople.length) {
      if (ownerPersonId) setOwnerPersonId("");
      return;
    }
    if (!visiblePeople.some((person) => person.id === ownerPersonId)) {
      setOwnerPersonId(visiblePeople[0]?.id ?? "");
    }
  }, [ownerPersonId, visiblePeople]);

  useEffect(() => {
    if (!isSourceSuggestionOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sourceFieldRef.current?.contains(target)) return;
      setIsSourceSuggestionOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isSourceSuggestionOpen]);

  const visibleIncomeEntries = useMemo(
    () =>
      allIncomeEntriesByRecency.filter((entry) => new Date(entry.occurredAt).getFullYear() === selectedHistoryYear),
    [allIncomeEntriesByRecency, selectedHistoryYear],
  );
  const pendingDeleteIncomeEntry = useMemo(
    () => scope.incomeEntries.find((entry) => entry.id === pendingDeleteIncomeEntryId) ?? null,
    [pendingDeleteIncomeEntryId, scope.incomeEntries],
  );
  const visibleIncomeTotal = useMemo(
    () => visibleIncomeEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [visibleIncomeEntries],
  );
  const currentMonthIncomeTotal = useMemo(() => {
    const currentMonth = monthKey(new Date());
    return visibleIncomeEntries
      .filter((entry) => monthKey(entry.occurredAt) === currentMonth)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [visibleIncomeEntries]);
  const incomeMonthGroups = useMemo(
    () =>
      Array.from(
        visibleIncomeEntries.reduce((groupMap, entry) => {
          const key = monthKey(entry.occurredAt);
          const current = groupMap.get(key) ?? [];
          groupMap.set(key, [...current, entry]);
          return groupMap;
        }, new Map<string, typeof visibleIncomeEntries>()),
      ).map(([month, entries]) => ({
        month,
        entries,
        total: entries.reduce((sum, entry) => sum + entry.amount, 0),
      })),
    [visibleIncomeEntries],
  );
  const filteredSourceSuggestions = useMemo(() => {
    const query = normalizeSourceKey(sourceName);
    if (!query) return sourceSuggestions.slice(0, 8);
    return sourceSuggestions.filter((item) => normalizeSourceKey(item.sourceName).includes(query)).slice(0, 8);
  }, [sourceName, sourceSuggestions]);

  const findPreviousMonthAmount = (nextSourceName: string, nextOwnerPersonId = ownerPersonId, nextOccurredAt = occurredAt) => {
    const normalizedSourceKey = normalizeSourceKey(nextSourceName);
    const previousMonth = getPreviousMonthKey(nextOccurredAt);
    if (!normalizedSourceKey || !previousMonth) return null;

    const sourceMatches = allIncomeEntriesByRecency.filter(
      (entry) => normalizeSourceKey(entry.sourceName) === normalizedSourceKey && monthKey(entry.occurredAt) === previousMonth,
    );
    if (!sourceMatches.length) return null;

    return (
      sourceMatches.find((entry) => entry.ownerPersonId === nextOwnerPersonId)?.amount ??
      sourceMatches[0]?.amount ??
      null
    );
  };

  const applySourceName = (nextSourceName: string, { forceAmount = false }: { forceAmount?: boolean } = {}) => {
    setSourceName(nextSourceName);

    const matchedSuggestion = sourceSuggestions.find(
      (item) => normalizeSourceKey(item.sourceName) === normalizeSourceKey(nextSourceName),
    );
    if (!matchedSuggestion) {
      if (!isAmountDirty) {
        setAmount("");
      }
      return;
    }

    const previousMonthAmount = findPreviousMonthAmount(nextSourceName);
    if (previousMonthAmount === null) return;
    if (forceAmount || !isAmountDirty) {
      setAmount(String(previousMonthAmount));
      setIsAmountDirty(false);
    }
  };

  useEffect(() => {
    const matchedSuggestion = sourceSuggestions.find(
      (item) => normalizeSourceKey(item.sourceName) === normalizeSourceKey(sourceName),
    );
    if (!matchedSuggestion) return;
    if (isAmountDirty) return;

    const previousMonthAmount = findPreviousMonthAmount(sourceName, ownerPersonId, occurredAt);
    if (previousMonthAmount === null) return;
    setAmount(String(previousMonthAmount));
    setIsAmountDirty(false);
  }, [isAmountDirty, occurredAt, ownerPersonId, sourceName, sourceSuggestions]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerPersonId) return;

    const trimmedSourceName = sourceName.trim();
    const parsedAmount = Number(amount);
    if (!trimmedSourceName || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    addIncomeEntry({
      workspaceId,
      ownerPersonId,
      occurredAt,
      sourceName: trimmedSourceName,
      amount: parsedAmount,
    });
    setSourceName("");
    setAmount("");
    setIsAmountDirty(false);
    setIsSourceSuggestionOpen(false);
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm income-entry-card-shell" style={getMotionStyle(0)}>
        <div className="section-head income-entry-section-head">
          <div>
            <h2 className="section-title">수입 입력</h2>
            <p className="transaction-grid-meta">
              {selectedHistoryYear}년 수입을 행 단위로 입력할 수 있습니다.
            </p>
          </div>
        </div>

        {!visiblePeople.length ? (
          <EmptyStateCallout
            kicker="사용자 필요"
            title="수입을 입력하려면 먼저 사용자를 만들어야 합니다"
            description="수입은 사용자 기준으로 기록됩니다. 자산 화면에서 사용자를 먼저 추가해주세요."
            actions={
              <Link to="/connections/assets" className="btn btn-outline-secondary btn-sm">
                사용자 관리 보기
              </Link>
            }
          />
        ) : (
          <>
            <form className="manual-transaction-form income-entry-form mt-4" onSubmit={handleSubmit}>
              <label>
                <span>사용자</span>
                <AppSelect
                  value={ownerPersonId}
                  onChange={setOwnerPersonId}
                  options={visiblePeople.map((person) => ({ value: person.id, label: person.displayName || person.name }))}
                  ariaLabel="사용자 선택"
                />
              </label>
              <label>
                <span>수입일</span>
                <input
                  className="form-control"
                  type="date"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>수입원</span>
                <div className="income-source-field" ref={sourceFieldRef}>
                  <input
                    className="form-control"
                    value={sourceName}
                    onFocus={() => setIsSourceSuggestionOpen(true)}
                    onChange={(event) => {
                      setIsSourceSuggestionOpen(true);
                      applySourceName(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setIsSourceSuggestionOpen(false);
                      }
                    }}
                    placeholder="예: 급여, 보너스, 프리랜서"
                    autoComplete="off"
                    required
                  />
                  {isSourceSuggestionOpen && filteredSourceSuggestions.length ? (
                    <div className="income-source-suggestion-list" role="listbox" aria-label="이전 수입원 추천">
                      {filteredSourceSuggestions.map((item) => (
                        <button
                          key={item.sourceName}
                          type="button"
                          className="income-source-suggestion-item"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            applySourceName(item.sourceName, { forceAmount: true });
                            setIsSourceSuggestionOpen(false);
                          }}
                        >
                          <span className="income-source-suggestion-name">{item.sourceName}</span>
                          <span className="income-source-suggestion-meta">
                            최근 {item.latestOccurredAt.slice(0, 10)} ·{" "}
                            {item.latestOwnerPersonId ? peopleMap.get(item.latestOwnerPersonId) ?? "-" : "-"} ·{" "}
                            {formatCurrency(item.latestAmount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>
              <label>
                <span>금액</span>
                <input
                  className="form-control"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setIsAmountDirty(true);
                  }}
                  placeholder="예: 3500000"
                  required
                />
              </label>
              <div className="income-entry-form-actions">
                <button className="btn btn-primary" type="submit">
                  수입 추가
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{selectedHistoryYear}년 수입 입력 내역</h2>
          </div>
          <AppSelect
            className="toolbar-select"
            ariaLabel="수입 입력 내역 연도 선택"
            value={String(selectedHistoryYear)}
            onChange={(nextValue) => setSelectedHistoryYear(Number(nextValue))}
            options={incomeHistoryYears.map((year) => ({ value: String(year), label: `${year}년` }))}
          />
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">{selectedHistoryYear}년 누적 수입</span>
            <strong>{formatCurrency(visibleIncomeTotal)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">이번 달 수입</span>
            <strong>{formatCurrency(currentMonthIncomeTotal)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">올해 입력 건수</span>
            <strong>{visibleIncomeEntries.length}건</strong>
          </article>
        </div>

        {!visibleIncomeEntries.length ? (
          <EmptyStateCallout
            kicker="수입 없음"
            title={`아직 ${selectedHistoryYear}년 수입 입력 내역이 없습니다`}
            description="위 폼에서 입력하면 월별 묶음과 카드 형태로 바로 정리됩니다."
          />
        ) : (
          <div className="income-month-stack mt-4">
            {incomeMonthGroups.map((group, groupIndex) => (
              <section key={group.month} className="income-month-section resource-card income-month-card">
                <div className="income-month-header">
                  <div className="income-month-header-copy">
                    <h3>{formatMonthLabel(group.month)}</h3>
                    <p className="mb-0 text-secondary">입력 {group.entries.length}건</p>
                  </div>
                  <div className="income-month-total">
                    <strong>{formatCurrency(group.total)}</strong>
                  </div>
                </div>

                <div className="review-list income-entry-list">
                  {group.entries.map((entry, entryIndex) => (
                    <article
                      key={entry.id}
                      className="review-card review-card--compact income-entry-card"
                      style={getMotionStyle(groupIndex * 6 + entryIndex + 2)}
                    >
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div className="review-card-main">
                          <span className="review-type">{entry.ownerPersonId ? peopleMap.get(entry.ownerPersonId) ?? "사용자" : "사용자 없음"}</span>
                          <h3>{entry.sourceName}</h3>
                          <p className="mb-1 text-secondary">{entry.occurredAt.slice(0, 10)} 수입</p>
                          <div className="income-entry-card-meta">
                            <span>{entry.ownerPersonId ? peopleMap.get(entry.ownerPersonId) ?? "-" : "-"}</span>
                          </div>
                        </div>
                        <div className="review-card-side">
                          <strong>{formatCurrency(entry.amount)}</strong>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => setPendingDeleteIncomeEntryId(entry.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <AppModal
        open={Boolean(pendingDeleteIncomeEntry)}
        title="수입 내역 삭제"
        description={
          pendingDeleteIncomeEntry
            ? `${pendingDeleteIncomeEntry.occurredAt.slice(0, 10)} · ${pendingDeleteIncomeEntry.sourceName} · ${formatCurrency(
                pendingDeleteIncomeEntry.amount,
              )} 내역을 삭제할까요?`
            : ""
        }
        onClose={() => setPendingDeleteIncomeEntryId(null)}
      >
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setPendingDeleteIncomeEntryId(null)}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (!pendingDeleteIncomeEntry) return;
              deleteIncomeEntry(workspaceId, pendingDeleteIncomeEntry.id);
              setPendingDeleteIncomeEntryId(null);
            }}
          >
            삭제
          </button>
        </div>
      </AppModal>
    </div>
  );
}
