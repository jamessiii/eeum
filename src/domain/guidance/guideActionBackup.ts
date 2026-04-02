import type { WorkspaceBundle } from "../../shared/types/models";

type GuideActionBackupState = {
  stepId: string;
  workspaceBundle: WorkspaceBundle;
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

export function clearGuideActionBackup(workspaceId: string, stepId: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(getGuideActionBackupKey(workspaceId, stepId));
}
