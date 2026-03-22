import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { getAccountUsageSummary, getCardUsageSummary, getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
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

type PersonDraftState = {
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
};

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
  | { id: string; itemType: "card"; ownerPersonId: string | null; isHidden: boolean };

const EMPTY_PERSON_DRAFT: PersonDraftState = {
  name: "",
  displayName: "",
  role: "member",
  memo: "",
  isActive: true,
};

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

function createDraftFromPerson(person?: {
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
}): PersonDraftState {
  if (!person) return EMPTY_PERSON_DRAFT;
  return {
    name: person.name,
    displayName: person.displayName,
    role: person.role,
    memo: person.memo,
    isActive: person.isActive,
  };
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
  const { addAccount, addPerson, deleteAccount, deleteCard, deletePerson, moveAccount, moveCard, movePerson, state, updateAccount, updateCard, updatePerson } =
    useAppState();
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [inlineEditingPersonId, setInlineEditingPersonId] = useState<string | null>(null);
  const [inlinePersonName, setInlinePersonName] = useState("");
  const [pendingInlinePersonName, setPendingInlinePersonName] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<"hide" | "delete" | null>(null);
  const [activeCardLinkTargetId, setActiveCardLinkTargetId] = useState<string | null>(null);
  const [linkedAccountFlash, setLinkedAccountFlash] = useState<{ cardId: string; sequence: number } | null>(null);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const [isDragOverlayActive, setIsDragOverlayActive] = useState(false);
  const [isHiddenPanelOpen, setIsHiddenPanelOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<{ itemType: DragItem["itemType"]; id: string } | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [accountOwnerPersonId, setAccountOwnerPersonId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<PersonAccountDraftState>(EMPTY_PERSON_ACCOUNT_DRAFT);
  const [editDraft, setEditDraft] = useState<PersonDraftState>(EMPTY_PERSON_DRAFT);
  const [editAccountDraft, setEditAccountDraft] = useState<PersonAccountDraftState>(EMPTY_PERSON_ACCOUNT_DRAFT);
  const [editCardDraft, setEditCardDraft] = useState<PersonCardDraftState>(EMPTY_PERSON_CARD_DRAFT);
  const dragOverlayTimeoutRef = useRef<number | null>(null);
  const dragOverlayEnterTimeoutRef = useRef<number | null>(null);
  const linkedAccountFlashTimeoutRef = useRef<number | null>(null);
  const linkedAccountFlashSequenceRef = useRef(0);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const dragImageElementRef = useRef<HTMLElement | null>(null);
  const dragGhostOffsetRef = useRef({ x: 0, y: 0 });
  const dragGhostPointerRef = useRef({ x: 0, y: 0 });
  const dragGhostFrameRef = useRef<number | null>(null);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const allPeople = scope.people;
  const people = scope.people.filter((person) => !person.isHidden);
  const hiddenPeople = scope.people.filter((person) => person.isHidden);
  const hiddenAccounts = scope.accounts.filter((account) => account.isHidden && !account.isShared);
  const hiddenCards = scope.cards.filter((card) => card.isHidden);
  const transactions = getActiveTransactions(scope.transactions);
  const personNameMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountNameMap = new Map(scope.accounts.map((account) => [account.id, account.alias || account.name]));
  const editingPerson = useMemo(() => allPeople.find((person) => person.id === editingPersonId) ?? null, [allPeople, editingPersonId]);
  const editingAccount = useMemo(
    () => scope.accounts.find((account) => account.id === editingAccountId) ?? null,
    [scope.accounts, editingAccountId],
  );
  const editingCard = useMemo(() => scope.cards.find((card) => card.id === editingCardId) ?? null, [scope.cards, editingCardId]);
  const activeCardLinkMessage = useMemo(() => {
    if (!activeCardLinkTargetId) return "";
    const targetCard = scope.cards.find((card) => card.id === activeCardLinkTargetId);
    if (!targetCard) return "";
    return `${getCardAccountLabel(targetCard.cardType)}로 연결`;
  }, [activeCardLinkTargetId, scope.cards]);

  const normalizeDraftValues = (draft: PersonDraftState) => {
    const name = draft.name.trim();
    return {
      name,
      displayName: draft.displayName.trim() || name,
      role: draft.role,
      memo: draft.memo.trim(),
      isActive: draft.isActive,
    };
  };

  const updateDragGhostPointer = (clientX: number, clientY: number) => {
    if (!dragGhostRef.current) return;
    if (clientX <= 0 && clientY <= 0) return;
    dragGhostPointerRef.current = { x: clientX, y: clientY };
    if (dragGhostFrameRef.current !== null) return;
    dragGhostFrameRef.current = window.requestAnimationFrame(() => {
      dragGhostFrameRef.current = null;
      if (!dragGhostRef.current) return;
      dragGhostRef.current.style.left = `${dragGhostPointerRef.current.x - dragGhostOffsetRef.current.x}px`;
      dragGhostRef.current.style.top = `${dragGhostPointerRef.current.y - dragGhostOffsetRef.current.y}px`;
    });
  };

  const isDragHandleEnabled = (id: string) => !dragItem || dragItem.id === id;

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
    if (dragItem) {
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
    setActiveCardLinkTargetId(null);
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
      updateDragGhostPointer(event.clientX, event.clientY);
    };

    window.addEventListener("dragover", handleDragOver, true);
    return () => {
      window.removeEventListener("dragover", handleDragOver, true);
      if (dragGhostFrameRef.current !== null) {
        window.cancelAnimationFrame(dragGhostFrameRef.current);
        dragGhostFrameRef.current = null;
      }
    };
  }, [dragItem]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    dragGhostRef.current.classList.toggle("is-drop-target-hide", activeDropZone === "hide");
    dragGhostRef.current.classList.toggle("is-drop-target-delete", activeDropZone === "delete");
  }, [activeDropZone]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    dragGhostRef.current.classList.toggle("is-account-link-ready", dragItem?.itemType === "account" && Boolean(activeCardLinkTargetId));
    if (activeCardLinkMessage) {
      dragGhostRef.current.setAttribute("data-link-message", activeCardLinkMessage);
    } else {
      dragGhostRef.current.removeAttribute("data-link-message");
    }
  }, [activeCardLinkMessage, activeCardLinkTargetId, dragItem]);

  useEffect(() => {
    return () => {
      if (linkedAccountFlashTimeoutRef.current) {
        window.clearTimeout(linkedAccountFlashTimeoutRef.current);
        linkedAccountFlashTimeoutRef.current = null;
      }
    };
  }, []);

  const resetDragState = () => {
    if (dragGhostFrameRef.current !== null) {
      window.cancelAnimationFrame(dragGhostFrameRef.current);
      dragGhostFrameRef.current = null;
    }
    if (dragImageElementRef.current) {
      dragImageElementRef.current.remove();
      dragImageElementRef.current = null;
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
    setDragItem(null);
    setActiveDropZone(null);
    setActiveCardLinkTargetId(null);
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
    setPendingDeleteItem({ itemType: item.itemType, id: item.id });
  };

  const handleSourceDrag = (event: React.DragEvent<HTMLElement>) => {
    updateDragGhostPointer(event.clientX, event.clientY);
  };

  const startDrag = (item: DragItem, event: React.DragEvent<HTMLElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const sourceElement = event.currentTarget as HTMLElement;
    if (dragImageElementRef.current) {
      dragImageElementRef.current.remove();
      dragImageElementRef.current = null;
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
    dragGhostPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    const dragImageElement = sourceElement.cloneNode(true) as HTMLElement;
    dragImageElement.classList.remove("is-dragging", "is-drop-target-hide", "is-drop-target-delete", "is-account-link-target", "is-account-link-active");
    dragImageElement.classList.add("category-drag-ghost");
    dragImageElement.style.position = "fixed";
    dragImageElement.style.left = "-10000px";
    dragImageElement.style.top = "-10000px";
    dragImageElement.style.width = `${sourceRect.width}px`;
    dragImageElement.style.minWidth = `${sourceRect.width}px`;
    dragImageElement.style.maxWidth = `${sourceRect.width}px`;
    dragImageElement.style.pointerEvents = "none";
    dragImageElement.style.margin = "0";
    dragImageElement.style.opacity = "1";
    dragImageElement.style.transform = "none";
    dragImageElement.style.filter = "none";
    dragImageElement.style.zIndex = "-1";
    document.body.appendChild(dragImageElement);
    event.dataTransfer.setDragImage(
      dragImageElement,
      dragGhostOffsetRef.current.x,
      dragGhostOffsetRef.current.y,
    );
    dragImageElementRef.current = dragImageElement;

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
  const pendingDeletePerson = pendingDeleteItem?.itemType === "person" ? allPeople.find((person) => person.id === pendingDeleteItem.id) ?? null : null;
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
      embedded
      title="사용자"
      description="사용자별 계좌와 카드를 같은 보드 형식에서 관리합니다."
      actions={
        <button
          type="button"
          className={`board-case-action-button${isHiddenPanelOpen ? " is-active" : ""}`}
          onClick={() => setIsHiddenPanelOpen((current) => !current)}
        >
          숨김 {hiddenPeople.length + hiddenAccounts.length + hiddenCards.length}
        </button>
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
          className={`board-case-stack${dragItem ? " is-board-dragging" : ""}`}
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
                draggable={!isInlineEditing && isDragHandleEnabled(section.person.id)}
                onDragStart={(event) => startDrag({ id: section.person.id, itemType: "person", ownerPersonId: null, isHidden: false }, event)}
                onDrag={handleSourceDrag}
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
                      if (dragItem?.itemType !== "account" || dragItem.ownerPersonId !== section.person.id) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => handleAccountAppendDrop(event, section.person.id, section.linkedAccounts.length)}
                  >
                    {section.linkedAccounts.map((account) => {
                      const usageLabel =
                        ACCOUNT_USAGE_OPTIONS.find((option) => option.value === getVisibleAccountUsageType(account.usageType, account.isShared))?.label ??
                        "기타";
                       return (
                        <article
                         key={account.id}
                         className={`category-case-card people-board-card${getDragStateClassName(account.id)}`}
                         draggable={isDragHandleEnabled(account.id)}
                         onDragStart={(event) => startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: false }, event)}
                         onDrag={handleSourceDrag}
                         onDragEnd={resetDragState}
                         onDragOver={(event) => {
                           if (dragItem?.itemType !== "account" || dragItem.ownerPersonId !== section.person.id) return;
                           event.preventDefault();
                         }}
                         onDrop={(event) => handleAccountDrop(event, section.person.id, section.linkedAccounts.indexOf(account))}
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
                          draggable={isDragHandleEnabled(card.id)}
                          onDragStart={(event) => startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: false }, event)}
                          onDrag={handleSourceDrag}
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
                draggable={isDragHandleEnabled(person.id)}
                onDragStart={(event) => startDrag({ id: person.id, itemType: "person", ownerPersonId: null, isHidden: true }, event)}
                onDrag={handleSourceDrag}
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
                draggable={isDragHandleEnabled(account.id)}
                onDragStart={(event) => startDrag({ id: account.id, itemType: "account", ownerPersonId: account.ownerPersonId ?? null, isHidden: true }, event)}
                onDrag={handleSourceDrag}
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
                draggable={isDragHandleEnabled(card.id)}
                onDragStart={(event) => startDrag({ id: card.id, itemType: "card", ownerPersonId: card.ownerPersonId ?? null, isHidden: true }, event)}
                onDrag={handleSourceDrag}
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
      {!embedded ? (
        <section className="card shadow-sm" style={getMotionStyle(0)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">구성원 중심 관리</span>
              <h2 className="section-title">사용자</h2>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={createPersonSection}
            >
              사용자 등록
            </button>
          </div>
          <p className="mb-0 text-secondary">
            계좌와 카드는 전역 탭 대신 각 사용자 아래에서 관리합니다. 카드는 업로드 중 자동 생성되고 여기서 소유자와 연결 계좌를 보정합니다.
          </p>
        </section>
      ) : null}

      {embedded ? (
        embeddedPeopleSection
      ) : (
        <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 목록</span>
            <h2 className="section-title">등록된 사용자 관리</h2>
          </div>
          <span className="badge text-bg-dark">{people.length}명</span>
        </div>
        {!people.length ? (
          <EmptyStateCallout
            kicker="첫 단계"
            title="입력과 업로드에 연결할 사용자를 먼저 등록해주세요"
            description="사용자가 정리되어 있어야 계좌 등록과 카드 자동 매핑이 자연스럽게 이어집니다."
            actions={
              <>
                <Link to="/imports" className="btn btn-outline-primary btn-sm">
                  업로드 화면 보기
                </Link>
                <Link to="/settings?tab=categories" className="btn btn-outline-secondary btn-sm">
                  카테고리 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid compact-resource-grid">
            {people.map((person, index) => {
              const usage = getPersonUsageSummary(transactions, person.id);
              const isExpanded = expandedPersonId === person.id;
              const linkedAccounts = accountsByPersonId.get(person.id) ?? [];
              const linkedCards = cardsByPersonId.get(person.id) ?? [];

              return (
                <article
                  key={person.id}
                  className={`resource-card compact-resource-card${isExpanded ? " expanded" : ""}`}
                  style={getMotionStyle(index + 2)}
                >
                  <div className="compact-card-summary">
                    <div>
                      <div className="compact-card-meta">
                        <span className={`badge ${person.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                          {person.isActive ? "사용 중" : "보관"}
                        </span>
                        <span className="compact-card-caption">{getPersonRoleLabel(person.role)}</span>
                      </div>
                      <h3 className="mb-1">{person.displayName || person.name}</h3>
                      <p className="mb-1 text-secondary">{person.name !== person.displayName ? `원본 이름 ${person.name}` : " "}</p>
                      <p className="mb-0 text-secondary">거래 {usage.transactionCount}건</p>
                    </div>
                    <div className="compact-card-actions">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setEditingPersonId(person.id);
                          setEditDraft(createDraftFromPerson(person));
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="expand-toggle-button"
                        onClick={() => setExpandedPersonId((current) => (current === person.id ? null : person.id))}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "상세 닫기" : "상세 펼치기"}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="compact-card-details">
                      <div className="compact-detail-grid">
                        <div>
                          <span className="section-kicker">역할</span>
                          <strong>{getPersonRoleLabel(person.role)}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">상태</span>
                          <strong>{person.isActive ? "사용 중" : "보관"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">거래 수</span>
                          <strong>{usage.transactionCount}건</strong>
                        </div>
                        <div>
                          <span className="section-kicker">사용 금액</span>
                          <strong>{formatCurrency(usage.sharedExpenseAmount)}</strong>
                        </div>
                      </div>

                      <div className="compact-detail-grid">
                        <div>
                          <span className="section-kicker">등록 계좌</span>
                          <strong>{linkedAccounts.length}개</strong>
                        </div>
                        <div>
                          <span className="section-kicker">등록 카드</span>
                          <strong>{linkedCards.length}개</strong>
                        </div>
                      </div>

                      <div className="section-head mb-3">
                        <div>
                          <span className="section-kicker">사용자 하위 자산</span>
                          <h3 className="section-title mb-0">계좌</h3>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => openPersonAccountModal(person.id)}
                        >
                          계좌 추가
                        </button>
                      </div>
                      {linkedAccounts.length ? (
                        <div className="person-asset-grid">
                          {linkedAccounts.map((account) => {
                            const usageSummary = getAccountUsageSummary(transactions, account.id);
                            const usageLabel =
                              ACCOUNT_USAGE_OPTIONS.find((option) => option.value === getVisibleAccountUsageType(account.usageType, account.isShared))
                                ?.label ?? "기타";
                            return (
                              <article key={account.id} className="person-asset-card">
                                <strong>{account.alias || account.name}</strong>
                                <span>{account.institutionName || "직접 입력"}</span>
                                <span>{account.accountNumberMasked || "계좌번호 미입력"}</span>
                                <span className="small text-secondary">{usageLabel}</span>
                                <span className="small text-secondary">지출 {formatCurrency(usageSummary.expenseAmount)}</span>
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0 align-self-start"
                                  onClick={() => {
                                    setEditingAccountId(account.id);
                                    setEditAccountDraft(createDraftFromAccount(account));
                                  }}
                                >
                                  계좌 수정
                                </button>
                              </article>
                            );
                          })}
                          <button
                            type="button"
                            className="person-asset-card person-asset-card-add"
                            onClick={() => openPersonAccountModal(person.id)}
                            aria-label={`${person.displayName || person.name} 계좌 추가`}
                          >
                            <span className="person-asset-plus">+</span>
                            <span>계좌 추가</span>
                          </button>
                        </div>
                      ) : (
                        <div className="person-asset-grid">
                          <button
                            type="button"
                            className="person-asset-card person-asset-card-add"
                            onClick={() => openPersonAccountModal(person.id)}
                            aria-label={`${person.displayName || person.name} 계좌 추가`}
                          >
                            <span className="person-asset-plus">+</span>
                            <span>첫 계좌 등록</span>
                          </button>
                        </div>
                      )}

                      <div className="section-head mb-3 mt-4">
                        <div>
                          <span className="section-kicker">업로드 기반 카드</span>
                          <h3 className="section-title mb-0">카드</h3>
                        </div>
                      </div>
                      {linkedCards.length ? (
                        <div className="resource-grid compact-resource-grid">
                          {linkedCards.map((card) => {
                            const usageSummary = getCardUsageSummary(transactions, card.id);
                            const linkedAccountName = card.linkedAccountId
                              ? accountNameMap.get(card.linkedAccountId) ?? "없음"
                              : "없음";
                            const cardAccountLabel = getCardAccountLabel(card.cardType);
                            const cardIdentifier = getVisibleCardIdentifier(card.cardNumberMasked);
                            const isLinkedAccountFlashing = linkedAccountFlash?.cardId === card.id;
                            const linkedAccountFlashKey = isLinkedAccountFlashing ? linkedAccountFlash.sequence : 0;
                            return (
                              <article key={card.id} className="resource-card compact-resource-card">
                                <div className="compact-card-summary">
                                  <div>
                                    <div className="compact-card-meta">
                                      <span className="badge text-bg-secondary">
                                        {CARD_TYPE_OPTIONS.find((option) => option.value === card.cardType)?.label ?? "기타"}
                                      </span>
                                      <span className="compact-card-caption">{`${card.issuerName || "카드사 미확인"}${cardIdentifier ? ` (${cardIdentifier})` : ""}`}</span>
                                    </div>
                                    <h3 className="mb-1">{card.name}</h3>
                                    <p className="mb-1 text-secondary">
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
                                    </p>
                                    <p className="mb-0 text-secondary">사용 {formatCurrency(usageSummary.expenseAmount)}</p>
                                  </div>
                                  <div className="compact-card-actions">
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary btn-sm"
                                      onClick={() => {
                                        setEditingCardId(card.id);
                                        setEditCardDraft(createDraftFromCard(card));
                                      }}
                                    >
                                      카드 수정
                                    </button>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mb-0 text-secondary small">
                          아직 연결된 카드가 없습니다. 카드 명세서를 업로드하면 자동 생성되고 여기서 소유자와 연결 계좌를 조정할 수 있습니다.
                        </p>
                      )}

                      {person.memo ? <div className="compact-note">{person.memo}</div> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        </section>
      )}

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
        open={Boolean(editingPerson)}
        title="사용자 수정"
        description="필터와 연결 규칙에 닿는 정보만 빠르게 수정할 수 있습니다."
        onClose={() => {
          setEditingPersonId(null);
          setEditDraft(EMPTY_PERSON_DRAFT);
        }}
      >
        {editingPerson ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeDraftValues(editDraft);
              if (!values.name) return;
              updatePerson(workspaceId, editingPerson.id, values);
              setEditingPersonId(null);
              setEditDraft(EMPTY_PERSON_DRAFT);
            }}
          >
            <label>
              이름
              <input className="form-control" value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              표시 이름
              <input className="form-control" value={editDraft.displayName} onChange={(event) => setEditDraft((current) => ({ ...current, displayName: event.target.value }))} />
            </label>
            <label>
              역할
              <select className="form-select" value={editDraft.role} onChange={(event) => setEditDraft((current) => ({ ...current, role: event.target.value === "owner" ? "owner" : "member" }))}>
                <option value="owner">기본 사용자</option>
                <option value="member">구성원</option>
              </select>
            </label>
            <label className="compact-check">
              <span className="fw-semibold">현재 사용 중</span>
              <input
                type="checkbox"
                className="form-check-input mt-0"
                checked={editDraft.isActive}
                onChange={(event) => setEditDraft((current) => ({ ...current, isActive: event.target.checked }))}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editDraft.memo} onChange={(event) => setEditDraft((current) => ({ ...current, memo: event.target.value }))} />
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
