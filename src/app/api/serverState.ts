import { createEmptyState } from "../../domain/app/defaults";
import type {
  Account,
  AppState,
  Card,
  Category,
  FinancialProfile,
  ID,
  ImportRecord,
  IncomeEntry,
  Person,
  ReviewItem,
  SettlementRecord,
  Tag,
  Transaction,
  Workspace,
} from "../../shared/types/models";
import type { AuthSession } from "../authSession";

type ServerSpaceResponse = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ServerFinancialProfileResponse = {
  id: number;
  spaceId: number;
  monthlyNetIncome: number;
  targetSavingsRate: number;
  warningSpendRate: number;
  warningFixedCostRate: number;
  loopPriorityCategoryIds: number[];
  revisionNumber: number;
};

type ServerPersonResponse = {
  id: number;
  spaceId: number;
  userId: number | null;
  linkedUserDisplayName: string | null;
  name: string;
  displayName: string;
  role: string;
  memo: string;
  active: boolean;
  sortOrder: number;
  hidden: boolean;
};

type ServerAssetResponse = {
  id: number;
  spaceId: number;
  assetKindCode: string;
  ownerPersonId: number | null;
  primaryPersonId: number | null;
  providerId: number | null;
  name: string;
  alias: string;
  groupType: string;
  usageType: string;
  currencyCode: string;
  shared: boolean;
  sortOrder: number;
  hidden: boolean;
  memo: string;
  createdImportRecordKey: string | null;
  revisionNumber: number;
  participantPersonIds: number[];
  accountDetail: {
    accountType: string;
    institutionName: string;
    accountNumberMasked: string;
  } | null;
  cardDetail: {
    cardType: string;
    issuerName: string;
    cardNumberMasked: string;
    settlementAccountAssetId: number | null;
  } | null;
};

type ServerCategorySchemeResponse = {
  id: number;
  spaceId: number;
  code: string;
  name: string;
  defaultScheme: boolean;
  active: boolean;
  sortOrder: number;
};

type ServerCategoryGroupResponse = {
  id: number;
  schemeId: number;
  name: string;
  direction: string;
  fixedOrVariable: string;
  necessity: string;
  budgetable: boolean;
  reportable: boolean;
  linkedAssetId: number | null;
  sortOrder: number;
  hidden: boolean;
  revisionNumber: number;
};

type ServerCategoryResponse = {
  id: number;
  schemeId: number;
  groupId: number;
  parentCategoryId: number | null;
  name: string;
  direction: string;
  fixedOrVariable: string;
  necessity: string;
  budgetable: boolean;
  reportable: boolean;
  linkedAssetId: number | null;
  sortOrder: number;
  hidden: boolean;
  revisionNumber: number;
};

type ServerTagSchemeResponse = {
  id: number;
  spaceId: number;
  code: string;
  name: string;
  defaultScheme: boolean;
  active: boolean;
  sortOrder: number;
};

type ServerTagResponse = {
  id: number;
  schemeId: number;
  name: string;
  color: string;
  sortOrder: number;
  hidden: boolean;
};

type ServerTransactionResponse = {
  id: number;
  spaceId: number;
  importRecordId: number | null;
  occurredAt: string;
  settledAt: string | null;
  transactionType: string;
  sourceType: string;
  ownerPersonId: number | null;
  cardAssetId: number | null;
  accountAssetId: number | null;
  fromAssetId: number | null;
  toAssetId: number | null;
  merchantName: string;
  description: string;
  amount: number;
  originalAmount: number | null;
  discountAmount: number | null;
  categoryId: number | null;
  tagIds: number[];
  internalTransfer: boolean;
  expenseImpact: boolean;
  sharedExpense: boolean;
  loop: boolean;
  loopIgnored: boolean;
  loopGroupOverrideKey: string | null;
  loopDisplayName: string | null;
  refundOfTransactionId: number | null;
  status: string;
  revisionNumber: number;
};

type ServerReviewResponse = {
  id: number;
  spaceId: number;
  importRecordId: number | null;
  reviewType: string;
  status: string;
  primaryTransactionId: number;
  relatedTransactionIds: number[];
  confidenceScore: number;
  summary: string;
  suggestedCategoryId: number | null;
  revisionNumber: number;
};

type ServerImportResponse = {
  id: number;
  spaceId: number;
  fileName: string;
  statementMonth: string | null;
  fileFingerprint: string | null;
  contentFingerprint: string | null;
  importedAt: string;
  parserId: string;
  rowCount: number;
  reviewCount: number;
  revisionNumber: number;
};

type ServerSettlementResponse = {
  id: number;
  spaceId: number;
  monthKey: string;
  transferKey: string;
  fromAssetId: number | null;
  toAssetId: number | null;
  amount: number;
  note: string;
  completedAt: string;
  revisionNumber: number;
};

type ServerIncomeResponse = {
  id: number;
  spaceId: number;
  ownerPersonId: number | null;
  occurredAt: string;
  sourceName: string;
  amount: number;
  revisionNumber: number;
  createdAt: string;
};

export type ServerStateMeta = {
  categorySchemeIdByWorkspaceId: Record<ID, ID>;
  tagSchemeIdByWorkspaceId: Record<ID, ID>;
  personRevisionById: Record<ID, number>;
  assetRevisionById: Record<ID, number>;
  categoryRevisionById: Record<ID, number>;
  tagRevisionById: Record<ID, number>;
  transactionRevisionById: Record<ID, number>;
  reviewRevisionById: Record<ID, number>;
  importRevisionById: Record<ID, number>;
  settlementRevisionById: Record<ID, number>;
  incomeRevisionById: Record<ID, number>;
  financialProfileRevisionByWorkspaceId: Record<ID, number>;
};

function toId(value: number | string | null | undefined): ID | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toLowerCaseValue<T extends string>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return value.toLowerCase() as T;
}

async function readErrorMessage(response: Response) {
  try {
    const parsed = (await response.json()) as { message?: string; error?: string };
    return parsed.message || parsed.error || `API request failed (${response.status})`;
  } catch {
    return `API request failed (${response.status})`;
  }
}

export async function requestServerJson<T>(
  session: AuthSession,
  path: string,
  init?: RequestInit,
  options?: { withSessionHeader?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options?.withSessionHeader !== false) {
    headers.set("X-Session-Key", session.sessionKey);
  }

  const response = await fetch(`${session.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function loadServerAppState(session: AuthSession): Promise<{ state: AppState; meta: ServerStateMeta }> {
  const empty = createEmptyState();
  const [
    space,
    financialProfile,
    people,
    assets,
    categorySchemes,
    tagSchemes,
    transactions,
    reviews,
    imports,
    settlements,
    incomeEntries,
  ] = await Promise.all([
    requestServerJson<ServerSpaceResponse>(session, `/api/spaces/${session.spaceId}`, undefined, { withSessionHeader: false }),
    requestServerJson<ServerFinancialProfileResponse>(session, `/api/financial-profile?spaceId=${session.spaceId}`),
    requestServerJson<ServerPersonResponse[]>(session, `/api/people?spaceId=${session.spaceId}`),
    requestServerJson<ServerAssetResponse[]>(session, `/api/assets?spaceId=${session.spaceId}`),
    requestServerJson<ServerCategorySchemeResponse[]>(session, `/api/category/schemes?spaceId=${session.spaceId}`),
    requestServerJson<ServerTagSchemeResponse[]>(session, `/api/tags/schemes?spaceId=${session.spaceId}`),
    requestServerJson<ServerTransactionResponse[]>(session, `/api/transactions?spaceId=${session.spaceId}`),
    requestServerJson<ServerReviewResponse[]>(session, `/api/reviews?spaceId=${session.spaceId}`),
    requestServerJson<ServerImportResponse[]>(session, `/api/import-records?spaceId=${session.spaceId}`),
    requestServerJson<ServerSettlementResponse[]>(session, `/api/settlements?spaceId=${session.spaceId}`),
    requestServerJson<ServerIncomeResponse[]>(session, `/api/income-entries?spaceId=${session.spaceId}`),
  ]);

  const categoryScheme = [...categorySchemes]
    .sort((left, right) => Number(right.defaultScheme) - Number(left.defaultScheme) || left.sortOrder - right.sortOrder)
    .at(0);
  const tagScheme = [...tagSchemes]
    .sort((left, right) => Number(right.defaultScheme) - Number(left.defaultScheme) || left.sortOrder - right.sortOrder)
    .at(0);

  const [categoryGroups, categoryItems, tagItems] = await Promise.all([
    categoryScheme
      ? requestServerJson<ServerCategoryGroupResponse[]>(session, `/api/category/groups?schemeId=${categoryScheme.id}`)
      : Promise.resolve([]),
    categoryScheme
      ? requestServerJson<ServerCategoryResponse[]>(session, `/api/category/items?schemeId=${categoryScheme.id}`)
      : Promise.resolve([]),
    tagScheme ? requestServerJson<ServerTagResponse[]>(session, `/api/tags/items?schemeId=${tagScheme.id}`) : Promise.resolve([]),
  ]);

  const workspaceId = String(space.id);
  const workspace: Workspace = {
    id: workspaceId,
    name: space.name,
    source: "empty",
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };

  const nextPeople: Person[] = people.map((person) => ({
    id: String(person.id),
    workspaceId,
    linkedUserId: toId(person.userId),
    linkedUserDisplayName: person.linkedUserDisplayName,
    name: person.name,
    displayName: person.displayName,
    role: person.role === "OWNER" ? "owner" : "member",
    memo: person.memo,
    isActive: person.active,
    sortOrder: person.sortOrder,
    isHidden: person.hidden,
  }));

  const nextAccounts: Account[] = assets
    .filter((asset) => asset.assetKindCode !== "card")
    .map((asset) => ({
      id: String(asset.id),
      workspaceId,
      ownerPersonId: toId(asset.ownerPersonId),
      primaryPersonId: toId(asset.primaryPersonId),
      participantPersonIds: asset.participantPersonIds.map(String),
      accountGroupType: toLowerCaseValue(asset.groupType, "personal"),
      name: asset.name,
      alias: asset.alias,
      institutionName: asset.accountDetail?.institutionName ?? asset.name,
      accountNumberMasked: asset.accountDetail?.accountNumberMasked ?? "",
      accountType: toLowerCaseValue(asset.accountDetail?.accountType ?? asset.assetKindCode, "other"),
      usageType: toLowerCaseValue(asset.usageType, "other"),
      isShared: asset.shared,
      memo: asset.memo,
      createdImportRecordId: asset.createdImportRecordKey ?? null,
      sortOrder: asset.sortOrder,
      isHidden: asset.hidden,
    }));

  const nextCards: Card[] = assets
    .filter((asset) => asset.assetKindCode === "card")
    .map((asset) => ({
      id: String(asset.id),
      workspaceId,
      ownerPersonId: toId(asset.ownerPersonId),
      name: asset.name,
      issuerName: asset.cardDetail?.issuerName ?? asset.name,
      cardNumberMasked: asset.cardDetail?.cardNumberMasked ?? "",
      linkedAccountId: toId(asset.cardDetail?.settlementAccountAssetId),
      cardType: toLowerCaseValue(asset.cardDetail?.cardType, "other"),
      memo: asset.memo,
      createdImportRecordId: asset.createdImportRecordKey ?? null,
      sortOrder: asset.sortOrder,
      isHidden: asset.hidden,
    }));

  const nextCategories: Category[] = [
    ...categoryGroups.map((group) => ({
      id: String(group.id),
      workspaceId,
      name: group.name,
      categoryType: "group" as const,
      parentCategoryId: null,
      linkedAccountId: toId(group.linkedAssetId),
      sortOrder: group.sortOrder,
      isHidden: group.hidden,
      direction: toLowerCaseValue(group.direction, "expense"),
      fixedOrVariable: toLowerCaseValue(group.fixedOrVariable, "variable"),
      necessity: toLowerCaseValue(group.necessity, "discretionary"),
      budgetable: group.budgetable,
      reportable: group.reportable,
    })),
    ...categoryItems.map((item) => ({
      id: String(item.id),
      workspaceId,
      name: item.name,
      categoryType: "category" as const,
      parentCategoryId: toId(item.groupId),
      linkedAccountId: toId(item.linkedAssetId),
      sortOrder: item.sortOrder,
      isHidden: item.hidden,
      direction: toLowerCaseValue(item.direction, "expense"),
      fixedOrVariable: toLowerCaseValue(item.fixedOrVariable, "variable"),
      necessity: toLowerCaseValue(item.necessity, "discretionary"),
      budgetable: item.budgetable,
      reportable: item.reportable,
    })),
  ];

  const nextTags: Tag[] = tagItems.map((tag) => ({
    id: String(tag.id),
    workspaceId,
    name: tag.name,
    color: tag.color,
  }));

  const nextTransactions: Transaction[] = transactions.map((transaction) => ({
    id: String(transaction.id),
    workspaceId,
    importRecordId: toId(transaction.importRecordId),
    occurredAt: transaction.occurredAt,
    settledAt: transaction.settledAt,
    transactionType: toLowerCaseValue(transaction.transactionType, "expense"),
    sourceType: toLowerCaseValue(transaction.sourceType, "manual"),
    ownerPersonId: toId(transaction.ownerPersonId),
    cardId: toId(transaction.cardAssetId),
    accountId: toId(transaction.accountAssetId),
    fromAccountId: toId(transaction.fromAssetId),
    toAccountId: toId(transaction.toAssetId),
    merchantName: transaction.merchantName,
    description: transaction.description,
    amount: transaction.amount,
    originalAmount: transaction.originalAmount ?? undefined,
    discountAmount: transaction.discountAmount ?? undefined,
    categoryId: toId(transaction.categoryId),
    tagIds: transaction.tagIds.map(String),
    isInternalTransfer: transaction.internalTransfer,
    isExpenseImpact: transaction.expenseImpact,
    isSharedExpense: transaction.sharedExpense,
    isLoop: transaction.loop,
    isLoopIgnored: transaction.loopIgnored,
    loopGroupOverrideKey: transaction.loopGroupOverrideKey,
    loopDisplayName: transaction.loopDisplayName,
    refundOfTransactionId: toId(transaction.refundOfTransactionId),
    status: toLowerCaseValue(transaction.status, "active"),
  }));

  const nextReviews: ReviewItem[] = reviews.map((review) => ({
    id: String(review.id),
    workspaceId,
    importRecordId: toId(review.importRecordId),
    reviewType: toLowerCaseValue(review.reviewType, "uncategorized_transaction"),
    status: toLowerCaseValue(review.status, "open"),
    primaryTransactionId: String(review.primaryTransactionId),
    relatedTransactionIds: review.relatedTransactionIds.map(String),
    confidenceScore: Number(review.confidenceScore ?? 0),
    summary: review.summary,
    suggestedCategoryId: toId(review.suggestedCategoryId),
  }));

  const nextImports: ImportRecord[] = imports.map((record) => ({
    id: String(record.id),
    workspaceId,
    fileName: record.fileName,
    statementMonth: record.statementMonth,
    fileFingerprint: record.fileFingerprint,
    contentFingerprint: record.contentFingerprint,
    importedAt: record.importedAt,
    parserId: record.parserId,
    rowCount: record.rowCount,
    reviewCount: record.reviewCount,
  }));

  const nextSettlements: SettlementRecord[] = settlements.map((record) => ({
    id: String(record.id),
    workspaceId,
    month: record.monthKey,
    transferKey: record.transferKey,
    fromAccountId: toId(record.fromAssetId),
    toAccountId: toId(record.toAssetId),
    amount: record.amount,
    note: record.note,
    completedAt: record.completedAt,
  }));

  const nextIncomeEntries: IncomeEntry[] = incomeEntries.map((entry) => ({
    id: String(entry.id),
    workspaceId,
    ownerPersonId: toId(entry.ownerPersonId),
    occurredAt: entry.occurredAt,
    sourceName: entry.sourceName,
    amount: entry.amount,
    createdAt: entry.createdAt,
  }));

  const nextFinancialProfile: FinancialProfile = {
    id: String(financialProfile.id),
    workspaceId,
    monthlyNetIncome: financialProfile.monthlyNetIncome,
    targetSavingsRate: financialProfile.targetSavingsRate,
    warningSpendRate: financialProfile.warningSpendRate,
    warningFixedCostRate: financialProfile.warningFixedCostRate,
    loopPriorityCategoryIds: financialProfile.loopPriorityCategoryIds.map(String),
  };

  const meta: ServerStateMeta = {
    categorySchemeIdByWorkspaceId: categoryScheme ? { [workspaceId]: String(categoryScheme.id) } : {},
    tagSchemeIdByWorkspaceId: tagScheme ? { [workspaceId]: String(tagScheme.id) } : {},
    personRevisionById: Object.fromEntries(people.map((person) => [String(person.id), 0])),
    assetRevisionById: Object.fromEntries(assets.map((asset) => [String(asset.id), asset.revisionNumber])),
    categoryRevisionById: Object.fromEntries([
      ...categoryGroups.map((group) => [String(group.id), group.revisionNumber]),
      ...categoryItems.map((item) => [String(item.id), item.revisionNumber]),
    ]),
    tagRevisionById: Object.fromEntries(tagItems.map((tag) => [String(tag.id), 0])),
    transactionRevisionById: Object.fromEntries(transactions.map((transaction) => [String(transaction.id), transaction.revisionNumber])),
    reviewRevisionById: Object.fromEntries(reviews.map((review) => [String(review.id), review.revisionNumber])),
    importRevisionById: Object.fromEntries(imports.map((record) => [String(record.id), record.revisionNumber])),
    settlementRevisionById: Object.fromEntries(settlements.map((record) => [String(record.id), record.revisionNumber])),
    incomeRevisionById: Object.fromEntries(incomeEntries.map((entry) => [String(entry.id), entry.revisionNumber])),
    financialProfileRevisionByWorkspaceId: { [workspaceId]: financialProfile.revisionNumber },
  };

  return {
    state: {
      ...empty,
      activeWorkspaceId: workspaceId,
      workspaces: [workspace],
      financialProfiles: [nextFinancialProfile],
      people: nextPeople,
      accounts: nextAccounts,
      cards: nextCards,
      categories: nextCategories,
      tags: nextTags,
      transactions: nextTransactions,
      reviews: nextReviews,
      imports: nextImports,
      settlements: nextSettlements,
      incomeEntries: nextIncomeEntries,
    },
    meta,
  };
}
