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

type BackupWorkspaceSummary = {
  workspaceId: string;
  workspaceName: string;
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
};

type BackupGuideData = {
  runtimes: GuideRuntimeSnapshot[];
  sampleStates: GuideSampleStateSnapshot[];
  sampleBackups: GuideSampleBackupSnapshot[];
  actionBackups: GuideActionBackupSnapshot[];
};

export type AppBackupPayload = {
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

export function createBackupPayload(state: AppState): AppBackupPayload {
  const workspaceSummaries = state.workspaces.map((workspace) => ({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    counts: getWorkspaceCounts(state, workspace.id),
  }));

  return {
    appVersion: BACKUP_APP_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: state.schemaVersion,
    exportedAt: new Date().toISOString(),
    metadata: {
      activeWorkspaceId: state.activeWorkspaceId,
      workspaceCount: state.workspaces.length,
      summaries: workspaceSummaries,
    },
    guideData: {
      runtimes: state.workspaces.map((workspace) => readGuideRuntimeSnapshot(workspace.id)),
      sampleStates: state.workspaces.map((workspace) => readGuideSampleStateSnapshot(workspace.id)),
      sampleBackups: state.workspaces
        .map((workspace) => readGuideSampleBackupSnapshot(workspace.id))
        .filter((snapshot): snapshot is GuideSampleBackupSnapshot => snapshot !== null),
      actionBackups: state.workspaces.flatMap((workspace) => listGuideActionBackupSnapshots(workspace.id)),
    },
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
