import { getRecurringMerchantSuggestions, getUncategorizedTransactions } from "../classification/suggestions";
import type { AppState } from "../../shared/types/models";
import { getWorkspaceScope } from "../../app/state/selectors";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  targetPath: string;
  ctaLabel: string;
  completed: boolean;
}

export interface WorkspaceGuide {
  progress: number;
  currentStep: GuideStep | null;
  steps: GuideStep[];
}

export function getWorkspaceGuide(state: AppState, workspaceId: string): WorkspaceGuide {
  const scope = getWorkspaceScope(state, workspaceId);
  const uncategorizedTransactions = getUncategorizedTransactions(scope.transactions);
  const recurringSuggestions = getRecurringMerchantSuggestions(scope.transactions, scope.categories);
  const monthlyIncome = scope.financialProfile?.monthlyNetIncome ?? 0;
  const hasImportedData = scope.imports.length > 0;
  const hasTransactions = scope.transactions.length > 0;
  const openReviews = scope.reviews.filter((review) => review.status === "open").length;

  const steps: GuideStep[] = [
    {
      id: "people",
      title: "함께 관리할 사람 추가",
      description: "개인 지출과 공동 지출을 나누려면 먼저 구성원을 등록해야 합니다.",
      targetPath: "/people",
      ctaLabel: "사람 추가하러 가기",
      completed: scope.people.length > 0,
    },
    {
      id: "assets",
      title: "계좌와 카드 등록",
      description: "내부이체와 카드 결제 흐름을 구분하려면 자산 등록이 먼저 필요합니다.",
      targetPath: "/accounts",
      ctaLabel: "자산 등록하러 가기",
      completed: scope.accounts.length > 0 && scope.cards.length > 0,
    },
    {
      id: "transactions",
      title: "명세서 업로드 또는 거래 입력",
      description: "분석과 진단은 거래가 있어야 시작됩니다. 엑셀 업로드나 수동 입력으로 데이터를 채워주세요.",
      targetPath: hasImportedData ? "/transactions" : "/imports",
      ctaLabel: hasImportedData ? "거래 보러 가기" : "업로드하러 가기",
      completed: hasTransactions,
    },
    {
      id: "recurring",
      title: "반복 지출 카테고리 지정",
      description: "반복적으로 나타나는 가맹점은 먼저 카테고리를 지정하면 이후 분류가 훨씬 빨라집니다.",
      targetPath: "/categories",
      ctaLabel: "반복 지출 분류하기",
      completed: hasTransactions ? recurringSuggestions.length === 0 : false,
    },
    {
      id: "categorize",
      title: "미분류 거래 정리",
      description: "반복 규칙에 걸리지 않은 거래는 직접 카테고리를 선택해야 통계가 정확해집니다.",
      targetPath: "/categories",
      ctaLabel: "미분류 거래 정리하기",
      completed: hasTransactions ? uncategorizedTransactions.length === 0 : false,
    },
    {
      id: "reviews",
      title: "검토함 확인",
      description: "중복, 환불, 내부이체, 공동지출 후보를 확인하면 데이터 신뢰도가 올라갑니다.",
      targetPath: "/reviews",
      ctaLabel: "검토함 열기",
      completed: hasTransactions ? openReviews === 0 : false,
    },
    {
      id: "profile",
      title: "월 수입과 목표 설정",
      description: "지출률과 저축률 코칭은 재무 기준선을 입력해야 제대로 동작합니다.",
      targetPath: "/settings",
      ctaLabel: "기준선 설정하기",
      completed: monthlyIncome > 0,
    },
  ];

  const completedCount = steps.filter((step) => step.completed).length;

  return {
    progress: steps.length ? completedCount / steps.length : 0,
    currentStep: steps.find((step) => !step.completed) ?? null,
    steps,
  };
}
