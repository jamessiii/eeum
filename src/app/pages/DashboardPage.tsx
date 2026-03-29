import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRef } from "react";
import { monthKey } from "../../shared/utils/date";
import type { Card, Category, ImportRecord, Person, Transaction } from "../../shared/types/models";
import { getWorkspaceInsights, type WorkspaceInsightBasis } from "../../domain/insights/workspaceInsights";
import { getMonthlySharedSettlementSummary, getSettlementBalanceSummary } from "../../domain/settlements/summary";
import { getExpenseImpactStats } from "../../domain/transactions/expenseImpactStats";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { completeGuideStepAction } from "../../domain/guidance/guideRuntime";
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

function getStatementImportIdsForMonth(
  imports: ImportRecord[],
  targetMonth: string,
) {
  return new Set(
    imports
      .filter((record) => {
        const statementMonth = record.statementMonth?.trim();
        if (statementMonth) return statementMonth === targetMonth;
        return record.importedAt.slice(0, 7) === targetMonth;
      })
      .map((record) => record.id),
  );
}

function formatDeltaAmount(amount: number) {
  if (amount === 0) return formatCurrency(0);
  return formatCurrency(Math.abs(amount));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatYearMonthShortLabel(value: string) {
  const [, month] = value.split("-");
  return `${Number(month)}월`;
}

function formatTenThousandUnit(value: number) {
  return `${Math.round(value / 10_000)}`;
}

function buildSvgLinePath(values: number[], width: number, height: number, maxValue: number) {
  if (!values.length) return "";
  const safeMax = Math.max(maxValue, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = Number((stepX * index).toFixed(2));
      const y = Number((height - (Math.max(value, 0) / safeMax) * height).toFixed(2));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildSvgAreaPath(values: number[], width: number, height: number, maxValue: number) {
  if (!values.length) return "";
  const linePath = buildSvgLinePath(values, width, height, maxValue);
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

function buildCenteredSvgLinePath(values: number[], width: number, height: number, maxValue: number) {
  if (!values.length) return "";
  const safeMax = Math.max(maxValue, 1);
  const slotWidth = width / values.length;

  return values
    .map((value, index) => {
      const x = Number((slotWidth * index + slotWidth / 2).toFixed(2));
      const y = Number((height - (Math.max(value, 0) / safeMax) * height).toFixed(2));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describePieSlice(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [`M ${centerX} ${centerY}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(
    " ",
  );
}

const CATEGORY_CHART_COLORS = [
  "#1fb6aa",
  "#4f7cff",
  "#ff8a3d",
  "#e75aa6",
  "#8b6df2",
  "#33b56f",
  "#e9aa22",
  "#12b9d6",
  "#e05a5a",
  "#92b929",
];

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

export function DashboardPage({ mode = "moon" }: { mode?: "dashboard" | "moon" | "sun" }) {
  const { state } = useAppState();
  const navigate = useNavigate();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentMonth = monthKey(new Date());
  const previousMonth = useMemo(() => getPreviousMonthKey(currentMonth), [currentMonth]);
  const currentMonthStatementImportIds = useMemo(
    () => getStatementImportIdsForMonth(scope.imports, currentMonth),
    [currentMonth, scope.imports],
  );
  const previousMonthStatementImportIds = useMemo(
    () => getStatementImportIdsForMonth(scope.imports, previousMonth),
    [previousMonth, scope.imports],
  );
  const currentMonthStatementImportCount = useMemo(
    () => currentMonthStatementImportIds.size,
    [currentMonthStatementImportIds],
  );
  const currentMonthStatementExpenseTotal = useMemo(
    () =>
      scope.transactions.reduce((sum, transaction) => {
        if (!transaction.importRecordId || !currentMonthStatementImportIds.has(transaction.importRecordId)) return sum;
        if (transaction.status !== "active" || transaction.transactionType !== "expense") return sum;
        return sum + transaction.amount;
      }, 0),
    [currentMonthStatementImportIds, scope.transactions],
  );
  const previousMonthStatementExpenseTotal = useMemo(
    () =>
      scope.transactions.reduce((sum, transaction) => {
        if (!transaction.importRecordId || !previousMonthStatementImportIds.has(transaction.importRecordId)) return sum;
        if (transaction.status !== "active" || transaction.transactionType !== "expense") return sum;
        return sum + transaction.amount;
      }, 0),
    [previousMonthStatementImportIds, scope.transactions],
  );
  const currentMonthStatementTransactions = useMemo(
    () =>
      scope.transactions.filter(
        (transaction) => Boolean(transaction.importRecordId && currentMonthStatementImportIds.has(transaction.importRecordId)),
      ),
    [currentMonthStatementImportIds, scope.transactions],
  );
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
  const [categoryChartMode, setCategoryChartMode] = useState<"bar" | "circle">("bar");
  const [activeCategorySliceName, setActiveCategorySliceName] = useState<string | null>(null);
  const [activeAnnualMonth, setActiveAnnualMonth] = useState<string | null>(null);
  const [isAnnualMonthTooltipFading, setIsAnnualMonthTooltipFading] = useState(false);
  const [activeAnnualTrendTooltip, setActiveAnnualTrendTooltip] = useState<{
    kind: "card" | "category";
    name: string;
    month: string;
    amount: number;
    totalAmount: number;
    peakAmount: number;
  } | null>(null);
  const [isAnnualTrendTooltipFading, setIsAnnualTrendTooltipFading] = useState(false);
  const annualMonthFadeTimerRef = useRef<number | null>(null);
  const annualMonthHideTimerRef = useRef<number | null>(null);
  const annualTrendFadeTimerRef = useRef<number | null>(null);
  const annualTrendHideTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (annualMonthFadeTimerRef.current) window.clearTimeout(annualMonthFadeTimerRef.current);
      if (annualMonthHideTimerRef.current) window.clearTimeout(annualMonthHideTimerRef.current);
      if (annualTrendFadeTimerRef.current) window.clearTimeout(annualTrendFadeTimerRef.current);
      if (annualTrendHideTimerRef.current) window.clearTimeout(annualTrendHideTimerRef.current);
    };
  }, []);

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
  const selectedDashboardImportCount = useMemo(() => {
    if (selectedDashboardBasis === "statement") {
      const selectedStatement = statementScopeOptions.find((option) => option.value === selectedDashboardStatement);
      return selectedStatement?.importRecordIds.size ?? 0;
    }

    return getStatementImportIdsForMonth(scope.imports, selectedDashboardMonth).size;
  }, [scope.imports, selectedDashboardBasis, selectedDashboardMonth, selectedDashboardStatement, statementScopeOptions]);
  const selectedDashboardExpenseTransactions = useMemo(
    () => getExpenseImpactStats(selectedDashboardTransactions).activeExpenseTransactions,
    [selectedDashboardTransactions],
  );
  const selectedDashboardExpenseTotal = useMemo(
    () => selectedDashboardExpenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [selectedDashboardExpenseTransactions],
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
  const previousMonthTransactions = useMemo(
    () => scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === previousMonth),
    [previousMonth, scope.transactions],
  );
  const currentMonthIncomeEntries = useMemo(
    () => scope.incomeEntries.filter((entry) => monthKey(entry.occurredAt) === currentMonth),
    [currentMonth, scope.incomeEntries],
  );
  const currentMonthIncomeMissing = currentMonthIncomeEntries.length === 0;
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
  const currentMonthStatementInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "statement",
    label: formatStatementMonthLabel(currentMonth),
    transactions: currentMonthStatementTransactions,
    incomeEntries: currentMonthIncomeEntries,
  });
  const previousMonthInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "month",
    label: formatMonthLabel(previousMonth),
    transactions: previousMonthTransactions,
    incomeEntries: previousMonthIncomeEntries,
  });
  const previousDashboardScopeMonth = useMemo(() => {
    if (selectedDashboardBasis === "statement") {
      if (!selectedDashboardStatement || selectedDashboardStatement === UNSPECIFIED_STATEMENT_KEY) return "";
      return getPreviousMonthKey(selectedDashboardStatement);
    }

    return getPreviousMonthKey(selectedDashboardMonth);
  }, [selectedDashboardBasis, selectedDashboardMonth, selectedDashboardStatement]);
  const previousDashboardTransactions = useMemo(() => {
    if (!previousDashboardScopeMonth) return [];

    if (selectedDashboardBasis === "statement") {
      const previousStatementImportIds = getStatementImportIdsForMonth(scope.imports, previousDashboardScopeMonth);
      return scope.transactions.filter(
        (transaction) => Boolean(transaction.importRecordId && previousStatementImportIds.has(transaction.importRecordId)),
      );
    }

    return scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === previousDashboardScopeMonth);
  }, [previousDashboardScopeMonth, scope.imports, scope.transactions, selectedDashboardBasis]);
  const previousDashboardIncomeEntries = useMemo(() => {
    if (!previousDashboardScopeMonth) return [];
    return scope.incomeEntries.filter((entry) => monthKey(entry.occurredAt) === previousDashboardScopeMonth);
  }, [previousDashboardScopeMonth, scope.incomeEntries]);
  const previousDashboardInsights = getWorkspaceInsights(state, workspaceId, {
    basis: selectedDashboardBasis,
    label:
      selectedDashboardBasis === "statement"
        ? formatStatementMonthLabel(previousDashboardScopeMonth || selectedDashboardScopeValue)
        : formatMonthLabel(previousDashboardScopeMonth || selectedDashboardScopeValue),
    transactions: previousDashboardTransactions,
    incomeEntries: previousDashboardIncomeEntries,
  });
  const previousDashboardExpenseTotal = useMemo(
    () =>
      getExpenseImpactStats(previousDashboardTransactions).activeExpenseTransactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
    [previousDashboardTransactions],
  );
  const selectedDashboardBalance = insights.income - selectedDashboardExpenseTotal;
  const previousDashboardBalance = previousDashboardInsights.income - previousDashboardExpenseTotal;
  const selectedDashboardIncomeDelta = insights.income - previousDashboardInsights.income;
  const selectedDashboardExpenseDelta = selectedDashboardExpenseTotal - previousDashboardExpenseTotal;
  const selectedDashboardSavingsDelta = selectedDashboardBalance - previousDashboardBalance;
  const selectedDashboardIncomeBadge = getDeltaBadge(selectedDashboardIncomeDelta, true);
  const selectedDashboardExpenseBadge = getDeltaBadge(selectedDashboardExpenseDelta, false);
  const selectedDashboardSavingsBadge = getDeltaBadge(selectedDashboardSavingsDelta, true);
  const selectedDashboardReviewBadge = getCompletionBadge(insights.reviewCount);
  const selectedDashboardUncategorizedBadge = getCompletionBadge(insights.uncategorizedCount);
  const currentMonthIncomeDelta = currentMonthInsights.income - previousMonthInsights.income;
  const currentMonthExpenseDelta = currentMonthStatementExpenseTotal - previousMonthStatementExpenseTotal;
  const currentMonthStatementBalance = currentMonthInsights.income - currentMonthStatementExpenseTotal;
  const previousMonthStatementBalance = previousMonthInsights.income - previousMonthStatementExpenseTotal;
  const currentMonthSavingsDelta = currentMonthStatementBalance - previousMonthStatementBalance;
  const incomeDeltaBadge = getDeltaBadge(currentMonthIncomeDelta, true);
  const expenseDeltaBadge = getDeltaBadge(currentMonthExpenseDelta, false);
  const savingsDeltaBadge = getDeltaBadge(currentMonthSavingsDelta, true);
  const reviewBadge = getCompletionBadge(currentMonthStatementInsights.reviewCount);
  const uncategorizedBadge = getCompletionBadge(currentMonthStatementInsights.uncategorizedCount);
  const currentMonthStatementMissing = currentMonthStatementImportCount === 0;
  const currentMonthReviewPending = currentMonthStatementInsights.reviewCount > 0;
  const currentMonthUncategorizedPending = currentMonthStatementInsights.uncategorizedCount > 0;
  const dominantCategory = insights.topCategories[0] ?? null;
  const dominantCategoryShare =
    dominantCategory && insights.expense > 0 ? Math.round((dominantCategory.amount / insights.expense) * 100) : null;
  const dominantSource = insights.sourceBreakdown[0] ?? null;
  const selectedDashboardIncomeBase = Math.max(insights.income, selectedDashboardExpenseTotal, selectedDashboardBalance, 1);
  const selectedDashboardExpenseBar = clampPercent((selectedDashboardExpenseTotal / selectedDashboardIncomeBase) * 100);
  const selectedDashboardSavingsBar = clampPercent((Math.max(selectedDashboardBalance, 0) / selectedDashboardIncomeBase) * 100);
  const selectedDashboardCardBars = useMemo(() => {
    const cardNameMap = new Map(scope.cards.map((card) => [card.id, card.name]));
    const cardTotals = new Map<string, { name: string; amount: number; count: number }>();

    selectedDashboardExpenseTransactions.forEach((transaction) => {
      const cardKey = transaction.cardId ?? "__uncategorized_card__";
      const current = cardTotals.get(cardKey) ?? {
        name: transaction.cardId ? cardNameMap.get(transaction.cardId) ?? "이름 없는 카드" : "미지정 카드",
        amount: 0,
        count: 0,
      };

      current.amount += transaction.amount;
      current.count += 1;
      cardTotals.set(cardKey, current);
    });

    return [...cardTotals.values()]
      .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "ko"))
      .map((item) => ({
        ...item,
        share: clampPercent((item.amount / Math.max(selectedDashboardExpenseTotal, 1)) * 100),
      }));
  }, [scope.cards, selectedDashboardExpenseTotal, selectedDashboardExpenseTransactions]);
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
  const selectedDashboardCategoryColumns = useMemo(() => {
    const totals = new Map<string, number>();

    selectedDashboardExpenseTransactions.forEach((transaction) => {
      const categoryName = transaction.categoryId ? categoryNameMap.get(transaction.categoryId) ?? "미분류" : "미분류";
      totals.set(categoryName, (totals.get(categoryName) ?? 0) + transaction.amount);
    });

    const maxAmount = Math.max(...totals.values(), 1);

    return [...totals.entries()]
      .map(([categoryName, amount]) => ({
        categoryName,
        amount,
        share: clampPercent((amount / maxAmount) * 100),
      }))
      .sort((left, right) => right.amount - left.amount || left.categoryName.localeCompare(right.categoryName, "ko"));
  }, [categoryNameMap, selectedDashboardExpenseTransactions]);
  const selectedDashboardCategorySlices = useMemo(() => {
    const totalAmount = Math.max(
      selectedDashboardCategoryColumns.reduce((sum, item) => sum + item.amount, 0),
      1,
    );
    let currentPercent = 0;

    const segments = selectedDashboardCategoryColumns.map((item, index) => {
      const ratio = clampPercent((item.amount / totalAmount) * 100);
      const offsetPercent = currentPercent;
      currentPercent += ratio;

      return {
        ...item,
        ratio,
        color: CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length],
        offsetPercent,
        startAngle: offsetPercent * 3.6,
        endAngle: (offsetPercent + ratio) * 3.6,
      };
    });

    return { segments, topSegments: segments.slice(0, 3), totalAmount };
  }, [selectedDashboardCategoryColumns]);
  const activeCategorySlice =
    selectedDashboardCategorySlices.segments.find((segment) => segment.categoryName === activeCategorySliceName) ?? null;
  const annualMonthOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...scope.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)),
            ...scope.incomeEntries.map((entry) => entry.occurredAt.slice(0, 7)),
          ].filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [scope.incomeEntries, scope.transactions],
  );
  const annualYearOptions = useMemo(
    () => Array.from(new Set(annualMonthOptions.map((month) => month.slice(0, 4)))).sort((left, right) => right.localeCompare(left)),
    [annualMonthOptions],
  );
  const [selectedAnnualYear, setSelectedAnnualYear] = useState(() => annualYearOptions[0] ?? String(new Date().getFullYear()));

  useEffect(() => {
    const nextYear = annualYearOptions.includes(selectedAnnualYear) ? selectedAnnualYear : annualYearOptions[0] ?? String(new Date().getFullYear());
    if (nextYear !== selectedAnnualYear) {
      setSelectedAnnualYear(nextYear);
    }
  }, [annualYearOptions, selectedAnnualYear]);

  const annualMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => `${selectedAnnualYear}-${String(index + 1).padStart(2, "0")}`),
    [selectedAnnualYear],
  );
  const annualExpenseTransactions = useMemo(
    () => getExpenseImpactStats(scope.transactions).activeExpenseTransactions.filter((transaction) => transaction.occurredAt.startsWith(selectedAnnualYear)),
    [scope.transactions, selectedAnnualYear],
  );
  const annualIncomeEntries = useMemo(
    () => scope.incomeEntries.filter((entry) => entry.occurredAt.startsWith(selectedAnnualYear)),
    [scope.incomeEntries, selectedAnnualYear],
  );
  const annualIncomeSeries = useMemo(
    () =>
      annualMonths.map((month) =>
        annualIncomeEntries.reduce((sum, entry) => (monthKey(entry.occurredAt) === month ? sum + entry.amount : sum), 0),
      ),
    [annualIncomeEntries, annualMonths],
  );
  const annualExpenseSeries = useMemo(
    () =>
      annualMonths.map((month) =>
        annualExpenseTransactions.reduce(
          (sum, transaction) => (monthKey(transaction.occurredAt) === month ? sum + Math.abs(transaction.amount) : sum),
          0,
        ),
      ),
    [annualExpenseTransactions, annualMonths],
  );
  const annualMonthlyFlowRows = useMemo(
    () =>
      annualMonths.map((month, index) => ({
        month,
        income: annualIncomeSeries[index] ?? 0,
        expense: annualExpenseSeries[index] ?? 0,
        balance: (annualIncomeSeries[index] ?? 0) - (annualExpenseSeries[index] ?? 0),
      })),
    [annualExpenseSeries, annualIncomeSeries, annualMonths],
  );
  const annualIncomeTotal = useMemo(
    () => annualIncomeSeries.reduce((sum, value) => sum + value, 0),
    [annualIncomeSeries],
  );
  const annualExpenseTotal = useMemo(
    () => annualExpenseSeries.reduce((sum, value) => sum + value, 0),
    [annualExpenseSeries],
  );
  const annualIncomeAverage = annualIncomeTotal / Math.max(annualMonths.length, 1);
  const annualExpenseAverage = annualExpenseTotal / Math.max(annualMonths.length, 1);
  const annualPeakIncomeMonth = useMemo(
    () => annualMonthlyFlowRows.reduce((best, row) => (row.income > best.income ? row : best), annualMonthlyFlowRows[0] ?? { month: `${selectedAnnualYear}-01`, income: 0, expense: 0, balance: 0 }),
    [annualMonthlyFlowRows, selectedAnnualYear],
  );
  const annualPeakExpenseMonth = useMemo(
    () => annualMonthlyFlowRows.reduce((best, row) => (row.expense > best.expense ? row : best), annualMonthlyFlowRows[0] ?? { month: `${selectedAnnualYear}-01`, income: 0, expense: 0, balance: 0 }),
    [annualMonthlyFlowRows, selectedAnnualYear],
  );
  const activeAnnualFlowRow = annualMonthlyFlowRows.find((row) => row.month === activeAnnualMonth) ?? null;
  const annualFlowMax = useMemo(() => Math.max(...annualIncomeSeries, ...annualExpenseSeries, 1), [annualExpenseSeries, annualIncomeSeries]);
  const annualYAxisTicks = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => {
        const ratio = (4 - index) / 4;
        const value = annualFlowMax * ratio;
        return {
          value,
          label: formatTenThousandUnit(value),
        };
      }),
    [annualFlowMax],
  );
  const annualLineChartWidth = 760;
  const annualLineChartHeight = 240;
  const annualMonthSlotWidth = annualLineChartWidth / Math.max(annualMonths.length, 1);
  const annualIncomeLinePath = useMemo(
    () => buildCenteredSvgLinePath(annualIncomeSeries, annualLineChartWidth, annualLineChartHeight, annualFlowMax),
    [annualFlowMax, annualIncomeSeries],
  );
  const annualExpenseLinePath = useMemo(
    () => buildCenteredSvgLinePath(annualExpenseSeries, annualLineChartWidth, annualLineChartHeight, annualFlowMax),
    [annualExpenseSeries, annualFlowMax],
  );
  const annualCardTrends = useMemo(() => {
    const cardNameMap = new Map(scope.cards.map((card) => [card.id, card.name]));
    const cardSeries = new Map<string, number[]>();

    annualExpenseTransactions.forEach((transaction) => {
      const cardName = transaction.cardId ? cardNameMap.get(transaction.cardId) ?? "이름 없는 카드" : "미지정 카드";
      const monthIndex = annualMonths.indexOf(monthKey(transaction.occurredAt));
      if (monthIndex < 0) return;
      const series = cardSeries.get(cardName) ?? Array.from({ length: annualMonths.length }, () => 0);
      series[monthIndex] += Math.abs(transaction.amount);
      cardSeries.set(cardName, series);
    });

    return [...cardSeries.entries()]
      .map(([name, values]) => ({
        name,
        values,
        totalAmount: values.reduce((sum, value) => sum + value, 0),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount || left.name.localeCompare(right.name, "ko"))
      .slice(0, 6);
  }, [annualExpenseTransactions, annualMonths, scope.cards]);
  const annualCategoryTrends = useMemo(() => {
    const categoryMap = new Map(scope.categories.map((category) => [category.id, category.name]));
    const categorySeries = new Map<string, number[]>();

    annualExpenseTransactions.forEach((transaction) => {
      const categoryName = transaction.categoryId ? categoryMap.get(transaction.categoryId) ?? "알 수 없는 카테고리" : "미분류";
      const monthIndex = annualMonths.indexOf(monthKey(transaction.occurredAt));
      if (monthIndex < 0) return;
      const series = categorySeries.get(categoryName) ?? Array.from({ length: annualMonths.length }, () => 0);
      series[monthIndex] += Math.abs(transaction.amount);
      categorySeries.set(categoryName, series);
    });

    return [...categorySeries.entries()]
      .map(([name, values]) => ({
        name,
        values,
        totalAmount: values.reduce((sum, value) => sum + value, 0),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount || left.name.localeCompare(right.name, "ko"))
      .slice(0, 8);
  }, [annualExpenseTransactions, annualMonths, scope.categories]);
  const annualTrendSparkMax = useMemo(
    () =>
      Math.max(
        1,
        ...annualCardTrends.flatMap((item) => item.values),
        ...annualCategoryTrends.flatMap((item) => item.values),
      ),
    [annualCardTrends, annualCategoryTrends],
  );
  const showAnnualMonthTooltip = (month: string) => {
    if (annualMonthFadeTimerRef.current) window.clearTimeout(annualMonthFadeTimerRef.current);
    if (annualMonthHideTimerRef.current) window.clearTimeout(annualMonthHideTimerRef.current);
    setIsAnnualMonthTooltipFading(false);
    setActiveAnnualMonth(month);
  };
  const hideAnnualMonthTooltip = () => {
    if (!activeAnnualMonth) return;
    if (annualMonthFadeTimerRef.current) window.clearTimeout(annualMonthFadeTimerRef.current);
    if (annualMonthHideTimerRef.current) window.clearTimeout(annualMonthHideTimerRef.current);
    annualMonthFadeTimerRef.current = window.setTimeout(() => setIsAnnualMonthTooltipFading(true), 800);
    annualMonthHideTimerRef.current = window.setTimeout(() => {
      setActiveAnnualMonth(null);
      setIsAnnualMonthTooltipFading(false);
    }, 1000);
  };
  const showAnnualTrendTooltip = (tooltip: {
    kind: "card" | "category";
    name: string;
    month: string;
    amount: number;
    totalAmount: number;
    peakAmount: number;
  }) => {
    if (annualTrendFadeTimerRef.current) window.clearTimeout(annualTrendFadeTimerRef.current);
    if (annualTrendHideTimerRef.current) window.clearTimeout(annualTrendHideTimerRef.current);
    setIsAnnualTrendTooltipFading(false);
    setActiveAnnualTrendTooltip(tooltip);
  };
  const hideAnnualTrendTooltip = () => {
    if (!activeAnnualTrendTooltip) return;
    if (annualTrendFadeTimerRef.current) window.clearTimeout(annualTrendFadeTimerRef.current);
    if (annualTrendHideTimerRef.current) window.clearTimeout(annualTrendHideTimerRef.current);
    annualTrendFadeTimerRef.current = window.setTimeout(() => setIsAnnualTrendTooltipFading(true), 800);
    annualTrendHideTimerRef.current = window.setTimeout(() => {
      setActiveAnnualTrendTooltip(null);
      setIsAnnualTrendTooltipFading(false);
    }, 1000);
  };
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

  if (mode === "sun") {
    return (
      <div className="page-stack">
        <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="records-sun-overview">
          <div className="section-head">
            <div>
              <span className="section-kicker">해 기록 통계</span>
              <h2 className="section-title">연간 흐름 그래프</h2>
            </div>
            <div className="dashboard-section-toolbar">
              <select
                className="form-select dashboard-section-month-select"
                value={selectedAnnualYear}
                onChange={(event) => setSelectedAnnualYear(event.target.value)}
                aria-label="해 기록 연도 선택"
              >
                {annualYearOptions.length ? (
                  annualYearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))
                ) : (
                  <option value={selectedAnnualYear}>{selectedAnnualYear}년</option>
                )}
              </select>
            </div>
          </div>

          <div className="dashboard-year-grid">
            <article className="dashboard-year-card dashboard-year-card--wide" style={getMotionStyle(1)} data-guide-target="records-sun-annual-chart">
              <div className="dashboard-visual-card-head">
                <div>
                  <span className="stat-label">연간 수입 대비 소비</span>
                  <h3>{selectedAnnualYear}년 변화 흐름</h3>
                </div>
                <strong>{formatCurrency(annualIncomeTotal)}</strong>
              </div>

              <div className="dashboard-year-summary-grid">
                <article className="dashboard-year-summary-card">
                  <span className="stat-label">연 수입</span>
                  <strong>{formatCurrency(annualIncomeTotal)}</strong>
                  <span>월평균 {formatCurrency(annualIncomeAverage)}</span>
                </article>
                <article className="dashboard-year-summary-card">
                  <span className="stat-label">연 소비</span>
                  <strong>{formatCurrency(annualExpenseTotal)}</strong>
                  <span>월평균 {formatCurrency(annualExpenseAverage)}</span>
                </article>
                <article className="dashboard-year-summary-card">
                  <span className="stat-label">수입 최고 월</span>
                  <strong>{formatYearMonthShortLabel(annualPeakIncomeMonth.month)}</strong>
                  <span>{formatCurrency(annualPeakIncomeMonth.income)}</span>
                </article>
                <article className="dashboard-year-summary-card">
                  <span className="stat-label">소비 최고 월</span>
                  <strong>{formatYearMonthShortLabel(annualPeakExpenseMonth.month)}</strong>
                  <span>{formatCurrency(annualPeakExpenseMonth.expense)}</span>
                </article>
              </div>

              <div className="dashboard-year-chart-frame">
                <div className="dashboard-year-y-axis" aria-label="Y축 눈금">
                  <span className="dashboard-year-y-axis-unit">만원</span>
                  {annualYAxisTicks.map((tick) => (
                    <span key={tick.label}>{tick.label}</span>
                  ))}
                </div>
                <div className="dashboard-year-line-chart">
                  <svg viewBox={`0 0 ${annualLineChartWidth} ${annualLineChartHeight}`} preserveAspectRatio="none" aria-label="연간 수입과 소비 변화 그래프">
                  {annualMonths.map((month, index) => {
                    const x = annualMonthSlotWidth * index + annualMonthSlotWidth / 2;
                    return <line key={month} x1={x} y1={0} x2={x} y2={annualLineChartHeight} className="dashboard-year-grid-line" />;
                  })}
                  {annualMonthlyFlowRows.map((row, index) => {
                    const centerX = annualMonthSlotWidth * index + annualMonthSlotWidth / 2;
                    const columnWidth = Math.min(24, annualMonthSlotWidth * 0.28);
                    const incomeHeight = Math.max(0, (row.income / annualFlowMax) * annualLineChartHeight);
                    const expenseHeight = Math.max(0, (row.expense / annualFlowMax) * annualLineChartHeight);
                    return (
                      <g key={row.month}>
                        <rect
                          x={centerX - columnWidth - 2}
                          y={annualLineChartHeight - incomeHeight}
                          width={columnWidth}
                          height={incomeHeight}
                          rx={6}
                          className="dashboard-year-bar dashboard-year-bar--income"
                        />
                        <rect
                          x={centerX + 2}
                          y={annualLineChartHeight - expenseHeight}
                          width={columnWidth}
                          height={expenseHeight}
                          rx={6}
                          className="dashboard-year-bar dashboard-year-bar--expense"
                        />
                      </g>
                    );
                  })}
                  <path d={annualIncomeLinePath} className="dashboard-year-line dashboard-year-line--income" />
                  <path d={annualExpenseLinePath} className="dashboard-year-line dashboard-year-line--expense" />
                  {annualMonthlyFlowRows.map((row, index) => {
                    const centerX = annualMonthSlotWidth * index + annualMonthSlotWidth / 2;
                    return (
                      <rect
                        key={`${row.month}-hover`}
                        x={centerX - annualMonthSlotWidth / 2}
                        y={0}
                        width={annualMonthSlotWidth}
                        height={annualLineChartHeight}
                        className="dashboard-year-hover-zone"
                        onMouseEnter={() => showAnnualMonthTooltip(row.month)}
                        onMouseLeave={hideAnnualMonthTooltip}
                      />
                    );
                  })}
                  </svg>
                  {activeAnnualFlowRow ? (
                    <div className={`dashboard-chart-tooltip dashboard-chart-tooltip--year${isAnnualMonthTooltipFading ? " is-fading" : ""}`}>
                      <span className="stat-label">{formatMonthLabel(activeAnnualFlowRow.month)}</span>
                      <strong>{formatCurrency(activeAnnualFlowRow.income)}</strong>
                      <span>수입</span>
                      <strong>{formatCurrency(activeAnnualFlowRow.expense)}</strong>
                      <span>소비</span>
                      <span className={activeAnnualFlowRow.balance >= 0 ? "is-positive" : "is-negative"}>
                        차이 {formatCurrency(Math.abs(activeAnnualFlowRow.balance))} {activeAnnualFlowRow.balance >= 0 ? "흑자" : "적자"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="dashboard-year-axis dashboard-year-axis--main">
                <span className="dashboard-year-axis-spacer" aria-hidden="true" />
                <div className="dashboard-year-axis-months">
                  {annualMonths.map((month) => (
                    <span key={month}>{formatYearMonthShortLabel(month)}</span>
                  ))}
                </div>
              </div>

              <div className="dashboard-balance-legend">
                <span><i className="dashboard-dot dashboard-dot--income" />수입 {formatCurrency(annualIncomeTotal)}</span>
                <span><i className="dashboard-dot dashboard-dot--expense" />소비 {formatCurrency(annualExpenseTotal)}</span>
              </div>

              <div className="dashboard-year-month-grid">
                {annualMonthlyFlowRows.map((row) => (
                  <article key={row.month} className="dashboard-year-month-card">
                    <strong>{formatYearMonthShortLabel(row.month)}</strong>
                    <span>수입 {formatCurrency(row.income)}</span>
                    <span>소비 {formatCurrency(row.expense)}</span>
                  </article>
                ))}
              </div>
            </article>

            <article className="dashboard-year-card" style={getMotionStyle(2)}>
              <div className="dashboard-visual-card-head">
                <div>
                  <span className="stat-label">카드별 사용량 변화</span>
                  <h3>어떤 카드가 어떻게 달라졌는지</h3>
                </div>
              </div>

              <div className="dashboard-year-trend-list">
                {annualCardTrends.length ? (
                  annualCardTrends.map((item, index) => (
                    <div key={item.name} className="dashboard-year-trend-row">
                      <div className="dashboard-year-trend-copy">
                        <span className="dashboard-year-trend-rank">{index + 1}</span>
                        <strong>{item.name}</strong>
                        <span>{formatCurrency(item.totalAmount)}</span>
                        <span>최고 {formatCurrency(Math.max(...item.values, 0))}</span>
                      </div>
                      <svg viewBox="0 0 360 54" preserveAspectRatio="none" className="dashboard-year-sparkline" aria-hidden="true">
                        <path d={buildSvgAreaPath(item.values, 360, 54, annualTrendSparkMax)} className="dashboard-year-spark-area dashboard-year-spark-area--card" />
                        <path d={buildSvgLinePath(item.values, 360, 54, annualTrendSparkMax)} className="dashboard-year-spark dashboard-year-spark--card" />
                        {item.values.map((value, valueIndex) => {
                          const stepX = item.values.length > 1 ? 360 / (item.values.length - 1) : 0;
                          const x = item.values.length > 1 ? stepX * valueIndex : 180;
                          return (
                            <rect
                              key={`${item.name}-${annualMonths[valueIndex]}`}
                              x={x - Math.max(12, stepX * 0.35)}
                              y={0}
                              width={Math.max(24, stepX * 0.7)}
                              height={54}
                              className="dashboard-year-hover-zone"
                              onMouseEnter={() =>
                                showAnnualTrendTooltip({
                                  kind: "card",
                                  name: item.name,
                                  month: annualMonths[valueIndex],
                                  amount: value,
                                  totalAmount: item.totalAmount,
                                  peakAmount: Math.max(...item.values, 0),
                                })
                              }
                              onMouseLeave={hideAnnualTrendTooltip}
                            />
                          );
                        })}
                      </svg>
                      {activeAnnualTrendTooltip?.kind === "card" && activeAnnualTrendTooltip.name === item.name ? (
                        <div className={`dashboard-chart-tooltip dashboard-chart-tooltip--spark${isAnnualTrendTooltipFading ? " is-fading" : ""}`}>
                          <span className="stat-label">{activeAnnualTrendTooltip.name}</span>
                          <strong>{formatMonthLabel(activeAnnualTrendTooltip.month)}</strong>
                          <span>해당 월 {formatCurrency(activeAnnualTrendTooltip.amount)}</span>
                          <span>연간 합계 {formatCurrency(activeAnnualTrendTooltip.totalAmount)}</span>
                          <span>최고 월 {formatCurrency(activeAnnualTrendTooltip.peakAmount)}</span>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="mb-0 text-secondary">아직 카드별 연간 사용 흐름이 없습니다.</p>
                )}
              </div>

              <div className="dashboard-year-axis dashboard-year-axis--compact">
                <span className="dashboard-year-axis-spacer" aria-hidden="true" />
                <div className="dashboard-year-axis-months">
                  {annualMonths.map((month) => (
                    <span key={month}>{formatYearMonthShortLabel(month)}</span>
                  ))}
                </div>
              </div>
            </article>

            <article className="dashboard-year-card dashboard-year-card--full" style={getMotionStyle(3)}>
              <div className="dashboard-visual-card-head">
                <div>
                  <span className="stat-label">카테고리별 사용량 변화</span>
                  <h3>카테고리 흐름을 한 해로 보기</h3>
                </div>
              </div>

              <div className="dashboard-year-trend-list">
                {annualCategoryTrends.length ? (
                  annualCategoryTrends.map((item) => (
                    <div key={item.name} className="dashboard-year-trend-row">
                      <div className="dashboard-year-trend-copy">
                        <strong>{item.name}</strong>
                        <span>{formatCurrency(item.totalAmount)}</span>
                        <span>최고 {formatCurrency(Math.max(...item.values, 0))}</span>
                      </div>
                      <svg viewBox="0 0 420 54" preserveAspectRatio="none" className="dashboard-year-sparkline" aria-hidden="true">
                        <path d={buildSvgAreaPath(item.values, 420, 54, annualTrendSparkMax)} className="dashboard-year-spark-area dashboard-year-spark-area--category" />
                        <path d={buildSvgLinePath(item.values, 420, 54, annualTrendSparkMax)} className="dashboard-year-spark dashboard-year-spark--category" />
                        {item.values.map((value, valueIndex) => {
                          const stepX = item.values.length > 1 ? 420 / (item.values.length - 1) : 0;
                          const x = item.values.length > 1 ? stepX * valueIndex : 210;
                          return (
                            <rect
                              key={`${item.name}-${annualMonths[valueIndex]}`}
                              x={x - Math.max(12, stepX * 0.35)}
                              y={0}
                              width={Math.max(24, stepX * 0.7)}
                              height={54}
                              className="dashboard-year-hover-zone"
                              onMouseEnter={() =>
                                showAnnualTrendTooltip({
                                  kind: "category",
                                  name: item.name,
                                  month: annualMonths[valueIndex],
                                  amount: value,
                                  totalAmount: item.totalAmount,
                                  peakAmount: Math.max(...item.values, 0),
                                })
                              }
                              onMouseLeave={hideAnnualTrendTooltip}
                            />
                          );
                        })}
                      </svg>
                      {activeAnnualTrendTooltip?.kind === "category" && activeAnnualTrendTooltip.name === item.name ? (
                        <div className={`dashboard-chart-tooltip dashboard-chart-tooltip--spark${isAnnualTrendTooltipFading ? " is-fading" : ""}`}>
                          <span className="stat-label">{activeAnnualTrendTooltip.name}</span>
                          <strong>{formatMonthLabel(activeAnnualTrendTooltip.month)}</strong>
                          <span>해당 월 {formatCurrency(activeAnnualTrendTooltip.amount)}</span>
                          <span>연간 합계 {formatCurrency(activeAnnualTrendTooltip.totalAmount)}</span>
                          <span>최고 월 {formatCurrency(activeAnnualTrendTooltip.peakAmount)}</span>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="mb-0 text-secondary">아직 카테고리별 연간 사용 흐름이 없습니다.</p>
                )}
              </div>

              <div className="dashboard-year-axis dashboard-year-axis--compact">
                <span className="dashboard-year-axis-spacer" aria-hidden="true" />
                <div className="dashboard-year-axis-months">
                  {annualMonths.map((month) => (
                    <span key={month}>{formatYearMonthShortLabel(month)}</span>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {mode === "moon" ? (
        <>
      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="records-moon-overview">
        <div className="section-head">
          <div>
            <span className="section-kicker">달 기록 통계</span>
            <h2 className="section-title">한눈에 보는 흐름 그래프</h2>
          </div>
          {renderScopeSelect("달 기록 통계")}
        </div>

        <div className="dashboard-visual-grid">
          <div className="dashboard-visual-stack">
            <article className="dashboard-visual-card dashboard-visual-card--hero" style={getMotionStyle(1)}>
              <div className="dashboard-visual-card-head">
                <div>
                  <span className="stat-label">수입 대비 흐름</span>
                  <h3>{selectedDashboardScopeLabel}</h3>
                </div>
                <strong>{formatCurrency(insights.income)}</strong>
              </div>
              <div className="dashboard-balance-bars">
                <div className="dashboard-balance-bar-track">
                  <div className="dashboard-balance-bar dashboard-balance-bar--expense" style={{ width: `${selectedDashboardExpenseBar}%` }} />
                  <div className="dashboard-balance-bar dashboard-balance-bar--savings" style={{ width: `${selectedDashboardSavingsBar}%` }} />
                </div>
                <div className="dashboard-balance-legend">
                  <span><i className="dashboard-dot dashboard-dot--expense" />소비 {formatCurrency(selectedDashboardExpenseTotal)}</span>
                  <span><i className="dashboard-dot dashboard-dot--savings" />저축 여력 {formatCurrency(Math.max(selectedDashboardBalance, 0))}</span>
                </div>
              </div>
            </article>

            <article className="dashboard-visual-card" style={getMotionStyle(3)}>
              <div className="dashboard-visual-card-head">
                <div>
                  <span className="stat-label">카드별 사용 비중</span>
                  <h3>어떤 카드로 썼는지</h3>
                </div>
              </div>
              <div className="dashboard-bar-list">
                {selectedDashboardCardBars.length ? (
                  selectedDashboardCardBars.map((item) => (
                    <div key={item.name} className="dashboard-bar-row">
                      <div className="dashboard-bar-meta">
                        <strong>{item.name}</strong>
                        <span>{item.count}건 · {formatCurrency(item.amount)}</span>
                      </div>
                      <div className="dashboard-bar-track">
                        <div className="dashboard-bar-fill dashboard-bar-fill--source" style={{ width: `${item.share}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="mb-0 text-secondary">아직 카드 사용 통계가 없습니다.</p>
                )}
              </div>
            </article>
          </div>

          <article className="dashboard-visual-card dashboard-visual-card--tall" style={getMotionStyle(2)}>
            <div className="dashboard-visual-card-head">
              <div>
                <span className="stat-label">카테고리별 소비</span>
                <h3>실제로 쓴 항목 전체</h3>
              </div>
              <div className="dashboard-chart-toggle" role="tablist" aria-label="카테고리 그래프 보기 방식" data-guide-target="records-moon-category-toggle">
                <button
                  type="button"
                  className={`dashboard-chart-toggle-button${categoryChartMode === "bar" ? " is-active" : ""}`}
                  onClick={() => {
                    setCategoryChartMode("bar");
                    completeGuideStepAction(workspaceId, "records-moon-category-toggle");
                  }}
                  aria-pressed={categoryChartMode === "bar"}
                >
                  막대
                </button>
                <button
                  type="button"
                  className={`dashboard-chart-toggle-button${categoryChartMode === "circle" ? " is-active" : ""}`}
                  onClick={() => {
                    setCategoryChartMode("circle");
                    completeGuideStepAction(workspaceId, "records-moon-category-toggle");
                  }}
                  aria-pressed={categoryChartMode === "circle"}
                >
                  원형
                </button>
              </div>
            </div>
            <div className="dashboard-chart-switcher">
              <div className={`dashboard-chart-panel${categoryChartMode === "bar" ? " is-active" : ""}`}>
                <div className="dashboard-chart-panel-inner">
                  <div className="dashboard-bar-list">
                    {selectedDashboardCategoryColumns.length ? (
                      selectedDashboardCategoryColumns.map((item) => (
                        <div
                          key={item.categoryName}
                          className="dashboard-bar-row dashboard-bar-row--category"
                          title={`${item.categoryName} ${formatCurrency(item.amount)}`}
                        >
                          <strong className="dashboard-bar-label">{item.categoryName}</strong>
                          <div className="dashboard-bar-track">
                            <div className="dashboard-bar-fill dashboard-bar-fill--category" style={{ width: `${item.share}%` }} />
                          </div>
                          <span className="dashboard-bar-amount">{formatCurrency(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="mb-0 text-secondary">아직 소비 카테고리 통계가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className={`dashboard-chart-panel${categoryChartMode === "circle" ? " is-active" : ""}`}>
                <div className="dashboard-chart-panel-inner">
                  <div className="dashboard-circle-chart-layout">
                    <div className="dashboard-circle-chart-wrap">
                      <svg viewBox="0 0 120 120" className="dashboard-circle-chart" role="img" aria-label="카테고리별 소비 원형 그래프">
                        <circle className="dashboard-circle-chart-base" cx="60" cy="60" r="54" />
                        {selectedDashboardCategorySlices.segments.map((segment) => (
                          <path
                            key={segment.categoryName}
                            d={describePieSlice(60, 60, 54, segment.startAngle, segment.endAngle)}
                            fill={segment.color}
                            className={`dashboard-circle-chart-slice${
                              activeCategorySliceName === segment.categoryName ? " is-active" : ""
                            }`}
                            onMouseEnter={() => setActiveCategorySliceName(segment.categoryName)}
                            onMouseLeave={() => setActiveCategorySliceName(null)}
                            onFocus={() => setActiveCategorySliceName(segment.categoryName)}
                            onBlur={() => setActiveCategorySliceName(null)}
                            tabIndex={0}
                          >
                            <title>{`${segment.categoryName} ${segment.ratio.toFixed(0)}% · ${formatCurrency(segment.amount)}`}</title>
                          </path>
                        ))}
                      </svg>
                    </div>
                    <div className="dashboard-circle-info">
                      <span className="stat-label">선택 항목</span>
                      <strong>{activeCategorySlice ? activeCategorySlice.categoryName : "총 소비"}</strong>
                      <span>
                        {activeCategorySlice
                          ? `${activeCategorySlice.ratio.toFixed(0)}% · ${formatCurrency(activeCategorySlice.amount)}`
                          : formatCurrency(selectedDashboardCategorySlices.totalAmount)}
                      </span>
                      <p className="mb-0 text-secondary">
                        {activeCategorySlice
                          ? "원형 그래프 조각에 마우스를 올리면 해당 카테고리 정보를 볼 수 있습니다."
                          : "원형 그래프 조각에 마우스를 올리면 카테고리별 비중과 금액이 표시됩니다."}
                      </p>
                    </div>
                  </div>
                  <div className="dashboard-circle-legend">
                    {selectedDashboardCategorySlices.topSegments.length ? (
                      selectedDashboardCategorySlices.topSegments.map((segment) => (
                        <div
                          key={segment.categoryName}
                          className={`dashboard-circle-legend-item${
                            activeCategorySliceName === segment.categoryName ? " is-active" : ""
                          }`}
                          onMouseEnter={() => setActiveCategorySliceName(segment.categoryName)}
                          onMouseLeave={() => setActiveCategorySliceName(null)}
                        >
                          <div className="dashboard-circle-legend-copy">
                            <span
                              className="dashboard-circle-legend-dot"
                              style={{ backgroundColor: segment.color }}
                              aria-hidden="true"
                            />
                            <strong>{segment.categoryName}</strong>
                          </div>
                          <span>{segment.ratio.toFixed(0)}% · {formatCurrency(segment.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="mb-0 text-secondary">아직 소비 카테고리 통계가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)} data-guide-target="dashboard-summary">
        <div className="section-head">
          <div>
            <span className="section-kicker">{selectedDashboardBasis === "statement" ? "명세서 기준 요약" : "월별 요약"}</span>
            <h2 className="section-title">가계 상태 요약</h2>
          </div>
          {renderScopeSelect("가계 상태 요약")}
        </div>

        <div className="stats-grid">
          <article className="stat-card" style={getMotionStyle(1)}>
            <div className="stat-card-head">
              <span className="stat-label">수입</span>
              <span className={`badge dashboard-stat-badge ${selectedDashboardIncomeBadge.className}`}>
                {selectedDashboardIncomeBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(insights.income)}</strong>
            <span
              className={`stat-delta${selectedDashboardIncomeDelta > 0 ? " is-up is-positive" : selectedDashboardIncomeDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(selectedDashboardIncomeDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <div className="stat-card-head">
              <span className="stat-label">소비</span>
              <span className={`badge dashboard-stat-badge ${selectedDashboardExpenseBadge.className}`}>
                {selectedDashboardExpenseBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(selectedDashboardExpenseTotal)}</strong>
            <span
              className={`stat-delta${selectedDashboardExpenseDelta > 0 ? " is-up is-negative" : selectedDashboardExpenseDelta < 0 ? " is-down is-positive" : ""}`}
            >
              {formatDeltaAmount(selectedDashboardExpenseDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <div className="stat-card-head">
              <span className="stat-label">저축 여력</span>
              <span className={`badge dashboard-stat-badge ${selectedDashboardSavingsBadge.className}`}>
                {selectedDashboardSavingsBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(selectedDashboardBalance)}</strong>
            <span
              className={`stat-delta${selectedDashboardSavingsDelta > 0 ? " is-up is-positive" : selectedDashboardSavingsDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(selectedDashboardSavingsDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(4)}>
            <div className="stat-card-head">
              <span className="stat-label">명세서 업로드</span>
            </div>
            <strong>{selectedDashboardImportCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(5)}>
            <div className="stat-card-head">
              <span className="stat-label">검토 필요</span>
              <span className={`badge dashboard-stat-badge ${selectedDashboardReviewBadge.className}`}>
                {selectedDashboardReviewBadge.label}
              </span>
            </div>
            <strong>{insights.reviewCount}건</strong>
          </article>
          <article className="stat-card" style={getMotionStyle(6)}>
            <div className="stat-card-head">
              <span className="stat-label">미분류</span>
              <span className={`badge dashboard-stat-badge ${selectedDashboardUncategorizedBadge.className}`}>
                {selectedDashboardUncategorizedBadge.label}
              </span>
            </div>
            <strong>{insights.uncategorizedCount}건</strong>
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
      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="dashboard-month-summary">
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 조각</span>
            <h2 className="section-title">이번 달 조각모음</h2>
          </div>
        </div>

        <div className="stats-grid">
          <article
            className={`stat-card${currentMonthIncomeMissing ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(1)}
            onClick={currentMonthIncomeMissing ? () => navigate("/collections/income") : undefined}
            onKeyDown={
              currentMonthIncomeMissing
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate("/collections/income");
                    }
                  }
                : undefined
            }
            role={currentMonthIncomeMissing ? "button" : undefined}
            tabIndex={currentMonthIncomeMissing ? 0 : undefined}
            aria-label={currentMonthIncomeMissing ? "수입 페이지로 이동" : undefined}
          >
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
              <span className="stat-label">이번 달 결제금액</span>
              <span className={`badge dashboard-stat-badge ${expenseDeltaBadge.className}`}>
                {expenseDeltaBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(currentMonthStatementExpenseTotal)}</strong>
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
            <strong>{formatCurrency(currentMonthStatementBalance)}</strong>
            <span
              className={`stat-delta${currentMonthSavingsDelta > 0 ? " is-up is-positive" : currentMonthSavingsDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(currentMonthSavingsDelta)}
            </span>
          </article>
          <article
            className={`stat-card${currentMonthStatementMissing ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(4)}
            onClick={currentMonthStatementMissing ? () => navigate("/collections/card") : undefined}
            onKeyDown={
              currentMonthStatementMissing
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate("/collections/card");
                    }
                  }
                : undefined
            }
            role={currentMonthStatementMissing ? "button" : undefined}
            tabIndex={currentMonthStatementMissing ? 0 : undefined}
            aria-label={currentMonthStatementMissing ? "결제내역 페이지로 이동" : undefined}
          >
            <div className="stat-card-head">
              <span className="stat-label">명세서 업로드</span>
            </div>
            <strong>{currentMonthStatementImportCount}건</strong>
          </article>
          <article
            className={`stat-card${currentMonthReviewPending ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(5)}
            onClick={currentMonthReviewPending ? () => navigate("/collections/card") : undefined}
            onKeyDown={
              currentMonthReviewPending
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate("/collections/card");
                    }
                  }
                : undefined
            }
            role={currentMonthReviewPending ? "button" : undefined}
            tabIndex={currentMonthReviewPending ? 0 : undefined}
            aria-label={currentMonthReviewPending ? "결제내역 페이지로 이동" : undefined}
          >
            <div className="stat-card-head">
              <span className="stat-label">검토 필요</span>
              <span className={`badge dashboard-stat-badge ${reviewBadge.className}`}>
                {reviewBadge.label}
              </span>
            </div>
            <strong>{currentMonthStatementInsights.reviewCount}건</strong>
          </article>
          <article
            className={`stat-card${currentMonthUncategorizedPending ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(6)}
            onClick={currentMonthUncategorizedPending ? () => navigate("/collections/card?cleanup=uncategorized") : undefined}
            onKeyDown={
              currentMonthUncategorizedPending
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate("/collections/card?cleanup=uncategorized");
                    }
                  }
                : undefined
            }
            role={currentMonthUncategorizedPending ? "button" : undefined}
            tabIndex={currentMonthUncategorizedPending ? 0 : undefined}
            aria-label={currentMonthUncategorizedPending ? "미분류 결제내역 페이지로 이동" : undefined}
          >
            <div className="stat-card-head">
              <span className="stat-label">미분류</span>
              <span className={`badge dashboard-stat-badge ${uncategorizedBadge.className}`}>
                {uncategorizedBadge.label}
              </span>
            </div>
            <strong>{currentMonthStatementInsights.uncategorizedCount}건</strong>
          </article>
        </div>

        <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
          <div className="review-summary-copy">
            <strong>
              {currentMonthStatementInsights.isDiagnosisReady
                ? "이번 달 조각이 안정적으로 정리되어 있습니다"
                : "이번 달 조각을 더 정리해야 합니다"}
            </strong>
            <p className="mb-0 text-secondary">
              {currentMonthStatementInsights.nextSteps.length
                ? currentMonthStatementInsights.nextSteps[0]
                : "결제내역에서 이번 달 거래를 계속 정리할 수 있습니다."}
            </p>
          </div>
          <div className="dashboard-summary-action">
            <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
              결제내역 보기
            </Link>
          </div>
        </div>

        {currentMonthIncomeMissing ? (
          <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
            <div className="review-summary-copy">
              <strong>이번 달 수입이 없습니다</strong>
              <p className="mb-0 text-secondary">수입 페이지에서 이번 달 수입을 먼저 입력해 주세요.</p>
            </div>
            <div className="dashboard-summary-action">
              <Link to="/collections/income" className="btn btn-outline-primary btn-sm">
                수입 입력하기
              </Link>
            </div>
          </div>
        ) : null}

        {currentMonthStatementMissing ? (
          <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
            <div className="review-summary-copy">
              <strong>이번 달 명세서 업로드가 없습니다</strong>
              <p className="mb-0 text-secondary">결제내역에서 이번 달 청구분 명세서를 먼저 올려 주세요.</p>
            </div>
            <div className="dashboard-summary-action">
              <Link to="/collections/card" className="btn btn-outline-primary btn-sm">
                명세서 업로드하기
              </Link>
            </div>
          </div>
        ) : null}

        {currentMonthReviewPending ? (
          <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
            <div className="review-summary-copy">
              <strong>검토가 필요한 항목이 남아 있습니다</strong>
              <p className="mb-0 text-secondary">결제내역에서 이번 달 검토 필요 항목을 이어서 정리해 주세요.</p>
            </div>
            <div className="dashboard-summary-action">
              <Link to="/collections/card" className="btn btn-outline-primary btn-sm">
                검토하러 가기
              </Link>
            </div>
          </div>
        ) : null}

        {currentMonthUncategorizedPending ? (
          <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mt-4">
            <div className="review-summary-copy">
              <strong>미분류 거래가 남아 있습니다</strong>
              <p className="mb-0 text-secondary">미분류 필터가 켜진 결제내역에서 이번 달 거래를 바로 정리할 수 있습니다.</p>
            </div>
            <div className="dashboard-summary-action">
              <Link to="/collections/card?cleanup=uncategorized" className="btn btn-outline-primary btn-sm">
                미분류 정리하기
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)} data-guide-target="dashboard-foundation-overview">
        <div className="section-head">
          <div>
            <span className="section-kicker">연결 된 것들</span>
            <h2 className="section-title">연결 된 것들</h2>
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
      <section className="card shadow-sm" style={getMotionStyle(2)} data-guide-target="dashboard-flow-overview">
        <div className="section-head">
          <div>
            <span className="section-kicker">이번 달 흐름</span>
            <h2 className="section-title">이번달 자산 흐름</h2>
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
