import type { ImportRecord, ReviewItem } from "../../shared/types/models";
import { getOpenReviewCount } from "./health";

export function getLatestImportRecord(imports: ImportRecord[]) {
  return [...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0] ?? null;
}

export function getWorkspaceHeaderSummary(input: {
  imports: ImportRecord[];
  reviews: ReviewItem[];
  transactionsCount: number;
  peopleCount: number;
}) {
  return {
    latestImport: getLatestImportRecord(input.imports),
    openReviewCount: getOpenReviewCount(input.reviews),
    transactionsCount: input.transactionsCount,
    peopleCount: input.peopleCount,
  };
}
