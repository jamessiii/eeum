import { createContext, useContext, useEffect, useMemo, useReducer, useState, type PropsWithChildren } from "react";
import { clearAppState, loadAppState, saveAppState } from "../../data/db/appDb";
import {
  createEmptyState,
  createFinancialProfileBase,
  createStarterCategories,
  createStarterTags,
  createWorkspaceBase,
  mergeWorkspaceBundle,
} from "../../domain/app/defaults";
import { isActiveExpenseTransaction } from "../../domain/transactions/meta";
import type { Account, AppState, Card, FinancialProfile, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";
import { useToast } from "../toast/ToastProvider";
import { getWorkspaceScope } from "./selectors";

type PersonDraft = Pick<Person, "name" | "displayName" | "role" | "memo" | "isActive">;
type AccountDraft = Pick<
  Account,
  "ownerPersonId" | "name" | "alias" | "institutionName" | "accountNumberMasked" | "accountType" | "usageType" | "isShared" | "memo"
>;
type CardDraft = Pick<Card, "ownerPersonId" | "name" | "issuerName" | "cardNumberMasked" | "linkedAccountId" | "cardType" | "memo">;

type NewTransactionInput = {
  workspaceId: string;
  occurredAt: string;
  settledAt: string;
  transactionType: Transaction["transactionType"];
  sourceType: Transaction["sourceType"];
  ownerPersonId: string | null;
  cardId: string | null;
  accountId: string | null;
  merchantName: string;
  description: string;
  amount: number;
  categoryId: string | null;
  tagIds: string[];
  isSharedExpense: boolean;
  isExpenseImpact: boolean;
};

type FinancialProfileInput = Pick<
  FinancialProfile,
  "monthlyNetIncome" | "targetSavingsRate" | "warningSpendRate" | "warningFixedCostRate"
>;

type SettlementInput = {
  workspaceId: string;
  month: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  amount: number;
  note: string;
};

type Action =
  | { type: "hydrate"; payload: AppState }
  | { type: "setActiveWorkspace"; payload: string }
  | { type: "mergeBundle"; payload: WorkspaceBundle }
  | { type: "reset" }
  | { type: "replaceState"; payload: AppState }
  | { type: "resolveReview"; payload: { reviewId: string; status: "resolved" | "dismissed" } }
  | { type: "applyReviewSuggestion"; payload: { reviewId: string } }
  | { type: "addPerson"; payload: { workspaceId: string; values: PersonDraft } }
  | { type: "updatePerson"; payload: { workspaceId: string; personId: string; values: PersonDraft } }
  | { type: "addAccount"; payload: { workspaceId: string; values: AccountDraft } }
  | { type: "updateAccount"; payload: { workspaceId: string; accountId: string; values: AccountDraft } }
  | { type: "addCard"; payload: { workspaceId: string; values: CardDraft } }
  | { type: "updateCard"; payload: { workspaceId: string; cardId: string; values: CardDraft } }
  | { type: "addCategory"; payload: { workspaceId: string; name: string } }
  | { type: "addTag"; payload: { workspaceId: string; name: string } }
  | { type: "setFinancialProfile"; payload: { workspaceId: string; values: FinancialProfileInput } }
  | { type: "addSettlement"; payload: SettlementInput }
  | { type: "addTransaction"; payload: NewTransactionInput }
  | {
      type: "updateTransactionDetails";
      payload: {
        workspaceId: string;
        transactionId: string;
        patch: {
          sourceType?: Transaction["sourceType"];
          ownerPersonId?: string | null;
          accountId?: string | null;
          cardId?: string | null;
          occurredAt?: string;
          settledAt?: string | null;
          merchantName?: string;
          description?: string;
          amount?: number;
        };
      };
    }
  | { type: "assignCategory"; payload: { workspaceId: string; transactionId: string; categoryId: string } }
  | { type: "clearCategory"; payload: { workspaceId: string; transactionId: string } }
  | { type: "assignCategoryByMerchant"; payload: { workspaceId: string; merchantName: string; categoryId: string } }
  | { type: "assignCategoryBatch"; payload: { workspaceId: string; transactionIds: string[]; categoryId: string } }
  | { type: "assignTag"; payload: { workspaceId: string; transactionId: string; tagId: string } }
  | { type: "removeTag"; payload: { workspaceId: string; transactionId: string; tagId: string } }
  | { type: "assignTagBatch"; payload: { workspaceId: string; transactionIds: string[]; tagId: string } }
  | { type: "assignTagByMerchant"; payload: { workspaceId: string; merchantName: string; tagId: string } }
  | {
      type: "updateTransactionFlags";
      payload: {
        workspaceId: string;
        transactionId: string;
        patch: {
          isSharedExpense?: boolean;
          isExpenseImpact?: boolean;
          isInternalTransfer?: boolean;
        };
      };
    };

function createPersonDraft(input: string | Partial<PersonDraft>): PersonDraft {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return {
      name: trimmed,
      displayName: trimmed,
      role: "member",
      memo: "",
      isActive: true,
    };
  }

  const name = String(input.name ?? "").trim();
  const displayName = String(input.displayName ?? input.name ?? "").trim();

  return {
    name,
    displayName: displayName || name,
    role: input.role === "owner" ? "owner" : "member",
    memo: String(input.memo ?? "").trim(),
    isActive: input.isActive ?? true,
  };
}

function createAccountDraft(input: string | Partial<AccountDraft>, institutionName?: string): AccountDraft {
  if (typeof input === "string") {
    return {
      ownerPersonId: null,
      name: input.trim(),
      alias: "",
      institutionName: institutionName?.trim() || "직접입력",
      accountNumberMasked: "",
      accountType: "checking",
      usageType: "daily",
      isShared: false,
      memo: "",
    };
  }

  const isShared = input.isShared ?? false;

  return {
    ownerPersonId: isShared ? null : input.ownerPersonId ?? null,
    name: String(input.name ?? "").trim(),
    alias: String(input.alias ?? "").trim(),
    institutionName: String(input.institutionName ?? "").trim() || "직접입력",
    accountNumberMasked: String(input.accountNumberMasked ?? "").trim(),
    accountType: input.accountType ?? "checking",
    usageType: isShared ? "shared" : input.usageType ?? "daily",
    isShared,
    memo: String(input.memo ?? "").trim(),
  };
}

function createCardDraft(input: string | Partial<CardDraft>, issuerName?: string): CardDraft {
  if (typeof input === "string") {
    return {
      ownerPersonId: null,
      name: input.trim(),
      issuerName: issuerName?.trim() || "직접입력",
      cardNumberMasked: "",
      linkedAccountId: null,
      cardType: "credit",
      memo: "",
    };
  }

  return {
    ownerPersonId: input.ownerPersonId ?? null,
    name: String(input.name ?? "").trim(),
    issuerName: String(input.issuerName ?? "").trim() || "직접입력",
    cardNumberMasked: String(input.cardNumberMasked ?? "").trim(),
    linkedAccountId: input.linkedAccountId ?? null,
    cardType: input.cardType ?? "credit",
    memo: String(input.memo ?? "").trim(),
  };
}

function normalizeAppState(rawState: AppState): AppState {
  return {
    ...rawState,
    schemaVersion: Math.max(rawState.schemaVersion ?? 0, 3),
    people: rawState.people.map((person) => ({
      ...person,
      displayName: person.displayName ?? person.name,
      memo: person.memo ?? "",
      isActive: person.isActive ?? true,
    })),
    accounts: rawState.accounts.map((account) => ({
      ...account,
      alias: account.alias ?? "",
      usageType: account.usageType ?? (account.isShared ? "shared" : "daily"),
      memo: account.memo ?? "",
    })),
    cards: rawState.cards.map((card) => ({
      ...card,
      cardType: card.cardType ?? "credit",
      memo: card.memo ?? "",
    })),
  };
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function rebaseImportedBundleIntoWorkspace(state: AppState, workspaceId: string, bundle: WorkspaceBundle): WorkspaceBundle {
  const scope = getWorkspaceScope(state, workspaceId);

  const categoryIdMap = new Map<string, string>();
  const categoriesToAdd = bundle.categories.flatMap((category) => {
    const matched = scope.categories.find((item) => normalizeKey(item.name) === normalizeKey(category.name));
    if (matched) {
      categoryIdMap.set(category.id, matched.id);
      return [];
    }
    const nextId = createId("category");
    categoryIdMap.set(category.id, nextId);
    return [{ ...category, id: nextId, workspaceId }];
  });

  const tagIdMap = new Map<string, string>();
  const tagsToAdd = bundle.tags.flatMap((tag) => {
    const matched = scope.tags.find((item) => normalizeKey(item.name) === normalizeKey(tag.name));
    if (matched) {
      tagIdMap.set(tag.id, matched.id);
      return [];
    }
    const nextId = createId("tag");
    tagIdMap.set(tag.id, nextId);
    return [{ ...tag, id: nextId, workspaceId }];
  });

  const personIdMap = new Map<string, string>();
  const peopleToAdd = bundle.people.flatMap((person) => {
    const matched = scope.people.find((item) => normalizeKey(item.name) === normalizeKey(person.name));
    if (matched) {
      personIdMap.set(person.id, matched.id);
      return [];
    }
    const nextId = createId("person");
    personIdMap.set(person.id, nextId);
    return [{ ...person, id: nextId, workspaceId }];
  });

  const accountIdMap = new Map<string, string>();
  const accountsToAdd = bundle.accounts.flatMap((account) => {
    const matched = scope.accounts.find((item) => normalizeKey(item.name) === normalizeKey(account.name));
    if (matched) {
      accountIdMap.set(account.id, matched.id);
      return [];
    }
    const nextId = createId("account");
    accountIdMap.set(account.id, nextId);
    return [
      {
        ...account,
        id: nextId,
        workspaceId,
        ownerPersonId: account.ownerPersonId ? (personIdMap.get(account.ownerPersonId) ?? null) : null,
      },
    ];
  });

  const cardIdMap = new Map<string, string>();
  const cardsToAdd = bundle.cards.flatMap((card) => {
    const matched = scope.cards.find((item) => normalizeKey(item.name) === normalizeKey(card.name));
    if (matched) {
      cardIdMap.set(card.id, matched.id);
      return [];
    }
    const nextId = createId("card");
    cardIdMap.set(card.id, nextId);
    return [
      {
        ...card,
        id: nextId,
        workspaceId,
        ownerPersonId: card.ownerPersonId ? (personIdMap.get(card.ownerPersonId) ?? null) : null,
        linkedAccountId: card.linkedAccountId ? (accountIdMap.get(card.linkedAccountId) ?? null) : null,
      },
    ];
  });

  const transactionIdMap = new Map<string, string>();
  const transactions = bundle.transactions.map((transaction) => {
    const nextId = createId("tx");
    transactionIdMap.set(transaction.id, nextId);

    return {
      ...transaction,
      id: nextId,
      workspaceId,
      ownerPersonId: transaction.ownerPersonId ? (personIdMap.get(transaction.ownerPersonId) ?? null) : null,
      cardId: transaction.cardId ? (cardIdMap.get(transaction.cardId) ?? null) : null,
      accountId: transaction.accountId ? (accountIdMap.get(transaction.accountId) ?? null) : null,
      fromAccountId: transaction.fromAccountId ? (accountIdMap.get(transaction.fromAccountId) ?? null) : null,
      toAccountId: transaction.toAccountId ? (accountIdMap.get(transaction.toAccountId) ?? null) : null,
      categoryId: transaction.categoryId ? (categoryIdMap.get(transaction.categoryId) ?? null) : null,
      tagIds: transaction.tagIds.map((tagId) => tagIdMap.get(tagId)).filter((tagId): tagId is string => Boolean(tagId)),
    };
  });

  const reviews = bundle.reviews.map((review) => ({
    ...review,
    id: createId("review"),
    workspaceId,
    primaryTransactionId: transactionIdMap.get(review.primaryTransactionId) ?? review.primaryTransactionId,
    relatedTransactionIds: review.relatedTransactionIds
      .map((relatedId) => transactionIdMap.get(relatedId))
      .filter((id): id is string => Boolean(id)),
  }));

  return {
    workspace: state.workspaces.find((item) => item.id === workspaceId) ?? bundle.workspace,
    financialProfile: scope.financialProfile ?? createFinancialProfileBase(workspaceId),
    people: peopleToAdd,
    accounts: accountsToAdd,
    cards: cardsToAdd,
    categories: categoriesToAdd,
    tags: tagsToAdd,
    transactions,
    reviews,
    imports: [
      {
        id: createId("import"),
        workspaceId,
        fileName: bundle.imports[0]?.fileName ?? bundle.workspace.name,
        importedAt: new Date().toISOString(),
        parserId: bundle.imports[0]?.parserId ?? "household-v2-workbook",
        rowCount: transactions.length,
        reviewCount: reviews.length,
      },
    ],
    settlements: [],
  };
}

function applyTransactionFlagPatch(
  transaction: Transaction,
  patch: {
    isSharedExpense?: boolean;
    isExpenseImpact?: boolean;
    isInternalTransfer?: boolean;
  },
) {
  const nextExpenseImpact =
    typeof patch.isExpenseImpact === "boolean"
      ? patch.isExpenseImpact
      : transaction.transactionType === "transfer" && typeof patch.isInternalTransfer === "boolean"
        ? !patch.isInternalTransfer
        : transaction.isExpenseImpact;

  const requestedSharedExpense = patch.isSharedExpense ?? transaction.isSharedExpense;
  const nextSharedExpense = isActiveExpenseTransaction({
    ...transaction,
    isExpenseImpact: nextExpenseImpact,
  })
    ? requestedSharedExpense
    : false;

  return {
    ...transaction,
    isExpenseImpact: nextExpenseImpact,
    isSharedExpense: nextSharedExpense,
    isInternalTransfer: transaction.transactionType === "transfer" && !nextExpenseImpact,
  };
}

function applyReviewSuggestionToTransactions(transactions: Transaction[], review: ReviewItem) {
  const relatedTransactionId = review.relatedTransactionIds[0] ?? null;

  return transactions.map((transaction) => {
    if (transaction.id !== review.primaryTransactionId) {
      return transaction;
    }

    switch (review.reviewType) {
      case "duplicate_candidate":
        return {
          ...transaction,
          status: "cancelled" as const,
          isExpenseImpact: false,
          isSharedExpense: false,
          isInternalTransfer: false,
          fromAccountId: null,
          toAccountId: null,
        };
      case "refund_candidate":
        return {
          ...transaction,
          transactionType: "income" as const,
          amount: Math.abs(transaction.amount),
          isExpenseImpact: false,
          isSharedExpense: false,
          isInternalTransfer: false,
          categoryId: null,
          refundOfTransactionId: relatedTransactionId,
          fromAccountId: null,
          toAccountId: null,
        };
      case "internal_transfer_candidate":
        return {
          ...transaction,
          transactionType: "transfer" as const,
          isInternalTransfer: true,
          isExpenseImpact: false,
          isSharedExpense: false,
          categoryId: null,
          fromAccountId: transaction.accountId,
          toAccountId: null,
        };
      case "shared_expense_candidate":
        return {
          ...transaction,
          isExpenseImpact: true,
          isSharedExpense: true,
          isInternalTransfer: false,
        };
      default:
        return transaction;
    }
  });
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "setActiveWorkspace":
      return { ...state, activeWorkspaceId: action.payload };
    case "mergeBundle":
      return mergeWorkspaceBundle(state, action.payload);
    case "reset":
      return createEmptyState();
    case "replaceState":
      return action.payload;
    case "resolveReview":
      return {
        ...state,
        reviews: state.reviews.map((review) =>
          review.id === action.payload.reviewId ? { ...review, status: action.payload.status } : review,
        ),
      };
    case "applyReviewSuggestion": {
      const review = state.reviews.find((item) => item.id === action.payload.reviewId);
      if (!review) return state;

      return {
        ...state,
        transactions: applyReviewSuggestionToTransactions(state.transactions, review),
        reviews: state.reviews.map((item) =>
          item.id === action.payload.reviewId ? { ...item, status: "resolved" } : item,
        ),
      };
    }
    case "addPerson":
      return {
        ...state,
        people: [
          ...state.people,
          {
            id: createId("person"),
            workspaceId: action.payload.workspaceId,
            ...action.payload.values,
          },
        ],
      };
    case "updatePerson":
      return {
        ...state,
        people: state.people.map((person) =>
          person.workspaceId === action.payload.workspaceId && person.id === action.payload.personId
            ? { ...person, ...action.payload.values }
            : person,
        ),
      };
    case "addAccount":
      return {
        ...state,
        accounts: [
          ...state.accounts,
          {
            id: createId("account"),
            workspaceId: action.payload.workspaceId,
            ...action.payload.values,
          },
        ],
      };
    case "updateAccount":
      return {
        ...state,
        accounts: state.accounts.map((account) =>
          account.workspaceId === action.payload.workspaceId && account.id === action.payload.accountId
            ? { ...account, ...action.payload.values }
            : account,
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.sourceType === "account" &&
          transaction.accountId === action.payload.accountId
            ? {
                ...transaction,
                ownerPersonId: action.payload.values.isShared ? null : action.payload.values.ownerPersonId,
              }
            : transaction,
        ),
      };
    case "addCard":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            id: createId("card"),
            workspaceId: action.payload.workspaceId,
            ...action.payload.values,
          },
        ],
      };
    case "updateCard":
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.workspaceId === action.payload.workspaceId && card.id === action.payload.cardId
            ? { ...card, ...action.payload.values }
            : card,
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.cardId === action.payload.cardId
            ? {
                ...transaction,
                ownerPersonId: action.payload.values.ownerPersonId,
                accountId: action.payload.values.linkedAccountId,
              }
            : transaction,
        ),
      };
    case "addCategory":
      return {
        ...state,
        categories: [
          ...state.categories,
          {
            id: createId("category"),
            workspaceId: action.payload.workspaceId,
            name: action.payload.name,
            direction: "expense",
            fixedOrVariable: "variable",
            necessity: "discretionary",
            budgetable: true,
            reportable: true,
          },
        ],
      };
    case "addTag":
      return {
        ...state,
        tags: [
          ...state.tags,
          {
            id: createId("tag"),
            workspaceId: action.payload.workspaceId,
            name: action.payload.name,
            color: "#6f42c1",
          },
        ],
      };
    case "setFinancialProfile":
      return {
        ...state,
        financialProfiles: state.financialProfiles.map((profile) =>
          profile.workspaceId === action.payload.workspaceId ? { ...profile, ...action.payload.values } : profile,
        ),
      };
    case "addSettlement":
      return {
        ...state,
        settlements: [
          ...state.settlements,
          {
            id: createId("settlement"),
            workspaceId: action.payload.workspaceId,
            month: action.payload.month,
            fromPersonId: action.payload.fromPersonId,
            toPersonId: action.payload.toPersonId,
            amount: Math.abs(action.payload.amount),
            note: action.payload.note,
            completedAt: new Date().toISOString(),
          },
        ],
      };
    case "addTransaction":
      return {
        ...state,
        transactions: [
          ...state.transactions,
          {
            id: createId("tx"),
            workspaceId: action.payload.workspaceId,
            occurredAt: new Date(action.payload.occurredAt).toISOString(),
            settledAt: action.payload.settledAt ? new Date(action.payload.settledAt).toISOString() : null,
            transactionType: action.payload.transactionType,
            sourceType: action.payload.sourceType,
            ownerPersonId: action.payload.ownerPersonId,
            cardId: action.payload.cardId,
            accountId: action.payload.accountId,
            fromAccountId: action.payload.transactionType === "transfer" ? action.payload.accountId : null,
            toAccountId: null,
            merchantName: action.payload.merchantName,
            description: action.payload.description,
            amount: Math.abs(action.payload.amount),
            categoryId: action.payload.categoryId,
            tagIds: action.payload.tagIds,
            isInternalTransfer: action.payload.transactionType === "transfer" && !action.payload.isExpenseImpact,
            isExpenseImpact: action.payload.isExpenseImpact,
            isSharedExpense: action.payload.isSharedExpense,
            refundOfTransactionId: null,
            status: "active",
          },
        ],
      };
    case "updateTransactionDetails":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? (() => {
                const nextSourceType = action.payload.patch.sourceType ?? transaction.sourceType;
                const nextOwnerPersonId =
                  typeof action.payload.patch.ownerPersonId !== "undefined"
                    ? action.payload.patch.ownerPersonId
                    : transaction.ownerPersonId;
                const nextAccountId =
                  typeof action.payload.patch.accountId !== "undefined"
                    ? action.payload.patch.accountId
                    : transaction.accountId;
                const nextCardId =
                  typeof action.payload.patch.cardId !== "undefined" ? action.payload.patch.cardId : transaction.cardId;

                return {
                  ...transaction,
                  sourceType: nextSourceType,
                  ownerPersonId: nextOwnerPersonId,
                  accountId: nextAccountId,
                  cardId: nextCardId,
                  fromAccountId: transaction.transactionType === "transfer" ? nextAccountId : null,
                  toAccountId: transaction.transactionType === "transfer" ? transaction.toAccountId : null,
                  occurredAt: action.payload.patch.occurredAt ?? transaction.occurredAt,
                  settledAt:
                    typeof action.payload.patch.settledAt !== "undefined"
                      ? action.payload.patch.settledAt
                      : transaction.settledAt,
                  merchantName: action.payload.patch.merchantName ?? transaction.merchantName,
                  description: action.payload.patch.description ?? transaction.description,
                  amount:
                    typeof action.payload.patch.amount === "number"
                      ? Math.abs(action.payload.patch.amount)
                      : transaction.amount,
                };
              })()
            : transaction,
        ),
      };
    case "assignCategory":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? { ...transaction, categoryId: action.payload.categoryId }
            : transaction,
        ),
      };
    case "clearCategory":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? { ...transaction, categoryId: null }
            : transaction,
        ),
      };
    case "assignCategoryByMerchant":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.merchantName === action.payload.merchantName &&
          transaction.isExpenseImpact
            ? { ...transaction, categoryId: action.payload.categoryId }
            : transaction,
        ),
      };
    case "assignCategoryBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? { ...transaction, categoryId: action.payload.categoryId }
            : transaction,
        ),
      };
    }
    case "assignTag":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    case "removeTag":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? {
                ...transaction,
                tagIds: transaction.tagIds.filter((tagId) => tagId !== action.payload.tagId),
              }
            : transaction,
        ),
      };
    case "assignTagBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    }
    case "assignTagByMerchant":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.merchantName === action.payload.merchantName &&
          transaction.isExpenseImpact
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    case "updateTransactionFlags":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? applyTransactionFlagPatch(transaction, action.payload.patch)
            : transaction,
        ),
      };
    default:
      return state;
  }
}

interface AppStateContextValue {
  state: AppState;
  isReady: boolean;
  createEmptyWorkspace: (name?: string) => void;
  createDemoWorkspace: () => Promise<void>;
  previewWorkbookImport: (file: File) => Promise<WorkspaceBundle>;
  commitImportedBundle: (bundle: WorkspaceBundle, fileName: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  resetApp: () => Promise<void>;
  exportState: () => void;
  importState: (file: File) => Promise<void>;
  resolveReview: (reviewId: string) => void;
  dismissReview: (reviewId: string) => void;
  applyReviewSuggestion: (reviewId: string) => void;
  addPerson: (workspaceId: string, input: string | Partial<PersonDraft>) => void;
  updatePerson: (workspaceId: string, personId: string, input: Partial<PersonDraft>) => void;
  addAccount: (workspaceId: string, input: string | Partial<AccountDraft>, institutionName?: string) => void;
  updateAccount: (workspaceId: string, accountId: string, input: Partial<AccountDraft>) => void;
  addCard: (workspaceId: string, input: string | Partial<CardDraft>, issuerName?: string) => void;
  updateCard: (workspaceId: string, cardId: string, input: Partial<CardDraft>) => void;
  addCategory: (workspaceId: string, name: string) => void;
  addTag: (workspaceId: string, name: string) => void;
  setFinancialProfile: (workspaceId: string, values: FinancialProfileInput) => void;
  addSettlement: (input: SettlementInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
  updateTransactionDetails: (
    workspaceId: string,
    transactionId: string,
    patch: {
      sourceType?: Transaction["sourceType"];
      ownerPersonId?: string | null;
      accountId?: string | null;
      cardId?: string | null;
      occurredAt?: string;
      settledAt?: string | null;
      merchantName?: string;
      description?: string;
      amount?: number;
    },
  ) => void;
  assignCategory: (workspaceId: string, transactionId: string, categoryId: string) => void;
  clearCategory: (workspaceId: string, transactionId: string) => void;
  assignCategoryByMerchant: (workspaceId: string, merchantName: string, categoryId: string) => void;
  assignCategoryBatch: (workspaceId: string, transactionIds: string[], categoryId: string) => void;
  assignTag: (workspaceId: string, transactionId: string, tagId: string) => void;
  removeTag: (workspaceId: string, transactionId: string, tagId: string) => void;
  assignTagBatch: (workspaceId: string, transactionIds: string[], tagId: string) => void;
  assignTagByMerchant: (workspaceId: string, merchantName: string, tagId: string) => void;
  updateTransactionFlags: (
    workspaceId: string,
    transactionId: string,
    patch: {
      isSharedExpense?: boolean;
      isExpenseImpact?: boolean;
      isInternalTransfer?: boolean;
    },
  ) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, createEmptyState());
  const [isReady, setIsReady] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    void loadAppState(createEmptyState()).then((stored) => {
      dispatch({ type: "hydrate", payload: normalizeAppState(stored) });
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    void saveAppState(state);
  }, [isReady, state]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      isReady,
      createEmptyWorkspace(name = "새 가계부") {
        const workspace = createWorkspaceBase(name, "empty");
        dispatch({
          type: "mergeBundle",
          payload: {
            workspace,
            financialProfile: createFinancialProfileBase(workspace.id),
            people: [],
            accounts: [],
            cards: [],
            categories: createStarterCategories(workspace.id),
            tags: createStarterTags(workspace.id),
            transactions: [],
            reviews: [],
            imports: [],
            settlements: [],
          },
        });
        showToast(`"${name}" 워크스페이스를 만들었습니다.`, "success");
      },
      async createDemoWorkspace() {
        const { createHouseholdV2DemoBundle } = await import("../../dev/seeds/householdV2Seed");
        dispatch({ type: "mergeBundle", payload: createHouseholdV2DemoBundle() });
        showToast("테스트 워크스페이스를 불러왔습니다.", "success");
      },
      async previewWorkbookImport(file) {
        const { parseHouseholdWorkbook } = await import("../../domain/imports/householdWorkbook");
        const bundle = await parseHouseholdWorkbook(file);
        showToast(`${file.name} 미리보기를 준비했습니다.`, "info");
        return bundle;
      },
      commitImportedBundle(bundle, fileName) {
        const activeWorkspaceId = state.activeWorkspaceId;
        const payload = activeWorkspaceId ? rebaseImportedBundleIntoWorkspace(state, activeWorkspaceId, bundle) : bundle;
        dispatch({ type: "mergeBundle", payload });
        showToast(`${fileName} 업로드를 완료했습니다.`, "success");
      },
      setActiveWorkspace(workspaceId) {
        dispatch({ type: "setActiveWorkspace", payload: workspaceId });
        const workspace = state.workspaces.find((item) => item.id === workspaceId);
        if (workspace) {
          showToast(`${workspace.name}로 전환했습니다.`, "info");
        }
      },
      async resetApp() {
        await clearAppState();
        dispatch({ type: "reset" });
        showToast("로컬 데이터를 초기화했습니다.", "success");
      },
      exportState() {
        const blob = new Blob(
          [
            JSON.stringify(
              {
                appVersion: "0.1.0",
                schemaVersion: state.schemaVersion,
                exportedAt: new Date().toISOString(),
                data: state,
              },
              null,
              2,
            ),
          ],
          { type: "application/json;charset=utf-8" },
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `household-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("백업 파일을 다운로드했습니다.", "success");
      },
      async importState(file) {
        const text = await file.text();
        const parsed = JSON.parse(text) as { data?: AppState };
        if (!parsed.data) {
          showToast("백업 파일 형식을 확인해주세요.", "error");
          throw new Error("backup-data-missing");
        }
        dispatch({ type: "replaceState", payload: normalizeAppState(parsed.data) });
        showToast(`${file.name} 백업을 불러왔습니다.`, "success");
      },
      resolveReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "resolved" } });
        showToast("검토 항목을 확인 완료로 처리했습니다.", "success");
      },
      dismissReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "dismissed" } });
        showToast("검토 항목을 보류 처리했습니다.", "info");
      },
      applyReviewSuggestion(reviewId) {
        dispatch({ type: "applyReviewSuggestion", payload: { reviewId } });
        showToast("검토 제안을 거래 데이터에 반영했습니다.", "success");
      },
      addPerson(workspaceId, input) {
        const values = createPersonDraft(input);
        dispatch({ type: "addPerson", payload: { workspaceId, values } });
        showToast(`${values.displayName || values.name} 사용자를 추가했습니다.`, "success");
      },
      updatePerson(workspaceId, personId, input) {
        const current = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
        if (!current) return;
        const values = createPersonDraft({ ...current, ...input });
        dispatch({ type: "updatePerson", payload: { workspaceId, personId, values } });
        showToast(`${values.displayName || values.name} 정보를 저장했습니다.`, "success");
      },
      addAccount(workspaceId, input, institutionName) {
        const values = createAccountDraft(input, institutionName);
        dispatch({ type: "addAccount", payload: { workspaceId, values } });
        showToast(`${values.alias || values.name} 계좌를 추가했습니다.`, "success");
      },
      updateAccount(workspaceId, accountId, input) {
        const current = state.accounts.find((item) => item.workspaceId === workspaceId && item.id === accountId);
        if (!current) return;
        const values = createAccountDraft({ ...current, ...input });
        dispatch({ type: "updateAccount", payload: { workspaceId, accountId, values } });
        showToast(`${values.alias || values.name} 계좌 정보를 저장했습니다.`, "success");
      },
      addCard(workspaceId, input, issuerName) {
        const values = createCardDraft(input, issuerName);
        dispatch({ type: "addCard", payload: { workspaceId, values } });
        showToast(`${values.name} 카드를 추가했습니다.`, "success");
      },
      updateCard(workspaceId, cardId, input) {
        const current = state.cards.find((item) => item.workspaceId === workspaceId && item.id === cardId);
        if (!current) return;
        const values = createCardDraft({ ...current, ...input });
        dispatch({ type: "updateCard", payload: { workspaceId, cardId, values } });
        showToast(`${values.name} 카드 정보를 저장했습니다.`, "success");
      },
      addCategory(workspaceId, name) {
        dispatch({ type: "addCategory", payload: { workspaceId, name } });
        showToast(`${name} 카테고리를 추가했습니다.`, "success");
      },
      addTag(workspaceId, name) {
        dispatch({ type: "addTag", payload: { workspaceId, name } });
        showToast(`${name} 태그를 추가했습니다.`, "success");
      },
      setFinancialProfile(workspaceId, values) {
        dispatch({ type: "setFinancialProfile", payload: { workspaceId, values } });
        showToast("재무 기준값을 저장했습니다.", "success");
      },
      addSettlement(input) {
        dispatch({ type: "addSettlement", payload: input });
        showToast("정산 완료 내역을 기록했습니다.", "success");
      },
      addTransaction(input) {
        dispatch({ type: "addTransaction", payload: input });
        showToast(`${input.merchantName} 거래를 추가했습니다.`, "success");
      },
      updateTransactionDetails(workspaceId, transactionId, patch) {
        dispatch({ type: "updateTransactionDetails", payload: { workspaceId, transactionId, patch } });
        showToast("거래 기본 정보를 수정했습니다.", "success");
      },
      assignCategory(workspaceId, transactionId, categoryId) {
        dispatch({ type: "assignCategory", payload: { workspaceId, transactionId, categoryId } });
        showToast("거래 카테고리를 지정했습니다.", "success");
      },
      clearCategory(workspaceId, transactionId) {
        dispatch({ type: "clearCategory", payload: { workspaceId, transactionId } });
        showToast("거래 카테고리를 해제했습니다.", "success");
      },
      assignCategoryByMerchant(workspaceId, merchantName, categoryId) {
        dispatch({ type: "assignCategoryByMerchant", payload: { workspaceId, merchantName, categoryId } });
        showToast(`${merchantName} 반복 거래에 카테고리를 반영했습니다.`, "success");
      },
      assignCategoryBatch(workspaceId, transactionIds, categoryId) {
        dispatch({ type: "assignCategoryBatch", payload: { workspaceId, transactionIds, categoryId } });
        const category = state.categories.find((item) => item.id === categoryId);
        showToast(`${transactionIds.length}건 거래에 ${category?.name ?? "카테고리"}를 일괄 반영했습니다.`, "success");
      },
      assignTag(workspaceId, transactionId, tagId) {
        dispatch({ type: "assignTag", payload: { workspaceId, transactionId, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${tag?.name ?? "태그"} 태그를 거래에 추가했습니다.`, "success");
      },
      removeTag(workspaceId, transactionId, tagId) {
        dispatch({ type: "removeTag", payload: { workspaceId, transactionId, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${tag?.name ?? "태그"} 태그를 거래에서 제거했습니다.`, "success");
      },
      assignTagBatch(workspaceId, transactionIds, tagId) {
        dispatch({ type: "assignTagBatch", payload: { workspaceId, transactionIds, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${transactionIds.length}건 거래에 ${tag?.name ?? "태그"}를 일괄 반영했습니다.`, "success");
      },
      assignTagByMerchant(workspaceId, merchantName, tagId) {
        dispatch({ type: "assignTagByMerchant", payload: { workspaceId, merchantName, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${merchantName} 반복 거래에 ${tag?.name ?? "태그"}를 반영했습니다.`, "success");
      },
      updateTransactionFlags(workspaceId, transactionId, patch) {
        dispatch({ type: "updateTransactionFlags", payload: { workspaceId, transactionId, patch } });
        if (typeof patch.isSharedExpense === "boolean") {
          showToast(
            patch.isSharedExpense ? "거래를 공동지출로 표시했습니다." : "거래의 공동지출 표시를 해제했습니다.",
            "success",
          );
          return;
        }
        if (typeof patch.isInternalTransfer === "boolean") {
          showToast(
            patch.isInternalTransfer ? "거래를 내부이체로 표시했습니다." : "거래의 내부이체 표시를 해제했습니다.",
            "success",
          );
          return;
        }
        if (typeof patch.isExpenseImpact === "boolean") {
          showToast(
            patch.isExpenseImpact ? "거래를 다시 통계에 반영합니다." : "거래를 통계 제외 흐름으로 변경했습니다.",
            "success",
          );
        }
      },
    }),
    [isReady, showToast, state],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
