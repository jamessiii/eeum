import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type PropsWithChildren } from "react";
import {
  createEmptyState,
  createDefaultLoopPriorityCategoryIds,
  createFinancialProfileBase,
  createStarterCategories,
  createStarterTags,
  createWorkspaceBase,
  mergeWorkspaceBundle,
} from "../../domain/app/defaults";
import {
  createBackupContent,
  createWorkspaceDataPackageContent,
  parseBackupPayload,
  parseWorkspaceDataPackage,
  restoreBackupGuideData,
  type WorkspaceDataPackageKind,
} from "../../domain/app/backup";
import { isActiveExpenseTransaction } from "../../domain/transactions/meta";
import { clearGuideSampleState, hasGuideSampleState, readGuideSampleState, writeGuideSampleState } from "../../domain/guidance/guideSampleState";
import { clearGuideSampleBackup, readGuideSampleBackup, writeGuideSampleBackup } from "../../domain/guidance/guideSampleBackup";
import { clearGuideActionBackup, readGuideActionBackup, writeGuideActionBackup } from "../../domain/guidance/guideActionBackup";
import { createGuideSampleBundle, GUIDE_SAMPLE_MEMO, GUIDE_SAMPLE_PARSER_ID } from "../../domain/guidance/guideSampleBundle";
import type { Account, AppState, Card, Category, FinancialProfile, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";
import { loadServerAppState, requestServerJson, type ServerStateMeta } from "../api/serverState";
import { AUTH_SESSION_EVENT, clearAuthSession, readAuthSession, type AuthSession } from "../authSession";
import { createStompFrame, parseStompMessageBodies } from "../realtime/stomp";
import { useToast } from "../toast/ToastProvider";
import { getWorkspaceScope } from "./selectors";
import { getManagedLoopGroups, type ManagedLoopGroup } from "../../domain/loops/managedLoops";
import { getLoopRecommendations, type LoopRecommendation } from "../../domain/loops/loopRecommendations";
import { getLoopStationInsightsFromManagedLoops, type LoopStationInsight } from "../../domain/loops/loopStation";
import { buildLoopRules, type LoopRule } from "../../domain/loops/loopRules";

const EMPTY_SERVER_META: ServerStateMeta = {
  categorySchemeIdByWorkspaceId: {},
  tagSchemeIdByWorkspaceId: {},
  personRevisionById: {},
  assetRevisionById: {},
  categoryRevisionById: {},
  tagRevisionById: {},
  transactionRevisionById: {},
  reviewRevisionById: {},
  importRevisionById: {},
  settlementRevisionById: {},
  incomeRevisionById: {},
  financialProfileRevisionByWorkspaceId: {},
};

type SyncEventMessage = {
  id: number;
  spaceId: number;
  aggregateKind: string;
  aggregateId: string;
  eventType: string;
  revisionNumber: number;
  payloadSummary: string;
  sessionKey: string | null;
  createdAt: string;
};

const PERSON_ROLE_TO_SERVER = {
  owner: "OWNER",
  member: "MEMBER",
} as const;

const ACCOUNT_GROUP_TYPE_TO_SERVER = {
  personal: "PERSONAL",
  meeting: "MEETING",
} as const;

const ACCOUNT_TYPE_TO_SERVER = {
  checking: "CHECKING",
  savings: "SAVINGS",
  loan: "LOAN",
  cash: "CASH",
  other: "OTHER",
} as const;

const ASSET_USAGE_TYPE_TO_SERVER = {
  daily: "DAILY",
  salary: "SALARY",
  shared: "SHARED",
  card_payment: "CARD_PAYMENT",
  savings: "SAVINGS",
  investment: "INVESTMENT",
  loan: "LOAN",
  other: "OTHER",
} as const;

const CARD_TYPE_TO_SERVER = {
  credit: "CREDIT",
  check: "CHECK",
  debit: "DEBIT",
  prepaid: "PREPAID",
  other: "OTHER",
} as const;

const CATEGORY_DIRECTION_TO_SERVER = {
  expense: "EXPENSE",
  income: "INCOME",
  transfer: "TRANSFER",
  mixed: "MIXED",
} as const;

const CATEGORY_CADENCE_TO_SERVER = {
  fixed: "FIXED",
  variable: "VARIABLE",
} as const;

const CATEGORY_NECESSITY_TO_SERVER = {
  essential: "ESSENTIAL",
  discretionary: "DISCRETIONARY",
} as const;

const REVIEW_TYPE_TO_SERVER = {
  duplicate_candidate: "DUPLICATE_CANDIDATE",
  refund_candidate: "REFUND_CANDIDATE",
  category_suggestion: "CATEGORY_SUGGESTION",
  uncategorized_transaction: "UNCATEGORIZED_TRANSACTION",
  internal_transfer_candidate: "INTERNAL_TRANSFER_CANDIDATE",
  shared_expense_candidate: "SHARED_EXPENSE_CANDIDATE",
} as const;

function toNullableNumber(value: string | null | undefined) {
  if (!value) return null;
  return Number(value);
}

function findRootCategoryGroupId(categories: Category[], categoryId: string | null): string | null {
  let currentId = categoryId;
  while (currentId) {
    const current = categories.find((item) => item.id === currentId);
    if (!current) return null;
    if (current.categoryType === "group") return current.id;
    currentId = current.parentCategoryId;
  }

  return null;
}

type PersonDraft = Pick<Person, "name" | "displayName" | "role" | "memo" | "isActive" | "sortOrder" | "isHidden">;
type AccountDraft = Pick<
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
  | "sortOrder"
  | "isHidden"
>;
type CardDraft = Pick<Card, "ownerPersonId" | "name" | "issuerName" | "cardNumberMasked" | "linkedAccountId" | "cardType" | "memo" | "sortOrder" | "isHidden">;
type CategoryDraft = Pick<
  Category,
  | "name"
  | "categoryType"
  | "parentCategoryId"
  | "linkedAccountId"
  | "sortOrder"
  | "isHidden"
  | "direction"
  | "fixedOrVariable"
  | "necessity"
  | "budgetable"
  | "reportable"
>;

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
  "monthlyNetIncome" | "targetSavingsRate" | "warningSpendRate" | "warningFixedCostRate" | "loopPriorityCategoryIds"
>;

type SettlementInput = {
  workspaceId: string;
  month: string;
  transferKey: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  note: string;
};

type IncomeEntryInput = {
  workspaceId: string;
  ownerPersonId: string | null;
  occurredAt: string;
  sourceName: string;
  amount: number;
};

type Action =
  | { type: "hydrate"; payload: AppState }
  | { type: "setActiveWorkspace"; payload: string }
  | { type: "renameWorkspace"; payload: { workspaceId: string; name: string } }
  | { type: "mergeBundle"; payload: WorkspaceBundle }
  | { type: "reset" }
  | { type: "replaceState"; payload: AppState }
  | { type: "resolveReview"; payload: { reviewId: string; status: "resolved" | "dismissed" } }
  | { type: "applyReviewSuggestion"; payload: { reviewId: string } }
  | { type: "addPerson"; payload: { workspaceId: string; values: PersonDraft } }
  | { type: "updatePerson"; payload: { workspaceId: string; personId: string; values: PersonDraft } }
  | { type: "deletePerson"; payload: { workspaceId: string; personId: string } }
  | { type: "movePerson"; payload: { workspaceId: string; personId: string; targetIndex: number } }
  | { type: "addAccount"; payload: { workspaceId: string; values: AccountDraft } }
  | { type: "updateAccount"; payload: { workspaceId: string; accountId: string; values: AccountDraft } }
  | { type: "deleteAccount"; payload: { workspaceId: string; accountId: string } }
  | { type: "moveAccount"; payload: { workspaceId: string; accountId: string; targetOwnerPersonId: string | null; targetIndex: number } }
  | { type: "addCard"; payload: { workspaceId: string; values: CardDraft } }
  | { type: "updateCard"; payload: { workspaceId: string; cardId: string; values: CardDraft } }
  | { type: "deleteCard"; payload: { workspaceId: string; cardId: string } }
  | { type: "moveCard"; payload: { workspaceId: string; cardId: string; targetOwnerPersonId: string | null; targetIndex: number } }
  | { type: "addCategory"; payload: { workspaceId: string; values: CategoryDraft } }
  | { type: "updateCategory"; payload: { workspaceId: string; categoryId: string; values: CategoryDraft } }
  | { type: "deleteCategory"; payload: { workspaceId: string; categoryId: string } }
  | { type: "moveCategory"; payload: { workspaceId: string; categoryId: string; targetParentCategoryId: string | null; targetIndex: number } }
  | { type: "resetCategoriesToDefaults"; payload: { workspaceId: string } }
  | { type: "addTag"; payload: { workspaceId: string; name: string } }
  | { type: "setFinancialProfile"; payload: { workspaceId: string; values: FinancialProfileInput } }
  | { type: "addSettlement"; payload: SettlementInput }
  | { type: "removeSettlement"; payload: { workspaceId: string; month: string; transferKey: string } }
  | { type: "addIncomeEntry"; payload: IncomeEntryInput }
  | { type: "deleteIncomeEntry"; payload: { workspaceId: string; incomeEntryId: string } }
  | { type: "addTransaction"; payload: NewTransactionInput }
  | {
      type: "updateTransactionDetails";
      payload: {
        workspaceId: string;
        transactionId: string;
        patch: {
          transactionType?: Transaction["transactionType"];
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
            isLoop?: boolean;
            isLoopIgnored?: boolean;
            loopGroupOverrideKey?: string | null;
            loopDisplayName?: string | null;
          };
        };
      }
  | {
      type: "setTransactionLoopFlagBatch";
      payload: {
        workspaceId: string;
        transactionIds: string[];
        isLoop: boolean;
      };
    }
  | {
      type: "setTransactionLoopIgnoredBatch";
      payload: {
        workspaceId: string;
        transactionIds: string[];
        isLoopIgnored: boolean;
      };
    }
  | {
      type: "setTransactionLoopGroupOverrideBatch";
        payload: {
          workspaceId: string;
          transactionIds: string[];
          loopGroupOverrideKey: string | null;
          isLoop?: boolean;
        };
      }
    | {
        type: "setTransactionLoopDisplayNameBatch";
        payload: {
          workspaceId: string;
          transactionIds: string[];
          loopDisplayName: string | null;
        };
      }
  | { type: "deleteImportRecord"; payload: { workspaceId: string; importRecordId: string } };

function createPersonDraft(input: string | Partial<PersonDraft>): PersonDraft {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return {
      name: trimmed,
      displayName: trimmed,
      role: "member",
      memo: "",
      isActive: true,
      sortOrder: 0,
      isHidden: false,
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
    sortOrder: input.sortOrder ?? 0,
    isHidden: input.isHidden ?? false,
  };
}

function createAccountDraft(input: string | Partial<AccountDraft>, institutionName?: string): AccountDraft {
  if (typeof input === "string") {
    return {
      ownerPersonId: null,
      primaryPersonId: null,
      participantPersonIds: [],
      accountGroupType: "personal",
      name: input.trim(),
      alias: "",
      institutionName: institutionName?.trim() || "직접입력",
      accountNumberMasked: "",
      accountType: "checking",
      usageType: "daily",
      isShared: false,
      memo: "",
      sortOrder: 0,
      isHidden: false,
    };
  }

  const isShared = input.isShared ?? false;
  const accountGroupType = input.accountGroupType ?? "personal";
  const primaryPersonId = input.primaryPersonId ?? input.ownerPersonId ?? null;
  const participantPersonIds = Array.from(
    new Set(
      [...(input.participantPersonIds ?? []), ...(accountGroupType === "meeting" && primaryPersonId ? [primaryPersonId] : [])].filter(
        (personId): personId is string => Boolean(personId),
      ),
    ),
  );

  return {
    ownerPersonId: input.ownerPersonId ?? null,
    primaryPersonId,
    participantPersonIds,
    accountGroupType,
    name: String(input.name ?? "").trim(),
    alias: String(input.alias ?? "").trim(),
    institutionName: String(input.institutionName ?? "").trim() || "직접입력",
    accountNumberMasked: String(input.accountNumberMasked ?? "").trim(),
    accountType: input.accountType ?? "checking",
    usageType: accountGroupType === "meeting" ? "shared" : isShared ? "shared" : input.usageType ?? "daily",
    isShared: accountGroupType === "meeting" ? true : isShared,
    memo: String(input.memo ?? "").trim(),
    sortOrder: input.sortOrder ?? 0,
    isHidden: input.isHidden ?? false,
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
      sortOrder: 0,
      isHidden: false,
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
    sortOrder: input.sortOrder ?? 0,
    isHidden: input.isHidden ?? false,
  };
}

function createCategoryDraft(input: string | Partial<CategoryDraft>, parentCategoryId: string | null = null): CategoryDraft {
  if (typeof input === "string") {
    return {
      name: input.trim(),
      categoryType: "category",
      parentCategoryId,
      linkedAccountId: null,
      sortOrder: 0,
      isHidden: false,
      direction: "expense",
      fixedOrVariable: "variable",
      necessity: "discretionary",
      budgetable: true,
      reportable: true,
    };
  }

  return {
    name: String(input.name ?? "").trim(),
    categoryType: input.categoryType === "group" ? "group" : "category",
    parentCategoryId: input.categoryType === "group" ? null : input.parentCategoryId ?? null,
    linkedAccountId: input.categoryType === "group" ? null : input.linkedAccountId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isHidden: input.isHidden ?? false,
    direction: input.direction ?? "expense",
    fixedOrVariable: input.fixedOrVariable ?? "variable",
    necessity: input.necessity ?? "discretionary",
    budgetable: input.budgetable ?? true,
    reportable: input.reportable ?? true,
  };
}

function normalizeAppState(rawState: AppState): AppState {
  const validAccountIds = new Set(rawState.accounts.map((account) => `${account.workspaceId}:${account.id}`));
  const normalizedState = {
    ...rawState,
    schemaVersion: Math.max(rawState.schemaVersion ?? 0, 9),
    financialProfiles: rawState.financialProfiles.map((profile) => ({
      ...profile,
      loopPriorityCategoryIds:
        (rawState.schemaVersion ?? 0) < 9
          ? Array.from(
              new Set([
                ...(profile.loopPriorityCategoryIds ?? []),
                ...createDefaultLoopPriorityCategoryIds(
                  rawState.categories.filter((category) => category.workspaceId === profile.workspaceId),
                ),
              ]),
            )
          : (profile.loopPriorityCategoryIds?.length ?? 0) > 0
            ? profile.loopPriorityCategoryIds ?? []
            : createDefaultLoopPriorityCategoryIds(
                rawState.categories.filter((category) => category.workspaceId === profile.workspaceId),
              ),
    })),
    people: rawState.people.map((person) => ({
      ...person,
      displayName: person.displayName ?? person.name,
      memo: person.memo ?? "",
      isActive: person.isActive ?? true,
      sortOrder: person.sortOrder ?? 0,
      isHidden: person.isHidden ?? false,
    })),
    accounts: rawState.accounts.map((account) => ({
      ...account,
      primaryPersonId: account.primaryPersonId ?? account.ownerPersonId ?? null,
      participantPersonIds: Array.from(
        new Set(
          [...(account.participantPersonIds ?? []), ...(account.accountGroupType === "meeting" && (account.primaryPersonId ?? account.ownerPersonId) ? [account.primaryPersonId ?? account.ownerPersonId!] : [])].filter(
            (personId): personId is string => Boolean(personId),
          ),
        ),
      ),
      accountGroupType: account.accountGroupType ?? (account.isShared ? "meeting" : "personal"),
      alias: account.alias ?? "",
      usageType: account.usageType ?? (account.isShared ? "shared" : "daily"),
      memo: account.memo ?? "",
      createdImportRecordId: account.createdImportRecordId ?? null,
      sortOrder: account.sortOrder ?? 0,
      isHidden: account.isHidden ?? false,
    })),
    cards: rawState.cards.map((card) => ({
      ...card,
      cardType: card.cardType ?? "credit",
      memo: card.memo ?? "",
      createdImportRecordId: card.createdImportRecordId ?? null,
      sortOrder: card.sortOrder ?? 0,
      isHidden: card.isHidden ?? false,
    })),
    categories: rawState.categories.map((category) => ({
      ...category,
      categoryType: category.categoryType ?? "category",
      parentCategoryId: category.parentCategoryId ?? null,
      linkedAccountId:
        category.linkedAccountId && validAccountIds.has(`${category.workspaceId}:${category.linkedAccountId}`)
          ? category.linkedAccountId
          : null,
      sortOrder: category.sortOrder ?? 0,
      isHidden: category.isHidden ?? false,
      direction: category.direction ?? "expense",
      fixedOrVariable: category.fixedOrVariable ?? "variable",
      necessity: category.necessity ?? "discretionary",
      budgetable: category.budgetable ?? true,
      reportable: category.reportable ?? true,
    })),
    transactions: rawState.transactions.map((transaction) => ({
      ...transaction,
        importRecordId: transaction.importRecordId ?? null,
        isLoop: transaction.isLoop ?? false,
        isLoopIgnored: transaction.isLoopIgnored ?? false,
        loopGroupOverrideKey: transaction.loopGroupOverrideKey ?? null,
        loopDisplayName: transaction.loopDisplayName ?? null,
      })),
    reviews: rawState.reviews.map((review) => ({
      ...review,
      importRecordId: review.importRecordId ?? null,
    })),
    imports: rawState.imports.map((record) => ({
      ...record,
      statementMonth: record.statementMonth ?? null,
      fileFingerprint: record.fileFingerprint ?? null,
      contentFingerprint: record.contentFingerprint ?? null,
    })),
    settlements: (rawState.settlements ?? []).map((record) => ({
      ...record,
      transferKey:
        record.transferKey ??
        (record.fromAccountId && record.toAccountId ? `${record.fromAccountId}->${record.toAccountId}` : createId("settlement-legacy")),
      fromAccountId: record.fromAccountId ?? null,
      toAccountId: record.toAccountId ?? null,
    })),
    incomeEntries: (rawState.incomeEntries ?? []).map((entry) => ({
      ...entry,
      ownerPersonId: entry.ownerPersonId ?? null,
      sourceName: entry.sourceName ?? "",
      createdAt: entry.createdAt ?? entry.occurredAt,
    })),
  };

  return normalizeCategoryStructure(normalizedState);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCardMatchKey(value: string) {
  return normalizeKey(value).replace(/\s+/g, "");
}

function getVisibleCardIdentifier(cardNumberMasked: string) {
  const trimmed = cardNumberMasked.trim();
  if (!trimmed) return "";
  return /\d/.test(trimmed) ? trimmed : "";
}

function findMatchedImportedCard(existingCards: Card[], incomingCard: Card, ownerPersonId: string | null) {
  const matchInCandidates = (candidates: Card[]) => {
    const incomingCardIdentifier = getVisibleCardIdentifier(incomingCard.cardNumberMasked);

    return (
      candidates.find(
        (candidate) =>
          candidate.issuerName === incomingCard.issuerName &&
          getVisibleCardIdentifier(candidate.cardNumberMasked) &&
          incomingCardIdentifier &&
          normalizeCardMatchKey(getVisibleCardIdentifier(candidate.cardNumberMasked)) ===
            normalizeCardMatchKey(incomingCardIdentifier),
      ) ??
      candidates.find((candidate) => normalizeCardMatchKey(candidate.name) === normalizeCardMatchKey(incomingCard.name)) ??
      null
    );
  };

  const ownedCards = existingCards.filter((card) => (card.ownerPersonId ?? null) === ownerPersonId);
  if (!ownerPersonId) {
    return matchInCandidates(ownedCards);
  }

  const unownedCards = existingCards.filter((card) => (card.ownerPersonId ?? null) === null);
  return matchInCandidates(ownedCards) ?? matchInCandidates(unownedCards);
}

function normalizeCategoryLabelKey(value: string) {
  return normalizeKey(value).replace(/\s+/g, "");
}

const FIRST_DAILY_ACCOUNT_AUTO_LINK_GROUP_KEYS = new Set(
  ["주거/고정비", "생활비", "교통/차량", "의료/건강", "가족/관계", "데이트/여행", "세금/공과", "기부금"].map(
    normalizeCategoryLabelKey,
  ),
);

const FIRST_DAILY_ACCOUNT_AUTO_LINK_CATEGORY_KEYS = new Set(["생필품"].map(normalizeCategoryLabelKey));

const FIRST_LOAN_ACCOUNT_AUTO_LINK_GROUP_KEYS = new Set(["대출/부채"].map(normalizeCategoryLabelKey));

function shouldAutoLinkFirstDailyAccount(state: AppState, workspaceId: string, accountId: string | null, usageType: Account["usageType"]) {
  if (usageType !== "daily") return false;

  return !state.accounts.some(
    (account) =>
      account.workspaceId === workspaceId &&
      account.usageType === "daily" &&
      (accountId ? account.id !== accountId : true),
  );
}

function shouldAutoLinkFirstLoanAccount(state: AppState, workspaceId: string, accountId: string | null, usageType: Account["usageType"]) {
  if (usageType !== "loan") return false;

  return !state.accounts.some(
    (account) =>
      account.workspaceId === workspaceId &&
      account.usageType === "loan" &&
      (accountId ? account.id !== accountId : true),
  );
}

function autoLinkCategoriesToFirstDailyAccount(categories: Category[], workspaceId: string, accountId: string) {
  const workspaceCategories = categories.filter((category) => category.workspaceId === workspaceId);
  const categoryMap = new Map(workspaceCategories.map((category) => [category.id, category]));

  return categories.map((category) => {
    if (category.workspaceId !== workspaceId || category.categoryType !== "category" || category.linkedAccountId) {
      return category;
    }

    const parentCategory = category.parentCategoryId ? categoryMap.get(category.parentCategoryId) ?? null : null;
    const categoryKey = normalizeCategoryLabelKey(category.name);
    const parentKey = parentCategory ? normalizeCategoryLabelKey(parentCategory.name) : "";
    const shouldAutoLink =
      FIRST_DAILY_ACCOUNT_AUTO_LINK_CATEGORY_KEYS.has(categoryKey) ||
      (parentCategory ? FIRST_DAILY_ACCOUNT_AUTO_LINK_GROUP_KEYS.has(parentKey) : false);

    return shouldAutoLink ? { ...category, linkedAccountId: accountId } : category;
  });
}

function autoLinkCategoriesToFirstLoanAccount(categories: Category[], workspaceId: string, accountId: string) {
  const workspaceCategories = categories.filter((category) => category.workspaceId === workspaceId);
  const categoryMap = new Map(workspaceCategories.map((category) => [category.id, category]));

  return categories.map((category) => {
    if (category.workspaceId !== workspaceId || category.categoryType !== "category" || category.linkedAccountId) {
      return category;
    }

    const parentCategory = category.parentCategoryId ? categoryMap.get(category.parentCategoryId) ?? null : null;
    const parentKey = parentCategory ? normalizeCategoryLabelKey(parentCategory.name) : "";
    const shouldAutoLink = parentCategory ? FIRST_LOAN_ACCOUNT_AUTO_LINK_GROUP_KEYS.has(parentKey) : false;

    return shouldAutoLink ? { ...category, linkedAccountId: accountId } : category;
  });
}

function resolveCategoryRemap(categoryId: string, remapMap: Map<string, string>) {
  let resolvedId = categoryId;
  const visited = new Set<string>();

  while (remapMap.has(resolvedId) && !visited.has(resolvedId)) {
    visited.add(resolvedId);
    resolvedId = remapMap.get(resolvedId) ?? resolvedId;
  }

  return resolvedId;
}

function chooseCanonicalCategory(categories: Category[]) {
  return [...categories].sort((left, right) => {
    if (left.isHidden !== right.isHidden) return Number(left.isHidden) - Number(right.isHidden);
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id.localeCompare(right.id);
  })[0];
}

function normalizeCategoryStructure(state: AppState): AppState {
  if (!state.categories.length) return state;

  let categoriesChanged = false;
  const remappedCategoryIds = new Map<string, string>();
  const transactionCategoryReferenceRemaps = new Map<string, string>();
  const normalizedCategories: Category[] = [];
  const workspaceIds = Array.from(new Set(state.categories.map((category) => category.workspaceId)));

  for (const workspaceId of workspaceIds) {
    const hadInvalidRootGroup = state.categories.some(
      (category) => category.workspaceId === workspaceId && category.categoryType === "group" && category.parentCategoryId !== null,
    );
    let workspaceCategories = state.categories
      .filter((category) => category.workspaceId === workspaceId)
      .map((category) =>
        category.categoryType === "group" && category.parentCategoryId !== null
          ? { ...category, parentCategoryId: null }
          : category,
      );

    if (hadInvalidRootGroup) {
      categoriesChanged = true;
    }

    const starterGroups = createStarterCategories(workspaceId).filter((category) => category.categoryType === "group");
    const fallbackGroupTemplate =
      starterGroups.find((category) => normalizeKey(category.name) === normalizeKey("생활비")) ?? starterGroups[0] ?? null;
    const fallbackGroupName = fallbackGroupTemplate?.name ?? "생활비";

    const ensureStarterGroup = (groupName: string, template = starterGroups.find((category) => normalizeKey(category.name) === normalizeKey(groupName)) ?? null) => {
      const existingGroup = workspaceCategories.find(
        (category) => category.categoryType === "group" && normalizeKey(category.name) === normalizeKey(groupName),
      );
      if (existingGroup) return existingGroup;

      const rootGroups = workspaceCategories.filter((category) => category.categoryType === "group");
      const nextGroup: Category = {
        id: createId("category"),
        workspaceId,
        name: template?.name ?? groupName,
        categoryType: "group",
        parentCategoryId: null,
        sortOrder: rootGroups.length,
        isHidden: false,
        direction: template?.direction ?? "expense",
        fixedOrVariable: template?.fixedOrVariable ?? "variable",
        necessity: template?.necessity ?? "discretionary",
        budgetable: template?.budgetable ?? true,
        reportable: template?.reportable ?? true,
      };

      workspaceCategories = [...workspaceCategories, nextGroup];
      categoriesChanged = true;
      return nextGroup;
    };

    const ensureFallbackGroup = () => ensureStarterGroup(fallbackGroupName, fallbackGroupTemplate);

    const isValidGroupId = (groupId: string | null) =>
      Boolean(groupId && workspaceCategories.some((category) => category.categoryType === "group" && category.id === groupId));

    const personalExpenseName = "개인지출";
    const personalExpenseCategories = workspaceCategories.filter(
      (category) =>
        category.categoryType === "category" &&
        normalizeCategoryLabelKey(category.name) === normalizeCategoryLabelKey(personalExpenseName),
    );

    if (personalExpenseCategories.length) {
      const personalGroup = ensureStarterGroup("개인");
      let targetPersonalCategory =
        workspaceCategories.find(
          (category) =>
            category.categoryType === "category" &&
            category.parentCategoryId === personalGroup.id &&
            normalizeCategoryLabelKey(category.name) === normalizeCategoryLabelKey(personalExpenseName),
        ) ?? null;

      if (!targetPersonalCategory) {
        const canonicalPersonalCategory = chooseCanonicalCategory(personalExpenseCategories);
        workspaceCategories = workspaceCategories.map((category) =>
          category.id === canonicalPersonalCategory.id
            ? {
                ...category,
                name: personalExpenseName,
                parentCategoryId: personalGroup.id,
                fixedOrVariable: "variable",
                necessity: "discretionary",
              }
            : category,
        );
        targetPersonalCategory =
          workspaceCategories.find((category) => category.id === canonicalPersonalCategory.id) ?? null;
        categoriesChanged = true;
      }

      if (
        targetPersonalCategory &&
        (targetPersonalCategory.name !== personalExpenseName || targetPersonalCategory.parentCategoryId !== personalGroup.id)
      ) {
        const targetPersonalCategoryId = targetPersonalCategory.id;
        workspaceCategories = workspaceCategories.map((category) =>
          category.id === targetPersonalCategoryId
            ? {
                ...category,
                name: personalExpenseName,
                parentCategoryId: personalGroup.id,
                fixedOrVariable: "variable",
                necessity: "discretionary",
              }
            : category,
        );
        targetPersonalCategory =
          workspaceCategories.find((category) => category.id === targetPersonalCategoryId) ?? targetPersonalCategory;
        categoriesChanged = true;
      }

      personalExpenseCategories.forEach((category) => {
        if (!targetPersonalCategory || category.id === targetPersonalCategory.id) return;
        remappedCategoryIds.set(category.id, targetPersonalCategory.id);
        categoriesChanged = true;
      });
    }

    const legacyFoodGroup = workspaceCategories.find(
      (category) => category.categoryType === "group" && normalizeKey(category.name) === normalizeKey("식비"),
    );

    if (legacyFoodGroup) {
      const livingGroup = ensureStarterGroup("생활비");
      const legacyFoodChildren = workspaceCategories.filter(
        (category) => category.categoryType === "category" && category.parentCategoryId === legacyFoodGroup.id,
      );

      if (legacyFoodChildren.length) {
        const legacyFoodChildIds = new Set(legacyFoodChildren.map((category) => category.id));
        workspaceCategories = workspaceCategories.map((category) =>
          legacyFoodChildIds.has(category.id)
            ? {
                ...category,
                parentCategoryId: livingGroup.id,
                fixedOrVariable: "variable",
                necessity: "essential",
              }
            : category,
        );
      }

      workspaceCategories = workspaceCategories.filter((category) => category.id !== legacyFoodGroup.id);
      categoriesChanged = true;
    }

    const orphanLeafCategories = workspaceCategories.filter(
      (category) => category.categoryType === "category" && !isValidGroupId(category.parentCategoryId),
    );

    orphanLeafCategories.forEach((orphanCategory) => {
      const normalizedName = normalizeKey(orphanCategory.name);
      const directMatches = workspaceCategories.filter(
        (category) =>
          category.id !== orphanCategory.id &&
          category.categoryType === "category" &&
          isValidGroupId(category.parentCategoryId) &&
          normalizeKey(category.name) === normalizedName,
      );

      if (directMatches.length === 1) {
        remappedCategoryIds.set(orphanCategory.id, directMatches[0].id);
        categoriesChanged = true;
        return;
      }

      const fallbackGroup = ensureFallbackGroup();
      const fallbackMatch = workspaceCategories.find(
        (category) =>
          category.id !== orphanCategory.id &&
          category.categoryType === "category" &&
          category.parentCategoryId === fallbackGroup.id &&
          normalizeKey(category.name) === normalizedName,
      );

      if (fallbackMatch) {
        remappedCategoryIds.set(orphanCategory.id, fallbackMatch.id);
        categoriesChanged = true;
        return;
      }

      workspaceCategories = workspaceCategories.map((category) =>
        category.id === orphanCategory.id ? { ...category, parentCategoryId: fallbackGroup.id } : category,
      );
      categoriesChanged = true;
    });

    const leafBuckets = new Map<string, Category[]>();
    workspaceCategories.forEach((category) => {
      if (category.categoryType !== "category" || !isValidGroupId(category.parentCategoryId)) return;
      const key = `${category.parentCategoryId}::${normalizeKey(category.name)}`;
      const bucket = leafBuckets.get(key) ?? [];
      bucket.push(category);
      leafBuckets.set(key, bucket);
    });

    leafBuckets.forEach((bucket) => {
      if (bucket.length < 2) return;
      const canonicalCategory = chooseCanonicalCategory(bucket);
      bucket.forEach((category) => {
        if (category.id === canonicalCategory.id) return;
        remappedCategoryIds.set(category.id, canonicalCategory.id);
        categoriesChanged = true;
      });
    });

    workspaceCategories = workspaceCategories.filter((category) => resolveCategoryRemap(category.id, remappedCategoryIds) === category.id);

    const leafCategoriesByParentId = new Map<string, Category[]>();
    workspaceCategories.forEach((category) => {
      if (category.categoryType !== "category" || !isValidGroupId(category.parentCategoryId)) return;
      const parentId = category.parentCategoryId!;
      const siblings = leafCategoriesByParentId.get(parentId) ?? [];
      siblings.push(category);
      leafCategoriesByParentId.set(parentId, siblings);
    });

    workspaceCategories.forEach((category) => {
      if (category.categoryType !== "group") return;

      const childCategories = leafCategoriesByParentId.get(category.id) ?? [];
      if (!childCategories.length) return;

      const sameNameChildren = childCategories.filter(
        (childCategory) => normalizeKey(childCategory.name) === normalizeKey(category.name),
      );
      const preferredChildCategory =
        sameNameChildren.length === 1 ? sameNameChildren[0] : childCategories.length === 1 ? childCategories[0] : null;

      if (preferredChildCategory) {
        transactionCategoryReferenceRemaps.set(category.id, preferredChildCategory.id);
      }
    });

    const siblingBuckets = new Map<string, Category[]>();
    workspaceCategories.forEach((category) => {
      const key = category.parentCategoryId ?? "__root__";
      const bucket = siblingBuckets.get(key) ?? [];
      bucket.push(category);
      siblingBuckets.set(key, bucket);
    });

    const reorderedWorkspaceCategories = Array.from(siblingBuckets.values()).flatMap((bucket) =>
      bucket
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((category, index) => (category.sortOrder === index ? category : { ...category, sortOrder: index })),
    );

    if (
      !categoriesChanged &&
      reorderedWorkspaceCategories.some((category) => {
        const current = workspaceCategories.find((item) => item.id === category.id);
        return current ? current.sortOrder !== category.sortOrder : false;
      })
    ) {
      categoriesChanged = true;
    }

    normalizedCategories.push(...reorderedWorkspaceCategories);
  }

  if (!categoriesChanged && !remappedCategoryIds.size) return state;

  let transactionsChanged = false;
  const normalizedTransactions = state.transactions.map((transaction) => {
    if (!transaction.categoryId) return transaction;
    const resolvedCategoryId = resolveCategoryRemap(transaction.categoryId, remappedCategoryIds);
    const normalizedCategoryId = transactionCategoryReferenceRemaps.get(resolvedCategoryId) ?? resolvedCategoryId;
    if (normalizedCategoryId === transaction.categoryId) return transaction;
    transactionsChanged = true;
    return { ...transaction, categoryId: normalizedCategoryId };
  });

  return {
    ...state,
    categories: normalizedCategories,
    transactions: transactionsChanged ? normalizedTransactions : state.transactions,
  };
}

function rebaseImportedBundleIntoWorkspace(state: AppState, workspaceId: string, bundle: WorkspaceBundle): WorkspaceBundle {
  const scope = getWorkspaceScope(state, workspaceId);
  const importRecordId = createId("import");
  const statementMonth = bundle.imports[0]?.statementMonth ?? null;

  const categoryIdMap = new Map<string, string>();
  const bundleGroups = bundle.categories.filter((category) => category.categoryType === "group");
  const bundleLeafCategories = bundle.categories.filter((category) => category.categoryType === "category");
  const scopeGroups = scope.categories.filter((category) => category.categoryType === "group");
  const scopeLeafCategories = scope.categories.filter((category) => category.categoryType === "category");

  const categoriesToAdd = [
    ...bundleGroups.flatMap((category) => {
      const matched = scopeGroups.find((item) => normalizeKey(item.name) === normalizeKey(category.name));
      if (matched) {
        categoryIdMap.set(category.id, matched.id);
        return [];
      }
      const nextId = createId("category");
      categoryIdMap.set(category.id, nextId);
      return [{ ...category, id: nextId, workspaceId, parentCategoryId: null }];
    }),
    ...bundleLeafCategories.flatMap((category) => {
      const sourceParentName = category.parentCategoryId
        ? bundleGroups.find((item) => item.id === category.parentCategoryId)?.name ?? null
        : null;
      const matchedParentId = sourceParentName
        ? scopeGroups.find((item) => normalizeKey(item.name) === normalizeKey(sourceParentName))?.id ?? null
        : null;
      const matched = scopeLeafCategories.find(
        (item) =>
          normalizeKey(item.name) === normalizeKey(category.name) &&
          (item.parentCategoryId ?? null) === (matchedParentId ?? null),
      );
      if (matched) {
        categoryIdMap.set(category.id, matched.id);
        return [];
      }
      const nextId = createId("category");
      categoryIdMap.set(category.id, nextId);
      return [{ ...category, id: nextId, workspaceId }];
    }),
  ];

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

  const existingPersonIds = new Set(scope.people.map((person) => person.id));
  const resolveOwnerPersonId = (ownerPersonId: string | null) => {
    if (!ownerPersonId) return null;
    return personIdMap.get(ownerPersonId) ?? (existingPersonIds.has(ownerPersonId) ? ownerPersonId : null);
  };

  const accountIdMap = new Map<string, string>();
  const accountsToAdd: Account[] = bundle.accounts.flatMap<Account>((account) => {
    const matched = scope.accounts.find((item) => normalizeKey(item.name) === normalizeKey(account.name));
    const resolvedOwnerPersonId = resolveOwnerPersonId(account.ownerPersonId);
    if (matched) {
      accountIdMap.set(account.id, matched.id);
      if ((matched.ownerPersonId ?? null) === null && resolvedOwnerPersonId) {
        return [{ ...matched, ownerPersonId: resolvedOwnerPersonId }];
      }
      return [];
    }
    const nextId = createId("account");
    accountIdMap.set(account.id, nextId);
    return [
      {
        ...account,
        id: nextId,
        workspaceId,
        ownerPersonId: resolvedOwnerPersonId,
        createdImportRecordId: importRecordId,
      },
    ];
  });
  const existingAccountIds = new Set(scope.accounts.map((account) => account.id));
  const resolveAccountId = (accountId: string | null) => {
    if (!accountId) return null;
    return accountIdMap.get(accountId) ?? (existingAccountIds.has(accountId) ? accountId : null);
  };

  const cardIdMap = new Map<string, string>();
  const cardsToAdd: Card[] = bundle.cards.flatMap<Card>((card) => {
    const resolvedOwnerPersonId = resolveOwnerPersonId(card.ownerPersonId);
    const matched = findMatchedImportedCard(scope.cards, card, resolvedOwnerPersonId);
    if (matched) {
      cardIdMap.set(card.id, matched.id);
      if ((matched.ownerPersonId ?? null) === null && resolvedOwnerPersonId) {
        return [{ ...matched, ownerPersonId: resolvedOwnerPersonId }];
      }
      return [];
    }
    const nextId = createId("card");
    cardIdMap.set(card.id, nextId);
    return [
      {
        ...card,
        id: nextId,
        workspaceId,
        ownerPersonId: resolvedOwnerPersonId,
        linkedAccountId: resolveAccountId(card.linkedAccountId),
        createdImportRecordId: importRecordId,
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
      importRecordId,
      ownerPersonId: resolveOwnerPersonId(transaction.ownerPersonId),
      cardId: transaction.cardId ? (cardIdMap.get(transaction.cardId) ?? null) : null,
      accountId: resolveAccountId(transaction.accountId),
      fromAccountId: resolveAccountId(transaction.fromAccountId),
      toAccountId: resolveAccountId(transaction.toAccountId),
      categoryId: transaction.categoryId ? (categoryIdMap.get(transaction.categoryId) ?? null) : null,
      tagIds: transaction.tagIds.map((tagId) => tagIdMap.get(tagId)).filter((tagId): tagId is string => Boolean(tagId)),
    };
  });

  const reviews = bundle.reviews.map((review) => ({
    ...review,
    id: createId("review"),
    workspaceId,
    importRecordId,
    primaryTransactionId: transactionIdMap.get(review.primaryTransactionId) ?? review.primaryTransactionId,
    relatedTransactionIds: review.relatedTransactionIds
      .map((relatedId) => transactionIdMap.get(relatedId))
      .filter((id): id is string => Boolean(id)),
    suggestedCategoryId: review.suggestedCategoryId ? (categoryIdMap.get(review.suggestedCategoryId) ?? null) : null,
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
        id: importRecordId,
        workspaceId,
        fileName: bundle.imports[0]?.fileName ?? bundle.workspace.name,
        statementMonth,
        fileFingerprint: bundle.imports[0]?.fileFingerprint ?? null,
        contentFingerprint: bundle.imports[0]?.contentFingerprint ?? null,
        importedAt: new Date().toISOString(),
        parserId: bundle.imports[0]?.parserId ?? "household-v2-workbook",
        rowCount: transactions.length,
        reviewCount: reviews.length,
      },
    ],
    settlements: [],
    incomeEntries: [],
  };
}

function createWorkspaceBundleSnapshot(state: AppState, workspaceId: string): WorkspaceBundle | null {
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  if (!workspace) return null;

  const scope = getWorkspaceScope(state, workspaceId);
  return {
    workspace,
    financialProfile: scope.financialProfile ?? createFinancialProfileBase(workspaceId),
    people: scope.people,
    accounts: scope.accounts,
    cards: scope.cards,
    categories: scope.categories,
    tags: scope.tags,
    transactions: scope.transactions,
    reviews: scope.reviews,
    imports: scope.imports,
    settlements: scope.settlements,
    incomeEntries: scope.incomeEntries,
  };
}

function applyWorkspaceDataPackageToState(
  state: AppState,
  workspaceId: string,
  packageKind: WorkspaceDataPackageKind,
  packageData: ReturnType<typeof parseWorkspaceDataPackage>["data"],
) {
  const currentBundle = createWorkspaceBundleSnapshot(state, workspaceId);
  if (!currentBundle) {
    throw new Error("workspace-not-found");
  }

  const nextBundle: WorkspaceBundle =
    packageKind === "foundation"
      ? {
          ...currentBundle,
          financialProfile: packageData.financialProfile ?? currentBundle.financialProfile,
          people: packageData.people,
          accounts: packageData.accounts,
          cards: packageData.cards,
          categories: packageData.categories,
          tags: packageData.tags,
        }
      : {
          ...currentBundle,
          transactions: packageData.transactions,
          reviews: packageData.reviews,
          imports: packageData.imports,
        };

  return replaceWorkspaceBundleInState(state, workspaceId, nextBundle);
}

function findDuplicateImportRecord(state: AppState, workspaceId: string, bundle: WorkspaceBundle) {
  const incomingRecord = bundle.imports[0];
  if (!incomingRecord) return null;

  const fileFingerprint = incomingRecord.fileFingerprint ?? null;
  const contentFingerprint = incomingRecord.contentFingerprint ?? null;

  return (
    state.imports.find(
      (record) =>
        record.workspaceId === workspaceId &&
        ((fileFingerprint && record.fileFingerprint === fileFingerprint) ||
          (contentFingerprint && record.contentFingerprint === contentFingerprint)),
    ) ?? null
  );
}

function adaptBundleToWorkspace(
  bundle: WorkspaceBundle,
  workspaceId: string,
  currentWorkspace: AppState["workspaces"][number],
  currentFinancialProfile: FinancialProfile | null,
): WorkspaceBundle {
  return {
    workspace: {
      ...currentWorkspace,
      updatedAt: new Date().toISOString(),
    },
    financialProfile: {
      ...(currentFinancialProfile ?? {}),
      ...(bundle.financialProfile ?? {}),
      workspaceId,
    },
    people: bundle.people.map((person) => ({ ...person, workspaceId })),
    accounts: bundle.accounts.map((account) => ({ ...account, workspaceId })),
    cards: bundle.cards.map((card) => ({ ...card, workspaceId })),
    categories: bundle.categories.map((category) => ({ ...category, workspaceId })),
    tags: bundle.tags.map((tag) => ({ ...tag, workspaceId })),
    transactions: bundle.transactions.map((transaction) => ({ ...transaction, workspaceId })),
    reviews: bundle.reviews.map((review) => ({ ...review, workspaceId })),
    imports: bundle.imports.map((record) => ({ ...record, workspaceId })),
    settlements: bundle.settlements.map((record) => ({ ...record, workspaceId })),
    incomeEntries: bundle.incomeEntries.map((entry) => ({ ...entry, workspaceId })),
  };
}

function replaceWorkspaceBundleInState(state: AppState, workspaceId: string, bundle: WorkspaceBundle): AppState {
  const currentWorkspace = state.workspaces.find((item) => item.id === workspaceId) ?? null;
  if (!currentWorkspace) return state;

  const currentFinancialProfile = state.financialProfiles.find((profile) => profile.workspaceId === workspaceId) ?? null;
  const nextBundle = adaptBundleToWorkspace(bundle, workspaceId, currentWorkspace, currentFinancialProfile);

  return normalizeCategoryStructure({
    ...state,
    workspaces: state.workspaces.map((workspace) => (workspace.id === workspaceId ? nextBundle.workspace : workspace)),
    financialProfiles: [...state.financialProfiles.filter((profile) => profile.workspaceId !== workspaceId), nextBundle.financialProfile],
    people: [...state.people.filter((person) => person.workspaceId !== workspaceId), ...nextBundle.people],
    accounts: [...state.accounts.filter((account) => account.workspaceId !== workspaceId), ...nextBundle.accounts],
    cards: [...state.cards.filter((card) => card.workspaceId !== workspaceId), ...nextBundle.cards],
    categories: [...state.categories.filter((category) => category.workspaceId !== workspaceId), ...nextBundle.categories],
    tags: [...state.tags.filter((tag) => tag.workspaceId !== workspaceId), ...nextBundle.tags],
    transactions: [...state.transactions.filter((transaction) => transaction.workspaceId !== workspaceId), ...nextBundle.transactions],
    reviews: [...state.reviews.filter((review) => review.workspaceId !== workspaceId), ...nextBundle.reviews],
    imports: [...state.imports.filter((record) => record.workspaceId !== workspaceId), ...nextBundle.imports],
    settlements: [...state.settlements.filter((record) => record.workspaceId !== workspaceId), ...nextBundle.settlements],
    incomeEntries: [...state.incomeEntries.filter((entry) => entry.workspaceId !== workspaceId), ...nextBundle.incomeEntries],
  });
}

function restoreGuideSampleBackupsInState(state: AppState) {
  let nextState = state;
  let restoredWorkspaceCount = 0;

  state.workspaces.forEach((workspace) => {
    const backup = readGuideSampleBackup(workspace.id);
    if (!backup?.workspaceBundle) return;

    nextState = replaceWorkspaceBundleInState(nextState, workspace.id, backup.workspaceBundle);
    clearGuideSampleBackup(workspace.id);
    clearGuideSampleState(workspace.id);
    restoredWorkspaceCount += 1;
  });

  return {
    nextState,
    restoredWorkspaceCount,
  };
}

function deleteImportRecordFromState(state: AppState, workspaceId: string, importRecordId: string) {
  const removedTransactionIds = new Set(
    state.transactions
      .filter((transaction) => transaction.workspaceId === workspaceId && transaction.importRecordId === importRecordId)
      .map((transaction) => transaction.id),
  );

  if (!removedTransactionIds.size) {
    return {
      ...state,
      imports: state.imports.filter((record) => !(record.workspaceId === workspaceId && record.id === importRecordId)),
    };
  }

  const nextTransactions = state.transactions.filter((transaction) => !removedTransactionIds.has(transaction.id));
  const remainingCardIds = new Set(nextTransactions.map((transaction) => transaction.cardId).filter((id): id is string => Boolean(id)));
  const remainingAccountIds = new Set(
    nextTransactions.flatMap((transaction) =>
      [transaction.accountId, transaction.fromAccountId, transaction.toAccountId].filter((id): id is string => Boolean(id)),
    ),
  );

  const nextCards = state.cards.filter((card) => {
    if (card.workspaceId !== workspaceId || card.createdImportRecordId !== importRecordId) return true;
    return remainingCardIds.has(card.id);
  });

  const linkedCardAccountIds = new Set(nextCards.map((card) => card.linkedAccountId).filter((id): id is string => Boolean(id)));
  const categoryLinkedAccountIds = new Set(
    state.categories.map((category) => category.linkedAccountId).filter((id): id is string => Boolean(id)),
  );

  const nextAccounts = state.accounts.filter((account) => {
    if (account.workspaceId !== workspaceId || account.createdImportRecordId !== importRecordId) return true;
    return remainingAccountIds.has(account.id) || linkedCardAccountIds.has(account.id) || categoryLinkedAccountIds.has(account.id);
  });

  return {
    ...state,
    accounts: nextAccounts,
    cards: nextCards,
    transactions: nextTransactions,
    reviews: state.reviews.filter(
      (review) =>
        !(review.workspaceId === workspaceId && (
          review.importRecordId === importRecordId ||
          removedTransactionIds.has(review.primaryTransactionId) ||
          review.relatedTransactionIds.some((transactionId) => removedTransactionIds.has(transactionId))
        )),
    ),
    imports: state.imports.filter((record) => !(record.workspaceId === workspaceId && record.id === importRecordId)),
  };
}

function removeGuideSampleDataFromState(state: AppState, workspaceId: string) {
  const storedSampleState = readGuideSampleState(workspaceId);
  const samplePersonIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.personIds
      : state.people
          .filter((person) => person.workspaceId === workspaceId && person.memo === GUIDE_SAMPLE_MEMO)
          .map((person) => person.id),
  );
  const sampleAccountIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.accountIds
      : state.accounts
          .filter((account) => account.workspaceId === workspaceId && account.memo === GUIDE_SAMPLE_MEMO)
          .map((account) => account.id),
  );
  const sampleCardIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.cardIds
      : state.cards
          .filter((card) => card.workspaceId === workspaceId && card.memo === GUIDE_SAMPLE_MEMO)
          .map((card) => card.id),
  );
  const sampleTransactionIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.transactionIds
      : state.transactions
          .filter(
            (transaction) =>
              transaction.workspaceId === workspaceId &&
              ((transaction.ownerPersonId && samplePersonIds.has(transaction.ownerPersonId)) ||
                (transaction.cardId && sampleCardIds.has(transaction.cardId)) ||
                (transaction.accountId && sampleAccountIds.has(transaction.accountId)) ||
                (transaction.fromAccountId && sampleAccountIds.has(transaction.fromAccountId)) ||
                (transaction.toAccountId && sampleAccountIds.has(transaction.toAccountId))),
          )
          .map((transaction) => transaction.id),
  );
  const sampleReviewIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.reviewIds
      : state.reviews
          .filter(
            (review) =>
              review.workspaceId === workspaceId &&
              (sampleTransactionIds.has(review.primaryTransactionId) ||
                review.relatedTransactionIds.some((transactionId) => sampleTransactionIds.has(transactionId))),
          )
          .map((review) => review.id),
  );
  const sampleImportIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.importIds
      : state.imports
          .filter((record) => record.workspaceId === workspaceId && record.parserId === GUIDE_SAMPLE_PARSER_ID)
          .map((record) => record.id),
  );
  const sampleIncomeIds = new Set(
    hasGuideSampleState(storedSampleState)
      ? storedSampleState.incomeIds
      : state.incomeEntries
          .filter(
            (entry) =>
              entry.workspaceId === workspaceId &&
              ((entry.ownerPersonId && samplePersonIds.has(entry.ownerPersonId)) || entry.sourceName.includes("가이드")),
          )
          .map((entry) => entry.id),
  );

  const hasSampleData =
    samplePersonIds.size > 0 ||
    sampleAccountIds.size > 0 ||
    sampleCardIds.size > 0 ||
    sampleTransactionIds.size > 0 ||
    sampleReviewIds.size > 0 ||
    sampleImportIds.size > 0 ||
    sampleIncomeIds.size > 0;

  if (!hasSampleData) {
    return { nextState: state, removed: false };
  }

  return {
    nextState: {
      ...state,
      people: state.people.filter((person) => !samplePersonIds.has(person.id)),
      accounts: state.accounts.filter((account) => !sampleAccountIds.has(account.id)),
      cards: state.cards.filter((card) => !sampleCardIds.has(card.id)),
      transactions: state.transactions.filter((transaction) => !sampleTransactionIds.has(transaction.id)),
      reviews: state.reviews.filter((review) => !sampleReviewIds.has(review.id)),
      imports: state.imports.filter((record) => !sampleImportIds.has(record.id)),
      incomeEntries: state.incomeEntries.filter((entry) => !sampleIncomeIds.has(entry.id)),
    },
    removed: true,
  };
}

function applyTransactionFlagPatch(
  transaction: Transaction,
  patch: {
    isSharedExpense?: boolean;
    isExpenseImpact?: boolean;
    isInternalTransfer?: boolean;
    isLoop?: boolean;
    isLoopIgnored?: boolean;
    loopGroupOverrideKey?: string | null;
    loopDisplayName?: string | null;
  },
) {
  const nextInternalTransfer =
    typeof patch.isInternalTransfer === "boolean" ? patch.isInternalTransfer : transaction.isInternalTransfer;
  const nextExpenseImpact =
    typeof patch.isExpenseImpact === "boolean"
      ? patch.isExpenseImpact
      : transaction.isExpenseImpact;

  const requestedSharedExpense = patch.isSharedExpense ?? transaction.isSharedExpense;
  const nextSharedExpense = isActiveExpenseTransaction({
    ...transaction,
    isExpenseImpact: nextExpenseImpact,
    isInternalTransfer: nextInternalTransfer,
  })
    ? requestedSharedExpense
    : false;

  return {
    ...transaction,
    isExpenseImpact: nextExpenseImpact,
    isSharedExpense: nextSharedExpense,
    isInternalTransfer: nextInternalTransfer,
    isLoop: typeof patch.isLoop === "boolean" ? patch.isLoop : transaction.isLoop ?? false,
    isLoopIgnored:
      typeof patch.isLoopIgnored === "boolean"
        ? patch.isLoopIgnored
        : typeof patch.isLoop === "boolean" && patch.isLoop
          ? false
          : transaction.isLoopIgnored ?? false,
    loopGroupOverrideKey:
      patch.loopGroupOverrideKey !== undefined ? patch.loopGroupOverrideKey : transaction.loopGroupOverrideKey ?? null,
    loopDisplayName: patch.loopDisplayName !== undefined ? patch.loopDisplayName : transaction.loopDisplayName ?? null,
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
      case "category_suggestion":
        return {
          ...transaction,
          categoryId: review.suggestedCategoryId ?? transaction.categoryId,
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

function resolveCategoryReviewStatuses(
  reviews: ReviewItem[],
  transactionIds: Iterable<string>,
  status: "resolved" | "dismissed" = "resolved",
) {
  const transactionIdSet = new Set(transactionIds);
  return reviews.map((review) => {
    if (!transactionIdSet.has(review.primaryTransactionId)) return review;
    if (review.reviewType !== "uncategorized_transaction" && review.reviewType !== "category_suggestion") return review;
    if (review.status !== "open") return review;
    return { ...review, status };
  });
}

function getNextCategorySortOrder(categories: Category[], parentCategoryId: string | null) {
  const siblingOrders = categories
    .filter((category) => category.parentCategoryId === parentCategoryId)
    .map((category) => category.sortOrder);
  return siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
}

function reorderCategories(
  categories: Category[],
  categoryId: string,
  targetParentCategoryId: string | null,
  targetIndex: number,
) {
  const movingCategory = categories.find((category) => category.id === categoryId);
  if (!movingCategory) return categories;

  const destinationParentCategoryId = movingCategory.categoryType === "group" ? null : targetParentCategoryId;
  const baseCategories = categories.filter((category) => category.id !== categoryId);
  const destinationSiblings = baseCategories
    .filter((category) => category.parentCategoryId === destinationParentCategoryId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, destinationSiblings.length));
  const reorderedSiblings = [
    ...destinationSiblings.slice(0, clampedTargetIndex),
    { ...movingCategory, parentCategoryId: destinationParentCategoryId, sortOrder: clampedTargetIndex },
    ...destinationSiblings.slice(clampedTargetIndex),
  ].map((category, index) => ({ ...category, sortOrder: index }));
  const reorderedSiblingMap = new Map(reorderedSiblings.map((category) => [category.id, category]));

  return baseCategories
    .map((category) => reorderedSiblingMap.get(category.id) ?? category)
    .concat(reorderedSiblingMap.get(categoryId) ?? []);
}

function reorderItemsByGroup<T extends { id: string; sortOrder?: number; ownerPersonId?: string | null }>(
  items: T[],
  itemId: string,
  targetOwnerPersonId: string | null,
  targetIndex: number,
) {
  const movingItem = items.find((item) => item.id === itemId);
  if (!movingItem) return items;

  const baseItems = items.filter((item) => item.id !== itemId);
  const destinationSiblings = baseItems
    .filter((item) => (item.ownerPersonId ?? null) === targetOwnerPersonId)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, destinationSiblings.length));
  const reorderedSiblings = [
    ...destinationSiblings.slice(0, clampedTargetIndex),
    { ...movingItem, ownerPersonId: targetOwnerPersonId, sortOrder: clampedTargetIndex },
    ...destinationSiblings.slice(clampedTargetIndex),
  ].map((item, index) => ({ ...item, sortOrder: index }));
  const reorderedSiblingMap = new Map(reorderedSiblings.map((item) => [item.id, item]));

  return baseItems.map((item) => reorderedSiblingMap.get(item.id) ?? item).concat(reorderedSiblingMap.get(itemId) ?? []);
}

function reorderPeople(people: Person[], personId: string, targetIndex: number) {
  const movingPerson = people.find((person) => person.id === personId);
  if (!movingPerson) return people;
  const basePeople = people.filter((person) => person.id !== personId).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, basePeople.length));
  return [
    ...basePeople.slice(0, clampedTargetIndex),
    movingPerson,
    ...basePeople.slice(clampedTargetIndex),
  ].map((person, index) => ({ ...person, sortOrder: index }));
}

function resetCategoriesToDefaults(categories: Category[], workspaceId: string) {
  const workspaceCategories = categories.filter((category) => category.workspaceId === workspaceId);
  const otherCategories = categories.filter((category) => category.workspaceId !== workspaceId);
  const starterCategories = createStarterCategories(workspaceId);
  const starterGroupNameById = new Map(
    starterCategories.filter((category) => category.categoryType === "group").map((category) => [category.id, category.name]),
  );

  const existingGroupsByName = new Map(
    workspaceCategories
      .filter((category) => category.categoryType === "group")
      .map((category) => [normalizeKey(category.name), category]),
  );
  const existingChildrenByKey = new Map(
    workspaceCategories
      .filter((category) => category.categoryType === "category")
      .map((category) => {
        const parent = workspaceCategories.find((item) => item.id === category.parentCategoryId);
        return [`${normalizeKey(parent?.name ?? "")}::${normalizeCategoryLabelKey(category.name)}`, category] as const;
      }),
  );
  const existingChildrenByName = new Map<string, Category[]>();
  workspaceCategories
    .filter((category) => category.categoryType === "category")
    .forEach((category) => {
      const key = normalizeCategoryLabelKey(category.name);
      const bucket = existingChildrenByName.get(key) ?? [];
      bucket.push(category);
      existingChildrenByName.set(key, bucket);
    });

  const matchedCategoryIds = new Set<string>();
  const defaultGroupIdByName = new Map<string, string>();

  const mergedDefaultCategories = starterCategories.map((starterCategory) => {
    if (starterCategory.categoryType === "group") {
      const matched = existingGroupsByName.get(normalizeKey(starterCategory.name));
      const nextCategory = matched
        ? {
            ...matched,
            name: starterCategory.name,
            parentCategoryId: null,
            sortOrder: starterCategory.sortOrder,
            isHidden: false,
            direction: starterCategory.direction,
            fixedOrVariable: starterCategory.fixedOrVariable,
            necessity: starterCategory.necessity,
            budgetable: starterCategory.budgetable,
            reportable: starterCategory.reportable,
          }
        : starterCategory;
      matchedCategoryIds.add(nextCategory.id);
      defaultGroupIdByName.set(starterCategory.name, nextCategory.id);
      return nextCategory;
    }

    const parentName = starterGroupNameById.get(starterCategory.parentCategoryId ?? "") ?? "";
    const matched =
      existingChildrenByKey.get(`${normalizeKey(parentName)}::${normalizeCategoryLabelKey(starterCategory.name)}`) ??
      (() => {
        const candidates = (existingChildrenByName.get(normalizeCategoryLabelKey(starterCategory.name)) ?? []).filter(
          (category) => !matchedCategoryIds.has(category.id),
        );
        return candidates.length === 1 ? candidates[0] : undefined;
      })();
    const nextCategory = matched
      ? {
          ...matched,
          name: starterCategory.name,
          parentCategoryId: defaultGroupIdByName.get(parentName) ?? matched.parentCategoryId,
          sortOrder: starterCategory.sortOrder,
          isHidden: false,
          direction: starterCategory.direction,
          fixedOrVariable: starterCategory.fixedOrVariable,
          necessity: starterCategory.necessity,
          budgetable: starterCategory.budgetable,
          reportable: starterCategory.reportable,
        }
      : {
          ...starterCategory,
          parentCategoryId: defaultGroupIdByName.get(parentName) ?? starterCategory.parentCategoryId,
        };
    matchedCategoryIds.add(nextCategory.id);
    return nextCategory;
  });

  const customCategories = workspaceCategories.filter((category) => !matchedCategoryIds.has(category.id));
  const siblingBuckets = new Map<string, Category[]>();

  [...mergedDefaultCategories, ...customCategories].forEach((category) => {
    const key = category.parentCategoryId ?? "__root__";
    const bucket = siblingBuckets.get(key) ?? [];
    bucket.push(category);
    siblingBuckets.set(key, bucket);
  });

  const normalizedWorkspaceCategories = Array.from(siblingBuckets.values()).flatMap((bucket) =>
    bucket
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((category, index) => ({ ...category, sortOrder: index })),
  );

  return [...otherCategories, ...normalizedWorkspaceCategories];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "setActiveWorkspace":
      return { ...state, activeWorkspaceId: action.payload };
    case "renameWorkspace":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === action.payload.workspaceId ? { ...workspace, name: action.payload.name } : workspace,
        ),
      };
    case "mergeBundle":
      return normalizeCategoryStructure(mergeWorkspaceBundle(state, action.payload));
    case "reset":
      return createEmptyState();
    case "replaceState":
      return normalizeCategoryStructure(action.payload);
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
      const affectedTransactionIds = [review.primaryTransactionId, ...review.relatedTransactionIds];

      return {
        ...state,
        transactions: applyReviewSuggestionToTransactions(state.transactions, review),
        reviews: resolveCategoryReviewStatuses(
          state.reviews.map((item) => (item.id === action.payload.reviewId ? { ...item, status: "resolved" } : item)),
          affectedTransactionIds,
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
            sortOrder:
              action.payload.values.sortOrder ??
              state.people.filter((person) => person.workspaceId === action.payload.workspaceId).length,
            isHidden: action.payload.values.isHidden ?? false,
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
    case "deletePerson":
      const removedPersonAccountIds = new Set(
        state.accounts
          .filter(
            (account) =>
              account.workspaceId === action.payload.workspaceId &&
              ((account.ownerPersonId === action.payload.personId && account.accountGroupType !== "meeting") ||
                account.primaryPersonId === action.payload.personId),
          )
          .map((account) => account.id),
      );
      return {
        ...state,
        people: state.people.filter(
          (person) => !(person.workspaceId === action.payload.workspaceId && person.id === action.payload.personId),
        ),
        accounts: state.accounts
          .filter(
            (account) =>
              !(
                account.workspaceId === action.payload.workspaceId &&
                ((account.ownerPersonId === action.payload.personId && account.accountGroupType !== "meeting") ||
                  account.primaryPersonId === action.payload.personId)
              ),
          )
          .map((account) =>
            account.workspaceId === action.payload.workspaceId
              ? {
                  ...account,
                  participantPersonIds: (account.participantPersonIds ?? []).filter((personId) => personId !== action.payload.personId),
                }
              : account,
          ),
        cards: state.cards.filter(
          (card) => !(card.workspaceId === action.payload.workspaceId && card.ownerPersonId === action.payload.personId),
        ),
        categories: state.categories.map((category) =>
          category.workspaceId === action.payload.workspaceId && category.linkedAccountId && removedPersonAccountIds.has(category.linkedAccountId)
            ? { ...category, linkedAccountId: null }
            : category,
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId !== action.payload.workspaceId || transaction.ownerPersonId !== action.payload.personId
            ? transaction
            : {
                ...transaction,
                ownerPersonId: null,
                accountId:
                  transaction.accountId &&
                  state.accounts.some(
                    (account) =>
                      account.workspaceId === action.payload.workspaceId &&
                      account.id === transaction.accountId &&
                      account.ownerPersonId === action.payload.personId,
                  )
                    ? null
                    : transaction.accountId,
                cardId:
                  transaction.cardId &&
                  state.cards.some(
                    (card) =>
                      card.workspaceId === action.payload.workspaceId &&
                      card.id === transaction.cardId &&
                      card.ownerPersonId === action.payload.personId,
                  )
                    ? null
                    : transaction.cardId,
              },
        ),
      };
    case "movePerson":
      return {
        ...state,
        people: state.people
          .filter((person) => person.workspaceId !== action.payload.workspaceId)
          .concat(reorderPeople(state.people.filter((person) => person.workspaceId === action.payload.workspaceId), action.payload.personId, action.payload.targetIndex)),
      };
    case "addAccount":
      const nextAccountId = createId("account");
        const nextAccount: Account = {
          id: nextAccountId,
          workspaceId: action.payload.workspaceId,
          ...action.payload.values,
        sortOrder:
          action.payload.values.sortOrder ??
          state.accounts.filter(
            (account) =>
              account.workspaceId === action.payload.workspaceId &&
              (account.ownerPersonId ?? null) === (action.payload.values.ownerPersonId ?? null),
          ).length,
        isHidden: action.payload.values.isHidden ?? false,
      };

      return {
        ...state,
        accounts: [...state.accounts, nextAccount],
        categories: shouldAutoLinkFirstDailyAccount(state, action.payload.workspaceId, null, nextAccount.usageType)
          ? autoLinkCategoriesToFirstDailyAccount(state.categories, action.payload.workspaceId, nextAccountId)
          : shouldAutoLinkFirstLoanAccount(state, action.payload.workspaceId, null, nextAccount.usageType)
            ? autoLinkCategoriesToFirstLoanAccount(state.categories, action.payload.workspaceId, nextAccountId)
            : state.categories,
      };
    case "updateAccount":
      const currentAccount = state.accounts.find(
        (account) => account.workspaceId === action.payload.workspaceId && account.id === action.payload.accountId,
      );
      const shouldAutoLinkDailyCategories =
        currentAccount &&
        currentAccount.usageType !== "daily" &&
        shouldAutoLinkFirstDailyAccount(state, action.payload.workspaceId, action.payload.accountId, action.payload.values.usageType);
      const shouldAutoLinkLoanCategories =
        currentAccount &&
        currentAccount.usageType !== "loan" &&
        shouldAutoLinkFirstLoanAccount(state, action.payload.workspaceId, action.payload.accountId, action.payload.values.usageType);

      return {
        ...state,
        accounts: state.accounts.map((account) =>
          account.workspaceId === action.payload.workspaceId && account.id === action.payload.accountId
            ? { ...account, ...action.payload.values }
            : account,
        ),
        categories: shouldAutoLinkDailyCategories
          ? autoLinkCategoriesToFirstDailyAccount(state.categories, action.payload.workspaceId, action.payload.accountId)
          : shouldAutoLinkLoanCategories
            ? autoLinkCategoriesToFirstLoanAccount(state.categories, action.payload.workspaceId, action.payload.accountId)
            : state.categories,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.sourceType === "account" &&
          transaction.accountId === action.payload.accountId
            ? {
                ...transaction,
                ownerPersonId:
                  action.payload.values.accountGroupType === "meeting" || action.payload.values.isShared
                    ? null
                    : action.payload.values.ownerPersonId,
              }
            : transaction,
        ),
      };
    case "deleteAccount":
      return {
        ...state,
        accounts: state.accounts.filter(
          (account) => !(account.workspaceId === action.payload.workspaceId && account.id === action.payload.accountId),
        ),
        cards: state.cards.map((card) =>
          card.workspaceId === action.payload.workspaceId && card.linkedAccountId === action.payload.accountId
            ? { ...card, linkedAccountId: null }
            : card,
        ),
        categories: state.categories.map((category) =>
          category.workspaceId === action.payload.workspaceId && category.linkedAccountId === action.payload.accountId
            ? { ...category, linkedAccountId: null }
            : category,
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId !== action.payload.workspaceId
            ? transaction
            : {
                ...transaction,
                accountId: transaction.accountId === action.payload.accountId ? null : transaction.accountId,
                fromAccountId: transaction.fromAccountId === action.payload.accountId ? null : transaction.fromAccountId,
                toAccountId: transaction.toAccountId === action.payload.accountId ? null : transaction.toAccountId,
              },
        ),
      };
    case "moveAccount":
      return {
        ...state,
        accounts: state.accounts
          .filter((account) => account.workspaceId !== action.payload.workspaceId)
          .concat(
            reorderItemsByGroup(
              state.accounts.filter((account) => account.workspaceId === action.payload.workspaceId),
              action.payload.accountId,
              action.payload.targetOwnerPersonId,
              action.payload.targetIndex,
            ),
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
            sortOrder:
              action.payload.values.sortOrder ??
              state.cards.filter(
                (card) =>
                  card.workspaceId === action.payload.workspaceId &&
                  (card.ownerPersonId ?? null) === (action.payload.values.ownerPersonId ?? null),
              ).length,
            isHidden: action.payload.values.isHidden ?? false,
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
    case "deleteCard":
      return {
        ...state,
        cards: state.cards.filter(
          (card) => !(card.workspaceId === action.payload.workspaceId && card.id === action.payload.cardId),
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.cardId === action.payload.cardId
            ? { ...transaction, cardId: null }
            : transaction,
        ),
      };
    case "moveCard":
      return {
        ...state,
        cards: state.cards
          .filter((card) => card.workspaceId !== action.payload.workspaceId)
          .concat(
            reorderItemsByGroup(
              state.cards.filter((card) => card.workspaceId === action.payload.workspaceId),
              action.payload.cardId,
              action.payload.targetOwnerPersonId,
              action.payload.targetIndex,
            ),
          ),
      };
    case "addCategory":
      return normalizeCategoryStructure({
        ...state,
        categories: [
          ...state.categories,
          {
            id: createId("category"),
            workspaceId: action.payload.workspaceId,
            ...action.payload.values,
            sortOrder: getNextCategorySortOrder(
              state.categories.filter((category) => category.workspaceId === action.payload.workspaceId),
              action.payload.values.categoryType === "group" ? null : action.payload.values.parentCategoryId,
            ),
          },
        ],
      });
    case "updateCategory":
      return normalizeCategoryStructure({
        ...state,
        categories: state.categories.map((category) =>
          category.workspaceId === action.payload.workspaceId && category.id === action.payload.categoryId
            ? { ...category, ...action.payload.values }
            : category,
        ),
      });
    case "deleteCategory": {
      const target = state.categories.find(
        (category) => category.workspaceId === action.payload.workspaceId && category.id === action.payload.categoryId,
      );
      if (!target) return state;

      const categoryIdsToDelete =
        target.categoryType === "group"
          ? state.categories
              .filter(
                (category) =>
                  category.workspaceId === action.payload.workspaceId &&
                  (category.id === target.id || category.parentCategoryId === target.id),
              )
              .map((category) => category.id)
          : [target.id];
      const deletedCategoryIdSet = new Set(categoryIdsToDelete);

      return {
        ...state,
        categories: state.categories.filter(
          (category) =>
            !(category.workspaceId === action.payload.workspaceId && deletedCategoryIdSet.has(category.id)),
        ),
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.categoryId &&
          deletedCategoryIdSet.has(transaction.categoryId)
            ? { ...transaction, categoryId: null }
            : transaction,
        ),
      };
    }
    case "moveCategory":
      return normalizeCategoryStructure({
        ...state,
        categories: state.categories.some(
          (category) => category.workspaceId === action.payload.workspaceId && category.id === action.payload.categoryId,
        )
          ? [
              ...state.categories.filter((category) => category.workspaceId !== action.payload.workspaceId),
              ...reorderCategories(
                state.categories.filter((category) => category.workspaceId === action.payload.workspaceId),
                action.payload.categoryId,
                action.payload.targetParentCategoryId,
                action.payload.targetIndex,
              ),
            ]
          : state.categories,
      });
    case "resetCategoriesToDefaults":
      return normalizeCategoryStructure({
        ...state,
        categories: resetCategoriesToDefaults(state.categories, action.payload.workspaceId),
      });
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
            transferKey: action.payload.transferKey,
            fromAccountId: action.payload.fromAccountId,
            toAccountId: action.payload.toAccountId,
            amount: Math.abs(action.payload.amount),
            note: action.payload.note,
            completedAt: new Date().toISOString(),
          },
        ],
      };
    case "removeSettlement":
      return {
        ...state,
        settlements: state.settlements.filter(
          (item) =>
            !(
              item.workspaceId === action.payload.workspaceId &&
              item.month === action.payload.month &&
              item.transferKey === action.payload.transferKey
            ),
        ),
      };
    case "addIncomeEntry":
      return {
        ...state,
        incomeEntries: [
          ...state.incomeEntries,
          {
            id: createId("income"),
            workspaceId: action.payload.workspaceId,
            ownerPersonId: action.payload.ownerPersonId,
            occurredAt: new Date(action.payload.occurredAt).toISOString(),
            sourceName: action.payload.sourceName,
            amount: Math.abs(action.payload.amount),
            createdAt: new Date().toISOString(),
          },
        ],
      };
    case "deleteIncomeEntry":
      return {
        ...state,
        incomeEntries: state.incomeEntries.filter(
          (entry) => !(entry.workspaceId === action.payload.workspaceId && entry.id === action.payload.incomeEntryId),
        ),
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
                const nextTransactionType = action.payload.patch.transactionType ?? transaction.transactionType;
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
                  transactionType: nextTransactionType,
                  sourceType: nextSourceType,
                  ownerPersonId: nextOwnerPersonId,
                  accountId: nextAccountId,
                  cardId: nextCardId,
                  fromAccountId: nextTransactionType === "transfer" ? nextAccountId : null,
                  toAccountId: nextTransactionType === "transfer" ? transaction.toAccountId : null,
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
        reviews: resolveCategoryReviewStatuses(state.reviews, [action.payload.transactionId]),
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
        reviews: resolveCategoryReviewStatuses(
          state.reviews,
          state.transactions
            .filter(
              (transaction) =>
                transaction.workspaceId === action.payload.workspaceId &&
                transaction.merchantName === action.payload.merchantName &&
                transaction.isExpenseImpact,
            )
            .map((transaction) => transaction.id),
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
        reviews: resolveCategoryReviewStatuses(state.reviews, action.payload.transactionIds),
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
    case "setTransactionLoopFlagBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? { ...transaction, isLoop: action.payload.isLoop, isLoopIgnored: action.payload.isLoop ? false : transaction.isLoopIgnored ?? false }
            : transaction,
        ),
      };
    }
    case "setTransactionLoopIgnoredBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? { ...transaction, isLoopIgnored: action.payload.isLoopIgnored, isLoop: action.payload.isLoopIgnored ? false : transaction.isLoop }
            : transaction,
        ),
      };
    }
    case "setTransactionLoopGroupOverrideBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? {
                ...transaction,
                loopGroupOverrideKey: action.payload.loopGroupOverrideKey,
                isLoop: action.payload.isLoop ?? transaction.isLoop ?? false,
                isLoopIgnored: action.payload.isLoop ?? transaction.isLoop ? false : transaction.isLoopIgnored ?? false,
              }
            : transaction,
        ),
      };
    }
    case "setTransactionLoopDisplayNameBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? {
                ...transaction,
                loopDisplayName: action.payload.loopDisplayName,
              }
            : transaction,
        ),
      };
    }
    case "deleteImportRecord":
      return deleteImportRecordFromState(state, action.payload.workspaceId, action.payload.importRecordId);
    default:
      return state;
  }
}

interface AppStateContextValue {
  state: AppState;
  isReady: boolean;
  workspaceLoopDataByWorkspaceId: Map<
    string,
    {
      loopRules: LoopRule[];
      managedLoops: ManagedLoopGroup[];
      loopInsights: LoopStationInsight[];
      loopRecommendations: LoopRecommendation[];
    }
  >;
  createEmptyWorkspace: (name?: string) => void;
  createDemoWorkspace: () => Promise<void>;
  previewWorkbookImport: (file: File) => Promise<WorkspaceBundle>;
  commitImportedBundle: (bundle: WorkspaceBundle, fileName: string) => Promise<void>;
  deleteImportRecord: (workspaceId: string, importRecordId: string) => void;
  loadGuideSampleData: () => void;
  clearGuideSampleData: () => void;
  snapshotGuideActionState: (workspaceId: string, stepId: string) => void;
  restoreGuideActionState: (workspaceId: string, stepId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => void;
  resetApp: () => Promise<void>;
  exportState: () => void;
  importState: (file: File) => Promise<void>;
  exportWorkspaceDataPackage: (workspaceId: string, packageKind: WorkspaceDataPackageKind) => void;
  importWorkspaceDataPackage: (workspaceId: string, file: File, expectedKind: WorkspaceDataPackageKind) => Promise<void>;
  resolveReview: (reviewId: string) => void;
  dismissReview: (reviewId: string) => void;
  applyReviewSuggestion: (reviewId: string) => void;
  addPerson: (workspaceId: string, input: string | Partial<PersonDraft>) => void;
  updatePerson: (workspaceId: string, personId: string, input: Partial<PersonDraft>) => void;
  deletePerson: (workspaceId: string, personId: string) => void;
  movePerson: (workspaceId: string, personId: string, targetIndex: number) => void;
  addAccount: (workspaceId: string, input: string | Partial<AccountDraft>, institutionName?: string) => void;
  updateAccount: (workspaceId: string, accountId: string, input: Partial<AccountDraft>) => void;
  deleteAccount: (workspaceId: string, accountId: string) => void;
  moveAccount: (workspaceId: string, accountId: string, targetOwnerPersonId: string | null, targetIndex: number) => void;
  addCard: (workspaceId: string, input: string | Partial<CardDraft>, issuerName?: string) => void;
  updateCard: (workspaceId: string, cardId: string, input: Partial<CardDraft>) => void;
  deleteCard: (workspaceId: string, cardId: string) => void;
  moveCard: (workspaceId: string, cardId: string, targetOwnerPersonId: string | null, targetIndex: number) => void;
  addCategory: (workspaceId: string, input: string | Partial<CategoryDraft>, parentCategoryId?: string | null) => void;
  updateCategory: (workspaceId: string, categoryId: string, input: Partial<CategoryDraft>) => void;
  deleteCategory: (workspaceId: string, categoryId: string) => void;
  moveCategory: (workspaceId: string, categoryId: string, targetParentCategoryId: string | null, targetIndex: number) => void;
  resetCategoriesToDefaults: (workspaceId: string) => void;
  addTag: (workspaceId: string, name: string) => void;
  setFinancialProfile: (workspaceId: string, values: FinancialProfileInput) => void;
  addSettlement: (input: SettlementInput) => void;
  removeSettlement: (workspaceId: string, month: string, transferKey: string) => void;
  addIncomeEntry: (input: IncomeEntryInput) => void;
  deleteIncomeEntry: (workspaceId: string, incomeEntryId: string) => void;
  addTransaction: (input: NewTransactionInput) => void;
  updateTransactionDetails: (
    workspaceId: string,
    transactionId: string,
    patch: {
      transactionType?: Transaction["transactionType"];
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
      isLoop?: boolean;
      isLoopIgnored?: boolean;
      loopGroupOverrideKey?: string | null;
      loopDisplayName?: string | null;
    },
  ) => void;
  setTransactionLoopFlagBatch: (workspaceId: string, transactionIds: string[], isLoop: boolean) => void;
  setTransactionLoopIgnoredBatch: (workspaceId: string, transactionIds: string[], isLoopIgnored: boolean) => void;
  setTransactionLoopGroupOverrideBatch: (
    workspaceId: string,
    transactionIds: string[],
    loopGroupOverrideKey: string | null,
    isLoop?: boolean,
  ) => void;
  setTransactionLoopDisplayNameBatch: (workspaceId: string, transactionIds: string[], loopDisplayName: string | null) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, createEmptyState());
  const [isReady, setIsReady] = useState(false);
  const { showToast } = useToast();
  const stateRef = useRef(state);
  const guideSampleRestoreLockRef = useRef<Set<string>>(new Set());
  const authSessionRef = useRef<AuthSession | null>(readAuthSession());
  const serverMetaRef = useRef<ServerStateMeta>(EMPTY_SERVER_META);
  const syncSocketRef = useRef<WebSocket | null>(null);
  const syncReconnectTimeoutRef = useRef<number | null>(null);
  const syncIntentionalCloseRef = useRef(false);
  const realtimeRefreshTimeoutRef = useRef<number | null>(null);
  const realtimeRefreshInFlightRef = useRef(false);

  const refreshStateFromServer = useCallback(async (session: AuthSession | null) => {
    authSessionRef.current = session;

    if (!session) {
      serverMetaRef.current = EMPTY_SERVER_META;
      const normalized = normalizeAppState(createEmptyState());
      const { nextState } = restoreGuideSampleBackupsInState(normalized);
      dispatch({ type: "hydrate", payload: nextState });
      setIsReady(true);
      return;
    }

    try {
      const { state: serverState, meta } = await loadServerAppState(session);
      serverMetaRef.current = meta;
      const normalized = normalizeAppState(serverState);
      const { nextState } = restoreGuideSampleBackupsInState(normalized);
      dispatch({ type: "hydrate", payload: nextState });
      setIsReady(true);
    } catch (error) {
      console.error(error);
      serverMetaRef.current = EMPTY_SERVER_META;
      setIsReady(true);
      showToast(error instanceof Error ? error.message : "서버 데이터를 불러오지 못했습니다.", "error");
    }
  }, [showToast]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    void refreshStateFromServer(authSessionRef.current);
  }, [refreshStateFromServer]);

  useEffect(() => {
    const handleAuthSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<AuthSession | null>).detail ?? readAuthSession();
      void refreshStateFromServer(detail);
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange);
    };
  }, [refreshStateFromServer]);

  const queueRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }
    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      if (realtimeRefreshInFlightRef.current) {
        queueRealtimeRefresh();
        return;
      }
      const session = authSessionRef.current;
      if (!session) {
        return;
      }
      realtimeRefreshInFlightRef.current = true;
      void refreshStateFromServer(session).finally(() => {
        realtimeRefreshInFlightRef.current = false;
      });
    }, 120);
  }, [refreshStateFromServer]);

  useEffect(() => {
    const authSession = authSessionRef.current;
    if (!authSession) {
      syncIntentionalCloseRef.current = true;
      if (syncReconnectTimeoutRef.current) {
        window.clearTimeout(syncReconnectTimeoutRef.current);
        syncReconnectTimeoutRef.current = null;
      }
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      if (syncSocketRef.current) {
        syncSocketRef.current.close();
        syncSocketRef.current = null;
      }
      return;
    }

    const socketUrl = authSession.apiBaseUrl.replace(/^http/i, "ws") + "/ws";
    const subscriptionDestination = `/topic/spaces/${authSession.spaceId}/sync/events`;
    const subscriptionId = `sync-events-${authSession.spaceId}`;

    const connectSyncSocket = () => {
      if (syncReconnectTimeoutRef.current) {
        window.clearTimeout(syncReconnectTimeoutRef.current);
        syncReconnectTimeoutRef.current = null;
      }

      const socket = new WebSocket(socketUrl);
      syncIntentionalCloseRef.current = false;
      syncSocketRef.current = socket;

      socket.addEventListener("open", () => {
        socket.send(
          createStompFrame("CONNECT", {
            "accept-version": "1.2",
            host: window.location.hostname || "localhost",
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        try {
          const frames = parseStompMessageBodies(String(event.data || ""));
          frames.forEach((frame) => {
            if (frame.command === "CONNECTED") {
              socket.send(
                createStompFrame("SUBSCRIBE", {
                  id: subscriptionId,
                  destination: subscriptionDestination,
                }),
              );
              return;
            }

            if (frame.command !== "MESSAGE" || !frame.body) {
              return;
            }

            const message = JSON.parse(frame.body) as SyncEventMessage;
            const currentSession = authSessionRef.current;
            if (!currentSession) {
              return;
            }
            if (message.sessionKey && message.sessionKey === currentSession.sessionKey) {
              return;
            }
            queueRealtimeRefresh();
          });
        } catch (error) {
          console.warn("sync event parse failed", error);
        }
      });

      socket.addEventListener("close", () => {
        if (syncSocketRef.current === socket) {
          syncSocketRef.current = null;
        }
        if (!syncIntentionalCloseRef.current) {
          syncReconnectTimeoutRef.current = window.setTimeout(() => {
            connectSyncSocket();
          }, 1000);
        }
      });

      socket.addEventListener("error", () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      });
    };

    connectSyncSocket();

    return () => {
      syncIntentionalCloseRef.current = true;
      if (syncReconnectTimeoutRef.current) {
        window.clearTimeout(syncReconnectTimeoutRef.current);
        syncReconnectTimeoutRef.current = null;
      }
      if (realtimeRefreshTimeoutRef.current) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      if (syncSocketRef.current) {
        syncSocketRef.current.close();
        syncSocketRef.current = null;
      }
    };
  }, [queueRealtimeRefresh, state.activeWorkspaceId]);

  const getRequiredSession = useCallback(() => {
    const session = authSessionRef.current;
    if (!session) {
      throw new Error("로그인이 필요합니다.");
    }
    return session;
  }, []);

  const handleServerMutationError = useCallback(
    (error: unknown) => {
      console.error(error);
      showToast(error instanceof Error ? error.message : "서버 요청에 실패했습니다.", "error");
    },
    [showToast],
  );

  const getCategorySchemeId = useCallback((workspaceId: string) => {
    const schemeId = serverMetaRef.current.categorySchemeIdByWorkspaceId[workspaceId];
    if (!schemeId) {
      throw new Error("카테고리 스킴을 찾지 못했습니다.");
    }
    return Number(schemeId);
  }, []);

  const getTagSchemeId = useCallback((workspaceId: string) => {
    const schemeId = serverMetaRef.current.tagSchemeIdByWorkspaceId[workspaceId];
    if (!schemeId) {
      throw new Error("태그 스킴을 찾지 못했습니다.");
    }
    return Number(schemeId);
  }, []);

  const ensureTagSchemeId = useCallback(
    async (workspaceId: string) => {
      const existingSchemeId = serverMetaRef.current.tagSchemeIdByWorkspaceId[workspaceId];
      if (existingSchemeId) {
        return Number(existingSchemeId);
      }

      const session = getRequiredSession();
      const created = await requestServerJson<{ id: number }>(session, "/api/tags/schemes", {
        method: "POST",
        body: JSON.stringify({
          spaceId: Number(workspaceId),
          code: `default-tags-${workspaceId}`,
          name: "기본 태그",
          description: "기본 태그 스킴",
          defaultScheme: true,
          active: true,
          sortOrder: 0,
        }),
      });
      serverMetaRef.current.tagSchemeIdByWorkspaceId[workspaceId] = String(created.id);
      return created.id;
    },
    [getRequiredSession],
  );

  const resolveWorkspaceCategoryId = useCallback((workspaceId: string, categoryId: string | null | undefined) => {
    if (!categoryId) return null;
    const category = stateRef.current.categories.find(
      (item) => item.workspaceId === workspaceId && item.id === categoryId,
    );
    if (category) return Number(category.id);

    const sourceCategory = stateRef.current.categories.find((item) => item.id === categoryId);
    if (!sourceCategory) return null;

    const sourceParentName = sourceCategory.parentCategoryId
      ? stateRef.current.categories.find((item) => item.id === sourceCategory.parentCategoryId)?.name ?? null
      : null;

    const targetCategories = stateRef.current.categories.filter((item) => item.workspaceId === workspaceId);
    const targetParentId = sourceParentName
      ? targetCategories.find((item) => item.categoryType === "group" && item.name === sourceParentName)?.id ?? null
      : null;
    const matchedCategory = targetCategories.find(
      (item) =>
        item.categoryType === sourceCategory.categoryType &&
        item.name === sourceCategory.name &&
        (item.parentCategoryId ?? null) === (targetParentId ?? null),
    );

    return matchedCategory ? Number(matchedCategory.id) : null;
  }, []);

  const toTransactionRequest = useCallback((transaction: Transaction) => ({
    spaceId: Number(transaction.workspaceId),
    importRecordId: toNullableNumber(transaction.importRecordId),
    occurredAt: transaction.occurredAt,
    settledAt: transaction.settledAt,
    transactionType: transaction.transactionType.toUpperCase(),
    sourceType: transaction.sourceType.toUpperCase(),
    ownerPersonId: toNullableNumber(transaction.ownerPersonId),
    cardAssetId: toNullableNumber(transaction.cardId),
    accountAssetId: toNullableNumber(transaction.accountId),
    fromAssetId: toNullableNumber(transaction.fromAccountId),
    toAssetId: toNullableNumber(transaction.toAccountId),
    merchantName: transaction.merchantName,
    description: transaction.description,
    amount: transaction.amount,
    originalAmount: transaction.originalAmount ?? null,
    discountAmount: transaction.discountAmount ?? null,
    categoryId: resolveWorkspaceCategoryId(transaction.workspaceId, transaction.categoryId),
    tagIds: transaction.tagIds.map(Number),
    internalTransfer: transaction.isInternalTransfer ?? false,
    expenseImpact: transaction.isExpenseImpact,
    sharedExpense: transaction.isSharedExpense,
    loop: transaction.isLoop ?? false,
    loopIgnored: transaction.isLoopIgnored ?? false,
    loopGroupOverrideKey: transaction.loopGroupOverrideKey ?? null,
    loopDisplayName: transaction.loopDisplayName ?? null,
    refundOfTransactionId: toNullableNumber(transaction.refundOfTransactionId),
    status: (transaction.status ?? "active").toUpperCase(),
    expectedRevisionNumber: serverMetaRef.current.transactionRevisionById[transaction.id] ?? null,
  }), [resolveWorkspaceCategoryId]);

  const saveTransactionToServer = useCallback(
    async (transaction: Transaction) => {
      const session = getRequiredSession();
      const path = serverMetaRef.current.transactionRevisionById[transaction.id]
        ? `/api/transactions/${transaction.id}`
        : "/api/transactions";
      const method = serverMetaRef.current.transactionRevisionById[transaction.id] ? "PUT" : "POST";
      await requestServerJson(session, path, {
        method,
        body: JSON.stringify(toTransactionRequest(transaction)),
      });
      await refreshStateFromServer(session);
    },
    [getRequiredSession, refreshStateFromServer, toTransactionRequest],
  );

  const persistImportedBundleToServer = useCallback(
    async (workspaceId: string, payload: WorkspaceBundle) => {
      const session = getRequiredSession();
      const latestState = stateRef.current;
      const scope = getWorkspaceScope(latestState, workspaceId);

      const personIdMap = new Map<string, string>();
      const accountIdMap = new Map<string, string>();
      const cardIdMap = new Map<string, string>();
      const categoryIdMap = new Map<string, string>();
      const tagIdMap = new Map<string, string>();
      const transactionIdMap = new Map<string, string>();

      scope.people.forEach((person) => personIdMap.set(person.id, person.id));
      scope.accounts.forEach((account) => accountIdMap.set(account.id, account.id));
      scope.cards.forEach((card) => cardIdMap.set(card.id, card.id));
      scope.categories.forEach((category) => categoryIdMap.set(category.id, category.id));
      scope.tags.forEach((tag) => tagIdMap.set(tag.id, tag.id));

      const resolveImportedCategoryId = (categoryId: string | null | undefined) => {
        if (!categoryId) return null;
        const mappedCategoryId = categoryIdMap.get(categoryId) ?? categoryId;
        if (scope.categories.some((category) => category.id === mappedCategoryId) || categoryIdMap.has(categoryId)) {
          return Number(mappedCategoryId);
        }
        return resolveWorkspaceCategoryId(workspaceId, categoryId);
      };

      const createdReviewIds: string[] = [];
      const createdTransactionIds: string[] = [];
      let createdImportRecordId: string | null = null;

      const importRecord = payload.imports[0];
      if (!importRecord) {
        throw new Error("업로드 명세서 정보가 없습니다.");
      }

      try {
        const createdImport = await requestServerJson<{ id: number }>(session, "/api/import-records", {
          method: "POST",
          body: JSON.stringify({
            spaceId: Number(workspaceId),
            fileName: importRecord.fileName,
            statementMonth: importRecord.statementMonth,
            fileFingerprint: importRecord.fileFingerprint ?? null,
            contentFingerprint: importRecord.contentFingerprint ?? null,
            importedAt: importRecord.importedAt,
            parserId: importRecord.parserId,
            rowCount: payload.transactions.length,
            reviewCount: payload.reviews.length,
          }),
        });
        createdImportRecordId = String(createdImport.id);

        for (const person of payload.people) {
          const created = await requestServerJson<{ id: number }>(session, "/api/people", {
            method: "POST",
            body: JSON.stringify({
              spaceId: Number(workspaceId),
              name: person.name,
              displayName: person.displayName,
              role: PERSON_ROLE_TO_SERVER[person.role],
              memo: person.memo,
              active: person.isActive,
              sortOrder: person.sortOrder ?? 0,
              hidden: person.isHidden ?? false,
            }),
          });
          personIdMap.set(person.id, String(created.id));
        }

        const pendingGroups = payload.categories.filter(
          (category) => category.categoryType === "group" && !serverMetaRef.current.categoryRevisionById[category.id],
        );
        if (pendingGroups.length) {
          const schemeId = getCategorySchemeId(workspaceId);
          for (const group of pendingGroups) {
            const created = await requestServerJson<{ id: number }>(session, "/api/category/groups", {
              method: "POST",
              body: JSON.stringify({
                schemeId,
                name: group.name,
                description: "",
                direction: CATEGORY_DIRECTION_TO_SERVER[group.direction],
                fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[group.fixedOrVariable],
                necessity: CATEGORY_NECESSITY_TO_SERVER[group.necessity],
                budgetable: group.budgetable,
                reportable: group.reportable,
                linkedAssetId: null,
                sortOrder: group.sortOrder ?? 0,
                hidden: group.isHidden ?? false,
              }),
            });
            categoryIdMap.set(group.id, String(created.id));
          }

          for (const category of payload.categories.filter(
            (item) => item.categoryType === "category" && !serverMetaRef.current.categoryRevisionById[item.id],
          )) {
            const rootGroupId = category.parentCategoryId ? categoryIdMap.get(category.parentCategoryId) ?? category.parentCategoryId : null;
            if (!rootGroupId) {
              throw new Error(`카테고리 "${category.name}"의 상위 그룹을 찾지 못했습니다.`);
            }
            const created = await requestServerJson<{ id: number }>(session, "/api/category/items", {
              method: "POST",
              body: JSON.stringify({
                schemeId,
                groupId: Number(rootGroupId),
                parentCategoryId: null,
                name: category.name,
                direction: CATEGORY_DIRECTION_TO_SERVER[category.direction],
                fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[category.fixedOrVariable],
                necessity: CATEGORY_NECESSITY_TO_SERVER[category.necessity],
                budgetable: category.budgetable,
                reportable: category.reportable,
                linkedAssetId: null,
                sortOrder: category.sortOrder ?? 0,
                hidden: category.isHidden ?? false,
              }),
            });
            categoryIdMap.set(category.id, String(created.id));
          }
        }

        if (payload.tags.length) {
          const schemeId = await ensureTagSchemeId(workspaceId);
          for (const tag of payload.tags.filter((item) => !tagIdMap.has(item.id))) {
            const created = await requestServerJson<{ id: number }>(session, "/api/tags/items", {
              method: "POST",
              body: JSON.stringify({
                schemeId,
                name: tag.name,
                color: tag.color,
                sortOrder: 0,
                hidden: false,
              }),
            });
            tagIdMap.set(tag.id, String(created.id));
          }
        }

        for (const account of payload.accounts) {
          const existingRevision = serverMetaRef.current.assetRevisionById[account.id];
          if (existingRevision) {
            accountIdMap.set(account.id, account.id);
            continue;
          }
          const created = await requestServerJson<{ id: number }>(session, "/api/assets", {
            method: "POST",
            body: JSON.stringify({
              spaceId: Number(workspaceId),
              assetKindCode: "ACCOUNT",
              ownerPersonId: toNullableNumber(personIdMap.get(account.ownerPersonId ?? "") ?? account.ownerPersonId),
              primaryPersonId: toNullableNumber(personIdMap.get(account.primaryPersonId ?? "") ?? account.primaryPersonId),
              providerId: null,
              name: account.name,
              alias: account.alias,
              groupType: ACCOUNT_GROUP_TYPE_TO_SERVER[account.accountGroupType ?? "personal"],
              usageType: ASSET_USAGE_TYPE_TO_SERVER[account.usageType],
              currencyCode: "KRW",
              shared: account.isShared,
              sortOrder: account.sortOrder ?? 0,
              hidden: account.isHidden ?? false,
              memo: account.memo,
              createdImportRecordKey: createdImportRecordId,
              participantPersonIds: (account.participantPersonIds ?? [])
                .map((personId) => personIdMap.get(personId) ?? personId)
                .map((personId) => Number(personId)),
              accountDetail: {
                accountType: ACCOUNT_TYPE_TO_SERVER[account.accountType],
                institutionName: account.institutionName,
                accountNumberMasked: account.accountNumberMasked || "-",
              },
              cardDetail: null,
            }),
          });
          accountIdMap.set(account.id, String(created.id));
        }

        for (const card of payload.cards) {
          const existingRevision = serverMetaRef.current.assetRevisionById[card.id];
          if (existingRevision) {
            cardIdMap.set(card.id, card.id);
            continue;
          }
          const created = await requestServerJson<{ id: number }>(session, "/api/assets", {
            method: "POST",
            body: JSON.stringify({
              spaceId: Number(workspaceId),
              assetKindCode: "CARD",
              ownerPersonId: toNullableNumber(personIdMap.get(card.ownerPersonId ?? "") ?? card.ownerPersonId),
              primaryPersonId: toNullableNumber(personIdMap.get(card.ownerPersonId ?? "") ?? card.ownerPersonId),
              providerId: null,
              name: card.name,
              alias: "",
              groupType: "PERSONAL",
              usageType: "CARD_PAYMENT",
              currencyCode: "KRW",
              shared: false,
              sortOrder: card.sortOrder ?? 0,
              hidden: card.isHidden ?? false,
              memo: card.memo,
              createdImportRecordKey: createdImportRecordId,
              participantPersonIds: [],
              accountDetail: null,
              cardDetail: {
                cardType: CARD_TYPE_TO_SERVER[card.cardType],
                issuerName: card.issuerName,
                cardNumberMasked: card.cardNumberMasked || "-",
                settlementAccountAssetId: toNullableNumber(accountIdMap.get(card.linkedAccountId ?? "") ?? card.linkedAccountId),
              },
            }),
          });
          cardIdMap.set(card.id, String(created.id));
        }

        for (const transaction of payload.transactions) {
          const created = await requestServerJson<{ id: number }>(session, "/api/transactions", {
            method: "POST",
            body: JSON.stringify({
              spaceId: Number(workspaceId),
              importRecordId: Number(createdImportRecordId),
              occurredAt: transaction.occurredAt,
              settledAt: transaction.settledAt,
              transactionType: transaction.transactionType.toUpperCase(),
              sourceType: transaction.sourceType.toUpperCase(),
              ownerPersonId: toNullableNumber(personIdMap.get(transaction.ownerPersonId ?? "") ?? transaction.ownerPersonId),
              cardAssetId: toNullableNumber(cardIdMap.get(transaction.cardId ?? "") ?? transaction.cardId),
              accountAssetId: toNullableNumber(accountIdMap.get(transaction.accountId ?? "") ?? transaction.accountId),
              fromAssetId: toNullableNumber(accountIdMap.get(transaction.fromAccountId ?? "") ?? transaction.fromAccountId),
              toAssetId: toNullableNumber(accountIdMap.get(transaction.toAccountId ?? "") ?? transaction.toAccountId),
              merchantName: transaction.merchantName,
              description: transaction.description,
              amount: transaction.amount,
              originalAmount: transaction.originalAmount ?? null,
              discountAmount: transaction.discountAmount ?? null,
              categoryId: resolveImportedCategoryId(transaction.categoryId),
              tagIds: transaction.tagIds
                .map((tagId) => tagIdMap.get(tagId) ?? tagId)
                .map((tagId) => Number(tagId)),
              internalTransfer: transaction.isInternalTransfer ?? false,
              expenseImpact: transaction.isExpenseImpact,
              sharedExpense: transaction.isSharedExpense,
              loop: transaction.isLoop ?? false,
              loopIgnored: transaction.isLoopIgnored ?? false,
              loopGroupOverrideKey: transaction.loopGroupOverrideKey ?? null,
              loopDisplayName: transaction.loopDisplayName ?? null,
              refundOfTransactionId: null,
              status: (transaction.status ?? "active").toUpperCase(),
            }),
          });
          const createdTransactionId = String(created.id);
          transactionIdMap.set(transaction.id, createdTransactionId);
          createdTransactionIds.push(createdTransactionId);
        }

        for (const review of payload.reviews) {
          const created = await requestServerJson<{ id: number }>(session, "/api/reviews", {
            method: "POST",
            body: JSON.stringify({
              spaceId: Number(workspaceId),
              importRecordId: Number(createdImportRecordId),
              reviewType: REVIEW_TYPE_TO_SERVER[review.reviewType],
              status: (review.status ?? "open").toUpperCase(),
              primaryTransactionId: Number(transactionIdMap.get(review.primaryTransactionId) ?? review.primaryTransactionId),
              relatedTransactionIds: review.relatedTransactionIds
                .map((id) => transactionIdMap.get(id) ?? id)
                .map((id) => Number(id)),
              confidenceScore: review.confidenceScore,
              summary: review.summary,
              suggestedCategoryId: resolveImportedCategoryId(review.suggestedCategoryId),
            }),
          });
          createdReviewIds.push(String(created.id));
        }

        await refreshStateFromServer(session);
      } catch (error) {
        for (const reviewId of [...createdReviewIds].reverse()) {
          await requestServerJson(session, `/api/reviews/${reviewId}`, { method: "DELETE" }).catch(() => undefined);
        }
        for (const transactionId of [...createdTransactionIds].reverse()) {
          await requestServerJson(session, `/api/transactions/${transactionId}`, { method: "DELETE" }).catch(() => undefined);
        }
        if (createdImportRecordId) {
          await requestServerJson(session, `/api/import-records/${createdImportRecordId}`, { method: "DELETE" }).catch(() => undefined);
        }
        await refreshStateFromServer(session).catch(() => undefined);
        throw error;
      }
    },
    [ensureTagSchemeId, getCategorySchemeId, getRequiredSession, refreshStateFromServer, resolveWorkspaceCategoryId],
  );

  const workspaceLoopDataByWorkspaceId = useMemo(() => {
    const nextMap = new Map<
      string,
      {
        loopRules: LoopRule[];
        managedLoops: ManagedLoopGroup[];
        loopInsights: LoopStationInsight[];
        loopRecommendations: LoopRecommendation[];
      }
    >();
    const activeWorkspaceId = state.activeWorkspaceId ?? state.workspaces[0]?.id ?? null;
    if (!activeWorkspaceId) return nextMap;

    const scope = getWorkspaceScope(state, activeWorkspaceId);
    const loopRules = buildLoopRules(scope.transactions);
    const managedLoops = getManagedLoopGroups(scope.transactions, loopRules);

    nextMap.set(activeWorkspaceId, {
      loopRules,
      managedLoops,
      loopInsights: getLoopStationInsightsFromManagedLoops(managedLoops),
      loopRecommendations: getLoopRecommendations(
        scope.transactions,
        scope.categories,
        scope.financialProfile?.loopPriorityCategoryIds ?? [],
      ),
    });

    return nextMap;
  }, [state]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      isReady,
      workspaceLoopDataByWorkspaceId,
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
            incomeEntries: [],
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
        const latestState = stateRef.current;
        const activeWorkspaceId = latestState.activeWorkspaceId;
        const classificationContext = activeWorkspaceId ? getWorkspaceScope(latestState, activeWorkspaceId) : null;
        const bundle = await parseHouseholdWorkbook(
          file,
          classificationContext
            ? {
                categories: classificationContext.categories,
                transactions: classificationContext.transactions,
              }
            : undefined,
        );
        showToast(`${file.name} 미리보기를 준비했습니다.`, "info");
        return bundle;
      },
      async commitImportedBundle(bundle, fileName) {
        const latestState = stateRef.current;
        const activeWorkspaceId = latestState.activeWorkspaceId;
        if (activeWorkspaceId) {
          const duplicateImportRecord = findDuplicateImportRecord(latestState, activeWorkspaceId, bundle);
          if (duplicateImportRecord) {
            showToast(
              `${duplicateImportRecord.fileName} 명세서와 같은 내용이 이미 업로드되어 있습니다.`,
              "error",
            );
            throw new Error("duplicate-import-record");
          }
        }

        const payload = activeWorkspaceId ? rebaseImportedBundleIntoWorkspace(latestState, activeWorkspaceId, bundle) : bundle;
        if (activeWorkspaceId && authSessionRef.current) {
          try {
            await persistImportedBundleToServer(activeWorkspaceId, payload);
          } catch (error) {
            handleServerMutationError(error);
            throw error;
          }
        } else {
          dispatch({ type: "mergeBundle", payload });
        }
        showToast(`${fileName} 업로드를 완료했습니다.`, "success");
      },
      deleteImportRecord(workspaceId, importRecordId) {
        void workspaceId;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/import-records/${importRecordId}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast("명세서를 삭제했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      loadGuideSampleData() {
        const latestState = stateRef.current;
        const activeWorkspaceId = latestState.activeWorkspaceId;
        if (!activeWorkspaceId) return;

        if (readGuideSampleBackup(activeWorkspaceId)) return;

        guideSampleRestoreLockRef.current.delete(activeWorkspaceId);

        const snapshot = createWorkspaceBundleSnapshot(latestState, activeWorkspaceId);
        if (!snapshot) return;

        const scope = getWorkspaceScope(latestState, activeWorkspaceId);

        const primaryPerson =
          scope.people.find((person) => !person.isHidden && person.isActive !== false) ?? scope.people[0] ?? null;
        const bundle = createGuideSampleBundle({
          ownerName: primaryPerson?.displayName?.trim() || primaryPerson?.name?.trim() || null,
        });
        const nextState = replaceWorkspaceBundleInState(latestState, activeWorkspaceId, bundle);
        const nextScope = getWorkspaceScope(nextState, activeWorkspaceId);

        writeGuideSampleBackup(activeWorkspaceId, {
          workspaceBundle: snapshot,
        });
        writeGuideSampleState(activeWorkspaceId, {
          personIds: nextScope.people.map((person) => person.id),
          accountIds: nextScope.accounts.map((account) => account.id),
          cardIds: nextScope.cards.map((card) => card.id),
          transactionIds: nextScope.transactions.map((transaction) => transaction.id),
          reviewIds: nextScope.reviews.map((review) => review.id),
          importIds: nextScope.imports.map((record) => record.id),
          incomeIds: nextScope.incomeEntries.map((entry) => entry.id),
        });
        dispatch({ type: "replaceState", payload: nextState });
        showToast("튜토리얼용 샘플 데이터를 적용했습니다. 실제 데이터는 잠시 백업해 두었습니다.", "success");
      },
      clearGuideSampleData() {
        const latestState = stateRef.current;
        const activeWorkspaceId = latestState.activeWorkspaceId;
        if (!activeWorkspaceId) return;

        const backup = readGuideSampleBackup(activeWorkspaceId);
        if (backup?.workspaceBundle) {
          guideSampleRestoreLockRef.current.add(activeWorkspaceId);
          dispatch({
            type: "replaceState",
            payload: replaceWorkspaceBundleInState(latestState, activeWorkspaceId, backup.workspaceBundle),
          });
          window.setTimeout(() => {
            clearGuideSampleBackup(activeWorkspaceId);
            clearGuideSampleState(activeWorkspaceId);
            guideSampleRestoreLockRef.current.delete(activeWorkspaceId);
          }, 0);
          showToast("튜토리얼을 닫고 실제 데이터를 복원했습니다.", "success");
          return;
        }

        if (guideSampleRestoreLockRef.current.has(activeWorkspaceId)) return;

        const { nextState, removed } = removeGuideSampleDataFromState(latestState, activeWorkspaceId);
        clearGuideSampleState(activeWorkspaceId);
        if (!removed) return;

        dispatch({ type: "replaceState", payload: nextState });
        showToast("튜토리얼 샘플 데이터를 정리했습니다.", "success");
      },
      snapshotGuideActionState(workspaceId, stepId) {
        const latestState = stateRef.current;
        const snapshot = createWorkspaceBundleSnapshot(latestState, workspaceId);
        if (!snapshot) return;
        if (readGuideActionBackup(workspaceId, stepId)) return;
        writeGuideActionBackup(workspaceId, stepId, {
          stepId,
          workspaceBundle: snapshot,
        });
      },
      restoreGuideActionState(workspaceId, stepId) {
        const latestState = stateRef.current;
        const backup = readGuideActionBackup(workspaceId, stepId);
        if (!backup?.workspaceBundle) return;
        dispatch({
          type: "replaceState",
          payload: replaceWorkspaceBundleInState(latestState, workspaceId, backup.workspaceBundle),
        });
        clearGuideActionBackup(workspaceId, stepId);
      },
      setActiveWorkspace(workspaceId) {
        dispatch({ type: "setActiveWorkspace", payload: workspaceId });
        const workspace = state.workspaces.find((item) => item.id === workspaceId);
        if (workspace) {
          showToast(`${workspace.name}로 전환했습니다.`, "info");
        }
      },
      renameWorkspace(workspaceId, name) {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        dispatch({ type: "renameWorkspace", payload: { workspaceId, name: trimmedName } });
        showToast(`"${trimmedName}" 이름으로 변경했습니다.`, "success");
      },
      async resetApp() {
        clearAuthSession();
        serverMetaRef.current = EMPTY_SERVER_META;
        dispatch({ type: "reset" });
        showToast("세션과 로컬 상태를 초기화했습니다.", "success");
      },
      exportState() {
        const blob = new Blob([createBackupContent(state)], { type: "application/json;charset=utf-8" });
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
        let parsed: ReturnType<typeof parseBackupPayload>;
        try {
          parsed = parseBackupPayload(text);
        } catch {
          showToast("백업 파일 형식을 확인해주세요.", "error");
          throw new Error("backup-data-missing");
        }
        restoreBackupGuideData(parsed.guideData);
        dispatch({ type: "replaceState", payload: normalizeAppState(parsed.data) });
        showToast(`${file.name} 백업을 불러왔습니다.`, "success");
      },
      exportWorkspaceDataPackage(workspaceId, packageKind) {
        const content = createWorkspaceDataPackageContent(state, workspaceId, packageKind);
        const suffix = packageKind === "foundation" ? "foundation" : "transactions";
        const blob = new Blob([content], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `household-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast(
          packageKind === "foundation" ? "기본 설정 묶음을 다운로드했습니다." : "명세서와 소비이력 묶음을 다운로드했습니다.",
          "success",
        );
      },
      async importWorkspaceDataPackage(workspaceId, file, expectedKind) {
        const text = await file.text();
        let parsed: ReturnType<typeof parseWorkspaceDataPackage>;
        try {
          parsed = parseWorkspaceDataPackage(text);
        } catch {
          showToast("묶음 파일 형식을 확인해주세요.", "error");
          throw new Error("workspace-package-data-missing");
        }
        if (parsed.packageKind !== expectedKind) {
          showToast(
            expectedKind === "foundation"
              ? "기본 설정 묶음 파일을 선택해주세요."
              : "명세서와 소비이력 묶음 파일을 선택해주세요.",
            "error",
          );
          throw new Error("workspace-package-kind-mismatch");
        }
        const nextState = applyWorkspaceDataPackageToState(stateRef.current, workspaceId, parsed.packageKind, parsed.data);
        dispatch({ type: "replaceState", payload: nextState });
        showToast(
          parsed.packageKind === "foundation"
            ? `${file.name} 기본 설정 묶음을 불러왔습니다.`
            : `${file.name} 명세서와 소비이력 묶음을 불러왔습니다.`,
          "success",
        );
      },
      resolveReview(reviewId) {
        const current = state.reviews.find((item) => item.id === reviewId);
        if (!current) return;
        const suggestedCategoryId = resolveWorkspaceCategoryId(current.workspaceId, current.suggestedCategoryId);
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/reviews/${reviewId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(current.workspaceId),
                importRecordId: toNullableNumber(current.importRecordId),
                reviewType: REVIEW_TYPE_TO_SERVER[current.reviewType],
                status: "RESOLVED",
                primaryTransactionId: Number(current.primaryTransactionId),
                relatedTransactionIds: current.relatedTransactionIds.map(Number),
                confidenceScore: current.confidenceScore,
                summary: current.summary,
                suggestedCategoryId,
                expectedRevisionNumber: serverMetaRef.current.reviewRevisionById[reviewId] ?? null,
              }),
            });
            await refreshStateFromServer(session);
            showToast("검토 항목을 확인 완료로 처리했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      dismissReview(reviewId) {
        const current = state.reviews.find((item) => item.id === reviewId);
        if (!current) return;
        const suggestedCategoryId = resolveWorkspaceCategoryId(current.workspaceId, current.suggestedCategoryId);
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/reviews/${reviewId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(current.workspaceId),
                importRecordId: toNullableNumber(current.importRecordId),
                reviewType: REVIEW_TYPE_TO_SERVER[current.reviewType],
                status: "DISMISSED",
                primaryTransactionId: Number(current.primaryTransactionId),
                relatedTransactionIds: current.relatedTransactionIds.map(Number),
                confidenceScore: current.confidenceScore,
                summary: current.summary,
                suggestedCategoryId,
                expectedRevisionNumber: serverMetaRef.current.reviewRevisionById[reviewId] ?? null,
              }),
            });
            await refreshStateFromServer(session);
            showToast("검토 항목을 보류 처리했습니다.", "info");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      applyReviewSuggestion(reviewId) {
        const review = state.reviews.find((item) => item.id === reviewId);
        if (!review) return;
        const transaction = state.transactions.find((item) => item.id === review.primaryTransactionId);
        if (!transaction) return;
        const transactionSuggestedCategoryId = resolveWorkspaceCategoryId(
          transaction.workspaceId,
          review.suggestedCategoryId,
        );
        const reviewSuggestedCategoryId = resolveWorkspaceCategoryId(review.workspaceId, review.suggestedCategoryId);

        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/transactions/${transaction.id}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(transaction.workspaceId),
                importRecordId: toNullableNumber(transaction.importRecordId),
                occurredAt: transaction.occurredAt,
                settledAt: transaction.settledAt,
                transactionType: transaction.transactionType.toUpperCase(),
                sourceType: transaction.sourceType.toUpperCase(),
                ownerPersonId: toNullableNumber(transaction.ownerPersonId),
                cardAssetId: toNullableNumber(transaction.cardId),
                accountAssetId: toNullableNumber(transaction.accountId),
                fromAssetId: toNullableNumber(transaction.fromAccountId),
                toAssetId: toNullableNumber(transaction.toAccountId),
                merchantName: transaction.merchantName,
                description: transaction.description,
                amount: transaction.amount,
                originalAmount: transaction.originalAmount ?? null,
                discountAmount: transaction.discountAmount ?? null,
                categoryId: transactionSuggestedCategoryId,
                tagIds: transaction.tagIds.map(Number),
                internalTransfer: transaction.isInternalTransfer ?? false,
                expenseImpact: transaction.isExpenseImpact,
                sharedExpense: transaction.isSharedExpense,
                loop: transaction.isLoop ?? false,
                loopIgnored: transaction.isLoopIgnored ?? false,
                loopGroupOverrideKey: transaction.loopGroupOverrideKey ?? null,
                loopDisplayName: transaction.loopDisplayName ?? null,
                refundOfTransactionId: toNullableNumber(transaction.refundOfTransactionId),
                status: (transaction.status ?? "posted").toUpperCase(),
                expectedRevisionNumber: serverMetaRef.current.transactionRevisionById[transaction.id] ?? null,
              }),
            });
            await requestServerJson(session, `/api/reviews/${reviewId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(review.workspaceId),
                importRecordId: toNullableNumber(review.importRecordId),
                reviewType: REVIEW_TYPE_TO_SERVER[review.reviewType],
                status: "RESOLVED",
                primaryTransactionId: Number(review.primaryTransactionId),
                relatedTransactionIds: review.relatedTransactionIds.map(Number),
                confidenceScore: review.confidenceScore,
                summary: review.summary,
                suggestedCategoryId: reviewSuggestedCategoryId,
                expectedRevisionNumber: serverMetaRef.current.reviewRevisionById[reviewId] ?? null,
              }),
            });
            await refreshStateFromServer(session);
            showToast("검토 제안을 거래 데이터에 반영했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addPerson(workspaceId, input) {
        const values = createPersonDraft(input);
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/people", {
              method: "POST",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                name: values.name,
                displayName: values.displayName,
                role: PERSON_ROLE_TO_SERVER[values.role],
                memo: values.memo,
                active: values.isActive,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.displayName || values.name} 사용자를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updatePerson(workspaceId, personId, input) {
        const current = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
        if (!current) return;
        const values = createPersonDraft({ ...current, ...input });
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/people/${personId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                name: values.name,
                displayName: values.displayName,
                role: PERSON_ROLE_TO_SERVER[values.role],
                memo: values.memo,
                active: values.isActive,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.displayName || values.name} 정보를 저장했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      deletePerson(workspaceId, personId) {
        const current = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/people/${personId}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast(`${current.displayName || current.name} 사용자를 삭제했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      movePerson(workspaceId, personId, targetIndex) {
        const current = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
        if (!current) return;

        const orderedPeople = state.people
          .filter((item) => item.workspaceId === workspaceId && item.id !== personId)
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
        orderedPeople.splice(targetIndex, 0, current);

        void (async () => {
          try {
            const session = getRequiredSession();
            await Promise.all(
              orderedPeople.map((person, index) =>
                requestServerJson(session, `/api/people/${person.id}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    spaceId: Number(workspaceId),
                    name: person.name,
                    displayName: person.displayName,
                    role: PERSON_ROLE_TO_SERVER[person.role],
                    memo: person.memo,
                    active: person.isActive,
                    sortOrder: index,
                    hidden: person.isHidden ?? false,
                  }),
                }),
              ),
            );
            await refreshStateFromServer(session);
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addAccount(workspaceId, input, institutionName) {
        const values = createAccountDraft(input, institutionName);
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/assets", {
              method: "POST",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "ACCOUNT",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.primaryPersonId),
                providerId: null,
                name: values.name,
                alias: values.alias,
                groupType: ACCOUNT_GROUP_TYPE_TO_SERVER[values.accountGroupType ?? "personal"],
                usageType: ASSET_USAGE_TYPE_TO_SERVER[values.usageType],
                currencyCode: "KRW",
                shared: values.isShared,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                participantPersonIds: (values.participantPersonIds ?? []).map(Number),
                accountDetail: {
                  accountType: ACCOUNT_TYPE_TO_SERVER[values.accountType],
                  institutionName: values.institutionName,
                  accountNumberMasked: values.accountNumberMasked || "-",
                },
                cardDetail: null,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.alias || values.name} 계좌를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updateAccount(workspaceId, accountId, input) {
        const current = state.accounts.find((item) => item.workspaceId === workspaceId && item.id === accountId);
        if (!current) return;
        const values = createAccountDraft({ ...current, ...input });
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${accountId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "ACCOUNT",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.primaryPersonId),
                providerId: null,
                name: values.name,
                alias: values.alias,
                groupType: ACCOUNT_GROUP_TYPE_TO_SERVER[values.accountGroupType ?? "personal"],
                usageType: ASSET_USAGE_TYPE_TO_SERVER[values.usageType],
                currencyCode: "KRW",
                shared: values.isShared,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                expectedRevisionNumber: serverMetaRef.current.assetRevisionById[accountId] ?? null,
                participantPersonIds: (values.participantPersonIds ?? []).map(Number),
                accountDetail: {
                  accountType: ACCOUNT_TYPE_TO_SERVER[values.accountType],
                  institutionName: values.institutionName,
                  accountNumberMasked: values.accountNumberMasked || "-",
                },
                cardDetail: null,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.alias || values.name} 계좌 정보를 저장했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      deleteAccount(workspaceId, accountId) {
        const current = state.accounts.find((item) => item.workspaceId === workspaceId && item.id === accountId);
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${accountId}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast(`${current.alias || current.name} 계좌를 삭제했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      moveAccount(workspaceId, accountId, targetOwnerPersonId, targetIndex) {
        const current = state.accounts.find((item) => item.workspaceId === workspaceId && item.id === accountId);
        if (!current) return;
        const values = createAccountDraft({
          ...current,
          ownerPersonId: targetOwnerPersonId,
          sortOrder: targetIndex,
        });

        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${accountId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "ACCOUNT",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.primaryPersonId),
                providerId: null,
                name: values.name,
                alias: values.alias,
                groupType: ACCOUNT_GROUP_TYPE_TO_SERVER[values.accountGroupType ?? "personal"],
                usageType: ASSET_USAGE_TYPE_TO_SERVER[values.usageType],
                currencyCode: "KRW",
                shared: values.isShared,
                sortOrder: targetIndex,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                expectedRevisionNumber: serverMetaRef.current.assetRevisionById[accountId] ?? null,
                participantPersonIds: (values.participantPersonIds ?? []).map(Number),
                accountDetail: {
                  accountType: ACCOUNT_TYPE_TO_SERVER[values.accountType],
                  institutionName: values.institutionName,
                  accountNumberMasked: values.accountNumberMasked || "-",
                },
                cardDetail: null,
              }),
            });
            await refreshStateFromServer(session);
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addCard(workspaceId, input, issuerName) {
        const values = createCardDraft(input, issuerName);
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/assets", {
              method: "POST",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "CARD",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.ownerPersonId),
                providerId: null,
                name: values.name,
                alias: "",
                groupType: "PERSONAL",
                usageType: "CARD_PAYMENT",
                currencyCode: "KRW",
                shared: false,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                participantPersonIds: [],
                accountDetail: null,
                cardDetail: {
                  cardType: CARD_TYPE_TO_SERVER[values.cardType],
                  issuerName: values.issuerName,
                  cardNumberMasked: values.cardNumberMasked || "-",
                  settlementAccountAssetId: toNullableNumber(values.linkedAccountId),
                },
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.name} 카드를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updateCard(workspaceId, cardId, input) {
        const current = state.cards.find((item) => item.workspaceId === workspaceId && item.id === cardId);
        if (!current) return;
        const values = createCardDraft({ ...current, ...input });
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${cardId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "CARD",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.ownerPersonId),
                providerId: null,
                name: values.name,
                alias: "",
                groupType: "PERSONAL",
                usageType: "CARD_PAYMENT",
                currencyCode: "KRW",
                shared: false,
                sortOrder: values.sortOrder ?? 0,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                expectedRevisionNumber: serverMetaRef.current.assetRevisionById[cardId] ?? null,
                participantPersonIds: [],
                accountDetail: null,
                cardDetail: {
                  cardType: CARD_TYPE_TO_SERVER[values.cardType],
                  issuerName: values.issuerName,
                  cardNumberMasked: values.cardNumberMasked || "-",
                  settlementAccountAssetId: toNullableNumber(values.linkedAccountId),
                },
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${values.name} 카드 정보를 저장했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      deleteCard(workspaceId, cardId) {
        const current = state.cards.find((item) => item.workspaceId === workspaceId && item.id === cardId);
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${cardId}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast(`${current.name} 카드를 삭제했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      moveCard(workspaceId, cardId, targetOwnerPersonId, targetIndex) {
        const current = state.cards.find((item) => item.workspaceId === workspaceId && item.id === cardId);
        if (!current) return;
        const values = createCardDraft({
          ...current,
          ownerPersonId: targetOwnerPersonId,
          sortOrder: targetIndex,
        });

        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/assets/${cardId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                assetKindCode: "CARD",
                ownerPersonId: toNullableNumber(values.ownerPersonId),
                primaryPersonId: toNullableNumber(values.ownerPersonId),
                providerId: null,
                name: values.name,
                alias: "",
                groupType: "PERSONAL",
                usageType: "CARD_PAYMENT",
                currencyCode: "KRW",
                shared: false,
                sortOrder: targetIndex,
                hidden: values.isHidden ?? false,
                memo: values.memo,
                createdImportRecordKey: null,
                expectedRevisionNumber: serverMetaRef.current.assetRevisionById[cardId] ?? null,
                participantPersonIds: [],
                accountDetail: null,
                cardDetail: {
                  cardType: CARD_TYPE_TO_SERVER[values.cardType],
                  issuerName: values.issuerName,
                  cardNumberMasked: values.cardNumberMasked || "-",
                  settlementAccountAssetId: toNullableNumber(values.linkedAccountId),
                },
              }),
            });
            await refreshStateFromServer(session);
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addCategory(workspaceId, input, parentCategoryId = null) {
        const values = createCategoryDraft(input, parentCategoryId);
        if (!values.name) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            const schemeId = getCategorySchemeId(workspaceId);
            if (values.categoryType === "group") {
              await requestServerJson(session, "/api/category/groups", {
                method: "POST",
                body: JSON.stringify({
                  schemeId,
                  name: values.name,
                  description: "",
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: null,
                  sortOrder: values.sortOrder,
                  hidden: values.isHidden,
                }),
              });
            } else {
              const groupId = findRootCategoryGroupId(stateRef.current.categories, values.parentCategoryId);
              if (!groupId) throw new Error("상위 그룹을 찾지 못했습니다.");
              await requestServerJson(session, "/api/category/items", {
                method: "POST",
                body: JSON.stringify({
                  schemeId,
                  groupId: Number(groupId),
                  parentCategoryId: toNullableNumber(values.parentCategoryId),
                  name: values.name,
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: toNullableNumber(values.linkedAccountId),
                  sortOrder: values.sortOrder,
                  hidden: values.isHidden,
                }),
              });
            }
            await refreshStateFromServer(session);
            showToast(`${values.name} 카테고리를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updateCategory(workspaceId, categoryId, input) {
        const current = state.categories.find((item) => item.workspaceId === workspaceId && item.id === categoryId);
        if (!current) return;
        const values = createCategoryDraft({ ...current, ...input });
        void (async () => {
          try {
            const session = getRequiredSession();
            const schemeId = getCategorySchemeId(workspaceId);
            if (values.categoryType === "group") {
              await requestServerJson(session, `/api/category/groups/${categoryId}`, {
                method: "PUT",
                body: JSON.stringify({
                  schemeId,
                  name: values.name,
                  description: "",
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: null,
                  sortOrder: values.sortOrder,
                  hidden: values.isHidden,
                  expectedRevisionNumber: serverMetaRef.current.categoryRevisionById[categoryId] ?? null,
                }),
              });
            } else {
              const groupId =
                findRootCategoryGroupId(stateRef.current.categories, values.parentCategoryId) ??
                findRootCategoryGroupId(stateRef.current.categories, current.parentCategoryId);
              if (!groupId) throw new Error("상위 그룹을 찾지 못했습니다.");
              await requestServerJson(session, `/api/category/items/${categoryId}`, {
                method: "PUT",
                body: JSON.stringify({
                  schemeId,
                  groupId: Number(groupId),
                  parentCategoryId: toNullableNumber(values.parentCategoryId),
                  name: values.name,
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: toNullableNumber(values.linkedAccountId),
                  sortOrder: values.sortOrder,
                  hidden: values.isHidden,
                  expectedRevisionNumber: serverMetaRef.current.categoryRevisionById[categoryId] ?? null,
                }),
              });
            }
            await refreshStateFromServer(session);
            showToast(values.categoryType === "group" ? `${values.name} 그룹 정보를 수정했습니다.` : `${values.name} 카테고리 정보를 수정했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      deleteCategory(workspaceId, categoryId) {
        const current = state.categories.find((item) => item.workspaceId === workspaceId && item.id === categoryId);
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(
              session,
              current.categoryType === "group" ? `/api/category/groups/${categoryId}` : `/api/category/items/${categoryId}`,
              { method: "DELETE" },
            );
            await refreshStateFromServer(session);
            showToast(current.categoryType === "group" ? `${current.name} 그룹과 하위 카테고리를 삭제했습니다.` : `${current.name} 카테고리를 삭제했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      moveCategory(workspaceId, categoryId, targetParentCategoryId, targetIndex) {
        const current = state.categories.find((item) => item.workspaceId === workspaceId && item.id === categoryId);
        if (!current) return;
        const values = createCategoryDraft({ ...current, parentCategoryId: targetParentCategoryId, sortOrder: targetIndex });
        void (async () => {
          try {
            const session = getRequiredSession();
            const schemeId = getCategorySchemeId(workspaceId);
            if (current.categoryType === "group") {
              await requestServerJson(session, `/api/category/groups/${categoryId}`, {
                method: "PUT",
                body: JSON.stringify({
                  schemeId,
                  name: values.name,
                  description: "",
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: null,
                  sortOrder: targetIndex,
                  hidden: values.isHidden,
                  expectedRevisionNumber: serverMetaRef.current.categoryRevisionById[categoryId] ?? null,
                }),
              });
            } else {
              const groupId =
                findRootCategoryGroupId(stateRef.current.categories, targetParentCategoryId) ??
                findRootCategoryGroupId(stateRef.current.categories, current.parentCategoryId);
              if (!groupId) throw new Error("상위 그룹을 찾지 못했습니다.");
              await requestServerJson(session, `/api/category/items/${categoryId}`, {
                method: "PUT",
                body: JSON.stringify({
                  schemeId,
                  groupId: Number(groupId),
                  parentCategoryId: toNullableNumber(targetParentCategoryId),
                  name: values.name,
                  direction: CATEGORY_DIRECTION_TO_SERVER[values.direction],
                  fixedOrVariable: CATEGORY_CADENCE_TO_SERVER[values.fixedOrVariable],
                  necessity: CATEGORY_NECESSITY_TO_SERVER[values.necessity],
                  budgetable: values.budgetable,
                  reportable: values.reportable,
                  linkedAssetId: toNullableNumber(values.linkedAccountId),
                  sortOrder: targetIndex,
                  hidden: values.isHidden,
                  expectedRevisionNumber: serverMetaRef.current.categoryRevisionById[categoryId] ?? null,
                }),
              });
            }
            await refreshStateFromServer(session);
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      resetCategoriesToDefaults(workspaceId) {
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/category/reset-defaults?spaceId=${workspaceId}`, {
              method: "POST",
            });
            await refreshStateFromServer(session);
            showToast("기본 카테고리 구조로 초기화했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addTag(workspaceId, name) {
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/tags/items", {
              method: "POST",
              body: JSON.stringify({
                schemeId: getTagSchemeId(workspaceId),
                name,
                color: "lavender",
                sortOrder: state.tags.filter((item) => item.workspaceId === workspaceId).length,
                hidden: false,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${name} 태그를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      setFinancialProfile(workspaceId, values) {
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/financial-profile?spaceId=${workspaceId}`, {
              method: "PUT",
              body: JSON.stringify({
                spaceId: Number(workspaceId),
                monthlyNetIncome: values.monthlyNetIncome,
                targetSavingsRate: values.targetSavingsRate,
                warningSpendRate: values.warningSpendRate,
                warningFixedCostRate: values.warningFixedCostRate,
                loopPriorityCategoryIds: (values.loopPriorityCategoryIds ?? []).map(Number),
                expectedRevisionNumber: serverMetaRef.current.financialProfileRevisionByWorkspaceId[workspaceId] ?? null,
              }),
            });
            await refreshStateFromServer(session);
            showToast("재무 기준값을 저장했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addSettlement(input) {
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/settlements", {
              method: "POST",
              body: JSON.stringify({
                spaceId: Number(input.workspaceId),
                monthKey: input.month,
                transferKey: input.transferKey,
                fromAssetId: toNullableNumber(input.fromAccountId),
                toAssetId: toNullableNumber(input.toAccountId),
                amount: input.amount,
                note: input.note,
                completedAt: new Date().toISOString(),
              }),
            });
            await refreshStateFromServer(session);
            showToast("이체 확인 내역을 기록했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      removeSettlement(workspaceId, month, transferKey) {
        const current = state.settlements.find(
          (item) => item.workspaceId === workspaceId && item.month === month && item.transferKey === transferKey,
        );
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/settlements/${current.id}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast("이체 확인을 취소했습니다.", "info");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addTransaction(input) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, { type: "addTransaction", payload: input });
            const previousIds = new Set(stateRef.current.transactions.map((item) => item.id));
            const created = nextState.transactions.find((item) => !previousIds.has(item.id));
            if (!created) throw new Error("추가할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(created);
            showToast(`${input.merchantName} 거래를 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updateTransactionDetails(workspaceId, transactionId, patch) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "updateTransactionDetails",
              payload: { workspaceId, transactionId, patch },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            showToast("거래 기본 정보를 수정했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignCategory(workspaceId, transactionId, categoryId) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignCategory",
              payload: { workspaceId, transactionId, categoryId },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            showToast("거래 카테고리를 지정했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      clearCategory(workspaceId, transactionId) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "clearCategory",
              payload: { workspaceId, transactionId },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            showToast("거래 카테고리를 해제했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignCategoryByMerchant(workspaceId, merchantName, categoryId) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignCategoryByMerchant",
              payload: { workspaceId, merchantName, categoryId },
            });
            const updated = nextState.transactions.filter((item) => item.workspaceId === workspaceId && item.merchantName === merchantName);
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(`${merchantName} 반복 거래에 카테고리를 반영했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignCategoryBatch(workspaceId, transactionIds, categoryId) {
        const category = state.categories.find((item) => item.id === categoryId);
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignCategoryBatch",
              payload: { workspaceId, transactionIds, categoryId },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(`${transactionIds.length}건 거래에 ${category?.name ?? "카테고리"}를 일괄 반영했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignTag(workspaceId, transactionId, tagId) {
        const tag = state.tags.find((item) => item.id === tagId);
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignTag",
              payload: { workspaceId, transactionId, tagId },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            showToast(`${tag?.name ?? "태그"} 태그를 거래에 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      removeTag(workspaceId, transactionId, tagId) {
        const tag = state.tags.find((item) => item.id === tagId);
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "removeTag",
              payload: { workspaceId, transactionId, tagId },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            showToast(`${tag?.name ?? "태그"} 태그를 거래에서 제거했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignTagBatch(workspaceId, transactionIds, tagId) {
        const tag = state.tags.find((item) => item.id === tagId);
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignTagBatch",
              payload: { workspaceId, transactionIds, tagId },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(`${transactionIds.length}건 거래에 ${tag?.name ?? "태그"}를 일괄 반영했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      assignTagByMerchant(workspaceId, merchantName, tagId) {
        const tag = state.tags.find((item) => item.id === tagId);
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "assignTagByMerchant",
              payload: { workspaceId, merchantName, tagId },
            });
            const updated = nextState.transactions.filter((item) => item.workspaceId === workspaceId && item.merchantName === merchantName);
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(`${merchantName} 반복 거래에 ${tag?.name ?? "태그"}를 반영했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      updateTransactionFlags(workspaceId, transactionId, patch) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "updateTransactionFlags",
              payload: { workspaceId, transactionId, patch },
            });
            const updated = nextState.transactions.find((item) => item.id === transactionId);
            if (!updated) throw new Error("수정할 거래를 찾지 못했습니다.");
            await saveTransactionToServer(updated);
            if (typeof patch.isLoop === "boolean") {
              showToast(patch.isLoop ? "루프에 추가했습니다." : "루프에서 제외했습니다.", "success");
              return;
            }
            if (typeof patch.isLoopIgnored === "boolean") {
              showToast(patch.isLoopIgnored ? "이 추천은 숨겼습니다." : "숨긴 추천을 다시 보이게 했습니다.", "success");
              return;
            }
            if (typeof patch.isSharedExpense === "boolean") {
              showToast(
                patch.isSharedExpense ? "거래 흐름 표시를 바꿨습니다." : "거래 흐름 표시를 해제했습니다.",
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
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      setTransactionLoopFlagBatch(workspaceId, transactionIds, isLoop) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "setTransactionLoopFlagBatch",
              payload: { workspaceId, transactionIds, isLoop },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(isLoop ? "선택한 거래를 루프로 묶었습니다." : "선택한 루프를 지웠습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      setTransactionLoopIgnoredBatch(workspaceId, transactionIds, isLoopIgnored) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "setTransactionLoopIgnoredBatch",
              payload: { workspaceId, transactionIds, isLoopIgnored },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(isLoopIgnored ? "추천을 숨겼습니다." : "추천을 다시 보이게 했습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      setTransactionLoopGroupOverrideBatch(workspaceId, transactionIds, loopGroupOverrideKey, isLoop = true) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "setTransactionLoopGroupOverrideBatch",
              payload: { workspaceId, transactionIds, loopGroupOverrideKey, isLoop },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast("추천 루프를 하나로 합쳤습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      setTransactionLoopDisplayNameBatch(workspaceId, transactionIds, loopDisplayName) {
        void (async () => {
          try {
            const nextState = reducer(stateRef.current, {
              type: "setTransactionLoopDisplayNameBatch",
              payload: { workspaceId, transactionIds, loopDisplayName },
            });
            const updated = nextState.transactions.filter((item) => transactionIds.includes(item.id));
            await Promise.all(updated.map((transaction) => saveTransactionToServer(transaction)));
            showToast(loopDisplayName?.trim() ? "루프 이름을 바꿨습니다." : "루프 이름을 기본값으로 되돌렸습니다.", "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      addIncomeEntry(input) {
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, "/api/income-entries", {
              method: "POST",
              body: JSON.stringify({
                spaceId: Number(input.workspaceId),
                ownerPersonId: toNullableNumber(input.ownerPersonId),
                occurredAt: input.occurredAt,
                sourceName: input.sourceName,
                amount: input.amount,
              }),
            });
            await refreshStateFromServer(session);
            showToast(`${input.sourceName} 수입을 추가했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
      deleteIncomeEntry(workspaceId, incomeEntryId) {
        const current = state.incomeEntries.find((item) => item.workspaceId === workspaceId && item.id === incomeEntryId);
        if (!current) return;
        void (async () => {
          try {
            const session = getRequiredSession();
            await requestServerJson(session, `/api/income-entries/${incomeEntryId}`, {
              method: "DELETE",
            });
            await refreshStateFromServer(session);
            showToast(`${current.sourceName} 수입을 삭제했습니다.`, "success");
          } catch (error) {
            handleServerMutationError(error);
          }
        })();
      },
    }),
    [isReady, showToast, state, workspaceLoopDataByWorkspaceId],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}


