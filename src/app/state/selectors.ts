import type { AppState } from "../../shared/types/models";

export function getActiveWorkspace(state: AppState) {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0] ?? null;
}

export function getWorkspaceScope(state: AppState, workspaceId: string) {
  return {
    people: state.people.filter((item) => item.workspaceId === workspaceId),
    accounts: state.accounts.filter((item) => item.workspaceId === workspaceId),
    cards: state.cards.filter((item) => item.workspaceId === workspaceId),
    categories: state.categories.filter((item) => item.workspaceId === workspaceId),
    tags: state.tags.filter((item) => item.workspaceId === workspaceId),
    transactions: state.transactions.filter((item) => item.workspaceId === workspaceId),
    reviews: state.reviews.filter((item) => item.workspaceId === workspaceId),
    imports: state.imports.filter((item) => item.workspaceId === workspaceId),
    financialProfile: state.financialProfiles.find((item) => item.workspaceId === workspaceId) ?? null,
  };
}
