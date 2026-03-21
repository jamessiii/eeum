import type { AppState, Category, FinancialProfile, Tag, Workspace, WorkspaceBundle } from "../../shared/types/models";
import { nowIso } from "../../shared/utils/date";
import { createId } from "../../shared/utils/id";

export function createEmptyState(): AppState {
  return {
    schemaVersion: 4,
    activeWorkspaceId: null,
    workspaces: [],
    financialProfiles: [],
    people: [],
    accounts: [],
    cards: [],
    categories: [],
    tags: [],
    transactions: [],
    reviews: [],
    imports: [],
    settlements: [],
  };
}

export function createWorkspaceBase(name: string, source: Workspace["source"]): Workspace {
  const now = nowIso();
  return {
    id: createId("workspace"),
    name,
    source,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFinancialProfileBase(workspaceId: string): FinancialProfile {
  return {
    id: createId("financial_profile"),
    workspaceId,
    monthlyNetIncome: 5_500_000,
    targetSavingsRate: 0.2,
    warningSpendRate: 0.8,
    warningFixedCostRate: 0.55,
  };
}

export function createStarterCategories(workspaceId: string): Category[] {
  const groups = [
    { name: "주거/고정비", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "대출/부채", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "생활비", fixedOrVariable: "variable", necessity: "essential" },
    { name: "식비", fixedOrVariable: "variable", necessity: "essential" },
    { name: "교통/차량", fixedOrVariable: "variable", necessity: "essential" },
    { name: "의료/건강", fixedOrVariable: "variable", necessity: "essential" },
    { name: "가족/관계", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "세금/공과", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "기부금", fixedOrVariable: "variable", necessity: "discretionary" },
  ] as const;

  const groupRecords = groups.map((group, index) => ({
    id: createId("category"),
    workspaceId,
    name: group.name,
    categoryType: "group" as const,
    parentCategoryId: null,
    sortOrder: index,
    isHidden: false,
    direction: "expense" as const,
    fixedOrVariable: group.fixedOrVariable,
    necessity: group.necessity,
    budgetable: true,
    reportable: true,
  }));

  const groupIdByName = new Map(groupRecords.map((group) => [group.name, group.id]));
  const items = [
    { name: "관리비", parentName: "주거/고정비", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "통신비", parentName: "주거/고정비", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "구독료", parentName: "주거/고정비", fixedOrVariable: "fixed", necessity: "discretionary" },
    { name: "보험료", parentName: "주거/고정비", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "주택담보대출", parentName: "대출/부채", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "담보대출", parentName: "대출/부채", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "신용대출", parentName: "대출/부채", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "학자금 대출", parentName: "대출/부채", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "생필품", parentName: "생활비", fixedOrVariable: "variable", necessity: "essential" },
    { name: "개인 지출", parentName: "생활비", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "추가 지출", parentName: "생활비", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "의류", parentName: "생활비", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "회사 식대", parentName: "식비", fixedOrVariable: "variable", necessity: "essential" },
    { name: "식비", parentName: "식비", fixedOrVariable: "variable", necessity: "essential" },
    { name: "교통비", parentName: "교통/차량", fixedOrVariable: "variable", necessity: "essential" },
    { name: "주유비", parentName: "교통/차량", fixedOrVariable: "variable", necessity: "essential" },
    { name: "통행료/하이패스", parentName: "교통/차량", fixedOrVariable: "variable", necessity: "essential" },
    { name: "자동차 리스", parentName: "교통/차량", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "의료비", parentName: "의료/건강", fixedOrVariable: "variable", necessity: "essential" },
    { name: "가족 활동", parentName: "가족/관계", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "데이트/여행", parentName: "가족/관계", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "경조사", parentName: "가족/관계", fixedOrVariable: "variable", necessity: "essential" },
    { name: "개인지출", parentName: "가족/관계", fixedOrVariable: "variable", necessity: "discretionary" },
    { name: "공과금", parentName: "세금/공과", fixedOrVariable: "fixed", necessity: "essential" },
    { name: "기부금", parentName: "기부금", fixedOrVariable: "variable", necessity: "discretionary" },
  ] as const;

  return [
    ...groupRecords,
    ...items.map((item, index) => ({
      id: createId("category"),
      workspaceId,
      name: item.name,
      categoryType: "category" as const,
      parentCategoryId: groupIdByName.get(item.parentName) ?? null,
      sortOrder: index,
      isHidden: false,
      direction: "expense" as const,
      fixedOrVariable: item.fixedOrVariable,
      necessity: item.necessity,
      budgetable: true,
      reportable: true,
    })),
  ];
}

export function createStarterTags(workspaceId: string): Tag[] {
  return [
    { id: createId("tag"), workspaceId, name: "테스트데이터", color: "#0d6efd" },
    { id: createId("tag"), workspaceId, name: "생활비", color: "#198754" },
    { id: createId("tag"), workspaceId, name: "여행", color: "#fd7e14" },
  ];
}

export function mergeWorkspaceBundle(state: AppState, bundle: WorkspaceBundle): AppState {
  const existingWorkspaceIndex = state.workspaces.findIndex((workspace) => workspace.id === bundle.workspace.id);
  const workspaces =
    existingWorkspaceIndex >= 0
      ? state.workspaces.map((workspace) => (workspace.id === bundle.workspace.id ? bundle.workspace : workspace))
      : [...state.workspaces, bundle.workspace];

  const financialProfiles = state.financialProfiles.some((profile) => profile.workspaceId === bundle.workspace.id)
    ? state.financialProfiles.map((profile) =>
        profile.workspaceId === bundle.workspace.id ? bundle.financialProfile : profile,
      )
    : [...state.financialProfiles, bundle.financialProfile];

  return {
    ...state,
    activeWorkspaceId: bundle.workspace.id,
    workspaces,
    financialProfiles,
    people: [...state.people, ...bundle.people],
    accounts: [...state.accounts, ...bundle.accounts],
    cards: [...state.cards, ...bundle.cards],
    categories: [...state.categories, ...bundle.categories],
    tags: [...state.tags, ...bundle.tags],
    transactions: [...state.transactions, ...bundle.transactions],
    reviews: [...state.reviews, ...bundle.reviews],
    imports: [...state.imports, ...bundle.imports],
    settlements: [...state.settlements, ...bundle.settlements],
  };
}
