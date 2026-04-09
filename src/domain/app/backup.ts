import type { AppState, WorkspaceBundle } from "../../shared/types/models";
import {
  listGuideActionBackupSnapshots,
  restoreGuideActionBackupSnapshots,
  type GuideActionBackupSnapshot,
} from "../guidance/guideActionBackup";
import { readGuideRuntimeSnapshot, restoreGuideRuntimeSnapshot, type GuideRuntimeSnapshot } from "../guidance/guideRuntime";
import {
  readGuideSampleBackupSnapshot,
  restoreGuideSampleBackupSnapshot,
  type GuideSampleBackupSnapshot,
} from "../guidance/guideSampleBackup";
import {
  readGuideSampleStateSnapshot,
  restoreGuideSampleStateSnapshot,
  type GuideSampleStateSnapshot,
} from "../guidance/guideSampleState";

const BACKUP_APP_VERSION = "0.1.0";
const BACKUP_FORMAT_VERSION = 2;
const WORKSPACE_DATA_FORMAT_VERSION = 1;

export type WorkspaceDataPackageKind = "transactions" | "foundation";

export type BackupWorkspaceSummary = {
  workspaceId: string;
  workspaceName: string;
  categoryGroupCount: number;
  counts: {
    people: number;
    accounts: number;
    cards: number;
    categories: number;
    transactions: number;
    reviews: number;
    imports: number;
    settlements: number;
    incomeEntries: number;
  };
  importSummaries: BackupImportSummary[];
  peopleNames: string[];
  accountNames: string[];
  cardNames: string[];
  categoryGroupNames: string[];
  categoryNames: string[];
};

export type BackupImportSummary = {
  importRecordId: string;
  fileName: string;
  importedAt: string | null;
  rowCount: number;
  pendingReviewCount: number;
  uncategorizedCount: number;
};

export type BackupPreviewSummary = {
  backupCommitId: string | null;
  exportedAt: string | null;
  workspaceCount: number;
  activeWorkspaceName: string | null;
  totals: BackupWorkspaceSummary["counts"];
  summaries: BackupWorkspaceSummary[];
};

export type BackupCountDiff = {
  current: number;
  incoming: number;
  delta: number;
};

export type BackupDetailDiff = {
  added: string[];
  removed: string[];
};

export type BackupComparisonSummary = {
  transactions: BackupCountDiff;
  imports: BackupCountDiff;
  people: BackupCountDiff;
  accounts: BackupCountDiff;
  cards: BackupCountDiff;
  categories: BackupCountDiff;
  categoryGroups: BackupCountDiff;
  details: {
    imports: BackupDetailDiff;
    people: BackupDetailDiff;
    accounts: BackupDetailDiff;
    cards: BackupDetailDiff;
    categoryGroups: BackupDetailDiff;
    categories: BackupDetailDiff;
  };
};

type BackupGuideData = {
  runtimes: GuideRuntimeSnapshot[];
  sampleStates: GuideSampleStateSnapshot[];
  sampleBackups: GuideSampleBackupSnapshot[];
  actionBackups: GuideActionBackupSnapshot[];
};

export type AppBackupPayload = {
  backupCommitId: string;
  appVersion: string;
  backupFormatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  metadata: {
    activeWorkspaceId: string | null;
    workspaceCount: number;
    summaries: BackupWorkspaceSummary[];
  };
  guideData: BackupGuideData;
  data: AppState;
};

function hashBackupCommitSource(input: string) {
  let hashA = 2166136261;
  let hashB = 16777619;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 16777619);
    hashB = Math.imul(hashB ^ code, 1099511627);
  }

  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`;
}

export type WorkspaceDataPackagePayload = {
  appVersion: string;
  workspaceDataFormatVersion: number;
  packageKind: WorkspaceDataPackageKind;
  exportedAt: string;
  metadata: {
    workspaceId: string;
    workspaceName: string;
    counts: BackupWorkspaceSummary["counts"];
  };
  data: {
    financialProfile: WorkspaceBundle["financialProfile"] | null;
    people: WorkspaceBundle["people"];
    accounts: WorkspaceBundle["accounts"];
    cards: WorkspaceBundle["cards"];
    categories: WorkspaceBundle["categories"];
    tags: WorkspaceBundle["tags"];
    transactions: WorkspaceBundle["transactions"];
    reviews: WorkspaceBundle["reviews"];
    imports: WorkspaceBundle["imports"];
  };
};

function getWorkspaceCounts(state: AppState, workspaceId: string): BackupWorkspaceSummary["counts"] {
  return {
    people: state.people.filter((item) => item.workspaceId === workspaceId).length,
    accounts: state.accounts.filter((item) => item.workspaceId === workspaceId).length,
    cards: state.cards.filter((item) => item.workspaceId === workspaceId).length,
    categories: state.categories.filter((item) => item.workspaceId === workspaceId).length,
    transactions: state.transactions.filter((item) => item.workspaceId === workspaceId).length,
    reviews: state.reviews.filter((item) => item.workspaceId === workspaceId).length,
    imports: state.imports.filter((item) => item.workspaceId === workspaceId).length,
    settlements: state.settlements.filter((item) => item.workspaceId === workspaceId).length,
    incomeEntries: state.incomeEntries.filter((item) => item.workspaceId === workspaceId).length,
  };
}

function getCategoryGroupCount(state: AppState, workspaceId: string) {
  return state.categories.filter((item) => item.workspaceId === workspaceId && item.categoryType === "group").length;
}

function getWorkspacePeopleNames(state: AppState, workspaceId: string) {
  return state.people
    .filter((item) => item.workspaceId === workspaceId)
    .map((item) => item.displayName || item.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function getPersonDisplayName(state: AppState, workspaceId: string, personId: string | null | undefined) {
  if (!personId) return null;
  const person = state.people.find((item) => item.workspaceId === workspaceId && item.id === personId);
  if (!person) return null;
  return person.displayName || person.name || null;
}

function getWorkspaceAccountNames(state: AppState, workspaceId: string) {
  return state.accounts
    .filter((item) => item.workspaceId === workspaceId)
    .map((item) => {
      const ownerName =
        getPersonDisplayName(state, workspaceId, item.ownerPersonId) ??
        getPersonDisplayName(state, workspaceId, item.primaryPersonId) ??
        null;
      const accountLabel = item.institutionName || item.alias || item.name;
      return ownerName ? `${ownerName} > ${accountLabel}` : accountLabel;
    })
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function getWorkspaceCardNames(state: AppState, workspaceId: string) {
  return state.cards
    .filter((item) => item.workspaceId === workspaceId)
    .map((item) => {
      const ownerName = getPersonDisplayName(state, workspaceId, item.ownerPersonId);
      const cardLabel = item.issuerName || item.name;
      return ownerName ? `${ownerName} > ${cardLabel}` : cardLabel;
    })
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function getWorkspaceCategoryGroupNames(state: AppState, workspaceId: string) {
  return state.categories
    .filter((item) => item.workspaceId === workspaceId && item.categoryType === "group")
    .map((item) => item.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function getWorkspaceCategoryNames(state: AppState, workspaceId: string) {
  return state.categories
    .filter((item) => item.workspaceId === workspaceId && item.categoryType === "category")
    .map((item) => item.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function getImportSummaries(state: AppState, workspaceId: string): BackupImportSummary[] {
  return state.imports
    .filter((item) => item.workspaceId === workspaceId)
    .sort((left, right) => Date.parse(right.importedAt) - Date.parse(left.importedAt))
    .map((item) => ({
      importRecordId: item.id,
      fileName: item.fileName,
      importedAt: item.importedAt ?? null,
      rowCount: item.rowCount ?? 0,
      pendingReviewCount: state.reviews.filter(
        (review) => review.workspaceId === workspaceId && review.importRecordId === item.id && review.status === "open",
      ).length,
      uncategorizedCount: state.transactions.filter(
        (transaction) =>
          transaction.workspaceId === workspaceId &&
          transaction.importRecordId === item.id &&
          transaction.transactionType === "expense" &&
          transaction.categoryId === null &&
          transaction.status === "active",
      ).length,
    }));
}

export function createBackupPayload(state: AppState): AppBackupPayload {
  const workspaceSummaries = state.workspaces.map((workspace) => ({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    categoryGroupCount: getCategoryGroupCount(state, workspace.id),
    counts: getWorkspaceCounts(state, workspace.id),
    importSummaries: getImportSummaries(state, workspace.id),
    peopleNames: getWorkspacePeopleNames(state, workspace.id),
    accountNames: getWorkspaceAccountNames(state, workspace.id),
    cardNames: getWorkspaceCardNames(state, workspace.id),
    categoryGroupNames: getWorkspaceCategoryGroupNames(state, workspace.id),
    categoryNames: getWorkspaceCategoryNames(state, workspace.id),
  }));

  const guideData = {
    runtimes: state.workspaces.map((workspace) => readGuideRuntimeSnapshot(workspace.id)),
    sampleStates: state.workspaces.map((workspace) => readGuideSampleStateSnapshot(workspace.id)),
    sampleBackups: state.workspaces
      .map((workspace) => readGuideSampleBackupSnapshot(workspace.id))
      .filter((snapshot): snapshot is GuideSampleBackupSnapshot => snapshot !== null),
    actionBackups: state.workspaces.flatMap((workspace) => listGuideActionBackupSnapshots(workspace.id)),
  };

  const backupCommitId = `bkp_${hashBackupCommitSource(
    JSON.stringify({
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: state.schemaVersion,
      activeWorkspaceId: state.activeWorkspaceId,
      summaries: workspaceSummaries,
      guideData,
      data: state,
    }),
  )}`;

  return {
    backupCommitId,
    appVersion: BACKUP_APP_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: state.schemaVersion,
    exportedAt: new Date().toISOString(),
    metadata: {
      activeWorkspaceId: state.activeWorkspaceId,
      workspaceCount: state.workspaces.length,
      summaries: workspaceSummaries,
    },
    guideData,
    data: state,
  };
}

export function createBackupContent(state: AppState) {
  return JSON.stringify(createBackupPayload(state), null, 2);
}

export function createWorkspaceDataPackageContent(
  state: AppState,
  workspaceId: string,
  packageKind: WorkspaceDataPackageKind,
) {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    throw new Error("workspace-not-found");
  }

  const foundationData = {
    financialProfile: state.financialProfiles.find((item) => item.workspaceId === workspaceId) ?? null,
    people: state.people.filter((item) => item.workspaceId === workspaceId),
    accounts: state.accounts.filter((item) => item.workspaceId === workspaceId),
    cards: state.cards.filter((item) => item.workspaceId === workspaceId),
    categories: state.categories.filter((item) => item.workspaceId === workspaceId),
    tags: state.tags.filter((item) => item.workspaceId === workspaceId),
  };
  const transactionData = {
    transactions: state.transactions.filter((item) => item.workspaceId === workspaceId),
    reviews: state.reviews.filter((item) => item.workspaceId === workspaceId),
    imports: state.imports.filter((item) => item.workspaceId === workspaceId),
  };

  const payload: WorkspaceDataPackagePayload = {
    appVersion: BACKUP_APP_VERSION,
    workspaceDataFormatVersion: WORKSPACE_DATA_FORMAT_VERSION,
    packageKind,
    exportedAt: new Date().toISOString(),
    metadata: {
      workspaceId,
      workspaceName: workspace.name,
      counts: getWorkspaceCounts(state, workspaceId),
    },
    data: {
      financialProfile: packageKind === "foundation" ? foundationData.financialProfile : null,
      people: packageKind === "foundation" ? foundationData.people : [],
      accounts: packageKind === "foundation" ? foundationData.accounts : [],
      cards: packageKind === "foundation" ? foundationData.cards : [],
      categories: packageKind === "foundation" ? foundationData.categories : [],
      tags: packageKind === "foundation" ? foundationData.tags : [],
      transactions: packageKind === "transactions" ? transactionData.transactions : [],
      reviews: packageKind === "transactions" ? transactionData.reviews : [],
      imports: packageKind === "transactions" ? transactionData.imports : [],
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function parseBackupPayload(text: string): { data: AppState; guideData: BackupGuideData | null } {
  const parsed = JSON.parse(text) as Partial<AppBackupPayload> & { data?: AppState };
  if (!parsed.data) {
    throw new Error("backup-data-missing");
  }
  return {
    data: parsed.data,
    guideData: parsed.guideData ?? null,
  };
}

export function summarizeBackupPayload(text: string): BackupPreviewSummary {
  const parsed = JSON.parse(text) as Partial<AppBackupPayload> & { data?: AppState };
  if (!parsed.data) {
    throw new Error("backup-data-missing");
  }

  const data = parsed.data;
  const summaries =
    parsed.metadata?.summaries?.length
      ? parsed.metadata.summaries.map((summary) => ({
          workspaceId: summary.workspaceId ?? "",
          workspaceName: summary.workspaceName ?? "이름 없는 워크스페이스",
          categoryGroupCount: summary.categoryGroupCount ?? getCategoryGroupCount(data, summary.workspaceId ?? ""),
          counts: summary.counts ?? getWorkspaceCounts(data, summary.workspaceId ?? ""),
          importSummaries: getImportSummaries(data, summary.workspaceId ?? ""),
          peopleNames: summary.peopleNames ?? getWorkspacePeopleNames(data, summary.workspaceId ?? ""),
          accountNames: summary.accountNames ?? getWorkspaceAccountNames(data, summary.workspaceId ?? ""),
          cardNames: summary.cardNames ?? getWorkspaceCardNames(data, summary.workspaceId ?? ""),
          categoryGroupNames: summary.categoryGroupNames ?? getWorkspaceCategoryGroupNames(data, summary.workspaceId ?? ""),
          categoryNames: summary.categoryNames ?? getWorkspaceCategoryNames(data, summary.workspaceId ?? ""),
        }))
      : data.workspaces.map((workspace) => ({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          categoryGroupCount: getCategoryGroupCount(data, workspace.id),
          counts: getWorkspaceCounts(data, workspace.id),
          importSummaries: getImportSummaries(data, workspace.id),
          peopleNames: getWorkspacePeopleNames(data, workspace.id),
          accountNames: getWorkspaceAccountNames(data, workspace.id),
          cardNames: getWorkspaceCardNames(data, workspace.id),
          categoryGroupNames: getWorkspaceCategoryGroupNames(data, workspace.id),
          categoryNames: getWorkspaceCategoryNames(data, workspace.id),
        }));

  const totals = summaries.reduce<BackupWorkspaceSummary["counts"]>(
    (accumulator, summary) => ({
      people: accumulator.people + summary.counts.people,
      accounts: accumulator.accounts + summary.counts.accounts,
      cards: accumulator.cards + summary.counts.cards,
      categories: accumulator.categories + summary.counts.categories,
      transactions: accumulator.transactions + summary.counts.transactions,
      reviews: accumulator.reviews + summary.counts.reviews,
      imports: accumulator.imports + summary.counts.imports,
      settlements: accumulator.settlements + summary.counts.settlements,
      incomeEntries: accumulator.incomeEntries + summary.counts.incomeEntries,
    }),
    {
      people: 0,
      accounts: 0,
      cards: 0,
      categories: 0,
      transactions: 0,
      reviews: 0,
      imports: 0,
      settlements: 0,
      incomeEntries: 0,
    },
  );

  const activeWorkspaceName = summaries.find((summary) => summary.workspaceId === (parsed.metadata?.activeWorkspaceId ?? data.activeWorkspaceId))
    ?.workspaceName ?? null;

  return {
    backupCommitId: parsed.backupCommitId ?? null,
    exportedAt: parsed.exportedAt ?? null,
    workspaceCount: parsed.metadata?.workspaceCount ?? summaries.length,
    activeWorkspaceName,
    totals,
    summaries,
  };
}

export function createEmptyBackupPreviewSummary(): BackupPreviewSummary {
  return {
    backupCommitId: null,
    exportedAt: null,
    workspaceCount: 0,
    activeWorkspaceName: null,
    totals: {
      people: 0,
      accounts: 0,
      cards: 0,
      categories: 0,
      transactions: 0,
      reviews: 0,
      imports: 0,
      settlements: 0,
      incomeEntries: 0,
    },
    summaries: [],
  };
}

function createCountDiff(current: number, incoming: number): BackupCountDiff {
  return {
    current,
    incoming,
    delta: incoming - current,
  };
}

function buildDetailDiff(currentItems: string[], incomingItems: string[]): BackupDetailDiff {
  const currentSet = new Set(currentItems);
  const incomingSet = new Set(incomingItems);

  return {
    added: incomingItems.filter((item) => !currentSet.has(item)),
    removed: currentItems.filter((item) => !incomingSet.has(item)),
  };
}

function collectWorkspaceScopedNames(
  summaries: BackupWorkspaceSummary[],
  selector: (summary: BackupWorkspaceSummary) => string[],
) {
  return summaries
    .flatMap((summary) => selector(summary))
    .sort((left, right) => left.localeCompare(right, "ko"));
}

function collectImportNames(summaries: BackupWorkspaceSummary[]) {
  return summaries
    .flatMap((summary) => summary.importSummaries.map((item) => item.fileName))
    .sort((left, right) => left.localeCompare(right, "ko"));
}

export function compareBackupSummaries(current: BackupPreviewSummary, incoming: BackupPreviewSummary): BackupComparisonSummary {
  const currentCategoryGroups = current.summaries.reduce((sum, summary) => sum + summary.categoryGroupCount, 0);
  const incomingCategoryGroups = incoming.summaries.reduce((sum, summary) => sum + summary.categoryGroupCount, 0);

  return {
    transactions: createCountDiff(current.totals.transactions, incoming.totals.transactions),
    imports: createCountDiff(current.totals.imports, incoming.totals.imports),
    people: createCountDiff(current.totals.people, incoming.totals.people),
    accounts: createCountDiff(current.totals.accounts, incoming.totals.accounts),
    cards: createCountDiff(current.totals.cards, incoming.totals.cards),
    categories: createCountDiff(current.totals.categories, incoming.totals.categories),
    categoryGroups: createCountDiff(currentCategoryGroups, incomingCategoryGroups),
    details: {
      imports: buildDetailDiff(collectImportNames(current.summaries), collectImportNames(incoming.summaries)),
      people: buildDetailDiff(
        collectWorkspaceScopedNames(current.summaries, (summary) => summary.peopleNames),
        collectWorkspaceScopedNames(incoming.summaries, (summary) => summary.peopleNames),
      ),
      accounts: buildDetailDiff(
        collectWorkspaceScopedNames(current.summaries, (summary) => summary.accountNames),
        collectWorkspaceScopedNames(incoming.summaries, (summary) => summary.accountNames),
      ),
      cards: buildDetailDiff(
        collectWorkspaceScopedNames(current.summaries, (summary) => summary.cardNames),
        collectWorkspaceScopedNames(incoming.summaries, (summary) => summary.cardNames),
      ),
      categoryGroups: buildDetailDiff(
        collectWorkspaceScopedNames(current.summaries, (summary) => summary.categoryGroupNames),
        collectWorkspaceScopedNames(incoming.summaries, (summary) => summary.categoryGroupNames),
      ),
      categories: buildDetailDiff(
        collectWorkspaceScopedNames(current.summaries, (summary) => summary.categoryNames),
        collectWorkspaceScopedNames(incoming.summaries, (summary) => summary.categoryNames),
      ),
    },
  };
}

export function parseWorkspaceDataPackage(text: string): WorkspaceDataPackagePayload {
  const parsed = JSON.parse(text) as Partial<WorkspaceDataPackagePayload>;
  if (parsed.packageKind !== "transactions" && parsed.packageKind !== "foundation") {
    throw new Error("workspace-package-kind-missing");
  }
  if (!parsed.metadata?.workspaceName || !parsed.data) {
    throw new Error("workspace-package-data-missing");
  }
  return {
    appVersion: parsed.appVersion ?? BACKUP_APP_VERSION,
    workspaceDataFormatVersion: parsed.workspaceDataFormatVersion ?? 1,
    packageKind: parsed.packageKind,
    exportedAt: parsed.exportedAt ?? new Date(0).toISOString(),
    metadata: {
      workspaceId: parsed.metadata.workspaceId ?? "",
      workspaceName: parsed.metadata.workspaceName,
      counts: parsed.metadata.counts ?? {
        people: 0,
        accounts: 0,
        cards: 0,
        categories: 0,
        transactions: 0,
        reviews: 0,
        imports: 0,
        settlements: 0,
        incomeEntries: 0,
      },
    },
    data: {
      financialProfile: parsed.data.financialProfile ?? null,
      people: parsed.data.people ?? [],
      accounts: parsed.data.accounts ?? [],
      cards: parsed.data.cards ?? [],
      categories: parsed.data.categories ?? [],
      tags: parsed.data.tags ?? [],
      transactions: parsed.data.transactions ?? [],
      reviews: parsed.data.reviews ?? [],
      imports: parsed.data.imports ?? [],
    },
  };
}

export function restoreBackupGuideData(guideData: BackupGuideData | null) {
  if (!guideData) return;
  guideData.runtimes.forEach((snapshot) => restoreGuideRuntimeSnapshot(snapshot));
  guideData.sampleStates.forEach((snapshot) => restoreGuideSampleStateSnapshot(snapshot));
  guideData.sampleBackups.forEach((snapshot) => restoreGuideSampleBackupSnapshot(snapshot));
  restoreGuideActionBackupSnapshots(guideData.actionBackups);
}
