import type { AppState } from "../../shared/types/models";
import { getWorkspaceScope } from "../../app/state/selectors";
import { getCategoryCleanupSummary } from "../classification/suggestions";
import { getActiveTransactions } from "../transactions/meta";
import { getWorkspaceHealthSummary } from "../workspace/health";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  targetPath: string;
  targetSelector: string;
  fallbackSelector?: string;
  ctaLabel: string;
  activeLabel?: string;
  tips: string[];
  completed: boolean;
  available?: boolean;
  blocking?: boolean;
  requiresTargetVisit?: boolean;
}

export interface GuideSupportTip {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  targetPath?: string | null;
  fallbackSelector?: string;
  ctaLabel?: string;
  dismissLabel?: string;
  tips: string[];
}

export interface WorkspaceGuide {
  progress: number;
  completedCount: number;
  totalCount: number;
  currentStep: GuideStep | null;
  steps: GuideStep[];
  supportTips: GuideSupportTip[];
}

export function getWorkspaceGuide(state: AppState, workspaceId: string): WorkspaceGuide {
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const categoryCleanupSummary = getCategoryCleanupSummary(scope.transactions, scope.categories);
  const activeTransactions = getActiveTransactions(scope.transactions);
  const hasTransactions = activeTransactions.length > 0;
  const uncategorizedCount = categoryCleanupSummary.uncategorizedCount;
  const hiddenAssetCount =
    scope.people.filter((person) => person.isHidden).length +
    scope.accounts.filter((account) => account.isHidden).length +
    scope.cards.filter((card) => card.isHidden).length;
  const hasLinkableAssets =
    scope.accounts.some((account) => !account.isHidden && Boolean(account.ownerPersonId)) &&
    scope.cards.some((card) => !card.isHidden && Boolean(card.ownerPersonId));

  const steps: GuideStep[] = [
    {
      id: "nav-overview",
      title: "메뉴 둘러보기",
      description: "상단 메뉴부터 가볍게 보고, 어떤 화면에서 무엇을 하는지 흐름을 먼저 익힙니다.",
      targetPath: "/records/moon",
      targetSelector: '[data-guide-target="nav-menu"]',
      fallbackSelector: '[data-guide-target="nav-records"]',
      ctaLabel: "메뉴 보기",
      activeLabel: "확인했습니다",
      tips: [
        "메뉴 소개를 마치면 대시보드부터 페이지별 역할을 순서대로 안내합니다.",
        "소개가 끝나면 결제내역 화면에서 샘플 업로드와 검토 정리까지 바로 이어집니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "dashboard-overview",
      title: "대시보드 소개",
      description: "요약 화면에서 지금 정리 상태와 이후에 보게 될 흐름을 먼저 짚고 넘어갑니다.",
      targetPath: "/records/moon",
      targetSelector: '[data-guide-target="dashboard-summary"]',
      fallbackSelector: '[data-guide-target="nav-records"]',
      ctaLabel: "대시보드 보기",
      activeLabel: "확인했습니다",
      tips: [
        "정리 현황은 업로드와 검토가 끝날수록 더 믿을 수 있는 숫자로 바뀝니다.",
        "지금은 어떤 정보가 모이는지만 가볍게 보고 다음 화면으로 넘어가면 됩니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "people-overview",
      title: "자산 설정 소개",
      description: "사용자별로 계좌와 카드를 한 보드에서 관리하는 화면 구조를 먼저 익힙니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-page-overview"]',
      fallbackSelector: '[data-guide-target="nav-connections"]',
      ctaLabel: "자산 설정 보기",
      activeLabel: "확인했습니다",
      tips: [
        "계좌와 카드는 사용자 아래에서 같이 관리하고, 필요한 연결은 드래그로 빠르게 처리합니다.",
        "삭제와 숨기기 같은 편의 기능은 이후 페이지 소개 중간에도 계속 안내됩니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "categories-overview",
      title: "카테고리 설정 소개",
      description: "지출 구조를 어떻게 나누는지, 그룹과 하위 카테고리의 역할을 한 번에 소개합니다.",
      targetPath: "/connections/categories",
      targetSelector: '[data-guide-target="categories-page-overview"]',
      fallbackSelector: '[data-guide-target="nav-menu"]',
      ctaLabel: "카테고리 설정 보기",
      activeLabel: "확인했습니다",
      tips: [
        "카테고리는 보드 구조로 정리되어 있어서 그룹 이동과 숨기기 흐름을 같이 이해하면 좋습니다.",
        "실습 단계에서는 여기서 만든 구조가 결제내역 분류에 그대로 연결됩니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "settings-overview",
      title: "설정 소개",
      description: "백업, 테마, 가이드 테스트처럼 운영에 필요한 기본 설정 위치를 먼저 안내합니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-page-overview"]',
      fallbackSelector: '[data-guide-target="nav-menu"]',
      ctaLabel: "설정 보기",
      activeLabel: "확인했습니다",
      tips: [
        "실제 데이터 백업과 테마 전환은 여기서 처리합니다.",
        "나중에 흐름을 다시 확인하고 싶을 때는 가이드 테스트도 이 화면에서 시작할 수 있습니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "account-transfers-overview",
      title: "이체내역 소개",
      description: "수입과 계좌 흐름이 앞으로 이 화면을 중심으로 정리될 것이라는 점만 먼저 짚고 넘어갑니다.",
      targetPath: "/collections/transfer",
      targetSelector: '[data-guide-target="account-transfers-entry"]',
      fallbackSelector: '[data-guide-target="nav-collections"]',
      ctaLabel: "이체내역 보기",
      activeLabel: "확인했습니다",
      tips: [
        "지금 버전에서는 소개 중심으로만 보고, 실제 실습은 결제내역 화면에서 진행합니다.",
        "월수입과 계좌 흐름 설계는 이후 확장 단계에서 이 화면에 더 붙을 예정입니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "transactions-overview",
      title: "결제내역 소개",
      description: "업로드, 검토, 미분류 정리가 한 화면에서 이어지는 현재 핵심 작업 공간을 먼저 보여줍니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-page-overview"]',
      fallbackSelector: '[data-guide-target="nav-collections"]',
      ctaLabel: "결제내역 보기",
      activeLabel: "확인했습니다",
      tips: [
        "이 화면이 앞으로 거래 정리의 중심입니다.",
        "소개를 마치면 바로 여기서 샘플 업로드와 검토 정리를 직접 따라갑니다.",
      ],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    },
    {
      id: "transactions-upload",
      title: "샘플 업로드 따라하기",
      description: "이제 직접 해봅니다. 샘플 결제내역을 불러오면 검토와 미분류 정리가 같은 흐름으로 이어집니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-upload-action"]',
      fallbackSelector: '[data-guide-target="transactions-upload"]',
      ctaLabel: "업로드 시작",
      activeLabel: "업로드 영역 보기",
      tips: [
        "업로드 전에는 미리보기로 어떤 거래가 들어오는지 먼저 확인합니다.",
        "샘플을 불러오면 검토 카드와 미분류 행이 바로 같은 화면에 이어집니다.",
      ],
      completed: hasTransactions || scope.imports.length > 0,
      blocking: true,
    },
    {
      id: "transactions-reviews",
      title: "검토 카드 정리",
      description: "자동 검토 후보를 먼저 처리해서 뒤에 남을 미분류 정리량을 줄입니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-review-card"]',
      fallbackSelector: '[data-guide-target="transactions-reviews"]',
      ctaLabel: "검토 보기",
      activeLabel: "검토 목록 보기",
      tips: [
        "카테고리 제안이나 중복 후보는 위쪽 검토 카드부터 처리하는 편이 가장 빠릅니다.",
        "남은 검토가 0건이 되면 아래 거래 그리드만 집중해서 보면 됩니다.",
      ],
      completed: hasTransactions ? health.openReviewCount === 0 : false,
      blocking: true,
    },
    {
      id: "transactions-uncategorized",
      title: "미분류 직접 수정",
      description: "마지막으로 미분류 필터와 셀 편집으로 거래를 직접 정리해보면 실습이 끝납니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-uncategorized-category-input"]',
      fallbackSelector: '[data-guide-target="transactions-uncategorized-filter"]',
      ctaLabel: "미분류 정리",
      activeLabel: "미분류 필터 보기",
      tips: [
        "미분류만 켜고 한 번에 훑으면 가장 짧은 동선으로 정리할 수 있습니다.",
        "카테고리만 바로잡아도 대시보드와 사용자별 사용내역 품질이 빠르게 안정됩니다.",
      ],
      completed: hasTransactions ? uncategorizedCount === 0 : false,
      blocking: true,
    },
  ];

  const supportTips: GuideSupportTip[] = [
    {
      id: "people-delete-assets",
      title: "삭제는 우측 영역으로 끌어 놓으면 됩니다",
      description: "사용자, 계좌, 카드를 끌면 오른쪽 삭제 영역이 나타나고, 거기에 놓으면 삭제 확인 창이 열립니다.",
      targetSelector: '[data-guide-target="people-delete-zone"]',
      targetPath: "/connections/assets",
      fallbackSelector: '[data-guide-target="nav-connections"]',
      ctaLabel: "삭제 영역 보기",
      dismissLabel: "확인했어요",
      tips: [
        "삭제는 숨기기보다 강한 동작이라 마지막 확인 창을 한 번 더 거칩니다.",
        "정말 안 쓰는 항목만 삭제하고, 애매하면 숨기기를 먼저 쓰는 편이 안전합니다.",
      ],
    },
    {
      id: "people-link-account",
      title: "계좌를 카드에 끌어 놓아 연결할 수 있어요",
      description: "자산 설정에서는 계좌 카드를 카드 위로 드래그해서 납부계좌나 연결계좌를 바로 지정할 수 있습니다.",
      targetSelector: '[data-guide-target="people-card-linking"]',
      targetPath: "/connections/assets",
      fallbackSelector: '[data-guide-target="nav-connections"]',
      ctaLabel: "자산 설정 보기",
      dismissLabel: "확인했어요",
      tips: [
        "같은 사용자 보드 안에서 끌어 놓으면 카드 연결이 바로 반영됩니다.",
        "짧은 계좌/카드 정리는 이 드래그 방식이 제일 빠릅니다.",
      ],
    },
    {
      id: "people-hidden-assets",
      title: "숨기기와 복구는 같은 흐름으로 됩니다",
      description: "항목을 숨기면 숨김 보관함으로 옮겨지고, 숨김 버튼에서 다시 꺼내 복구할 수 있습니다.",
      targetSelector: '[data-guide-target="people-hidden-toggle"]',
      targetPath: "/connections/assets",
      fallbackSelector: '[data-guide-target="nav-connections"]',
      ctaLabel: "숨김 보관함 보기",
      dismissLabel: "확인했어요",
      tips: [
        "사용하지 않는 카드나 계좌를 지우지 않고 잠시 숨겨둘 때 유용합니다.",
        "숨김 항목이 생기면 같은 버튼에서 바로 복구 흐름으로 이어집니다.",
      ],
    },
    {
      id: "guide-move",
      title: "비콘과 패널은 옮길 수 있어요",
      description: "비콘이나 패널을 그대로 드래그하면 좌우 위치를 바꿀 수 있습니다.",
      targetSelector: '[data-guide-anchor="panel"], [data-guide-anchor="fab"]',
      targetPath: null,
      ctaLabel: "알겠어요",
      dismissLabel: "다음에 보기",
      tips: ["패널은 넓은 쪽으로, 비콘은 시선이 덜 가리는 쪽으로 옮기면 편합니다."],
    },
  ];

  const blockingSteps = steps.filter((step) => step.blocking !== false);
  const availableBlockingSteps = blockingSteps.filter((step) => step.available !== false);
  const completedCount = availableBlockingSteps.filter((step) => step.completed).length;
  const totalCount = availableBlockingSteps.length;
  const currentStep = availableBlockingSteps.find((step) => !step.completed) ?? null;

  return {
    progress: totalCount ? completedCount / totalCount : 1,
    completedCount,
    totalCount,
    currentStep,
    steps,
    supportTips: supportTips.filter((tip) => {
      if (tip.id === "people-link-account") return hasLinkableAssets;
      if (tip.id === "people-hidden-assets") return scope.people.length > 0 || scope.accounts.length > 0 || scope.cards.length > 0;
      if (tip.id === "people-delete-assets") return scope.people.length > 0 || scope.accounts.length > 0 || scope.cards.length > 0;
      if (tip.id === "guide-move") return true;
      return hiddenAssetCount > 0;
    }),
  };
}
