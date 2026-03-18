import { monthKey } from "../../shared/utils/date";
import type { AppState, Category, FinancialProfile, ReviewItem, Transaction } from "../../shared/types/models";

export interface WorkspaceInsights {
  month: string;
  income: number;
  expense: number;
  savings: number;
  spendRate: number;
  savingsRate: number;
  fixedExpense: number;
  fixedExpenseRate: number;
  sharedExpense: number;
  reviewCount: number;
  internalTransferCount: number;
  topCategories: Array<{ categoryName: string; amount: number }>;
  nextSteps: string[];
  coaching: string;
}

interface WorkspaceContext {
  transactions: Transaction[];
  reviews: ReviewItem[];
  categories: Category[];
  financialProfile: FinancialProfile | null;
  peopleCount: number;
  accountCount: number;
  cardCount: number;
}

function summarizeCategories(transactions: Transaction[], categories: Category[]) {
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (!transaction.isExpenseImpact) continue;
    const categoryName = transaction.categoryId ? categoryNameMap.get(transaction.categoryId) ?? "미분류" : "미분류";
    totals.set(categoryName, (totals.get(categoryName) ?? 0) + transaction.amount);
  }

  return [...totals.entries()]
    .map(([categoryName, amount]) => ({ categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);
}

function buildCoaching(context: WorkspaceContext, metrics: Omit<WorkspaceInsights, "nextSteps" | "coaching" | "month" | "topCategories">): string {
  const profile = context.financialProfile;
  if (!profile) {
    return "월 순수입이 아직 설정되지 않았습니다. 설정 화면에서 기준값을 먼저 넣어주세요.";
  }

  if (metrics.spendRate > profile.warningSpendRate) {
    return "이번 달 지출률이 경고 기준을 넘었습니다. 변동지출 상위 카테고리부터 줄이는 편이 좋습니다.";
  }

  if (metrics.savingsRate < profile.targetSavingsRate) {
    return "지출은 통제되고 있지만 목표 저축률보다 낮습니다. 변동지출과 공동지출을 먼저 점검해보세요.";
  }

  if (metrics.fixedExpenseRate > profile.warningFixedCostRate) {
    return "고정지출 비중이 높습니다. 계약형 비용을 우선 점검해야 절감 효과가 큽니다.";
  }

  return "현재 소비 구조는 비교적 안정적입니다. 검토함과 카테고리를 다듬으면 진단 정확도가 더 올라갑니다.";
}

function buildNextSteps(context: WorkspaceContext, metrics: Omit<WorkspaceInsights, "nextSteps" | "coaching" | "month" | "topCategories">): string[] {
  const nextSteps: string[] = [];

  if (context.peopleCount === 0) nextSteps.push("사람을 추가해서 개인 지출과 공동 지출을 분리하세요.");
  if (context.accountCount === 0) nextSteps.push("계좌를 등록하면 내부이체와 실제 지출을 더 정확히 구분할 수 있습니다.");
  if (context.cardCount === 0) nextSteps.push("카드를 등록하면 카드 명세서 업로드와 결제 흐름 분석이 쉬워집니다.");
  if (context.transactions.length === 0) nextSteps.push("첫 거래를 추가하거나 엑셀 파일을 업로드해서 분석을 시작하세요.");
  if (context.reviews.some((review) => review.status === "open")) {
    nextSteps.push(`검토함에 ${context.reviews.filter((review) => review.status === "open").length}건이 남아 있습니다. 자동 분류 후보를 정리하세요.`);
  }
  if (metrics.savingsRate < (context.financialProfile?.targetSavingsRate ?? 0.2)) {
    nextSteps.push("설정한 저축 목표에 못 미치고 있습니다. 상위 지출 카테고리부터 조정 후보를 확인하세요.");
  }
  if (!nextSteps.length) nextSteps.push("데이터가 안정적으로 쌓이고 있습니다. 다음 단계로 공동지출 정산과 태그 활용을 넓혀보세요.");

  return nextSteps;
}

export function getWorkspaceInsights(state: AppState, workspaceId: string, baseMonth = monthKey(new Date())): WorkspaceInsights {
  const transactions = state.transactions.filter(
    (item) => item.workspaceId === workspaceId && monthKey(item.occurredAt) === baseMonth,
  );
  const reviews = state.reviews.filter((item) => item.workspaceId === workspaceId);
  const categories = state.categories.filter((item) => item.workspaceId === workspaceId);
  const financialProfile = state.financialProfiles.find((item) => item.workspaceId === workspaceId) ?? null;
  const peopleCount = state.people.filter((item) => item.workspaceId === workspaceId).length;
  const accountCount = state.accounts.filter((item) => item.workspaceId === workspaceId).length;
  const cardCount = state.cards.filter((item) => item.workspaceId === workspaceId).length;

  const income = financialProfile?.monthlyNetIncome ?? 0;
  const expense = transactions.filter((item) => item.isExpenseImpact).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const savings = Math.max(0, income - expense);
  const spendRate = income > 0 ? expense / income : 0;
  const savingsRate = income > 0 ? savings / income : 0;
  const fixedCategoryIds = new Set(
    categories.filter((category) => category.fixedOrVariable === "fixed").map((category) => category.id),
  );
  const fixedExpense = transactions
    .filter((item) => item.isExpenseImpact && item.categoryId && fixedCategoryIds.has(item.categoryId))
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const fixedExpenseRate = income > 0 ? fixedExpense / income : 0;
  const sharedExpense = transactions
    .filter((item) => item.isExpenseImpact && item.isSharedExpense)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const reviewCount = reviews.filter((item) => item.status === "open").length;
  const internalTransferCount = transactions.filter((item) => item.isInternalTransfer).length;

  const metrics = {
    income,
    expense,
    savings,
    spendRate,
    savingsRate,
    fixedExpense,
    fixedExpenseRate,
    sharedExpense,
    reviewCount,
    internalTransferCount,
  };

  const context: WorkspaceContext = {
    transactions,
    reviews,
    categories,
    financialProfile,
    peopleCount,
    accountCount,
    cardCount,
  };

  return {
    month: baseMonth,
    ...metrics,
    topCategories: summarizeCategories(transactions, categories),
    nextSteps: buildNextSteps(context, metrics),
    coaching: buildCoaching(context, metrics),
  };
}
