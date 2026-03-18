import type {
  AppState,
  Category,
  FinancialProfile,
  Tag,
  Workspace,
  WorkspaceBundle,
} from "../../shared/types/models";
import { nowIso } from "../../shared/utils/date";
import { createId } from "../../shared/utils/id";

export function createEmptyState(): AppState {
  return {
    schemaVersion: 2,
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
  const items: Array<
    Pick<Category, "name" | "direction" | "fixedOrVariable" | "necessity" | "budgetable" | "reportable">
  > = [
    { name: "식비", direction: "expense", fixedOrVariable: "variable", necessity: "essential", budgetable: true, reportable: true },
    { name: "생필품", direction: "expense", fixedOrVariable: "variable", necessity: "essential", budgetable: true, reportable: true },
    { name: "교통비", direction: "expense", fixedOrVariable: "variable", necessity: "essential", budgetable: true, reportable: true },
    { name: "주거비", direction: "expense", fixedOrVariable: "fixed", necessity: "essential", budgetable: true, reportable: true },
    { name: "보험료", direction: "expense", fixedOrVariable: "fixed", necessity: "essential", budgetable: true, reportable: true },
    { name: "통신비", direction: "expense", fixedOrVariable: "fixed", necessity: "essential", budgetable: true, reportable: true },
    { name: "가족활동", direction: "expense", fixedOrVariable: "variable", necessity: "discretionary", budgetable: true, reportable: true },
    { name: "개인지출", direction: "expense", fixedOrVariable: "variable", necessity: "discretionary", budgetable: true, reportable: true },
    { name: "데이트/여행", direction: "expense", fixedOrVariable: "variable", necessity: "discretionary", budgetable: true, reportable: true },
    { name: "대출상환", direction: "expense", fixedOrVariable: "fixed", necessity: "essential", budgetable: true, reportable: true },
    { name: "저축", direction: "income", fixedOrVariable: "fixed", necessity: "essential", budgetable: false, reportable: true },
    { name: "기타", direction: "mixed", fixedOrVariable: "variable", necessity: "discretionary", budgetable: true, reportable: true },
  ];

  return items.map((item) => ({
    id: createId("category"),
    workspaceId,
    ...item,
  }));
}

export function createStarterTags(workspaceId: string): Tag[] {
  return [
    { id: createId("tag"), workspaceId, name: "테스트데이터", color: "#0d6efd" },
    { id: createId("tag"), workspaceId, name: "생활비", color: "#198754" },
    { id: createId("tag"), workspaceId, name: "여행", color: "#fd7e14" },
  ];
}

export function mergeWorkspaceBundle(state: AppState, bundle: WorkspaceBundle): AppState {
  return {
    ...state,
    activeWorkspaceId: bundle.workspace.id,
    workspaces: [...state.workspaces, bundle.workspace],
    financialProfiles: [...state.financialProfiles, bundle.financialProfile],
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
