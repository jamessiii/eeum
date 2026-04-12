import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DragEvent, PointerEvent } from "react";
import { useRef } from "react";
import { Fragment } from "react";
import { fetchWorkspaceInsights, type AnalysisWorkspaceInsightsResponse } from "../api/analysis";
import { isAnalysisApiConfigured } from "../api/analysisConfig";
import { monthKey } from "../../shared/utils/date";
import { getCategoryLabel } from "../../domain/categories/meta";
import { getLoopCandidateGroup } from "../../domain/loops/loopCandidates";
import type { ReviewItem } from "../../shared/types/models";
import type { Account, Card, Category, ImportRecord, Person, Transaction, WorkspaceBundle } from "../../shared/types/models";
import type { ManagedLoopGroup } from "../../domain/loops/managedLoops";
import { getWorkspaceInsights, type WorkspaceInsightBasis, type WorkspaceInsights } from "../../domain/insights/workspaceInsights";
import { getMonthlySharedSettlementSummary, getSettlementBalanceSummary } from "../../domain/settlements/summary";
import { getOpenTransactionWorkflowReviews, getTransactionWorkflowTransactionIds } from "../../domain/reviews/transactionWorkflow";
import { getExpenseImpactStats } from "../../domain/transactions/expenseImpactStats";
import { getSourceTypeLabel } from "../../domain/transactions/sourceTypes";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { completeGuideStepAction } from "../../domain/guidance/guideRuntime";
import { getMotionStyle } from "../../shared/utils/motion";
import { getPresenceAccent } from "../dotoriPresenceVisuals";
import { useAppState } from "../state/AppStateProvider";
import { AppModal } from "../components/AppModal";
import { BoardCaseSection } from "../components/BoardCase";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { AppSelect } from "../components/AppSelect";
import { IncomeManagementContent } from "../components/IncomeManagementContent";
import { useDotoriPresenceLocks, useSyncDotoriPresenceTarget } from "../presence/useDotoriPresenceLocks";
import { TransactionCategoryEditor } from "../components/TransactionCategoryEditor";
import { TransactionRowHeader } from "../components/TransactionRowHeader";
import { getWorkspaceScope } from "../state/selectors";

function toneClass(tone: "stable" | "caution" | "warning") {
  return tone === "warning" ? "warning" : tone === "caution" ? "caution" : "stable";
}

function mergeWorkspaceInsights(base: WorkspaceInsights, remote: AnalysisWorkspaceInsightsResponse | null): WorkspaceInsights {
  if (!remote) return base;

  return {
    ...base,
    transactionCount: remote.transactionCount,
    income: remote.income,
    expense: remote.expense,
    savings: remote.savings,
    spendRate: remote.spendRate,
    savingsRate: remote.savingsRate,
    fixedExpense: remote.fixedExpense,
    fixedExpenseRate: remote.fixedExpenseRate,
    reviewCount: remote.reviewCount,
    internalTransferCount: remote.internalTransferCount,
    uncategorizedCount: remote.uncategorizedCount,
    recurringSuggestionCount: remote.recurringSuggestionCount,
    isFinancialProfileReady: remote.financialProfileReady,
    isDiagnosisReady: remote.diagnosisReady,
    topCategories: remote.topCategories.map((item) => ({
      categoryName: item.categoryName,
      amount: item.amount,
    })),
    sourceBreakdown: remote.sourceBreakdown,
    spendTone: remote.spendTone,
    savingsTone: remote.savingsTone,
    fixedTone: remote.fixedTone,
  };
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

type CalendarChip = {
  label: string;
  tone: "expense" | "memo" | "holiday";
};

type CalendarMemo = {
  text: string;
  merchantNames: string[];
};

type CalendarCell = {
  dateKey: string;
  isCurrentMonth: boolean;
  dayOfWeek: number;
  expenseAmount: number;
  transactionCount: number;
  merchants: string[];
  holidayLabel: string | null;
  chips: CalendarChip[];
  memos: CalendarMemo[];
};

type DashboardCalendarProcessingMode = "review" | "uncategorized" | null;
type DashboardCalendarFocusedField =
  | { transactionId: string; field: "loop" | "category" | "note" }
  | null;

type LoopConfirmState = {
  transactionId: string;
  candidateIds: string[];
  suggestedIds: string[];
};

type DashboardReviewWorkflowState = {
  activeReviewId: string | null;
  queuedReviewIds: string[];
};

const CALENDAR_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

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

function normalizeCardKey(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function getVisibleCardIdentifier(cardNumberMasked: string) {
  const trimmed = cardNumberMasked.trim();
  if (!trimmed) return "";
  return /\d/.test(trimmed) ? trimmed : "";
}

function isWorkbookFile(file: File) {
  return /\.xlsx?$/.test(file.name.toLowerCase());
}

function findMatchedCardInCandidates(existingCards: Card[], previewCard: Card) {
  const previewCardIdentifier = getVisibleCardIdentifier(previewCard.cardNumberMasked);
  return (
    existingCards.find(
      (existing) =>
        existing.issuerName === previewCard.issuerName &&
        getVisibleCardIdentifier(existing.cardNumberMasked) &&
        previewCardIdentifier &&
        normalizeCardKey(getVisibleCardIdentifier(existing.cardNumberMasked)) === normalizeCardKey(previewCardIdentifier),
    ) ??
    existingCards.find((existing) => normalizeCardKey(existing.name) === normalizeCardKey(previewCard.name)) ??
    null
  );
}

function findMatchedCard(existingCards: Card[], previewCard: Card, ownerPersonId: string | null) {
  if (!ownerPersonId) return null;

  const ownedCards = existingCards.filter((existing) => (existing.ownerPersonId ?? null) === ownerPersonId);
  const unownedCards = existingCards.filter((existing) => (existing.ownerPersonId ?? null) === null);

  return findMatchedCardInCandidates(ownedCards, previewCard) ?? findMatchedCardInCandidates(unownedCards, previewCard) ?? null;
}

function isCardPaymentAccount(account: Pick<Account, "usageType" | "name" | "alias">) {
  if (account.usageType === "card_payment") return true;
  const normalizedLabel = normalizeCardKey(`${account.name} ${account.alias}`);
  return (
    normalizedLabel.includes("카드값") ||
    normalizedLabel.includes("카드결제") ||
    normalizedLabel.includes("결제계좌") ||
    normalizedLabel.includes("결제통장") ||
    normalizedLabel.includes("납부")
  );
}

function isMeetingAccountVisibleToPerson(
  account: Pick<Account, "accountGroupType" | "primaryPersonId" | "participantPersonIds">,
  ownerPersonId: string,
) {
  if (account.accountGroupType !== "meeting") return false;
  return account.primaryPersonId === ownerPersonId || (account.participantPersonIds ?? []).includes(ownerPersonId);
}

type LinkedAccountCandidate = Pick<
  Account,
  | "id"
  | "name"
  | "alias"
  | "institutionName"
  | "accountNumberMasked"
  | "isShared"
  | "usageType"
  | "ownerPersonId"
  | "primaryPersonId"
  | "participantPersonIds"
  | "accountGroupType"
> & {
  source: "existing" | "preview";
};

const EMPTY_LINKED_ACCOUNT_CANDIDATES: LinkedAccountCandidate[] = [];

function buildLinkedAccountCandidates(existingAccounts: Account[], previewAccounts: Account[], ownerPersonId: string) {
  const dedupedCandidates = new Map<string, LinkedAccountCandidate>();

  const upsertCandidate = (account: Account, source: LinkedAccountCandidate["source"]) => {
    if (!isCardPaymentAccount(account)) return;
    if (
      source === "existing" &&
      !account.isShared &&
      account.ownerPersonId !== ownerPersonId &&
      !isMeetingAccountVisibleToPerson(account, ownerPersonId)
    ) {
      return;
    }

    const dedupeKey = `${normalizeCardKey(account.alias || account.name)}:${normalizeCardKey(account.accountNumberMasked)}`;
    const candidate: LinkedAccountCandidate = {
      id: account.id,
      name: account.name,
      alias: account.alias,
      institutionName: account.institutionName,
      accountNumberMasked: account.accountNumberMasked,
      isShared: account.isShared,
      usageType: account.usageType,
      ownerPersonId: account.ownerPersonId,
      primaryPersonId: account.primaryPersonId ?? null,
      participantPersonIds: account.participantPersonIds ?? [],
      accountGroupType: account.accountGroupType ?? (account.isShared ? "meeting" : "personal"),
      source,
    };
    const existingCandidate = dedupedCandidates.get(dedupeKey);

    if (!existingCandidate || (existingCandidate.source === "preview" && source === "existing")) {
      dedupedCandidates.set(dedupeKey, candidate);
    }
  };

  existingAccounts.forEach((account) => upsertCandidate(account, "existing"));
  previewAccounts.forEach((account) =>
    upsertCandidate(
      {
        ...account,
        ownerPersonId: account.isShared ? null : ownerPersonId,
        primaryPersonId: account.primaryPersonId ?? ownerPersonId,
        participantPersonIds: account.accountGroupType === "meeting" ? Array.from(new Set([...(account.participantPersonIds ?? []), ownerPersonId])) : [],
        accountGroupType: account.accountGroupType ?? (account.isShared ? "meeting" : "personal"),
      },
      "preview",
    ),
  );

  return Array.from(dedupedCandidates.values()).sort((left, right) => {
    if (left.source !== right.source) return left.source === "existing" ? -1 : 1;
    if (left.isShared !== right.isShared) return left.isShared ? 1 : -1;
    return (left.alias || left.name).localeCompare(right.alias || right.name, "ko");
  });
}

function getPostImportLabel(bundle: WorkspaceBundle) {
  if (bundle.reviews.length > 0) return `검토 ${bundle.reviews.length}건 확인`;
  if (bundle.transactions.some((transaction) => transaction.isExpenseImpact && !transaction.categoryId)) {
    return "결제내역 보기";
  }
  return "결제내역 보기";
}

function addMonthKey(value: string, monthsToAdd: number) {
  const [year, month] = value.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getUsageMonths(bundle: WorkspaceBundle | null) {
  if (!bundle) return [];
  const uniqueMonths = new Set(
    bundle.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter((monthValue) => Boolean(monthValue)),
  );
  return [...uniqueMonths].sort((left, right) => left.localeCompare(right));
}

function getPreviewStatementMonthOptions(bundle: WorkspaceBundle | null) {
  const usageMonths = getUsageMonths(bundle);
  const latestUsageMonth = usageMonths.at(-1) ?? null;
  if (!latestUsageMonth) return [];
  if (usageMonths.length >= 3) {
    return [addMonthKey(latestUsageMonth, -1), latestUsageMonth, addMonthKey(latestUsageMonth, 1)];
  }
  return [latestUsageMonth, addMonthKey(latestUsageMonth, 1)];
}

function getStatementRecordLabel(record: Pick<ImportRecord, "statementMonth" | "fileName">) {
  if (record.statementMonth) return formatStatementMonthLabel(record.statementMonth);
  return `${record.fileName} 기록`;
}

function getPreviousMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(year, month - 2, 1);
  return monthKey(date);
}

function getNextMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(year, month, 1);
  return monthKey(date);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLoopProjectedDateWithinMonth(
  latestOccurredAt: string,
  intervalDays: number,
  targetMonth: string,
  latestStatementMonth: string | null,
) {
  if (!targetMonth || intervalDays <= 0) return null;
  if (latestStatementMonth && targetMonth > getNextMonthKey(latestStatementMonth)) return null;

  let projectedDate = latestOccurredAt.slice(0, 10);
  let guard = 0;
  while (projectedDate < `${targetMonth}-01` && guard < 60) {
    projectedDate = addDaysToDateKey(projectedDate, intervalDays);
    guard += 1;
  }

  return projectedDate.startsWith(targetMonth) ? projectedDate : null;
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

function getLatestStatementMonth(imports: ImportRecord[]) {
  return imports.reduce<string | null>((latest, record) => {
    const candidate = record.statementMonth?.trim() || record.importedAt.slice(0, 7);
    if (!candidate) return latest;
    if (!latest) return candidate;
    return candidate > latest ? candidate : latest;
  }, null);
}

function formatDeltaAmount(amount: number) {
  if (amount === 0) return formatCurrency(0);
  return formatCurrency(Math.abs(amount));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getNextQueuedReviewId(queueIds: string[], currentId: string) {
  const currentIndex = queueIds.indexOf(currentId);
  if (currentIndex < 0) return queueIds[0] ?? null;

  for (let index = currentIndex + 1; index < queueIds.length; index += 1) {
    if (queueIds[index] !== currentId) return queueIds[index];
  }

  for (let index = 0; index < currentIndex; index += 1) {
    if (queueIds[index] !== currentId) return queueIds[index];
  }

  return null;
}

function getInlineReviewPrompt(review: ReviewItem) {
  switch (review.reviewType) {
    case "category_suggestion":
      return "해당 건을 제안 카테고리로 분류할까요?";
    case "duplicate_candidate":
      return "해당 건을 중복으로 보고 제외할까요?";
    case "refund_candidate":
      return "해당 건을 환불로 연결할까요?";
    default:
      return "해당 건을 검토할까요?";
  }
}

function formatYearMonthShortLabel(value: string) {
  const [, month] = value.split("-");
  return `${Number(month)}월`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function formatFullKoreanDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const weekday = CALENDAR_WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()] ?? "";
  return `${year}년 ${month}월 ${day}일 ${weekday}요일`;
}

function getLoopDueLabel(daysUntilNextPurchase: number | null) {
  if (daysUntilNextPurchase === null) return "예측 대기";
  if (daysUntilNextPurchase > 0) return `${daysUntilNextPurchase}일 지남`;
  if (daysUntilNextPurchase < 0) return `${Math.abs(daysUntilNextPurchase)}일 뒤`;
  return "오늘쯤";
}

function getLoopAmountTone(amountDelta: number) {
  if (amountDelta > 0) return "is-up";
  if (amountDelta < 0) return "is-down";
  return "is-flat";
}

function getCalendarDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const firstWeekday = firstDate.getDay();
  const startDate = new Date(year, month - 1, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + index);
    const dateKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
    return {
      dateKey,
      isCurrentMonth: dateKey.startsWith(monthValue),
      dayOfWeek: nextDate.getDay(),
    };
  });
}

function clampDayToMonth(monthValue: string, day: number) {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return 1;
  const lastDay = new Date(year, month, 0).getDate();
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.min(lastDay, day));
}

function scrollIntoNearestAppMain(target: HTMLElement, offset = 16) {
  const scrollContainer = target.closest<HTMLElement>(".app-main");
  if (!scrollContainer) {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - offset;

  scrollContainer.scrollTo({
    top: Math.max(0, nextTop),
    behavior: "smooth",
  });
}

function getFixedHolidayLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  const monthDay = `${month}-${day}`;
  switch (monthDay) {
    case "01-01":
      return "신정";
    case "03-01":
      return "삼일절";
    case "05-05":
      return "어린이날";
    case "06-06":
      return "현충일";
    case "08-15":
      return "광복절";
    case "10-03":
      return "개천절";
    case "10-09":
      return "한글날";
    case "12-25":
      return "성탄절";
    default:
      return null;
  }
}

function normalizeDiaryText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type DiarySentencePool = string | string[];

type DiaryActivity = {
  single: DiarySentencePool;
  multi: DiarySentencePool;
  high: DiarySentencePool;
};

type DiaryPattern = {
  keywords: string[];
  activity: DiaryActivity;
};

const DIARY_PATTERNS: DiaryPattern[] = [
  {
    keywords: ["택시"],
    activity: {
      single: [
        "오늘은 택시를 탔다. 택시비를 좀 아껴야겠다.",
        "오늘은 택시를 타고 이동했다. 빠르긴 해서 좋았다.",
        "오늘은 택시를 불렀다. 편하지만 돈은 좀 들었다.",
      ],
      multi: [
        "택시도 타고 다른 일도 했다. 택시비를 조금 아껴야겠다.",
        "택시도 타고 여기저기 다녔다. 하루가 바쁘게 지나갔다.",
        "택시도 이용하고 할 일도 봤다. 생각보다 금방 지나간 하루였다.",
      ],
      high: [
        "택시도 타고 여기저기 다녔다. 교통비가 커서 조금 놀랐다.",
        "택시를 여러 번 타다 보니 돈이 꽤 들었다. 그래도 급한 날이었다.",
        "이동이 많아서 택시비가 커졌다. 다음에는 조금 아껴야겠다.",
      ],
    },
  },
  {
    keywords: ["주유"],
    activity: {
      single: [
        "오늘은 주유를 했다. 차가 든든해져서 참 괜찮았다.",
        "오늘은 기름을 넣었다. 차가 배부를 것 같았다.",
        "오늘은 주유를 하고 마음이 놓였다. 이제 한동안 잘 달릴 것 같다.",
      ],
      multi: [
        "주유도 하고 다른 것도 챙겼다. 하루가 제법 바빴다.",
        "기름도 넣고 할 일도 봤다. 차가 든든해져서 좋았다.",
        "주유도 하고 이것저것 움직였다. 꽤 바쁜 하루였다.",
      ],
      high: [
        "주유도 하고 이것저것 챙기느라 돈이 꽤 들었다. 그래도 필요한 날이었다.",
        "기름값이 올라서 그런지 돈이 더 들었다. 그래도 꼭 필요한 소비였다.",
        "오늘은 주유비가 제법 컸다. 그래도 차가 있어야 해서 어쩔 수 없었다.",
      ],
    },
  },
  {
    keywords: ["기부"],
    activity: {
      single: [
        "오늘은 기부금을 냈다! 참 뿌듯했다.",
        "오늘은 좋은 곳에 돈을 보탰다. 마음이 따뜻했다.",
        "오늘은 기부를 했다. 괜히 마음이 반듯해진 것 같았다.",
      ],
      multi: [
        "기부도 하고 다른 일도 했다. 마음이 참 뿌듯했다.",
        "좋은 일에도 돈을 쓰고 다른 일도 했다. 마음이 따뜻했다.",
        "기부도 하고 하루를 보냈다. 괜히 더 잘 살아야 할 것 같았다.",
      ],
      high: [
        "기부도 하고 쓸 곳에 돈을 썼다. 마음이 참 뿌듯했다.",
        "오늘은 큰마음 먹고 기부도 했다. 그래서 더 뿌듯했다.",
        "좋은 일에 돈을 꽤 썼다. 그래도 마음은 아주 환했다.",
      ],
    },
  },
  {
    keywords: ["구독", "넷플릭스", "유튜브", "spotify", "멜론", "티빙", "디즈니"],
    activity: {
      single: "오늘은 보고 싶은 것을 이어 보려고 구독비를 냈다. 참 편했다.",
      multi: "구독비도 나가고 다른 소비도 있었다. 오늘도 생활이 굴러갔다.",
      high: "구독비도 내고 이것저것 챙겼다. 쌓이면 꽤 커질 것 같았다.",
    },
  },
  {
    keywords: ["세제"],
    activity: {
      single: "오늘은 세제를 샀다. 빨래할 생각을 하니 든든했다.",
      multi: "세제도 사고 다른 것도 챙겼다. 집안일 준비가 잘 된 것 같았다.",
      high: "세제랑 필요한 것들을 챙기다 보니 돈이 꽤 들었다. 그래도 꼭 필요한 날이었다.",
    },
  },
  {
    keywords: ["샴푸"],
    activity: {
      single: "오늘은 샴푸를 샀다. 머리를 감을 때 기분이 좋을 것 같았다.",
      multi: "샴푸도 사고 다른 것도 챙겼다. 욕실이 든든해진 것 같았다.",
      high: "샴푸랑 생활용품을 한꺼번에 챙겼다. 돈은 들었지만 꼭 필요했다.",
    },
  },
  {
    keywords: ["로션"],
    activity: {
      single: "오늘은 로션을 샀다. 피부가 좋아질 것 같아 기분이 좋았다.",
      multi: "로션도 사고 이것저것 챙겼다. 스스로를 잘 돌본 것 같았다.",
      high: "로션이랑 필요한 것들을 같이 샀다. 돈은 들었지만 뿌듯했다.",
    },
  },
  {
    keywords: ["생필품"],
    activity: {
      single: "오늘은 생활에 필요한 것을 샀다. 미리 챙겨서 참 든든했다.",
      multi: "생필품도 사고 다른 것도 챙겼다. 집이 조금 더 든든해졌다.",
      high: "생필품을 이것저것 챙기다 보니 돈이 꽤 들었다. 그래도 꼭 필요한 날이었다.",
    },
  },
  {
    keywords: ["이마트", "홈플러스", "롯데마트", "코스트코", "마트", "장보기"],
    activity: {
      single: "오늘은 마트에 갔다. 마트는 즐거워서 기분이 좋았다.",
      multi: "오늘은 마트에도 가고 다른 일도 했다. 냉장고가 든든해질 것 같았다.",
      high: "오늘은 마트에서 장을 크게 봤다. 돈은 들었지만 마음이 놓였다.",
    },
  },
  {
    keywords: ["의류", "옷", "쇼핑몰", "무신사", "지그재그", "에이블리", "자라", "h&m", "유니클로", "스파오"],
    activity: {
      single: "오늘은 옷쇼핑을 했다. 행복했다.",
      multi: "오늘은 옷도 사고 다른 것도 챙겼다. 기분이 한결 좋아졌다.",
      high: "오늘은 옷쇼핑을 크게 했다. 돈은 좀 들었지만 마음은 즐거웠다.",
    },
  },
  {
    keywords: ["신발", "운동화", "구두"],
    activity: {
      single: "오늘은 신발을 샀다. 새로 신고 나갈 생각에 설렜다.",
      multi: "오늘은 신발도 사고 다른 것도 챙겼다. 기분이 산뜻했다.",
      high: "오늘은 신발까지 큰맘 먹고 샀다. 돈은 들었지만 마음에 들었다.",
    },
  },
  {
    keywords: ["가방", "백팩", "크로스백"],
    activity: {
      single: "오늘은 가방을 샀다. 예뻐서 기분이 좋았다.",
      multi: "오늘은 가방도 보고 다른 것도 챙겼다. 괜히 즐거운 하루였다.",
      high: "오늘은 가방까지 큰맘 먹고 샀다. 돈은 들었지만 마음은 좋았다.",
    },
  },
  {
    keywords: ["병원", "치과", "한의원", "의원"],
    activity: {
      single: "오늘은 병원에 갔다. 아픈 곳을 돌봐서 다행이었다.",
      multi: "오늘은 병원도 다녀오고 다른 일도 했다. 몸을 챙겨서 다행이었다.",
      high: "오늘은 병원비가 제법 들었다. 그래도 몸이 먼저라서 잘한 일 같다.",
    },
  },
  {
    keywords: ["약국", "약"],
    activity: {
      single: "오늘은 약을 샀다. 얼른 나으면 좋겠다.",
      multi: "오늘은 약도 사고 다른 일도 했다. 몸을 챙겨서 다행이었다.",
      high: "오늘은 약값도 들고 이것저것 챙겼다. 그래도 건강이 제일이다.",
    },
  },
  {
    keywords: ["편의점", "cu", "gs25", "세븐일레븐", "emart24"],
    activity: {
      single: "오늘은 편의점에 들렀다. 작은 것을 샀지만 꽤 반가웠다.",
      multi: "오늘은 편의점도 들르고 다른 일도 했다. 소소하지만 바빴다.",
      high: "오늘은 편의점에서 이것저것 사다 보니 생각보다 돈이 들었다.",
    },
  },
  {
    keywords: ["배달", "배민", "요기요", "쿠팡이츠"],
    activity: {
      single: "오늘은 배달음식을 시켜 먹었다. 참 편했다.",
      multi: "오늘은 배달도 시키고 다른 일도 했다. 게으른데 즐거운 날이었다.",
      high: "오늘은 배달비까지 붙어서 돈이 꽤 들었다. 그래도 맛있었다.",
    },
  },
  {
    keywords: ["외식", "식비", "식당", "점심", "저녁", "치킨", "피자", "햄버거"],
    activity: {
      single: "오늘은 맛있는 것을 사 먹었다. 참 맛이 있었다.",
      multi: "오늘은 먹을 것도 사고 다른 일도 했다. 제법 재미있는 날이었다.",
      high: "오늘은 먹는 데 돈을 꽤 썼다. 그래도 맛있어서 기분이 좋았다.",
    },
  },
  {
    keywords: ["카페", "커피", "스타벅스", "메가커피", "빽다방", "컴포즈"],
    activity: {
      single: "오늘은 커피를 마셨다. 향이 좋아서 기분이 괜찮았다.",
      multi: "오늘은 커피도 마시고 다른 일도 했다. 잠이 조금 깼다.",
      high: "오늘은 커피값도 쌓이고 다른 소비도 있었다. 그래도 달달해서 좋았다.",
    },
  },
  {
    keywords: ["빵", "베이커리", "도넛", "케이크"],
    activity: {
      single: "오늘은 빵을 샀다. 달콤해서 기분이 좋아질 것 같았다.",
      multi: "오늘은 빵도 사고 다른 것도 챙겼다. 입이 즐거운 날이었다.",
      high: "오늘은 맛있는 것을 이것저것 골랐다. 돈은 좀 들었지만 즐거웠다.",
    },
  },
  {
    keywords: ["버스", "지하철", "교통"],
    activity: {
      single: "오늘은 대중교통을 타고 이동했다. 길을 잘 다녀와서 다행이었다.",
      multi: "오늘은 이동도 하고 다른 일도 봤다. 하루가 꽤 바빴다.",
      high: "오늘은 여기저기 다니느라 교통비가 좀 들었다. 그래도 필요한 날이었다.",
    },
  },
  {
    keywords: ["주차"],
    activity: {
      single: "오늘은 주차비를 냈다. 차를 세워 둘 수 있어서 다행이었다.",
      multi: "오늘은 주차도 하고 다른 일도 했다. 바쁜 하루였다.",
      high: "오늘은 주차비까지 겹쳐서 돈이 더 들었다. 그래도 어쩔 수 없었다.",
    },
  },
  {
    keywords: ["고양이", "강아지", "사료", "반려", "동물병원", "펫"],
    activity: {
      single: "오늘은 반려동물을 위해 필요한 것을 샀다. 참 뿌듯했다.",
      multi: "오늘은 반려동물 것도 챙기고 다른 일도 했다. 마음이 따뜻했다.",
      high: "오늘은 반려동물에게 필요한 것을 크게 챙겼다. 돈은 들었지만 뿌듯했다.",
    },
  },
  {
    keywords: ["영화", "cgv", "롯데시네마", "메가박스"],
    activity: {
      single: "오늘은 영화를 봤다. 참 재미있었다.",
      multi: "오늘은 영화도 보고 다른 일도 했다. 꽤 신나는 하루였다.",
      high: "오늘은 놀거리에도 돈을 썼다. 그래도 재미있어서 만족했다.",
    },
  },
  {
    keywords: ["책", "서점", "교보문고", "yes24", "알라딘"],
    activity: {
      single: "오늘은 책을 샀다. 읽을 생각을 하니 기대되었다.",
      multi: "오늘은 책도 사고 다른 것도 챙겼다. 마음이 조금 똑똑해진 것 같았다.",
      high: "오늘은 읽고 싶은 것을 많이 골랐다. 돈은 들었지만 뿌듯했다.",
    },
  },
  {
    keywords: ["문구", "다이소", "팬", "노트", "필기"],
    activity: {
      single: "오늘은 문구를 샀다. 쓰고 싶은 마음이 생겼다.",
      multi: "오늘은 문구도 사고 다른 것도 챙겼다. 괜히 부지런해지고 싶었다.",
      high: "오늘은 자잘한 것을 이것저것 샀다. 작은 것들이지만 꽤 많았다.",
    },
  },
  {
    keywords: ["가구", "이케아", "수납", "책상", "의자"],
    activity: {
      single: "오늘은 집에 둘 것을 샀다. 방이 더 좋아질 것 같았다.",
      multi: "오늘은 집안 것도 사고 다른 일도 했다. 생활이 조금 더 편해질 것 같았다.",
      high: "오늘은 집에 필요한 것을 크게 샀다. 돈은 들었지만 오래 쓸 것 같았다.",
    },
  },
  {
    keywords: ["화장품", "올리브영", "립", "쿠션", "틴트"],
    activity: {
      single: "오늘은 화장품을 샀다. 예뻐질 것 같아 기분이 좋았다.",
      multi: "오늘은 화장품도 사고 다른 것도 챙겼다. 괜히 신이 났다.",
      high: "오늘은 예뻐지는 데 돈을 꽤 썼다. 그래도 마음은 즐거웠다.",
    },
  },
  {
    keywords: ["미용실", "헤어", "커트", "염색", "펌"],
    activity: {
      single: "오늘은 머리를 하러 갔다. 거울을 보니 기분이 좋았다.",
      multi: "오늘은 머리도 하고 다른 일도 했다. 한결 산뜻했다.",
      high: "오늘은 꾸미는 데 돈을 꽤 썼다. 그래도 예뻐져서 좋았다.",
    },
  },
  {
    keywords: ["네일", "왁싱", "피부", "에스테틱"],
    activity: {
      single: "오늘은 나를 꾸미는 데 돈을 썼다. 기분이 좋아졌다.",
      multi: "오늘은 관리도 받고 다른 일도 했다. 스스로를 챙긴 날 같았다.",
      high: "오늘은 나를 위해 제법 돈을 썼다. 그래도 뿌듯했다.",
    },
  },
  {
    keywords: ["운동", "헬스", "pt", "필라테스", "요가"],
    activity: {
      single: "오늘은 운동을 했다. 몸이 건강해질 것 같았다.",
      multi: "오늘은 운동도 하고 다른 일도 했다. 꽤 부지런한 날이었다.",
      high: "오늘은 건강을 위해 돈을 썼다. 잘한 일 같아서 뿌듯했다.",
    },
  },
  {
    keywords: ["학원", "강의", "수강", "교육", "인강", "클래스"],
    activity: {
      single: "오늘은 배우는 데 돈을 썼다. 똑똑해질 것 같았다.",
      multi: "오늘은 공부도 하고 다른 일도 했다. 제법 알찬 하루였다.",
      high: "오늘은 배움을 위해 제법 돈을 썼다. 그래도 잘한 일 같았다.",
    },
  },
  {
    keywords: ["게임", "steam", "닌텐도", "플레이스테이션"],
    activity: {
      single: "오늘은 게임을 샀다. 집에 가서 빨리 하고 싶었다.",
      multi: "오늘은 게임도 사고 다른 것도 챙겼다. 괜히 신나는 날이었다.",
      high: "오늘은 재미있는 것에 돈을 꽤 썼다. 그래도 행복했다.",
    },
  },
  {
    keywords: ["여행", "숙소", "호텔", "비행기", "항공", "기차"],
    activity: {
      single: "오늘은 여행 준비를 했다. 떠날 생각을 하니 설렜다.",
      multi: "오늘은 여행 것도 챙기고 다른 일도 했다. 괜히 들떴다.",
      high: "오늘은 여행 준비에 돈을 꽤 썼다. 그래도 기대가 더 컸다.",
    },
  },
  {
    keywords: ["통신", "휴대폰", "요금제", "인터넷"],
    activity: {
      single: "오늘은 통신비가 나갔다. 생활에 꼭 필요한 돈이었다.",
      multi: "오늘은 통신비도 나가고 다른 소비도 있었다. 돈이 조용히 빠져나갔다.",
      high: "오늘은 고정으로 나가는 돈도 있고 다른 소비도 겹쳤다. 조금 아쉬웠다.",
    },
  },
  {
    keywords: ["전기", "가스", "수도", "관리비"],
    activity: {
      single: "오늘은 집에 필요한 요금을 냈다. 생활은 참 꾸준하다.",
      multi: "오늘은 집에 필요한 돈도 내고 다른 일도 했다. 어른이 된 기분이었다.",
      high: "오늘은 생활요금이랑 다른 소비가 겹쳤다. 그래도 꼭 내야 하는 돈이었다.",
    },
  },
  {
    keywords: ["보험"],
    activity: {
      single: "오늘은 보험료를 냈다. 미래를 챙긴 것 같아 조금 든든했다.",
      multi: "오늘은 보험료도 나가고 다른 소비도 있었다. 생활은 참 바쁘다.",
      high: "오늘은 꼭 필요한 돈이 여러 군데로 나갔다. 그래도 챙겨 둬서 다행이다.",
    },
  },
  {
    keywords: ["세금", "주민세", "재산세", "소득세"],
    activity: {
      single: "오늘은 세금을 냈다. 아깝지만 꼭 필요한 일 같았다.",
      multi: "오늘은 세금도 내고 다른 일도 했다. 어른의 하루 같았다.",
      high: "오늘은 세금까지 겹쳐서 돈이 크게 나갔다. 그래도 해야 할 일은 했다.",
    },
  },
  {
    keywords: ["쿠팡", "컬리", "쓱배송", "새벽배송"],
    activity: {
      single: [
        "오늘은 필요한 것을 배송으로 샀다. 집으로 오니 참 편할 것 같다.",
        "오늘은 온라인으로 장을 봤다. 기다리는 재미도 있을 것 같다.",
        "오늘은 집에서 편하게 주문했다. 세상이 참 편해졌다.",
      ],
      multi: [
        "오늘은 온라인으로 필요한 것도 사고 다른 일도 했다. 집에 오면 반가울 것 같다.",
        "배송 주문도 하고 하루를 보냈다. 기다리는 마음이 조금 들떴다.",
        "인터넷으로도 사고 다른 일도 했다. 편한데 돈은 잘 나가는 것 같다.",
      ],
      high: [
        "오늘은 온라인 주문을 이것저것 했다. 편하지만 돈이 꽤 나갔다.",
        "배송으로 많이 시켰더니 금액이 제법 컸다. 그래도 필요한 것들이었다.",
        "오늘은 집에서 편하게 샀는데 돈은 크게 들었다. 조금 신기했다.",
      ],
    },
  },
  {
    keywords: ["네이버", "11번가", "g마켓", "옥션", "오늘의집"],
    activity: {
      single: [
        "오늘은 인터넷으로 물건을 샀다. 곧 오면 좋겠다.",
        "오늘은 온라인 쇼핑을 했다. 택배가 기다려진다.",
        "오늘은 집에서 편하게 주문했다. 참 신기한 세상이다.",
      ],
      multi: [
        "오늘은 온라인 쇼핑도 하고 다른 일도 했다. 기다릴 것이 생겼다.",
        "인터넷으로도 사고 이것저것 했다. 내일이 조금 기다려진다.",
        "주문도 하고 할 일도 봤다. 괜히 손이 바빴다.",
      ],
      high: [
        "오늘은 온라인 쇼핑을 제법 했다. 택배는 좋지만 돈도 많이 나갔다.",
        "오늘은 인터넷 장바구니가 커졌다. 조금 신나고 조금 무서웠다.",
        "필요한 것을 많이 주문했다. 편했지만 금액은 꽤 컸다.",
      ],
    },
  },
  {
    keywords: ["과일", "채소", "정육", "생선"],
    activity: {
      single: [
        "오늘은 먹을 재료를 샀다. 집밥이 든든해질 것 같았다.",
        "오늘은 신선한 것을 샀다. 냉장고가 기뻐할 것 같았다.",
        "오늘은 재료를 챙겼다. 집에서 맛있는 것을 해 먹고 싶었다.",
      ],
      multi: [
        "오늘은 재료도 사고 다른 것도 챙겼다. 냉장고가 든든해질 것 같았다.",
        "먹을 것도 마련하고 다른 일도 했다. 알찬 하루였다.",
        "재료도 사고 바쁘게 움직였다. 그래도 마음은 든든했다.",
      ],
      high: [
        "오늘은 먹을 재료를 크게 샀다. 돈은 들었지만 마음이 놓였다.",
        "오늘은 장바구니가 무거울 만큼 샀다. 그래도 든든해서 좋았다.",
        "집에서 먹을 것을 많이 챙겼다. 금액은 컸지만 필요한 소비였다.",
      ],
    },
  },
  {
    keywords: ["안경", "렌즈", "콘택트"],
    activity: {
      single: [
        "오늘은 눈에 필요한 것을 샀다. 잘 보이면 좋겠다.",
        "오늘은 렌즈를 챙겼다. 앞이 잘 보이면 마음도 편하다.",
        "오늘은 눈을 위해 돈을 썼다. 그래도 꼭 필요한 일이었다.",
      ],
      multi: [
        "오늘은 렌즈도 사고 다른 일도 했다. 생활이 조금 편해질 것 같았다.",
        "눈에 필요한 것도 챙기고 하루를 보냈다. 바쁘지만 괜찮았다.",
        "오늘은 안경 관련해서도 쓰고 다른 일도 했다. 참 필요한 날이었다.",
      ],
      high: [
        "오늘은 눈에 필요한 데 돈이 꽤 들었다. 그래도 잘 보여야 하니까 괜찮다.",
        "안경이나 렌즈에 돈을 썼다. 조금 아프지만 꼭 필요했다.",
        "오늘은 시야를 위해 큰돈을 썼다. 그래도 잘 보이면 좋겠다.",
      ],
    },
  },
  {
    keywords: ["꽃", "화분", "식물"],
    activity: {
      single: [
        "오늘은 꽃이나 식물을 샀다. 보기만 해도 기분이 좋아졌다.",
        "오늘은 초록색 친구를 데려왔다. 방이 예뻐질 것 같았다.",
        "오늘은 꽃을 샀다. 마음이 말랑해지는 것 같았다.",
      ],
      multi: [
        "오늘은 식물도 사고 다른 일도 했다. 괜히 집에 빨리 가고 싶었다.",
        "꽃도 사고 하루를 보냈다. 마음이 조금 환해졌다.",
        "예쁜 것도 사고 다른 일도 했다. 기분이 부드러워졌다.",
      ],
      high: [
        "오늘은 집을 예쁘게 하려고 제법 썼다. 그래도 보기 좋아서 만족했다.",
        "꽃과 식물에 돈을 썼다. 금액은 들었지만 마음은 참 좋았다.",
        "오늘은 예쁜 것을 들였다. 돈보다 기분이 더 크게 남았다.",
      ],
    },
  },
  {
    keywords: ["술", "와인", "맥주", "소주"],
    activity: {
      single: [
        "오늘은 마실 것을 샀다. 하루 끝에 마시면 좋을 것 같았다.",
        "오늘은 술을 샀다. 어른 같은 기분이 조금 났다.",
        "오늘은 한잔할 것을 챙겼다. 마음이 조금 느긋해졌다.",
      ],
      multi: [
        "오늘은 마실 것도 사고 다른 일도 했다. 오늘 밤이 조금 기대되었다.",
        "술도 사고 다른 것도 챙겼다. 괜히 하루가 길게 느껴졌다.",
        "오늘은 한잔할 준비도 하고 이것저것 했다. 소소하게 즐거웠다.",
      ],
      high: [
        "오늘은 마실 것에도 돈을 꽤 썼다. 그래도 기분 전환은 될 것 같다.",
        "술값도 생각보다 커졌다. 그래도 오늘은 그럴 만한 날이었다.",
        "오늘은 즐기려고 돈을 좀 썼다. 그래도 후회는 덜했다.",
      ],
    },
  },
  {
    keywords: ["선물", "기프티콘", "축하", "생일"],
    activity: {
      single: [
        "오늘은 누군가를 위해 선물을 샀다. 마음이 좋았다.",
        "오늘은 축하할 일이 있어 돈을 썼다. 참 반가운 마음이었다.",
        "오늘은 선물을 준비했다. 받는 사람이 좋아하면 좋겠다.",
      ],
      multi: [
        "오늘은 선물도 사고 다른 일도 했다. 괜히 마음이 따뜻했다.",
        "누군가를 위한 것도 챙기고 하루를 보냈다. 기분이 좋았다.",
        "축하할 준비도 하고 이것저것 했다. 바쁘지만 뿌듯했다.",
      ],
      high: [
        "오늘은 선물에 제법 돈을 썼다. 그래도 기쁜 일이라 괜찮았다.",
        "누군가를 위해 큰맘 먹고 샀다. 돈은 들었지만 즐거웠다.",
        "오늘은 선물값이 꽤 컸다. 그래도 마음은 아주 좋았다.",
      ],
    },
  },
  {
    keywords: ["유아", "아기", "육아", "기저귀", "분유"],
    activity: {
      single: [
        "오늘은 아기에게 필요한 것을 샀다. 참 소중한 소비였다.",
        "오늘은 작은 사람을 위해 돈을 썼다. 마음이 따뜻했다.",
        "오늘은 육아에 필요한 것을 챙겼다. 든든하면 좋겠다.",
      ],
      multi: [
        "오늘은 아기 것도 챙기고 다른 일도 했다. 손이 많이 가는 하루였다.",
        "육아용품도 사고 이것저것 했다. 바쁘지만 뿌듯했다.",
        "오늘은 작은 사람을 위한 것도 사고 하루를 보냈다. 마음이 따뜻했다.",
      ],
      high: [
        "오늘은 아기에게 필요한 것을 크게 챙겼다. 돈은 들었지만 꼭 필요했다.",
        "육아에 들어가는 돈이 꽤 컸다. 그래도 소중한 데 쓰는 거라 괜찮았다.",
        "오늘은 기저귀나 분유 같은 것을 많이 샀다. 든든하면 좋겠다.",
      ],
    },
  },
  {
    keywords: ["사무", "프린트", "복사", "오피스"],
    activity: {
      single: [
        "오늘은 일하는 데 필요한 것을 샀다. 조금 더 부지런해질 것 같았다.",
        "오늘은 사무용품에 돈을 썼다. 쓸모 있는 소비 같았다.",
        "오늘은 일할 때 필요한 것을 챙겼다. 참 든든했다.",
      ],
      multi: [
        "오늘은 일에 필요한 것도 사고 다른 일도 했다. 제법 바빴다.",
        "사무용품도 챙기고 하루를 보냈다. 책상이 조금 든든해질 것 같았다.",
        "오늘은 일 관련해서도 쓰고 다른 일도 했다. 꽤 알찬 날이었다.",
      ],
      high: [
        "오늘은 일하는 데 필요한 것들을 많이 샀다. 돈은 들었지만 잘 쓸 것 같다.",
        "업무용으로 이것저것 챙기다 보니 금액이 컸다. 그래도 필요한 소비였다.",
        "오늘은 사무용품에 꽤 썼다. 그래도 오래 쓰면 괜찮을 것 같다.",
      ],
    },
  },
  {
    keywords: ["수리", "정비", "교체", "as", "a/s"],
    activity: {
      single: [
        "오늘은 고장 난 것을 고쳤다. 다시 쓸 수 있어서 다행이었다.",
        "오늘은 수리비를 냈다. 아프지만 꼭 필요한 돈이었다.",
        "오늘은 망가진 것을 손봤다. 다시 멀쩡해지면 좋겠다.",
      ],
      multi: [
        "오늘은 수리도 하고 다른 일도 했다. 은근 바쁜 하루였다.",
        "고장 난 것도 챙기고 하루를 보냈다. 그래도 해결되어 다행이었다.",
        "오늘은 정비도 하고 다른 일도 했다. 손이 많이 간 날이었다.",
      ],
      high: [
        "오늘은 수리비가 꽤 컸다. 그래도 고쳐서 쓰는 게 더 나을 것 같았다.",
        "오늘은 고장 난 것 때문에 돈이 많이 나갔다. 조금 속상했다.",
        "오늘은 정비와 교체에 큰돈이 들었다. 그래도 해결되어 다행이었다.",
      ],
    },
  },
  {
    keywords: ["은행", "이체수수료", "수수료"],
    activity: {
      single: [
        "오늘은 수수료가 나갔다. 작지만 조금 아까웠다.",
        "오늘은 은행 관련 돈이 빠져나갔다. 괜히 아쉬웠다.",
        "오늘은 수수료를 냈다. 눈에 띄진 않지만 신경이 쓰였다.",
      ],
      multi: [
        "오늘은 수수료도 나가고 다른 돈도 썼다. 조금 아쉬운 하루였다.",
        "은행 관련 돈도 빠져나가고 다른 일도 있었다. 조용히 돈이 나갔다.",
        "오늘은 자잘한 비용도 생겼다. 모이면 꽤 클 것 같았다.",
      ],
      high: [
        "오늘은 이런저런 비용이 겹쳐서 아쉬웠다. 꼭 필요한 돈이긴 했다.",
        "오늘은 수수료까지 더해져서 금액이 커졌다. 조금 속상했다.",
        "오늘은 눈에 잘 안 띄는 돈도 꽤 나갔다. 괜히 아깝게 느껴졌다.",
      ],
    },
  },
];

function pickDiarySentence(pool: DiarySentencePool, seed: number) {
  if (typeof pool === "string") return pool;
  if (pool.length === 0) return "";
  return pool[Math.abs(seed) % pool.length] ?? pool[0];
}

type LoopMemoPattern = {
  keywords: string[];
  lines: string[];
};

const LOOP_MEMO_PATTERNS: LoopMemoPattern[] = [
  { keywords: ["관리비"], lines: ["관리비가 나갈 때가 된 것 같다.", "아파트 관리비를 챙길 날이 다가오는 것 같다.", "생활비 중 관리비가 다시 빠져나갈 것 같다."] },
  { keywords: ["보험"], lines: ["보험료가 빠져나갈 때가 된 것 같다.", "보험료를 다시 챙길 시기가 오는 것 같다.", "보험 쪽 돈이 또 나갈 것 같다."] },
  { keywords: ["세금"], lines: ["세금을 챙겨 낼 때가 된 것 같다.", "세금 낼 날이 다시 다가오는 것 같다.", "세금 관련 돈이 또 나갈 것 같다."] },
  { keywords: ["구독", "넷플릭스", "유튜브", "spotify", "티빙", "디즈니"], lines: ["구독 결제일이 다가오는 것 같다.", "구독비가 다시 빠져나갈 것 같다.", "보고 듣는 데 쓰는 돈이 또 나갈 것 같다."] },
  { keywords: ["주유"], lines: ["기름을 다시 넣을 때가 된 것 같다.", "주유할 날이 가까워지는 것 같다.", "차에 기름값이 또 들어갈 것 같다."] },
  { keywords: ["택시"], lines: ["택시비가 또 들 수 있을 것 같다.", "이동하다 보면 택시를 다시 탈 것 같다.", "택시 쓸 일이 또 생길 것 같다."] },
  { keywords: ["버스", "지하철", "교통"], lines: ["교통비가 또 나갈 것 같다.", "이동에 드는 돈이 다시 생길 것 같다.", "버스나 지하철 탈 일이 또 있을 것 같다."] },
  { keywords: ["마트", "장보기", "이마트", "홈플러스", "코스트코", "롯데마트"], lines: ["마트에 다시 갈 때가 된 것 같다.", "장을 다시 볼 날이 가까워지는 것 같다.", "먹을 것 사러 또 갈 것 같다."] },
  { keywords: ["쿠팡", "컬리", "쓱배송", "새벽배송"], lines: ["배송 주문을 다시 할 때가 된 것 같다.", "인터넷으로 또 시킬 일이 생길 것 같다.", "집으로 받을 것을 다시 주문할 것 같다."] },
  { keywords: ["세제"], lines: ["세제를 다시 챙길 때가 된 것 같다.", "세제 살 날이 다시 올 것 같다.", "집안일용품을 또 사야 할 것 같다."] },
  { keywords: ["샴푸"], lines: ["샴푸를 다시 살 때가 된 것 같다.", "샴푸가 슬슬 떨어질 것 같다.", "욕실용품을 다시 챙길 날이 올 것 같다."] },
  { keywords: ["로션"], lines: ["로션을 다시 살 때가 된 것 같다.", "로션을 또 챙길 시기가 오는 것 같다.", "바르는 것을 다시 살 날이 올 것 같다."] },
  { keywords: ["생필품"], lines: ["생활용품을 다시 챙길 때가 된 것 같다.", "집에 필요한 것을 또 사게 될 것 같다.", "생필품 살 날이 다시 올 것 같다."] },
  { keywords: ["병원", "치과", "한의원", "의원"], lines: ["병원 갈 일이 다시 생길 수도 있을 것 같다.", "몸 챙기러 다시 갈 수도 있을 것 같다.", "의료비가 또 들 수 있을 것 같다."] },
  { keywords: ["약국", "약"], lines: ["약을 다시 챙길 일이 생길 것 같다.", "약국에 또 들를 수도 있을 것 같다.", "몸 상태에 따라 약값이 다시 나갈 것 같다."] },
  { keywords: ["카페", "커피", "스타벅스", "메가커피", "빽다방"], lines: ["커피값이 또 나갈 것 같다.", "다시 카페에 들를 것 같다.", "커피 한잔 생각나는 날이 또 올 것 같다."] },
  { keywords: ["외식", "식비", "배달", "치킨", "피자", "햄버거"], lines: ["먹을 것에 또 돈을 쓸 것 같다.", "다시 사 먹는 날이 올 것 같다.", "식비가 또 나갈 것 같다."] },
  { keywords: ["의류", "옷", "쇼핑", "무신사", "지그재그", "에이블리"], lines: ["옷이나 쇼핑 비용이 또 들 것 같다.", "다시 사고 싶은 것이 생길 것 같다.", "쇼핑 욕심이 또 올라올 것 같다."] },
  { keywords: ["화장품", "올리브영"], lines: ["화장품을 다시 살 때가 된 것 같다.", "예뻐지는 데 돈이 또 들 것 같다.", "다시 올리브영에 갈 것 같다."] },
  { keywords: ["미용실", "헤어", "커트", "염색"], lines: ["머리를 하러 갈 때가 다시 올 것 같다.", "미용실 비용이 또 들 것 같다.", "머리 손질할 날이 가까워지는 것 같다."] },
  { keywords: ["반려", "사료", "고양이", "강아지", "펫"], lines: ["반려동물에게 필요한 것을 또 챙길 것 같다.", "사료나 간식을 다시 사야 할 것 같다.", "작은 가족을 위한 돈이 또 나갈 것 같다."] },
  { keywords: ["통신", "휴대폰", "인터넷"], lines: ["통신비가 다시 빠져나갈 것 같다.", "휴대폰이나 인터넷 요금이 또 나갈 것 같다.", "고정으로 나가는 통신비가 다시 올 것 같다."] },
  { keywords: ["전기", "가스", "수도"], lines: ["생활요금이 다시 나갈 것 같다.", "전기나 가스 같은 돈이 또 빠질 것 같다.", "집에 필요한 요금이 다시 찾아올 것 같다."] },
  { keywords: ["보험"], lines: ["보험료를 챙길 날이 다시 올 것 같다.", "미래를 위한 돈이 또 빠져나갈 것 같다.", "보험 관련 자동이체가 다시 있을 것 같다."] },
  { keywords: ["과일", "채소", "정육", "생선"], lines: ["먹을 재료를 다시 살 때가 된 것 같다.", "집밥 재료를 또 챙길 것 같다.", "냉장고 채울 날이 다시 올 것 같다."] },
  { keywords: ["안경", "렌즈", "콘택트"], lines: ["렌즈나 안경 관련 돈이 또 들 것 같다.", "눈에 필요한 것을 다시 챙길 것 같다.", "시야를 위한 소비가 또 생길 것 같다."] },
  { keywords: ["꽃", "화분", "식물"], lines: ["예쁜 것을 또 들이고 싶어질 것 같다.", "꽃이나 식물을 다시 살 수도 있을 것 같다.", "집에 초록색을 더 둘 날이 올 것 같다."] },
  { keywords: ["술", "와인", "맥주", "소주"], lines: ["마실 것에 돈을 또 쓸 것 같다.", "한잔 생각나는 날이 다시 올 것 같다.", "술값이 또 나갈 수도 있을 것 같다."] },
  { keywords: ["선물", "기프티콘", "축하", "생일"], lines: ["누군가를 위한 돈이 또 나갈 것 같다.", "선물 살 일이 다시 생길 것 같다.", "축하할 일이 또 찾아올 것 같다."] },
  { keywords: ["유아", "아기", "육아", "기저귀", "분유"], lines: ["아기에게 필요한 것을 또 챙길 것 같다.", "육아용품을 다시 사야 할 것 같다.", "작은 사람을 위한 돈이 또 나갈 것 같다."] },
  { keywords: ["사무", "프린트", "복사", "오피스"], lines: ["일하는 데 필요한 것을 또 살 것 같다.", "사무용품을 다시 챙길 때가 된 것 같다.", "업무용 돈이 또 나갈 것 같다."] },
  { keywords: ["수리", "정비", "교체", "as", "a/s"], lines: ["고친 뒤에도 다시 손볼 일이 생길 것 같다.", "수리비가 또 들 수 있을 것 같다.", "정비할 일이 다시 찾아올 것 같다."] },
  { keywords: ["은행", "이체수수료", "수수료"], lines: ["자잘한 수수료가 또 나갈 것 같다.", "은행 관련 비용이 다시 생길 것 같다.", "눈에 덜 띄는 돈이 또 빠져나갈 것 같다."] },
];

function createLoopMemo(loop: ManagedLoopGroup, categoryNameMap: Map<string, string>) {
  const categoryLabel = normalizeDiaryText(loop.categoryId ? categoryNameMap.get(loop.categoryId) ?? "" : "");
  const merchantName = normalizeDiaryText(loop.merchantName);
  const description = normalizeDiaryText(loop.descriptionSamples.join(" "));
  const joinedText = `${categoryLabel} ${merchantName} ${description}`;
  const seed = loop.latestAmount + loop.averageAmount + loop.transactionCount + loop.merchantName.length;

  for (const pattern of LOOP_MEMO_PATTERNS) {
    if (pattern.keywords.some((keyword) => joinedText.includes(keyword))) {
      return pickDiarySentence(pattern.lines, seed);
    }
  }

  return pickDiarySentence(
    [
      `${loop.merchantName} 관련 돈이 또 나갈 것 같다.`,
      `${loop.merchantName} 쪽으로 다시 돈이 들 것 같다.`,
      `${loop.merchantName}와 비슷한 소비가 또 생길 것 같다.`,
    ],
    seed,
  );
}

function getDiaryActivity(transaction: Transaction, getCategoryLabel: (transaction: Transaction) => string) {
  const categoryLabel = normalizeDiaryText(getCategoryLabel(transaction));
  const merchantName = normalizeDiaryText(transaction.merchantName);
  const description = normalizeDiaryText(transaction.description);
  const joinedText = `${categoryLabel} ${merchantName} ${description}`;
  for (const pattern of DIARY_PATTERNS) {
    if (pattern.keywords.some((keyword) => joinedText.includes(keyword))) {
      return pattern.activity;
    }
  }

  return {
    single: "오늘은 필요한 것을 샀다. 참 괜찮았다.",
    multi: "오늘은 필요한 것도 사고 다른 것도 챙겼다. 제법 알찬 하루였다.",
    high: "오늘은 필요한 곳에 돈을 꽤 썼다. 그래도 꼭 필요한 하루였다.",
  };
}

function createElementaryDiary(transactions: Transaction[], getCategoryLabel: (transaction: Transaction) => string) {
  const expenseTransactions = transactions
    .filter((transaction) => transaction.status === "active" && transaction.transactionType === "expense" && transaction.isExpenseImpact)
    .sort((left, right) => right.amount - left.amount);
  const totalAmount = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const count = expenseTransactions.length;
  const seed = expenseTransactions.reduce((sum, transaction) => sum + transaction.amount + transaction.merchantName.length, 0);

  if (count === 0) return `돈을 거의 안 썼다. 조용해서 참 다행이었다.`;

  const leadTransaction = expenseTransactions[0];
  const activity = getDiaryActivity(leadTransaction, getCategoryLabel);

  if (count === 1) {
    return pickDiarySentence(activity.single, seed);
  }

  if (totalAmount >= 50000) {
    return pickDiarySentence(activity.high, seed);
  }

  if (count >= 3) {
    return pickDiarySentence(activity.multi, seed);
  }

  return pickDiarySentence(activity.multi, seed + count);
}

function createDiaryCells(text: string, minimumLength = 70, columns = 10, leadingBlankRows = 1, prefixText = "") {
  const characters = Array.from(`${prefixText}${text}`);
  const leadingBlanks = columns * leadingBlankRows;
  const totalLength = Math.max(minimumLength, leadingBlanks + characters.length);
  const safeLength = Math.ceil(totalLength / columns) * columns;
  return Array.from({ length: safeLength }, (_, index) => {
    const characterIndex = index - leadingBlanks;
    return characterIndex >= 0 ? characters[characterIndex] ?? "" : "";
  });
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
  const {
    applyReviewSuggestion,
    commitImportedBundle,
    deleteImportRecord,
    previewWorkbookImport,
    resolveReview,
    setTransactionLoopFlagBatch,
    state,
    workspaceLoopDataByWorkspaceId,
    updateTransactionDetails,
    updateTransactionFlags,
    assignCategory,
    clearCategory,
  } = useAppState();
  const navigate = useNavigate();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentMonth = monthKey(new Date());
  const [remoteDashboardInsightsByMonth, setRemoteDashboardInsightsByMonth] = useState<Record<string, AnalysisWorkspaceInsightsResponse>>({});
  const monthOptions = useMemo(
    () =>
      Array.from(new Set(scope.transactions.map((transaction) => transaction.occurredAt.slice(0, 7)).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [scope.transactions],
  );
  const latestStatementMonth = useMemo(() => getLatestStatementMonth(scope.imports), [scope.imports]);
  const forecastCalendarMonth = useMemo(
    () => (latestStatementMonth ? getNextMonthKey(latestStatementMonth) : null),
    [latestStatementMonth],
  );
  const monthScopeOptions = useMemo<DashboardScopeOption[]>(
    () => monthOptions.map((month) => ({ value: month, label: formatMonthLabel(month) })),
    [monthOptions],
  );
  const calendarMonthOptions = useMemo(
    () =>
      Array.from(new Set([...monthOptions, ...(forecastCalendarMonth ? [forecastCalendarMonth] : [])]))
        .sort((a, b) => b.localeCompare(a))
        .map((month) => ({ value: month, label: formatMonthLabel(month) })),
    [forecastCalendarMonth, monthOptions],
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
  const recentImports = useMemo(() => [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)), [scope.imports]);
  const statementScopeOptions = useMemo(
    () => getStatementScopeOptions(scope.imports, linkedImportRecordIds),
    [linkedImportRecordIds, scope.imports],
  );
  const calendarOwnerOptions = useMemo(
    () => [
      { value: "all", label: "우리의 소비" },
      ...scope.people
        .filter((person) => !person.isHidden)
        .sort(compareBySortOrder)
        .map((person) => {
          const personLabel = getPersonLabel(person);
          return {
            value: person.id,
            label: `${personLabel}의 소비`,
          };
        }),
    ],
    [scope.people],
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
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() =>
    calendarMonthOptions.some((option) => option.value === currentMonth) ? currentMonth : calendarMonthOptions[0]?.value ?? currentMonth,
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
    const today = new Date();
    return `${monthKey(today)}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [selectedCalendarOwnerId, setSelectedCalendarOwnerId] = useState("all");
  const [isDashboardCalendarUncategorizedOnly, setIsDashboardCalendarUncategorizedOnly] = useState(false);
  const [isDashboardCalendarAutoReviewOnly, setIsDashboardCalendarAutoReviewOnly] = useState(false);
  const [dashboardCalendarProcessingMode, setDashboardCalendarProcessingMode] =
    useState<DashboardCalendarProcessingMode>(null);
  const [pendingDashboardCalendarProcessingMode, setPendingDashboardCalendarProcessingMode] =
    useState<DashboardCalendarProcessingMode>(null);
  const [dashboardReviewWorkflow, setDashboardReviewWorkflow] = useState<DashboardReviewWorkflowState | null>(null);
  const [dashboardUncategorizedFocusTransactionId, setDashboardUncategorizedFocusTransactionId] = useState<string | null>(null);
  const [dashboardCalendarFocusedField, setDashboardCalendarFocusedField] = useState<DashboardCalendarFocusedField>(null);
  const [loopConfirmState, setLoopConfirmState] = useState<LoopConfirmState | null>(null);
  const [loopConfirmDragMode, setLoopConfirmDragMode] = useState<boolean | null>(null);
  const [selectedStatementHistoryYear, setSelectedStatementHistoryYear] = useState(String(new Date().getFullYear()));
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isStatementUploadModalOpen, setIsStatementUploadModalOpen] = useState(false);
  const [isMobileCalendarSwipeViewport, setIsMobileCalendarSwipeViewport] = useState(false);
  const [calendarSwipeViewportWidth, setCalendarSwipeViewportWidth] = useState(0);
  const [calendarSwipeOffset, setCalendarSwipeOffset] = useState(0);
  const [isCalendarSwipeDragging, setIsCalendarSwipeDragging] = useState(false);
  const [isCalendarSwipeAnimating, setIsCalendarSwipeAnimating] = useState(false);
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [selectedImportOwnerId, setSelectedImportOwnerId] = useState("");
  const [selectedStatementMonth, setSelectedStatementMonth] = useState("");
  const [importCardNameDrafts, setImportCardNameDrafts] = useState<Record<string, string>>({});
  const [importCardLinkedAccountDrafts, setImportCardLinkedAccountDrafts] = useState<Record<string, string>>({});
  const [isLinkedAccountModalOpen, setIsLinkedAccountModalOpen] = useState(false);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [isDropzoneInvalid, setIsDropzoneInvalid] = useState(false);
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
  const { getPresenceForTarget } = useDotoriPresenceLocks(mode === "dashboard" ? "첫장" : "돌아보기");
  const annualMonthFadeTimerRef = useRef<number | null>(null);
  const annualMonthHideTimerRef = useRef<number | null>(null);
  const annualTrendFadeTimerRef = useRef<number | null>(null);
  const annualTrendHideTimerRef = useRef<number | null>(null);
  const statementImportDragDepthRef = useRef(0);
  const statementImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardCalendarTransactionsRef = useRef<HTMLDivElement | null>(null);
  const calendarSwipeViewportRef = useRef<HTMLDivElement | null>(null);
  const calendarSwipePointerIdRef = useRef<number | null>(null);
  const calendarSwipeStartXRef = useRef<number | null>(null);
  const calendarSwipeStartYRef = useRef<number | null>(null);
  const calendarSwipeOffsetRef = useRef(0);
  const calendarSwipeIsDraggingRef = useRef(false);
  const calendarSwipeSuppressClickRef = useRef(false);
  const calendarSwipeAnimationTimerRef = useRef<number | null>(null);
  const shouldScrollCalendarTransactionsRef = useRef(false);
  const previewStatementMonthOptions = useMemo(() => getPreviewStatementMonthOptions(previewBundle), [previewBundle]);
  const defaultPreviewStatementMonth = previewStatementMonthOptions.at(-1) ?? "";
  const previewCardMatches = useMemo(
    () =>
      (previewBundle?.cards ?? []).map((card) => {
        const matchedCard = findMatchedCard(scope.cards, card, selectedImportOwnerId || null);
        return {
          card,
          matchedCard,
          draftName: importCardNameDrafts[card.id] ?? card.name,
        };
      }),
    [importCardNameDrafts, previewBundle, scope.cards, selectedImportOwnerId],
  );
  const previewCardMatchMap = useMemo(() => new Map(previewCardMatches.map((entry) => [entry.card.id, entry])), [previewCardMatches]);
  const newCreditPreviewCards = useMemo(
    () => previewCardMatches.filter(({ card, matchedCard }) => !matchedCard && card.cardType === "credit"),
    [previewCardMatches],
  );
  const linkedAccountCandidates = useMemo(
    () =>
      previewBundle && selectedImportOwnerId
        ? buildLinkedAccountCandidates(scope.accounts, previewBundle.accounts, selectedImportOwnerId)
        : EMPTY_LINKED_ACCOUNT_CANDIDATES,
    [previewBundle, scope.accounts, selectedImportOwnerId],
  );
  const shouldPromptLinkedAccounts = newCreditPreviewCards.length > 0 && linkedAccountCandidates.length > 0;
  const importHistoryByYear = useMemo(() => {
    const yearMap = new Map<string, ImportRecord[]>();
    recentImports.forEach((record) => {
      const yearKey = (record.statementMonth || record.importedAt.slice(0, 4) || "기타").slice(0, 4);
      const current = yearMap.get(yearKey) ?? [];
      current.push(record);
      yearMap.set(yearKey, current);
    });
    return [...yearMap.entries()].sort((a, b) => b[0].localeCompare(a[0], "ko"));
  }, [recentImports]);
  const importHistoryYears = useMemo(() => {
    const years = importHistoryByYear.map(([year]) => year);
    const currentYear = String(new Date().getFullYear());
    return years.includes(currentYear) ? years : [currentYear, ...years];
  }, [importHistoryByYear]);
  const visibleStatementHistoryRecords = useMemo(
    () => importHistoryByYear.find(([year]) => year === selectedStatementHistoryYear)?.[1] ?? [],
    [importHistoryByYear, selectedStatementHistoryYear],
  );
  const visibleStatementHistoryMonthGroups = useMemo(() => {
    const monthMap = new Map<string, ImportRecord[]>();
    visibleStatementHistoryRecords.forEach((record) => {
      const monthKeyValue = record.statementMonth?.slice(0, 7) || record.importedAt.slice(0, 7);
      const current = monthMap.get(monthKeyValue) ?? [];
      current.push(record);
      monthMap.set(monthKeyValue, current);
    });
    return [...monthMap.entries()]
      .sort((left, right) => right[0].localeCompare(left[0], "ko"))
      .map(([month, records]) => ({ month, records }));
  }, [visibleStatementHistoryRecords]);
  const nextPresenceTarget = useMemo(() => {
    const processingActivityLabel =
      dashboardCalendarProcessingMode === "review"
        ? "자동검토 처리 중"
        : dashboardCalendarProcessingMode === "uncategorized"
          ? "분류 작업 중"
          : null;

    if (dashboardCalendarFocusedField && selectedCalendarDate) {
      const fieldActivityLabel =
        dashboardCalendarFocusedField.field === "category"
          ? "카테고리 분류 중"
          : dashboardCalendarFocusedField.field === "note"
            ? "비고 입력 중"
            : "루프 확인 중";
      return {
        kind: "calendar-cell",
        id: `${selectedCalendarDate}|${dashboardCalendarFocusedField.transactionId}|${dashboardCalendarFocusedField.field}`,
        label: `${selectedCalendarDate} ${dashboardCalendarFocusedField.field}`,
        activityLabel: processingActivityLabel ?? fieldActivityLabel,
      };
    }
    if (!selectedCalendarDate) {
      return { kind: null, id: null, label: null };
    }
    return {
      kind: "calendar-date",
      id: selectedCalendarDate,
      label: selectedCalendarDate,
      activityLabel: processingActivityLabel ?? "날짜 확인 중",
    };
  }, [dashboardCalendarFocusedField, dashboardCalendarProcessingMode, selectedCalendarDate]);

  useSyncDotoriPresenceTarget(nextPresenceTarget);

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
    const nextYear = importHistoryYears.includes(selectedStatementHistoryYear)
      ? selectedStatementHistoryYear
      : importHistoryYears[0] ?? String(new Date().getFullYear());
    if (nextYear !== selectedStatementHistoryYear) {
      setSelectedStatementHistoryYear(nextYear);
    }
  }, [importHistoryYears, selectedStatementHistoryYear]);

  useEffect(() => {
    const nextSelectedCalendarMonth = calendarMonthOptions.some((option) => option.value === selectedCalendarMonth)
      ? selectedCalendarMonth
      : calendarMonthOptions.some((option) => option.value === currentMonth)
        ? currentMonth
        : calendarMonthOptions[0]?.value ?? currentMonth;

    if (nextSelectedCalendarMonth !== selectedCalendarMonth) {
      setSelectedCalendarMonth(nextSelectedCalendarMonth);
    }
  }, [calendarMonthOptions, currentMonth, selectedCalendarMonth]);

  useEffect(() => {
    if (selectedCalendarOwnerId === "all") return;
    if (calendarOwnerOptions.some((option) => option.value === selectedCalendarOwnerId)) return;
    setSelectedCalendarOwnerId("all");
  }, [calendarOwnerOptions, selectedCalendarOwnerId]);

  useEffect(() => {
    if (!previewBundle) {
      setSelectedImportOwnerId((current) => (current === "" ? current : ""));
      return;
    }

    if (scope.people.length === 1) {
      const onlyPersonId = scope.people[0]?.id ?? "";
      if (selectedImportOwnerId !== onlyPersonId) {
        setSelectedImportOwnerId(onlyPersonId);
      }
      return;
    }

    if (selectedImportOwnerId && scope.people.some((person) => person.id === selectedImportOwnerId)) return;
    setSelectedImportOwnerId((current) => (current === "" ? current : ""));
  }, [previewBundle, scope.people, selectedImportOwnerId]);

  useEffect(() => {
    if (!previewBundle) {
      setSelectedStatementMonth((current) => (current === "" ? current : ""));
      return;
    }

    if (selectedStatementMonth && previewStatementMonthOptions.includes(selectedStatementMonth)) return;
    setSelectedStatementMonth((current) => (current === defaultPreviewStatementMonth ? current : defaultPreviewStatementMonth));
  }, [defaultPreviewStatementMonth, previewBundle, previewStatementMonthOptions, selectedStatementMonth]);

  useEffect(() => {
    if (!previewBundle || !shouldPromptLinkedAccounts) {
      setImportCardLinkedAccountDrafts((current) => (Object.keys(current).length === 0 ? current : {}));
      setIsLinkedAccountModalOpen(false);
      return;
    }

    const validCardIds = new Set(newCreditPreviewCards.map(({ card }) => card.id));
    const validAccountIds = new Set(linkedAccountCandidates.map((account) => account.id));
    const defaultAccountId = linkedAccountCandidates.length === 1 ? linkedAccountCandidates[0]?.id ?? "" : "";

    setImportCardLinkedAccountDrafts((current) => {
      const nextDrafts: Record<string, string> = {};
      let changed = false;

      newCreditPreviewCards.forEach(({ card }) => {
        const hasCurrentSelection = Object.prototype.hasOwnProperty.call(current, card.id);
        const currentValue = current[card.id] ?? "";
        const nextValue =
          hasCurrentSelection && (!currentValue || validAccountIds.has(currentValue)) ? currentValue : defaultAccountId;
        nextDrafts[card.id] = nextValue;
        if (nextValue !== currentValue) changed = true;
      });

      Object.keys(current).forEach((cardId) => {
        if (!validCardIds.has(cardId)) changed = true;
      });

      if (!changed && Object.keys(current).length === Object.keys(nextDrafts).length) {
      return current;
      }
      return nextDrafts;
    });
  }, [linkedAccountCandidates, newCreditPreviewCards, previewBundle, shouldPromptLinkedAccounts]);

  const resetDropzoneState = () => {
    statementImportDragDepthRef.current = 0;
    setIsDropzoneActive(false);
    setIsDropzoneInvalid(false);
  };

  const resetFileInput = () => {
    if (statementImportFileInputRef.current) {
      statementImportFileInputRef.current.value = "";
    }
  };

  const clearPreview = () => {
    setPreviewBundle(null);
    setPreviewFileName("");
    setSelectedImportOwnerId("");
    setSelectedStatementMonth("");
    setImportCardNameDrafts({});
    setImportCardLinkedAccountDrafts({});
    setIsLinkedAccountModalOpen(false);
    resetFileInput();
  };

  const preparePreview = async (file: File) => {
    setIsPreparingPreview(true);
    resetDropzoneState();
    try {
      const bundle = await previewWorkbookImport(file);
      setPreviewBundle(bundle);
      setPreviewFileName(file.name);
      setSelectedImportOwnerId("");
      setSelectedStatementMonth("");
      setImportCardNameDrafts(Object.fromEntries(bundle.cards.map((card) => [card.id, card.name])));
      setImportCardLinkedAccountDrafts({});
      setIsLinkedAccountModalOpen(false);
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handlePickedFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!isWorkbookFile(file)) {
      setIsDropzoneInvalid(true);
      setIsDropzoneActive(false);
      return;
    }
    await preparePreview(file);
  };

  const handleDropzoneDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    statementImportDragDepthRef.current += 1;
    setIsDropzoneActive(true);
  };

  const handleDropzoneDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    const isValid = !file || isWorkbookFile(file);
    event.dataTransfer.dropEffect = isValid ? "copy" : "none";
    setIsDropzoneActive(true);
    setIsDropzoneInvalid(!isValid);
  };

  const handleDropzoneDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    statementImportDragDepthRef.current = Math.max(0, statementImportDragDepthRef.current - 1);
    if (statementImportDragDepthRef.current === 0) {
      setIsDropzoneActive(false);
      setIsDropzoneInvalid(false);
    }
  };

  const handleDropzoneDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    resetDropzoneState();
    await handlePickedFile(file);
  };

  const commitPreview = () => {
    if (!previewBundle || !selectedImportOwnerId || !selectedStatementMonth) return;

    const renamedCards = previewBundle.cards.map((card) => {
      const matchedCard = previewCardMatchMap.get(card.id)?.matchedCard ?? null;
      const selectedLinkedAccountId = importCardLinkedAccountDrafts[card.id] || null;

      return {
        ...card,
        name: matchedCard?.name ?? ((importCardNameDrafts[card.id] ?? card.name).trim() || card.name),
        linkedAccountId: matchedCard?.linkedAccountId ?? selectedLinkedAccountId ?? card.linkedAccountId ?? null,
      };
    });
    const linkedAccountIdByPreviewCardId = new Map(renamedCards.map((card) => [card.id, card.linkedAccountId ?? null]));

    const normalizedBundle: WorkspaceBundle = {
      ...previewBundle,
      people: [],
      imports: previewBundle.imports.map((record, index) =>
        index === 0
          ? {
              ...record,
              statementMonth: selectedStatementMonth,
            }
          : record,
      ),
      accounts: previewBundle.accounts.map((account) => ({
        ...account,
        ownerPersonId: account.isShared ? null : selectedImportOwnerId,
      })),
      cards: renamedCards.map((card) => ({
        ...card,
        ownerPersonId: selectedImportOwnerId,
      })),
      transactions: previewBundle.transactions.map((transaction) => ({
        ...transaction,
        ownerPersonId: selectedImportOwnerId,
        accountId: transaction.cardId ? linkedAccountIdByPreviewCardId.get(transaction.cardId) ?? transaction.accountId : transaction.accountId,
      })),
    };

    commitImportedBundle(normalizedBundle, previewFileName);
    clearPreview();
  };

  const handleCommitPreview = () => {
    if (!previewBundle || !selectedImportOwnerId || !selectedStatementMonth) return;
    if (shouldPromptLinkedAccounts) {
      setIsLinkedAccountModalOpen(true);
      return;
    }
    commitPreview();
  };

  const handleDeleteImportRecord = (record: ImportRecord) => {
    if (!linkedImportRecordIds.has(record.id)) return;
    const confirmed = window.confirm(`${getStatementRecordLabel(record)} 명세서를 삭제할까요?\n관련 결제내역과 검토 기록도 함께 삭제됩니다.`);
    if (!confirmed) return;
    deleteImportRecord(workspaceId, record.id);
  };

  const handleOpenStatementUploadModal = () => {
    setIsStatementUploadModalOpen(true);
  };

  const handleCloseStatementUploadModal = () => {
    setIsStatementUploadModalOpen(false);
    setIsLinkedAccountModalOpen(false);
    resetDropzoneState();
  };

  const dropzoneTitle = isDropzoneInvalid
    ? "엑셀 파일만 업로드할 수 있어요"
    : isDropzoneActive
      ? "여기에 파일을 놓으면 미리보기를 준비합니다"
      : "클릭하거나 파일을 끌어놓으세요";

  const dropzoneDescription = isDropzoneInvalid
    ? "지원 형식: .xlsx, .xls"
    : "미리보기에서 거래 수, 검토 수, 자산 정보를 먼저 확인합니다.";

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

  const localInsights = getWorkspaceInsights(state, workspaceId, {
    basis: selectedDashboardBasis,
    label: selectedDashboardScopeLabel,
    transactions: selectedDashboardTransactions,
    incomeEntries: selectedDashboardIncomeEntries,
  });
  const selectedDashboardRemoteMonthKey =
    selectedDashboardBasis === "statement" ? selectedDashboardStatement : selectedDashboardMonth;
  const insights = mergeWorkspaceInsights(
    localInsights,
    selectedDashboardRemoteMonthKey && selectedDashboardRemoteMonthKey !== UNSPECIFIED_STATEMENT_KEY
      ? remoteDashboardInsightsByMonth[selectedDashboardRemoteMonthKey] ?? null
      : null,
  );
  const currentMonthTransactions = useMemo(
    () => scope.transactions.filter((transaction) => monthKey(transaction.occurredAt) === currentMonth),
    [currentMonth, scope.transactions],
  );
  const selectedCalendarSummaryTransactions = useMemo(
    () =>
      scope.transactions.filter(
        (transaction) =>
          monthKey(transaction.occurredAt) === selectedCalendarMonth &&
          (selectedCalendarOwnerId === "all" ? true : transaction.ownerPersonId === selectedCalendarOwnerId),
      ),
    [scope.transactions, selectedCalendarMonth, selectedCalendarOwnerId],
  );
  const selectedCalendarSummaryIncomeEntries = useMemo(
    () =>
      scope.incomeEntries.filter(
        (entry) =>
          monthKey(entry.occurredAt) === selectedCalendarMonth &&
          (selectedCalendarOwnerId === "all" ? true : entry.ownerPersonId === selectedCalendarOwnerId),
      ),
    [scope.incomeEntries, selectedCalendarMonth, selectedCalendarOwnerId],
  );
  const selectedCalendarPreviousMonth = useMemo(
    () => getPreviousMonthKey(selectedCalendarMonth),
    [selectedCalendarMonth],
  );
  const selectedCalendarPreviousTransactions = useMemo(
    () =>
      scope.transactions.filter(
        (transaction) =>
          monthKey(transaction.occurredAt) === selectedCalendarPreviousMonth &&
          (selectedCalendarOwnerId === "all" ? true : transaction.ownerPersonId === selectedCalendarOwnerId),
      ),
    [scope.transactions, selectedCalendarOwnerId, selectedCalendarPreviousMonth],
  );
  const selectedCalendarPreviousIncomeEntries = useMemo(
    () =>
      scope.incomeEntries.filter(
        (entry) =>
          monthKey(entry.occurredAt) === selectedCalendarPreviousMonth &&
          (selectedCalendarOwnerId === "all" ? true : entry.ownerPersonId === selectedCalendarOwnerId),
      ),
    [scope.incomeEntries, selectedCalendarOwnerId, selectedCalendarPreviousMonth],
  );
  const localSelectedCalendarInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "month",
    label: formatMonthLabel(selectedCalendarMonth),
    transactions: selectedCalendarSummaryTransactions,
    incomeEntries: selectedCalendarSummaryIncomeEntries,
  });
  const selectedCalendarInsights = mergeWorkspaceInsights(
    localSelectedCalendarInsights,
    remoteDashboardInsightsByMonth[selectedCalendarMonth] ?? null,
  );
  const localSelectedCalendarPreviousInsights = getWorkspaceInsights(state, workspaceId, {
    basis: "month",
    label: formatMonthLabel(selectedCalendarPreviousMonth),
    transactions: selectedCalendarPreviousTransactions,
    incomeEntries: selectedCalendarPreviousIncomeEntries,
  });
  const selectedCalendarPreviousInsights = mergeWorkspaceInsights(
    localSelectedCalendarPreviousInsights,
    remoteDashboardInsightsByMonth[selectedCalendarPreviousMonth] ?? null,
  );
  const selectedCalendarExpenseTotal = useMemo(
    () => getExpenseImpactStats(selectedCalendarSummaryTransactions).activeExpenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [selectedCalendarSummaryTransactions],
  );
  const selectedCalendarPreviousExpenseTotal = useMemo(
    () => getExpenseImpactStats(selectedCalendarPreviousTransactions).activeExpenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [selectedCalendarPreviousTransactions],
  );
  const selectedCalendarImportRecordIds = useMemo(
    () =>
      new Set(
        selectedCalendarSummaryTransactions
          .map((transaction) => transaction.importRecordId)
          .filter((importRecordId): importRecordId is string => Boolean(importRecordId)),
      ),
    [selectedCalendarSummaryTransactions],
  );
  const selectedCalendarImportCount = selectedCalendarImportRecordIds.size;
  const selectedCalendarIncomeDelta = selectedCalendarInsights.income - selectedCalendarPreviousInsights.income;
  const selectedCalendarExpenseDelta = selectedCalendarExpenseTotal - selectedCalendarPreviousExpenseTotal;
  const selectedCalendarBalance = selectedCalendarInsights.income - selectedCalendarExpenseTotal;
  const selectedCalendarPreviousBalance = selectedCalendarPreviousInsights.income - selectedCalendarPreviousExpenseTotal;
  const selectedCalendarSavingsDelta = selectedCalendarBalance - selectedCalendarPreviousBalance;
  const selectedCalendarIncomeBadge = getDeltaBadge(selectedCalendarIncomeDelta, true);
  const selectedCalendarExpenseBadge = getDeltaBadge(selectedCalendarExpenseDelta, false);
  const selectedCalendarSavingsBadge = getDeltaBadge(selectedCalendarSavingsDelta, true);
  const selectedCalendarReviewBadge = getCompletionBadge(selectedCalendarInsights.reviewCount);
  const selectedCalendarUncategorizedBadge = getCompletionBadge(selectedCalendarInsights.uncategorizedCount);
  const selectedCalendarReviewPending = selectedCalendarInsights.reviewCount > 0;
  const selectedCalendarUncategorizedPending = selectedCalendarInsights.uncategorizedCount > 0;
  const previousDashboardScopeMonth = useMemo(() => {
    if (selectedDashboardBasis === "statement") {
      if (!selectedDashboardStatement || selectedDashboardStatement === UNSPECIFIED_STATEMENT_KEY) return "";
      return getPreviousMonthKey(selectedDashboardStatement);
    }

    return getPreviousMonthKey(selectedDashboardMonth);
  }, [selectedDashboardBasis, selectedDashboardMonth, selectedDashboardStatement]);
  useEffect(() => {
    if (!isAnalysisApiConfigured()) return;

    const requestedMonths = Array.from(
      new Set(
        [
          selectedDashboardBasis === "statement" ? selectedDashboardStatement : selectedDashboardMonth,
          previousDashboardScopeMonth,
          selectedCalendarMonth,
          selectedCalendarPreviousMonth,
        ].filter((value) => Boolean(value) && value !== UNSPECIFIED_STATEMENT_KEY),
      ),
    );

    if (!requestedMonths.length) return;

    const controller = new AbortController();

    void Promise.all(
      requestedMonths.map(async (value) => {
        const response = await fetchWorkspaceInsights(value, controller.signal);
        return [value, response] as const;
      }),
    )
      .then((entries) => {
        setRemoteDashboardInsightsByMonth((current) => {
          const next = { ...current };
          entries.forEach(([monthValue, response]) => {
            next[monthValue] = response;
          });
          return next;
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("dashboard analysis fetch failed", error);
      });

    return () => controller.abort();
  }, [
    previousDashboardScopeMonth,
    selectedCalendarMonth,
    selectedCalendarPreviousMonth,
    selectedDashboardBasis,
    selectedDashboardMonth,
    selectedDashboardStatement,
  ]);
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
  const localPreviousDashboardInsights = getWorkspaceInsights(state, workspaceId, {
    basis: selectedDashboardBasis,
    label:
      selectedDashboardBasis === "statement"
        ? formatStatementMonthLabel(previousDashboardScopeMonth || selectedDashboardScopeValue)
        : formatMonthLabel(previousDashboardScopeMonth || selectedDashboardScopeValue),
    transactions: previousDashboardTransactions,
    incomeEntries: previousDashboardIncomeEntries,
  });
  const previousDashboardInsights = mergeWorkspaceInsights(
    localPreviousDashboardInsights,
    previousDashboardScopeMonth ? remoteDashboardInsightsByMonth[previousDashboardScopeMonth] ?? null : null,
  );
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
  const managedLoops = workspaceLoopDataByWorkspaceId.get(workspaceId)?.managedLoops ?? [];
  const loopStationInsights = workspaceLoopDataByWorkspaceId.get(workspaceId)?.loopInsights ?? [];
  const featuredLoopStationInsights = loopStationInsights.slice(0, 6);
  const categoryNameMap = useMemo(
    () => new Map(scope.categories.map((category) => [category.id, category.name])),
    [scope.categories],
  );
  const categoryLabelMap = useMemo(() => {
    const categoryMap = new Map(scope.categories.map((category) => [category.id, category]));
    return new Map(
      scope.categories
        .filter((category) => category.categoryType === "category")
        .map((category) => [category.id, getCategoryLabel(category, categoryMap)]),
    );
  }, [scope.categories]);
  const loopInsightByGroupKey = useMemo(
    () => new Map(loopStationInsights.map((item) => [item.groupKey, item])),
    [loopStationInsights],
  );
  const calendarMonthValue = selectedCalendarMonth || currentMonth;
  const calendarExpenseTransactions = useMemo(
    () =>
      scope.transactions.filter(
        (transaction) =>
          transaction.status === "active" &&
          transaction.transactionType === "expense" &&
          transaction.isExpenseImpact &&
          monthKey(transaction.occurredAt) === calendarMonthValue &&
          (selectedCalendarOwnerId === "all" ? true : transaction.ownerPersonId === selectedCalendarOwnerId),
      ),
    [calendarMonthValue, scope.transactions, selectedCalendarOwnerId],
  );
  const calendarSwipeMonthKeys = useMemo(
    () => [getPreviousMonthKey(calendarMonthValue), calendarMonthValue, getNextMonthKey(calendarMonthValue)],
    [calendarMonthValue],
  );
  const calendarCellsByMonth = useMemo(() => {
    const monthSet = new Set(calendarSwipeMonthKeys);
    const transactionsByMonth = new Map<string, Transaction[]>();
    monthSet.forEach((month) => {
      transactionsByMonth.set(month, []);
    });

    scope.transactions.forEach((transaction) => {
      if (
        transaction.status !== "active" ||
        transaction.transactionType !== "expense" ||
        !transaction.isExpenseImpact ||
        (selectedCalendarOwnerId === "all" ? false : transaction.ownerPersonId !== selectedCalendarOwnerId)
      ) {
        if (selectedCalendarOwnerId === "all") {
          if (
            transaction.status !== "active" ||
            transaction.transactionType !== "expense" ||
            !transaction.isExpenseImpact
          ) {
            return;
          }
        } else {
          return;
        }
      }

      const targetMonth = monthKey(transaction.occurredAt);
      if (!monthSet.has(targetMonth)) return;
      transactionsByMonth.get(targetMonth)?.push(transaction);
    });

    const cellsByMonth = new Map<string, CalendarCell[]>();
    monthSet.forEach((targetMonth) => {
      const transactionMap = new Map<string, { expenseAmount: number; transactionCount: number; merchants: string[] }>();
      (transactionsByMonth.get(targetMonth) ?? []).forEach((transaction) => {
        const dateKey = transaction.occurredAt.slice(0, 10);
        const merchantName = transaction.merchantName.trim() || "이름 없는 결제";
        const current = transactionMap.get(dateKey) ?? { expenseAmount: 0, transactionCount: 0, merchants: [] };
        current.expenseAmount += transaction.amount;
        current.transactionCount += 1;
        if (!current.merchants.includes(merchantName) && current.merchants.length < 2) {
          current.merchants.push(merchantName);
        }
        transactionMap.set(dateKey, current);
      });

      const loopMemoMap = new Map<string, Map<string, CalendarMemo>>();
      const addLoopMemo = (dateKey: string, merchantName: string, text: string) => {
        const current = loopMemoMap.get(dateKey) ?? new Map<string, CalendarMemo>();
        const existing = current.get(text);
        if (existing) {
          if (!existing.merchantNames.includes(merchantName)) {
            existing.merchantNames.push(merchantName);
          }
        } else {
          current.set(text, { text, merchantNames: [merchantName] });
        }
        loopMemoMap.set(dateKey, current);
      };

      managedLoops.forEach((loop) => {
        const insight = loopInsightByGroupKey.get(loop.key);
        const text = createLoopMemo(loop, categoryNameMap);

        let hasActualLoopTransactionInMonth = false;
        loop.transactions.forEach((transaction) => {
          const occurredDateKey = transaction.occurredAt.slice(0, 10);
          if (!occurredDateKey.startsWith(targetMonth)) return;
          hasActualLoopTransactionInMonth = true;
          addLoopMemo(occurredDateKey, loop.merchantName, text);
        });

        if (!hasActualLoopTransactionInMonth && insight) {
          const projectedLoopDate = getLoopProjectedDateWithinMonth(
            insight.latestOccurredAt,
            insight.averageIntervalDays,
            targetMonth,
            latestStatementMonth,
          );
          if (projectedLoopDate) {
            addLoopMemo(projectedLoopDate, loop.merchantName, text);
          }
        }
      });

      cellsByMonth.set(
        targetMonth,
        getCalendarDays(targetMonth).map((day) => {
          const expenseAmount = transactionMap.get(day.dateKey)?.expenseAmount ?? 0;
          const transactionCount = transactionMap.get(day.dateKey)?.transactionCount ?? 0;
          const merchants = transactionMap.get(day.dateKey)?.merchants ?? [];
          const memos = [...(loopMemoMap.get(day.dateKey)?.values() ?? [])];
          const holidayLabel = getFixedHolidayLabel(day.dateKey);
          const chips: CalendarChip[] = [];

          if (holidayLabel) {
            chips.push({ label: holidayLabel, tone: "holiday" });
          }
          if (merchants[0] && transactionCount) {
            chips.push({
              label: `${merchants[0]}${transactionCount > 1 ? ` 외 ${transactionCount - 1}건` : ""}`,
              tone: "expense",
            });
          }
          memos.slice(0, 1).forEach((memo) => {
            chips.push({ label: memo.text, tone: "memo" });
          });

          return {
            ...day,
            expenseAmount,
            transactionCount,
            merchants,
            holidayLabel,
            chips,
            memos,
          };
        }),
      );
    });

    return cellsByMonth;
  }, [calendarSwipeMonthKeys, categoryNameMap, latestStatementMonth, loopInsightByGroupKey, managedLoops, scope.transactions, selectedCalendarOwnerId]);
  const calendarCells = calendarCellsByMonth.get(calendarMonthValue) ?? [];
  const selectedCalendarIndex = Math.max(0, calendarCells.findIndex((item) => item.dateKey === selectedCalendarDate));
  const selectedCalendarCell = calendarCells[selectedCalendarIndex] ?? calendarCells[0] ?? null;
  const canMoveCalendarMonthPrev = calendarMonthOptions.some((option) => option.value === getPreviousMonthKey(calendarMonthValue));
  const canMoveCalendarMonthNext = calendarMonthOptions.some((option) => option.value === getNextMonthKey(calendarMonthValue));
  const applyCalendarMonthChange = (nextMonthValue: string) => {
    const selectedDay = Number(selectedCalendarDate.slice(8, 10));
    const nextDay = clampDayToMonth(nextMonthValue, selectedDay);
    setSelectedCalendarMonth(nextMonthValue);
    setSelectedCalendarDate(`${nextMonthValue}-${String(nextDay).padStart(2, "0")}`);
  };
  const handleCalendarMonthPrev = () => {
    if (!canMoveCalendarMonthPrev) return;
    applyCalendarMonthChange(getPreviousMonthKey(calendarMonthValue));
  };
  const handleCalendarMonthNext = () => {
    if (!canMoveCalendarMonthNext) return;
    applyCalendarMonthChange(getNextMonthKey(calendarMonthValue));
  };
  const calendarSwipeTranslateX = `calc(-33.333333% + ${calendarSwipeOffset}px)`;
  const selectedCalendarTransactions = useMemo(
    () =>
      calendarExpenseTransactions.filter(
        (transaction) =>
          transaction.occurredAt.slice(0, 10) === selectedCalendarCell?.dateKey,
      ),
    [calendarExpenseTransactions, selectedCalendarCell?.dateKey],
  );
  const dashboardTransactionMap = useMemo(
    () => new Map(scope.transactions.map((transaction) => [transaction.id, transaction])),
    [scope.transactions],
  );
  const calendarExpenseTransactionIdSet = useMemo(
    () => new Set(calendarExpenseTransactions.map((transaction) => transaction.id)),
    [calendarExpenseTransactions],
  );
  const dashboardCalendarOpenReviews = useMemo(
    () =>
      getOpenTransactionWorkflowReviews(
        scope.reviews.filter(
          (review) =>
            calendarExpenseTransactionIdSet.has(review.primaryTransactionId) ||
            review.relatedTransactionIds.some((transactionId) => calendarExpenseTransactionIdSet.has(transactionId)),
        ),
        new Map(scope.transactions.map((transaction) => [transaction.id, transaction])),
      ),
    [calendarExpenseTransactionIdSet, scope.reviews, scope.transactions],
  );
  const sortedDashboardCalendarOpenReviews = useMemo(
    () =>
      [...dashboardCalendarOpenReviews].sort((left, right) => {
        const leftTransaction = dashboardTransactionMap.get(left.primaryTransactionId);
        const rightTransaction = dashboardTransactionMap.get(right.primaryTransactionId);
        const leftDate = leftTransaction?.occurredAt ?? "";
        const rightDate = rightTransaction?.occurredAt ?? "";
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return left.id.localeCompare(right.id, "ko");
      }),
    [dashboardCalendarOpenReviews, dashboardTransactionMap],
  );
  const dashboardTransactionWorkflowReviews = useMemo(() => {
    if (!dashboardReviewWorkflow) return [];
    const reviewsById = new Map(sortedDashboardCalendarOpenReviews.map((review) => [review.id, review]));
    return dashboardReviewWorkflow.queuedReviewIds
      .map((reviewId) => reviewsById.get(reviewId) ?? null)
      .filter((review): review is ReviewItem => Boolean(review));
  }, [dashboardReviewWorkflow, sortedDashboardCalendarOpenReviews]);
  const activeDashboardWorkflowReview = useMemo(() => {
    if (!dashboardReviewWorkflow || !dashboardTransactionWorkflowReviews.length) return null;
    return (
      dashboardTransactionWorkflowReviews.find((review) => review.id === dashboardReviewWorkflow.activeReviewId) ??
      dashboardTransactionWorkflowReviews[0] ??
      null
    );
  }, [dashboardReviewWorkflow, dashboardTransactionWorkflowReviews]);
  const activeDashboardWorkflowTransactionIds = useMemo(
    () => new Set(activeDashboardWorkflowReview ? getTransactionWorkflowTransactionIds(activeDashboardWorkflowReview) : []),
    [activeDashboardWorkflowReview],
  );
  const activeDashboardWorkflowSuggestedCategoryLabel = useMemo(() => {
    if (
      !activeDashboardWorkflowReview ||
      activeDashboardWorkflowReview.reviewType !== "category_suggestion" ||
      !activeDashboardWorkflowReview.suggestedCategoryId
    ) {
      return null;
    }
    return categoryLabelMap.get(activeDashboardWorkflowReview.suggestedCategoryId) ?? null;
  }, [activeDashboardWorkflowReview, categoryLabelMap]);
  const dashboardCategorySuggestionLabelsByTransactionId = useMemo(() => {
    const nextMap = new Map<string, string>();
    dashboardTransactionWorkflowReviews.forEach((review) => {
      if (review.reviewType !== "category_suggestion" || !review.suggestedCategoryId) return;
      const label = categoryLabelMap.get(review.suggestedCategoryId);
      if (!label) return;
      nextMap.set(review.primaryTransactionId, label);
    });
    return nextMap;
  }, [categoryLabelMap, dashboardTransactionWorkflowReviews]);
  const dashboardCalendarReviewTransactionIdSet = useMemo(() => {
    const nextSet = new Set<string>();
    dashboardCalendarOpenReviews.forEach((review) => {
      getTransactionWorkflowTransactionIds(review).forEach((transactionId) => nextSet.add(transactionId));
    });
    return nextSet;
  }, [dashboardCalendarOpenReviews]);
  const calendarReviewDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          calendarExpenseTransactions
            .filter((transaction) => dashboardCalendarReviewTransactionIdSet.has(transaction.id))
            .map((transaction) => transaction.occurredAt.slice(0, 10)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [calendarExpenseTransactions, dashboardCalendarReviewTransactionIdSet],
  );
  const calendarUncategorizedDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          calendarExpenseTransactions
            .filter((transaction) => !transaction.categoryId)
            .map((transaction) => transaction.occurredAt.slice(0, 10)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [calendarExpenseTransactions],
  );
  const selectedCalendarHasUncategorizedTransactions = useMemo(
    () => selectedCalendarTransactions.some((transaction) => !transaction.categoryId),
    [selectedCalendarTransactions],
  );
  const dashboardCalendarBaseTransactions = useMemo(
    () =>
      dashboardCalendarProcessingMode === "review" && activeDashboardWorkflowReview
        ? calendarExpenseTransactions.filter((transaction) => activeDashboardWorkflowTransactionIds.has(transaction.id))
        : selectedCalendarTransactions,
    [
      activeDashboardWorkflowReview,
      activeDashboardWorkflowTransactionIds,
      calendarExpenseTransactions,
      dashboardCalendarProcessingMode,
      selectedCalendarTransactions,
    ],
  );
  const displayedCalendarTransactions = useMemo(
    () =>
      dashboardCalendarBaseTransactions.filter((transaction) => {
        if (isDashboardCalendarUncategorizedOnly && transaction.categoryId) return false;
        if (isDashboardCalendarAutoReviewOnly && !dashboardCalendarReviewTransactionIdSet.has(transaction.id)) return false;
        return true;
      }),
    [
      dashboardCalendarBaseTransactions,
      dashboardCalendarReviewTransactionIdSet,
      isDashboardCalendarAutoReviewOnly,
      isDashboardCalendarUncategorizedOnly,
    ],
  );
  const firstDisplayedUncategorizedTransactionId = useMemo(
    () => displayedCalendarTransactions.find((transaction) => !transaction.categoryId)?.id ?? null,
    [displayedCalendarTransactions],
  );
  const todayDiary = selectedCalendarCell
    ? selectedCalendarTransactions.length === 0
      ? ""
      : createElementaryDiary(
          selectedCalendarTransactions,
          (transaction) => (transaction.categoryId ? categoryNameMap.get(transaction.categoryId) ?? "미분류" : "미분류"),
        )
    : "오늘은 기록이 아직 없다. 참 조용했다.";
  const todayDiaryCells = useMemo(() => createDiaryCells(todayDiary, 70, 10, 1), [todayDiary]);
  const loopConfirmTransactions = useMemo(() => {
    if (!loopConfirmState) return [];
    const selectedIdSet = new Set(loopConfirmState.candidateIds);
    return scope.transactions.filter((transaction) => selectedIdSet.has(transaction.id));
  }, [loopConfirmState, scope.transactions]);
  const loopConfirmTargetTransaction = useMemo(
    () => (loopConfirmState ? dashboardTransactionMap.get(loopConfirmState.transactionId) ?? null : null),
    [dashboardTransactionMap, loopConfirmState],
  );
  const loopConfirmPastTransactions = useMemo(
    () => loopConfirmTransactions.filter((transaction) => transaction.id !== loopConfirmState?.transactionId),
    [loopConfirmState?.transactionId, loopConfirmTransactions],
  );
  const renderCalendarBoard = (monthValue: string, monthCells: CalendarCell[]) => (
    <>
      <div className="dashboard-calendar-weekdays" aria-hidden="true">
        {CALENDAR_WEEKDAY_LABELS.map((label, index) => (
          <span
            key={`${monthValue}-${label}`}
            className={`dashboard-calendar-weekday${index === 0 ? " is-sunday" : ""}${index === 6 ? " is-saturday" : ""}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="dashboard-calendar-grid">
        {monthCells.map((cell) => {
          const isActiveMonth = monthValue === calendarMonthValue;
          const isSelected = isActiveMonth && selectedCalendarCell?.dateKey === cell.dateKey;
          const cellPresenceConnections = getPresenceForTarget("calendar-date", cell.dateKey);
          return (
            <button
              key={`${monthValue}-${cell.dateKey}`}
              type="button"
              className={`dashboard-calendar-cell${cell.isCurrentMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${cellPresenceConnections.length ? " is-presence-target" : ""}`}
              onClick={() => {
                if (calendarSwipeIsDraggingRef.current || calendarSwipeSuppressClickRef.current) {
                  return;
                }
                if (!isActiveMonth) {
                  applyCalendarMonthChange(monthValue);
                }
                setSelectedCalendarDate(cell.dateKey);
              }}
            >
              {cellPresenceConnections.length ? (
                <span className="dotori-presence-target-badge-list is-floating dashboard-calendar-presence-badges" aria-hidden="true">
                  {cellPresenceConnections.map((connection) => {
                    const accent = getPresenceAccent(connection.username);
                    return (
                      <span
                        key={`${cell.dateKey}-${connection.clientId}`}
                        className="dotori-presence-target-badge"
                        style={
                          {
                            "--presence-bg": accent.background,
                            "--presence-border": accent.border,
                            "--presence-text": accent.text,
                          } as Record<string, string>
                        }
                      >
                        {connection.activityLabel ? `${connection.username} · ${connection.activityLabel}` : connection.username}
                      </span>
                    );
                  })}
                </span>
              ) : null}
              <div className="dashboard-calendar-cell-head">
                <span
                  className={`dashboard-calendar-date${cell.dayOfWeek === 0 ? " is-sunday" : ""}${cell.dayOfWeek === 6 ? " is-saturday" : ""}`}
                >
                  {Number(cell.dateKey.slice(8, 10))}
                </span>
                {cell.holidayLabel ? <span className="dashboard-calendar-holiday-label">{cell.holidayLabel}</span> : null}
              </div>
              <strong className="dashboard-calendar-amount">{cell.expenseAmount ? formatCurrency(cell.expenseAmount) : "-"}</strong>
              {cell.expenseAmount > 0 || cell.memos.length > 0 ? (
                <div className="dashboard-calendar-marker-row" aria-hidden="true">
                  {cell.expenseAmount > 0 ? <span className="dashboard-calendar-marker is-expense" /> : null}
                  {cell.memos.length > 0 ? <span className="dashboard-calendar-marker is-memo" /> : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );

  const renderCalendarCellPresenceBadges = (targetId: string) => {
    const connections = getPresenceForTarget("calendar-cell", targetId);
    if (!connections.length) return null;

    return (
      <span className="dotori-presence-target-badge-list is-floating dashboard-calendar-cell-presence-badges" aria-hidden="true">
        {connections.map((connection) => {
          const accent = getPresenceAccent(connection.username);
            return (
              <span
                key={`${targetId}-${connection.clientId}`}
                className="dotori-presence-target-badge"
              style={
                {
                  "--presence-bg": accent.background,
                  "--presence-border": accent.border,
                  "--presence-text": accent.text,
                } as Record<string, string>
              }
              >
                {connection.activityLabel ? `${connection.username} · ${connection.activityLabel}` : connection.username}
              </span>
            );
          })}
      </span>
    );
  };

  const handleCalendarSwipeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (isCalendarSwipeAnimating) return;
    if (calendarSwipeViewportRef.current?.offsetParent === null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    calendarSwipePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    calendarSwipeStartXRef.current = event.clientX;
    calendarSwipeStartYRef.current = event.clientY;
    calendarSwipeOffsetRef.current = 0;
    calendarSwipeIsDraggingRef.current = false;
    calendarSwipeSuppressClickRef.current = false;
    setIsCalendarSwipeDragging(false);
    setCalendarSwipeOffset(0);
  };

  const handleCalendarSwipeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isCalendarSwipeAnimating || calendarSwipeStartXRef.current === null) return;
    if (calendarSwipePointerIdRef.current !== event.pointerId) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const deltaX = currentX - calendarSwipeStartXRef.current;
    const deltaY = currentY - (calendarSwipeStartYRef.current ?? currentY);

    if (!calendarSwipeIsDraggingRef.current) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 6) return;
      if (absY > absX) {
        calendarSwipeStartXRef.current = null;
        calendarSwipeStartYRef.current = null;
        calendarSwipeOffsetRef.current = 0;
        setCalendarSwipeOffset(0);
        return;
      }
      calendarSwipeIsDraggingRef.current = true;
      calendarSwipeSuppressClickRef.current = true;
      setIsCalendarSwipeDragging(true);
    }

    event.preventDefault();
    let nextOffset = deltaX;
    if ((nextOffset > 0 && !canMoveCalendarMonthPrev) || (nextOffset < 0 && !canMoveCalendarMonthNext)) {
      nextOffset *= 0.28;
    }
    calendarSwipeOffsetRef.current = nextOffset;
    setCalendarSwipeOffset(nextOffset);
  };

  const handleCalendarSwipeEnd = () => {
    if (isCalendarSwipeAnimating || calendarSwipeStartXRef.current === null) {
      calendarSwipePointerIdRef.current = null;
      calendarSwipeStartXRef.current = null;
      calendarSwipeStartYRef.current = null;
      calendarSwipeIsDraggingRef.current = false;
      setIsCalendarSwipeDragging(false);
      return;
    }

    const travel = calendarSwipeOffsetRef.current;
    const width = calendarSwipeViewportWidth;
    const threshold = width ? Math.min(72, width * 0.12) : 42;
    let nextMonthValue: string | null = null;
    let settleOffset = 0;

    if (travel <= -threshold && canMoveCalendarMonthNext) {
      nextMonthValue = getNextMonthKey(calendarMonthValue);
      settleOffset = -width;
    } else if (travel >= threshold && canMoveCalendarMonthPrev) {
      nextMonthValue = getPreviousMonthKey(calendarMonthValue);
      settleOffset = width;
    }

    if (!calendarSwipeIsDraggingRef.current) {
      calendarSwipePointerIdRef.current = null;
      calendarSwipeStartXRef.current = null;
      calendarSwipeStartYRef.current = null;
      calendarSwipeOffsetRef.current = 0;
      setCalendarSwipeOffset(0);
      setIsCalendarSwipeDragging(false);
      window.setTimeout(() => {
        calendarSwipeSuppressClickRef.current = false;
      }, 0);
      return;
    }

    setIsCalendarSwipeAnimating(true);
    setIsCalendarSwipeDragging(false);
    setCalendarSwipeOffset(settleOffset);

    if (calendarSwipeAnimationTimerRef.current !== null) {
      window.clearTimeout(calendarSwipeAnimationTimerRef.current);
    }

    calendarSwipeAnimationTimerRef.current = window.setTimeout(() => {
      if (nextMonthValue) {
        applyCalendarMonthChange(nextMonthValue);
      }
      calendarSwipePointerIdRef.current = null;
      calendarSwipeStartXRef.current = null;
      calendarSwipeStartYRef.current = null;
      calendarSwipeOffsetRef.current = 0;
      setCalendarSwipeOffset(0);
      setIsCalendarSwipeAnimating(false);
      window.setTimeout(() => {
        calendarSwipeIsDraggingRef.current = false;
        calendarSwipeSuppressClickRef.current = false;
      }, 0);
      calendarSwipeAnimationTimerRef.current = null;
    }, 320);
  };
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const syncViewportMode = () => {
      setIsMobileCalendarSwipeViewport(mediaQuery.matches);
    };

    syncViewportMode();
    mediaQuery.addEventListener("change", syncViewportMode);

    return () => {
      mediaQuery.removeEventListener("change", syncViewportMode);
    };
  }, []);
  useEffect(() => {
    if (!isMobileCalendarSwipeViewport) {
      setCalendarSwipeViewportWidth(0);
      setCalendarSwipeOffset(0);
      calendarSwipePointerIdRef.current = null;
      calendarSwipeOffsetRef.current = 0;
      calendarSwipeStartXRef.current = null;
      calendarSwipeStartYRef.current = null;
      setIsCalendarSwipeDragging(false);
      setIsCalendarSwipeAnimating(false);
      if (calendarSwipeAnimationTimerRef.current !== null) {
        window.clearTimeout(calendarSwipeAnimationTimerRef.current);
        calendarSwipeAnimationTimerRef.current = null;
      }
      return;
    }

    const measureCalendarSwipeViewport = () => {
      setCalendarSwipeViewportWidth(calendarSwipeViewportRef.current?.clientWidth ?? 0);
    };

    measureCalendarSwipeViewport();
    window.addEventListener("resize", measureCalendarSwipeViewport);

    return () => {
      window.removeEventListener("resize", measureCalendarSwipeViewport);
    };
  }, [isMobileCalendarSwipeViewport]);
  useEffect(() => {
    return () => {
      if (calendarSwipeAnimationTimerRef.current !== null) {
        window.clearTimeout(calendarSwipeAnimationTimerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (selectedCalendarDate.startsWith(calendarMonthValue)) return;
    setSelectedCalendarDate(`${calendarMonthValue}-01`);
  }, [calendarMonthValue, selectedCalendarDate]);
  useEffect(() => {
    if (loopConfirmDragMode === null) return;

    const clearDragMode = () => setLoopConfirmDragMode(null);
    window.addEventListener("mouseup", clearDragMode);

    return () => {
      window.removeEventListener("mouseup", clearDragMode);
    };
  }, [loopConfirmDragMode]);
  useEffect(() => {
    if (dashboardCalendarProcessingMode === "review" && !isDashboardCalendarAutoReviewOnly) {
      setDashboardCalendarProcessingMode(null);
      setDashboardReviewWorkflow(null);
      return;
    }
    if (dashboardCalendarProcessingMode === "uncategorized" && !isDashboardCalendarUncategorizedOnly) {
      setDashboardCalendarProcessingMode(null);
    }
  }, [
    dashboardCalendarProcessingMode,
    isDashboardCalendarAutoReviewOnly,
    isDashboardCalendarUncategorizedOnly,
  ]);
  useEffect(() => {
    if (!dashboardCalendarProcessingMode) return;
    if (dashboardCalendarProcessingMode === "review") {
      if (!calendarReviewDateKeys.length) return;
      if (calendarReviewDateKeys.includes(selectedCalendarDate)) return;

      const nextDateKey =
        calendarReviewDateKeys.find((dateKey) => dateKey >= selectedCalendarDate) ??
        calendarReviewDateKeys[calendarReviewDateKeys.length - 1];

      if (nextDateKey && nextDateKey !== selectedCalendarDate) {
        setSelectedCalendarDate(nextDateKey);
      }
      return;
    }

    if (dashboardCalendarProcessingMode === "uncategorized") {
      if (selectedCalendarHasUncategorizedTransactions) return;
      if (!calendarUncategorizedDateKeys.length) return;

      const nextDateKey =
        calendarUncategorizedDateKeys.find((dateKey) => dateKey > selectedCalendarDate) ??
        calendarUncategorizedDateKeys[calendarUncategorizedDateKeys.length - 1];

      if (nextDateKey && nextDateKey !== selectedCalendarDate) {
        setSelectedCalendarDate(nextDateKey);
      }
    }
  }, [
    calendarReviewDateKeys,
    calendarUncategorizedDateKeys,
    dashboardCalendarProcessingMode,
    selectedCalendarHasUncategorizedTransactions,
    selectedCalendarDate,
  ]);
  useEffect(() => {
    if (dashboardCalendarProcessingMode !== "review" || !dashboardReviewWorkflow) return;

    const availableReviewIds = dashboardTransactionWorkflowReviews.map((review) => review.id);
    if (!availableReviewIds.length) {
      handleStopDashboardCalendarProcessing();
      return;
    }

    const isQueueChanged =
      availableReviewIds.length !== dashboardReviewWorkflow.queuedReviewIds.length ||
      availableReviewIds.some((reviewId, index) => reviewId !== dashboardReviewWorkflow.queuedReviewIds[index]);
    const nextActiveReviewId =
      dashboardReviewWorkflow.activeReviewId && availableReviewIds.includes(dashboardReviewWorkflow.activeReviewId)
        ? dashboardReviewWorkflow.activeReviewId
        : availableReviewIds[0];

    if (isQueueChanged || nextActiveReviewId !== dashboardReviewWorkflow.activeReviewId) {
      setDashboardReviewWorkflow((current) =>
        current
          ? {
              ...current,
              queuedReviewIds: availableReviewIds,
              activeReviewId: nextActiveReviewId,
            }
          : current,
      );
    }
  }, [dashboardCalendarProcessingMode, dashboardReviewWorkflow, dashboardTransactionWorkflowReviews]);
  useEffect(() => {
    if (dashboardCalendarProcessingMode !== "uncategorized") {
      setDashboardUncategorizedFocusTransactionId((current) => (current === null ? current : null));
      return;
    }

    setDashboardUncategorizedFocusTransactionId((current) => {
      if (
        current &&
        displayedCalendarTransactions.some((transaction) => transaction.id === current)
      ) {
        return current;
      }
      return firstDisplayedUncategorizedTransactionId;
    });
  }, [dashboardCalendarProcessingMode, displayedCalendarTransactions, firstDisplayedUncategorizedTransactionId]);
  useEffect(() => {
    if (!activeDashboardWorkflowReview) return;
    const primaryTransaction = dashboardTransactionMap.get(activeDashboardWorkflowReview.primaryTransactionId);
    const nextDateKey = primaryTransaction?.occurredAt.slice(0, 10);
    if (!nextDateKey || nextDateKey === selectedCalendarDate) return;
    setSelectedCalendarDate(nextDateKey);
  }, [activeDashboardWorkflowReview, dashboardTransactionMap, selectedCalendarDate]);
  useEffect(() => {
    if (!activeDashboardWorkflowReview) return;
    const row = document.querySelector<HTMLElement>(`[data-transaction-review-row="${activeDashboardWorkflowReview.primaryTransactionId}"]`);
    if (!row) return;
    scrollIntoNearestAppMain(row, 24);
  }, [activeDashboardWorkflowReview, selectedCalendarDate]);
  useEffect(() => {
    if (!dashboardCalendarProcessingMode) return;

    const frame = window.requestAnimationFrame(() => {
      const container = dashboardCalendarTransactionsRef.current;
      if (!container) return;

      const primaryRow =
        container.querySelector<HTMLElement>(".transaction-review-row.is-review-primary") ??
        container.querySelector<HTMLElement>("[data-dashboard-calendar-row]");
      const fallbackTarget =
        primaryRow ??
        container.querySelector<HTMLElement>(".dashboard-calendar-transactions-head");
      if (!fallbackTarget) return;

      const rect = fallbackTarget.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const needsScroll = rect.top < 120 || rect.bottom > viewportHeight - 40;

      if (needsScroll) {
        scrollIntoNearestAppMain(fallbackTarget, 20);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [dashboardCalendarProcessingMode, displayedCalendarTransactions.length, selectedCalendarDate]);
  useEffect(() => {
    if (!shouldScrollCalendarTransactionsRef.current) return;
    if (!dashboardCalendarProcessingMode) return;
    if (pendingDashboardCalendarProcessingMode !== null) return;

    const timer = window.setTimeout(() => {
      const target =
        dashboardCalendarTransactionsRef.current?.querySelector<HTMLElement>(".transaction-review-row.is-review-primary") ??
        dashboardCalendarTransactionsRef.current?.querySelector<HTMLElement>("[data-dashboard-calendar-row]") ??
        dashboardCalendarTransactionsRef.current;

      if (target) {
        scrollIntoNearestAppMain(target, 20);
      }
      shouldScrollCalendarTransactionsRef.current = false;
    }, 240);

    return () => window.clearTimeout(timer);
  }, [dashboardCalendarProcessingMode, pendingDashboardCalendarProcessingMode, selectedCalendarDate, displayedCalendarTransactions.length]);
  const handleStartDashboardCalendarProcessing = (mode: Exclude<DashboardCalendarProcessingMode, null>) => {
    const monthStartDateKey = `${calendarMonthValue}-01`;
    const relevantDateKeys = mode === "review" ? calendarReviewDateKeys : calendarUncategorizedDateKeys;
    const nextDateKey = relevantDateKeys.find((dateKey) => dateKey >= monthStartDateKey) ?? monthStartDateKey;

    shouldScrollCalendarTransactionsRef.current = true;
    setDashboardCalendarProcessingMode(mode);
    setIsDashboardCalendarAutoReviewOnly(mode === "review");
    setIsDashboardCalendarUncategorizedOnly(mode === "uncategorized");
    setSelectedCalendarDate(nextDateKey);
    setDashboardUncategorizedFocusTransactionId(null);
    if (mode === "review") {
      setDashboardReviewWorkflow({
        activeReviewId: sortedDashboardCalendarOpenReviews[0]?.id ?? null,
        queuedReviewIds: sortedDashboardCalendarOpenReviews.map((review) => review.id),
      });
      return;
    }
    setDashboardReviewWorkflow(null);
  };
  const handleStopDashboardCalendarProcessing = () => {
    setDashboardCalendarProcessingMode(null);
    setIsDashboardCalendarAutoReviewOnly(false);
    setIsDashboardCalendarUncategorizedOnly(false);
    setDashboardReviewWorkflow(null);
    setDashboardUncategorizedFocusTransactionId(null);
  };
  const handleDashboardActiveReviewDecision = (decision: "apply" | "resolve") => {
    if (!dashboardReviewWorkflow || !activeDashboardWorkflowReview) return;

    const nextReviewId = getNextQueuedReviewId(dashboardReviewWorkflow.queuedReviewIds, activeDashboardWorkflowReview.id);
    setDashboardReviewWorkflow((current) =>
      current
        ? {
            ...current,
            activeReviewId: nextReviewId,
          }
        : current,
    );

    if (decision === "apply") {
      applyReviewSuggestion(activeDashboardWorkflowReview.id);
      return;
    }

    resolveReview(activeDashboardWorkflowReview.id);
  };
  const deferDashboardActiveReview = () => {
    if (!dashboardReviewWorkflow || !activeDashboardWorkflowReview) return;

    const remainingReviewIds = dashboardReviewWorkflow.queuedReviewIds.filter((reviewId) => reviewId !== activeDashboardWorkflowReview.id);
    if (!remainingReviewIds.length) {
      handleStopDashboardCalendarProcessing();
      return;
    }

    const nextReviewId = getNextQueuedReviewId(dashboardReviewWorkflow.queuedReviewIds, activeDashboardWorkflowReview.id);
    setDashboardReviewWorkflow((current) =>
      current
        ? {
            ...current,
            activeReviewId: nextReviewId && remainingReviewIds.includes(nextReviewId) ? nextReviewId : remainingReviewIds[0] ?? null,
            queuedReviewIds: remainingReviewIds,
          }
        : current,
    );
  };
  const setLoopConfirmCandidateSelection = (transactionId: string, checked: boolean) => {
    setLoopConfirmState((current) => {
      if (!current) return current;
      return {
        ...current,
        candidateIds: checked
          ? current.candidateIds.includes(transactionId)
            ? current.candidateIds
            : [...current.candidateIds, transactionId]
          : current.candidateIds.filter((candidateId) => candidateId !== transactionId),
      };
    });
  };
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
  const cardNameMap = useMemo(() => new Map(scope.cards.map((card) => [card.id, card.name])), [scope.cards]);
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
      <AppSelect
        className="dashboard-section-basis-select"
        value={selectedDashboardBasis}
        onChange={(nextValue) => setSelectedDashboardBasis(nextValue as WorkspaceInsightBasis)}
        options={[
          { value: "month", label: "월별" },
          ...(statementScopeOptions.length ? [{ value: "statement", label: "명세서" }] : []),
        ]}
        ariaLabel={`${ariaLabel} 기준 선택`}
      />
      <AppSelect
        className="dashboard-section-month-select"
        value={selectedDashboardScopeValue}
        onChange={(nextValue) =>
          selectedDashboardBasis === "statement" ? setSelectedDashboardStatement(nextValue) : setSelectedDashboardMonth(nextValue)
        }
        options={
          selectedDashboardScopeOptions.length
            ? selectedDashboardScopeOptions.map((option) => ({ value: option.value, label: option.label }))
            : [{ value: selectedDashboardScopeValue, label: selectedDashboardBasis === "statement" ? "명세서 없음" : "연월 없음" }]
        }
        ariaLabel={`${ariaLabel} 범위 선택`}
      />
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
  const getDashboardTransactionConnectionMeta = (transaction: Transaction) => {
    const parts = [
      getSourceTypeLabel(transaction.sourceType),
      transaction.ownerPersonId ? `사용자 ${getDashboardTransactionOwnerLabel(transaction)}` : null,
      transaction.accountId ? `계좌 ${accountNameMap.get(transaction.accountId) ?? "-"}` : null,
      transaction.cardId ? `카드 ${cardNameMap.get(transaction.cardId) ?? "-"}` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  };
  const getDashboardTransactionReviewBadgeLabel = (transaction: Transaction) => {
    if (!activeDashboardWorkflowReview || !activeDashboardWorkflowTransactionIds.has(transaction.id)) return null;

    if (activeDashboardWorkflowReview.reviewType === "category_suggestion") return "카테고리 제안";
    if (activeDashboardWorkflowReview.reviewType === "duplicate_candidate") {
      return transaction.id === activeDashboardWorkflowReview.primaryTransactionId ? "중복 후보" : "비교 거래";
    }
    if (activeDashboardWorkflowReview.reviewType === "refund_candidate") {
      return transaction.id === activeDashboardWorkflowReview.primaryTransactionId ? "환불 후보" : "원거래";
    }
    return null;
  };
  const getDashboardTransactionReviewHelperText = (transaction: Transaction) => {
    if (!activeDashboardWorkflowReview || !activeDashboardWorkflowTransactionIds.has(transaction.id)) return null;

    if (activeDashboardWorkflowReview.reviewType === "category_suggestion") {
      return `제안 카테고리를 확인해 주세요 · ${getDashboardTransactionConnectionMeta(transaction)}`;
    }
    if (activeDashboardWorkflowReview.reviewType === "duplicate_candidate") {
      return `${transaction.id === activeDashboardWorkflowReview.primaryTransactionId ? "제외할 후보 거래" : "비교 기준 거래"} · ${getDashboardTransactionConnectionMeta(transaction)}`;
    }
    if (activeDashboardWorkflowReview.reviewType === "refund_candidate") {
      return `${transaction.id === activeDashboardWorkflowReview.primaryTransactionId ? "환불로 연결할 거래" : "기준이 되는 원거래"} · ${getDashboardTransactionConnectionMeta(transaction)}`;
    }

    return getDashboardTransactionConnectionMeta(transaction);
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

  const moonCalendarSection = (
    <section className="page-section" style={getMotionStyle(0.6)} data-guide-target="records-moon-calendar">
      {mode === "dashboard" ? (
        <div className="dashboard-calendar-hero-head">
          <div className="dashboard-calendar-month-nav" aria-label="월 이동">
            <button
              type="button"
              className="dashboard-calendar-month-button"
              onClick={handleCalendarMonthPrev}
              disabled={!canMoveCalendarMonthPrev}
              aria-label="이전 달"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="dashboard-calendar-month-button"
              onClick={handleCalendarMonthNext}
              disabled={!canMoveCalendarMonthNext}
              aria-label="다음 달"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <strong className="dashboard-calendar-hero-date">
            {formatMonthLabel((selectedCalendarCell?.dateKey ?? selectedCalendarDate).slice(0, 7))}
          </strong>
          <div className="dashboard-section-toolbar">
            <AppSelect
              className="dashboard-calendar-owner-select"
              buttonClassName="dashboard-calendar-owner-select-trigger"
              dropdownClassName="dashboard-calendar-owner-select-dropdown"
              value={selectedCalendarOwnerId}
              onChange={setSelectedCalendarOwnerId}
              options={calendarOwnerOptions}
              ariaLabel="소비기록 사용자 선택"
            />
          </div>
        </div>
      ) : (
        <div className="section-head">
          <div>
            <span className="section-kicker">달 기록 달력</span>
            <h2 className="section-title">소비기록</h2>
          </div>
          <div className="dashboard-section-toolbar">
            <AppSelect
              value={calendarMonthValue}
              onChange={setSelectedCalendarMonth}
              options={calendarMonthOptions}
              ariaLabel="달 기록 연월 선택"
            />
          </div>
        </div>
      )}

      {mode === "dashboard" ? (
        <div className="stats-grid">
          <article
            className="stat-card stat-card--actionable"
            style={getMotionStyle(1)}
            onClick={() => setIsIncomeModalOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsIncomeModalOpen(true);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="수입 모달 열기"
          >
            <div className="stat-card-head">
              <span className="stat-label">이번 달 수입</span>
              <span className={`badge dashboard-stat-badge ${selectedCalendarIncomeBadge.className}`}>
                {selectedCalendarIncomeBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(selectedCalendarInsights.income)}</strong>
            <span
              className={`stat-delta${selectedCalendarIncomeDelta > 0 ? " is-up is-positive" : selectedCalendarIncomeDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(selectedCalendarIncomeDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(2)}>
            <div className="stat-card-head">
              <span className="stat-label">이번 달 결제금액</span>
              <span className={`badge dashboard-stat-badge ${selectedCalendarExpenseBadge.className}`}>
                {selectedCalendarExpenseBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(selectedCalendarExpenseTotal)}</strong>
            <span
              className={`stat-delta${selectedCalendarExpenseDelta > 0 ? " is-up is-negative" : selectedCalendarExpenseDelta < 0 ? " is-down is-positive" : ""}`}
            >
              {formatDeltaAmount(selectedCalendarExpenseDelta)}
            </span>
          </article>
          <article className="stat-card" style={getMotionStyle(3)}>
            <div className="stat-card-head">
              <span className="stat-label">잔액</span>
              <span className={`badge dashboard-stat-badge ${selectedCalendarSavingsBadge.className}`}>
                {selectedCalendarSavingsBadge.label}
              </span>
            </div>
            <strong>{formatCurrency(selectedCalendarBalance)}</strong>
            <span
              className={`stat-delta${selectedCalendarSavingsDelta > 0 ? " is-up is-positive" : selectedCalendarSavingsDelta < 0 ? " is-down is-negative" : ""}`}
            >
              {formatDeltaAmount(selectedCalendarSavingsDelta)}
            </span>
          </article>
          <article
            className="stat-card stat-card--actionable"
            style={getMotionStyle(4)}
            onClick={handleOpenStatementUploadModal}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleOpenStatementUploadModal();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="명세서 업로드 모달 열기"
          >
            <div className="stat-card-head">
              <span className="stat-label">명세서 업로드</span>
            </div>
            <strong>{selectedCalendarImportCount}건</strong>
          </article>
          <article
            className={`stat-card${selectedCalendarReviewPending ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(5)}
            onClick={selectedCalendarReviewPending ? () => setPendingDashboardCalendarProcessingMode("review") : undefined}
            onKeyDown={
              selectedCalendarReviewPending
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setPendingDashboardCalendarProcessingMode("review");
                    }
                  }
                : undefined
            }
            role={selectedCalendarReviewPending ? "button" : undefined}
            tabIndex={selectedCalendarReviewPending ? 0 : undefined}
            aria-label={selectedCalendarReviewPending ? "검토 모드 시작" : undefined}
          >
            <div className="stat-card-head">
              <span className="stat-label">검토 필요</span>
              <span className={`badge dashboard-stat-badge ${selectedCalendarReviewBadge.className}`}>
                {selectedCalendarReviewBadge.label}
              </span>
            </div>
            <strong>{selectedCalendarInsights.reviewCount}건</strong>
          </article>
          <article
            className={`stat-card${selectedCalendarUncategorizedPending ? " stat-card--actionable" : ""}`}
            style={getMotionStyle(6)}
            onClick={selectedCalendarUncategorizedPending ? () => setPendingDashboardCalendarProcessingMode("uncategorized") : undefined}
            onKeyDown={
              selectedCalendarUncategorizedPending
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setPendingDashboardCalendarProcessingMode("uncategorized");
                    }
                  }
                : undefined
            }
            role={selectedCalendarUncategorizedPending ? "button" : undefined}
            tabIndex={selectedCalendarUncategorizedPending ? 0 : undefined}
            aria-label={selectedCalendarUncategorizedPending ? "미분류 모드 시작" : undefined}
          >
            <div className="stat-card-head">
              <span className="stat-label">미분류</span>
              <span className={`badge dashboard-stat-badge ${selectedCalendarUncategorizedBadge.className}`}>
                {selectedCalendarUncategorizedBadge.label}
              </span>
            </div>
            <strong>{selectedCalendarInsights.uncategorizedCount}건</strong>
          </article>
        </div>
      ) : null}

      <div className="dashboard-calendar-layout">
        <div>
          <div className="dashboard-calendar-board dashboard-calendar-board--desktop">
            {renderCalendarBoard(calendarMonthValue, calendarCells)}
          </div>
          <div
            ref={calendarSwipeViewportRef}
            className="dashboard-calendar-swipe-board"
            onPointerDownCapture={handleCalendarSwipeStart}
            onPointerMoveCapture={handleCalendarSwipeMove}
            onPointerUpCapture={handleCalendarSwipeEnd}
            onPointerCancelCapture={handleCalendarSwipeEnd}
            onClickCapture={(event) => {
              if (!calendarSwipeSuppressClickRef.current) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div
              className={`dashboard-calendar-swipe-track${isCalendarSwipeAnimating ? " is-animating" : ""}${isCalendarSwipeDragging ? " is-dragging" : ""}`}
              style={{
                transform: `translate3d(${calendarSwipeTranslateX}, 0, 0)`,
              }}
            >
              {calendarSwipeMonthKeys.map((monthValue) => (
                <div key={monthValue} className="dashboard-calendar-swipe-panel">
                  {renderCalendarBoard(monthValue, calendarCellsByMonth.get(monthValue) ?? [])}
                </div>
              ))}
            </div>
          </div>
        </div>

        <article className="dashboard-diary-card">
          <div className="dashboard-diary-sheet">
            <div className="dashboard-diary-grid" aria-label={todayDiary}>
              {todayDiaryCells.map((character, index) => (
                <span
                  key={`${selectedCalendarCell?.dateKey ?? calendarMonthValue}-${index}`}
                  className={`dashboard-diary-cell${character ? "" : " is-blank"}`}
                >
                  {character === " " ? "" : character}
                </span>
              ))}
            </div>
          </div>
          {!isMobileCalendarSwipeViewport || selectedCalendarCell?.memos.length ? (
            <div className="dashboard-diary-memo">
              {selectedCalendarCell?.memos.length
                ? selectedCalendarCell.memos.map((memo) => (
                    <p key={`${memo.text}-${memo.merchantNames.join("|")}`}>
                      {memo.text}
                      <small>({memo.merchantNames.join(", ")})</small>
                    </p>
                  ))
                : null}
            </div>
          ) : null}
        </article>
      </div>

      <div className="dashboard-calendar-transactions" ref={dashboardCalendarTransactionsRef}>
        <div className="dashboard-calendar-transactions-head">
          <div className="dashboard-calendar-transactions-title-block">
            <h3 className="dashboard-calendar-transactions-title">
              {`${formatFullKoreanDateLabel(selectedCalendarCell?.dateKey ?? selectedCalendarDate)}의 소비내역`}
            </h3>
            {dashboardCalendarProcessingMode === "review" ? (
              <span className="dashboard-calendar-transactions-status-badge">자동검토중</span>
            ) : null}
            {dashboardCalendarProcessingMode === "uncategorized" ? (
              <span className="dashboard-calendar-transactions-status-badge">분류작업중</span>
            ) : null}
          </div>
          <div className="dashboard-calendar-transactions-toolbar">
            {dashboardCalendarProcessingMode === "review" ? (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleStopDashboardCalendarProcessing}>
                자동검토 종료
              </button>
            ) : null}
            {dashboardCalendarProcessingMode === "uncategorized" ? (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleStopDashboardCalendarProcessing}>
                분류작업 종료
              </button>
            ) : null}
          </div>
        </div>
        {displayedCalendarTransactions.length ? (
          <div className="table-responsive dashboard-calendar-transactions-table-wrap">
            <table className="table align-middle transaction-grid-table">
              <colgroup>
                <col className="transaction-grid-col-date" />
                <col className="transaction-grid-col-merchant dashboard-calendar-col-merchant" />
                <col className="transaction-grid-col-paid-amount" />
                <col className="transaction-grid-col-owner" />
                <col className="transaction-grid-col-loop" />
                <col className="transaction-grid-col-category" />
                <col className="transaction-grid-col-note dashboard-calendar-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>사용일</th>
                  <th>가맹점</th>
                  <th className="text-end">결제금액</th>
                  <th>사용자</th>
                  <th>루프</th>
                  <th>카테고리</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {displayedCalendarTransactions.map((transaction, index) => {
                  const isWorkflowMatch =
                    dashboardCalendarProcessingMode === "review" ? activeDashboardWorkflowTransactionIds.has(transaction.id) : false;
                  const isWorkflowPrimary = activeDashboardWorkflowReview?.primaryTransactionId === transaction.id;
                  const isUncategorizedFocus =
                    dashboardCalendarProcessingMode === "uncategorized" &&
                    dashboardUncategorizedFocusTransactionId === transaction.id;
                  const categoryReviewHint = dashboardCategorySuggestionLabelsByTransactionId.get(transaction.id) ?? null;
                  const inlineReview = isWorkflowPrimary ? activeDashboardWorkflowReview : null;
                  const loopCellTargetId = `${selectedCalendarDate}|${transaction.id}|loop`;
                  const categoryCellTargetId = `${selectedCalendarDate}|${transaction.id}|category`;
                  const noteCellTargetId = `${selectedCalendarDate}|${transaction.id}|note`;
                  const hasLoopPresence = getPresenceForTarget("calendar-cell", loopCellTargetId).length > 0;
                  const hasCategoryPresence = getPresenceForTarget("calendar-cell", categoryCellTargetId).length > 0;
                  const hasNotePresence = getPresenceForTarget("calendar-cell", noteCellTargetId).length > 0;

                  return (
                    <Fragment key={transaction.id}>
                      <tr
                        style={getMotionStyle(index)}
                        data-transaction-review-row={transaction.id}
                        data-dashboard-calendar-row="true"
                        className={`${isWorkflowMatch || isUncategorizedFocus ? " transaction-review-row" : ""}${isWorkflowPrimary || isUncategorizedFocus ? " is-review-focus" : ""}${isWorkflowPrimary ? " is-review-primary" : ""}`}
                      >
                        <td className="transaction-date-cell">{transaction.occurredAt.slice(0, 10)}</td>
                        <td>
                          <TransactionRowHeader
                            merchantName={transaction.merchantName}
                            badgeLabel={getDashboardTransactionReviewBadgeLabel(transaction)}
                            helperText={getDashboardTransactionReviewHelperText(transaction)}
                          />
                        </td>
                        <td className="text-end transaction-amount-cell">
                          <strong>{formatCurrency(transaction.amount)}</strong>
                        </td>
                        <td className="transaction-owner-cell">{getDashboardTransactionOwnerLabel(transaction)}</td>
                        <td className={`transaction-loop-cell dashboard-calendar-grid-cell${hasLoopPresence ? " is-presence-target" : ""}`}>
                          {renderCalendarCellPresenceBadges(loopCellTargetId)}
                          <label className="transaction-loop-toggle">
                            <input
                              type="checkbox"
                              checked={transaction.isLoop ?? false}
                              onFocus={() => {
                                setDashboardCalendarFocusedField({ transactionId: transaction.id, field: "loop" });
                              }}
                              onBlur={() => {
                                setDashboardCalendarFocusedField((current) =>
                                  current?.transactionId === transaction.id && current.field === "loop" ? null : current,
                                );
                              }}
                              onChange={(event) => {
                                if (!event.target.checked) {
                                  updateTransactionFlags(workspaceId, transaction.id, { isLoop: false });
                                  return;
                                }
                                const candidateGroup = getLoopCandidateGroup(transaction, scope.transactions);
                                setLoopConfirmState({
                                  transactionId: transaction.id,
                                  candidateIds: candidateGroup.transactionIds,
                                  suggestedIds: candidateGroup.transactionIds,
                                });
                              }}
                            />
                          </label>
                        </td>
                        <td className={`dashboard-calendar-grid-cell${inlineReview?.reviewType === "category_suggestion" ? " is-review-focus" : ""}${hasCategoryPresence ? " is-presence-target" : ""}`}>
                          {renderCalendarCellPresenceBadges(categoryCellTargetId)}
                          <TransactionCategoryEditor
                            transaction={transaction}
                            categories={scope.categories}
                            categoryName={transaction.categoryId ? categoryLabelMap.get(transaction.categoryId) ?? null : null}
                            reviewSuggestionLabel={categoryReviewHint}
                            onFocus={() => {
                              setDashboardCalendarFocusedField({ transactionId: transaction.id, field: "category" });
                              if (dashboardCalendarProcessingMode === "uncategorized") {
                                setDashboardUncategorizedFocusTransactionId(transaction.id);
                              }
                            }}
                            onBlur={() => {
                              setDashboardCalendarFocusedField((current) =>
                                current?.transactionId === transaction.id && current.field === "category" ? null : current,
                              );
                            }}
                            isReviewFocused={Boolean(
                              activeDashboardWorkflowReview?.reviewType === "category_suggestion" &&
                                activeDashboardWorkflowReview.primaryTransactionId === transaction.id,
                            )}
                            suggestionListClassName="dashboard-calendar-category-suggestion-list"
                            onCategoryChange={(nextCategoryId) => {
                              if (!nextCategoryId) {
                                clearCategory(workspaceId, transaction.id);
                                return;
                              }
                              assignCategory(workspaceId, transaction.id, nextCategoryId);
                            }}
                          />
                        </td>
                        <td className={`dashboard-calendar-grid-cell${hasNotePresence ? " is-presence-target" : ""}`}>
                          {renderCalendarCellPresenceBadges(noteCellTargetId)}
                          <input
                            type="text"
                            className="form-control form-control-sm dashboard-calendar-note-input"
                            defaultValue={transaction.description}
                            placeholder="비고 입력"
                            onFocus={() => {
                              setDashboardCalendarFocusedField({ transactionId: transaction.id, field: "note" });
                              if (dashboardCalendarProcessingMode === "uncategorized") {
                                setDashboardUncategorizedFocusTransactionId(transaction.id);
                              }
                            }}
                            onBlur={(event) => {
                              setDashboardCalendarFocusedField((current) =>
                                current?.transactionId === transaction.id && current.field === "note" ? null : current,
                              );
                              const nextDescription = event.currentTarget.value.trim();
                              if (nextDescription === (transaction.description ?? "")) return;
                              updateTransactionDetails(workspaceId, transaction.id, { description: nextDescription });
                            }}
                          />
                        </td>
                      </tr>
                      {inlineReview ? (
                        <tr className="transaction-review-inline-row">
                          <td colSpan={7} className="transaction-review-inline-cell">
                            <div className="transaction-review-inline-panel">
                              <div className="transaction-review-inline-meta">
                                <span className="transaction-review-inline-badge">
                                  신뢰도 {Math.round(inlineReview.confidenceScore * 100)}%
                                </span>
                              </div>
                              <div className="transaction-review-inline-copy">
                                {inlineReview.reviewType === "category_suggestion" && activeDashboardWorkflowSuggestedCategoryLabel ? (
                                  <strong className="transaction-review-inline-question">
                                    <span>해당 건을 </span>
                                    <span className="transaction-review-inline-category-badge">
                                      {activeDashboardWorkflowSuggestedCategoryLabel}
                                    </span>
                                    <span>로 분류할까요?</span>
                                  </strong>
                                ) : (
                                  <strong>{getInlineReviewPrompt(inlineReview)}</strong>
                                )}
                              </div>
                              <div className="transaction-review-inline-actions">
                                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={deferDashboardActiveReview}>
                                  보류
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleDashboardActiveReviewDecision("resolve")}
                                >
                                  아니요
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleDashboardActiveReviewDecision("apply")}
                                >
                                  예
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : selectedCalendarTransactions.length ? (
          <p className="mb-0 text-secondary">현재 토글 조건에 맞는 결제내역이 없습니다.</p>
        ) : dashboardCalendarProcessingMode === "review" ? (
          <p className="mb-0 text-secondary">이번 달에 남은 검토 필요 결제내역이 없습니다.</p>
        ) : dashboardCalendarProcessingMode === "uncategorized" ? (
          <p className="mb-0 text-secondary">이번 달에 남은 미분류 결제내역이 없습니다.</p>
        ) : (
          <div className="dashboard-calendar-empty-copy" aria-live="polite">
            <p>오늘은 돈을 아꼈다!</p>
          </div>
        )}
      </div>
    </section>
  );

  if (mode === "sun") {
    return (
      <div className="page-stack">
        <section className="page-section" style={getMotionStyle(0)} data-guide-target="records-sun-overview">
          <div className="section-head">
            <div>
              <span className="section-kicker">해 기록 통계</span>
              <h2 className="section-title">연간 흐름 그래프</h2>
            </div>
            <div className="dashboard-section-toolbar">
              <AppSelect
                className="dashboard-section-month-select"
                value={selectedAnnualYear}
                onChange={setSelectedAnnualYear}
                options={
                  annualYearOptions.length
                    ? annualYearOptions.map((year) => ({ value: year, label: `${year}년` }))
                    : [{ value: selectedAnnualYear, label: `${selectedAnnualYear}년` }]
                }
                ariaLabel="해 기록 연도 선택"
              />
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
      {mode === "dashboard" ? moonCalendarSection : null}
      {mode === "moon" ? (
        <>
      <section className="page-section" style={getMotionStyle(0)} data-guide-target="records-moon-overview">
        <div className="section-head">
          <div>
            <span className="section-kicker">달 기록 통계</span>
            <h2 className="section-title">소비그래프</h2>
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

      <section className="page-section" style={getMotionStyle(1)} data-guide-target="dashboard-summary">
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

      <section className="page-section" style={getMotionStyle(1)}>
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

      <section className="page-section" style={getMotionStyle(2)}>
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
      <section className="page-section" style={getMotionStyle(1)} data-guide-target="dashboard-foundation-overview">
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
            <p className="mb-0 text-secondary">활성 {activePeopleCount} / {scope.people.length}</p>
            <span className={`badge ${peopleSetupRemaining ? "text-bg-warning" : "text-bg-success"}`}>
              {peopleSetupRemaining ? "설정 필요" : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{peopleSetupRemaining ? "사용자 정보부터 정리해 주세요." : "사용자 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3 text-nowrap">
              사용자 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(3)}>
            <h3>계좌</h3>
            <p className="mb-0 text-secondary">연결 {ownedAccountCount} / {scope.accounts.length}</p>
            <span className={`badge ${unmappedAccountCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedAccountCount ? `미연결 ${unmappedAccountCount}` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedAccountCount ? "소유자가 없는 계좌가 남아 있습니다." : "계좌 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3">
              계좌 관리
            </Link>
          </article>
          <article className="resource-card" style={getMotionStyle(4)}>
            <h3>카드</h3>
            <p className="mb-0 text-secondary">연결 {linkedCardCount} / {scope.cards.length}</p>
            <span className={`badge ${unmappedCardCount ? "text-bg-warning" : "text-bg-success"}`}>
              {unmappedCardCount ? `미연결 ${unmappedCardCount}` : "준비 완료"}
            </span>
            <p className="mb-0 text-secondary">{unmappedCardCount ? "카드 연결 정보가 덜 정리되었습니다." : "카드 정보가 준비되었습니다."}</p>
            <Link to="/connections/assets" className="btn btn-outline-primary btn-sm mt-3">
              카드 관리
            </Link>
          </article>
        </div>
      </section>
      {mode !== "dashboard" ? (
      <section className="page-section" style={getMotionStyle(2)} data-guide-target="dashboard-flow-overview">
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
          <div className="dashboard-summary-action">
            <Link to="/settlements" className="btn btn-outline-secondary btn-sm">
              흐름 보기
            </Link>
          </div>
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
      ) : null}

      {mode !== "dashboard" ? (
      <section className="page-section" style={getMotionStyle(3)} data-guide-target="dashboard-loop-station">
        <div className="section-head">
          <div>
            <span className="section-kicker">루프스테이션</span>
            <h2 className="section-title">반복 소비를 미리 읽기</h2>
          </div>
          <div className="dashboard-section-toolbar">
            <span className="dashboard-loop-station-count">추적 {loopStationInsights.length}개</span>
          </div>
        </div>
        <div className="review-summary-panel compact-summary-panel dashboard-summary-action-panel mb-4">
          <div className="review-summary-copy">
            <strong>
              {featuredLoopStationInsights.length
                ? `반복 소비 ${featuredLoopStationInsights.length}개를 루프로 읽었습니다`
                : "아직 읽을 수 있는 반복 소비 루프가 부족합니다"}
            </strong>
            <p className="mb-0 text-secondary">
              {featuredLoopStationInsights.length
                ? "구매 간격, 최근 금액 변화, 다음 구매 예정 시점을 같이 보여줍니다."
                : "같은 가맹점 소비가 2번 이상 쌓이면 루프스테이션이 다음 구매 시점을 계산해 드립니다."}
            </p>
          </div>
          <div className="dashboard-summary-action">
            <Link to="/collections/card" className="btn btn-outline-secondary btn-sm">
              결제내역 보기
            </Link>
          </div>
        </div>
        {featuredLoopStationInsights.length ? (
          <div className="dashboard-loop-station-grid">
            {featuredLoopStationInsights.map((loop, index) => (
              <article key={loop.merchantName} className="dashboard-loop-card" style={getMotionStyle(4 + index)}>
                <div className="dashboard-loop-card-head">
                  <div>
                    <span className="dashboard-loop-card-kicker">{loop.cadenceLabel}</span>
                    <h3>{loop.merchantName}</h3>
                  </div>
                  <span className={`dashboard-loop-due-chip${(loop.daysUntilNextPurchase ?? 0) >= 0 ? " is-due" : ""}`}>
                    {getLoopDueLabel(loop.daysUntilNextPurchase)}
                  </span>
                </div>
                <div className="dashboard-loop-stat-row">
                  <div>
                    <span className="stat-label">최근 결제</span>
                    <strong>{formatCurrency(loop.latestAmount)}</strong>
                  </div>
                  <div className={`dashboard-loop-amount-delta ${getLoopAmountTone(loop.amountDelta)}`}>
                    {loop.amountDelta === 0 ? "변화 없음" : `${loop.amountDelta > 0 ? "+" : "-"}${formatCurrency(Math.abs(loop.amountDelta))}`}
                  </div>
                </div>
                <div className="dashboard-loop-meta-grid">
                  <div>
                    <span>평균 주기</span>
                    <strong>{loop.averageIntervalDays}일</strong>
                  </div>
                  <div>
                    <span>직전 간격</span>
                    <strong>{loop.latestIntervalDays ? `${loop.latestIntervalDays}일` : "-"}</strong>
                  </div>
                  <div>
                    <span>다음 예정</span>
                    <strong>{loop.nextExpectedAt ? formatDateLabel(loop.nextExpectedAt) : "-"}</strong>
                  </div>
                  <div>
                    <span>평균 금액</span>
                    <strong>{formatCurrency(loop.averageAmount)}</strong>
                  </div>
                </div>
                <div className="dashboard-loop-footer">
                  <span>최근 구매 {formatDateLabel(loop.latestOccurredAt)}</span>
                  <span>반복 {loop.transactionCount}회</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyStateCallout
            kicker="루프스테이션"
            title="반복 소비 루프가 아직 충분하지 않습니다"
            description="같은 가맹점 소비가 조금 더 쌓이면 구매 주기와 다음 예상일을 루프스테이션에서 보여드립니다."
            actions={
              <Link to="/collections/card" className="btn btn-outline-primary btn-sm">
                결제내역 보러 가기
              </Link>
            }
          />
        )}
      </section>
      ) : null}
        </>
      ) : null}

      <AppModal
        open={pendingDashboardCalendarProcessingMode !== null}
        title={pendingDashboardCalendarProcessingMode === "review" ? "자동검토 시작" : "분류작업 시작"}
        dialogClassName="dashboard-processing-confirm-modal"
        description={
          pendingDashboardCalendarProcessingMode === "review"
            ? "이번 달 1일부터 말일까지 날짜를 넘겨가며 검토가 필요한 결제내역을 순서대로 확인할까요?"
            : pendingDashboardCalendarProcessingMode === "uncategorized"
              ? "분류작업을 시작하시겠습니까? 이번 달 1일부터 말일까지 날짜를 넘겨가며 미분류 결제내역을 순서대로 정리합니다."
              : ""
        }
        onClose={() => setPendingDashboardCalendarProcessingMode(null)}
      >
        <div className="d-flex justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setPendingDashboardCalendarProcessingMode(null)}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!pendingDashboardCalendarProcessingMode) return;
              handleStartDashboardCalendarProcessing(pendingDashboardCalendarProcessingMode);
              setPendingDashboardCalendarProcessingMode(null);
            }}
          >
            시작
          </button>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(loopConfirmState)}
        title="루프 후보 확인"
        description="이번 거래를 기준으로 과거 소비를 함께 보여드릴게요. 같은 반복 소비가 맞는지 보고 묶어서 등록해 주세요."
        onClose={() => {
          setLoopConfirmState(null);
          setLoopConfirmDragMode(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setLoopConfirmState(null);
                setLoopConfirmDragMode(null);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!loopConfirmState?.candidateIds.length}
              onClick={() => {
                if (!loopConfirmState?.candidateIds.length) return;
                setTransactionLoopFlagBatch(workspaceId, loopConfirmState.candidateIds, true);
                setLoopConfirmState(null);
              }}
            >
              {`선택한 ${loopConfirmState?.candidateIds.length ?? 0}건으로 루프 설정`}
            </button>
          </>
        }
      >
        {loopConfirmState ? (
          <div className="loop-confirm-panel">
            <div className="loop-confirm-summary">
              <strong>이번 거래</strong>
              <span>이 거래는 루프 기준으로 고정됩니다. 아래 과거 거래 중 같은 소비만 함께 묶어 주세요.</span>
            </div>

            {loopConfirmTargetTransaction ? (
              <div className="loop-confirm-item is-current is-selected">
                <input type="checkbox" checked readOnly aria-label="현재 거래는 항상 포함됩니다." />
                <div className="loop-confirm-copy">
                  <strong>{loopConfirmTargetTransaction.merchantName}</strong>
                  <span>{`${loopConfirmTargetTransaction.occurredAt.slice(0, 10)} · ${formatCurrency(loopConfirmTargetTransaction.amount)}`}</span>
                  <span>{loopConfirmTargetTransaction.description || "비고 없음"}</span>
                </div>
              </div>
            ) : null}

            <div className="loop-confirm-summary">
              <strong>같이 볼 과거 거래</strong>
              <span>
                {loopConfirmPastTransactions.length
                  ? "같은 거래처럼 보이는 과거 내역입니다. 맞는 것만 남기고 루프를 등록해 주세요."
                  : "지금은 함께 묶을 과거 거래가 없습니다. 이번 거래만 루프로 등록됩니다."}
              </span>
            </div>

            {loopConfirmPastTransactions.length ? (
              <>
                <div className="loop-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      setLoopConfirmState((current) =>
                        current
                          ? {
                              ...current,
                              candidateIds: [...new Set([current.transactionId, ...current.suggestedIds])],
                            }
                          : current,
                      )
                    }
                  >
                    추천 후보 모두 선택
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      setLoopConfirmState((current) =>
                        current
                          ? {
                              ...current,
                              candidateIds: [current.transactionId],
                            }
                          : current,
                      )
                    }
                  >
                    이번 거래만 남기기
                  </button>
                </div>

                {loopConfirmPastTransactions.map((transaction) => {
                  const checked = loopConfirmState.candidateIds.includes(transaction.id);
                  const isSuggested = loopConfirmState.suggestedIds.includes(transaction.id);
                  return (
                    <label
                      key={transaction.id}
                      className={`loop-confirm-item${checked ? " is-selected" : ""}`}
                      onMouseEnter={() => {
                        if (loopConfirmDragMode === null) return;
                        setLoopConfirmCandidateSelection(transaction.id, loopConfirmDragMode);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const nextChecked = !checked;
                          setLoopConfirmDragMode(nextChecked);
                          setLoopConfirmCandidateSelection(transaction.id, nextChecked);
                        }}
                        onChange={() => undefined}
                        onKeyDown={(event) => {
                          if (event.key !== " " && event.key !== "Enter") return;
                          event.preventDefault();
                          setLoopConfirmCandidateSelection(transaction.id, !checked);
                        }}
                      />
                      <div className="loop-confirm-copy">
                        <strong>{transaction.merchantName}</strong>
                        <span>{`${transaction.occurredAt.slice(0, 10)} · ${formatCurrency(transaction.amount)}`}</span>
                        <span>{transaction.description || "비고 없음"}</span>
                        <small>{isSuggested ? "자동으로 묶인 추천 후보" : "직접 선택한 후보"}</small>
                      </div>
                    </label>
                  );
                })}
              </>
            ) : null}
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={isIncomeModalOpen}
        title="수입"
        onClose={() => setIsIncomeModalOpen(false)}
        dialogClassName="dashboard-income-modal"
        mobilePresentation="sheet"
      >
        <IncomeManagementContent />
      </AppModal>

      <AppModal
        open={isStatementUploadModalOpen}
        title="명세서 업로드"
        description="카드 명세서를 먼저 미리보기로 확인하고, 연도별 업로드 기록까지 한 자리에서 볼 수 있습니다."
        onClose={handleCloseStatementUploadModal}
        dialogClassName="dashboard-statement-upload-modal"
        mobilePresentation="sheet"
      >
        <div className="dashboard-statement-upload-modal-body">
          <section className="dashboard-statement-modal-section-card">
            <div className="dashboard-statement-modal-section-head">
              <div>
                <span className="section-kicker">업로드 센터</span>
                <h2 className="section-title">카드 명세서 가져오기</h2>
                <p className="dashboard-statement-modal-section-copy">
                  엑셀 파일을 올리면 바로 반영하지 않고 먼저 미리보기로 검토합니다. 확인 후 한 번에 가져오면 됩니다.
                </p>
              </div>
            </div>

            <section className="dashboard-statement-upload-section" data-guide-target="transactions-upload">

            <label
              className={`upload-dropzone${isDropzoneActive ? " is-active" : ""}${isDropzoneInvalid ? " is-invalid" : ""}`}
              data-guide-target="transactions-upload-action"
              onDragEnter={handleDropzoneDragEnter}
              onDragOver={handleDropzoneDragOver}
              onDragLeave={handleDropzoneDragLeave}
              onDrop={handleDropzoneDrop}
            >
              <div className="upload-dropzone-copy">
                <div className="upload-dropzone-kicker-row">
                  <span className="upload-dropzone-kicker">카드 이용 내역 명세서 업로드</span>
                  <span className="upload-dropzone-format-badge" aria-hidden="true">
                    .xlsx / .xls
                  </span>
                </div>
                <strong>{dropzoneTitle}</strong>
                <p className="mb-0 text-secondary">{dropzoneDescription}</p>
              </div>
              <input
                ref={statementImportFileInputRef}
                hidden
                type="file"
                accept=".xlsx,.xls"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  try {
                    await handlePickedFile(file);
                  } finally {
                    event.currentTarget.value = "";
                  }
                }}
              />
            </label>

            {isPreparingPreview ? <p className="text-secondary mt-3 mb-0">업로드 미리보기를 준비하고 있습니다.</p> : null}

            {previewBundle ? (
              <div className="page-section mt-4 import-preview-panel" data-guide-target="transactions-upload-preview">
                <div className="section-head">
                  <div>
                    <span className="section-kicker">미리보기</span>
                    <h3 className="section-title">{previewFileName}</h3>
                  </div>
                </div>
                <div className="stats-grid import-preview-stats">
                  <article className="stat-card">
                    <span className="stat-label">거래</span>
                    <strong>{previewBundle.transactions.length}건</strong>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">검토</span>
                    <strong>{previewBundle.reviews.length}건</strong>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">카드</span>
                    <strong>{previewBundle.cards.length}장</strong>
                  </article>
                </div>

                <div className="import-preview-control-grid mt-4">
                  <div className="import-preview-control-card">
                    <label className="form-label">누구의 카드인가요?</label>
                    <AppSelect
                      value={selectedImportOwnerId}
                      onChange={setSelectedImportOwnerId}
                      disabled={!scope.people.length}
                      options={[
                        { value: "", label: "누구의 명세서인지 선택" },
                        ...scope.people.map((person) => ({ value: person.id, label: person.displayName || person.name })),
                      ]}
                      ariaLabel="가져올 카드 소유자 선택"
                    />
                  </div>

                  <div className="import-preview-control-card">
                    <label className="form-label">언제 청구된 명세서 인가요?</label>
                    <AppSelect
                      value={selectedStatementMonth}
                      onChange={setSelectedStatementMonth}
                      disabled={!previewStatementMonthOptions.length}
                      options={
                        !previewStatementMonthOptions.length
                          ? [{ value: "", label: "청구월 후보를 만들 수 없습니다" }]
                          : previewStatementMonthOptions.map((month) => ({ value: month, label: formatStatementMonthLabel(month) }))
                      }
                      ariaLabel="예상 청구월 명세서 선택"
                    />
                  </div>
                </div>

                {previewCardMatches.length ? (
                  <div className="people-subboard import-preview-card-section mt-4">
                    <div className="people-subboard-head">
                      <div>
                        <span className="section-kicker">업로드 자산 확인</span>
                        <h4>카드 확인</h4>
                      </div>
                    </div>
                    <div className="board-case-section-body">
                      <div className="category-case-grid import-preview-card-grid">
                        {previewCardMatches.map(({ card, matchedCard, draftName }) => (
                          <article key={card.id} className="category-case-card people-board-card import-preview-card">
                            <div className="category-case-card-copy people-board-card-copy import-preview-card-copy">
                              {!selectedImportOwnerId || matchedCard ? <strong>{card.name}</strong> : null}
                              {selectedImportOwnerId && !matchedCard ? (
                                <>
                                  <div className="import-preview-card-input-block">
                                    <input
                                      id={`import-card-name-${card.id}`}
                                      className="form-control"
                                      value={draftName}
                                      onChange={(event) =>
                                        setImportCardNameDrafts((current) => ({
                                          ...current,
                                          [card.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                  <span>
                                    {card.issuerName}
                                    {card.cardNumberMasked ? ` (${card.cardNumberMasked})` : ""}
                                  </span>
                                </>
                              ) : (
                                <span>
                                  {card.issuerName}
                                  {card.cardNumberMasked ? ` (${card.cardNumberMasked})` : ""}
                                </span>
                              )}
                              {!selectedImportOwnerId ? <span>사용자를 선택하면 해당 사용자의 카드인지 확인합니다.</span> : null}
                            </div>
                            <div className="import-preview-card-footer">
                              <div
                                className={`category-case-pill import-preview-card-pill${
                                  !selectedImportOwnerId ? "" : matchedCard ? " is-success" : " is-warning"
                                }`}
                              >
                                {!selectedImportOwnerId ? "사용자 선택 후 확인" : matchedCard ? "기존 카드" : "새 카드"}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="action-row mt-4">
                  <button
                    className="btn btn-primary"
                    type="button"
                    data-guide-target="transactions-upload-commit"
                    onClick={handleCommitPreview}
                    disabled={!selectedImportOwnerId || !selectedStatementMonth || !scope.people.length}
                  >
                    {getPostImportLabel(previewBundle)}
                  </button>
                  <button className="btn btn-outline-secondary" type="button" onClick={clearPreview}>
                    미리보기 닫기
                  </button>
                </div>
              </div>
            ) : null}
            </section>
          </section>

          <section className="dashboard-statement-modal-section-card">
            <div className="dashboard-statement-modal-section-head">
              <div>
                <span className="section-kicker">관리</span>
                <h2 className="section-title">{selectedStatementHistoryYear}년 명세서 업로드 내역</h2>
                <p className="dashboard-statement-modal-section-copy">
                  업로드한 명세서를 연도별로 모아 보고, 필요한 경우 바로 결제내역으로 이어서 확인할 수 있습니다.
                </p>
              </div>
              <AppSelect
                className="toolbar-select"
                ariaLabel="명세서 업로드 내역 연도 선택"
                value={selectedStatementHistoryYear}
                onChange={setSelectedStatementHistoryYear}
                options={importHistoryYears.map((year) => ({ value: year, label: `${year}년` }))}
              />
            </div>

            <section className="dashboard-statement-history-section">
              {!visibleStatementHistoryRecords.length ? (
                <p className="text-secondary mb-0">아직 해당 연도의 업로드된 명세서가 없습니다.</p>
              ) : (
                <div className="dashboard-statement-history-year-list">
                  {visibleStatementHistoryMonthGroups.map(({ month, records }) => (
                    <section key={month} className="dashboard-statement-history-year-group">
                      <div className="dashboard-statement-history-year-head">
                        <strong>{formatMonthLabel(month)}</strong>
                        <span>{records.length}건</span>
                      </div>
                      <div className="dashboard-statement-history-card-grid">
                        {records.map((record) => (
                          <article key={record.id} className="dashboard-statement-history-card">
                            <div className="dashboard-statement-history-card-copy">
                              <div className="dashboard-statement-history-card-title">
                                <strong>{getStatementRecordLabel(record)}</strong>
                                {!linkedImportRecordIds.has(record.id) ? <span className="badge text-bg-light">기존 기록</span> : null}
                              </div>
                              <p>{record.fileName}</p>
                              <div className="dashboard-statement-history-card-meta">
                                <span>{record.importedAt.slice(0, 16).replace("T", " ")}</span>
                                <span>거래 {record.rowCount}건</span>
                                <span>검토 {record.reviewCount}건</span>
                              </div>
                            </div>
                            <div className="dashboard-statement-history-card-actions">
                              {linkedImportRecordIds.has(record.id) ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={() => {
                                    setIsStatementUploadModalOpen(false);
                                    navigate(`/collections/card?statementId=${record.id}`);
                                  }}
                                >
                                  결제내역 보기
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                disabled={!linkedImportRecordIds.has(record.id)}
                                onClick={() => handleDeleteImportRecord(record)}
                              >
                                삭제
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(previewBundle) && shouldPromptLinkedAccounts && isLinkedAccountModalOpen}
        title="납부계좌 빠른 연결"
        description="카드값 계좌가 있습니다. 연결할 계좌가 있으면 선택하세요."
        onClose={() => setIsLinkedAccountModalOpen(false)}
        footer={
          <div className="import-linked-account-footer-actions">
            <button type="button" className="btn btn-primary" onClick={commitPreview}>
              선택 반영 후 가져오기
            </button>
          </div>
        }
      >
        <div className="import-linked-account-modal">
          <div className="import-linked-account-summary">
            <strong>새로 등록될 신용카드 {newCreditPreviewCards.length}장</strong>
            <span>납부계좌 후보 {linkedAccountCandidates.length}개를 찾았습니다.</span>
          </div>

          <div className="import-linked-account-list">
            {newCreditPreviewCards.map(({ card }, index) => {
              const selectedLinkedAccountId = importCardLinkedAccountDrafts[card.id] ?? "";

              return (
                <article key={card.id} className="review-card import-linked-card" style={getMotionStyle(index + 1)}>
                  <div className="import-linked-card-head">
                    <div>
                      <span className="import-linked-card-kicker">새 카드</span>
                      <h3 className="mb-1">{importCardNameDrafts[card.id] ?? card.name}</h3>
                      <p className="mb-0 text-secondary">
                        {card.issuerName}
                        {card.cardNumberMasked ? ` · ${card.cardNumberMasked}` : ""}
                      </p>
                    </div>
                    <span className="badge text-bg-light">납부계좌 선택</span>
                  </div>

                  <div className="category-case-grid import-linked-account-option-grid">
                    <label
                      className={`category-case-card people-board-card import-linked-account-option import-linked-account-option-skip${
                        selectedLinkedAccountId === "" ? " is-selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`import-linked-account-${card.id}`}
                        checked={selectedLinkedAccountId === ""}
                        onChange={() =>
                          setImportCardLinkedAccountDrafts((current) => ({
                            ...current,
                            [card.id]: "",
                          }))
                        }
                      />
                      <div className="category-case-card-copy people-board-card-copy import-linked-account-option-skip-copy">
                        <span className="import-linked-account-option-skip-badge">지금은 연결하지 않기</span>
                      </div>
                    </label>

                    {linkedAccountCandidates.map((account) => (
                      <label
                        key={`${card.id}-${account.id}`}
                        className={`category-case-card people-board-card import-linked-account-option${
                          selectedLinkedAccountId === account.id ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`import-linked-account-${card.id}`}
                          checked={selectedLinkedAccountId === account.id}
                          onChange={() =>
                            setImportCardLinkedAccountDrafts((current) => ({
                              ...current,
                              [card.id]: account.id,
                            }))
                          }
                        />
                        <div className="category-case-card-copy people-board-card-copy">
                          <strong>{account.alias || account.name}</strong>
                          <span>{account.institutionName || "직접 입력"}</span>
                          <span>{account.accountNumberMasked || "계좌번호 미입력"}</span>
                          <div className="people-linked-category-block">
                            <span className={`people-linked-category-count${account.isShared ? "" : " is-empty"}`}>
                              {account.isShared ? "공동 계좌" : "개인 계좌"}
                            </span>
                          </div>
                        </div>
                        <div className="category-case-pill">{account.source === "existing" ? "기존 계좌" : "이번 업로드"}</div>
                      </label>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </AppModal>

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
