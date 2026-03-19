import { getRecurringMerchantSuggestions } from "../classification/suggestions";
import type { AppState } from "../../shared/types/models";
import { getWorkspaceScope } from "../../app/state/selectors";
import { isDiagnosisReady } from "../insights/diagnosisReady";
import { getJourneyProgress } from "../journey/progress";
import { getDominantSourceBreakdown, getSourceBreakdown } from "../transactions/sourceBreakdown";
import { getSourceTypeLabel } from "../transactions/sourceTypes";
import { getWorkspaceHealthSummary } from "../workspace/health";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  targetPath: string;
  ctaLabel: string;
  tips: string[];
  completed: boolean;
}

export interface WorkspaceGuide {
  progress: number;
  currentStep: GuideStep | null;
  steps: GuideStep[];
}

export function getWorkspaceGuide(state: AppState, workspaceId: string): WorkspaceGuide {
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const recurringSuggestions = getRecurringMerchantSuggestions(scope.transactions, scope.categories);
  const monthlyIncome = scope.financialProfile?.monthlyNetIncome ?? 0;
  const hasImportedData = scope.imports.length > 0;
  const hasTransactions = scope.transactions.length > 0;
  const sourceBreakdown = getSourceBreakdown(scope.transactions);
  const dominantSource = getDominantSourceBreakdown(sourceBreakdown, scope.transactions.length);
  const dominantSourceShare = dominantSource?.share ?? 0;
  const dominantSourceLabel = dominantSource ? getSourceTypeLabel(dominantSource.sourceType) : null;
  const readyForInsights =
    recurringSuggestions.length === 0 &&
    isDiagnosisReady({
      hasTransactions,
      postImportReady: health.postImportReady,
      monthlyNetIncome: monthlyIncome,
    });

  const steps: GuideStep[] = [
    {
      id: "people",
      title: "함께 관리할 사람 추가",
      description: "개인지출과 공동지출을 나누려면 먼저 구성원을 등록해야 합니다.",
      targetPath: "/people",
      ctaLabel: "사람 추가하러 가기",
      tips: ["배우자나 가족 구성원을 먼저 등록해보세요.", "구성원이 있어야 개인/공동 지출 분리가 쉬워집니다."],
      completed: scope.people.length > 0,
    },
    {
      id: "assets",
      title: "계좌와 카드 등록",
      description: "내부이체와 카드 결제 흐름을 구분하려면 자산 등록이 먼저 필요합니다.",
      targetPath: "/accounts",
      ctaLabel: "자산 등록하러 가기",
      tips: ["계좌를 먼저 등록하고 카드 결제 계좌를 연결해보세요.", "생활비용 공동 계좌가 있으면 함께 추가해두세요."],
      completed: scope.accounts.length > 0 && scope.cards.length > 0,
    },
    {
      id: "transactions",
      title: hasImportedData ? "가져온 거래 흐름 확인" : "명세서 업로드 또는 거래 입력",
      description: hasImportedData
        ? "업로드된 거래가 들어왔습니다. 이제 검토와 분류를 거치면 통계에 쓸 수 있는 상태가 됩니다."
        : "분석과 진단은 거래가 있어야 시작됩니다. 엑셀 업로드나 수동 입력으로 데이터를 채워주세요.",
      targetPath: hasImportedData ? "/transactions" : "/imports",
      ctaLabel: hasImportedData ? "거래 흐름 보러 가기" : "업로드하러 가기",
      tips: hasImportedData
        ? ["실지출, 공동지출, 내부이체 구분이 맞는지 먼저 확인해보세요.", "거래가 들어왔다면 다음은 검토함과 분류 화면입니다."]
        : ["가계부 v2 엑셀을 올리거나 수동 거래를 추가해보세요.", "거래가 쌓이면 분류와 통계가 바로 시작됩니다."],
      completed: hasTransactions,
    },
    {
      id: "reviews",
      title: "검토함에서 후보 정리",
      description: "중복, 환불, 내부이체, 공동지출 후보를 먼저 정리하면 분류와 통계가 훨씬 정확해집니다.",
      targetPath: "/reviews",
      ctaLabel: "검토함 열기",
      tips: ["즉답 팝업 대신 검토함에서 같은 유형끼리 모아서 처리해보세요.", "내부이체와 환불 후보를 먼저 정리하면 과소비 오판이 크게 줄어듭니다."],
      completed: hasTransactions ? health.openReviewCount === 0 : false,
    },
    {
      id: "source-flow",
      title: dominantSourceLabel ? `${dominantSourceLabel} 흐름 점검` : "거래 흐름 점검",
      description:
        dominantSourceLabel && dominantSourceShare >= 0.7
          ? `${dominantSourceLabel} 경로가 거래 대부분을 차지하고 있습니다. 이 수단의 연결값과 흐름을 먼저 점검하면 전체 데이터 정확도를 빠르게 높일 수 있습니다.`
          : "거래 수단이 과하게 한쪽에 몰려 있지 않아 바로 분류 단계로 넘어가도 좋습니다.",
      targetPath: dominantSourceLabel && dominantSource ? `/transactions?sourceType=${dominantSource.sourceType}` : "/transactions",
      ctaLabel: dominantSourceLabel && dominantSource ? `${dominantSourceLabel} 거래 보러 가기` : "거래 흐름 보러 가기",
      tips:
        dominantSourceLabel && dominantSourceShare >= 0.7
          ? [`${dominantSourceLabel} 거래만 모아 보고 연결값이나 성격 구분이 어색한 항목부터 먼저 다듬어보세요.`, "수단 흐름이 안정되면 이후 검토와 분류도 훨씬 빨라집니다."]
          : ["거래 수단 흐름은 비교적 고르게 들어와 있습니다.", "이제 검토함과 분류 화면 중심으로 계속 정리해보세요."],
      completed: hasTransactions ? !(dominantSourceLabel && dominantSourceShare >= 0.7) : false,
    },
    {
      id: "recurring",
      title: "반복 지출 카테고리 지정",
      description: "여러 달에 걸쳐 반복되는 가맹점은 먼저 카테고리를 묶어두면 이후 분류가 훨씬 빨라집니다.",
      targetPath: "/categories",
      ctaLabel: "반복 지출 분류하기",
      tips: ["구독, 보험, 통신비처럼 반복되는 거래부터 분류해보세요.", "여러 달 반복되고 금액 편차가 작은 후보부터 먼저 적용하면 좋습니다."],
      completed: hasTransactions ? recurringSuggestions.length === 0 : false,
    },
    {
      id: "categorize",
      title: "미분류 거래 정리",
      description: "반복 규칙에 걸리지 않은 거래는 직접 카테고리를 선택해야 통계가 정확해집니다.",
      targetPath: "/categories",
      ctaLabel: "미분류 거래 정리하기",
      tips: ["반복 제안 아래쪽 미분류 거래를 하나씩 정리해보세요.", "카테고리가 채워질수록 대시보드의 해석 정확도가 올라갑니다."],
      completed: hasTransactions ? health.uncategorizedCount === 0 : false,
    },
    {
      id: "tags",
      title: "무태그 거래 정리",
      description: "같은 맥락의 소비를 태그로 묶어야 태그 기준 흐름과 비교가 자연스럽게 이어집니다.",
      targetPath: "/transactions?cleanup=untagged",
      ctaLabel: "무태그 거래 정리하기",
      tips: ["사용 목적이나 사이클별로 태그를 묶으면 흐름과 비교가 빨라집니다.", "무태그가 0건이 되면 대시보드의 태그 분석도 바로 살아납니다."],
      completed: hasTransactions ? health.untaggedCount === 0 : false,
    },
    {
      id: "profile",
      title: "월 수입과 목표 설정",
      description: "지출률과 저축률 가이드는 재무 기준선을 입력해야 제대로 동작합니다.",
      targetPath: "/settings",
      ctaLabel: "기준선 설정하기",
      tips: ["월 순수입과 목표 저축률부터 입력해보세요.", "기준선이 있어야 과소비 판단이 가능해집니다."],
      completed: monthlyIncome > 0,
    },
    {
      id: "dashboard",
      title: "진단 결과 확인",
      description: "검토와 분류, 태그 정리, 기준선 설정이 끝났다면 이제 대시보드에서 이번 달 소비 문제와 저축 여력을 확인할 차례입니다.",
      targetPath: "/",
      ctaLabel: "대시보드 보러 가기",
      tips: ["상위 지출과 재무 코치 메모를 먼저 확인해보세요.", "공동지출이 있다면 정산 화면까지 이어서 보는 흐름이 좋습니다."],
      completed: readyForInsights,
    },
  ];

  const progressSummary = getJourneyProgress(steps);

  return {
    progress: progressSummary.progress,
    currentStep: progressSummary.nextStep,
    steps,
  };
}
