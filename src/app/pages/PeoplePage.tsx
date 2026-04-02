import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useEffect } from "react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { GUIDE_SAMPLE_MEMO } from "../../domain/guidance/guideSampleBundle";
import { getWorkspaceGuide } from "../../domain/guidance/workspaceGuide";
import { completeGuideStepAction, revertGuideStepAction } from "../../domain/guidance/guideRuntime";
import { getActiveTransactions } from "../../domain/transactions/meta";
import type { Account, Category } from "../../shared/types/models";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { AppSelect } from "../components/AppSelect";
import { BoardCase } from "../components/BoardCase";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "입출금" },
  { value: "savings", label: "저축" },
  { value: "loan", label: "대출" },
  { value: "cash", label: "현금" },
  { value: "other", label: "기타" },
] as const;

const ACCOUNT_USAGE_OPTIONS = [
  { value: "daily", label: "일상 생활비" },
  { value: "salary", label: "급여 수령" },
  { value: "shared", label: "공동 자금" },
  { value: "card_payment", label: "카드 결제" },
  { value: "savings", label: "저축" },
  { value: "investment", label: "투자" },
  { value: "loan", label: "대출 관리" },
  { value: "other", label: "기타" },
] as const;

const ACCOUNT_USAGE_FORM_OPTIONS = ACCOUNT_USAGE_OPTIONS.filter((option) => option.value !== "shared");
const MEETING_ACCOUNT_USAGE_OPTIONS = [{ value: "shared", label: "공동 자금" }] as const;

const FINANCIAL_INSTITUTION_OPTIONS = [
  "KB국민은행",
  "신한은행",
  "하나은행",
  "우리은행",
  "NH농협은행",
  "IBK기업은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "SC제일은행",
  "수협은행",
  "새마을금고",
  "신협",
  "우체국",
  "부산은행",
  "대구은행",
  "광주은행",
  "전북은행",
  "제주은행",
  "직접입력",
] as const;

const CARD_TYPE_OPTIONS = [
  { value: "credit", label: "신용카드" },
  { value: "check", label: "체크카드" },
  { value: "debit", label: "직불카드" },
  { value: "prepaid", label: "선불카드" },
  { value: "other", label: "기타" },
] as const;

type AccountUsageType = (typeof ACCOUNT_USAGE_OPTIONS)[number]["value"];

type PersonAccountDraftState = {
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  ownerPersonId: string;
  primaryPersonId: string;
  participantPersonIds: string[];
  accountGroupType: "personal" | "meeting";
  accountType: (typeof ACCOUNT_TYPE_OPTIONS)[number]["value"];
  usageType: AccountUsageType;
  isShared: boolean;
  memo: string;
};

type PersonCardDraftState = {
  ownerPersonId: string;
  name: string;
  issuerName: string;
  cardNumberMasked: string;
  linkedAccountId: string;
  cardType: (typeof CARD_TYPE_OPTIONS)[number]["value"];
  memo: string;
};

type PersonAccountValues = Pick<
  Account,
  | "ownerPersonId"
  | "primaryPersonId"
  | "participantPersonIds"
  | "accountGroupType"
  | "name"
  | "alias"
  | "institutionName"
  | "accountNumberMasked"
  | "accountType"
  | "usageType"
  | "isShared"
  | "memo"
>;

type DragItem =
  | { id: string; itemType: "person"; ownerPersonId: null; isHidden: boolean }
  | { id: string; itemType: "account"; ownerPersonId: string | null; isHidden: boolean }
  | { id: string; itemType: "card"; ownerPersonId: string | null; isHidden: boolean }
  | { id: string; itemType: "categoryLink"; ownerPersonId: null; isHidden: false }
  | { id: string; itemType: "categoryGroupLink"; ownerPersonId: null; isHidden: false; categoryIds: string[] };

type CategoryGroup = Category & { categoryType: "group" };
type LeafCategory = Category & { categoryType: "category" };

type CategoryLinkGroup = {
  group: CategoryGroup;
  categories: LeafCategory[];
};

type CategoryLinkPanelSize = {
  width: number;
  height: number;
};

type CategoryLinkPanelResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type PendingGuideDragTransaction = {
  pickStepId: "people-hidden-hide-pick" | "people-hidden-restore-pick" | "people-category-link-pick";
  completed: boolean;
};

let transparentDragImage: HTMLCanvasElement | null = null;

const CATEGORY_LINK_PANEL_RESIZE_DIRECTIONS: CategoryLinkPanelResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const GUIDE_HIGHLIGHT_CHANGE_EVENT = "spending-diary:guide-highlight-change";
const HIDDEN_GUIDE_SELECTORS = new Set([
  '[data-guide-target="people-hidden-toggle"]',
  '[data-guide-target="people-hide-guide-card"]',
  '[data-guide-target="people-hide-zone"]',
  '[data-guide-target="people-hidden-guide-card"]',
  '[data-guide-target="people-restore-drop"]',
]);
const CATEGORY_LINK_GUIDE_SELECTORS = new Set([
  '[data-guide-target="people-category-link-panel"]',
  '[data-guide-target="people-category-link-panel-head"]',
  '[data-guide-target="people-category-link-resize-handle"]',
  '[data-guide-target="people-category-link-guide-item"]',
  '[data-guide-target="people-category-link-account-card"]',
]);
const HIDDEN_GUIDE_STEP_IDS = new Set([
  "people-hidden-assets",
  "people-hidden-hide-pick",
  "people-hidden-hide-drop",
  "people-hidden-restore-pick",
  "people-hidden-restore-drop",
]);
const CATEGORY_LINK_GUIDE_STEP_IDS = new Set([
  "people-category-link-panel",
  "people-category-link-move",
  "people-category-link-resize",
  "people-category-link-pick",
  "people-category-link-drop",
]);

const EMPTY_PERSON_ACCOUNT_DRAFT: PersonAccountDraftState = {
  name: "",
  alias: "",
  institutionName: "",
  accountNumberMasked: "",
  ownerPersonId: "",
  primaryPersonId: "",
  participantPersonIds: [],
  accountGroupType: "personal",
  accountType: "checking",
  usageType: "daily",
  isShared: false,
  memo: "",
};

const EMPTY_PERSON_CARD_DRAFT: PersonCardDraftState = {
  ownerPersonId: "",
  name: "",
  issuerName: "",
  cardNumberMasked: "",
  linkedAccountId: "",
  cardType: "credit",
  memo: "",
};

function getInsertIndexByHorizontalPointer(event: React.DragEvent<HTMLElement>, baseIndex: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? baseIndex + 1 : baseIndex;
}

function getInsertIndexByVerticalPointer(event: React.DragEvent<HTMLElement>, baseIndex: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? baseIndex + 1 : baseIndex;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCategoryLinkPanelSizeBounds() {
  if (typeof window === "undefined") {
    return {
      margin: 16,
      minWidth: 360,
      maxWidth: 768,
      minHeight: 240,
      maxHeight: 352,
    };
  }

  const margin = 16;
  const maxWidth = Math.max(360, window.innerWidth - margin * 2);
  const maxHeight = Math.max(240, window.innerHeight - margin * 2);
  return {
    margin,
    minWidth: Math.min(480, maxWidth),
    maxWidth,
    minHeight: Math.min(240, maxHeight),
    maxHeight,
  };
}

function clampCategoryLinkPanelSize(size: CategoryLinkPanelSize) {
  const bounds = getCategoryLinkPanelSizeBounds();
  return {
    width: clampNumber(size.width, bounds.minWidth, bounds.maxWidth),
    height: clampNumber(size.height, bounds.minHeight, bounds.maxHeight),
  };
}

function getDefaultCategoryLinkPanelSize() {
  if (typeof window === "undefined") {
    return { width: 768, height: 352 };
  }

  return clampCategoryLinkPanelSize({
    width: Math.min(768, window.innerWidth - 32),
    height: Math.min(352, window.innerHeight - 112),
  });
}

function getDefaultCategoryLinkPanelPosition(panelSize = getDefaultCategoryLinkPanelSize()) {
  if (typeof window === "undefined") {
    return { left: 16, top: 104 };
  }

  const { margin } = getCategoryLinkPanelSizeBounds();
  return {
    left: Math.max(margin, Math.round((window.innerWidth - panelSize.width) / 2)),
    top: 104,
  };
}

function getTransparentDragImage() {
  if (typeof document === "undefined") return null;
  if (!transparentDragImage) {
    transparentDragImage = document.createElement("canvas");
    transparentDragImage.width = 1;
    transparentDragImage.height = 1;
  }
  return transparentDragImage;
}

function isCategoryConnectionDragItem(item: DragItem | null): item is Extract<DragItem, { itemType: "categoryLink" | "categoryGroupLink" }> {
  return item?.itemType === "categoryLink" || item?.itemType === "categoryGroupLink";
}

function getPersonRoleLabel(role: "owner" | "member") {
  return role === "owner" ? "기본 사용자" : "구성원";
}

function getCardAccountLabel(cardType: PersonCardDraftState["cardType"]) {
  return cardType === "credit" ? "납부계좌" : "연결계좌";
}

function getVisibleCardIdentifier(cardNumberMasked: string) {
  const trimmed = cardNumberMasked.trim();
  if (!trimmed) return "";
  return /\d/.test(trimmed) ? trimmed : "";
}

function getVisibleAccountUsageType(usageType: AccountUsageType, isShared?: boolean) {
  if (isShared || usageType === "shared") return "other" satisfies AccountUsageType;
  return usageType;
}

function isMeetingAccount(account?: Pick<Account, "accountGroupType"> | null) {
  return account?.accountGroupType === "meeting";
}

function getFinancialInstitutionOptions(currentValue?: string) {
  const normalizedCurrentValue = currentValue?.trim() ?? "";
  if (!normalizedCurrentValue) return FINANCIAL_INSTITUTION_OPTIONS;
  if (FINANCIAL_INSTITUTION_OPTIONS.includes(normalizedCurrentValue as (typeof FINANCIAL_INSTITUTION_OPTIONS)[number])) {
    return FINANCIAL_INSTITUTION_OPTIONS;
  }
  return [normalizedCurrentValue, ...FINANCIAL_INSTITUTION_OPTIONS];
}

function createAccountDraftForPerson(personId: string): PersonAccountDraftState {
  return {
    ...EMPTY_PERSON_ACCOUNT_DRAFT,
    ownerPersonId: personId,
    primaryPersonId: personId,
    participantPersonIds: [personId],
  };
}

function createDraftFromAccount(account?: PersonAccountValues): PersonAccountDraftState {
  if (!account) return EMPTY_PERSON_ACCOUNT_DRAFT;
  const isMeeting = account.accountGroupType === "meeting";
  const primaryPersonId = account.primaryPersonId ?? account.ownerPersonId ?? "";
  const participantPersonIds = Array.from(
    new Set(
      [...(account.participantPersonIds ?? []), ...(account.accountGroupType === "meeting" && primaryPersonId ? [primaryPersonId] : [])].filter(Boolean),
    ),
  );
  return {
    name: account.name,
    alias: account.alias || account.name,
    institutionName: account.institutionName,
    accountNumberMasked: account.accountNumberMasked,
    ownerPersonId: account.ownerPersonId ?? "",
    primaryPersonId,
    participantPersonIds,
    accountGroupType: account.accountGroupType ?? "personal",
    accountType: account.accountType,
    usageType: isMeeting ? "shared" : getVisibleAccountUsageType(account.usageType, account.isShared),
    isShared: isMeeting || account.isShared,
    memo: account.memo,
  };
}

function getAccountUsageOptions(accountGroupType: PersonAccountDraftState["accountGroupType"]) {
  return accountGroupType === "meeting" ? MEETING_ACCOUNT_USAGE_OPTIONS : ACCOUNT_USAGE_FORM_OPTIONS;
}

function createDraftFromCard(card?: {
  ownerPersonId: string | null;
  name: string;
  issuerName: string;
  cardNumberMasked: string;
  linkedAccountId: string | null;
  cardType: PersonCardDraftState["cardType"];
  memo: string;
}): PersonCardDraftState {
  if (!card) return EMPTY_PERSON_CARD_DRAFT;
  return {
    ownerPersonId: card.ownerPersonId ?? "",
    name: card.name,
    issuerName: card.issuerName,
    cardNumberMasked: card.cardNumberMasked,
    linkedAccountId: card.linkedAccountId ?? "",
    cardType: card.cardType,
    memo: card.memo,
  };
}

function normalizeAccountDraftValues(draft: PersonAccountDraftState): PersonAccountValues {
  const accountLabel = draft.alias.trim() || draft.name.trim();
  const primaryPersonId = draft.primaryPersonId || draft.ownerPersonId || null;
  const isMeeting = draft.accountGroupType === "meeting";
  const participantPersonIds = Array.from(
    new Set(
      [...draft.participantPersonIds, ...(isMeeting && primaryPersonId ? [primaryPersonId] : [])].filter(
        (personId): personId is string => Boolean(personId),
      ),
    ),
  );
  return {
    ownerPersonId: primaryPersonId,
    primaryPersonId,
    participantPersonIds,
    accountGroupType: draft.accountGroupType,
    name: accountLabel,
    alias: accountLabel,
    institutionName: draft.institutionName.trim(),
    accountNumberMasked: draft.accountNumberMasked.trim(),
    accountType: draft.accountType,
    usageType: isMeeting ? "shared" : getVisibleAccountUsageType(draft.usageType),
    isShared: isMeeting,
    memo: draft.memo.trim(),
  };
}

function normalizeCardDraftValues(draft: PersonCardDraftState) {
  return {
    ownerPersonId: draft.ownerPersonId || null,
    name: draft.name.trim(),
    issuerName: draft.issuerName.trim(),
    cardNumberMasked: draft.cardNumberMasked.trim(),
    linkedAccountId: draft.linkedAccountId || null,
    cardType: draft.cardType,
    memo: draft.memo.trim(),
  };
}

function createSequentialLabel(baseLabel: string, existingLabels: string[]) {
  const normalizedLabels = new Set(existingLabels.map((label) => label.trim()).filter(Boolean));
  if (!normalizedLabels.has(baseLabel)) return baseLabel;
  let suffix = 2;
  while (normalizedLabels.has(`${baseLabel} ${suffix}`)) suffix += 1;
  return `${baseLabel} ${suffix}`;
}

export function PeoplePage({ embedded = false }: { embedded?: boolean }) {
  const {
    addAccount,
    addPerson,
    deleteAccount,
    deleteCard,
    deletePerson,
    moveAccount,
    moveCard,
    movePerson,
    state,
    updateAccount,
    updateCard,
    updateCategory,
    updatePerson,
  } =
    useAppState();
  const [inlineEditingPersonId, setInlineEditingPersonId] = useState<string | null>(null);
  const [inlinePersonName, setInlinePersonName] = useState("");
  const [pendingInlinePersonName, setPendingInlinePersonName] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<"hide" | "delete" | null>(null);
  const [activeCardLinkTargetId, setActiveCardLinkTargetId] = useState<string | null>(null);
  const [activeCategoryLinkTargetId, setActiveCategoryLinkTargetId] = useState<string | null>(null);
  const [linkedAccountFlash, setLinkedAccountFlash] = useState<{ cardId: string; sequence: number } | null>(null);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const [isDragOverlayActive, setIsDragOverlayActive] = useState(false);
  const [isHiddenPanelOpen, setIsHiddenPanelOpen] = useState(false);
  const [isCategoryLinkPanelOpen, setIsCategoryLinkPanelOpen] = useState(false);
  const [categoryLinkPanelSize, setCategoryLinkPanelSize] = useState<CategoryLinkPanelSize | null>(null);
  const [categoryLinkPanelPosition, setCategoryLinkPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [categoryLinkColumnCount, setCategoryLinkColumnCount] = useState(1);
  const [isCategoryLinkPanelDragging, setIsCategoryLinkPanelDragging] = useState(false);
  const [isCategoryLinkPanelResizing, setIsCategoryLinkPanelResizing] = useState(false);
  const [isCategoryLinkResetZoneActive, setIsCategoryLinkResetZoneActive] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<{ itemType: "person" | "account" | "card"; id: string } | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [accountOwnerPersonId, setAccountOwnerPersonId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<PersonAccountDraftState>(EMPTY_PERSON_ACCOUNT_DRAFT);
  const [editAccountDraft, setEditAccountDraft] = useState<PersonAccountDraftState>(EMPTY_PERSON_ACCOUNT_DRAFT);
  const [editCardDraft, setEditCardDraft] = useState<PersonCardDraftState>(EMPTY_PERSON_CARD_DRAFT);
  const dragOverlayTimeoutRef = useRef<number | null>(null);
  const dragOverlayEnterTimeoutRef = useRef<number | null>(null);
  const linkedAccountFlashTimeoutRef = useRef<number | null>(null);
  const linkedAccountFlashSequenceRef = useRef(0);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const dragGhostOffsetRef = useRef({ x: 0, y: 0 });
  const categoryLinkPanelRef = useRef<HTMLElement | null>(null);
  const categoryLinkPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const categoryLinkPanelSizeRef = useRef<CategoryLinkPanelSize | null>(null);
  const categoryLinkPanelPositionRef = useRef<{ left: number; top: number } | null>(null);
  const categoryLinkPanelGuideResizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const categoryLinkPanelDragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const categoryLinkPanelResizeStateRef = useRef<{
    pointerId: number;
    direction: CategoryLinkPanelResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const categoryLinkPanelGuideMoveStartRef = useRef<{ left: number; top: number } | null>(null);
  const pendingGuideDragTransactionRef = useRef<PendingGuideDragTransaction | null>(null);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentGuideStep = useMemo(() => getWorkspaceGuide(state, workspaceId).currentStep, [state, workspaceId]);
  const isCategoryLinkGuideActive = currentGuideStep ? CATEGORY_LINK_GUIDE_STEP_IDS.has(currentGuideStep.id) : false;
  const shouldRenderCategoryLinkPanel = isCategoryLinkPanelOpen || isCategoryLinkGuideActive;
  const people = scope.people.filter((person) => !person.isHidden);
  const hiddenPeople = scope.people.filter((person) => person.isHidden);
  const hiddenAccounts = scope.accounts.filter((account) => account.isHidden && !account.isShared);
  const hiddenCards = scope.cards.filter((card) => card.isHidden);
  const transactions = getActiveTransactions(scope.transactions);
  const personNameMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountNameMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const categoryGroupNameMap = useMemo(
    () =>
      new Map(
        scope.categories
          .filter((category): category is CategoryGroup => category.categoryType === "group")
          .map((group) => [group.id, group.name]),
      ),
    [scope.categories],
  );
  const allLeafCategories = useMemo(
    () =>
      scope.categories
        .filter((category): category is LeafCategory => category.categoryType === "category")
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR")),
    [scope.categories],
  );
  const visibleLeafCategories = useMemo(
    () => allLeafCategories.filter((category) => !category.isHidden),
    [allLeafCategories],
  );
  const categoryLinkGroups = useMemo<CategoryLinkGroup[]>(() => {
    const groups = scope.categories
      .filter((category): category is CategoryGroup => category.categoryType === "group" && !category.isHidden)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR"));

    return groups
      .map((group) => ({
        group,
        categories: visibleLeafCategories.filter((category) => category.parentCategoryId === group.id),
      }))
      .filter((entry) => entry.categories.length);
  }, [scope.categories, visibleLeafCategories]);
  const maxCategoryLinkGroupSize = useMemo(
    () => categoryLinkGroups.reduce((max, entry) => Math.max(max, entry.categories.length), 1),
    [categoryLinkGroups],
  );
  const guideHideTargetCardId = useMemo(
    () =>
      scope.cards.find((card) => !card.isHidden && card.memo === GUIDE_SAMPLE_MEMO && card.cardType === "credit")?.id ??
      scope.cards.find((card) => !card.isHidden)?.id ??
      null,
    [scope.cards],
  );
  const guideCategoryLinkAccountId = useMemo(
    () =>
      scope.accounts.find((account) => !account.isHidden && account.memo === GUIDE_SAMPLE_MEMO && account.usageType === "card_payment")?.id ??
      scope.accounts.find((account) => !account.isHidden)?.id ??
      null,
    [scope.accounts],
  );
  const guideHiddenRestoreCardId = useMemo(
    () =>
      hiddenCards.find((card) => card.memo === GUIDE_SAMPLE_MEMO && card.cardType === "credit")?.id ??
      hiddenAccounts.find((account) => account.memo === GUIDE_SAMPLE_MEMO && account.usageType === "daily")?.id ??
      hiddenPeople[0]?.id ??
      hiddenAccounts[0]?.id ??
      hiddenCards[0]?.id ??
      null,
    [hiddenAccounts, hiddenCards, hiddenPeople],
  );
  const guideCategoryLinkCategoryId = useMemo(
    () =>
      categoryLinkGroups
        .flatMap((entry) => entry.categories)
        .find((category) => !category.linkedAccountId)?.id ??
      categoryLinkGroups.flatMap((entry) => entry.categories)[0]?.id ??
      null,
    [categoryLinkGroups],
  );
  const linkedCategoriesByAccountId = useMemo(() => {
    const nextMap = new Map<string, LeafCategory[]>();
    allLeafCategories.forEach((category) => {
      if (!category.linkedAccountId) return;
      const current = nextMap.get(category.linkedAccountId) ?? [];
      current.push(category);
      nextMap.set(category.linkedAccountId, current);
    });
    nextMap.forEach((categories) => {
      categories.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR"));
    });
    return nextMap;
  }, [allLeafCategories]);
  const editingAccount = useMemo(
    () => scope.accounts.find((account) => account.id === editingAccountId) ?? null,
    [scope.accounts, editingAccountId],
  );
  const editingAccountLinkedCategories = useMemo(
    () => (editingAccount ? linkedCategoriesByAccountId.get(editingAccount.id) ?? [] : []),
    [editingAccount, linkedCategoriesByAccountId],
  );
  const editingCard = useMemo(() => scope.cards.find((card) => card.id === editingCardId) ?? null, [scope.cards, editingCardId]);
  const activeCardLinkMessage = useMemo(() => {
    if (!activeCardLinkTargetId) return "";
    const targetCard = scope.cards.find((card) => card.id === activeCardLinkTargetId);
    if (!targetCard) return "";
    return `🔗 ${getCardAccountLabel(targetCard.cardType)}로 연결`;
  }, [activeCardLinkTargetId, scope.cards]);
  const activeCategoryLinkMessage = useMemo(() => {
    if (isCategoryLinkResetZoneActive) return "⛓️‍💥 연결해제";
    if (!activeCategoryLinkTargetId) return "";
    return "🔗 카테고리 연결";
  }, [activeCategoryLinkTargetId, isCategoryLinkResetZoneActive]);
  const categoryLinkGridStyle = useMemo(
    () =>
      ({
        "--people-category-link-columns": `${categoryLinkColumnCount}`,
      }) as Record<string, string>,
    [categoryLinkColumnCount],
  );

  useEffect(() => {
    categoryLinkPanelSizeRef.current = categoryLinkPanelSize;
  }, [categoryLinkPanelSize]);

  useEffect(() => {
    categoryLinkPanelPositionRef.current = categoryLinkPanelPosition;
  }, [categoryLinkPanelPosition]);

  useEffect(() => {
    if (!shouldRenderCategoryLinkPanel || typeof window === "undefined") {
      setCategoryLinkColumnCount(1);
      return;
    }

    const panelScroll = categoryLinkPanelScrollRef.current;
    if (!panelScroll) return;

    const rootFontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const minCardWidth = 11 * rootFontSize;
    const listGap = 0.55 * rootFontSize;
    let frame = 0;

    const updateColumnCount = () => {
      frame = 0;
      const firstList = panelScroll.querySelector<HTMLElement>(".people-category-link-list");
      const listWidth = firstList?.clientWidth ?? 0;
      if (!listWidth) {
        setCategoryLinkColumnCount(1);
        return;
      }

      const fittedColumns = Math.max(1, Math.floor((listWidth + listGap) / (minCardWidth + listGap)));
      setCategoryLinkColumnCount(Math.max(1, Math.min(maxCategoryLinkGroupSize, fittedColumns)));
    };

    const queueColumnCountUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateColumnCount);
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queueColumnCountUpdate);
    resizeObserver?.observe(panelScroll);
    const firstList = panelScroll.querySelector<HTMLElement>(".people-category-link-list");
    if (firstList) {
      resizeObserver?.observe(firstList);
    }

    queueColumnCountUpdate();
    window.addEventListener("resize", queueColumnCountUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", queueColumnCountUpdate);
      resizeObserver?.disconnect();
    };
  }, [shouldRenderCategoryLinkPanel, maxCategoryLinkGroupSize, categoryLinkPanelSize]);

  const accountsByPersonId = new Map(
    scope.people.map((person) => [
      person.id,
      scope.accounts.filter((account) => {
        if (account.isHidden) return false;
        if (account.accountGroupType === "meeting") {
          return (account.participantPersonIds ?? []).includes(person.id) || account.primaryPersonId === person.id;
        }
        return account.ownerPersonId === person.id;
      }),
    ]),
  );
  const cardsByPersonId = new Map(
    scope.people.map((person) => [person.id, scope.cards.filter((card) => card.ownerPersonId === person.id && !card.isHidden)]),
  );
  const activePeopleOptions = people.map((person) => ({
    value: person.id,
    label: person.displayName || person.name,
  }));

  const createPersonSection = () => {
    const displayName = createSequentialLabel(
      "새 사용자",
      people.map((person) => person.displayName || person.name),
    );
    addPerson(workspaceId, {
      name: displayName,
      displayName,
      role: people.length ? "member" : "owner",
      memo: "",
      isActive: true,
    });
    setPendingInlinePersonName(displayName);
  };

  const startInlinePersonEdit = (person: { id: string; name: string; displayName: string }) => {
    setInlineEditingPersonId(person.id);
    setInlinePersonName(person.displayName || person.name);
  };

  const stopInlinePersonEdit = () => {
    setInlineEditingPersonId(null);
    setInlinePersonName("");
  };

  const submitInlinePersonEdit = (person: { id: string; name: string; displayName: string }) => {
    const name = inlinePersonName.trim();
    if (!name) {
      stopInlinePersonEdit();
      return;
    }

    const syncOriginalName = !person.displayName.trim() || person.displayName === person.name;
    const nextName = syncOriginalName ? name : person.name;
    const nextDisplayName = name;

    if (nextName !== person.name || nextDisplayName !== person.displayName) {
      updatePerson(workspaceId, person.id, {
        name: nextName,
        displayName: nextDisplayName,
      });
    }

    stopInlinePersonEdit();
  };

  useEffect(() => {
    if (!pendingInlinePersonName) return;
    const createdPerson = people.find((person) => (person.displayName || person.name) === pendingInlinePersonName);
    if (!createdPerson) return;
    startInlinePersonEdit(createdPerson);
    setPendingInlinePersonName(null);
  }, [pendingInlinePersonName, people]);

  useEffect(() => {
    if (!shouldRenderCategoryLinkPanel || typeof window === "undefined") {
      categoryLinkPanelDragStateRef.current = null;
      categoryLinkPanelResizeStateRef.current = null;
      categoryLinkPanelGuideResizeStartRef.current = null;
      setIsCategoryLinkPanelDragging(false);
      setIsCategoryLinkPanelResizing(false);
      return;
    }

    const getCurrentPanelSize = () =>
      categoryLinkPanelSizeRef.current ??
      (categoryLinkPanelRef.current
        ? clampCategoryLinkPanelSize({
            width: categoryLinkPanelRef.current.offsetWidth,
            height: categoryLinkPanelRef.current.offsetHeight,
          })
        : getDefaultCategoryLinkPanelSize());

    const clampPanelPosition = (position: { left: number; top: number }, panelSize = getCurrentPanelSize()) => {
      const { margin } = getCategoryLinkPanelSizeBounds();
      return {
        left: clampNumber(position.left, margin, Math.max(margin, window.innerWidth - panelSize.width - margin)),
        top: clampNumber(position.top, margin, Math.max(margin, window.innerHeight - panelSize.height - margin)),
      };
    };

    const frame = window.requestAnimationFrame(() => {
      const initialSize = getCurrentPanelSize();
      if (!categoryLinkPanelSizeRef.current) {
        setCategoryLinkPanelSize(initialSize);
      }
      setCategoryLinkPanelPosition((current) => clampPanelPosition(current ?? getDefaultCategoryLinkPanelPosition(initialSize), initialSize));
    });

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = categoryLinkPanelResizeStateRef.current;
      if (resizeState) {
        event.preventDefault();
        const { margin, minWidth, minHeight } = getCategoryLinkPanelSizeBounds();
        const deltaX = event.clientX - resizeState.startX;
        const deltaY = event.clientY - resizeState.startY;
        const rightEdge = resizeState.startLeft + resizeState.startWidth;
        const bottomEdge = resizeState.startTop + resizeState.startHeight;
        let nextLeft = resizeState.startLeft;
        let nextTop = resizeState.startTop;
        let nextWidth = resizeState.startWidth;
        let nextHeight = resizeState.startHeight;

        if (resizeState.direction.includes("e")) {
          nextWidth = clampNumber(
            resizeState.startWidth + deltaX,
            minWidth,
            Math.max(minWidth, window.innerWidth - margin - resizeState.startLeft),
          );
        }

        if (resizeState.direction.includes("s")) {
          nextHeight = clampNumber(
            resizeState.startHeight + deltaY,
            minHeight,
            Math.max(minHeight, window.innerHeight - margin - resizeState.startTop),
          );
        }

        if (resizeState.direction.includes("w")) {
          nextLeft = clampNumber(resizeState.startLeft + deltaX, margin, Math.max(margin, rightEdge - minWidth));
          nextWidth = clampNumber(rightEdge - nextLeft, minWidth, Math.max(minWidth, rightEdge - margin));
        }

        if (resizeState.direction.includes("n")) {
          nextTop = clampNumber(resizeState.startTop + deltaY, margin, Math.max(margin, bottomEdge - minHeight));
          nextHeight = clampNumber(bottomEdge - nextTop, minHeight, Math.max(minHeight, bottomEdge - margin));
        }

        setCategoryLinkPanelPosition({ left: nextLeft, top: nextTop });
        setCategoryLinkPanelSize({ width: nextWidth, height: nextHeight });
        return;
      }

      const dragState = categoryLinkPanelDragStateRef.current;
      if (!dragState) return;
      event.preventDefault();
      setCategoryLinkPanelPosition(
        clampPanelPosition({
          left: event.clientX - dragState.offsetX,
          top: event.clientY - dragState.offsetY,
        }),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const resizeState = categoryLinkPanelResizeStateRef.current;
      if (resizeState && resizeState.pointerId === event.pointerId) {
        const resizeStart = categoryLinkPanelGuideResizeStartRef.current;
        const nextSize = categoryLinkPanelSizeRef.current ?? {
          width: resizeState.startWidth,
          height: resizeState.startHeight,
        };
        categoryLinkPanelResizeStateRef.current = null;
        categoryLinkPanelGuideResizeStartRef.current = null;
        setIsCategoryLinkPanelResizing(false);
        if (resizeStart) {
          const deltaWidth = nextSize.width - resizeStart.width;
          const deltaHeight = nextSize.height - resizeStart.height;
          if (Math.hypot(deltaWidth, deltaHeight) >= 12) {
            completeGuideStepAction(workspaceId, "people-category-link-resize");
          }
        }
      }

      const dragState = categoryLinkPanelDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const moveStart = categoryLinkPanelGuideMoveStartRef.current;
      const nextPosition = categoryLinkPanelPositionRef.current ?? categoryLinkPanelPosition ?? moveStart;
      categoryLinkPanelDragStateRef.current = null;
      categoryLinkPanelGuideMoveStartRef.current = null;
      if (moveStart && nextPosition) {
        const deltaX = nextPosition.left - moveStart.left;
        const deltaY = nextPosition.top - moveStart.top;
        if (Math.hypot(deltaX, deltaY) >= 8) {
          completeGuideStepAction(workspaceId, "people-category-link-move");
        }
      }
      setIsCategoryLinkPanelDragging(false);
    };

    const handleResize = () => {
      const nextSize = clampCategoryLinkPanelSize(getCurrentPanelSize());
      setCategoryLinkPanelSize(nextSize);
      setCategoryLinkPanelPosition((current) => clampPanelPosition(current ?? getDefaultCategoryLinkPanelPosition(nextSize), nextSize));
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("resize", handleResize);
      categoryLinkPanelDragStateRef.current = null;
      categoryLinkPanelResizeStateRef.current = null;
      categoryLinkPanelGuideMoveStartRef.current = null;
      categoryLinkPanelGuideResizeStartRef.current = null;
      setIsCategoryLinkPanelDragging(false);
      setIsCategoryLinkPanelResizing(false);
    };
  }, [shouldRenderCategoryLinkPanel, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGuideHighlightChange = (event: Event) => {
      const detail = (event as CustomEvent<{ selector?: string | null; stepId?: string | null }>).detail;
      const selector = detail?.selector ?? null;
      const stepId = detail?.stepId ?? null;

      if (stepId && HIDDEN_GUIDE_STEP_IDS.has(stepId)) {
        setIsHiddenPanelOpen(true);
        setIsCategoryLinkPanelOpen(false);
        return;
      }

      if (stepId && CATEGORY_LINK_GUIDE_STEP_IDS.has(stepId)) {
        setIsCategoryLinkPanelOpen(true);
        setIsHiddenPanelOpen(false);
        return;
      }

      if (!selector) return;

      if (HIDDEN_GUIDE_SELECTORS.has(selector)) {
        setIsHiddenPanelOpen(true);
        setIsCategoryLinkPanelOpen(false);
        return;
      }

      if (CATEGORY_LINK_GUIDE_SELECTORS.has(selector)) {
        setIsCategoryLinkPanelOpen(true);
        setIsHiddenPanelOpen(false);
        return;
      }

      setIsHiddenPanelOpen(false);
      setIsCategoryLinkPanelOpen(false);
    };

    window.addEventListener(GUIDE_HIGHLIGHT_CHANGE_EVENT, handleGuideHighlightChange as EventListener);
    return () => window.removeEventListener(GUIDE_HIGHLIGHT_CHANGE_EVENT, handleGuideHighlightChange as EventListener);
  }, []);

  useEffect(() => {
    if (dragItem && !isCategoryConnectionDragItem(dragItem)) {
      if (dragOverlayTimeoutRef.current) {
        window.clearTimeout(dragOverlayTimeoutRef.current);
        dragOverlayTimeoutRef.current = null;
      }
      if (dragOverlayEnterTimeoutRef.current) {
        window.clearTimeout(dragOverlayEnterTimeoutRef.current);
        dragOverlayEnterTimeoutRef.current = null;
      }
      setIsDragOverlayVisible(true);
      setIsDragOverlayActive(false);
      dragOverlayEnterTimeoutRef.current = window.setTimeout(() => {
        setIsDragOverlayActive(true);
        dragOverlayEnterTimeoutRef.current = null;
      }, 32);
      return;
    }

    setIsDragOverlayActive(false);
    setIsDragOverlayVisible(false);
    setActiveCardLinkTargetId(null);
    setActiveCategoryLinkTargetId(null);
    setIsCategoryLinkResetZoneActive(false);
    dragOverlayTimeoutRef.current = window.setTimeout(() => {
      setIsDragOverlayVisible(false);
      dragOverlayTimeoutRef.current = null;
    }, 540);

    return () => {
      if (dragOverlayTimeoutRef.current) {
        window.clearTimeout(dragOverlayTimeoutRef.current);
        dragOverlayTimeoutRef.current = null;
      }
      if (dragOverlayEnterTimeoutRef.current) {
        window.clearTimeout(dragOverlayEnterTimeoutRef.current);
        dragOverlayEnterTimeoutRef.current = null;
      }
    };
  }, [dragItem]);

  useEffect(() => {
    if (!dragItem || !dragGhostRef.current) return;

    const handleDragOver = (event: DragEvent) => {
      if (!dragGhostRef.current) return;
      dragGhostRef.current.style.left = `${event.clientX - dragGhostOffsetRef.current.x}px`;
      dragGhostRef.current.style.top = `${event.clientY - dragGhostOffsetRef.current.y}px`;
    };

    window.addEventListener("dragover", handleDragOver, true);
    return () => window.removeEventListener("dragover", handleDragOver, true);
  }, [dragItem]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    dragGhostRef.current.classList.toggle("is-drop-target-hide", activeDropZone === "hide");
    dragGhostRef.current.classList.toggle("is-drop-target-delete", activeDropZone === "delete");
  }, [activeDropZone]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    const isAccountLinkReady = dragItem?.itemType === "account" && Boolean(activeCardLinkTargetId);
    const isCategoryLinkReady =
      isCategoryConnectionDragItem(dragItem) && (Boolean(activeCategoryLinkTargetId) || isCategoryLinkResetZoneActive);
    const linkMessage = isAccountLinkReady ? activeCardLinkMessage : isCategoryLinkReady ? activeCategoryLinkMessage : "";

    dragGhostRef.current.classList.toggle("is-account-link-ready", isAccountLinkReady);
    dragGhostRef.current.classList.toggle("is-category-link-ready", isCategoryLinkReady);

    if (linkMessage) {
      dragGhostRef.current.setAttribute("data-link-message", linkMessage);
    } else {
      dragGhostRef.current.removeAttribute("data-link-message");
    }
  }, [activeCardLinkMessage, activeCardLinkTargetId, activeCategoryLinkMessage, activeCategoryLinkTargetId, dragItem]);

  useEffect(() => {
    return () => {
      if (linkedAccountFlashTimeoutRef.current) {
        window.clearTimeout(linkedAccountFlashTimeoutRef.current);
        linkedAccountFlashTimeoutRef.current = null;
      }
    };
  }, []);

  const resetDragState = () => {
    if (pendingGuideDragTransactionRef.current && !pendingGuideDragTransactionRef.current.completed) {
      revertGuideStepAction(workspaceId, pendingGuideDragTransactionRef.current.pickStepId);
    }
    pendingGuideDragTransactionRef.current = null;
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
    setDragItem(null);
    setActiveDropZone(null);
    setActiveCardLinkTargetId(null);
    setActiveCategoryLinkTargetId(null);
    setIsCategoryLinkResetZoneActive(false);
  };

  const startGuideDragTransaction = (pickStepId: PendingGuideDragTransaction["pickStepId"]) => {
    completeGuideStepAction(workspaceId, pickStepId);
    pendingGuideDragTransactionRef.current = { pickStepId, completed: false };
  };

  const completeGuideDragTransaction = (dropStepId: string) => {
    if (pendingGuideDragTransactionRef.current) {
      pendingGuideDragTransactionRef.current.completed = true;
    }
    completeGuideStepAction(workspaceId, dropStepId);
  };

  const applyHiddenState = (item: DragItem, isHidden: boolean) => {
    if (item.itemType === "person") {
      updatePerson(workspaceId, item.id, { isHidden });
      return;
    }
    if (item.itemType === "account") {
      updateAccount(workspaceId, item.id, { isHidden });
      return;
    }
    updateCard(workspaceId, item.id, { isHidden });
  };

  const requestDeleteItem = (item: DragItem) => {
    if (item.itemType === "categoryLink" || item.itemType === "categoryGroupLink") return;
    setPendingDeleteItem({ itemType: item.itemType, id: item.id });
  };

  const handleCategoryLinkPanelPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const panelRect = categoryLinkPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;

    categoryLinkPanelDragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    categoryLinkPanelGuideMoveStartRef.current = { left: panelRect.left, top: panelRect.top };
    categoryLinkPanelPositionRef.current = { left: panelRect.left, top: panelRect.top };
    setIsCategoryLinkPanelDragging(true);
    event.preventDefault();
  };

  const handleCategoryLinkPanelResizePointerDown = (
    direction: CategoryLinkPanelResizeDirection,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const panelRect = categoryLinkPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;

    categoryLinkPanelDragStateRef.current = null;
    categoryLinkPanelResizeStateRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelRect.width,
      startHeight: panelRect.height,
      startLeft: panelRect.left,
      startTop: panelRect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    categoryLinkPanelGuideResizeStartRef.current = {
      width: panelRect.width,
      height: panelRect.height,
    };
    setCategoryLinkPanelPosition({ left: panelRect.left, top: panelRect.top });
    setCategoryLinkPanelSize({ width: panelRect.width, height: panelRect.height });
    setIsCategoryLinkPanelDragging(false);
    setIsCategoryLinkPanelResizing(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const startDrag = (item: DragItem, event: React.DragEvent<HTMLElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const sourceElement = event.currentTarget as HTMLElement;
    const dragImage = getTransparentDragImage();
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, 0, 0);
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }

    const sourceRect = sourceElement.getBoundingClientRect();
    dragGhostOffsetRef.current = {
      x: event.clientX - sourceRect.left,
      y: event.clientY - sourceRect.top,
    };

    const ghostElement = sourceElement.cloneNode(true) as HTMLElement;
    ghostElement.classList.add("category-drag-ghost");
    if (typeof window !== "undefined") {
      const computedColumns = window.getComputedStyle(sourceElement).getPropertyValue("--people-category-link-columns").trim();
      if (computedColumns) {
        ghostElement.style.setProperty("--people-category-link-columns", computedColumns);
      }
    }
    ghostElement.style.position = "fixed";
    ghostElement.style.left = `${event.clientX - dragGhostOffsetRef.current.x}px`;
    ghostElement.style.top = `${event.clientY - dragGhostOffsetRef.current.y}px`;
    ghostElement.style.width = `${sourceRect.width}px`;
    ghostElement.style.minWidth = `${sourceRect.width}px`;
    ghostElement.style.maxWidth = `${sourceRect.width}px`;
    ghostElement.style.pointerEvents = "none";
    ghostElement.style.margin = "0";
    ghostElement.style.opacity = "1";
    ghostElement.style.transform = "none";
    ghostElement.style.filter = "none";
    ghostElement.style.zIndex = "9999";
    ghostElement.style.backdropFilter = "none";
    ghostElement.style.contentVisibility = "visible";
    ghostElement.style.contain = "none";
    ghostElement.style.containIntrinsicSize = "auto";
    document.body.appendChild(ghostElement);
    dragGhostRef.current = ghostElement;

    setDragItem(item);
  };

  const handlePersonDrop = (event: React.DragEvent<HTMLElement>, personIndex: number) => {
    if (!dragItem || dragItem.itemType !== "person") return;
    event.preventDefault();
    const targetIndex = getInsertIndexByVerticalPointer(event, personIndex);
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    movePerson(workspaceId, dragItem.id, targetIndex);
    resetDragState();
  };

  const handlePersonAppendDrop = (event: React.DragEvent<HTMLElement>, itemCount: number) => {
    if (!dragItem || dragItem.itemType !== "person") return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    movePerson(workspaceId, dragItem.id, itemCount);
    resetDragState();
  };

  const handleAccountDrop = (event: React.DragEvent<HTMLElement>, ownerPersonId: string, accountIndex: number) => {
    if (!dragItem || dragItem.itemType !== "account" || dragItem.ownerPersonId !== ownerPersonId) return;
    event.preventDefault();
    event.stopPropagation();
    const targetIndex = getInsertIndexByHorizontalPointer(event, accountIndex);
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    moveAccount(workspaceId, dragItem.id, ownerPersonId, targetIndex);
    resetDragState();
  };

  const handleAccountAppendDrop = (event: React.DragEvent<HTMLElement>, ownerPersonId: string, itemCount: number) => {
    if (!dragItem || dragItem.itemType !== "account" || dragItem.ownerPersonId !== ownerPersonId) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    moveAccount(workspaceId, dragItem.id, ownerPersonId, itemCount);
    resetDragState();
  };

  const handleCardDrop = (event: React.DragEvent<HTMLElement>, ownerPersonId: string, cardIndex: number) => {
    if (!dragItem || dragItem.itemType !== "card" || dragItem.ownerPersonId !== ownerPersonId) return;
    event.preventDefault();
    event.stopPropagation();
    const targetIndex = getInsertIndexByHorizontalPointer(event, cardIndex);
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    moveCard(workspaceId, dragItem.id, ownerPersonId, targetIndex);
    resetDragState();
  };

  const handleCardAppendDrop = (event: React.DragEvent<HTMLElement>, ownerPersonId: string, itemCount: number) => {
    if (!dragItem || dragItem.itemType !== "card" || dragItem.ownerPersonId !== ownerPersonId) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    moveCard(workspaceId, dragItem.id, ownerPersonId, itemCount);
    resetDragState();
  };

  const handleAccountLinkDrop = (event: React.DragEvent<HTMLElement>, cardId: string, ownerPersonId: string) => {
    if (!dragItem || dragItem.itemType !== "account" || dragItem.ownerPersonId !== ownerPersonId) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragItem.isHidden) {
      applyHiddenState(dragItem, false);
      completeGuideDragTransaction("people-hidden-restore-drop");
    }
    updateCard(workspaceId, cardId, { linkedAccountId: dragItem.id });
    linkedAccountFlashSequenceRef.current += 1;
    const nextSequence = linkedAccountFlashSequenceRef.current;
    setLinkedAccountFlash({ cardId, sequence: nextSequence });
    if (linkedAccountFlashTimeoutRef.current) {
      window.clearTimeout(linkedAccountFlashTimeoutRef.current);
    }
    linkedAccountFlashTimeoutRef.current = window.setTimeout(() => {
      setLinkedAccountFlash((current) => (current?.cardId === cardId && current.sequence === nextSequence ? null : current));
      linkedAccountFlashTimeoutRef.current = null;
    }, 2000);
    resetDragState();
  };

  const getDraggedCategories = (item: Extract<DragItem, { itemType: "categoryLink" | "categoryGroupLink" }>) =>
    item.itemType === "categoryLink"
      ? visibleLeafCategories.filter((category) => category.id === item.id)
      : visibleLeafCategories.filter((category) => item.categoryIds.includes(category.id));

  const handleCategoryLinkDrop = (event: React.DragEvent<HTMLElement>, accountId: string) => {
    if (!dragItem || !isCategoryConnectionDragItem(dragItem)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsCategoryLinkResetZoneActive(false);
    const targetCategories = getDraggedCategories(dragItem);

    if (!targetCategories.length) {
      resetDragState();
      return;
    }

    targetCategories.forEach((category) => {
      if (category.linkedAccountId !== accountId) {
        updateCategory(workspaceId, category.id, { linkedAccountId: accountId });
      }
    });
    completeGuideDragTransaction("people-category-link-drop");
    resetDragState();
  };

  const handleCategoryLinkResetDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!dragItem || !isCategoryConnectionDragItem(dragItem)) return;
    event.preventDefault();
    event.stopPropagation();
    const targetCategories = getDraggedCategories(dragItem);

    targetCategories.forEach((category) => {
      if (category.linkedAccountId) {
        updateCategory(workspaceId, category.id, { linkedAccountId: null });
      }
    });

    resetDragState();
  };

  const getDragStateClassName = (id: string) =>
    `${dragItem?.id === id ? " is-dragging" : ""}${dragItem?.id === id && activeDropZone === "hide" ? " is-drop-target-hide" : ""}${
      dragItem?.id === id && activeDropZone === "delete" ? " is-drop-target-delete" : ""
    }`;

  const openPersonAccountModal = (personId: string) => {
    setAccountOwnerPersonId(personId);
    setAccountDraft(createAccountDraftForPerson(personId));
  };

  const closePersonAccountModal = () => {
    setAccountOwnerPersonId(null);
    setAccountDraft(EMPTY_PERSON_ACCOUNT_DRAFT);
  };

  const patchAccountDraft = (
    patch: Partial<PersonAccountDraftState>,
    setter: Dispatch<SetStateAction<PersonAccountDraftState>>,
    fallbackOwnerPersonId?: string | null,
  ) => {
    setter((current) => {
      const next = { ...current, ...patch };
      if (!next.ownerPersonId && fallbackOwnerPersonId) next.ownerPersonId = fallbackOwnerPersonId;
      if (!next.primaryPersonId) next.primaryPersonId = next.ownerPersonId || fallbackOwnerPersonId || "";
      const isMeeting = next.accountGroupType === "meeting";
      if (isMeeting) {
        next.isShared = true;
        next.usageType = "shared";
        next.ownerPersonId = next.primaryPersonId;
        next.participantPersonIds = Array.from(new Set([...next.participantPersonIds, ...(next.primaryPersonId ? [next.primaryPersonId] : [])]));
      } else {
        next.isShared = false;
        next.ownerPersonId = next.primaryPersonId || next.ownerPersonId;
        next.participantPersonIds = next.primaryPersonId ? [next.primaryPersonId] : [];
        if (next.usageType === "shared") next.usageType = "other";
      }
      return next;
    });
  };

  const accountOwner = accountOwnerPersonId ? people.find((person) => person.id === accountOwnerPersonId) ?? null : null;
  const pendingDeletePerson = pendingDeleteItem?.itemType === "person" ? scope.people.find((person) => person.id === pendingDeleteItem.id) ?? null : null;
  const pendingDeleteAccount = pendingDeleteItem?.itemType === "account" ? scope.accounts.find((account) => account.id === pendingDeleteItem.id) ?? null : null;
  const pendingDeleteCard = pendingDeleteItem?.itemType === "card" ? scope.cards.find((card) => card.id === pendingDeleteItem.id) ?? null : null;
  const embeddedSections = people.map((person) => ({
    id: person.id,
    title: person.displayName || person.name,
    subtitle: person.name !== person.displayName ? person.name : getPersonRoleLabel(person.role),
    person,
    usage: getPersonUsageSummary(transactions, person.id),
    linkedAccounts: accountsByPersonId.get(person.id) ?? [],
    linkedCards: cardsByPersonId.get(person.id) ?? [],
  }));
  const embeddedPeopleSection = (
    <>
      <BoardCase
        embedded={embedded}
        data-guide-target="people-page-overview"
        title="자산 설정"
        description="사용자별 계좌와 카드를 같은 보드 형식에서 관리합니다."
        actions={
          <>
            <button
              type="button"
              className={`board-case-action-button${isCategoryLinkPanelOpen ? " is-active is-strong" : ""}`}
              data-guide-target="people-category-link-toggle"
              onClick={() => {
                setIsCategoryLinkPanelOpen(true);
                setIsHiddenPanelOpen(false);
                completeGuideStepAction(workspaceId, "people-category-link-toggle");
              }}
            >
              카테고리 연결
            </button>
            <button
              type="button"
              className={`board-case-action-button${isHiddenPanelOpen ? " is-active" : ""}`}
              data-guide-target="people-hidden-toggle"
              onClick={() => {
                setIsHiddenPanelOpen((current) => !current);
                completeGuideStepAction(workspaceId, "people-hidden-assets");
              }}
            >
              숨김 {hiddenPeople.length + hiddenAccounts.length + hiddenCards.length}
            </button>
          </>
        }
    >
      {!embeddedSections.length ? (
        <EmptyStateCallout
          kicker="첫 단계"
          title="입력과 업로드에 연결할 사용자를 먼저 등록해주세요"
          description="사용자가 정리되어 있어야 계좌와 카드 관리가 자연스럽게 이어집니다."
        />
      ) : (
        <div
          className="board-case-stack"
          data-guide-target="people-restore-drop"
          onDragOver={(event) => {
            if (dragItem?.itemType !== "person") return;
            event.preventDefault();
          }}
          onDrop={(event) => handlePersonAppendDrop(event, embeddedSections.length)}
        >
          {embeddedSections.map((section, index) => {
            const isInlineEditing = inlineEditingPersonId === section.person.id;
            return (
              <section
                key={section.id}
                className={`board-case-section category-case-section people-case-section${getDragStateClassName(section.id)}`}
                data-guide-target="people-visible-asset-card"
                style={getMotionStyle(index + 2)}
                draggable={!isInlineEditing}
                onDragStart={(event) => {
                  startGuideDragTransaction("people-hidden-hide-pick");
                  startDrag({ id: section.person.id, itemType: "person", ownerPersonId: null, isHidden: false }, event);
                }}
                onDragEnd={resetDragState}
                onDragOver={(event) => {
                  if (dragItem?.itemType !== "person") return;
                  event.preventDefault();
                }}
                onDrop={(event) => handlePersonDrop(event, index)}
              >
                <div className="board-case-section-head">
                  <div className="board-case-section-title-row">
                    <div className="people-section-heading">
                      {isInlineEditing ? (
                        <input
                          className="board-case-title-input"
                          value={inlinePersonName}
                          onChange={(event) => setInlinePersonName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitInlinePersonEdit(section.person);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              stopInlinePersonEdit();
                            }
                          }}
                          onBlur={() => submitInlinePersonEdit(section.person)}
                          aria-label={`${section.title} 사용자 이름`}
                          autoFocus
                        />
                      ) : (
                        <h3>{section.title}</h3>
                      )}
                      <span className="people-role-pill">{getPersonRoleLabel(section.person.role)}</span>
                    </div>
                    <div className="board-case-section-action">
                      <button
                        type="button"
                        className="board-case-edit-button"
                        onMouseDown={isInlineEditing ? (event) => event.preventDefault() : undefined}
                        onClick={() => {
                          if (isInlineEditing) {
                            submitInlinePersonEdit(section.person);
                            return;
                          }
                          startInlinePersonEdit(section.person);
                        }}
                        aria-label={isInlineEditing ? `${section.title} 사용자 이름 저장` : `${section.title} 사용자 이름 수정`}
                      >
                        {isInlineEditing ? "✓" : "✎"}
                      </button>
                    </div>
                  </div>
                  <p>{`계좌 ${section.linkedAccounts.length}개 · 카드 ${section.linkedCards.length}개`}</p>
                </div>
                <div className="board-case-section-body">
                <div className="people-subboard" data-guide-target="people-accounts-board">
                  <div className="people-subboard-head">
                    <div>
                      <span className="section-kicker">사용자 하위 자산</span>
                      <h4>계좌</h4>
                    </div>
                  </div>
                  <div
                    className="category-case-grid"
                    onDragOver={(event) => {
                      if (isCategoryConnectionDragItem(dragItem)) {
                        event.preventDefault();
                        setIsCategoryLinkResetZoneActive(false);
                        if (event.target === event.currentTarget) setActiveCategoryLinkTargetId(null);
                        return;
                      }
                      if (dragItem?.itemType !== "account" || dragItem.ownerPersonId !== section.person.id) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (isCategoryConnectionDragItem(dragItem)) {
                        event.preventDefault();
                        setActiveCategoryLinkTargetId(null);
                        setIsCategoryLinkResetZoneActive(false);
                        return;
                      }
                      handleAccountAppendDrop(event, section.person.id, section.linkedAccounts.length);
                    }}
                  >
                    {section.linkedAccounts.map((account) => {
                      const usageLabel =
                        ACCOUNT_USAGE_OPTIONS.find((option) => option.value === getVisibleAccountUsageType(account.usageType, account.isShared))?.label ??
                        "기타";
                      const linkedCategories = linkedCategoriesByAccountId.get(account.id) ?? [];
                      const isActiveCategoryLinkTarget = activeCategoryLinkTargetId === account.id && isCategoryConnectionDragItem(dragItem);
                      const isMeeting = isMeetingAccount(account);
                      const isPrimaryMeetingOwner = isMeeting && (account.primaryPersonId ?? account.ownerPersonId) === section.person.id;
                      const participantNames = (account.participantPersonIds ?? [])
                        .map((personId) => personNameMap.get(personId) ?? null)
                        .filter((value): value is string => Boolean(value));
                      const accountRoleLabel = isMeeting ? (isPrimaryMeetingOwner ? "메인 사용자" : "서브 사용자") : null;
                       return (
                        <article
                          key={account.id}
                          className={`category-case-card people-board-card${
                            isMeeting ? " is-meeting-account" : ""
                          }${
                            isCategoryConnectionDragItem(dragItem) ? " is-category-link-target" : ""
                          }${isActiveCategoryLinkTarget ? " is-category-link-active" : ""}${getDragStateClassName(account.id)}`}
                          data-guide-target={
                            account.id === guideCategoryLinkAccountId
                              ? "people-category-link-account-card"
                              : "people-visible-asset-card"
                          }
                          data-guide-category-link-account-drop="true"
                          draggable={!isMeeting || isPrimaryMeetingOwner}
                          onDragStart={(event) => {
                            startGuideDragTransaction("people-hidden-hide-pick");
                            startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: false }, event);
                          }}
                          onDragEnd={resetDragState}
                          onDragEnter={() => {
                            if (!isCategoryConnectionDragItem(dragItem)) return;
                            setIsCategoryLinkResetZoneActive(false);
                            setActiveCategoryLinkTargetId(account.id);
                          }}
                          onDragOver={(event) => {
                            if (isCategoryConnectionDragItem(dragItem)) {
                              event.preventDefault();
                              event.stopPropagation();
                              setIsCategoryLinkResetZoneActive(false);
                              setActiveCategoryLinkTargetId(account.id);
                              return;
                            }
                            if (dragItem?.itemType !== "account" || dragItem.ownerPersonId !== section.person.id) return;
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragLeave={() => {
                            if (activeCategoryLinkTargetId !== account.id) return;
                            setActiveCategoryLinkTargetId((current) => (current === account.id ? null : current));
                          }}
                          onDrop={(event) => {
                            if (isCategoryConnectionDragItem(dragItem)) {
                              handleCategoryLinkDrop(event, account.id);
                              return;
                            }
                            handleAccountDrop(event, section.person.id, section.linkedAccounts.indexOf(account));
                          }}
                        >
                        <button
                          type="button"
                          className="board-case-edit-button category-case-card-edit"
                          onClick={() => {
                            setEditingAccountId(account.id);
                            setEditAccountDraft(createDraftFromAccount(account));
                          }}
                          aria-label={`${account.alias || account.name} 계좌 수정`}
                        >
                          ✎
                        </button>
                          <div className="category-case-card-copy people-board-card-copy">
                            <strong>{account.alias || account.name}</strong>
                            <span>{account.institutionName || "직접 입력"}</span>
                            {isMeeting ? (
                              <span className="people-meeting-account-meta">
                                참여 {participantNames.length}명{accountRoleLabel ? ` · ${accountRoleLabel}` : ""}
                              </span>
                            ) : null}
                            <span>{account.accountNumberMasked || "계좌번호 미입력"}</span>
                            {isMeeting && participantNames.length ? (
                              <span className="people-meeting-account-participants">{participantNames.join(" · ")}</span>
                            ) : null}
                            <div className="people-linked-category-block">
                              <span className={`people-linked-category-count${linkedCategories.length ? "" : " is-empty"}`}>
                                {linkedCategories.length ? `카테고리 ${linkedCategories.length}개` : "카테고리 없음"}
                              </span>
                            </div>
                           </div>
                          <div className={`category-case-pill${isMeeting ? " people-meeting-account-pill" : ""}`}>
                            {isMeeting ? "모임통장" : usageLabel}
                          </div>
                        </article>
                      );
                    })}
                   <button
                     type="button"
                     className="category-case-add-card people-board-add-card"
                     onClick={() => openPersonAccountModal(section.person.id)}
                     aria-label={`${section.title} 계좌 추가`}
                   >
                    <span className="category-case-add-plus">+</span>
                    <strong>계좌 추가</strong>
                  </button>
                  </div>
                </div>

                <div className="people-subboard">
                  <div className="people-subboard-head">
                    <div>
                      <span className="section-kicker">업로드 기반 자산</span>
                      <h4>카드</h4>
                    </div>
                  </div>
                  <div
                    className="category-case-grid"
                    data-guide-target="people-card-linking"
                    onDragOver={(event) => {
                      if (!dragItem || dragItem.ownerPersonId !== section.person.id) return;
                      if (dragItem.itemType === "account") {
                        event.preventDefault();
                        if (event.target === event.currentTarget) setActiveCardLinkTargetId(null);
                        return;
                      }
                      if (dragItem.itemType !== "card") return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => handleCardAppendDrop(event, section.person.id, section.linkedCards.length)}
                  >
                    {section.linkedCards.map((card) => {
                      const cardAccountLabel = getCardAccountLabel(card.cardType);
                      const linkedAccountName = card.linkedAccountId ? accountNameMap.get(card.linkedAccountId) ?? "없음" : "없음";
                      const cardIdentifier = getVisibleCardIdentifier(card.cardNumberMasked);
                      const isActiveCardLinkTarget = activeCardLinkTargetId === card.id && dragItem?.itemType === "account";
                      const isLinkedAccountFlashing = linkedAccountFlash?.cardId === card.id;
                      const linkedAccountFlashKey = isLinkedAccountFlashing ? linkedAccountFlash.sequence : 0;
                        return (
                        <article
                          key={card.id}
                          className={`category-case-card people-board-card${
                            dragItem?.itemType === "account" && dragItem.ownerPersonId === section.person.id ? " is-account-link-target" : ""
                          }${isActiveCardLinkTarget ? " is-account-link-active" : ""}${getDragStateClassName(card.id)}`}
                          data-guide-target={card.id === guideHideTargetCardId ? "people-hide-guide-card" : "people-visible-asset-card"}
                          draggable
                          onDragStart={(event) => {
                            startGuideDragTransaction("people-hidden-hide-pick");
                            startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: false }, event);
                          }}
                          onDragEnd={resetDragState}
                          onDragEnter={() => {
                            if (dragItem?.itemType !== "account" || dragItem.ownerPersonId !== section.person.id) return;
                            setActiveCardLinkTargetId(card.id);
                          }}
                          onDragOver={(event) => {
                            if (
                              !dragItem ||
                              (dragItem.itemType !== "card" && dragItem.itemType !== "account") ||
                              dragItem.ownerPersonId !== section.person.id
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            if (dragItem.itemType === "account") {
                              setActiveCardLinkTargetId(card.id);
                            }
                          }}
                          onDragLeave={() => {
                            if (activeCardLinkTargetId !== card.id) return;
                            setActiveCardLinkTargetId((current) => (current === card.id ? null : current));
                          }}
                          onDrop={(event) => {
                            if (dragItem?.itemType === "account") {
                              handleAccountLinkDrop(event, card.id, section.person.id);
                              return;
                            }
                            handleCardDrop(event, section.person.id, section.linkedCards.indexOf(card));
                          }}
                        >
                        <button
                          type="button"
                          className="board-case-edit-button category-case-card-edit"
                          onClick={() => {
                            setEditingCardId(card.id);
                            setEditCardDraft(createDraftFromCard(card));
                          }}
                          aria-label={`${card.name} 카드 수정`}
                        >
                          ✎
                        </button>
                        <div className="category-case-card-copy people-board-card-copy">
                          <strong>{card.name}</strong>
                          <span>{`${card.issuerName || "카드사 미확인"}${cardIdentifier ? ` (${cardIdentifier})` : ""}`}</span>
                          <span className="people-linked-account-row">
                            <span
                              key={`${card.id}-${linkedAccountFlashKey}`}
                              className={`people-linked-account-line${isLinkedAccountFlashing ? " is-flashing" : ""}`}
                            >
                              <span className="people-linked-account-label">{cardAccountLabel}</span>
                              <span className="people-linked-account-value">{linkedAccountName}</span>
                            </span>
                            {isLinkedAccountFlashing ? <span className="people-linked-account-status">연결됨</span> : null}
                          </span>
                        </div>
                        <div className="category-case-pill">
                          {CARD_TYPE_OPTIONS.find((option) => option.value === card.cardType)?.label ?? "기타"}
                        </div>
                      </article>
                    );
                  })}
                  {!section.linkedCards.length ? (
                    <article className="category-case-add-card people-board-empty-card">
                      <strong>아직 연결된 카드가 없습니다</strong>
                      <span>카드 명세서를 업로드하면 자동 생성되고 여기서 소유자와 결제 계좌를 조정할 수 있습니다.</span>
                    </article>
                  ) : null}
                </div>
              </div>

                   {section.person.memo ? <div className="compact-note">{section.person.memo}</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="category-case-group-add"
        onClick={createPersonSection}
      >
        <span>+</span>
        <strong>새 사용자 추가</strong>
      </button>
    </BoardCase>

    {isHiddenPanelOpen ? (
        <aside className="category-hidden-panel" data-guide-target="people-hidden-panel">
        <div className="category-hidden-panel-head">
          <div>
            <span className="section-kicker">숨김 보관함</span>
            <h3>숨긴 사용자 자산</h3>
          </div>
          <button type="button" className="board-case-edit-button" onClick={() => setIsHiddenPanelOpen(false)} aria-label="숨김 패널 닫기">
            ×
          </button>
        </div>
        <p className="text-secondary mb-3">원래 사용자 보드로 다시 드래그하면 복원됩니다.</p>

        {hiddenPeople.length ? (
          <div className="category-hidden-list mb-3">
            {hiddenPeople.map((person) => (
              <article
                key={person.id}
                className={`category-hidden-card${getDragStateClassName(person.id)}`}
                data-guide-target={person.id === guideHiddenRestoreCardId ? "people-hidden-guide-card" : "people-hidden-card"}
                draggable
                onDragStart={(event) => {
                  startGuideDragTransaction("people-hidden-restore-pick");
                  startDrag({ id: person.id, itemType: "person", ownerPersonId: null, isHidden: true }, event);
                }}
                onDragEnd={resetDragState}
              >
                <strong>{person.displayName || person.name}</strong>
                <span>사용자</span>
              </article>
            ))}
          </div>
        ) : null}

        {hiddenAccounts.length ? (
          <div className="category-hidden-list mb-3">
            {hiddenAccounts.map((account) => (
              <article
                key={account.id}
                className={`category-hidden-card${getDragStateClassName(account.id)}`}
                data-guide-target={account.id === guideHiddenRestoreCardId ? "people-hidden-guide-card" : "people-hidden-card"}
                draggable
                onDragStart={(event) => {
                  startGuideDragTransaction("people-hidden-restore-pick");
                  startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: true }, event);
                }}
                onDragEnd={resetDragState}
              >
                <strong>{account.alias || account.name}</strong>
                <span>계좌 · {account.ownerPersonId ? personNameMap.get(account.ownerPersonId) ?? "사용자 없음" : "소유자 없음"}</span>
              </article>
            ))}
          </div>
        ) : null}

        {hiddenCards.length ? (
          <div className="category-hidden-list">
            {hiddenCards.map((card) => (
              <article
                key={card.id}
                className={`category-hidden-card${getDragStateClassName(card.id)}`}
                data-guide-target={card.id === guideHiddenRestoreCardId ? "people-hidden-guide-card" : "people-hidden-card"}
                draggable
                onDragStart={(event) => {
                  startGuideDragTransaction("people-hidden-restore-pick");
                  startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: true }, event);
                }}
                onDragEnd={resetDragState}
              >
                <strong>{card.name}</strong>
                <span>카드 · {card.ownerPersonId ? personNameMap.get(card.ownerPersonId) ?? "사용자 없음" : "소유자 없음"}</span>
              </article>
            ))}
          </div>
        ) : null}

        {!hiddenPeople.length && !hiddenAccounts.length && !hiddenCards.length ? <p className="text-secondary mb-0">숨긴 항목이 없습니다.</p> : null}
      </aside>
    ) : null}

    {shouldRenderCategoryLinkPanel && typeof document !== "undefined"
      ? createPortal(
          <>
            <aside
              ref={categoryLinkPanelRef}
              className={`people-category-link-panel${isCategoryLinkPanelDragging ? " is-dragging" : ""}${
                isCategoryLinkPanelResizing ? " is-resizing" : ""
              }`}
              data-guide-target="people-category-link-panel"
              style={
                categoryLinkPanelPosition || categoryLinkPanelSize
                  ? {
                      left: `${(categoryLinkPanelPosition ?? getDefaultCategoryLinkPanelPosition(categoryLinkPanelSize ?? getDefaultCategoryLinkPanelSize())).left}px`,
                      top: `${(categoryLinkPanelPosition ?? getDefaultCategoryLinkPanelPosition(categoryLinkPanelSize ?? getDefaultCategoryLinkPanelSize())).top}px`,
                      right: "auto",
                      width: categoryLinkPanelSize ? `${categoryLinkPanelSize.width}px` : undefined,
                      height: categoryLinkPanelSize ? `${categoryLinkPanelSize.height}px` : undefined,
                    }
                  : undefined
              }
              aria-labelledby="peopleCategoryLinkTitle"
            >
            <div
              className="people-category-link-panel-head"
              data-guide-target="people-category-link-panel-head"
              onPointerDown={handleCategoryLinkPanelPointerDown}
            >
              <div>
                <span className="section-kicker">정산 소스 계좌</span>
                <h3 id="peopleCategoryLinkTitle">카테고리 연결</h3>
                <span className="people-category-link-panel-drag-hint">헤더는 이동, 테두리와 모서리는 크기 조절</span>
              </div>
              <div className="people-category-link-panel-actions">
                {isCategoryConnectionDragItem(dragItem) ? (
                  <div
                    className={`people-category-link-reset-zone is-ready${isCategoryLinkResetZoneActive ? " is-active" : ""}`}
                    onDragOver={(event) => {
                      if (!isCategoryConnectionDragItem(dragItem)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setActiveCategoryLinkTargetId(null);
                      setIsCategoryLinkResetZoneActive(true);
                    }}
                    onDragLeave={() => setIsCategoryLinkResetZoneActive(false)}
                    onDrop={handleCategoryLinkResetDrop}
                  >
                    <span className="people-category-link-reset-label">
                      <span className="people-category-link-reset-icon" aria-hidden="true">
                        ⛓️‍💥
                      </span>
                      연결해제
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="board-case-edit-button"
                  onClick={() => setIsCategoryLinkPanelOpen(false)}
                  aria-label="카테고리 연결 패널 닫기"
                >
                  ×
                </button>
              </div>
            </div>
              <div ref={categoryLinkPanelScrollRef} className="people-category-link-panel-scroll">
                {categoryLinkGroups.length ? (
                  <div className="people-category-link-groups" style={categoryLinkGridStyle}>
                    {categoryLinkGroups.map((entry) => (
                      <section
                        key={entry.group.id}
                        className={`people-category-link-group${
                          dragItem?.itemType === "categoryGroupLink" && dragItem.id === entry.group.id ? " is-dragging" : ""
                        }`}
                        draggable
                        onDragStart={(event) =>
                          startDrag(
                            {
                              id: entry.group.id,
                              itemType: "categoryGroupLink",
                              ownerPersonId: null,
                              isHidden: false,
                              categoryIds: entry.categories.map((category) => category.id),
                            },
                            event,
                          )
                        }
                        onDragEnd={resetDragState}
                      >
                        <div className="people-category-link-group-head">
                          <strong>{entry.group.name}</strong>
                          <span>{entry.categories.length}개</span>
                        </div>
                        <div className="people-category-link-list">
                          {entry.categories.map((category) => (
                            <article
                              key={category.id}
                              className={`people-category-link-item${!category.linkedAccountId ? " is-unlinked" : ""}${
                                dragItem?.itemType === "categoryLink" && dragItem.id === category.id ? " is-dragging" : ""
                              }`}
                              data-guide-target={category.id === guideCategoryLinkCategoryId ? "people-category-link-guide-item" : undefined}
                              draggable
                              onDragStart={(event) => {
                                startGuideDragTransaction("people-category-link-pick");
                                startDrag({ id: category.id, itemType: "categoryLink", ownerPersonId: null, isHidden: false }, event);
                              }}
                              onDragEnd={resetDragState}
                            >
                              <strong>{category.name}</strong>
                              <span>{category.linkedAccountId ? accountNameMap.get(category.linkedAccountId) ?? "연결 계좌 없음" : "미연결"}</span>
                              <div className={`category-case-pill people-category-link-pill${category.fixedOrVariable === "fixed" ? " is-fixed" : ""}`}>
                                {category.fixedOrVariable === "fixed" ? "고정" : "변동"}
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="text-secondary mb-0">연결할 카테고리가 없습니다.</p>
                )}
              </div>
              {CATEGORY_LINK_PANEL_RESIZE_DIRECTIONS.map((direction) => (
                <span
                  key={direction}
                  className={`people-category-link-resize-handle is-${direction}`}
                  data-guide-target={direction === "se" ? "people-category-link-resize-handle" : undefined}
                  onPointerDown={(event) => handleCategoryLinkPanelResizePointerDown(direction, event)}
                  aria-hidden="true"
                />
              ))}
            </aside>
          </>,
          document.body,
        )
      : null}

      {isDragOverlayVisible && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className={`category-side-zone category-side-zone-left${isDragOverlayActive ? " is-visible" : ""}${activeDropZone === "hide" ? " is-active" : ""}`}
              data-guide-target="people-hide-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setActiveDropZone("hide");
              }}
              onDragLeave={() => setActiveDropZone((current) => (current === "hide" ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragItem) return;
                applyHiddenState(dragItem, true);
                completeGuideDragTransaction("people-hidden-hide-drop");
                resetDragState();
              }}
            >
              <span>숨기기</span>
            </div>
            <div
              className={`category-side-zone category-side-zone-right${isDragOverlayActive ? " is-visible" : ""}${activeDropZone === "delete" ? " is-active" : ""}`}
              data-guide-target="people-delete-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setActiveDropZone("delete");
              }}
              onDragLeave={() => setActiveDropZone((current) => (current === "delete" ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragItem) return;
                requestDeleteItem(dragItem);
                completeGuideStepAction(workspaceId, "people-delete-flow");
                resetDragState();
              }}
            >
              <span>삭제</span>
            </div>
          </>,
          document.body,
        )
      : null}
    </>
  );

  return (
    <div className={embedded ? "" : "page-stack"}>
      {embeddedPeopleSection}

      <AppModal
        open={Boolean(pendingDeleteItem)}
        title="항목 삭제"
        description={
          pendingDeletePerson
            ? `${pendingDeletePerson.displayName || pendingDeletePerson.name} 사용자와 연결된 계좌/카드도 함께 삭제됩니다.`
            : pendingDeleteAccount
              ? `${pendingDeleteAccount.alias || pendingDeleteAccount.name} 계좌를 삭제합니다.`
              : pendingDeleteCard
                ? `${pendingDeleteCard.name} 카드를 삭제합니다.`
                : ""
        }
        onClose={() => setPendingDeleteItem(null)}
      >
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setPendingDeleteItem(null)}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (pendingDeletePerson) {
                deletePerson(workspaceId, pendingDeletePerson.id);
              } else if (pendingDeleteAccount) {
                deleteAccount(workspaceId, pendingDeleteAccount.id);
              } else if (pendingDeleteCard) {
                deleteCard(workspaceId, pendingDeleteCard.id);
              }
              setPendingDeleteItem(null);
            }}
          >
            삭제
          </button>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(accountOwner)}
        title="계좌 등록"
        description={accountOwner ? `${accountOwner.displayName || accountOwner.name} 사용자 아래에 계좌를 추가합니다.` : ""}
        onClose={closePersonAccountModal}
      >
        {accountOwner ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeAccountDraftValues(accountDraft);
              if (!values.name) return;
              addAccount(workspaceId, values);
              closePersonAccountModal();
            }}
          >
            <label>
              계좌 이름
              <input className="form-control" value={accountDraft.alias} onChange={(event) => patchAccountDraft({ alias: event.target.value }, setAccountDraft, accountOwnerPersonId)} />
            </label>
            <label>
              계좌 구분
              <AppSelect
                value={accountDraft.accountGroupType}
                onChange={(nextValue) =>
                  patchAccountDraft({ accountGroupType: nextValue as PersonAccountDraftState["accountGroupType"] }, setAccountDraft, accountOwnerPersonId)
                }
                options={[
                  { value: "personal", label: "개인 통장" },
                  { value: "meeting", label: "모임통장" },
                ]}
                ariaLabel="계좌 구분 선택"
              />
            </label>
            <label>
              메인 사용자
              <AppSelect
                value={accountDraft.primaryPersonId}
                onChange={(nextValue) => patchAccountDraft({ primaryPersonId: nextValue, ownerPersonId: nextValue }, setAccountDraft, accountOwnerPersonId)}
                options={activePeopleOptions}
                ariaLabel="메인 사용자 선택"
              />
            </label>
            <label>
              금융기관
              <AppSelect
                value={accountDraft.institutionName}
                onChange={(nextValue) => patchAccountDraft({ institutionName: nextValue }, setAccountDraft, accountOwnerPersonId)}
                options={getFinancialInstitutionOptions(accountDraft.institutionName).map((institutionName) => ({
                  value: institutionName,
                  label: institutionName === "직접입력" ? "직접 입력" : institutionName,
                }))}
                ariaLabel="금융기관 선택"
              />
            </label>
            <label>
              계좌 번호
              <input className="form-control" value={accountDraft.accountNumberMasked} onChange={(event) => patchAccountDraft({ accountNumberMasked: event.target.value }, setAccountDraft, accountOwnerPersonId)} />
            </label>
            <label>
              계좌 유형
              <AppSelect
                value={accountDraft.accountType}
                onChange={(nextValue) =>
                  patchAccountDraft(
                    { accountType: nextValue as PersonAccountDraftState["accountType"] },
                    setAccountDraft,
                    accountOwnerPersonId,
                  )
                }
                options={ACCOUNT_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="계좌 유형 선택"
              />
            </label>
            <label>
              용도
              <AppSelect
                value={accountDraft.usageType}
                onChange={(nextValue) => patchAccountDraft({ usageType: nextValue as AccountUsageType }, setAccountDraft, accountOwnerPersonId)}
                options={getAccountUsageOptions(accountDraft.accountGroupType).map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="계좌 용도 선택"
                disabled={accountDraft.accountGroupType === "meeting"}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={accountDraft.memo} onChange={(event) => patchAccountDraft({ memo: event.target.value }, setAccountDraft, accountOwnerPersonId)} />
            </label>
            {accountDraft.accountGroupType === "meeting" ? (
              <label style={{ gridColumn: "1 / -1" }}>
                참여 사용자
                <div className="people-account-member-grid">
                  {activePeopleOptions.map((person) => {
                    const checked = accountDraft.participantPersonIds.includes(person.value) || accountDraft.primaryPersonId === person.value;
                    const locked = accountDraft.primaryPersonId === person.value;
                    return (
                      <label key={person.value} className={`people-account-member-option${checked ? " is-selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={(event) =>
                            patchAccountDraft(
                              {
                                participantPersonIds: event.target.checked
                                  ? [...accountDraft.participantPersonIds, person.value]
                                  : accountDraft.participantPersonIds.filter((participantId) => participantId !== person.value),
                              },
                              setAccountDraft,
                              accountOwnerPersonId,
                            )
                          }
                        />
                        <span>{person.label}</span>
                        {locked ? <small>메인</small> : null}
                      </label>
                    );
                  })}
                </div>
              </label>
            ) : null}
            <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" type="submit">
                저장
              </button>
            </div>
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={Boolean(editingAccount)}
        title="계좌 수정"
        description="사용자 하위 계좌 정보와 소유자를 여기서 보정합니다."
        onClose={() => {
          setEditingAccountId(null);
          setEditAccountDraft(EMPTY_PERSON_ACCOUNT_DRAFT);
        }}
      >
        {editingAccount ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeAccountDraftValues(editAccountDraft);
              if (!values.name) return;
              updateAccount(workspaceId, editingAccount.id, values);
              setEditingAccountId(null);
              setEditAccountDraft(EMPTY_PERSON_ACCOUNT_DRAFT);
            }}
          >
            <label>
              계좌 이름
              <input className="form-control" value={editAccountDraft.alias} onChange={(event) => patchAccountDraft({ alias: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)} />
            </label>
            <label>
              계좌 구분
              <AppSelect
                value={editAccountDraft.accountGroupType}
                onChange={(nextValue) =>
                  patchAccountDraft({ accountGroupType: nextValue as PersonAccountDraftState["accountGroupType"] }, setEditAccountDraft, editingAccount.ownerPersonId)
                }
                options={[
                  { value: "personal", label: "개인 통장" },
                  { value: "meeting", label: "모임통장" },
                ]}
                ariaLabel="계좌 구분 선택"
              />
            </label>
            <label>
              메인 사용자
              <AppSelect
                value={editAccountDraft.primaryPersonId}
                onChange={(nextValue) => patchAccountDraft({ primaryPersonId: nextValue, ownerPersonId: nextValue }, setEditAccountDraft, editingAccount.ownerPersonId)}
                options={activePeopleOptions}
                ariaLabel="메인 사용자 선택"
              />
            </label>
            <label>
              금융기관
              <AppSelect
                value={editAccountDraft.institutionName}
                onChange={(nextValue) => patchAccountDraft({ institutionName: nextValue }, setEditAccountDraft, editingAccount.ownerPersonId)}
                options={getFinancialInstitutionOptions(editAccountDraft.institutionName).map((institutionName) => ({
                  value: institutionName,
                  label: institutionName === "직접입력" ? "직접 입력" : institutionName,
                }))}
                ariaLabel="금융기관 선택"
              />
            </label>
            <label>
              계좌 번호
              <input className="form-control" value={editAccountDraft.accountNumberMasked} onChange={(event) => patchAccountDraft({ accountNumberMasked: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)} />
            </label>
            <label>
              계좌 유형
              <AppSelect
                value={editAccountDraft.accountType}
                onChange={(nextValue) =>
                  patchAccountDraft(
                    { accountType: nextValue as PersonAccountDraftState["accountType"] },
                    setEditAccountDraft,
                    editingAccount.ownerPersonId,
                  )
                }
                options={ACCOUNT_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="계좌 유형 선택"
              />
            </label>
            <label>
              용도
              <AppSelect
                value={editAccountDraft.usageType}
                onChange={(nextValue) => patchAccountDraft({ usageType: nextValue as AccountUsageType }, setEditAccountDraft, editingAccount.ownerPersonId)}
                options={getAccountUsageOptions(editAccountDraft.accountGroupType).map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="계좌 용도 선택"
                disabled={editAccountDraft.accountGroupType === "meeting"}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editAccountDraft.memo} onChange={(event) => patchAccountDraft({ memo: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)} />
            </label>
            {editAccountDraft.accountGroupType === "meeting" ? (
              <label style={{ gridColumn: "1 / -1" }}>
                참여 사용자
                <div className="people-account-member-grid">
                  {activePeopleOptions.map((person) => {
                    const checked = editAccountDraft.participantPersonIds.includes(person.value) || editAccountDraft.primaryPersonId === person.value;
                    const locked = editAccountDraft.primaryPersonId === person.value;
                    return (
                      <label key={person.value} className={`people-account-member-option${checked ? " is-selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={(event) =>
                            patchAccountDraft(
                              {
                                participantPersonIds: event.target.checked
                                  ? [...editAccountDraft.participantPersonIds, person.value]
                                  : editAccountDraft.participantPersonIds.filter((participantId) => participantId !== person.value),
                              },
                              setEditAccountDraft,
                              editingAccount.ownerPersonId,
                            )
                          }
                        />
                        <span>{person.label}</span>
                        {locked ? <small>메인</small> : null}
                      </label>
                    );
                  })}
                </div>
              </label>
            ) : null}
            <div className="people-linked-category-detail" style={{ gridColumn: "1 / -1" }}>
              <div className="people-linked-category-detail-head">
                <strong>연결된 정산 카테고리</strong>
                <span>{editingAccountLinkedCategories.length}개</span>
              </div>
              {editingAccountLinkedCategories.length ? (
                <div className="people-linked-category-detail-list">
                  {editingAccountLinkedCategories.map((category) => (
                    <div key={category.id} className="people-linked-category-detail-item">
                      <div className="people-linked-category-detail-copy">
                        <strong>{category.name}</strong>
                        <span>
                          {category.parentCategoryId ? categoryGroupNameMap.get(category.parentCategoryId) ?? "미분류 그룹" : "미분류 그룹"}
                          {category.isHidden ? " · 숨김" : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => updateCategory(workspaceId, category.id, { linkedAccountId: null })}
                      >
                        연결 해제
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="people-linked-category-detail-empty mb-0">
                  연결된 카테고리가 없습니다. 카테고리 연결 팝업에서 드래그해 추가할 수 있습니다.
                </p>
              )}
            </div>
            <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" type="submit">
                저장
              </button>
            </div>
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={Boolean(editingCard)}
        title="카드 수정"
        description="카드는 업로드로 생성하고, 여기서 소유자와 연결 계좌를 자유롭게 조정합니다."
        onClose={() => {
          setEditingCardId(null);
          setEditCardDraft(EMPTY_PERSON_CARD_DRAFT);
        }}
      >
        {editingCard ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeCardDraftValues(editCardDraft);
              if (!values.name) return;
              updateCard(workspaceId, editingCard.id, values);
              setEditingCardId(null);
              setEditCardDraft(EMPTY_PERSON_CARD_DRAFT);
            }}
          >
            <label>
              카드 이름
              <input className="form-control" value={editCardDraft.name} onChange={(event) => setEditCardDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              카드사
              <input className="form-control" value={editCardDraft.issuerName} onChange={(event) => setEditCardDraft((current) => ({ ...current, issuerName: event.target.value }))} />
            </label>
            <label>
              {getCardAccountLabel(editCardDraft.cardType)}
              <AppSelect
                value={editCardDraft.linkedAccountId}
                onChange={(nextValue) => setEditCardDraft((current) => ({ ...current, linkedAccountId: nextValue }))}
                options={[
                  { value: "", label: "연결 안 함" },
                  ...scope.accounts
                    .filter((account) => !account.isShared || account.accountGroupType === "meeting")
                    .map((account) => {
                      const primaryOwnerName =
                        account.primaryPersonId || account.ownerPersonId
                          ? personNameMap.get(account.primaryPersonId ?? account.ownerPersonId ?? "") ?? "사용자 없음"
                          : "사용자 없음";
                      return {
                        value: account.id,
                        label:
                          account.accountGroupType === "meeting"
                            ? `${account.alias || account.name} · 모임통장 · ${primaryOwnerName}`
                            : `${account.alias || account.name}${account.ownerPersonId ? ` · ${primaryOwnerName}` : ""}`,
                      };
                    }),
                ]}
                ariaLabel="연결 계좌 선택"
              />
            </label>
            <label>
              카드 종류
              <AppSelect
                value={editCardDraft.cardType}
                onChange={(nextValue) => setEditCardDraft((current) => ({ ...current, cardType: nextValue as PersonCardDraftState["cardType"] }))}
                options={CARD_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="카드 종류 선택"
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editCardDraft.memo} onChange={(event) => setEditCardDraft((current) => ({ ...current, memo: event.target.value }))} />
            </label>
            <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" type="submit">
                저장
              </button>
            </div>
          </form>
        ) : null}
      </AppModal>
    </div>
  );
}
