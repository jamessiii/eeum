import type { AppState, FinancialProfile, Transaction } from "../../shared/types/models";
import { getRecurringMerchantSuggestionCount } from "../classification/suggestions";
import { isDiagnosisReady } from "./diagnosisReady";
import { getExpenseImpactStats } from "../transactions/expenseImpactStats";
import { getActiveTransactionCount, getActiveTransactions } from "../transactions/meta";
import { getSourceTypeLabel } from "../transactions/sourceTypes";
import { getDominantSourceBreakdown, getSourceBreakdown } from "../transactions/sourceBreakdown";
import { getOpenReviewCount } from "../workspace/health";

export type InsightTone = "stable" | "caution" | "warning";
export type WorkspaceInsightBasis = "month" | "statement";

export interface WorkspaceInsightsInput {
  basis: WorkspaceInsightBasis;
  label: string;
  transactions: Transaction[];
}

export interface WorkspaceInsights {
  basis: WorkspaceInsightBasis;
  label: string;
  transactionCount: number;
  income: number;
  expense: number;
  savings: number;
  spendRate: number;
  savingsRate: number;
  fixedExpense: number;
  fixedExpenseRate: number;
  reviewCount: number;
  internalTransferCount: number;
  uncategorizedCount: number;
  recurringSuggestionCount: number;
  isFinancialProfileReady: boolean;
  isDiagnosisReady: boolean;
  topCategories: Array<{ categoryName: string; amount: number }>;
  sourceBreakdown: Array<{ sourceType: Transaction["sourceType"]; count: number; expenseAmount: number }>;
  headlineCards: Array<{ title: string; description: string }>;
  nextSteps: string[];
  coaching: string;
  spendTone: InsightTone;
  savingsTone: InsightTone;
  fixedTone: InsightTone;
}

function summarizeCategories(state: AppState, workspaceId: string, transactions: Transaction[]) {
  const categoryNameMap = new Map(
    state.categories.filter((category) => category.workspaceId === workspaceId).map((category) => [category.id, category.name]),
  );
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    const categoryName = transaction.categoryId ? categoryNameMap.get(transaction.categoryId) ?? "미분류" : "미분류";
    totals.set(categoryName, (totals.get(categoryName) ?? 0) + transaction.amount);
  }

  return [...totals.entries()]
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);
}

function getSpendTone(profile: FinancialProfile | null, spendRate: number, hasIncomeBasis: boolean): InsightTone {
  if (!profile || !hasIncomeBasis) return "caution";
  if (spendRate > profile.warningSpendRate) return "warning";
  if (spendRate > profile.warningSpendRate * 0.85) return "caution";
  return "stable";
}

function getSavingsTone(profile: FinancialProfile | null, savingsRate: number, hasIncomeBasis: boolean): InsightTone {
  if (!profile || !hasIncomeBasis) return "caution";
  if (savingsRate < profile.targetSavingsRate * 0.7) return "warning";
  if (savingsRate < profile.targetSavingsRate) return "caution";
  return "stable";
}

function getFixedTone(profile: FinancialProfile | null, fixedExpenseRate: number, hasIncomeBasis: boolean): InsightTone {
  if (!profile || !hasIncomeBasis) return "caution";
  if (fixedExpenseRate > profile.warningFixedCostRate) return "warning";
  if (fixedExpenseRate > profile.warningFixedCostRate * 0.85) return "caution";
  return "stable";
}

function getRecordedMonthlyIncome(transactions: Transaction[]) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.status !== "active") return sum;
    if (transaction.sourceType !== "account") return sum;
    if (transaction.transactionType !== "income") return sum;
    if (transaction.isInternalTransfer) return sum;
    return sum + Math.abs(transaction.amount);
  }, 0);
}

export function getWorkspaceInsights(
  state: AppState,
  workspaceId: string,
  { basis, label, transactions }: WorkspaceInsightsInput,
): WorkspaceInsights {
  const activeTransactions = getActiveTransactions(transactions);
  const expenseStats = getExpenseImpactStats(transactions);
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const reviewCount = getOpenReviewCount(
    state.reviews.filter((item) => {
      if (item.workspaceId !== workspaceId) return false;
      if (!transactionIds.size) return false;
      if (transactionIds.has(item.primaryTransactionId)) return true;
      return item.relatedTransactionIds.some((transactionId) => transactionIds.has(transactionId));
    }),
  );
  const financialProfile = state.financialProfiles.find((item) => item.workspaceId === workspaceId) ?? null;
  const monthlyIncomeBasis = getRecordedMonthlyIncome(transactions);
  const hasIncomeBasis = monthlyIncomeBasis > 0;
  const expense = expenseStats.expenseImpactAmount;
  const savings = Math.max(0, monthlyIncomeBasis - expense);
  const spendRate = hasIncomeBasis ? expense / monthlyIncomeBasis : 0;
  const savingsRate = hasIncomeBasis ? savings / monthlyIncomeBasis : 0;
  const recurringSuggestionCount = getRecurringMerchantSuggestionCount(
    transactions,
    state.categories.filter((item) => item.workspaceId === workspaceId),
  );
  const fixedCategoryIds = new Set(
    state.categories
      .filter((category) => category.workspaceId === workspaceId && category.fixedOrVariable === "fixed")
      .map((category) => category.id),
  );
  let fixedExpense = 0;
  for (const transaction of expenseStats.activeExpenseTransactions) {
    if (transaction.categoryId && fixedCategoryIds.has(transaction.categoryId)) {
      fixedExpense += Math.abs(transaction.amount);
    }
  }
  const fixedExpenseRate = hasIncomeBasis ? fixedExpense / monthlyIncomeBasis : 0;
  const topCategories = summarizeCategories(state, workspaceId, expenseStats.activeExpenseTransactions);
  const sourceBreakdown = getSourceBreakdown(activeTransactions);
  const dominantSource = getDominantSourceBreakdown(sourceBreakdown, Math.max(1, activeTransactions.length));

  const headlineCards: Array<{ title: string; description: string }> = [];
  if (topCategories.length && expense > 0) {
    const biggest = topCategories[0];
    headlineCards.push({
      title: "가장 큰 지출 원인",
      description: `${biggest.categoryName}이(가) 선택한 기준 소비의 ${Math.round((biggest.amount / expense) * 100)}%를 차지합니다.`,
    });
  }
  if (dominantSource) {
    headlineCards.push({
      title: "가장 많은 입력 경로",
      description: `${getSourceTypeLabel(dominantSource.sourceType)} 거래 비중이 높습니다. 이 경로를 먼저 점검하면 전체 흐름을 빨리 읽을 수 있습니다.`,
    });
  }
  if (reviewCount > 0 || expenseStats.uncategorizedCount > 0) {
    headlineCards.push({
      title: "데이터 정리 상태",
      description: `검토 ${reviewCount}건, 미분류 ${expenseStats.uncategorizedCount}건이 남아 있어 숫자가 더 정교해질 수 있습니다.`,
    });
  }
  if (!headlineCards.length) {
    headlineCards.push({
      title: "선택 기준 요약",
      description: "검토와 분류가 안정적으로 정리되어 현재 수치를 비교적 믿고 볼 수 있습니다.",
    });
  }

  const nextSteps: string[] = [];
  const activePeopleCount = state.people.filter((item) => item.workspaceId === workspaceId && item.isActive).length;
  const accountCount = state.accounts.filter((item) => item.workspaceId === workspaceId).length;
  const cardCount = state.cards.filter((item) => item.workspaceId === workspaceId).length;
  if (activePeopleCount === 0) nextSteps.push("사용자를 추가해서 거래 주체를 먼저 정리해보세요.");
  if (accountCount === 0) nextSteps.push("계좌를 등록하면 흐름 해석이 훨씬 쉬워집니다.");
  if (cardCount === 0) nextSteps.push("카드를 등록하면 카드 사용 흐름을 더 정확하게 볼 수 있습니다.");
  if (reviewCount > 0) nextSteps.push(`검토함 ${reviewCount}건을 먼저 정리해보세요.`);
  if (expenseStats.uncategorizedCount > 0) nextSteps.push(`미분류 거래 ${expenseStats.uncategorizedCount}건을 정리하면 통계가 더 정확해집니다.`);
  if (expenseStats.internalTransferCount > 0) nextSteps.push(`내부이체 ${expenseStats.internalTransferCount}건을 점검하면 소비 통계가 더 깔끔해집니다.`);
  if (!hasIncomeBasis) nextSteps.push("이체내역에 수입 흐름이 들어오면 월수입 기준과 저축 해석이 함께 계산됩니다.");
  if (recurringSuggestionCount > 0) nextSteps.push(`반복 지출 제안 ${recurringSuggestionCount}개를 확인하면 분류 속도가 빨라집니다.`);
  if (!nextSteps.length) nextSteps.push("데이터가 안정적으로 쌓이고 있습니다. 상위 지출 카테고리부터 점검해보세요.");

  let coaching = "현재 데이터 흐름이 안정적으로 쌓이고 있습니다.";
  if (!hasIncomeBasis) {
    coaching = "이체내역에 수입 흐름이 아직 없어 월수입 기준과 저축 해석이 0원 기준으로 표시됩니다.";
  } else if (!financialProfile) {
    coaching = "목표 저축률과 경고 기준을 설정하면 대시보드 해석이 더 정확해집니다.";
  } else if (reviewCount > 0 || expenseStats.uncategorizedCount > 0) {
    coaching = "검토와 분류가 조금 더 정리되면 선택한 기준 숫자를 훨씬 안정적으로 읽을 수 있습니다.";
  } else if (spendRate > financialProfile.warningSpendRate) {
    coaching = "선택한 기준 지출률이 높습니다. 상위 지출 카테고리부터 먼저 점검해보세요.";
  } else if (savingsRate < financialProfile.targetSavingsRate) {
    coaching = "저축률이 목표보다 낮습니다. 변동지출 쪽에서 줄일 수 있는 항목을 찾아보세요.";
  } else if (fixedExpenseRate > financialProfile.warningFixedCostRate) {
    coaching = "고정지출 비중이 높은 편입니다. 구독, 보험, 통신비처럼 반복 비용을 점검해보세요.";
  }

  return {
    basis,
    label,
    transactionCount: getActiveTransactionCount(transactions),
    income: monthlyIncomeBasis,
    expense,
    savings,
    spendRate,
    savingsRate,
    fixedExpense,
    fixedExpenseRate,
    reviewCount,
    internalTransferCount: expenseStats.internalTransferCount,
    uncategorizedCount: expenseStats.uncategorizedCount,
    recurringSuggestionCount,
    isFinancialProfileReady: hasIncomeBasis,
    isDiagnosisReady: isDiagnosisReady({
      hasTransactions: getActiveTransactionCount(transactions) > 0,
      postImportReady: reviewCount === 0 && expenseStats.uncategorizedCount === 0,
      monthlyNetIncome: monthlyIncomeBasis,
    }),
    topCategories,
    sourceBreakdown,
    headlineCards,
    nextSteps,
    coaching,
    spendTone: getSpendTone(financialProfile, spendRate, hasIncomeBasis),
    savingsTone: getSavingsTone(financialProfile, savingsRate, hasIncomeBasis),
    fixedTone: getFixedTone(financialProfile, fixedExpenseRate, hasIncomeBasis),
  };
}
