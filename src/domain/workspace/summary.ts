import type { ImportRecord, ReviewItem, Transaction } from "../../shared/types/models";
import type { WorkspaceScope } from "../../app/state/selectors";
import { getActiveTransactions } from "../transactions/meta";
import { getOpenReviewCount } from "./health";

export function getSortedImportRecords(imports: ImportRecord[]) {
  return [...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export function getLatestImportRecord(imports: ImportRecord[]) {
  return getSortedImportRecords(imports)[0] ?? null;
}

export function getWorkspaceHeaderSummary(input: {
  imports: ImportRecord[];
  reviews: ReviewItem[];
  transactions: Transaction[];
  peopleCount: number;
}) {
  return {
    latestImport: getLatestImportRecord(input.imports),
    openReviewCount: getOpenReviewCount(input.reviews),
    transactionsCount: getActiveTransactions(input.transactions).length,
    peopleCount: input.peopleCount,
  };
}

export function getWorkspaceEntitySummary(scope: WorkspaceScope | null, workspaceCount: number) {
  return {
    workspaces: workspaceCount,
    people: scope?.people.length ?? 0,
    accounts: scope?.accounts.length ?? 0,
    cards: scope?.cards.length ?? 0,
    categories: scope?.categories.length ?? 0,
    tags: scope?.tags.length ?? 0,
    transactions: scope ? getActiveTransactions(scope.transactions).length : 0,
    reviews: scope ? getOpenReviewCount(scope.reviews) : 0,
  };
}
