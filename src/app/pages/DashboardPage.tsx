import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { monthKey } from "../../shared/utils/date";
import type { Card, Category, ImportRecord, Person, Transaction } from "../../shared/types/models";
import { getWorkspaceInsights, type WorkspaceInsightBasis } from "../../domain/insights/workspaceInsights";
import { getMonthlySharedSettlementSummary, getSettlementBalanceSummary } from "../../domain/settlements/summary";
import { getExpenseImpactStats } from "../../domain/transactions/expenseImpactStats";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { useAppState } from "../state/AppStateProvider";
import { AppModal } from "../components/AppModal";
import { BoardCaseSection } from "../components/BoardCase";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { getWorkspaceScope } from "../state/selectors";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
}

type UsageStat = {
  amount: number;
  transactionCount: number;
};

type DashboardCategoryUsageCard = {
  id: string;
  name: string;
  fixedOrVariable: Category["fixedOrVariable"];
  amount: number;
  transactionCount: number;
};

type DashboardCategoryUsageGroup = {
  id: string;
  name: string;
  amount: number;
  transactionCount: number;
  categories: DashboardCategoryUsageCard[];
};

type DashboardPersonCategoryUsage = {
  id: string;
  name: string;
  totalAmount: number;
  transactionCount: number;
  usedCategoryCount: number;
  totalCategoryCount: number;
  groups: DashboardCategoryUsageGroup[];
  isUnassigned?: boolean;
};

type DashboardCardUsageCard = {
  id: string;
  name: string;
  issuerName: string;
  linkedAccountPrefix?: string;
  linkedAccountName: string;
  cardTypeLabel: string;
  cardNumberMasked: string;
  amount: number;
  transactionCount: number;
};

type DashboardPersonCardUsage = {
  id: string;
  name: string;
  totalAmount: number;
  transactionCount: number;
  usedCardCount: number;
  totalCardCount: number;
  cards: DashboardCardUsageCard[];
  isUnassigned?: boolean;
};

type DashboardScopeOption = {
  value: string;
  label: string;
};

type CategoryUsageModalState = {
  personId: string;
  personName: string;
  categoryId: string;
  categoryName: string;
};

type StatementScopeOption = DashboardScopeOption & {
  importRecordIds: Set<string>;
};

const UNASSIGNED_PERSON_KEY = "__dashboard-unassigned__";
const UNCATEGORIZED_CATEGORY_KEY = "__dashboard-uncategorized__";
const OTHER_CATEGORY_GROUP_KEY = "__dashboard-other-categories__";
const UNASSIGNED_CARD_KEY = "__dashboard-unassigned-card__";
const UNSPECIFIED_STATEMENT_KEY = "__dashboard-unspecified-statement__";

function compareBySortOrder(left: { sortOrder?: number; name: string }, right: { sortOrder?: number; name: string }) {
  return (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "ko");
}

function getOrderedCategoryGroups(categories: Category[]) {
  return categories.filter((category) => category.categoryType === "group").sort(compareBySortOrder);
}

function getOrderedChildCategories(categories: Category[], groupId: string) {
  return categories
    .filter((category) => category.categoryType === "category" && category.parentCategoryId === groupId)
    .sort(compareBySortOrder);
}

function getPersonLabel(person: Person) {
  return person.displayName || person.name;
}

function getCardTypeLabel(cardType: Card["cardType"]) {
  switch (cardType) {
    case "credit":
      return "신용카드";
    case "check":
      return "체크카드";
    case "debit":
      return "직불카드";
    case "prepaid":
      return "선불카드";
    default:
      return "기타";
  }
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatStatementMonthLabel(value: string) {
  return `${formatMonthLabel(value)} 청구`;
}

function getPreviousMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(year, month - 2, 1);
  return monthKey(date);
}

function formatDeltaAmount(amount: number) {
  if (amount === 0) return formatCurrency(0);
  return formatCurrency(Math.abs(amount));
}

function getDeltaBadge(value: number, goodWhenIncrease = true) {
  if (value === 0) {
    return { label: "유지", className: "text-bg-light" };
  }

  const isIncrease = value > 0;
  const isGood = goodWhenIncrease ? isIncrease : !isIncrease;
  return { label: isIncrease ? "증가" : "감소", className: isGood ? "text-bg-success" : "text-bg-warning" };
}

function getCompletionBadge(count: number) {
  const isComplete = count === 0;
  return { label: isComplete ? "완료" : "미완료", className: isComplete ? "text-bg-success" : "text-bg-warning" };
}

function getStatementScopeOptions(imports: ImportRecord[], linkedImportRecordIds: Set<string>): StatementScopeOption[] {
  const statementMap = new Map<string, StatementScopeOption>();
  const unspecifiedImportRecordIds = new Set<string>();

  for (const record of imports) {
    if (!linkedImportRecordIds.has(record.id)) continue;

    const statementMonth = record.statementMonth?.trim();
    if (!statementMonth) {
      unspecifiedImportRecordIds.add(record.id);
      continue;
    }

    const existing = statementMap.get(statementMonth);
    if (existing) {
      existing.importRecordIds.add(record.id);
      continue;
    }

    statementMap.set(statementMonth, {
      value: statementMonth,
      label: formatStatementMonthLabel(statementMonth),
      importRecordIds: new Set([record.id]),
    });
  }

  const options = [...statementMap.values()].sort((left, right) => right.value.localeCompare(left.value));

  if (unspecifiedImportRecordIds.size) {
    options.push({
      value: UNSPECIFIED_STATEMENT_KEY,
      label: "기준 미지정 명세서",
      importRecordIds: unspecifiedImportRecordIds,
    });
  }

  return options;
}

export function DashboardPage({ mode = "moon" }: { mode?: "dashboard" | "moon" }) {
  const { state } = useAppState();
  const navigate = useNavigate();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentMonth = monthKey(new Date());
  const monthOptions = useMemo(
    () =>
      Array.from(new Set(scope.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [scope.transactions],
  );
  const monthScopeOptions = useMemo<DashboardScopeOption[]>(
    () => monthOptions.map((month) => ({ value: month, label: formatMonthLabel(month) })),
    [monthOptions],
  );
  const linkedImportRecordIds = useMemo(
    () =>
      new Set(
        scope.transactions
          .map((transaction) => transaction.importRecordId)
          .filter((importRecordId): importRecordId is string => Boolean(importRecordId)),
      ),
    [scope.transactions],
  );
  const statementScopeOptions = useMemo(
    () => getStatementScopeOptions(scope.imports, linkedImportRecordIds),
    [linkedImportRecordIds, scope.imports],
  );
  const [selectedDashboardBasis, setSelectedDashboardBasis] = useState<WorkspaceInsightBasis>("month");
  const [selectedDashboardMonth, setSelectedDashboardMonth] = useState(() =>
    monthOptions.includes(currentMonth) ? currentMonth : monthOptions[0] ?? currentMonth,
  );
  const [selectedDashboardStatement, setSelectedDashboardStatement] = useState(() => statementScopeOptions[0]?.value ?? "");
  const [expandedCategoryGroupKeys, setExpandedCategoryGroupKeys] = useState<Set<string>>(() => new Set());
  const [showAllCategoryPersonKeys, setShowAllCategoryPersonKeys] = useState<Set<string>>(() => new Set());
  const [categoryUsageModal, setCategoryUsageModal] = useState<CategoryUsageModalState | null>(null);
  const [pendingCategoryUsageNavigation, setPendingCategoryUsageNavigation] = useState<string | null>(null);

  useEffect(() => {
    const nextSelectedMonth = monthOptions.includes(selectedDashboardMonth)
      ? selectedDashboardMonth
      : monthOptions.includes(currentMonth)
        ? currentMonth
        : monthOptions[0] ?? currentMonth;

    if (nextSelectedMonth !== selectedDashboardMonth) {
      setSelectedDashboardMonth(nextSelectedMonth);
    }
  }, [currentMonth, monthOptions, selectedDashboardMonth]);

  useEffect(() => {
    const nextSelectedStatement = statementScopeOptions.some((option) => option.value === selectedDashboardStatement)
      ? selectedDashboardStatement
      : statementScopeOptions[0]?.value ?? "";

    if (nextSelectedStatement !== selectedDashboardStatement) {
      setSelectedDashboardStatement(nextSelectedStatement);
    }

    if (!statementScopeOptions.length && selectedDashboardBasis === "statement") {
      setSelectedDashboardBasis("month");
    }
  }, [selectedDashboardBasis, selectedDashboardStatement, statementScopeOptions]);

  useEffect(() => {
    if (categoryUsageModal || !pendingCategoryUsageNavigation) return;
    navigate(pendingCategoryUsageNavigation);
    setPendingCategoryUsageNavigation(null);
  }, [categoryUsageModal, navigate, pendingCategoryUsageNavigation]);

  const selectedDashboardScopeOptions = selectedDashboardBasis === "statement" ? statementScopeOptions : monthScopeOptions;
  const selectedDashboardScopeValue =
    selectedDashboardBasis === "statement" ? selectedDashboardStatement : selectedDashboardMonth;
  const selectedDashboardScopeLabel =
    selectedDashboardScopeOptions.find((option) => option.value === selectedDashboardScopeValue)?.label ??
    (selectedDashboardBasis === "statement" ? "명세서 없음" : "연월 없음");
  const selectedDashboardTransactions = useMemo(() => {
    if (selectedDashboardBasis === "statement") {
      const selectedStatement = statementScopeOptions.find((option) => option.value === selectedDashboardStatement);
      if (!selectedStatement) return [];
      return scope.transactions.filter(
        (transaction) => Boolean(transaction.importRecordId && selectedStatement.importRecordIds.has(transaction.importRecordId)),
      );
    }

    return scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === selectedDashboardMonth);
  }, [scope.transactions, selectedDashboardBasis, selectedDashboardMonth, selectedDashboardStatement, statementScopeOptions]);
  const selectedDashboardIncomeEntries = useMemo(() => {
    const targetMonth = selectedDashboardBasis === "statement" ? selectedDashboardStatement : selectedDashboardMonth;
    if (!targetMonth || targetMonth === UNSPECIFIED_STATEMENT_KEY) return [];
    return scope.incomeEntries.filter((entry) => monthKey(entry.occurredAt) === targetMonth);
  }, [scope.incomeEntries, selectedDashboardBasis, selectedDashboardMonth, selectedDashboardStatement]);
  const selectedDashboardExpenseTransactions = useMemo(
    () => getExpenseImpactStats(selectedDashboardTransactions).activeExpenseTransactions,
    [selectedDashboardTransactions],
  );

  const insights = getWorkspaceInsights(state, workspaceId, {
    basis: selectedDashboardBasis,
    label: selectedDashboardScopeLabel,
    transactions: selectedDashboardTransactions,
    incomeEntries: selectedDashboardIncomeEntries,
  });
  const currentMonthTransactions = useMemo(
    () => scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === currentMonth),
    [currentMonth, scope.transactions],
  );
  const previousMonth = useMemo(() => getPreviousMonthKey(currentMonth), [currentMonth]);
  const previousMonthTransactions = useMemo(
    () => scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === previousMonth),
    [previousMonth, scope.transactions],
  );
  const currentMonthIncomeEntries = useMemo(
    () => scope.incomeEntries.filter((entry) => monthKey(entry.occurredAt) === currentMonth),
    [currentMonth, scope.incomeEntries],
  );
  const previousMonthIncomeEntries = useMemo(
    () => scope.incomeEntries.filter((entry) => monthKey(entry.occurredAt) === previousMonth),
    [previousMonth, scope.incomeEntries],
  );
  const currentMonthInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "month",
    label: formatMonthLabel(currentMonth),
    transactions: currentMonthTransactions,
    incomeEntries: currentMonthIncomeEntries,
  });
  const previousMonthInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "month",
    label: formatMonthLabel(previousMonth),
    transactions: previousMonthTransactions,
    incomeEntries: previousMonthIncomeEntries,
  });
  const currentMonthIncomeDelta = currentMonthInsights.income - previousMonthInsights.income;
  const currentMonthExpenseDelta = currentMonthInsights.expense - previousMonthInsights.expense;
  const currentMonthSavingsDelta = currentMonthInsights.savings - previousMonthInsights.savings;
  const incomeDeltaBadge = getDeltaBadge(currentMonthIncomeDelta, true);
  const expenseDeltaBadge = getDeltaBadge(currentMonthExpenseDelta, false);
  const savingsDeltaBadge = getDeltaBadge(currentMonthSavingsDelta, true);
  const reviewBadge = getCompletionBadge(currentMonthInsights.reviewCount);
  const uncategorizedBadge = getCompletionBadge(currentMonthInsights.uncategorizedCount);
  const dominantCategory = insights.topCategories[0] ?? null;
  const dominantCategoryShare =
    dominantCategory && insights.expense > 0 ? Math.round((dominantCategory.amount / insights.expense) * 100) : null;
  const dominantSource = insights.sourceBreakdown[0] ?? null;
  const activePeopleCount = scope.people.filter((person) => person.isActive).length;
  const activePeople = useMemo(() => scope.people.filter((person) => person.isActive), [scope.people]);
  const ownedAccountCount = scope.accounts.filter((account) => account.ownerPersonId || account.isShared).length;
  const linkedCardCount = scope.cards.filter((card) => card.ownerPersonId && card.linkedAccountId).length;
  const unmappedAccountCount = scope.accounts.length - ownedAccountCount;
  const unmappedCardCount = scope.cards.length - linkedCardCount;
  const peopleSetupRemaining = activePeopleCount > 0 ? 0 : 1;
  const foundationRemainingCount = peopleSetupRemaining + unmappedAccountCount + unmappedCardCount;
  const currentMonthSettlementSummary = useMemo(
    () => getMonthlySharedSettlementSummary(currentMonthTransactions, activePeople.length, currentMonth),
    [activePeople.length, currentMonth, currentMonthTransactions],
  );
  const currentMonthSettlementRowsBase = useMemo(
    () =>
      currentMonthSettlementSummary.baseRows.map((row) => ({
        ...row,
        name: scope.people.find((person) => person.id === row.personId)?.displayName || scope.people.find((person) => person.id === row.personId)?.name || "공동 계정",
      })),
    [currentMonthSettlementSummary.baseRows, scope.people],
  );
  const currentMonthSettlementBalance = useMemo(
    () => getSettlementBalanceSummary(currentMonthSettlementRowsBase, scope.settlements, currentMonth),
    [currentMonth, currentMonthSettlementRowsBase, scope.settlements],
  );
  const currentMonthSettlementRows = currentMonthSettlementBalance.rows;
  const currentMonthSettlementHistory = currentMonthSettlementBalance.settlementHistory;
  const settlementReceiver = currentMonthSettlementRows.find((row) => row.remainingDelta > 0);
  const settlementSender = currentMonthSettlementRows.find((row) => row.remainingDelta < 0);
  const suggestedSettlementAmount =
    settlementReceiver && settlementSender ? Math.min(settlementReceiver.remainingDelta, Math.abs(settlementSender.remainingDelta)) : 0;
  const settlementReceiverName = settlementReceiver
    ? scope.people.find((person) => person.id === settlementReceiver.personId)?.displayName ||
      scope.people.find((person) => person.id === settlementReceiver.personId)?.name ||
      "공동 계정"
    : null;
  const settlementSenderName = settlementSender
    ? scope.people.find((person) => person.id === settlementSender.personId)?.displayName ||
      scope.people.find((person) => person.id === settlementSender.personId)?.name ||
      "공동 계정"
    : null;
  const settlementStatusTitle = !currentMonthSettlementSummary.sharedTransactions.length
    ? "이번 달 공동지출이 아직 없습니다"
    : settlementReceiver && settlementSender && suggestedSettlementAmount > 0
      ? `${settlementSenderName}에서 ${settlementReceiverName}에게 ${formatCurrency(suggestedSettlementAmount)} 정리가 필요합니다`
      : "이번 달 흐름이 거의 정리되었습니다";
  const settlementStatusDescription = !currentMonthSettlementSummary.sharedTransactions.length
    ? "공동지출 거래가 생기면 흐름에서 바로 정리 상태를 볼 수 있습니다."
    : settlementReceiver && settlementSender && suggestedSettlementAmount > 0
      ? `공동지출 ${currentMonthSettlementSummary.sharedTransactions.length}건 기준으로 남은 최소 정리 금액입니다.`
      : currentMonthSettlementHistory.length
        ? `완료 기록 ${currentMonthSettlementHistory.length}건이 반영되어 남은 차이가 거의 없습니다.`
        : "추가 정리 없이 현재 공동지출 흐름을 볼 수 있습니다.";
  const visiblePeople = useMemo(() => scope.people.filter((person) => !person.isHidden).sort(compareBySortOrder), [scope.people]);
  const visibleCards = useMemo(() => scope.cards.filter((card) => !card.isHidden).sort(compareBySortOrder), [scope.cards]);
  const accountNameMap = useMemo(
    () => new Map(scope.accounts.map((account) => [account.id, account.alias || account.name])),
    [scope.accounts],
  );
  const categoryNameMap = useMemo(
    () => new Map(scope.categories.map((category) => [category.id, category.name])),
    [scope.categories],
  );
  const dashboardGroupCategories = useMemo(() => getOrderedCategoryGroups(scope.categories), [scope.categories]);
  const dashboardGroupChildrenMap = useMemo(
    () => new Map(dashboardGroupCategories.map((group) => [group.id, getOrderedChildCategories(scope.categories, group.id)])),
    [dashboardGroupCategories, scope.categories],
  );
  const dashboardGroupCategoryMap = useMemo(
    () => new Map(dashboardGroupCategories.map((group) => [group.id, group])),
    [dashboardGroupCategories],
  );
  const dashboardLeafCategoryMap = useMemo(
    () => new Map(scope.categories.filter((category) => category.categoryType === "category").map((category) => [category.id, category])),
    [scope.categories],
  );

  const resolveDashboardCategoryId = (categoryId: string | null) => {
    if (!categoryId) return UNCATEGORIZED_CATEGORY_KEY;
    if (dashboardLeafCategoryMap.has(categoryId)) return categoryId;

    const groupCategory = dashboardGroupCategoryMap.get(categoryId);
    if (!groupCategory) return categoryId;

    const childCategories = dashboardGroupChildrenMap.get(groupCategory.id) ?? [];
    const sameNameChildren = childCategories.filter((childCategory) => childCategory.name === groupCategory.name);
    if (sameNameChildren.length === 1) return sameNameChildren[0].id;
    if (childCategories.length === 1) return childCategories[0].id;
    return categoryId;
  };

  const renderScopeSelect = (ariaLabel: string) => (
    <div className="dashboard-section-toolbar">
      <select
        className="form-select dashboard-section-basis-select"
        value={selectedDashboardBasis}
        onChange={(event) => setSelectedDashboardBasis(event.target.value as WorkspaceInsightBasis)}
        aria-label={`${ariaLabel} 기준 선택`}
      >
        <option value="month">월별</option>
        {statementScopeOptions.length ? <option value="statement">명세서</option> : null}
      </select>
      <select
        className="form-select dashboard-section-month-select"
        value={selectedDashboardScopeValue}
        onChange={(event) =>
          selectedDashboardBasis === "statement"
            ? setSelectedDashboardStatement(event.target.value)
            : setSelectedDashboardMonth(event.target.value)
        }
        aria-label={`${ariaLabel} 범위 선택`}
      >
        {selectedDashboardScopeOptions.length ? (
          selectedDashboardScopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))
        ) : (
          <option value={selectedDashboardScopeValue}>{selectedDashboardBasis === "statement" ? "명세서 없음" : "연월 없음"}</option>
        )}
      </select>
    </div>
  );

  const toggleCategoryGroup = (groupKey: string) => {
    setExpandedCategoryGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleCategoryVisibilityMode = (personKey: string) => {
    setShowAllCategoryPersonKeys((current) => {
      const next = new Set(current);
      if (next.has(personKey)) {
        next.delete(personKey);
      } else {
        next.add(personKey);
      }
      return next;
    });
  };

  const toggleAllCategoryGroups = (personKey: string, groupIds: string[]) => {
    setExpandedCategoryGroupKeys((current) => {
      const next = new Set(current);
      const groupKeys = groupIds.map((groupId) => `${personKey}:${groupId}`);
      const areAllExpanded = groupKeys.length > 0 && groupKeys.every((groupKey) => next.has(groupKey));

      if (areAllExpanded) {
        groupKeys.forEach((groupKey) => next.delete(groupKey));
      } else {
        groupKeys.forEach((groupKey) => next.add(groupKey));
      }

      return next;
    });
  };

  const categoryUsageModalTransactions = useMemo<Transaction[]>(() => {
    if (!categoryUsageModal) return [];

    return selectedDashboardExpenseTransactions.filter((transaction) => {
      const matchesPerson =
        categoryUsageModal.personId === UNASSIGNED_PERSON_KEY
          ? !transaction.ownerPersonId
          : transaction.ownerPersonId === categoryUsageModal.personId;
      if (!matchesPerson) return false;

      if (categoryUsageModal.categoryId === UNCATEGORIZED_CATEGORY_KEY) {
        return !transaction.categoryId;
      }

      return resolveDashboardCategoryId(transaction.categoryId) === categoryUsageModal.categoryId;
    });
  }, [categoryUsageModal, selectedDashboardExpenseTransactions]);

  const openCategoryUsageModal = (personId: string, personName: string, categoryId: string, categoryName: string) => {
    setCategoryUsageModal({ personId, personName, categoryId, categoryName });
  };

  const openCategoryUsageInTransactions = () => {
    if (!categoryUsageModal) return;

    const nextParams = new URLSearchParams();
    nextParams.set("openFromCategoryUsage", "1");
    if (categoryUsageModal.personId !== UNASSIGNED_PERSON_KEY) {
      nextParams.set("ownerPersonId", categoryUsageModal.personId);
    }
    if (categoryUsageModal.categoryId !== UNCATEGORIZED_CATEGORY_KEY) {
      nextParams.set("categoryId", categoryUsageModal.categoryId);
    } else {
      nextParams.set("nature", "uncategorized");
    }
    if (selectedDashboardBasis === "statement" && selectedDashboardStatement) {
      nextParams.set("statementId", selectedDashboardStatement);
    }

    setPendingCategoryUsageNavigation(`/collections/card?${nextParams.toString()}`);
    if (typeof document !== "undefined") {
      delete document.body.dataset.appModalCount;
      document.body.classList.remove("app-modal-open");
      document.documentElement.classList.remove("app-modal-open");
    }
    setCategoryUsageModal(null);
  };

  const getDashboardTransactionOwnerLabel = (transaction: Transaction) => {
    if (!transaction.ownerPersonId) return "-";
    const owner = visiblePeople.find((person) => person.id === transaction.ownerPersonId);
    return owner ? getPersonLabel(owner) : "-";
  };

  const getDashboardTransactionCategoryLabel = (transaction: Transaction) => {
    if (!transaction.categoryId) return "미분류";
    return categoryNameMap.get(transaction.categoryId) ?? "알 수 없는 카테고리";
  };

  const personCategoryUsage = useMemo<DashboardPersonCategoryUsage[]>(() => {
    const personMap = new Map(visiblePeople.map((person) => [person.id, person]));
    const usedPersonIds = new Set(
      selectedDashboardExpenseTransactions
        .map((transaction) => transaction.ownerPersonId)
        .filter((personId): personId is string => Boolean(personId && personMap.has(personId))),
    );
    const orderedPeople = visiblePeople.filter((person) => person.isActive || usedPersonIds.has(person.id));
    const usageByPerson = new Map<string, Map<string, UsageStat>>();

    const ensureUsageMap = (personKey: string) => {
      const existing = usageByPerson.get(personKey);
      if (existing) return existing;
      const created = new Map<string, UsageStat>();
      usageByPerson.set(personKey, created);
      return created;
    };

    for (const transaction of selectedDashboardExpenseTransactions) {
      const personKey = transaction.ownerPersonId && personMap.has(transaction.ownerPersonId) ? transaction.ownerPersonId : UNASSIGNED_PERSON_KEY;
      const categoryKey = resolveDashboardCategoryId(transaction.categoryId);
      const personUsage = ensureUsageMap(personKey);
      const current = personUsage.get(categoryKey) ?? { amount: 0, transactionCount: 0 };
      current.amount += Math.abs(transaction.amount);
      current.transactionCount += 1;
      personUsage.set(categoryKey, current);
    }

    const buildUsageSection = (personKey: string, name: string, isUnassigned = false): DashboardPersonCategoryUsage => {
      const usage = usageByPerson.get(personKey) ?? new Map<string, UsageStat>();
      const consumedCategoryIds = new Set<string>();
      const groups: DashboardCategoryUsageGroup[] = [];

      for (const group of dashboardGroupCategories) {
        const categories = (dashboardGroupChildrenMap.get(group.id) ?? []).map<DashboardCategoryUsageCard>((category) => {
            const stats = usage.get(category.id) ?? { amount: 0, transactionCount: 0 };
            consumedCategoryIds.add(category.id);
            return {
              id: category.id,
              name: category.name,
              fixedOrVariable: category.fixedOrVariable,
              amount: stats.amount,
              transactionCount: stats.transactionCount,
            };
          });

        if (!categories.length) continue;

        groups.push({
          id: group.id,
          name: group.name,
          amount: categories.reduce((sum, category) => sum + category.amount, 0),
          transactionCount: categories.reduce((sum, category) => sum + category.transactionCount, 0),
          categories,
        });
      }

      const uncategorizedStats = usage.get(UNCATEGORIZED_CATEGORY_KEY);
      if (uncategorizedStats) {
        groups.unshift({
          id: UNCATEGORIZED_CATEGORY_KEY,
          name: "미분류",
          amount: uncategorizedStats.amount,
          transactionCount: uncategorizedStats.transactionCount,
          categories: [
            {
              id: UNCATEGORIZED_CATEGORY_KEY,
              name: "미분류",
              fixedOrVariable: "variable",
              amount: uncategorizedStats.amount,
              transactionCount: uncategorizedStats.transactionCount,
            },
          ],
        });
      }

      const orphanCategories = [...usage.entries()]
        .filter(([categoryId]) => categoryId !== UNCATEGORIZED_CATEGORY_KEY && !consumedCategoryIds.has(categoryId))
        .map<DashboardCategoryUsageCard>(([categoryId, stats]) => ({
          id: categoryId,
          name: dashboardLeafCategoryMap.get(categoryId)?.name ?? "알 수 없는 카테고리",
          fixedOrVariable: dashboardLeafCategoryMap.get(categoryId)?.fixedOrVariable ?? "variable",
          amount: stats.amount,
          transactionCount: stats.transactionCount,
        }))
        .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "ko"));

      if (orphanCategories.length) {
        groups.push({
          id: OTHER_CATEGORY_GROUP_KEY,
          name: "기타",
          amount: orphanCategories.reduce((sum, category) => sum + category.amount, 0),
          transactionCount: orphanCategories.reduce((sum, category) => sum + category.transactionCount, 0),
          categories: orphanCategories,
        });
      }

      const transactionCount = [...usage.values()].reduce((sum, stats) => sum + stats.transactionCount, 0);
      const totalAmount = [...usage.values()].reduce((sum, stats) => sum + stats.amount, 0);
      const usedCategoryCount = groups.reduce(
        (sum, group) => sum + group.categories.filter((category) => category.transactionCount > 0 || category.amount > 0).length,
        0,
      );
      const totalCategoryCount = groups.reduce((sum, group) => sum + group.categories.length, 0);

      return {
        id: personKey,
        name,
        totalAmount,
        transactionCount,
        usedCategoryCount,
        totalCategoryCount,
        groups,
        isUnassigned,
      };
    };

    const sections = orderedPeople.map((person) => buildUsageSection(person.id, getPersonLabel(person)));
    if (usageByPerson.has(UNASSIGNED_PERSON_KEY)) {
      sections.push(buildUsageSection(UNASSIGNED_PERSON_KEY, "미지정", true));
    }

    return sections;
  }, [dashboardGroupCategories, dashboardGroupChildrenMap, dashboardLeafCategoryMap, selectedDashboardExpenseTransactions, visiblePeople]);

  const personCardUsage = useMemo<DashboardPersonCardUsage[]>(() => {
    const personMap = new Map(visiblePeople.map((person) => [person.id, person]));
    const cardMap = new Map(visibleCards.map((card) => [card.id, card]));
    const ownedCardPersonIds = new Set(
      visibleCards
        .map((card) => card.ownerPersonId)
        .filter((personId): personId is string => Boolean(personId && personMap.has(personId))),
    );
    const usageByPerson = new Map<string, Map<string, UsageStat>>();

    const ensureUsageMap = (personKey: string) => {
      const existing = usageByPerson.get(personKey);
      if (existing) return existing;
      const created = new Map<string, UsageStat>();
      usageByPerson.set(personKey, created);
      return created;
    };

    for (const transaction of selectedDashboardExpenseTransactions) {
      if (!transaction.cardId && transaction.sourceType !== "card") continue;

      const personKey = transaction.ownerPersonId && personMap.has(transaction.ownerPersonId) ? transaction.ownerPersonId : UNASSIGNED_PERSON_KEY;
      const cardKey = transaction.cardId && cardMap.has(transaction.cardId) ? transaction.cardId : UNASSIGNED_CARD_KEY;
      const personUsage = ensureUsageMap(personKey);
      const current = personUsage.get(cardKey) ?? { amount: 0, transactionCount: 0 };
      current.amount += Math.abs(transaction.amount);
      current.transactionCount += 1;
      personUsage.set(cardKey, current);
    }

    const usedCardPersonIds = new Set(
      selectedDashboardExpenseTransactions
        .filter((transaction) => Boolean(transaction.cardId || transaction.sourceType === "card"))
        .map((transaction) => transaction.ownerPersonId)
        .filter((personId): personId is string => Boolean(personId && personMap.has(personId))),
    );
    const orderedPeople = visiblePeople.filter(
      (person) => person.isActive || ownedCardPersonIds.has(person.id) || usedCardPersonIds.has(person.id),
    );

    const buildUsageSection = (personKey: string, name: string, isUnassigned = false): DashboardPersonCardUsage => {
      const usage = usageByPerson.get(personKey) ?? new Map<string, UsageStat>();
      const ownedCards = visibleCards.filter((card) => (isUnassigned ? card.ownerPersonId === null : card.ownerPersonId === personKey));
      const cardIds = new Set(ownedCards.map((card) => card.id));

      for (const cardId of usage.keys()) {
        if (cardId === UNASSIGNED_CARD_KEY || cardIds.has(cardId)) continue;
        if (cardMap.has(cardId)) cardIds.add(cardId);
      }

      const cards = [...cardIds]
        .map((cardId) => cardMap.get(cardId))
        .filter((card): card is Card => Boolean(card))
        .map<DashboardCardUsageCard>((card) => {
          const stats = usage.get(card.id) ?? { amount: 0, transactionCount: 0 };
          const linkedAccountName = card.linkedAccountId ? accountNameMap.get(card.linkedAccountId) ?? "연결 계좌 없음" : "연결 계좌 없음";
          return {
            id: card.id,
            name: card.name,
            issuerName: card.issuerName || "카드사 미확인",
            linkedAccountPrefix: card.cardType === "credit" ? "납부계좌" : "연결계좌",
            linkedAccountName,
            cardTypeLabel: getCardTypeLabel(card.cardType),
            cardNumberMasked: card.cardNumberMasked.trim(),
            amount: stats.amount,
            transactionCount: stats.transactionCount,
          };
        })
        .sort(
          (left, right) =>
            Number(right.transactionCount > 0) - Number(left.transactionCount > 0) ||
            right.amount - left.amount ||
            left.name.localeCompare(right.name, "ko"),
        );

      const unassignedCardStats = usage.get(UNASSIGNED_CARD_KEY);
      if (unassignedCardStats) {
        cards.unshift({
          id: UNASSIGNED_CARD_KEY,
          name: "미지정 카드",
          issuerName: "카드 연결 필요",
          linkedAccountName: "카드 정보가 연결되지 않은 결제",
          cardTypeLabel: "미지정",
          cardNumberMasked: "",
          amount: unassignedCardStats.amount,
          transactionCount: unassignedCardStats.transactionCount,
        });
      }

      const transactionCount = [...usage.values()].reduce((sum, stats) => sum + stats.transactionCount, 0);
      const totalAmount = [...usage.values()].reduce((sum, stats) => sum + stats.amount, 0);
      const usedCardCount = cards.filter((card) => card.transactionCount > 0 || card.amount > 0).length;

      return {
        id: personKey,
        name,
        totalAmount,
        transactionCount,
        usedCardCount,
        totalCardCount: cards.length,
        cards,
        isUnassigned,
      };
    };

    const sections = orderedPeople.map((person) => buildUsageSection(person.id, getPersonLabel(person)));
    const shouldShowUnassignedSection =
      usageByPerson.has(UNASSIGNED_PERSON_KEY) || visibleCards.some((card) => card.ownerPersonId === null);

    if (shouldShowUnassignedSection) {
      sections.push(buildUsageSection(UNASSIGNED_PERSON_KEY, "미지정", true));
    }

    return sections;
  }, [accountNameMap, selectedDashboardExpenseTransactions, visibleCards, visiblePeople]);

  return (
    <div className="page-stack">
      {mode === "moon" ? (
        <>
      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="dashboard-summary">
        <div className="section-head">
          <div>
            <span className="section-kicker">{selectedDashboardBasis === "statement" ? "명세서 기준 요약" : "월별 요약"}</span>
            <h2 className="section-title">가계 상태 요약</h2>
          </div>
          {renderScopeSelect("가계 상태 요약")}
        </div>

        <div className="stats-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <span className="stat-label">기준 수입</span>
            <strong>{formatCurrency(insights.income)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <span className="stat-label">기준 소비</span>
            <strong>{formatCurrency(insights.expense)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <span className="stat-label">기준 저축 여력</span>
            <strong>{formatCurrency(insights.savings)}</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(4)}>
            <span className="stat-label">검토 필요 항목</span>
            <strong>{insights.reviewCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(5)}>
            <span className="stat-label">미분류 거래</span>
            <strong>{insights.uncategorizedCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(6)}>
            <span className="stat-label">내부이체</span>
            <strong>{insights.internalTransferCount}건</strong>
          </article>
        </div>

        <div className="resource-grid mt-4">
          {insights.headlineCards.map((card, index) => (
            <article key={card.title} className="resource-card" style={getMotionStyle(index + 7)}>
              <h3>{card.title}</h3>
              <p className="mb-0 text-secondary">{card.description}</p>
            </article>
          ))}
        </div>

        <div className="insight-status-grid mt-4">
          <article className={`insight-status-card ${toneClass(insights.spendTone)}`} style={getMotionStyle(10)}>
            <span className="stat-label">지출률</span>
            <strong>{formatPercent(insights.spendRate)}</strong>
          </article>
          <article className={`insight-status-card ${toneClass(insights.savingsTone)}`} style={getMotionStyle(11)}>
            <span className="stat-label">저축률</span>
            <strong>{formatPercent(insights.savingsRate)}</strong>
          </article>
          <article className={`insight-status-card ${toneClass(insights.fixedTone)}`} style={getMotionStyle(12)}>
            <span className="stat-label">고정지출 비중</span>
            <strong>{formatPercent(insights.fixedExpenseRate)}</strong>
          </article>
        </div>

        {insights.nextSteps.length || dominantCategory || dominantSource ? (
          <div className="dashboard-action-panel mt-4">
            <div className="dashboard-action-panel-copy">
              <h3>지금 하면 좋은 일</h3>
              <p className="mb-0 text-secondary">우선순위가 높은 정리 항목만 간단히 모아두었습니다.</p>
            </div>
            {insights.nextSteps.length ? (
              <ul className="next-step-list">
                {insights.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : null}
            {dominantCategory || dominantSource ? (
              <div className="dashboard-action-hints">
                <strong>진단 힌트</strong>
                {dominantCategory ? (
                  <p className="mb-0 text-secondary">
                    가장 큰 지출 원인은 {dominantCategory.categoryName}
                    {dominantCategoryShare !== null ? `로, 선택한 기준 소비의 ${dominantCategoryShare}%를 차지합니다.` : "입니다."}
                  </p>
                ) : null}
                {dominantSource ? (
                  <p className="mb-0 text-secondary">
                    주요 결제 경로는 {getSourceTypeLabel(dominantSource.sourceType)}이며, 선택한 기준 거래 {dominantSource.count}건과 소비 반영{" "}
                    {formatCurrency(dominantSource.expenseAmount)}이 잡혀 있습니다.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {insights.isDiagnosisReady ? (
          <CompletionBanner
            className="mt-4"
            title="대시보드 해석 준비가 끝났습니다"
            description="검토와 분류, 기준값 설정이 마무리되어 선택한 기준 흐름을 안정적으로 볼 수 있습니다."
            actions={
              <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
                결제내역 보기
              </Link>
            }
          />
        ) : null}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">카테고리 흐름</span>
            <h2 className="section-title">카테고리별 사용내역</h2>
          </div>
          {renderScopeSelect("카테고리별 사용내역")}
        </div>
        <p className="mb-0 text-secondary">
          선택한 기준의 실지출을 기준으로 사용자별 소비를 나눠서 보고, 각 그룹 안에서는 전체 카테고리 구조를 그대로 카드로 보여줍니다.
        </p>

        <div className="dashboard-category-person-stack">
          {personCategoryUsage.length ? (
            personCategoryUsage.map((personSection, index) => {
              const isUsedOnly = !showAllCategoryPersonKeys.has(personSection.id);
              const visibleGroups = personSection.groups
                .map((group) => ({
                  ...group,
                  visibleCategories: isUsedOnly
                    ? group.categories.filter((category) => category.transactionCount > 0 || category.amount > 0)
                    : group.categories,
                }))
                .filter((group) => group.visibleCategories.length > 0);
              const personGroupIds = personSection.groups.map((group) => group.id);
              const areAllGroupsExpanded =
                personGroupIds.length > 0 &&
                personGroupIds.every((groupId) => expandedCategoryGroupKeys.has(`${personSection.id}:${groupId}`));

              return (
                <article key={personSection.id} className="dashboard-category-person-panel" style={getMotionStyle(index + 2)}>
                  <div className="dashboard-category-person-head">
                    <div className="dashboard-category-person-copy">
                      <span className="dashboard-category-person-kicker">{personSection.isUnassigned ? "사용자 연결 필요" : "사용자별 흐름"}</span>
                      <div className="dashboard-category-person-name-row">
                        <h3>{personSection.name}</h3>
                      </div>
                      <p>
                        {personSection.transactionCount
                          ? `실지출 ${personSection.transactionCount}건 · 사용 카테고리 ${personSection.usedCategoryCount}개 / 전체 ${personSection.totalCategoryCount}개`
                          : "선택한 기준 실지출이 아직 없습니다."}
                      </p>
                    </div>
                    <div className="dashboard-category-person-side">
                      <div className="dashboard-category-person-total">{formatCurrency(personSection.totalAmount)}</div>
                      <div className="dashboard-category-person-tools">
                        <button
                          type="button"
                          className={`dashboard-person-tool-button${!isUsedOnly ? " is-active" : ""}`}
                          onClick={() => toggleCategoryVisibilityMode(personSection.id)}
                        >
                          {isUsedOnly ? "전체 보기" : "사용한 것만"}
                        </button>
                        <button
                          type="button"
                          className={`dashboard-person-tool-button${areAllGroupsExpanded ? " is-active" : ""}`}
                          onClick={() => toggleAllCategoryGroups(personSection.id, personGroupIds)}
                          disabled={!personGroupIds.length}
                        >
                          {areAllGroupsExpanded ? "모두 접기" : "모두 펼치기"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {visibleGroups.length ? (
                    <div className="dashboard-category-group-stack">
                      {visibleGroups.map((group) => {
                      const groupKey = `${personSection.id}:${group.id}`;
                      const isExpanded = expandedCategoryGroupKeys.has(groupKey);

                      return (
                        <BoardCaseSection
                          key={`${personSection.id}-${group.id}`}
                          title={
                            <div className="dashboard-category-group-title">
                              <h3>{group.name}</h3>
                              <span className="dashboard-category-group-total">{formatCurrency(group.amount)}</span>
                            </div>
                          }
                          meta={`카테고리 ${group.visibleCategories.length}개 · 거래 ${group.transactionCount}건`}
                          action={
                            <button
                              type="button"
                              className={`dashboard-group-toggle-button${isExpanded ? " is-expanded" : ""}`}
                              onClick={() => toggleCategoryGroup(groupKey)}
                              aria-expanded={isExpanded}
                              aria-label={`${group.name} ${isExpanded ? "접기" : "펼치기"}`}
                            >
                              {isExpanded ? "▴" : "▾"}
                            </button>
                          }
                          className="category-case-section dashboard-category-group-section"
                        >
                          <div
                            className={`dashboard-category-group-collapse${isExpanded ? " is-expanded" : ""}`}
                            aria-hidden={!isExpanded}
                          >
                            <div className="dashboard-category-group-collapse-inner">
                              <div className="category-case-grid dashboard-category-group-grid">
                                {group.visibleCategories.map((category) => (
                                  <article
                                    key={category.id}
                                    className={`category-case-card dashboard-category-card${category.transactionCount > 0 ? " is-clickable" : ""}`}
                                    role={category.transactionCount > 0 ? "button" : undefined}
                                    tabIndex={category.transactionCount > 0 ? 0 : undefined}
                                    onClick={
                                      category.transactionCount > 0
                                        ? () => openCategoryUsageModal(personSection.id, personSection.name, category.id, category.name)
                                        : undefined
                                    }
                                    onKeyDown={
                                      category.transactionCount > 0
                                        ? (event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            openCategoryUsageModal(personSection.id, personSection.name, category.id, category.name);
                                          }
                                        : undefined
                                    }
                                  >
                                    <div className="category-case-card-copy dashboard-category-card-copy">
                                      <strong>{category.name}</strong>
                                      <span>{category.fixedOrVariable === "fixed" ? "고정 지출" : "변동 지출"}</span>
                                    </div>
                                    <div className="dashboard-category-card-footer">
                                      <strong className="dashboard-category-card-amount">{formatCurrency(category.amount)}</strong>
                                      <div className="dashboard-category-card-badges">
                                        <span
                                          className={`dashboard-category-card-chip${category.fixedOrVariable === "fixed" ? " is-fixed" : ""}`}
                                        >
                                          {category.fixedOrVariable === "fixed" ? "고정" : "변동"}
                                        </span>
                                        <span className="dashboard-category-card-count">{category.transactionCount}건</span>
                                      </div>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </div>
                          </div>
                        </BoardCaseSection>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="dashboard-category-person-empty">
                      {isUsedOnly
                        ? "사용한 카테고리만 보기 기준으로 보여줄 항목이 아직 없습니다."
                        : "사용자 기준으로 잡힌 실지출이 아직 없어서 카테고리 카드가 비어 있습니다."}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <EmptyStateCallout
              kicker="사용자 기준 준비"
              title="먼저 사용자 연결부터 맞춰 주세요"
              description="사용자별 카테고리 사용내역은 거래에 사용자 정보가 연결되어 있어야 정확하게 나뉩니다."
              actions={
                <Link to="/connections/assets" className="btn btn-outline-primary btn-sm">
                  사용자 관리
                </Link>
              }
            />
          )}
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(2)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">카드 흐름</span>
            <h2 className="section-title">카드별 사용내역</h2>
          </div>
          {renderScopeSelect("카드별 사용내역")}
        </div>
        <p className="mb-0 text-secondary">선택한 기준의 카드 결제 실지출을 기준으로 사용자별 카드 사용내역을 보여줍니다.</p>

        <div className="dashboard-category-person-stack">
          {personCardUsage.length ? (
            personCardUsage.map((personSection, index) => (
              <article key={personSection.id} className="dashboard-category-person-panel" style={getMotionStyle(index + 2)}>
                <div className="dashboard-category-person-head">
                  <div className="dashboard-category-person-copy">
                    <span className="dashboard-category-person-kicker">{personSection.isUnassigned ? "사용자 연결 필요" : "사용자별 흐름"}</span>
                    <h3>{personSection.name}</h3>
                    <p>
                      {personSection.transactionCount
                        ? `카드 실지출 ${personSection.transactionCount}건 · 사용 카드 ${personSection.usedCardCount}개 / 전체 ${personSection.totalCardCount}개`
                        : "선택한 기준에 카드 실지출이 아직 없습니다."}
                    </p>
                  </div>
                  <div className="dashboard-category-person-total">{formatCurrency(personSection.totalAmount)}</div>
                </div>

                {personSection.cards.length ? (
                  <div className="category-case-grid dashboard-card-usage-grid">
                    {personSection.cards.map((card) => (
                      <article
                        key={card.id}
                        className={`category-case-card dashboard-card-usage-card${card.transactionCount > 0 ? "" : " is-idle"}`}
                      >
                        <div className="category-case-card-copy dashboard-card-usage-copy">
                          <strong>{card.name}</strong>
                          <span>{`${card.issuerName}${card.cardNumberMasked ? ` (${card.cardNumberMasked})` : ""}`}</span>
                          <span className="dashboard-card-usage-linked-account">
                            {card.linkedAccountPrefix ? `${card.linkedAccountPrefix} · ` : ""}
                            {card.linkedAccountName}
                          </span>
                        </div>
                        <div className="dashboard-category-card-footer">
                          <strong className="dashboard-category-card-amount">{formatCurrency(card.amount)}</strong>
                          <div className="dashboard-category-card-badges">
                            <span className="dashboard-card-usage-chip">{card.cardTypeLabel}</span>
                            <span className="dashboard-category-card-count">{card.transactionCount}건</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-category-person-empty">사용자 기준으로 잡힌 카드 결제가 아직 없어서 카드 사용내역이 비어 있습니다.</div>
                )}
              </article>
            ))
          ) : (
            <EmptyStateCallout
              kicker="카드 기준 준비"
              title="먼저 카드 연결부터 맞춰 주세요"
              description="사용자별 카드 사용내역은 카드가 등록되어 있거나 카드 결제가 사용자 정보와 함께 들어와 있어야 정확하게 나뉩니다."
              actions={
                <Link to="/connections/assets" className="btn btn-outline-primary btn-sm">
                  사용자 관리
                </Link>
              }
            />
          )}
        </div>
      </section>
        </>
      ) : null}

      {mode === "dashboard" ? (
        <>
      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="dashboard-summary">
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 조각</span>
            <h2 className="section-title">이번 달 조각 상태</h2>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <div className="stat-card-head">
              <span className="stat-label">이번 달 수입</span>
              <span className={`badge dashboard-stat-badge ${incomeDeltaBadge.className}`}>
                {incomeDeltaBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(currentMonthInsights.income)}</strong>
            <span
              className={`stat-delta${currentMonthIncomeDelta > 0 ? " is-up is-positive" : currentMonthIncomeDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(currentMonthIncomeDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <div className="stat-card-head">
              <span className="stat-label">이번 달 지출</span>
              <span className={`badge dashboard-stat-badge ${expenseDeltaBadge.className}`}>
                {expenseDeltaBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(currentMonthInsights.expense)}</strong>
            <span
              className={`stat-delta${currentMonthExpenseDelta > 0 ? " is-up is-negative" : currentMonthExpenseDelta < 0 ? " is-down is-positive" : ""}`}
            >
              {formatDeltaAmount(currentMonthExpenseDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <div className="stat-card-head">
              <span className="stat-label">잔액</span>
              <span className={`badge dashboard-stat-badge ${savingsDeltaBadge.className}`}>
                {savingsDeltaBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(currentMonthInsights.savings)}</strong>
            <span
              className={`stat-delta${currentMonthSavingsDelta > 0 ? " is-up is-positive" : currentMonthSavingsDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(currentMonthSavingsDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(4)}>
            <div className="stat-card-head">
              <span className="stat-label">검토 필요</span>
              <span className={`badge dashboard-stat-badge ${reviewBadge.className}`}>
                {reviewBadge.label}
              </span>
            </div>
            <strong>{currentMonthInsights.reviewCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(5)}>
            <div className="stat-card-head">
              <span className="stat-label">미분류</span>
              <span className={`badge dashboard-stat-badge ${uncategorizedBadge.className}`}>
                {uncategorizedBadge.label}
              </span>
            </div>
            <strong>{currentMonthInsights.uncategorizedCount}건</strong>
          </article>
        </div>

        <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
          <div className="review-summary-copy">
            <strong>
              {currentMonthInsights.isDiagnosisReady
                ? "이번 달 조각이 안정적으로 정리되어 있습니다"
                : "이번 달 조각을 더 정리해야 합니다"}
            </strong>
            <p className="mb-0 text-secondary">
              {currentMonthInsights.nextSteps.length
                ? currentMonthInsights.nextSteps[0]
                : "결제내역에서 이번 달 거래를 계속 정리할 수 있습니다."}
            </p>
          </div>
          <div className="dashboard-summary-action">
            <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
              결제내역 보기
            </Link>
          </div>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">이음 준비</span>
            <h2 className="section-title">이음 준비</h2>
          </div>
        </div>
        <div className="review-summary-panel mb-4">
          <div className="review-summary-copy">
            <strong>
              {foundationRemainingCount
                ? `아직 ${foundationRemainingCount}개의 연결 설정이 남아 있습니다`
                : "기본 연결 설정이 모두 준비되었습니다"}
            </strong>
            <p className="mb-0 text-secondary">
              {foundationRemainingCount ? "사용자, 계좌, 카드 연결만 먼저 맞추면 됩니다." : "이제 거래와 대시보드 흐름을 집중해서 보면 됩니다."}
            </p>
          </div>
          <Link to="/connections/assets" className="btn btn-outline-primary btn-sm">
            설정 이어가기
          </Link>
        </div>
        <div className="resource-grid foundation-resource-grid">
          <article className="resource-card" style={getMotionStyle(2)}>
            <h3>사용자</h3>
            <p className="mb-0 text-secondary">활성 {activePeopleCount}명 / 전체 {scope.people.length}명</p>
            <span className={`badge ${peopleSetupRemaining ? "text-bg-warning" : "text-bg-success"}`}>
              {peopleSetupRemaining ? "설정 필요" : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{peopleSetupRemaining ? "사용자 정보부터 정리해 주세요." : "사용자 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3">
              사용자 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(3)}>
            <h3>계좌</h3>
            <p className="mb-0 text-secondary">연결 완료 {ownedAccountCount}개 / 전체 {scope.accounts.length}개</p>
            <span className={`badge ${unmappedAccountCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedAccountCount ? `${unmappedAccountCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedAccountCount ? "소유자가 없는 계좌가 남아 있습니다." : "계좌 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3">
              계좌 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(4)}>
            <h3>카드</h3>
            <p className="mb-0 text-secondary">연결 완료 {linkedCardCount}개 / 전체 {scope.cards.length}개</p>
            <span className={`badge ${unmappedCardCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedCardCount ? `${unmappedCardCount}개 미연결` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedCardCount ? "카드 연결 정보가 덜 정리되었습니다." : "카드 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3">
              카드 관리
            </Link>
          </article>
        </div>
      </section>
      <section className="card shadow-sm" style={getMotionStyle(2)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 흐름</span>
            <h2 className="section-title">흐름 현황</h2>
          </div>
        </div>
        <div className="review-summary-panel">
          <div className="review-summary-copy">
            <strong>{settlementStatusTitle}</strong>
            <p className="mb-0 text-secondary">{settlementStatusDescription}</p>
          </div>
          <Link to="/settlements" className="btn btn-outline-secondary btn-sm">
            흐름 보기
          </Link>
        </div>
        <div className="resource-grid mt-4">
          <article className="resource-card" style={getMotionStyle(3)}>
            <h3>공동지출</h3>
            <p className="mb-0 text-secondary">이번 달 공동지출 거래 {currentMonthSettlementSummary.sharedTransactions.length}건</p>
          </article>
          <article className="resource-card" style={getMotionStyle(4)}>
            <h3>완료 기록</h3>
            <p className="mb-0 text-secondary">이번 달 흐름 완료 기록 {currentMonthSettlementHistory.length}건</p>
          </article>
          <article className="resource-card" style={getMotionStyle(5)}>
            <h3>추천 정리 금액</h3>
            <p className="mb-0 text-secondary">
              {suggestedSettlementAmount > 0 ? formatCurrency(suggestedSettlementAmount) : "추가 정리 없음"}
            </p>
          </article>
        </div>
      </section>
        </>
      ) : null}

      <AppModal
        open={Boolean(categoryUsageModal)}
        title={
          categoryUsageModal
            ? `${categoryUsageModal.personName} · ${categoryUsageModal.categoryName} 거래내역`
            : "카테고리 거래내역"
        }
        description={categoryUsageModal ? `${categoryUsageModalTransactions.length}건 거래` : undefined}
        onClose={() => setCategoryUsageModal(null)}
        dialogClassName="dashboard-category-usage-modal"
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setCategoryUsageModal(null)}>
              닫기
            </button>
            <button type="button" className="btn btn-primary" onClick={openCategoryUsageInTransactions}>
              결제내역에서 보기
            </button>
          </>
        }
      >
        {categoryUsageModalTransactions.length ? (
          <div className="table-responsive dashboard-category-usage-table-wrap">
            <table className="table align-middle transaction-grid-table">
              <colgroup>
                <col className="transaction-grid-col-date" />
                <col className="transaction-grid-col-merchant" />
                <col className="transaction-grid-col-original-amount" />
                <col className="transaction-grid-col-discount" />
                <col className="transaction-grid-col-paid-amount" />
                <col className="transaction-grid-col-owner" />
                <col className="transaction-grid-col-category" />
                <col className="transaction-grid-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>사용일</th>
                  <th>가맹점</th>
                  <th className="text-end">원금액</th>
                  <th className="text-end">할인</th>
                  <th className="text-end">결제금액</th>
                  <th>사용자</th>
                  <th>카테고리</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {categoryUsageModalTransactions.map((transaction, index) => (
                  <tr key={transaction.id} style={getMotionStyle(index)}>
                    <td>{transaction.occurredAt.slice(0, 10)}</td>
                    <td>
                      <TransactionRowHeader merchantName={transaction.merchantName} />
                    </td>
                    <td className="text-end transaction-amount-cell">
                      <strong>{formatCurrency(transaction.originalAmount ?? transaction.amount)}</strong>
                    </td>
                    <td className="text-end transaction-amount-cell">
                      <strong>{transaction.discountAmount ? formatCurrency(transaction.discountAmount) : "-"}</strong>
                    </td>
                    <td className="text-end transaction-amount-cell">
                      <strong>{formatCurrency(transaction.amount)}</strong>
                    </td>
                    <td>{getDashboardTransactionOwnerLabel(transaction)}</td>
                    <td>{getDashboardTransactionCategoryLabel(transaction)}</td>
                    <td>{transaction.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-0 text-secondary">해당 카테고리에 연결된 거래가 없습니다.</p>
        )}
      </AppModal>
    </div>
  );
}
