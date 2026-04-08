import type { WorkspaceBundle } from "../../shared/types/models";

type GuideActionBackupState = {
  stepId: string;
  workspaceBundle: WorkspaceBundle;
};

export type GuideActionBackupSnapshot = {
  workspaceId: string;
  state: GuideActionBackupState;
};

function getGuideActionBackupKey(workspaceId: string, stepId: string) {
  return `spending-diary.guide-action-backup.${workspaceId}.${stepId}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readGuideActionBackup(workspaceId: string, stepId: string): GuideActionBackupState | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getGuideActionBackupKey(workspaceId, stepId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuideActionBackupState>;
    if (!parsed.workspaceBundle || parsed.stepId !== stepId) return null;
    return {
      stepId,
      workspaceBundle: parsed.workspaceBundle,
    };
  } catch {
    return null;
  }
}

export function writeGuideActionBackup(workspaceId: string, stepId: string, nextState: GuideActionBackupState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(getGuideActionBackupKey(workspaceId, stepId), JSON.stringify(nextState));
}

export function listGuideActionBackupSnapshots(workspaceId: string): GuideActionBackupSnapshot[] {
  if (!canUseStorage()) return [];
  const prefix = `spending-diary.guide-action-backup.${workspaceId}.`;
  const snapshots: GuideActionBackupSnapshot[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(prefix)) continue;
    const stepId = key.slice(prefix.length);
    const state = readGuideActionBackup(workspaceId, stepId);
    if (!state) continue;
    snapshots.push({
      workspaceId,
      state,
    });
  }
  return snapshots;
}

export function restoreGuideActionBackupSnapshots(snapshots: GuideActionBackupSnapshot[]) {
  snapshots.forEach((snapshot) => {
    writeGuideActionBackup(snapshot.workspaceId, snapshot.state.stepId, snapshot.state);
  });
}

export function clearGuideActionBackup(workspaceId: string, stepId: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(getGuideActionBackupKey(workspaceId, stepId));
}
