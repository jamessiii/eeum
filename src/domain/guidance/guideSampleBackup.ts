import type { WorkspaceBundle } from "../../shared/types/models";

type GuideSampleBackupState = {
  workspaceBundle: WorkspaceBundle;
};

export type GuideSampleBackupSnapshot = {
  workspaceId: string;
  state: GuideSampleBackupState;
};

function getGuideSampleBackupKey(workspaceId: string) {
  return `spending-diary.guide-sample-backup.${workspaceId}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readGuideSampleBackup(workspaceId: string): GuideSampleBackupState | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getGuideSampleBackupKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuideSampleBackupState>;
    if (!parsed.workspaceBundle) return null;
    return {
      workspaceBundle: parsed.workspaceBundle,
    };
  } catch {
    return null;
  }
}

export function writeGuideSampleBackup(workspaceId: string, nextState: GuideSampleBackupState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(getGuideSampleBackupKey(workspaceId), JSON.stringify(nextState));
}

export function readGuideSampleBackupSnapshot(workspaceId: string): GuideSampleBackupSnapshot | null {
  const state = readGuideSampleBackup(workspaceId);
  if (!state) return null;
  return {
    workspaceId,
    state,
  };
}

export function restoreGuideSampleBackupSnapshot(snapshot: GuideSampleBackupSnapshot) {
  writeGuideSampleBackup(snapshot.workspaceId, snapshot.state);
}

export function clearGuideSampleBackup(workspaceId: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(getGuideSampleBackupKey(workspaceId));
}
