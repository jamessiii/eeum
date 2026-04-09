import type { DotoriBackupMetadata, DotoriConnectionForm } from "./api/dotoriStorage";

const DOTORI_SYNC_SESSION_KEY = "spending-diary.dotori-sync-session";
export const DOTORI_SYNC_SESSION_EVENT = "spending-diary:dotori-sync-session";
export const DOTORI_BACKUP_FOLDER_NAME = "소비일기 데이터베이스";

export type DotoriSyncSession = {
  form: DotoriConnectionForm;
  connected: boolean;
  autoSyncEnabled: boolean;
  latestFileName: string | null;
  syncedBackup: DotoriBackupMetadata | null;
};

export function createEmptyDotoriSyncSession(form?: DotoriConnectionForm): DotoriSyncSession {
  return {
    form: form ?? {
      host: "localhost",
      port: "3456",
      username: "",
      password: "",
      rememberCredentials: true,
    },
    connected: false,
    autoSyncEnabled: false,
    latestFileName: null,
    syncedBackup: null,
  };
}

function normalizeSession(parsed: Partial<DotoriSyncSession> | null): DotoriSyncSession {
  const fallback = createEmptyDotoriSyncSession();
  return {
    form: {
      host: String(parsed?.form?.host || fallback.form.host),
      port: String(parsed?.form?.port || fallback.form.port),
      username: String(parsed?.form?.username || ""),
      password: String(parsed?.form?.password || ""),
      rememberCredentials: parsed?.form?.rememberCredentials !== false,
    },
    connected: parsed?.connected === true,
    autoSyncEnabled: parsed?.autoSyncEnabled === true,
    latestFileName: parsed?.latestFileName ?? null,
    syncedBackup: parsed?.syncedBackup
      ? {
          exists: parsed.syncedBackup.exists,
          fileName: parsed.syncedBackup.fileName ?? null,
          savedAt: parsed.syncedBackup.savedAt ?? null,
          backupCommitId: parsed.syncedBackup.backupCommitId ?? null,
        }
      : null,
  };
}

export function readDotoriSyncSession() {
  if (typeof window === "undefined") {
    return createEmptyDotoriSyncSession();
  }

  try {
    const raw = window.localStorage.getItem(DOTORI_SYNC_SESSION_KEY);
    if (!raw) return createEmptyDotoriSyncSession();
    return normalizeSession(JSON.parse(raw) as Partial<DotoriSyncSession>);
  } catch {
    return createEmptyDotoriSyncSession();
  }
}

export function writeDotoriSyncSession(session: DotoriSyncSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DOTORI_SYNC_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(DOTORI_SYNC_SESSION_EVENT, { detail: session }));
}

export function clearDotoriSyncSession(form?: DotoriConnectionForm) {
  writeDotoriSyncSession(createEmptyDotoriSyncSession(form));
}

export function createDotoriBackupFileName(date = new Date()) {
  return `${date.getFullYear()}년${date.getMonth() + 1}월${date.getDate()}일의기록.json`;
}

export function isSameDotoriBackupVersion(left: DotoriBackupMetadata | null, right: DotoriBackupMetadata | null) {
  if (!left || !right) return false;
  if (left.backupCommitId && right.backupCommitId) {
    return left.backupCommitId === right.backupCommitId;
  }
  return left.fileName === right.fileName && (left.savedAt ?? null) === (right.savedAt ?? null);
}
