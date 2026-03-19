import { monthKey } from "../../shared/utils/date";
import type { AppState, Category, FinancialProfile, ReviewItem, Tag, Transaction } from "../../shared/types/models";
import { getRecurringMerchantSuggestionCount } from "../classification/suggestions";
import { isDiagnosisReady } from "./diagnosisReady";
import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
} from "../transactions/meta";
import { getSourceTypeLabel } from "../transactions/sourceTypes";
import {
  getDominantSourceBreakdown,
  getSourceBreakdown,
  isDominantSourceConcentrated,
} from "../transactions/sourceBreakdown";
import { getOpenReviewCount } from "../workspace/health";

export type InsightTone = "stable" | "caution" | "warning";

export interface WorkspaceInsights {
  month: string;
  transactionCount: number;
  income: number;
  expense: number;
  savings: number;
  spendRate: number;
  savingsRate: number;
  fixedExpense: number;
  fixedExpenseRate: number;
  sharedExpense: number;
  sharedExpenseCount: number;
  reviewCount: number;
  internalTransferCount: number;
  uncategorizedCount: number;
  untaggedCount: number;
  recurringSuggestionCount: number;
  isFinancialProfileReady: boolean;
  isDiagnosisReady: boolean;
  topCategories: Array<{ categoryName: string; amount: number }>;
  topTags: Array<{ tagName: string; amount: number; color: string; count: number }>;
  sourceBreakdown: Array<{ sourceType: Transaction["sourceType"]; count: number; expenseAmount: number }>;
  dominantSource: { sourceType: Transaction["sourceType"]; count: number; expenseAmount: number; share: number } | null;
  headlineCards: Array<{ title: string; description: string }>;
  nextSteps: string[];
  coaching: string;
  spendTone: InsightTone;
  savingsTone: InsightTone;
  fixedTone: InsightTone;
}

interface WorkspaceContext {
  transactions: Transaction[];
  reviews: ReviewItem[];
  categories: Category[];
  tags: Tag[];
  financialProfile: FinancialProfile | null;
  peopleCount: number;
  accountCount: number;
  cardCount: number;
}

type InsightMetrics = Omit<
  WorkspaceInsights,
  "month" | "topCategories" | "topTags" | "sourceBreakdown" | "dominantSource" | "headlineCards" | "nextSteps" | "coaching" | "spendTone" | "savingsTone" | "fixedTone"
>;

function buildInsightMetrics(
  transactions: Transaction[],
  reviews: ReviewItem[],
  fixedCategoryIds: Set<string>,
  monthlyNetIncome: number,
  recurringSuggestionCount: number,
): InsightMetrics {
  let expense = 0;
  let fixedExpense = 0;
  let sharedExpense = 0;
  let sharedExpenseCount = 0;
  let internalTransferCount = 0;
  let uncategorizedCount = 0;
  let untaggedCount = 0;

  for (const transaction of transactions) {
    if (isActiveExpenseImpactTransaction(transaction)) {
      const amount = Math.abs(transaction.amount);
      expense += amount;

      if (transaction.categoryId && fixedCategoryIds.has(transaction.categoryId)) {
        fixedExpense += amount;
      }
      if (transaction.isSharedExpense) {
        sharedExpense += amount;
        sharedExpenseCount += 1;
      }
      if (!transaction.categoryId) {
        uncategorizedCount += 1;
      }
      if (transaction.tagIds.length === 0) {
        untaggedCount += 1;
      }
    }

    if (isActiveInternalTransferTransaction(transaction)) {
      internalTransferCount += 1;
    }
  }

  const reviewCount = getOpenReviewCount(reviews);
  const savings = Math.max(0, monthlyNetIncome - expense);
  const spendRate = monthlyNetIncome > 0 ? expense / monthlyNetIncome : 0;
  const savingsRate = monthlyNetIncome > 0 ? savings / monthlyNetIncome : 0;
  const fixedExpenseRate = monthlyNetIncome > 0 ? fixedExpense / monthlyNetIncome : 0;

  return {
    transactionCount: transactions.length,
    income: monthlyNetIncome,
    expense,
    savings,
    spendRate,
    savingsRate,
    fixedExpense,
    fixedExpenseRate,
    sharedExpense,
    sharedExpenseCount,
    reviewCount,
    internalTransferCount,
    uncategorizedCount,
    untaggedCount,
    recurringSuggestionCount,
    isFinancialProfileReady: monthlyNetIncome > 0,
    isDiagnosisReady: isDiagnosisReady({
      hasTransactions: transactions.length > 0,
      postImportReady: reviewCount === 0 && uncategorizedCount === 0 && untaggedCount === 0,
      monthlyNetIncome,
    }),
  };
}

function summarizeCategories(expenseTransactions: Transaction[], categories: Category[]) {
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));
  const totals = new Map<string, number>();

  for (const transaction of expenseTransactions) {
    const categoryName = transaction.categoryId ? categoryNameMap.get(transaction.categoryId) ?? "미분류" : "미분류";
    totals.set(categoryName, (totals.get(categoryName) ?? 0) + transaction.amount);
  }

  return [...totals.entries()]
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);
}

function summarizeTags(expenseTransactions: Transaction[], tags: Tag[]) {
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  const totals = new Map<string, { amount: number; count: number; color: string; tagName: string }>();

  for (const transaction of expenseTransactions) {
    if (!transaction.tagIds.length) continue;

    for (const tagId of transaction.tagIds) {
      const tag = tagMap.get(tagId);
      if (!tag) continue;
      const current = totals.get(tagId) ?? { amount: 0, count: 0, color: tag.color, tagName: tag.name };
      totals.set(tagId, {
        amount: current.amount + transaction.amount,
        count: current.count + 1,
        color: tag.color,
        tagName: tag.name,
      });
    }
  }

  return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, 4);
}

function getSpendTone(profile: FinancialProfile | null, spendRate: number): InsightTone {
  if (!profile) return "caution";
  if (spendRate > profile.warningSpendRate) return "warning";
  if (spendRate > profile.warningSpendRate * 0.85) return "caution";
  return "stable";
}

function getSavingsTone(profile: FinancialProfile | null, savingsRate: number): InsightTone {
  if (!profile) return "caution";
  if (savingsRate < profile.targetSavingsRate * 0.7) return "warning";
  if (savingsRate < profile.targetSavingsRate) return "caution";
  return "stable";
}

function getFixedTone(profile: FinancialProfile | null, fixedExpenseRate: number): InsightTone {
  if (!profile) return "caution";
  if (fixedExpenseRate > profile.warningFixedCostRate) return "warning";
  if (fixedExpenseRate > profile.warningFixedCostRate * 0.85) return "caution";
  return "stable";
}

function buildCoaching(
  context: WorkspaceContext,
  metrics: InsightMetrics,
  sourceBreakdown: WorkspaceInsights["sourceBreakdown"],
): string {
  const profile = context.financialProfile;
  const topSource = getDominantSourceBreakdown(sourceBreakdown, metrics.transactionCount);
  const hasDominantSourceConcentration = isDominantSourceConcentrated(topSource);
  if (!profile) {
    return "월 순수입이 아직 설정되지 않았습니다. 설정 화면에서 재무 기준선을 먼저 입력해주세요.";
  }

  if (topSource && hasDominantSourceConcentration) {
    const sourceShare = topSource.share;
    if (sourceShare >= 0.7) {
      const sourceLabel = getSourceTypeLabel(topSource.sourceType);
      return `이번 달 거래의 ${Math.round(sourceShare * 100)}%가 ${sourceLabel} 경로에 몰려 있습니다. 이 수단의 연결값과 분류 상태를 먼저 점검해보세요.`;
    }
  }

  if (metrics.spendRate > profile.warningSpendRate) {
    return "이번 달 지출률이 경고 기준을 넘었습니다. 변동지출 상위 카테고리부터 줄이는 편이 좋습니다.";
  }

  if (metrics.savingsRate < profile.targetSavingsRate) {
    return "저축률이 목표보다 낮습니다. 변동지출과 공동지출 흐름을 먼저 점검해보세요.";
  }

  if (metrics.fixedExpenseRate > profile.warningFixedCostRate) {
    return "고정지출 비중이 높은 편입니다. 구독, 보험, 대출처럼 구조적인 비용부터 점검해보세요.";
  }

  return "현재 소비 구조는 비교적 안정적입니다. 검토함과 카테고리 분류를 계속 정리하면 진단 정확도가 더 올라갑니다.";
}

function buildNextSteps(
  context: WorkspaceContext,
  metrics: InsightMetrics,
  sourceBreakdown: WorkspaceInsights["sourceBreakdown"],
): string[] {
  const nextSteps: string[] = [];
  const topSource = getDominantSourceBreakdown(sourceBreakdown, metrics.transactionCount);

  if (context.peopleCount === 0) nextSteps.push("사람을 추가해서 개인지출과 공동지출을 나눠보세요.");
  if (context.accountCount === 0) nextSteps.push("계좌를 등록하면 내부이체와 실제 지출을 더 정확하게 구분할 수 있습니다.");
  if (context.cardCount === 0) nextSteps.push("카드를 등록하면 카드 명세서 업로드와 소비 흐름 분석이 쉬워집니다.");
  if (context.transactions.length === 0) nextSteps.push("첫 거래를 입력하거나 엑셀 파일을 업로드해서 분석을 시작해보세요.");
  if (topSource && isDominantSourceConcentrated(topSource)) {
    const sourceLabel = getSourceTypeLabel(topSource.sourceType);
    nextSteps.push(`${sourceLabel} 거래가 대부분을 차지합니다. 이 수단 흐름을 먼저 점검하면 전체 데이터 정확도를 빠르게 높일 수 있습니다.`);
  }
  if (metrics.reviewCount > 0) {
    nextSteps.push(`검토함에 ${context.reviews.filter((review) => review.status === "open").length}건이 남아 있습니다. 자동 제안을 먼저 정리해보세요.`);
  }
  if (metrics.uncategorizedCount > 0) {
    nextSteps.push(`미분류 거래 ${metrics.uncategorizedCount}건을 정리하면 상위 지출 분석이 더 정확해집니다.`);
  }
  if (metrics.untaggedCount > 0) {
    nextSteps.push(`무태그 거래 ${metrics.untaggedCount}건을 묶어두면 태그 기준 소비 흐름을 더 선명하게 볼 수 있습니다.`);
  }
  if (metrics.sharedExpenseCount > 0) {
    nextSteps.push(`공동지출 ${metrics.sharedExpenseCount}건이 있어 정산 흐름을 한 번 더 점검해두면 좋습니다.`);
  }
  if (metrics.internalTransferCount > 0) {
    nextSteps.push(`내부이체 ${metrics.internalTransferCount}건을 점검하면 지출 통계가 더 깔끔해집니다.`);
  }
  if (metrics.savingsRate < (context.financialProfile?.targetSavingsRate ?? 0.2)) {
    nextSteps.push("저축 목표에 못 미치고 있습니다. 상위 지출 카테고리와 공동지출부터 조정해보세요.");
  }
  if (!nextSteps.length) nextSteps.push("데이터가 안정적으로 쌓이고 있습니다. 다음 단계로 태그와 공동지출 정산을 더 활용해보세요.");

  return nextSteps;
}

function buildHeadlineCards(
  topCategories: WorkspaceInsights["topCategories"],
  sourceBreakdown: WorkspaceInsights["sourceBreakdown"],
  metrics: InsightMetrics,
) {
  const cards: Array<{ title: string; description: string }> = [];

  if (topCategories.length && metrics.expense > 0) {
    const biggest = topCategories[0];
    const share = biggest.amount / metrics.expense;
    cards.push({
      title: "가장 큰 지출 원인",
      description: `${biggest.categoryName}이(가) 이번 달 지출의 ${Math.round(share * 100)}%를 차지하고 있습니다.`,
    });
  }

  if (metrics.sharedExpense > 0 && metrics.expense > 0) {
    const sharedShare = metrics.sharedExpense / metrics.expense;
    cards.push({
      title: "공동지출 비중",
      description: `공동지출이 전체 소비의 ${Math.round(sharedShare * 100)}%입니다. 정산 화면도 함께 확인해보세요.`,
    });
  }

  const biggestSource = getDominantSourceBreakdown(sourceBreakdown, metrics.transactionCount);
  if (biggestSource) {
    const sourceShare = biggestSource.share;
    const sourceLabel = getSourceTypeLabel(biggestSource.sourceType);
    cards.push({
      title: "가장 큰 입력 경로",
      description: `${sourceLabel} 경로가 이번 달 거래의 ${Math.round(sourceShare * 100)}%를 차지하고 있습니다.`,
    });
  }

  if (metrics.reviewCount > 0 || metrics.uncategorizedCount > 0 || metrics.untaggedCount > 0) {
    cards.push({
      title: "데이터 정리 상태",
      description: `검토 ${metrics.reviewCount}건, 미분류 ${metrics.uncategorizedCount}건, 무태그 ${metrics.untaggedCount}건이 남아 있어 아직 진단이 더 정교해질 수 있습니다.`,
    });
  }

  if (!cards.length) {
    cards.push({
      title: "이번 달 요약",
      description: "핵심 검토와 분류가 정리되어 있어 현재 수치를 비교적 신뢰하고 볼 수 있습니다.",
    });
  }

  return cards.slice(0, 3);
}

export function getWorkspaceInsights(state: AppState, workspaceId: string, baseMonth = monthKey(new Date())): WorkspaceInsights {
  const transactions = state.transactions.filter(
    (item) => item.workspaceId === workspaceId && monthKey(item.occurredAt) === baseMonth,
  );
  const reviews = state.reviews.filter((item) => item.workspaceId === workspaceId);
  const categories = state.categories.filter((item) => item.workspaceId === workspaceId);
  const tags = state.tags.filter((item) => item.workspaceId === workspaceId);
  const financialProfile = state.financialProfiles.find((item) => item.workspaceId === workspaceId) ?? null;
  const peopleCount = state.people.filter((item) => item.workspaceId === workspaceId).length;
  const accountCount = state.accounts.filter((item) => item.workspaceId === workspaceId).length;
  const cardCount = state.cards.filter((item) => item.workspaceId === workspaceId).length;
  const recurringSuggestionCount = getRecurringMerchantSuggestionCount(transactions, categories);
  const expenseTransactions = transactions.filter(isActiveExpenseImpactTransaction);
  const fixedCategoryIds = new Set(
    categories.filter((category) => category.fixedOrVariable === "fixed").map((category) => category.id),
  );
  const metrics = buildInsightMetrics(
    transactions,
    reviews,
    fixedCategoryIds,
    financialProfile?.monthlyNetIncome ?? 0,
    recurringSuggestionCount,
  );

  const context: WorkspaceContext = {
    transactions,
    reviews,
    categories,
    tags,
    financialProfile,
    peopleCount,
    accountCount,
    cardCount,
  };
  const topCategories = summarizeCategories(expenseTransactions, categories);
  const topTags = summarizeTags(expenseTransactions, tags);
  const sourceBreakdown = getSourceBreakdown(transactions);
  const dominantSource = getDominantSourceBreakdown(sourceBreakdown, metrics.transactionCount);

  return {
    month: baseMonth,
    ...metrics,
    topCategories,
    topTags,
    sourceBreakdown,
    dominantSource,
    headlineCards: buildHeadlineCards(topCategories, sourceBreakdown, metrics),
    nextSteps: buildNextSteps(context, metrics, sourceBreakdown),
    coaching: buildCoaching(context, metrics, sourceBreakdown),
    spendTone: getSpendTone(financialProfile, metrics.spendRate),
    savingsTone: getSavingsTone(financialProfile, metrics.savingsRate),
    fixedTone: getFixedTone(financialProfile, metrics.fixedExpenseRate),
  };
}
