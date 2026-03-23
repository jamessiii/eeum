import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useEffect } from "react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import type { Category } from "../../shared/types/models";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
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

let transparentDragImage: HTMLCanvasElement | null = null;

const EMPTY_PERSON_ACCOUNT_DRAFT: PersonAccountDraftState = {
  name: "",
  alias: "",
  institutionName: "",
  accountNumberMasked: "",
  ownerPersonId: "",
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

function getDefaultCategoryLinkPanelPosition() {
  if (typeof window === "undefined") {
    return { left: 16, top: 104 };
  }

  const margin = 16;
  const desiredWidth = Math.min(1120, Math.max(360, window.innerWidth - margin * 2));
  return {
    left: Math.max(margin, Math.round((window.innerWidth - desiredWidth) / 2)),
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
  };
}

function createDraftFromAccount(account?: {
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  ownerPersonId: string | null;
  accountType: PersonAccountDraftState["accountType"];
  usageType: AccountUsageType;
  isShared: boolean;
  memo: string;
}): PersonAccountDraftState {
  if (!account) return EMPTY_PERSON_ACCOUNT_DRAFT;
  return {
    name: account.name,
    alias: account.alias || account.name,
    institutionName: account.institutionName,
    accountNumberMasked: account.accountNumberMasked,
    ownerPersonId: account.ownerPersonId ?? "",
    accountType: account.accountType,
    usageType: getVisibleAccountUsageType(account.usageType, account.isShared),
    isShared: false,
    memo: account.memo,
  };
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

function normalizeAccountDraftValues(draft: PersonAccountDraftState) {
  const accountLabel = draft.alias.trim() || draft.name.trim();
  return {
    ownerPersonId: draft.ownerPersonId || null,
    name: accountLabel,
    alias: accountLabel,
    institutionName: draft.institutionName.trim(),
    accountNumberMasked: draft.accountNumberMasked.trim(),
    accountType: draft.accountType,
    usageType: getVisibleAccountUsageType(draft.usageType),
    isShared: false,
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
  const [categoryLinkPanelPosition, setCategoryLinkPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [isCategoryLinkPanelDragging, setIsCategoryLinkPanelDragging] = useState(false);
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
  const categoryLinkPanelDragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
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

  const accountsByPersonId = new Map(
    scope.people.map((person) => [person.id, scope.accounts.filter((account) => account.ownerPersonId === person.id && !account.isHidden)]),
  );
  const cardsByPersonId = new Map(
    scope.people.map((person) => [person.id, scope.cards.filter((card) => card.ownerPersonId === person.id && !card.isHidden)]),
  );

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
    if (!isCategoryLinkPanelOpen || typeof window === "undefined") {
      categoryLinkPanelDragStateRef.current = null;
      setIsCategoryLinkPanelDragging(false);
      return;
    }

    const clampPanelPosition = (position: { left: number; top: number }) => {
      const margin = 16;
      const panelWidth = categoryLinkPanelRef.current?.offsetWidth ?? Math.min(1120, Math.max(360, window.innerWidth - margin * 2));
      const panelHeight = categoryLinkPanelRef.current?.offsetHeight ?? 360;
      return {
        left: clampNumber(position.left, margin, Math.max(margin, window.innerWidth - panelWidth - margin)),
        top: clampNumber(position.top, margin, Math.max(margin, window.innerHeight - panelHeight - margin)),
      };
    };

    const frame = window.requestAnimationFrame(() => {
      setCategoryLinkPanelPosition((current) => clampPanelPosition(current ?? getDefaultCategoryLinkPanelPosition()));
    });

    const handlePointerMove = (event: PointerEvent) => {
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
      const dragState = categoryLinkPanelDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      categoryLinkPanelDragStateRef.current = null;
      setIsCategoryLinkPanelDragging(false);
    };

    const handleResize = () => {
      setCategoryLinkPanelPosition((current) => clampPanelPosition(current ?? getDefaultCategoryLinkPanelPosition()));
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
      setIsCategoryLinkPanelDragging(false);
    };
  }, [isCategoryLinkPanelOpen]);

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
    setIsCategoryLinkPanelDragging(true);
    event.preventDefault();
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
      next.isShared = false;
      if (!next.ownerPersonId && fallbackOwnerPersonId) next.ownerPersonId = fallbackOwnerPersonId;
      if (next.usageType === "shared") next.usageType = "other";
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
              onClick={() => setIsCategoryLinkPanelOpen((current) => !current)}
            >
              카테고리 연결
            </button>
            <button
              type="button"
              className={`board-case-action-button${isHiddenPanelOpen ? " is-active" : ""}`}
              data-guide-target="people-hidden-toggle"
              onClick={() => setIsHiddenPanelOpen((current) => !current)}
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
                style={getMotionStyle(index + 2)}
                draggable={!isInlineEditing}
                onDragStart={(event) => startDrag({ id: section.person.id, itemType: "person", ownerPersonId: null, isHidden: false }, event)}
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
                <div className="people-subboard">
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
                       return (
                        <article
                          key={account.id}
                          className={`category-case-card people-board-card${
                            isCategoryConnectionDragItem(dragItem) ? " is-category-link-target" : ""
                          }${isActiveCategoryLinkTarget ? " is-category-link-active" : ""}${getDragStateClassName(account.id)}`}
                          draggable
                          onDragStart={(event) => startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: false }, event)}
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
                            <span>{account.accountNumberMasked || "계좌번호 미입력"}</span>
                            <div className="people-linked-category-block">
                              <span className={`people-linked-category-count${linkedCategories.length ? "" : " is-empty"}`}>
                                {linkedCategories.length ? `카테고리 ${linkedCategories.length}개` : "카테고리 없음"}
                              </span>
                            </div>
                           </div>
                          <div className="category-case-pill">{usageLabel}</div>
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
                          draggable
                          onDragStart={(event) => startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: false }, event)}
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
      <aside className="category-hidden-panel">
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
                draggable
                onDragStart={(event) => startDrag({ id: person.id, itemType: "person", ownerPersonId: null, isHidden: true }, event)}
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
                draggable
                onDragStart={(event) => startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: true }, event)}
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
                draggable
                onDragStart={(event) => startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: true }, event)}
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

    {isCategoryLinkPanelOpen && typeof document !== "undefined"
      ? createPortal(
          <>
            <aside
              ref={categoryLinkPanelRef}
              className={`people-category-link-panel${isCategoryLinkPanelDragging ? " is-dragging" : ""}`}
              style={
                categoryLinkPanelPosition
                  ? {
                      left: `${categoryLinkPanelPosition.left}px`,
                      top: `${categoryLinkPanelPosition.top}px`,
                      right: "auto",
                    }
                  : undefined
              }
              aria-labelledby="peopleCategoryLinkTitle"
            >
            <div className="people-category-link-panel-head" onPointerDown={handleCategoryLinkPanelPointerDown}>
              <div>
                <span className="section-kicker">정산 소스 계좌</span>
                <h3 id="peopleCategoryLinkTitle">카테고리 연결</h3>
                <span className="people-category-link-panel-drag-hint">헤더를 드래그해 위치 이동</span>
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
              <div className="people-category-link-panel-scroll">
                {categoryLinkGroups.length ? (
                  <div className="people-category-link-groups">
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
                              draggable
                              onDragStart={(event) =>
                                startDrag({ id: category.id, itemType: "categoryLink", ownerPersonId: null, isHidden: false }, event)
                              }
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
              onDragOver={(event) => {
                event.preventDefault();
                setActiveDropZone("hide");
              }}
              onDragLeave={() => setActiveDropZone((current) => (current === "hide" ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragItem) return;
                applyHiddenState(dragItem, true);
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
              금융기관
              <select
                className="form-select"
                value={accountDraft.institutionName}
                onChange={(event) => patchAccountDraft({ institutionName: event.target.value }, setAccountDraft, accountOwnerPersonId)}
              >
                {getFinancialInstitutionOptions(accountDraft.institutionName).map((institutionName) => (
                  <option key={institutionName} value={institutionName}>
                    {institutionName === "직접입력" ? "직접 입력" : institutionName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              계좌 번호
              <input className="form-control" value={accountDraft.accountNumberMasked} onChange={(event) => patchAccountDraft({ accountNumberMasked: event.target.value }, setAccountDraft, accountOwnerPersonId)} />
            </label>
            <label>
              계좌 유형
              <select
                className="form-select"
                value={accountDraft.accountType}
                onChange={(event) =>
                  patchAccountDraft(
                    { accountType: event.target.value as PersonAccountDraftState["accountType"] },
                    setAccountDraft,
                    accountOwnerPersonId,
                  )
                }
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              용도
              <select
                className="form-select"
                value={accountDraft.usageType}
                onChange={(event) => patchAccountDraft({ usageType: event.target.value as AccountUsageType }, setAccountDraft, accountOwnerPersonId)}
              >
                {ACCOUNT_USAGE_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={accountDraft.memo} onChange={(event) => patchAccountDraft({ memo: event.target.value }, setAccountDraft, accountOwnerPersonId)} />
            </label>
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
              금융기관
              <select
                className="form-select"
                value={editAccountDraft.institutionName}
                onChange={(event) => patchAccountDraft({ institutionName: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)}
              >
                {getFinancialInstitutionOptions(editAccountDraft.institutionName).map((institutionName) => (
                  <option key={institutionName} value={institutionName}>
                    {institutionName === "직접입력" ? "직접 입력" : institutionName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              계좌 번호
              <input className="form-control" value={editAccountDraft.accountNumberMasked} onChange={(event) => patchAccountDraft({ accountNumberMasked: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)} />
            </label>
            <label>
              계좌 유형
              <select
                className="form-select"
                value={editAccountDraft.accountType}
                onChange={(event) =>
                  patchAccountDraft(
                    { accountType: event.target.value as PersonAccountDraftState["accountType"] },
                    setEditAccountDraft,
                    editingAccount.ownerPersonId,
                  )
                }
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              용도
              <select
                className="form-select"
                value={editAccountDraft.usageType}
                onChange={(event) => patchAccountDraft({ usageType: event.target.value as AccountUsageType }, setEditAccountDraft, editingAccount.ownerPersonId)}
              >
                {ACCOUNT_USAGE_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editAccountDraft.memo} onChange={(event) => patchAccountDraft({ memo: event.target.value }, setEditAccountDraft, editingAccount.ownerPersonId)} />
            </label>
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
              <select className="form-select" value={editCardDraft.linkedAccountId} onChange={(event) => setEditCardDraft((current) => ({ ...current, linkedAccountId: event.target.value }))}>
                <option value="">연결 안 함</option>
                {scope.accounts.filter((account) => !account.isShared).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.alias || account.name}
                    {account.ownerPersonId ? ` · ${personNameMap.get(account.ownerPersonId) ?? "사용자 없음"}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              카드 종류
              <select className="form-select" value={editCardDraft.cardType} onChange={(event) => setEditCardDraft((current) => ({ ...current, cardType: event.target.value as PersonCardDraftState["cardType"] }))}>
                {CARD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
