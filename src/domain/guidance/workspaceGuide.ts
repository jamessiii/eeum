import type { AppState } from "../../shared/types/models";
import { getWorkspaceScope } from "../../app/state/selectors";

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
  promptAvailable?: boolean;
  blocking?: boolean;
  requiresTargetVisit?: boolean;
  interactionKind?: "press" | "drag" | "drop";
  interactionLabel?: string;
  allowedInteractionSelectors?: string[];
  illustration?: "drag-drop";
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

function createStep(step: GuideStep): GuideStep {
  return step;
}

export function getWorkspaceGuide(state: AppState, workspaceId: string): WorkspaceGuide {
  const scope = getWorkspaceScope(state, workspaceId);
  const hiddenAssetCount =
    scope.people.filter((person) => person.isHidden).length +
    scope.accounts.filter((account) => account.isHidden).length +
    scope.cards.filter((card) => card.isHidden).length;
  const hasLinkableAssets =
    scope.accounts.some((account) => !account.isHidden && Boolean(account.ownerPersonId)) &&
    scope.cards.some((card) => !card.isHidden && Boolean(card.ownerPersonId));

  const steps: GuideStep[] = [
    createStep({
      id: "nav-overview",
      title: "메뉴 둘러보기",
      description:
        "**상단 메뉴는 전체 작업 순서를 잡아주는 길잡이입니다.** 먼저 어디에서 무엇을 하는지 감을 잡고 시작하면 이후 단계가 훨씬 덜 헷갈립니다.",
      targetPath: "/dashboard",
      targetSelector: '[data-guide-target="nav-menu"]',
      fallbackSelector: '[data-guide-target="nav-dashboard"]',
      ctaLabel: "메뉴 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 첫장 소개입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "dashboard-summary-cards",
      title: "요약 카드 읽기",
      description:
        "**요약 카드는 업로드, 검토, 미분류처럼 지금 막힌 지점을 빠르게 보여줍니다.** 어떤 작업이 남았는지 먼저 읽는 습관이 중요합니다.",
      targetPath: "/dashboard",
      targetSelector: '[data-guide-target="dashboard-summary"]',
      fallbackSelector: '[data-guide-target="dashboard-month-summary"]',
      ctaLabel: "요약 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 연결된 것들 안내입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "dashboard-foundation-overview",
      title: "연결된 것들 보기",
      description:
        "**연결된 것들은 자산, 카테고리, 결제내역이 어디까지 이어졌는지 빠르게 확인하는 자리입니다.** 흐름을 읽기 전에 연결 상태부터 보면 다음 작업 순서를 훨씬 잡기 쉽습니다.",
      targetPath: "/dashboard",
      targetSelector: '[data-guide-target="dashboard-foundation-overview"]',
      fallbackSelector: '[data-guide-target="dashboard-summary"]',
      ctaLabel: "연결 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 흐름 요약입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "dashboard-flow",
      title: "흐름 요약 보기",
      description:
        "**흐름은 사람 간 정산이 아니라 카드값을 어느 계좌로 얼마나 옮길지 보는 화면입니다.** 이 앱의 핵심 해석 방식이 여기서 드러납니다.",
      targetPath: "/dashboard",
      targetSelector: '[data-guide-target="dashboard-flow-overview"]',
      fallbackSelector: '[data-guide-target="dashboard-month-summary"]',
      ctaLabel: "흐름 보기",
      activeLabel: "확인했어요",
      tips: ["이제 자산 화면으로 이동합니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "people-overview",
      title: "자산 화면 소개",
      description:
        "**자산 화면은 사람, 계좌, 카드를 보드처럼 정리하는 곳입니다.** 이후 업로드와 흐름 계산이 이 연결 관계를 기준으로 움직입니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="nav-sub-assets"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "자산 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 계좌 보드입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "people-accounts",
      title: "계좌 보드 보기",
      description:
        "**계좌 보드에는 실제 돈이 빠져나가거나 들어오는 계좌가 모입니다.** 흐름 계산과 카테고리 연결의 기준이 되는 영역입니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-accounts-board"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "계좌 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 카드 연결입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "people-card-linking",
      title: "카드 연결 이해하기",
      description:
        "**카드 연결은 카드값이 어느 계좌로 청구되는지 정하는 연결입니다.** 흐름 화면 계산이 여기 값을 그대로 사용합니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-card-linking"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "카드 연결 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 카테고리 연결입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "people-category-link-toggle",
      title: "카테고리 연결 열기",
      description:
        "**카테고리 연결은 카테고리별 소비가 어느 계좌에서 빠져나간 것으로 볼지 정하는 패널입니다.** 실제로 버튼을 눌러 다음 단계로 넘어가겠습니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-toggle"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "카테고리 연결 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["다음은 패널 소개입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "카테고리 연결 버튼을 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-category-link-toggle"]'],
    }),
    createStep({
      id: "people-category-link-panel",
      title: "카테고리 연결 패널 보기",
      description:
        "**이 패널에서 카테고리와 실제 소비 계좌를 연결합니다.** 통계와 흐름이 계좌 기준으로 해석되도록 만드는 핵심 설정입니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-panel"]',
      fallbackSelector: '[data-guide-target="people-category-link-toggle"]',
      ctaLabel: "패널 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 패널을 직접 옮겨보는 단계입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "people-category-link-move",
      title: "카테고리 연결 패널 이동",
      description:
        "**패널 상단 헤더를 잡고 드래그하면 위치를 옮길 수 있습니다.** 카드가 가려지면 먼저 패널을 옮겨서 시야를 확보한 뒤 작업하면 편합니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-panel-head"]',
      fallbackSelector: '[data-guide-target="people-category-link-panel"]',
      ctaLabel: "헤더 보기",
      activeLabel: "헤더를 드래그해보세요",
      tips: ["이제 연결할 카테고리를 직접 집어보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drag",
      interactionLabel: "패널 헤더를 잡고 드래그해보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-category-link-panel-head"]'],
    }),
    createStep({
      id: "people-category-link-resize",
      title: "카테고리 연결 패널 크기 변경",
      description:
        "**패널 오른쪽 아래 모서리를 잡고 끌면 크기를 바꿀 수 있습니다.** 내용이 답답하거나 더 넓게 보고 싶을 때 직접 크기를 조절해두면 이후 작업이 훨씬 편해집니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-resize-handle"]',
      fallbackSelector: '[data-guide-target="people-category-link-panel"]',
      ctaLabel: "모서리 보기",
      activeLabel: "모서리를 끌어보세요",
      tips: ["이제 연결할 카테고리를 직접 집어보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drag",
      interactionLabel: "패널 오른쪽 아래 모서리를 잡고 크기를 바꿔보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-category-link-resize-handle"]'],
    }),
    createStep({
      id: "people-category-link-pick",
      title: "연결할 카테고리 집기",
      description:
        "**미연결 카테고리 하나를 직접 집어보세요.** 이 단계부터는 드래그 앤 드롭으로 실제 연결을 체험합니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-guide-item"]',
      fallbackSelector: '[data-guide-target="people-category-link-panel"]',
      ctaLabel: "카테고리 보기",
      activeLabel: "카테고리를 집어보세요",
      tips: ["다음은 계좌 카드에 놓기입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drag",
      interactionLabel: "연결할 카테고리 카드를 집어보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-category-link-guide-item"]'],
      illustration: "drag-drop",
    }),
    createStep({
      id: "people-category-link-drop",
      title: "계좌 카드에 놓기",
      description:
        "**집은 카테고리를 지정한 계좌 카드에 놓아 연결해보세요.** 실제 연결이 완료되어야 다음 단계로 넘어갑니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-category-link-account-card"]',
      fallbackSelector: '[data-guide-target="people-category-link-panel"]',
      ctaLabel: "계좌 카드 보기",
      activeLabel: "계좌 카드에 놓아보세요",
      tips: ["이제 숨김 자산 기능으로 넘어갑니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drop",
      interactionLabel: "카테고리를 원하는 계좌 카드에 놓아보세요",
      allowedInteractionSelectors: [
        '[data-guide-target="people-category-link-account-card"]',
        '[data-guide-target="people-category-link-guide-item"]',
      ],
      illustration: "drag-drop",
    }),
    createStep({
      id: "people-hidden-assets",
      title: "숨김 보관함 열기",
      description:
        "**숨김은 바로 삭제하지 않고 잠시 치워두는 기능입니다.** 실제로 버튼을 눌러 보관함을 열어보겠습니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-hidden-toggle"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "숨김 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["다음은 숨길 카드를 직접 집습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "숨김 버튼을 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-hidden-toggle"]'],
    }),
    createStep({
      id: "people-hidden-hide-pick",
      title: "숨길 자산 집기",
      description:
        "**지정된 자산 카드 하나를 직접 집어보세요.** 무엇을 숨길지 먼저 고른 뒤 왼쪽 숨기기 영역으로 보냅니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-hide-guide-card"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "자산 카드 보기",
      activeLabel: "카드를 집어보세요",
      tips: ["다음은 숨기기 영역에 놓는 단계입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drag",
      interactionLabel: "숨길 자산 카드를 집어보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-hide-guide-card"]'],
      illustration: "drag-drop",
    }),
    createStep({
      id: "people-hidden-hide-drop",
      title: "숨기기 영역에 놓기",
      description:
        "**집은 자산을 왼쪽 숨기기 영역에 놓아보세요.** 삭제와 달리 나중에 다시 꺼내 쓸 수 있는 임시 보관입니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-hide-zone"]',
      fallbackSelector: '[data-guide-target="people-hidden-toggle"]',
      ctaLabel: "숨기기 영역 보기",
      activeLabel: "왼쪽 영역에 놓아보세요",
      tips: ["숨긴 뒤에는 다시 복원해보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drop",
      interactionLabel: "선택한 자산을 왼쪽 숨기기 영역에 놓아보세요",
      allowedInteractionSelectors: [
        '[data-guide-target="people-hide-zone"]',
        '[data-guide-target="people-hide-guide-card"]',
        '[draggable="true"]',
      ],
      illustration: "drag-drop",
    }),
    createStep({
      id: "people-hidden-restore-pick",
      title: "숨겨진 자산 집기",
      description:
        "**숨김 보관함 안의 지정된 자산 카드를 집어보세요.** 숨김은 삭제가 아니라 다시 꺼내 쓸 수 있다는 점을 익히는 단계입니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-hidden-guide-card"]',
      fallbackSelector: '[data-guide-target="people-hidden-panel"]',
      ctaLabel: "숨긴 카드 보기",
      activeLabel: "카드를 집어보세요",
      tips: ["다음은 원래 보드로 복원합니다."],
      completed: false,
      available: hiddenAssetCount > 0,
      promptAvailable: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drag",
      interactionLabel: "숨겨진 자산 카드를 집어보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-hidden-guide-card"]'],
      illustration: "drag-drop",
    }),
    createStep({
      id: "people-hidden-restore-drop",
      title: "원래 보드로 복원하기",
      description:
        "**집은 숨김 자산을 원래 보드 영역에 다시 놓아보세요.** 실제 복원까지 해야 다음 단계로 넘어갑니다.",
      targetPath: "/connections/assets",
      targetSelector: '[data-guide-target="people-restore-drop"]',
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "보드 영역 보기",
      activeLabel: "보드에 놓아보세요",
      tips: ["이제 분류 화면으로 이동합니다."],
      completed: false,
      available: hiddenAssetCount > 0,
      promptAvailable: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "drop",
      interactionLabel: "숨겨진 자산을 원래 보드 영역에 놓아보세요",
      allowedInteractionSelectors: ['[data-guide-target="people-restore-drop"]', '[data-guide-target="people-hidden-guide-card"]'],
      illustration: "drag-drop",
    }),
    createStep({
      id: "categories-overview",
      title: "분류 화면 소개",
      description:
        "**분류 화면은 거래에 붙는 카테고리 구조를 관리하는 곳입니다.** 통계와 결제내역이 이 구조를 기준으로 묶입니다.",
      targetPath: "/connections/categories",
      targetSelector: '[data-guide-target="nav-sub-categories"]',
      fallbackSelector: '[data-guide-target="categories-page-overview"]',
      ctaLabel: "분류 보기",
      activeLabel: "확인했어요",
      tips: ["이제 결제내역으로 넘어갑니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "transactions-overview",
      title: "결제내역 화면 소개",
      description:
        "**결제내역은 업로드, 검토, 미분류 정리가 이어지는 중심 작업 화면입니다.** 여기서부터는 실제 조작을 더 많이 해보게 됩니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="nav-sub-card"]',
      fallbackSelector: '[data-guide-target="transactions-page-overview"]',
      ctaLabel: "결제내역 보기",
      activeLabel: "확인했어요",
      tips: ["먼저 미분류만 보는 토글을 켜보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "transactions-filter-toggle",
      title: "미분류만 보기 켜기",
      description:
        "**미분류 토글은 아직 카테고리가 없는 거래만 모아 보여줍니다.** 남은 정리 대상을 빠르게 좁히는 데 가장 먼저 쓰는 버튼입니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-uncategorized-filter"]',
      fallbackSelector: '[data-guide-target="transactions-page-overview"]',
      ctaLabel: "토글 보기",
      activeLabel: "토글을 켜보세요",
      tips: ["이제 자동검토를 시작해보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "미분류 토글을 켜보세요",
      allowedInteractionSelectors: ['[data-guide-target="transactions-uncategorized-filter"]'],
    }),
    createStep({
      id: "transactions-review-trigger",
      title: "자동검토 시작하기",
      description:
        "**자동검토 버튼은 검토할 후보를 먼저 처리하게 도와주는 시작 버튼입니다.** 실제로 눌러야 다음 단계로 넘어갑니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-review-trigger"]',
      fallbackSelector: '[data-guide-target="transactions-page-overview"]',
      ctaLabel: "자동검토 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["다음은 검토 카드입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "자동검토를 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="transactions-review-trigger"]'],
    }),
    createStep({
      id: "transactions-reviews",
      title: "검토 카드 보기",
      description:
        "**검토 카드는 자동검토가 제안한 후보를 읽고 판단하는 영역입니다.** 다음 단계에서 버튼 하나를 눌러 실제 처리까지 해보겠습니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-review-card"]',
      fallbackSelector: '[data-guide-target="transactions-review-trigger"]',
      ctaLabel: "검토 카드 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 검토 버튼 누르기입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "transactions-review-actions",
      title: "검토 버튼 누르기",
      description:
        "**보류, 아니오, 네 버튼은 검토 제안을 실제로 처리하는 행동입니다.** 버튼 하나를 눌러야 다음 단계로 넘어갑니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-review-actions"]',
      fallbackSelector: '[data-guide-target="transactions-review-card"]',
      ctaLabel: "검토 버튼 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["이제 미분류 거래를 직접 분류합니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "검토 버튼 하나를 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="transactions-review-actions"]'],
    }),
    createStep({
      id: "transactions-uncategorized",
      title: "미분류 직접 정리",
      description:
        "**미분류 입력칸은 자동검토로 해결되지 않은 거래를 마지막으로 직접 분류하는 자리입니다.** 실제 입력칸에 카테고리를 넣어야 다음 단계로 넘어갑니다.",
      targetPath: "/collections/card",
      targetSelector: '[data-guide-target="transactions-uncategorized-category-input"]',
      fallbackSelector: '[data-guide-target="transactions-uncategorized-filter"]',
      ctaLabel: "입력칸 보기",
      activeLabel: "입력칸에 넣어보세요",
      tips: ["이제 흐름 화면으로 이동합니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "미분류 입력칸에 카테고리를 넣어보세요",
      allowedInteractionSelectors: ['[data-guide-target="transactions-uncategorized-category-input"] input'],
    }),
    createStep({
      id: "settlements-overview",
      title: "흐름 화면 소개",
      description:
        "**흐름 화면은 카드값을 어느 계좌로 얼마나 옮길지 확인하는 화면입니다.** 사람 간 정산 화면이 아니라는 점이 중요합니다.",
      targetPath: "/settlements",
      targetSelector: '[data-guide-target="nav-settlements"]',
      fallbackSelector: '[data-guide-target="settlements-page-overview"]',
      ctaLabel: "흐름 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 이체 목록입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settlements-transfer-list",
      title: "이체 카드 읽기",
      description:
        "**이체 카드 목록은 어디에서 어디로 얼마를 옮겨야 하는지 보여줍니다.** 실제 마감 행동은 다음 버튼에서 이뤄집니다.",
      targetPath: "/settlements",
      targetSelector: '[data-guide-target="settlements-transfer-list"]',
      fallbackSelector: '[data-guide-target="settlements-page-overview"]',
      ctaLabel: "이체 카드 보기",
      activeLabel: "확인했어요",
      tips: ["이제 이체 확인 버튼을 눌러보겠습니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settlements-confirm-action",
      title: "이체 확인 누르기",
      description:
        "**이체 확인 버튼은 이체 처리가 끝났다는 사실을 기록하는 마지막 행동입니다.** 실제로 눌러야 다음 단계로 넘어갑니다.",
      targetPath: "/settlements",
      targetSelector: '[data-guide-target="settlements-confirm-action"]',
      fallbackSelector: '[data-guide-target="settlements-transfer-list"]',
      ctaLabel: "이체 확인 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["다음은 월 기록입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "이체 확인 버튼을 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="settlements-confirm-action"]'],
    }),
    createStep({
      id: "records-moon-overview",
      title: "달 기록 소개",
      description:
        "**달 기록은 이번 달 소비 구조를 통계로 보는 화면입니다.** 결제내역에서 정리한 결과가 어떻게 보이는지 확인하는 자리입니다.",
      targetPath: "/records/moon",
      targetSelector: '[data-guide-target="nav-sub-moon"]',
      fallbackSelector: '[data-guide-target="records-moon-overview"]',
      ctaLabel: "달 기록 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 그래프 보기 전환입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "records-moon-category-toggle",
      title: "달 기록 그래프 전환",
      description:
        "**그래프 전환 버튼은 같은 데이터를 다른 시선으로 읽게 해줍니다.** 실제로 버튼을 눌러보기 방식을 바꿔보세요.",
      targetPath: "/records/moon",
      targetSelector: '[data-guide-target="records-moon-category-toggle"]',
      fallbackSelector: '[data-guide-target="records-moon-overview"]',
      ctaLabel: "그래프 전환 보기",
      activeLabel: "전환해보세요",
      tips: ["다음은 해 기록입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "그래프 보기 방식을 바꿔보세요",
      allowedInteractionSelectors: ['[data-guide-target="records-moon-category-toggle"] button'],
    }),
    createStep({
      id: "records-sun-overview",
      title: "해 기록 소개",
      description:
        "**해 기록은 월 단위 변화를 길게 보는 통계 화면입니다.** 추세와 계절 변화를 같이 읽는 데에 의미가 있습니다.",
      targetPath: "/records/sun",
      targetSelector: '[data-guide-target="nav-sub-sun"]',
      fallbackSelector: '[data-guide-target="records-sun-overview"]',
      ctaLabel: "해 기록 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 연간 그래프입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "records-sun-chart",
      title: "연간 그래프 보기",
      description:
        "**연간 그래프는 소비와 수입 흐름을 시각적으로 비교하는 영역입니다.** 통계 화면이 실제로 어떻게 보이는지 익히는 단계입니다.",
      targetPath: "/records/sun",
      targetSelector: '[data-guide-target="records-sun-annual-chart"]',
      fallbackSelector: '[data-guide-target="records-sun-overview"]',
      ctaLabel: "연간 그래프 보기",
      activeLabel: "확인했어요",
      tips: ["마지막으로 설정 화면을 봅니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settings-overview",
      title: "설정 화면 소개",
      description:
        "**설정 화면은 백업, 테마, 가이드 다시보기 같은 운영 기능을 모아둔 곳입니다.** 자주 편집하지 않아도 위치는 알아두는 편이 좋습니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-page-overview"]',
      ctaLabel: "설정 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 상단 요약입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settings-profile-summary",
      title: "설정 상단 요약",
      description:
        "**설정 상단 요약은 지금 어떤 공간을 보고 있는지 다시 확인하는 영역입니다.** 운영 기능을 누르기 전 맥락을 잡는 데 도움이 됩니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-profile-summary"]',
      fallbackSelector: '[data-guide-target="settings-page-overview"]',
      ctaLabel: "요약 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 백업 기능입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settings-backup",
      title: "백업 기능 보기",
      description:
        "**백업은 현재 작업 상태를 파일로 내보내고 다시 불러오는 복구 기능입니다.** 실제 운영에서 가장 중요한 안전장치 중 하나입니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-backup"]',
      fallbackSelector: '[data-guide-target="settings-page-overview"]',
      ctaLabel: "백업 보기",
      activeLabel: "확인했어요",
      tips: ["다음은 테마 토글입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
    createStep({
      id: "settings-theme",
      title: "테마 버튼 눌러보기",
      description:
        "**테마 버튼은 화면 보기 방식을 바로 바꾸는 설정입니다.** 실제로 눌러봐야 어떤 변화가 있는지 익힐 수 있습니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-theme-toggle"]',
      fallbackSelector: '[data-guide-target="settings-theme"]',
      ctaLabel: "테마 보기",
      activeLabel: "버튼을 눌러보세요",
      tips: ["마지막은 가이드 다시보기입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
      interactionKind: "press",
      interactionLabel: "테마 버튼을 눌러보세요",
      allowedInteractionSelectors: ['[data-guide-target="settings-theme-toggle"]'],
    }),
    createStep({
      id: "settings-guide-replay",
      title: "가이드 다시보기",
      description:
        "**가이드 다시보기 버튼은 메인 튜토리얼을 처음부터 다시 보는 기능입니다.** 복습이 필요할 때 어디서 시작하면 되는지 기억해두면 좋습니다.",
      targetPath: "/settings",
      targetSelector: '[data-guide-target="settings-guide-replay-action"]',
      fallbackSelector: '[data-guide-target="settings-guide-replay"]',
      ctaLabel: "다시보기 보기",
      activeLabel: "확인했어요",
      tips: ["메인 튜토리얼은 여기까지입니다."],
      completed: false,
      requiresTargetVisit: true,
      blocking: true,
    }),
  ];

  const supportTips: GuideSupportTip[] = [
    {
      id: "people-delete-assets",
      title: "삭제는 오른쪽 영역으로 보냅니다",
      description:
        "**삭제는 숨기기보다 더 강한 동작입니다.** 자산을 오른쪽 삭제 영역으로 보내면 확인 과정을 거쳐 제거하게 됩니다.",
      targetSelector: '[data-guide-target="people-delete-zone"]',
      targetPath: "/connections/assets",
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "삭제 영역 보기",
      dismissLabel: "확인했어요",
      tips: ["처음엔 삭제보다 숨기기를 먼저 쓰는 편이 안전합니다."],
    },
    {
      id: "people-link-account",
      title: "계좌를 카드에 놓아 연결할 수도 있어요",
      description:
        "**자산 화면에서는 계좌를 카드 위로 드래그해 카드 결제 계좌를 바로 연결할 수도 있습니다.** 카드와 계좌가 많아질수록 이 동작이 편합니다.",
      targetSelector: '[data-guide-target="people-card-linking"]',
      targetPath: "/connections/assets",
      fallbackSelector: '[data-guide-target="people-page-overview"]',
      ctaLabel: "카드 연결 보기",
      dismissLabel: "확인했어요",
      tips: ["같은 사용자 보드 안에서만 연결하면 실수가 적습니다."],
    },
    {
      id: "guide-move",
      title: "가이드 위치는 옮길 수 있어요",
      description:
        "**패널이나 비콘을 드래그하면 좌우 위치를 바꿀 수 있습니다.** 설명이 화면을 가리면 더 편한 쪽으로 옮겨 쓰세요.",
      targetSelector: '[data-guide-anchor="panel"], [data-guide-anchor="fab"]',
      targetPath: null,
      ctaLabel: "알겠어요",
      dismissLabel: "다음에 볼게요",
      tips: ["패널은 넓은 쪽으로, 비콘은 시선을 덜 가리는 쪽으로 두면 편합니다."],
    },
  ];

  const blockingSteps = steps.filter((step) => step.blocking !== false);
  const actionableBlockingSteps = blockingSteps.filter((step) => step.available !== false);
  const completedCount = blockingSteps.filter((step) => step.completed).length;
  const totalCount = blockingSteps.length;
  const currentStep = actionableBlockingSteps.find((step) => !step.completed) ?? null;

  return {
    progress: totalCount ? completedCount / totalCount : 1,
    completedCount,
    totalCount,
    currentStep,
    steps,
    supportTips: supportTips.filter((tip) => {
      if (tip.id === "people-link-account") return hasLinkableAssets;
      return true;
    }),
  };
}
