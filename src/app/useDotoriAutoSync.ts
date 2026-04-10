import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createEmptyBackupPreviewSummary, summarizeBackupPayload } from "../domain/app/backup";
import { loadLatestDotoriBackup, saveDotoriBackup, type DotoriBackupMetadata } from "./api/dotoriStorage";
import {
  createDotoriBackupFileName,
  DOTORI_BACKUP_FOLDER_NAME,
  isSameDotoriBackupVersion,
  writeDotoriSyncSession,
  type DotoriSyncSession,
} from "./dotoriSync";

type DotoriReachabilityState = "idle" | "online" | "offline";
type ToastTone = "info" | "error" | "success";

type UseDotoriAutoSyncOptions = {
  dotoriSession: DotoriSyncSession;
  setDotoriSession: Dispatch<SetStateAction<DotoriSyncSession>>;
  dotoriReachability: DotoriReachabilityState;
  dotoriRemoteBackupHint: DotoriBackupMetadata | null;
  dotoriRemoteSyncSignal: number;
  setDotoriRemoteBackupHint: Dispatch<SetStateAction<DotoriBackupMetadata | null>>;
  setDotoriRemoteSyncSignal: Dispatch<SetStateAction<number>>;
  isReady: boolean;
  importState: (file: File) => Promise<void>;
  localBackupCommitId: string | null;
  localBackupContent: string;
  setIsDotoriAutoSyncRunning: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, tone?: ToastTone) => void;
  debounceMs: number;
};

export function useDotoriAutoSync({
  debounceMs,
  dotoriReachability,
  dotoriRemoteBackupHint,
  dotoriRemoteSyncSignal,
  dotoriSession,
  importState,
  isReady,
  localBackupCommitId,
  localBackupContent,
  setDotoriRemoteBackupHint,
  setDotoriRemoteSyncSignal,
  setDotoriSession,
  setIsDotoriAutoSyncRunning,
  showToast,
}: UseDotoriAutoSyncOptions) {
  const dotoriAutoSyncTimeoutRef = useRef<number | null>(null);
  const dotoriAutoSyncErrorMessageRef = useRef<string | null>(null);
  const dotoriAutoImportRunningRef = useRef(false);
  const dotoriSessionRef = useRef(dotoriSession);
  const localBackupCommitIdRef = useRef<string | null>(null);

  useEffect(() => {
    dotoriSessionRef.current = dotoriSession;
  }, [dotoriSession]);

  useEffect(() => {
    localBackupCommitIdRef.current = localBackupCommitId ?? null;
  }, [localBackupCommitId]);

  useEffect(() => {
    if (!isReady || !dotoriSession.connected || !dotoriSession.autoSyncEnabled || dotoriReachability !== "online") {
      return;
    }

    let cancelled = false;

    const syncFromRemote = async () => {
      if (dotoriAutoImportRunningRef.current) return;

      try {
        const currentSession = dotoriSessionRef.current;
        if (!currentSession.connected || !currentSession.autoSyncEnabled) {
          return;
        }

        const latestRemoteBackup = await loadLatestDotoriBackup(currentSession.form, DOTORI_BACKUP_FOLDER_NAME);
        const remoteSummary =
          latestRemoteBackup.exists === false || !latestRemoteBackup.content
            ? createEmptyBackupPreviewSummary()
            : summarizeBackupPayload(latestRemoteBackup.content);
        const latestRemoteMetadata: DotoriBackupMetadata = {
          exists: latestRemoteBackup.exists,
          fileName: latestRemoteBackup.fileName,
          savedAt: latestRemoteBackup.savedAt ?? null,
          backupCommitId: remoteSummary.backupCommitId,
        };
        if (cancelled || latestRemoteMetadata.exists === false || !latestRemoteMetadata.fileName) {
          return;
        }

        if (isSameDotoriBackupVersion(currentSession.syncedBackup, latestRemoteMetadata)) {
          return;
        }

        const isLocalClean = isSameDotoriBackupVersion(currentSession.syncedBackup, {
          fileName: null,
          savedAt: null,
          backupCommitId: localBackupCommitIdRef.current,
        });

        if (!isLocalClean) {
          return;
        }

        dotoriAutoImportRunningRef.current = true;
        setIsDotoriAutoSyncRunning(true);

        if (cancelled || latestRemoteBackup.exists === false || !latestRemoteBackup.fileName || !latestRemoteBackup.content) {
          return;
        }

        const nextSyncedBackup: DotoriBackupMetadata = {
          exists: latestRemoteBackup.exists,
          fileName: latestRemoteBackup.fileName,
          savedAt: latestRemoteBackup.savedAt ?? null,
          backupCommitId: remoteSummary.backupCommitId,
        };

        await importState(
          new File([latestRemoteBackup.content], latestRemoteBackup.fileName, {
            type: "application/json",
          }),
        );

        const nextSession: DotoriSyncSession = {
          ...currentSession,
          latestFileName: latestRemoteBackup.fileName,
          syncedBackup: nextSyncedBackup,
        };
        setDotoriRemoteBackupHint(nextSyncedBackup);
        dotoriAutoSyncErrorMessageRef.current = null;
        writeDotoriSyncSession(nextSession);
        setDotoriSession(nextSession);
        showToast(`${latestRemoteBackup.fileName} 최신본을 자동으로 불러왔습니다.`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : "도토리창고 자동가져오기 중 오류가 발생했습니다.";
        if (dotoriAutoSyncErrorMessageRef.current !== message) {
          dotoriAutoSyncErrorMessageRef.current = message;
          showToast(message, "error");
        }
      } finally {
        dotoriAutoImportRunningRef.current = false;
        setIsDotoriAutoSyncRunning(false);
      }
    };

    void syncFromRemote();

    return () => {
      cancelled = true;
    };
  }, [
    dotoriReachability,
    dotoriRemoteBackupHint,
    dotoriRemoteSyncSignal,
    dotoriSession.autoSyncEnabled,
    dotoriSession.connected,
    importState,
    isReady,
    setDotoriRemoteBackupHint,
    setDotoriSession,
    setIsDotoriAutoSyncRunning,
    showToast,
  ]);

  useEffect(() => {
    if (!isReady || !dotoriSession.connected || !dotoriSession.autoSyncEnabled || dotoriReachability !== "online") {
      return;
    }
    setDotoriRemoteSyncSignal((current) => current + 1);
  }, [dotoriReachability, dotoriSession.autoSyncEnabled, dotoriSession.connected, isReady, setDotoriRemoteSyncSignal]);

  useEffect(() => {
    if (dotoriAutoSyncTimeoutRef.current) {
      window.clearTimeout(dotoriAutoSyncTimeoutRef.current);
      dotoriAutoSyncTimeoutRef.current = null;
    }

    if (dotoriAutoImportRunningRef.current) {
      setIsDotoriAutoSyncRunning(false);
      return;
    }

    if (!isReady || !dotoriSession.connected || !dotoriSession.autoSyncEnabled) {
      setIsDotoriAutoSyncRunning(false);
      return;
    }

    if (
      isSameDotoriBackupVersion(dotoriSession.syncedBackup, {
        fileName: null,
        savedAt: null,
        backupCommitId: localBackupCommitId,
      })
    ) {
      setIsDotoriAutoSyncRunning(false);
      return;
    }

    dotoriAutoSyncTimeoutRef.current = window.setTimeout(() => {
      void (async () => {
        setIsDotoriAutoSyncRunning(true);

        try {
          const latestRemoteBackup = await loadLatestDotoriBackup(dotoriSession.form, DOTORI_BACKUP_FOLDER_NAME);
          const remoteSummary =
            latestRemoteBackup.exists === false || !latestRemoteBackup.content
              ? createEmptyBackupPreviewSummary()
              : summarizeBackupPayload(latestRemoteBackup.content);
          const latestRemoteMetadata: DotoriBackupMetadata = {
            exists: latestRemoteBackup.exists,
            fileName: latestRemoteBackup.fileName,
            savedAt: latestRemoteBackup.savedAt ?? null,
            backupCommitId: remoteSummary.backupCommitId,
          };

          if (
            latestRemoteBackup.exists !== false &&
            latestRemoteBackup.fileName &&
            !isSameDotoriBackupVersion(dotoriSession.syncedBackup, latestRemoteMetadata)
          ) {
            const nextSession: DotoriSyncSession = {
              ...dotoriSession,
              autoSyncEnabled: false,
              latestFileName: latestRemoteMetadata.fileName,
              syncedBackup: latestRemoteMetadata,
            };
            writeDotoriSyncSession(nextSession);
            setDotoriSession(nextSession);
            setIsDotoriAutoSyncRunning(false);
            showToast("도토리창고 최신본이 바뀌어 자동동기화를 멈췄습니다. 먼저 가져오기를 진행해주세요.", "error");
            return;
          }

          const savedBackup = await saveDotoriBackup(dotoriSession.form, {
            folderName: DOTORI_BACKUP_FOLDER_NAME,
            fileName: createDotoriBackupFileName(),
            content: localBackupContent,
          });

          const nextSession: DotoriSyncSession = {
            ...dotoriSession,
            latestFileName: savedBackup.fileName,
            syncedBackup: {
              exists: true,
              fileName: savedBackup.fileName,
              savedAt: savedBackup.savedAt ?? null,
              backupCommitId: localBackupCommitId,
            },
          };
          setDotoriRemoteBackupHint(nextSession.syncedBackup);
          dotoriAutoSyncErrorMessageRef.current = null;
          writeDotoriSyncSession(nextSession);
          setDotoriSession(nextSession);
        } catch (error) {
          const message = error instanceof Error ? error.message : "도토리창고 자동동기화 중 오류가 발생했습니다.";
          if (dotoriAutoSyncErrorMessageRef.current !== message) {
            dotoriAutoSyncErrorMessageRef.current = message;
            showToast(message, "error");
          }
        } finally {
          setIsDotoriAutoSyncRunning(false);
        }
      })();
    }, debounceMs);

    return () => {
      if (dotoriAutoSyncTimeoutRef.current) {
        window.clearTimeout(dotoriAutoSyncTimeoutRef.current);
        dotoriAutoSyncTimeoutRef.current = null;
      }
    };
  }, [
    debounceMs,
    dotoriSession,
    isReady,
    localBackupCommitId,
    localBackupContent,
    setDotoriRemoteBackupHint,
    setDotoriSession,
    setIsDotoriAutoSyncRunning,
    showToast,
  ]);
}
