import { getCategoryCleanupSummary } from "../classification/suggestions";
import type { AppState } from "../../shared/types/models";
import { getWorkspaceScope } from "../../app/state/selectors";
import { isDiagnosisReady } from "../insights/diagnosisReady";
import { getJourneyProgress } from "../journey/progress";
import { getActiveTransactions } from "../transactions/meta";
import {
  getDominantSourceBreakdown,
  getSourceBreakdown,
  isDominantSourceConcentrated,
} from "../transactions/sourceBreakdown";
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
  const categoryCleanupSummary = getCategoryCleanupSummary(scope.transactions, scope.categories);
  const recurringSuggestionCount = categoryCleanupSummary.recurringSuggestionCount;
  const uncategorizedCount = categoryCleanupSummary.uncategorizedCount;
  const monthlyIncome = scope.financialProfile?.monthlyNetIncome ?? 0;
  const activeTransactions = getActiveTransactions(scope.transactions);
  const hasImportedData = scope.imports.length > 0;
  const hasTransactions = activeTransactions.length > 0;
  const sourceBreakdown = getSourceBreakdown(activeTransactions);
  const dominantSource = getDominantSourceBreakdown(sourceBreakdown, activeTransactions.length);
  const dominantSourceLabel = dominantSource ? getSourceTypeLabel(dominantSource.sourceType) : null;
  const hasDominantSourceConcentration = isDominantSourceConcentrated(dominantSource);
  const postImportFollowUp =
    health.openReviewCount > 0
      ? { targetPath: "/reviews", ctaLabel: `검토함 ${health.openReviewCount}건 보기` }
      : uncategorizedCount > 0
        ? { targetPath: "/transactions?cleanup=uncategorized", ctaLabel: `미분류 ${uncategorizedCount}건 정리` }
        : { targetPath: "/transactions", ctaLabel: "거래 흐름 보기" };
  const readyForInsights =
    recurringSuggestionCount === 0 &&
    isDiagnosisReady({
      hasTransactions,
      postImportReady: health.openReviewCount === 0 && uncategorizedCount === 0,
      monthlyNetIncome: monthlyIncome,
    });

  const steps: GuideStep[] = [
    {
      id: "people",
      title: "사용자 등록",
      description: "거래 주체를 구분하려면 먼저 사용자를 등록해야 합니다.",
      targetPath: "/people",
      ctaLabel: "사용자 관리 보기",
      tips: ["실제로 자산을 사용하는 사람부터 등록하면 이후 연결이 쉬워집니다."],
      completed: scope.people.length > 0,
    },
    {
      id: "assets",
      title: "계좌와 카드 연결",
      description: "거래 출처를 분리하려면 계좌와 카드를 먼저 정리하는 편이 좋습니다.",
      targetPath: "/accounts",
      ctaLabel: "자산 관리 보기",
      tips: ["계좌를 먼저 등록하고 카드의 결제 계좌를 연결하면 흐름이 깔끔해집니다."],
      completed: scope.accounts.length > 0 && scope.cards.length > 0,
    },
    {
      id: "transactions",
      title: hasImportedData ? "업로드한 거래 확인" : "거래 추가",
      description: hasImportedData
        ? "업로드된 거래를 기준으로 검토와 분류를 이어갈 수 있습니다."
        : "거래를 입력하거나 업로드해야 분석이 시작됩니다.",
      targetPath: hasImportedData ? postImportFollowUp.targetPath : "/imports",
      ctaLabel: hasImportedData ? postImportFollowUp.ctaLabel : "거래 업로드하기",
      tips: ["거래가 들어오면 검토와 분류 흐름이 바로 시작됩니다."],
      completed: hasTransactions,
    },
    {
      id: "reviews",
      title: "검토함 정리",
      description: "중복, 환불, 내부이체 후보를 먼저 정리하면 거래 해석이 더 안정적입니다.",
      targetPath: "/reviews",
      ctaLabel: "검토함 보기",
      tips: ["자동 검토 후보를 먼저 정리하면 뒤쪽 분류가 훨씬 쉬워집니다."],
      completed: hasTransactions ? health.openReviewCount === 0 : false,
    },
    {
      id: "source-flow",
      title: dominantSourceLabel ? `${dominantSourceLabel} 흐름 점검` : "거래 흐름 점검",
      description:
        dominantSourceLabel && hasDominantSourceConcentration
          ? `${dominantSourceLabel} 거래 비중이 높습니다. 이 경로의 연결 상태를 먼저 점검하면 전체 해석이 빨라집니다.`
          : "거래 수단 구성이 비교적 고르게 들어와 있어 바로 분류를 이어가기 좋습니다.",
      targetPath: dominantSource ? `/transactions?sourceType=${dominantSource.sourceType}` : "/transactions",
      ctaLabel: dominantSourceLabel ? `${dominantSourceLabel} 거래 보기` : "거래 보기",
      tips: ["거래가 몰린 수단부터 확인하면 연결 누락을 빨리 찾을 수 있습니다."],
      completed: hasTransactions ? !(dominantSourceLabel && hasDominantSourceConcentration) : false,
    },
    {
      id: "recurring",
      title: "반복 지출 제안 확인",
      description: "반복되는 가맹점을 먼저 묶어두면 분류 속도가 훨씬 빨라집니다.",
      targetPath: "/categories",
      ctaLabel: "분류 화면 보기",
      tips: ["구독, 보험, 통신비처럼 반복되는 항목부터 정리하면 효율적입니다."],
      completed: hasTransactions ? recurringSuggestionCount === 0 : false,
    },
    {
      id: "categorize",
      title: "미분류 거래 정리",
      description: "카테고리가 비어 있는 거래를 정리해야 통계를 믿고 볼 수 있습니다.",
      targetPath: "/categories",
      ctaLabel: "미분류 거래 정리",
      tips: ["미분류가 0건이 되면 대시보드 숫자의 신뢰도가 올라갑니다."],
      completed: hasTransactions ? uncategorizedCount === 0 : false,
    },
    {
      id: "profile",
      title: "기준선 설정",
      description: "월수입과 목표 저축률이 있어야 경고와 가이드가 제대로 동작합니다.",
      targetPath: "/settings",
      ctaLabel: "설정 보기",
      tips: ["월수입만 먼저 넣어도 대시보드 해석이 훨씬 좋아집니다."],
      completed: monthlyIncome > 0,
    },
    {
      id: "dashboard",
      title: "대시보드 확인",
      description: "검토, 분류, 기준선 설정이 끝나면 이번 달 흐름을 안정적으로 볼 수 있습니다.",
      targetPath: "/",
      ctaLabel: "대시보드 보기",
      tips: ["상위 지출과 저축 여력을 함께 보면 이번 달 상태를 빨리 읽을 수 있습니다."],
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
