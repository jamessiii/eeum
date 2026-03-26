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
import { clearGuideSampleState, hasGuideSampleState, readGuideSampleState, writeGuideSampleState } from "../../domain/guidance/guideSampleState";
import { createGuideSampleBundle, GUIDE_SAMPLE_MEMO, GUIDE_SAMPLE_PARSER_ID } from "../../domain/guidance/guideSampleBundle";
import type { Account, AppState, Card, Category, FinancialProfile, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";
import { useToast } from "../toast/ToastProvider";
import { getWorkspaceScope } from "./selectors";

type PersonDraft = Pick<Person, "name" | "displayName" | "role" | "memo" | "isActive" | "sortOrder" | "isHidden">;
type AccountDraft = Pick<
  Account,
  "ownerPersonId" | "name" | "alias" | "institutionName" | "accountNumberMasked" | "accountType" | "usageType" | "isShared" | "memo" | "sortOrder" | "isHidden"
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
        };
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
    schemaVersion: Math.max(rawState.schemaVersion ?? 0, 7),
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
    })),
    reviews: rawState.reviews.map((review) => ({
      ...review,
      importRecordId: review.importRecordId ?? null,
    })),
    imports: rawState.imports.map((record) => ({
      ...record,
      statementMonth: record.statementMonth ?? null,
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

  const hasSampleData =
    samplePersonIds.size > 0 ||
    sampleAccountIds.size > 0 ||
    sampleCardIds.size > 0 ||
    sampleTransactionIds.size > 0 ||
    sampleReviewIds.size > 0 ||
    sampleImportIds.size > 0;

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
          .filter((account) => account.workspaceId === action.payload.workspaceId && account.ownerPersonId === action.payload.personId)
          .map((account) => account.id),
      );
      return {
        ...state,
        people: state.people.filter(
          (person) => !(person.workspaceId === action.payload.workspaceId && person.id === action.payload.personId),
        ),
        accounts: state.accounts.filter(
          (account) => !(account.workspaceId === action.payload.workspaceId && account.ownerPersonId === action.payload.personId),
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
                ownerPersonId: action.payload.values.isShared ? null : action.payload.values.ownerPersonId,
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
            fromPersonId: action.payload.fromPersonId,
            toPersonId: action.payload.toPersonId,
            amount: Math.abs(action.payload.amount),
            note: action.payload.note,
            completedAt: new Date().toISOString(),
          },
        ],
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
    case "deleteImportRecord":
      return deleteImportRecordFromState(state, action.payload.workspaceId, action.payload.importRecordId);
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
  deleteImportRecord: (workspaceId: string, importRecordId: string) => void;
  loadGuideSampleData: () => void;
  clearGuideSampleData: () => void;
  setActiveWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => void;
  resetApp: () => Promise<void>;
  exportState: () => void;
  importState: (file: File) => Promise<void>;
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
        const activeWorkspaceId = state.activeWorkspaceId;
        const classificationContext = activeWorkspaceId ? getWorkspaceScope(state, activeWorkspaceId) : null;
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
      commitImportedBundle(bundle, fileName) {
        const activeWorkspaceId = state.activeWorkspaceId;
        const payload = activeWorkspaceId ? rebaseImportedBundleIntoWorkspace(state, activeWorkspaceId, bundle) : bundle;
        dispatch({ type: "mergeBundle", payload });
        showToast(`${fileName} 업로드를 완료했습니다.`, "success");
      },
      deleteImportRecord(workspaceId, importRecordId) {
        dispatch({ type: "deleteImportRecord", payload: { workspaceId, importRecordId } });
        showToast("명세서를 삭제했습니다.", "success");
      },
      loadGuideSampleData() {
        const activeWorkspaceId = state.activeWorkspaceId;
        if (!activeWorkspaceId) return;

        const scope = getWorkspaceScope(state, activeWorkspaceId);
        if (scope.transactions.length > 0 || scope.imports.length > 0) {
          showToast("가이드 샘플은 거래가 없는 가계부에서만 불러올 수 있습니다.", "info");
          return;
        }

        const primaryPerson =
          scope.people.find((person) => !person.isHidden && person.isActive !== false) ?? scope.people[0] ?? null;
        const bundle = createGuideSampleBundle({
          ownerName: primaryPerson?.displayName?.trim() || primaryPerson?.name?.trim() || null,
        });
        const payload = rebaseImportedBundleIntoWorkspace(state, activeWorkspaceId, bundle);
        writeGuideSampleState(activeWorkspaceId, {
          personIds: payload.people.map((person) => person.id),
          accountIds: payload.accounts.map((account) => account.id),
          cardIds: payload.cards.map((card) => card.id),
          transactionIds: payload.transactions.map((transaction) => transaction.id),
          reviewIds: payload.reviews.map((review) => review.id),
          importIds: payload.imports.map((record) => record.id),
        });
        dispatch({ type: "mergeBundle", payload });
        showToast("가이드용 샘플 결제내역을 불러왔습니다.", "success");
      },
      clearGuideSampleData() {
        const activeWorkspaceId = state.activeWorkspaceId;
        if (!activeWorkspaceId) return;

        const { nextState, removed } = removeGuideSampleDataFromState(state, activeWorkspaceId);
        clearGuideSampleState(activeWorkspaceId);
        if (!removed) return;

        dispatch({ type: "replaceState", payload: nextState });
        showToast("튜토리얼 샘플 데이터를 정리했습니다.", "success");
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
      deletePerson(workspaceId, personId) {
        const current = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
        if (!current) return;
        dispatch({ type: "deletePerson", payload: { workspaceId, personId } });
        showToast(`${current.displayName || current.name} 사용자를 삭제했습니다.`, "success");
      },
      movePerson(workspaceId, personId, targetIndex) {
        dispatch({ type: "movePerson", payload: { workspaceId, personId, targetIndex } });
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
      deleteAccount(workspaceId, accountId) {
        const current = state.accounts.find((item) => item.workspaceId === workspaceId && item.id === accountId);
        if (!current) return;
        dispatch({ type: "deleteAccount", payload: { workspaceId, accountId } });
        showToast(`${current.alias || current.name} 계좌를 삭제했습니다.`, "success");
      },
      moveAccount(workspaceId, accountId, targetOwnerPersonId, targetIndex) {
        dispatch({ type: "moveAccount", payload: { workspaceId, accountId, targetOwnerPersonId, targetIndex } });
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
      deleteCard(workspaceId, cardId) {
        const current = state.cards.find((item) => item.workspaceId === workspaceId && item.id === cardId);
        if (!current) return;
        dispatch({ type: "deleteCard", payload: { workspaceId, cardId } });
        showToast(`${current.name} 카드를 삭제했습니다.`, "success");
      },
      moveCard(workspaceId, cardId, targetOwnerPersonId, targetIndex) {
        dispatch({ type: "moveCard", payload: { workspaceId, cardId, targetOwnerPersonId, targetIndex } });
      },
      addCategory(workspaceId, input, parentCategoryId = null) {
        const values = createCategoryDraft(input, parentCategoryId);
        if (!values.name) return;
        const name = values.name;
        dispatch({ type: "addCategory", payload: { workspaceId, values } });
        showToast(`${name} 카테고리를 추가했습니다.`, "success");
      },
      updateCategory(workspaceId, categoryId, input) {
        const current = state.categories.find((item) => item.workspaceId === workspaceId && item.id === categoryId);
        if (!current) return;
        const values = createCategoryDraft({ ...current, ...input });
        dispatch({ type: "updateCategory", payload: { workspaceId, categoryId, values } });
        showToast(values.categoryType === "group" ? `${values.name} 그룹 정보를 수정했습니다.` : `${values.name} 카테고리 정보를 수정했습니다.`, "success");
      },
      deleteCategory(workspaceId, categoryId) {
        const current = state.categories.find((item) => item.workspaceId === workspaceId && item.id === categoryId);
        if (!current) return;
        dispatch({ type: "deleteCategory", payload: { workspaceId, categoryId } });
        showToast(current.categoryType === "group" ? `${current.name} 그룹과 하위 카테고리를 삭제했습니다.` : `${current.name} 카테고리를 삭제했습니다.`, "success");
      },
      moveCategory(workspaceId, categoryId, targetParentCategoryId, targetIndex) {
        dispatch({ type: "moveCategory", payload: { workspaceId, categoryId, targetParentCategoryId, targetIndex } });
      },
      resetCategoriesToDefaults(workspaceId) {
        dispatch({ type: "resetCategoriesToDefaults", payload: { workspaceId } });
        showToast("기본 카테고리 구조로 초기화했습니다.", "success");
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
      addIncomeEntry(input) {
        dispatch({ type: "addIncomeEntry", payload: input });
        showToast(`${input.sourceName} 수입을 추가했습니다.`, "success");
      },
      deleteIncomeEntry(workspaceId, incomeEntryId) {
        const current = state.incomeEntries.find((item) => item.workspaceId === workspaceId && item.id === incomeEntryId);
        if (!current) return;
        dispatch({ type: "deleteIncomeEntry", payload: { workspaceId, incomeEntryId } });
        showToast(`${current.sourceName} 수입을 삭제했습니다.`, "success");
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
