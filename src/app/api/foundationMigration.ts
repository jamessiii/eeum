import type { Account, Card, Category, Person } from "../../shared/types/models";

type ServerPersonResponse = {
  id: number;
};

type ServerAssetResponse = {
  id: number;
};

type ServerCategorySchemeResponse = {
  id: number;
};

type ServerCategoryGroupResponse = {
  id: number;
};

type ServerCategoryResponse = {
  id: number;
};

type FoundationMigrationInput = {
  apiBaseUrl: string;
  spaceId: number;
  sessionKey: string;
  people: Person[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
};

export type FoundationMigrationSummary = {
  peopleCount: number;
  accountCount: number;
  cardCount: number;
  categoryGroupCount: number;
  categoryCount: number;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `요청이 실패했습니다. (${response.status})`;

    try {
      const data = (await response.json()) as { message?: string; details?: string[] };
      if (data.message) {
        message = data.details?.length ? `${data.message}: ${data.details.join(", ")}` : data.message;
      }
    } catch {
      // Ignore non-JSON error bodies and keep the fallback message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function toAssetUsageType(value: Account["usageType"] | Card["cardType"] | string | undefined) {
  return String(value ?? "other").trim().toUpperCase();
}

function toAssetGroupType(value: Account["accountGroupType"] | undefined) {
  return value === "meeting" ? "MEETING" : "PERSONAL";
}

function toAccountType(value: Account["accountType"] | undefined) {
  return String(value ?? "other").trim().toUpperCase();
}

function toCardType(value: Card["cardType"] | undefined) {
  return String(value ?? "other").trim().toUpperCase();
}

function toCategoryDirection(value: Category["direction"] | undefined) {
  return String(value ?? "expense").trim().toUpperCase();
}

function toCategoryCadence(value: Category["fixedOrVariable"] | undefined) {
  return String(value ?? "variable").trim().toUpperCase();
}

function toCategoryNecessity(value: Category["necessity"] | undefined) {
  return String(value ?? "discretionary").trim().toUpperCase();
}

function toAccountAssetKindCode(account: Account) {
  switch (account.accountType) {
    case "cash":
      return "cash";
    case "loan":
      return "loan";
    default:
      return "account";
  }
}

function createHeaders(sessionKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Session-Key": sessionKey,
  };
}

function createCategorySchemeCode() {
  return `legacy-foundation-${Date.now()}`;
}

function sortByOrder<T extends { sortOrder?: number; name?: string; displayName?: string; alias?: string; id: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;

    const leftLabel = left.name ?? left.displayName ?? left.alias ?? left.id;
    const rightLabel = right.name ?? right.displayName ?? right.alias ?? right.id;
    return String(leftLabel).localeCompare(String(rightLabel), "ko-KR");
  });
}

export async function migrateFoundationData(input: FoundationMigrationInput): Promise<FoundationMigrationSummary> {
  const apiBaseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const headers = createHeaders(input.sessionKey);

  const [existingPeople, existingAssets, existingSchemes] = await Promise.all([
    requestJson<Array<{ id: number }>>(`${apiBaseUrl}/api/people?spaceId=${input.spaceId}`),
    requestJson<Array<{ id: number }>>(`${apiBaseUrl}/api/assets?spaceId=${input.spaceId}`),
    requestJson<Array<{ id: number }>>(`${apiBaseUrl}/api/category/schemes?spaceId=${input.spaceId}`),
  ]);

  if (existingPeople.length || existingAssets.length || existingSchemes.length) {
    throw new Error("서버 공간이 비어 있지 않아 기초 데이터 이전을 중단했습니다. 새 공간에서 먼저 진행해주세요.");
  }

  const personIdMap = new Map<string, number>();
  for (const person of sortByOrder(input.people)) {
    const created = await requestJson<ServerPersonResponse>(`${apiBaseUrl}/api/people`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        spaceId: input.spaceId,
        name: person.name,
        displayName: person.displayName,
        role: person.role === "owner" ? "OWNER" : "MEMBER",
        memo: person.memo,
        active: person.isActive,
        sortOrder: person.sortOrder ?? 0,
        hidden: person.isHidden ?? false,
      }),
    });

    personIdMap.set(person.id, created.id);
  }

  const accountIdMap = new Map<string, number>();
  for (const account of sortByOrder(input.accounts)) {
    const created = await requestJson<ServerAssetResponse>(`${apiBaseUrl}/api/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        spaceId: input.spaceId,
        assetKindCode: toAccountAssetKindCode(account),
        ownerPersonId: account.ownerPersonId ? personIdMap.get(account.ownerPersonId) ?? null : null,
        primaryPersonId: account.primaryPersonId ? personIdMap.get(account.primaryPersonId) ?? null : null,
        providerId: null,
        name: account.name,
        alias: account.alias,
        groupType: toAssetGroupType(account.accountGroupType),
        usageType: toAssetUsageType(account.usageType),
        currencyCode: "KRW",
        shared: account.isShared,
        sortOrder: account.sortOrder ?? 0,
        hidden: account.isHidden ?? false,
        memo: account.memo,
        createdImportRecordKey: account.createdImportRecordId ?? null,
        participantPersonIds: (account.participantPersonIds ?? [])
          .map((personId) => personIdMap.get(personId))
          .filter((personId): personId is number => Boolean(personId)),
        accountDetail: {
          accountType: toAccountType(account.accountType),
          institutionName: account.institutionName || "직접입력",
          accountNumberMasked: account.accountNumberMasked || "-",
        },
      }),
    });

    accountIdMap.set(account.id, created.id);
  }

  const cardIdMap = new Map<string, number>();
  for (const card of sortByOrder(input.cards)) {
    const created = await requestJson<ServerAssetResponse>(`${apiBaseUrl}/api/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        spaceId: input.spaceId,
        assetKindCode: "card",
        ownerPersonId: card.ownerPersonId ? personIdMap.get(card.ownerPersonId) ?? null : null,
        primaryPersonId: card.ownerPersonId ? personIdMap.get(card.ownerPersonId) ?? null : null,
        providerId: null,
        name: card.name,
        alias: card.name,
        groupType: "PERSONAL",
        usageType: "CARD_PAYMENT",
        currencyCode: "KRW",
        shared: false,
        sortOrder: card.sortOrder ?? 0,
        hidden: card.isHidden ?? false,
        memo: card.memo,
        createdImportRecordKey: card.createdImportRecordId ?? null,
        participantPersonIds: [],
        cardDetail: {
          cardType: toCardType(card.cardType),
          issuerName: card.issuerName || "직접입력",
          cardNumberMasked: card.cardNumberMasked || "-",
          settlementAccountAssetId: card.linkedAccountId ? accountIdMap.get(card.linkedAccountId) ?? null : null,
        },
      }),
    });

    cardIdMap.set(card.id, created.id);
  }

  const scheme = await requestJson<ServerCategorySchemeResponse>(`${apiBaseUrl}/api/category/schemes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      spaceId: input.spaceId,
      code: createCategorySchemeCode(),
      name: "기본 분류",
      description: "로컬 소비일기 기초 데이터에서 이전한 카테고리 분류입니다.",
      directionScope: "MIXED",
      defaultScheme: true,
      active: true,
      sortOrder: 0,
    }),
  });

  const groupIdMap = new Map<string, number>();
  const groupCategories = sortByOrder(input.categories.filter((category) => category.categoryType === "group"));
  for (const group of groupCategories) {
    const created = await requestJson<ServerCategoryGroupResponse>(`${apiBaseUrl}/api/category/groups`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemeId: scheme.id,
        name: group.name,
        description: "",
        direction: toCategoryDirection(group.direction),
        fixedOrVariable: toCategoryCadence(group.fixedOrVariable),
        necessity: toCategoryNecessity(group.necessity),
        budgetable: group.budgetable,
        reportable: group.reportable,
        linkedAssetId: group.linkedAccountId ? accountIdMap.get(group.linkedAccountId) ?? null : null,
        sortOrder: group.sortOrder ?? 0,
        hidden: group.isHidden,
      }),
    });

    groupIdMap.set(group.id, created.id);
  }

  const categoryIdMap = new Map<string, number>();
  const leafCategories = sortByOrder(input.categories.filter((category) => category.categoryType === "category"));
  for (const category of leafCategories) {
    const groupId = category.parentCategoryId ? groupIdMap.get(category.parentCategoryId) ?? null : null;
    if (!groupId) {
      throw new Error(`카테고리 "${category.name}"의 상위 그룹을 찾지 못했습니다.`);
    }

    const created = await requestJson<ServerCategoryResponse>(`${apiBaseUrl}/api/category/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemeId: scheme.id,
        groupId,
        parentCategoryId: null,
        name: category.name,
        direction: toCategoryDirection(category.direction),
        fixedOrVariable: toCategoryCadence(category.fixedOrVariable),
        necessity: toCategoryNecessity(category.necessity),
        budgetable: category.budgetable,
        reportable: category.reportable,
        linkedAssetId: category.linkedAccountId ? accountIdMap.get(category.linkedAccountId) ?? null : null,
        linkedPersonAssets: Object.entries(category.linkedAccountIdsByPersonId ?? {}).map(([personId, accountId]) => ({
          personId: personIdMap.get(personId) ?? Number(personId),
          assetId: accountIdMap.get(accountId) ?? null,
        })).filter((item) => item.assetId !== null),
        sortOrder: category.sortOrder ?? 0,
        hidden: category.isHidden,
      }),
    });

    categoryIdMap.set(category.id, created.id);
  }

  return {
    peopleCount: personIdMap.size,
    accountCount: accountIdMap.size,
    cardCount: cardIdMap.size,
    categoryGroupCount: groupIdMap.size,
    categoryCount: categoryIdMap.size,
  };
}
