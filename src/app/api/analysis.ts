import { getAnalysisApiBaseUrl, getAnalysisSpaceId } from "./analysisConfig";

type RequestOptions = {
  signal?: AbortSignal;
  searchParams?: Record<string, string | number | null | undefined>;
};

export type AnalysisInsightTone = "stable" | "caution" | "warning";

export type AnalysisWorkspaceInsightsResponse = {
  spaceId: number;
  monthKey: string;
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
  financialProfileReady: boolean;
  diagnosisReady: boolean;
  topCategories: Array<{
    categoryId: number | null;
    categoryName: string;
    amount: number;
  }>;
  sourceBreakdown: Array<{
    sourceType: "card" | "account" | "manual" | "import";
    count: number;
    expenseAmount: number;
  }>;
  spendTone: AnalysisInsightTone;
  savingsTone: AnalysisInsightTone;
  fixedTone: AnalysisInsightTone;
};

export type AnalysisLoopRecommendationResponse = {
  merchantKey: string;
  merchantName: string;
  matchedTransactionIds: number[];
  latestAmount: number;
  previousAmount: number;
  reason: string;
  categoryId: number | null;
};

export type AnalysisReviewWorkflowResponse = {
  counts: {
    duplicateCandidateCount: number;
    refundCandidateCount: number;
    categorySuggestionCount: number;
  };
  openItems: Array<{
    reviewId: number;
    reviewType: "duplicate_candidate" | "refund_candidate" | "category_suggestion";
    primaryTransactionId: number;
    relatedTransactionIds: number[];
    occurredAt: string;
    merchantName: string;
    confidenceScore: number;
    summary: string;
  }>;
};

export type AnalysisSettlementSummaryResponse = {
  monthKey: string;
  rows: Array<{
    transferKey: string;
    fromAssetId: number | null;
    toAssetId: number | null;
    fromAssetName: string;
    toAssetName: string;
    amount: number;
    transactionCount: number;
    categoryAmounts: Array<{
      categoryId: number | null;
      name: string;
      amount: number;
    }>;
    cardAmounts: Array<{
      cardAssetId: number | null;
      name: string;
      amount: number;
      transactionCount: number;
    }>;
    confirmationRecord: {
      settlementId: number;
      transferKey: string;
      amount: number;
      completedAt: string;
      note: string;
    } | null;
    confirmed: boolean;
  }>;
  confirmationHistory: Array<{
    settlementId: number;
    transferKey: string;
    amount: number;
    completedAt: string;
    note: string;
  }>;
  totalAmount: number;
  totalTransactionCount: number;
  confirmedAmount: number;
  confirmedCount: number;
};

class AnalysisApiConfigurationError extends Error {
  constructor() {
    super("analysis-api-not-configured");
  }
}

function buildUrl(path: string, searchParams?: RequestOptions["searchParams"]) {
  const baseUrl = getAnalysisApiBaseUrl();
  const spaceId = getAnalysisSpaceId();
  if (!baseUrl || !spaceId) {
    throw new AnalysisApiConfigurationError();
  }

  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("spaceId", String(spaceId));
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function requestAnalysis<T>(path: string, options: RequestOptions = {}) {
  const response = await fetch(buildUrl(path, options.searchParams), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`analysis-request-failed-${response.status}`);
  }

  return (await response.json()) as T;
}

export function isAnalysisApiConfigurationError(error: unknown) {
  return error instanceof AnalysisApiConfigurationError;
}

export function fetchWorkspaceInsights(monthKey: string, signal?: AbortSignal) {
  return requestAnalysis<AnalysisWorkspaceInsightsResponse>("/api/analysis/workspace-insights", {
    signal,
    searchParams: { monthKey },
  });
}

export function fetchLoopRecommendations(signal?: AbortSignal) {
  return requestAnalysis<AnalysisLoopRecommendationResponse[]>("/api/analysis/loop-recommendations", {
    signal,
  });
}

export function fetchReviewWorkflow(signal?: AbortSignal) {
  return requestAnalysis<AnalysisReviewWorkflowResponse>("/api/analysis/review-workflow", {
    signal,
  });
}

export function fetchSettlementSummary(monthKey: string, signal?: AbortSignal) {
  return requestAnalysis<AnalysisSettlementSummaryResponse>("/api/analysis/settlements/summary", {
    signal,
    searchParams: { monthKey },
  });
}
