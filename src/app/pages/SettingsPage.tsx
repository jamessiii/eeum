import { useEffect, useRef, useState } from "react";
import {
  compareBackupSummaries,
  createEmptyBackupPreviewSummary,
  createBackupContent,
  summarizeBackupPayload,
  type BackupComparisonSummary,
  type BackupPreviewSummary,
} from "../../domain/app/backup";
import { formatPercent } from "../../shared/utils/format";
import {
  healthCheckDotoriStorage,
  loadLatestDotoriBackup,
  saveDotoriBackup,
  type DotoriBackupMetadata,
  type DotoriConnectionForm,
} from "../api/dotoriStorage";
import { AppModal } from "../components/AppModal";
import {
  clearDotoriSyncSession,
  createDotoriBackupFileName,
  DOTORI_BACKUP_FOLDER_NAME,
  isSameDotoriBackupVersion,
  readDotoriSyncSession,
  writeDotoriSyncSession,
} from "../dotoriSync";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";
import { useToast } from "../toast/ToastProvider";

type ProfileDraftState = {
  targetSavingsRate: string;
  warningSpendRate: string;
  warningFixedCostRate: string;
};

type EditableProfileField = keyof ProfileDraftState;

const ASSET_BASE = import.meta.env.BASE_URL;
const DOTORI_LOGIN_STORAGE_KEY = "spending-diary.dotori-login";

function createProfileDraft(profile: ReturnType<typeof getWorkspaceScope>["financialProfile"]): ProfileDraftState {
  return {
    targetSavingsRate: String(Math.round((profile?.targetSavingsRate ?? 0) * 100)),
    warningSpendRate: String(Math.round((profile?.warningSpendRate ?? 0) * 100)),
    warningFixedCostRate: String(Math.round((profile?.warningFixedCostRate ?? 0) * 100)),
  };
}

function createDotoriConnectionForm(): DotoriConnectionForm {
  return {
    host: "localhost",
    port: "3456",
    username: "",
    password: "",
    rememberCredentials: true,
  };
}

function hasNumericValue(value: string) {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

function formatDraftPercent(value: string) {
  if (!hasNumericValue(value)) return "입력 필요";
  return formatPercent(Number(value) / 100);
}

function readSavedDotoriLogin() {
  try {
    const raw = window.localStorage.getItem(DOTORI_LOGIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<DotoriConnectionForm>;
  } catch {
    return null;
  }
}

function isJsonBackupFile(file: File) {
  return file.name.toLowerCase().endsWith(".json");
}

function formatDiffValue(delta: number) {
  if (delta === 0) return "(-)";
  return `(${Math.abs(delta).toLocaleString()} ${delta > 0 ? "↑" : "↓"})`;
}

export function SettingsPage() {
  const { exportState, importState, exportWorkspaceDataPackage, importWorkspaceDataPackage, setFinancialProfile, state } =
    useAppState();
  const { showToast } = useToast();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const profile = scope.financialProfile;
  const [profileDraft, setProfileDraft] = useState<ProfileDraftState>(() => createProfileDraft(profile));
  const [activeProfileField, setActiveProfileField] = useState<EditableProfileField | null>(null);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [isDotoriModalOpen, setIsDotoriModalOpen] = useState(false);
  const [dotoriForm, setDotoriForm] = useState<DotoriConnectionForm>(createDotoriConnectionForm);
  const [dotoriAction, setDotoriAction] = useState<"connect" | "save" | "update" | null>(null);
  const [isDotoriConnected, setIsDotoriConnected] = useState(false);
  const [dotoriStatusMessage, setDotoriStatusMessage] = useState("도토리창고 연결을 확인해주세요.");
  const [dotoriLatestFileName, setDotoriLatestFileName] = useState<string | null>(null);
  const [dotoriSyncedBackup, setDotoriSyncedBackup] = useState<DotoriBackupMetadata | null>(null);
  const [isDotoriAutoSyncEnabled, setIsDotoriAutoSyncEnabled] = useState(false);
  const [dotoriImportPreview, setDotoriImportPreview] = useState<{
    file: File;
    fileName: string;
    savedAt: string | null;
    summary: BackupPreviewSummary;
    comparison: BackupComparisonSummary;
  } | null>(null);
  const [dotoriSavePreview, setDotoriSavePreview] = useState<{
    fileName: string;
    content: string;
    summary: BackupPreviewSummary;
    comparison: BackupComparisonSummary;
    isFirstBackup: boolean;
    remoteFileName: string | null;
  } | null>(null);
  const [isDotoriImportDetailOpen, setIsDotoriImportDetailOpen] = useState(false);
  const [isDotoriSaveDetailOpen, setIsDotoriSaveDetailOpen] = useState(false);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const transactionPackageImportInputRef = useRef<HTMLInputElement | null>(null);
  const foundationPackageImportInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setProfileDraft(createProfileDraft(profile));
    setActiveProfileField(null);
  }, [workspaceId, profile?.targetSavingsRate, profile?.warningSpendRate, profile?.warningFixedCostRate]);

  useEffect(() => {
    const savedSession = readDotoriSyncSession();
    if (savedSession.connected) {
      setDotoriForm(savedSession.form);
      setIsDotoriConnected(true);
      setDotoriLatestFileName(savedSession.latestFileName);
      setDotoriSyncedBackup(savedSession.syncedBackup);
      setIsDotoriAutoSyncEnabled(savedSession.autoSyncEnabled);
      setDotoriStatusMessage(
        savedSession.latestFileName
          ? `${savedSession.latestFileName} 기준으로 도토리창고와 연결되어 있습니다.`
          : "도토리창고와 연결되었습니다.",
      );
      return;
    }

    const savedLogin = readSavedDotoriLogin();
    if (!savedLogin) return;
    setDotoriForm((current) => ({
      ...current,
      host: String(savedLogin.host || current.host),
      port: String(savedLogin.port || current.port),
      username: String(savedLogin.username || ""),
      password: String(savedLogin.password || ""),
      rememberCredentials: savedLogin.rememberCredentials !== false,
    }));
  }, []);

  const persistProfileDraft = (nextDraft: ProfileDraftState) => {
    setFinancialProfile(workspaceId, {
      monthlyNetIncome: profile?.monthlyNetIncome ?? 0,
      targetSavingsRate: Number(nextDraft.targetSavingsRate || 0) / 100,
      warningSpendRate: Number(nextDraft.warningSpendRate || 0) / 100,
      warningFixedCostRate: Number(nextDraft.warningFixedCostRate || 0) / 100,
      loopPriorityCategoryIds: profile?.loopPriorityCategoryIds ?? [],
    });
  };

  const updateProfileDraft = (field: EditableProfileField, value: string) => {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  };

  const updateDotoriForm = (field: keyof DotoriConnectionForm, value: string | boolean) => {
    setDotoriForm((current) => {
      const nextForm = { ...current, [field]: value as never };
      if (field === "host" || field === "port" || field === "username" || field === "password") {
        if (isDotoriConnected || dotoriSyncedBackup || dotoriLatestFileName || isDotoriAutoSyncEnabled) {
          setIsDotoriConnected(false);
          setIsDotoriAutoSyncEnabled(false);
          setDotoriSyncedBackup(null);
          setDotoriStatusMessage("도토리창고 연결 정보를 바꿔 연결을 다시 확인해주세요.");
          setDotoriLatestFileName(null);
          setDotoriImportPreview(null);
          setDotoriSavePreview(null);
          setIsDotoriImportDetailOpen(false);
          setIsDotoriSaveDetailOpen(false);
          clearDotoriSyncSession(nextForm);
        }
      }
      return nextForm;
    });
  };

  const persistDotoriCredentials = () => {
    if (!dotoriForm.rememberCredentials) {
      window.localStorage.removeItem(DOTORI_LOGIN_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      DOTORI_LOGIN_STORAGE_KEY,
      JSON.stringify({
        host: dotoriForm.host.trim(),
        port: dotoriForm.port.trim(),
        username: dotoriForm.username.trim(),
        password: dotoriForm.password,
        rememberCredentials: true,
      }),
    );
  };

  const persistDotoriSession = (
    overrides: Partial<{
      form: DotoriConnectionForm;
      connected: boolean;
      autoSyncEnabled: boolean;
      latestFileName: string | null;
      syncedBackup: DotoriBackupMetadata | null;
    }> = {},
  ) => {
    writeDotoriSyncSession({
      form: overrides.form ?? dotoriForm,
      connected: overrides.connected ?? isDotoriConnected,
      autoSyncEnabled: overrides.autoSyncEnabled ?? isDotoriAutoSyncEnabled,
      latestFileName: overrides.latestFileName ?? dotoriLatestFileName,
      syncedBackup: overrides.syncedBackup ?? dotoriSyncedBackup,
    });
  };

  const commitProfileDraft = () => {
    persistProfileDraft(profileDraft);
    setActiveProfileField(null);
  };

  const resetProfileField = (field: EditableProfileField) => {
    const initialDraft = createProfileDraft(profile);
    setProfileDraft((current) => ({ ...current, [field]: initialDraft[field] }));
    setActiveProfileField(null);
  };

  const profileCards: Array<{
    key: EditableProfileField;
    title: string;
    preview: string;
    placeholder: string;
  }> = [
    {
      key: "targetSavingsRate",
      title: "목표 저축률",
      preview: formatDraftPercent(profileDraft.targetSavingsRate),
      placeholder: "20",
    },
    {
      key: "warningSpendRate",
      title: "지출 경고 기준",
      preview: formatDraftPercent(profileDraft.warningSpendRate),
      placeholder: "80",
    },
    {
      key: "warningFixedCostRate",
      title: "고정지출 경고 기준",
      preview: formatDraftPercent(profileDraft.warningFixedCostRate),
      placeholder: "55",
    },
  ];

  const isDotoriFormComplete =
    dotoriForm.host.trim() !== "" &&
    dotoriForm.port.trim() !== "" &&
    dotoriForm.username.trim() !== "" &&
    dotoriForm.password.trim() !== "";
  const dotoriStatusLabel = isDotoriConnected ? "연결됨" : "미연결";

  const withDotoriAction = async (action: "connect" | "save" | "update", execute: () => Promise<void>) => {
    if (!isDotoriFormComplete) {
      showToast("호스트, 포트, 아이디, 비밀번호를 모두 입력해주세요.", "error");
      return;
    }

    setDotoriAction(action);

    try {
      persistDotoriCredentials();
      await execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : "도토리창고 요청 중 오류가 발생했습니다.";
      if (action === "connect") {
        setIsDotoriConnected(false);
      }
      setDotoriStatusMessage(message);
      showToast(message, "error");
    } finally {
      setDotoriAction(null);
    }
  };

  const handleDotoriConnect = () =>
    withDotoriAction("connect", async () => {
      await healthCheckDotoriStorage(dotoriForm);
      setIsDotoriConnected(true);
      setDotoriStatusMessage("도토리창고와 연결되었습니다.");
      persistDotoriSession({
        connected: true,
        autoSyncEnabled: isDotoriAutoSyncEnabled,
      });
      showToast("도토리창고 로그인 확인이 완료되었습니다.", "success");
    });

  const handleDotoriSave = () =>
    withDotoriAction("save", async () => {
      const fileName = createDotoriBackupFileName();
      const latestRemoteBackup = await loadLatestDotoriBackup(dotoriForm, DOTORI_BACKUP_FOLDER_NAME);
      const content = createBackupContent(state);
      const localSummary = summarizeBackupPayload(content);
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
      if (latestRemoteBackup.exists !== false && latestRemoteBackup.fileName && !isSameDotoriBackupVersion(dotoriSyncedBackup, latestRemoteMetadata)) {
        throw new Error("도토리창고에 로컬보다 최신 백업이 있습니다. 먼저 가져오기를 실행해주세요.");
      }
      setDotoriSavePreview({
        fileName,
        content,
        summary: localSummary,
        comparison: compareBackupSummaries(remoteSummary, localSummary),
        isFirstBackup: latestRemoteBackup.exists === false || !latestRemoteBackup.fileName,
        remoteFileName: latestRemoteBackup.fileName ?? null,
      });
      setIsDotoriSaveDetailOpen(false);
      setIsDotoriConnected(true);
      setDotoriStatusMessage(
        latestRemoteBackup.exists === false || !latestRemoteBackup.fileName
          ? "첫 백업으로 저장하기 전에 요약을 확인해주세요."
          : `${fileName} 파일로 저장하기 전에 변경 내용을 확인해주세요.`,
      );
    });

  const handleConfirmDotoriSave = () =>
    withDotoriAction("save", async () => {
      if (!dotoriSavePreview) return;
      const savedBackup = await saveDotoriBackup(dotoriForm, {
        folderName: DOTORI_BACKUP_FOLDER_NAME,
        fileName: dotoriSavePreview.fileName,
        content: dotoriSavePreview.content,
      });
      setIsDotoriConnected(true);
      setDotoriLatestFileName(savedBackup.fileName);
      setDotoriSyncedBackup({
        ...savedBackup,
        backupCommitId: dotoriSavePreview.summary.backupCommitId,
      });
      setDotoriStatusMessage(`${savedBackup.fileName} 파일을 저장했습니다.`);
      persistDotoriSession({
        connected: true,
        latestFileName: savedBackup.fileName,
        syncedBackup: {
          ...savedBackup,
          backupCommitId: dotoriSavePreview.summary.backupCommitId,
        },
      });
      showToast(`${savedBackup.fileName} 파일을 도토리창고에 저장했습니다.`, "success");
      setDotoriSavePreview(null);
      setIsDotoriSaveDetailOpen(false);
    });

  const handleDotoriUpdate = () =>
    withDotoriAction("update", async () => {
      const latestBackup = await loadLatestDotoriBackup(dotoriForm, DOTORI_BACKUP_FOLDER_NAME);
      if (latestBackup.exists === false || !latestBackup.fileName || !latestBackup.content) {
        const message = "아직 저장된 백업이 없습니다. 먼저 내보내기를 진행해 주세요.";
        setIsDotoriConnected(true);
        setDotoriStatusMessage(message);
        showToast(message, "info");
        return;
      }
      const backupFile = new File([latestBackup.content], latestBackup.fileName, {
        type: "application/json",
      });
      const incomingSummary = summarizeBackupPayload(latestBackup.content);
      const currentSummary = summarizeBackupPayload(createBackupContent(state));
      setIsDotoriConnected(true);
      setDotoriImportPreview({
        file: backupFile,
        fileName: latestBackup.fileName,
        savedAt: latestBackup.savedAt ?? null,
        summary: incomingSummary,
        comparison: compareBackupSummaries(currentSummary, incomingSummary),
      });
      setIsDotoriImportDetailOpen(false);
      setDotoriStatusMessage(`${latestBackup.fileName} 파일의 요약을 확인한 뒤 불러오기를 진행해주세요.`);
    });

  const handleConfirmDotoriImport = () =>
    withDotoriAction("update", async () => {
      if (!dotoriImportPreview) return;
      await importState(dotoriImportPreview.file);
      setIsDotoriConnected(true);
      setDotoriLatestFileName(dotoriImportPreview.fileName);
      setDotoriSyncedBackup({
        fileName: dotoriImportPreview.fileName,
        savedAt: dotoriImportPreview.savedAt,
        backupCommitId: dotoriImportPreview.summary.backupCommitId,
      });
      setDotoriStatusMessage(`${dotoriImportPreview.fileName} 파일을 최신본으로 불러왔습니다.`);
      persistDotoriSession({
        connected: true,
        latestFileName: dotoriImportPreview.fileName,
        syncedBackup: {
          fileName: dotoriImportPreview.fileName,
          savedAt: dotoriImportPreview.savedAt,
          backupCommitId: dotoriImportPreview.summary.backupCommitId,
        },
      });
      showToast(`${dotoriImportPreview.fileName} 최신 백업을 불러왔습니다.`, "success");
      setDotoriImportPreview(null);
      setIsDotoriImportDetailOpen(false);
    });

  const handleDotoriAutoSyncToggle = (checked: boolean) => {
    setIsDotoriAutoSyncEnabled(checked);
    setDotoriStatusMessage(
      checked
        ? "자동동기화가 켜졌습니다. 입력, 수정, 삭제가 생기면 도토리창고에 자동으로 반영됩니다."
        : "자동동기화가 꺼졌습니다. 필요할 때 내보내기와 가져오기를 직접 실행해주세요.",
    );
    persistDotoriSession({
      connected: isDotoriConnected,
      autoSyncEnabled: checked,
    });
    showToast(checked ? "도토리창고 자동동기화를 시작했습니다." : "도토리창고 자동동기화를 중지했습니다.", checked ? "success" : "info");
  };

  const handleDotoriDisconnect = () => {
    setIsDotoriConnected(false);
    setIsDotoriAutoSyncEnabled(false);
    setDotoriSyncedBackup(null);
    setDotoriStatusMessage("도토리창고 접속을 종료했습니다.");
    setDotoriImportPreview(null);
    setDotoriSavePreview(null);
    setIsDotoriImportDetailOpen(false);
    setIsDotoriSaveDetailOpen(false);
    clearDotoriSyncSession(dotoriForm);
    showToast("도토리창고 연결을 종료했습니다.", "info");
  };

  return (
    <div className="page-stack">
      <section className="settings-shell-card page-section" data-guide-target="settings-page-overview">
        <div className="settings-shell-header">
          <div>
            <span className="section-kicker">설정</span>
            <h2 className="section-title settings-shell-title">설정</h2>
          </div>
        </div>
        <div className="settings-shell-body">
          <section className="settings-section-block">
            <div className="settings-summary-row" data-guide-target="settings-profile-summary">
              {profileCards.map((card) => (
                <article key={card.key} className="resource-card settings-profile-card">
                  <h3>{card.title}</h3>
                  {activeProfileField === card.key ? (
                    <div className="settings-profile-display-row is-editing">
                      <label className="settings-profile-input is-inline-edit">
                        <span className="visually-hidden">{card.title}</span>
                        <input
                          autoFocus
                          name={card.key}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          className="form-control"
                          value={profileDraft[card.key]}
                          placeholder={card.placeholder}
                          onChange={(event) => updateProfileDraft(card.key, event.target.value)}
                          onBlur={commitProfileDraft}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitProfileDraft();
                            }

                            if (event.key === "Escape") {
                              event.preventDefault();
                              resetProfileField(card.key);
                            }
                          }}
                        />
                        <span className="settings-profile-input-suffix">%</span>
                      </label>
                      <button
                        type="button"
                        className="board-case-edit-button settings-profile-edit-button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={commitProfileDraft}
                        aria-label={`${card.title} 저장`}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="settings-profile-display-row">
                      <p className="settings-profile-value-static">{card.preview}</p>
                      <button
                        type="button"
                        className="board-case-edit-button settings-profile-edit-button"
                        onClick={() => setActiveProfileField(card.key)}
                        aria-label={`${card.title} 수정`}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <article className="resource-card settings-panel-card settings-panel-card--actions settings-panel-card--backup" data-guide-target="settings-backup">
              <div className="settings-panel-copy">
                <span className="section-kicker">백업</span>
                <h3 className="mb-1">데이터 내보내기와 가져오기</h3>
                <p className="mb-0 text-secondary">현재 가계부 데이터를 JSON 파일로 저장하거나 다시 불러옵니다.</p>
              </div>
              <div className="settings-backup-groups">
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">전체 백업</span>
                    <p className="settings-backup-group-description">모든 데이터를 한 번에 저장하거나 다시 불러옵니다.</p>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                <button className="btn btn-primary" onClick={() => setIsExportConfirmOpen(true)}>
                  내보내기
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => backupImportInputRef.current?.click()}
                >
                  가져오기
                </button>
                <input
                  ref={backupImportInputRef}
                  hidden
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (!isJsonBackupFile(file)) {
                        window.alert("JSON 백업 파일만 가져올 수 있어요.");
                        event.currentTarget.value = "";
                        return;
                      }
                      void importState(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">거래 데이터</span>
                    <p className="settings-backup-group-description">명세서 업로드 기록과 카테고리화된 소비이력을 따로 옮깁니다.</p>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => exportWorkspaceDataPackage(workspaceId, "transactions")}
                >
                  내보내기
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => transactionPackageImportInputRef.current?.click()}
                >
                  가져오기
                </button>
                <input
                  ref={transactionPackageImportInputRef}
                  hidden
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (!isJsonBackupFile(file)) {
                        window.alert("JSON 파일만 가져올 수 있어요.");
                        event.currentTarget.value = "";
                        return;
                      }
                      void importWorkspaceDataPackage(workspaceId, file, "transactions");
                    }
                    event.currentTarget.value = "";
                  }}
                />
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">자산·분류 설정</span>
                    <p className="settings-backup-group-description">사용자, 계좌, 카드, 카테고리 같은 기본 설정만 따로 관리합니다.</p>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => exportWorkspaceDataPackage(workspaceId, "foundation")}
                >
                  내보내기
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => foundationPackageImportInputRef.current?.click()}
                >
                  가져오기
                </button>
                <input
                  ref={foundationPackageImportInputRef}
                  hidden
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (!isJsonBackupFile(file)) {
                        window.alert("JSON 파일만 가져올 수 있어요.");
                        event.currentTarget.value = "";
                        return;
                      }
                      void importWorkspaceDataPackage(workspaceId, file, "foundation");
                    }
                    event.currentTarget.value = "";
                  }}
                />
                  </div>
                </section>
              </div>
            </article>

            <article className="resource-card settings-panel-card settings-panel-card--actions">
              <div className="settings-panel-copy">
                <span className="section-kicker">외부 연동</span>
                <div className="settings-panel-heading">
                  <h3 className="mb-1">도토리창고</h3>
                  <span className={`settings-status-badge${isDotoriConnected ? " is-connected" : ""}`}>{dotoriStatusLabel}</span>
                </div>
                <p className="mb-0 text-secondary">도토리창고 로그인 화면을 그대로 불러와서 연결, 저장, 최신 불러오기를 실행합니다.</p>
                {dotoriLatestFileName ? <p className="settings-sync-meta">최근 처리 파일: {dotoriLatestFileName}</p> : null}
              </div>
              <div className="settings-panel-actions">
                <button type="button" className="btn btn-outline-primary" onClick={() => setIsDotoriModalOpen(true)}>
                  도토리창고 연동하기
                </button>
              </div>
            </article>

          </section>
        </div>
      </section>

      <AppModal
        open={isExportConfirmOpen}
        title="내보내기"
        description="전체 데이터를 백업 파일로 내보내시겠어요?"
        onClose={() => setIsExportConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIsExportConfirmOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                exportState();
                setIsExportConfirmOpen(false);
              }}
            >
              내보내기
            </button>
          </>
        }
      >
        <p className="mb-0 text-secondary">현재 워크스페이스 데이터가 JSON 백업 파일로 저장됩니다.</p>
      </AppModal>

      <AppModal
        open={isDotoriModalOpen}
        title="도토리창고 연결"
        onClose={() => setIsDotoriModalOpen(false)}
        dialogClassName="settings-dotori-modal settings-dotori-modal--auth"
      >
        <div className="dotori-login-shell">
          <div className="dotori-login-window">
            <div className="dotori-login-art">
              <div className="dotori-login-brand-lockup">
                <img className="dotori-login-brand-image" src={`${ASSET_BASE}dotori-login-brand.png`} alt="도토리창고" />
                <p className="dotori-login-brand-copy">
                  상자 속 도토리처럼
                  <br />
                  소중한 파일을 차곡차곡 담아두고,
                  <br />
                  필요할 때 바로 꺼내 쓰세요.
                </p>
              </div>
              <div className="dotori-login-hero-logo-wrap" aria-hidden="true">
                <img className="dotori-login-hero-logo" src={`${ASSET_BASE}dotori-logo2.png`} alt="" />
              </div>
            </div>

            <div className="dotori-login-panel">
              <div className="dotori-login-header">
                <div className="dotori-login-server-icon">
                  <img src={`${ASSET_BASE}dotori-logo1.png`} alt="" />
                </div>
                <div className="dotori-login-header-copy">
                  <p className="dotori-login-eyebrow">DOTORI STORAGE</p>
                  <h3>도토리창고 연결</h3>
                </div>
              </div>

              {isDotoriConnected ? (
                <div className="dotori-connected-panel">
                  <div className="dotori-sync-status-card">
                    <div className="settings-panel-heading">
                      <strong>연결 상태</strong>
                      <span className={`settings-status-badge${isDotoriConnected ? " is-connected" : ""}`}>{dotoriStatusLabel}</span>
                    </div>
                    <p className="mb-0 text-secondary">{dotoriStatusMessage}</p>
                    <div className="dotori-connected-meta">
                      <span>
                        {dotoriForm.host}:{dotoriForm.port}
                      </span>
                      <span>{dotoriForm.username}</span>
                    </div>
                    {dotoriLatestFileName ? <p className="mb-0 text-secondary">최근 처리 파일: {dotoriLatestFileName}</p> : null}
                  </div>

                  <label className="transaction-filter-toggle dotori-auto-sync-toggle">
                    <span className="transaction-filter-toggle-label">
                      자동동기화
                      <small>{isDotoriAutoSyncEnabled ? "입력, 수정, 삭제 시 자동 저장" : "수동 내보내기/가져오기 유지"}</small>
                    </span>
                    <input
                      className="transaction-filter-toggle-input"
                      type="checkbox"
                      checked={isDotoriAutoSyncEnabled}
                      onChange={(event) => handleDotoriAutoSyncToggle(event.target.checked)}
                      disabled={dotoriAction !== null || !isDotoriConnected}
                    />
                    <span className="transaction-filter-toggle-switch" aria-hidden="true" />
                  </label>

                  <div className="dotori-connected-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleDotoriSave()}
                      disabled={dotoriAction !== null || !isDotoriFormComplete}
                    >
                      {dotoriAction === "save" ? "내보내는 중..." : "내보내기"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => void handleDotoriUpdate()}
                      disabled={dotoriAction !== null || !isDotoriFormComplete}
                    >
                      {dotoriAction === "update" ? "가져오는 중..." : "가져오기"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={handleDotoriDisconnect}
                      disabled={dotoriAction !== null}
                    >
                      접속종료
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  className="dotori-login-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleDotoriConnect();
                  }}
                >
                  <div className="dotori-form-grid">
                    <label className="dotori-field">
                      <span>호스트</span>
                      <input
                        type="text"
                        autoComplete="off"
                        value={dotoriForm.host}
                        onChange={(event) => updateDotoriForm("host", event.target.value)}
                      />
                    </label>
                    <label className="dotori-field dotori-field--small">
                      <span>포트</span>
                      <input
                        type="text"
                        autoComplete="off"
                        value={dotoriForm.port}
                        onChange={(event) => updateDotoriForm("port", event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="dotori-field">
                    <span>아이디</span>
                    <input
                      type="text"
                      autoComplete="username"
                      value={dotoriForm.username}
                      onChange={(event) => updateDotoriForm("username", event.target.value)}
                    />
                  </label>

                  <label className="dotori-field">
                    <span>비밀번호</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={dotoriForm.password}
                      onChange={(event) => updateDotoriForm("password", event.target.value)}
                    />
                  </label>

                  <label className="dotori-checkbox-row">
                    <input
                      type="checkbox"
                      checked={dotoriForm.rememberCredentials}
                      onChange={(event) => updateDotoriForm("rememberCredentials", event.target.checked)}
                    />
                    <span>로그인 정보 저장</span>
                  </label>

                  <p className={`dotori-login-error${dotoriStatusMessage ? "" : " hidden"}`}>{dotoriStatusMessage}</p>

                  <button
                    className="dotori-login-submit"
                    type="submit"
                    disabled={dotoriAction !== null || !isDotoriFormComplete}
                  >
                    {dotoriAction === "connect" ? "연결 중..." : "연결하기"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={dotoriSavePreview !== null}
        title="내보낼 데이터 요약"
        description="도토리창고 최신 백업과 비교해 지금 저장하면 어떤 점이 바뀌는지 먼저 확인합니다."
        onClose={() => {
          if (dotoriAction !== null) return;
          setDotoriSavePreview(null);
          setIsDotoriSaveDetailOpen(false);
        }}
        dialogClassName="settings-dotori-preview-modal"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setDotoriSavePreview(null);
                setIsDotoriSaveDetailOpen(false);
              }}
              disabled={dotoriAction !== null}
            >
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleConfirmDotoriSave()} disabled={dotoriAction !== null}>
              {dotoriAction === "save" ? "저장하는 중..." : "이대로 저장하기"}
            </button>
          </>
        }
      >
        {dotoriSavePreview ? (
          <div className="dotori-import-preview">
            <div className="dotori-import-preview-card">
              <div className="dotori-import-preview-heading">
                <strong>{dotoriSavePreview.fileName}</strong>
                <span>
                  {dotoriSavePreview.isFirstBackup
                    ? "도토리창고 첫 백업으로 저장됩니다."
                    : `${dotoriSavePreview.remoteFileName ?? "기존 백업"} 기준으로 덮어써집니다.`}
                </span>
              </div>
              <div className="dotori-import-preview-grid">
                <div>
                  <span>거래</span>
                  <strong>
                    {dotoriSavePreview.summary.totals.transactions.toLocaleString()}건{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.transactions.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.transactions.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriSavePreview.comparison.transactions.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>명세서</span>
                  <strong>
                    {dotoriSavePreview.summary.totals.imports.toLocaleString()}건{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.imports.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.imports.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriSavePreview.comparison.imports.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>카테고리</span>
                  <strong>
                    그룹 {dotoriSavePreview.summary.summaries.reduce((sum, workspace) => sum + workspace.categoryGroupCount, 0).toLocaleString()}개 / 전체{" "}
                    {dotoriSavePreview.summary.totals.categories.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.categories.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.categories.delta < 0 ? " is-negative" : ""}`}>
                      전체 {formatDiffValue(dotoriSavePreview.comparison.categories.delta)}
                    </em>
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.categoryGroups.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.categoryGroups.delta < 0 ? " is-negative" : ""}`}>
                      그룹 {formatDiffValue(dotoriSavePreview.comparison.categoryGroups.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>사용자</span>
                  <strong>
                    {dotoriSavePreview.summary.totals.people.toLocaleString()}명{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.people.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.people.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriSavePreview.comparison.people.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>계좌</span>
                  <strong>
                    {dotoriSavePreview.summary.totals.accounts.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.accounts.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.accounts.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriSavePreview.comparison.accounts.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>카드</span>
                  <strong>
                    {dotoriSavePreview.summary.totals.cards.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriSavePreview.comparison.cards.delta > 0 ? " is-positive" : dotoriSavePreview.comparison.cards.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriSavePreview.comparison.cards.delta)}
                    </em>
                  </strong>
                </div>
              </div>
            </div>

            <div className="dotori-import-preview-card">
              <p className="dotori-import-preview-section-title">명세서 요약</p>
              <div className="dotori-import-preview-list">
                {dotoriSavePreview.summary.summaries.flatMap((workspace) =>
                  workspace.importSummaries.map((importSummary) => (
                    <div key={importSummary.importRecordId} className="dotori-import-preview-list-item">
                      <div className="dotori-import-preview-list-head">
                        <strong>{importSummary.fileName}</strong>
                        <span>{workspace.workspaceName}</span>
                      </div>
                      <div className="dotori-import-preview-chips">
                        <span>행 수 {importSummary.rowCount.toLocaleString()}건</span>
                        <span>남은 검토 {importSummary.pendingReviewCount.toLocaleString()}건</span>
                        <span>미분류 {importSummary.uncategorizedCount.toLocaleString()}건</span>
                      </div>
                    </div>
                  )),
                )}
                {dotoriSavePreview.summary.summaries.every((workspace) => workspace.importSummaries.length === 0) ? (
                  <div className="dotori-import-preview-empty">저장된 명세서 목록이 없습니다.</div>
                ) : null}
              </div>
            </div>

            <div className="dotori-import-preview-card">
              <div className="dotori-import-preview-detail-header">
                <p className="dotori-import-preview-section-title">변경 상세</p>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setIsDotoriSaveDetailOpen((current) => !current)}
                >
                  {isDotoriSaveDetailOpen ? "상세 닫기" : "상세보기"}
                </button>
              </div>

              {isDotoriSaveDetailOpen ? (
                <div className="dotori-import-preview-detail-grid">
                  {([
                    ["명세서", dotoriSavePreview.comparison.details.imports],
                    ["사용자", dotoriSavePreview.comparison.details.people],
                    ["계좌", dotoriSavePreview.comparison.details.accounts],
                    ["카드", dotoriSavePreview.comparison.details.cards],
                    ["카테고리 그룹", dotoriSavePreview.comparison.details.categoryGroups],
                    ["카테고리", dotoriSavePreview.comparison.details.categories],
                  ] as const).map(([label, items]) => (
                    <div key={label} className="dotori-import-preview-detail-card">
                      <strong>{label}</strong>
                      {items.added.length || items.removed.length ? (
                        <div className="dotori-import-preview-chips">
                          {items.added.map((item) => (
                            <span key={`save-add-${label}-${item}`} className="dotori-import-preview-chip dotori-import-preview-chip--added">
                              {item}
                            </span>
                          ))}
                          {items.removed.map((item) => (
                            <span key={`save-remove-${label}-${item}`} className="dotori-import-preview-chip dotori-import-preview-chip--removed">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="dotori-import-preview-empty">변경 없음</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dotori-import-preview-empty">상세보기를 열면 도토리 최신본 대비 추가·제외 항목을 확인할 수 있습니다.</p>
              )}
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={dotoriImportPreview !== null}
        title="불러올 데이터 요약"
        description="도토리창고 최신 백업을 현재 소비일기 데이터에 반영하기 전에 요약을 먼저 확인합니다."
        onClose={() => {
          if (dotoriAction !== null) return;
          setDotoriImportPreview(null);
          setIsDotoriImportDetailOpen(false);
        }}
        dialogClassName="settings-dotori-preview-modal"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setDotoriImportPreview(null);
                setIsDotoriImportDetailOpen(false);
              }}
              disabled={dotoriAction !== null}
            >
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleConfirmDotoriImport()} disabled={dotoriAction !== null}>
              {dotoriAction === "update" ? "불러오는 중..." : "이 데이터로 불러오기"}
            </button>
          </>
        }
      >
        {dotoriImportPreview ? (
          <div className="dotori-import-preview">
            <div className="dotori-import-preview-card">
              <div className="dotori-import-preview-heading">
                <strong>{dotoriImportPreview.fileName}</strong>
                {dotoriImportPreview.savedAt ? <span>{new Date(dotoriImportPreview.savedAt).toLocaleString("ko-KR")}</span> : null}
              </div>
              <div className="dotori-import-preview-grid">
                <div>
                  <span>거래</span>
                  <strong>
                    {dotoriImportPreview.summary.totals.transactions.toLocaleString()}건{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.transactions.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.transactions.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriImportPreview.comparison.transactions.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>명세서</span>
                  <strong>
                    {dotoriImportPreview.summary.totals.imports.toLocaleString()}건{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.imports.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.imports.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriImportPreview.comparison.imports.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>카테고리</span>
                  <strong>
                    그룹 {dotoriImportPreview.summary.summaries.reduce((sum, workspace) => sum + workspace.categoryGroupCount, 0).toLocaleString()}개 / 전체{" "}
                    {dotoriImportPreview.summary.totals.categories.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.categories.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.categories.delta < 0 ? " is-negative" : ""}`}>
                      전체 {formatDiffValue(dotoriImportPreview.comparison.categories.delta)}
                    </em>
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.categoryGroups.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.categoryGroups.delta < 0 ? " is-negative" : ""}`}>
                      그룹 {formatDiffValue(dotoriImportPreview.comparison.categoryGroups.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>사용자</span>
                  <strong>
                    {dotoriImportPreview.summary.totals.people.toLocaleString()}명{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.people.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.people.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriImportPreview.comparison.people.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>계좌</span>
                  <strong>
                    {dotoriImportPreview.summary.totals.accounts.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.accounts.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.accounts.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriImportPreview.comparison.accounts.delta)}
                    </em>
                  </strong>
                </div>
                <div>
                  <span>카드</span>
                  <strong>
                    {dotoriImportPreview.summary.totals.cards.toLocaleString()}개{" "}
                    <em className={`dotori-import-preview-diff${dotoriImportPreview.comparison.cards.delta > 0 ? " is-positive" : dotoriImportPreview.comparison.cards.delta < 0 ? " is-negative" : ""}`}>
                      {formatDiffValue(dotoriImportPreview.comparison.cards.delta)}
                    </em>
                  </strong>
                </div>
              </div>
            </div>

            <div className="dotori-import-preview-card">
              <p className="dotori-import-preview-section-title">명세서 요약</p>
              <div className="dotori-import-preview-list">
                {dotoriImportPreview.summary.summaries.flatMap((workspace) =>
                  workspace.importSummaries.map((importSummary) => (
                    <div key={importSummary.importRecordId} className="dotori-import-preview-list-item">
                      <div className="dotori-import-preview-list-head">
                        <strong>{importSummary.fileName}</strong>
                        <span>{workspace.workspaceName}</span>
                      </div>
                      <div className="dotori-import-preview-chips">
                        <span>행 수 {importSummary.rowCount.toLocaleString()}건</span>
                        <span>남은 검토 {importSummary.pendingReviewCount.toLocaleString()}건</span>
                        <span>미분류 {importSummary.uncategorizedCount.toLocaleString()}건</span>
                      </div>
                    </div>
                  )),
                )}
                {dotoriImportPreview.summary.summaries.every((workspace) => workspace.importSummaries.length === 0) ? (
                  <div className="dotori-import-preview-empty">저장된 명세서 목록이 없습니다.</div>
                ) : null}
              </div>
            </div>

            <div className="dotori-import-preview-card">
              <div className="dotori-import-preview-detail-header">
                <p className="dotori-import-preview-section-title">변경 상세</p>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setIsDotoriImportDetailOpen((current) => !current)}
                >
                  {isDotoriImportDetailOpen ? "상세 닫기" : "상세보기"}
                </button>
              </div>

              {isDotoriImportDetailOpen ? (
                <div className="dotori-import-preview-detail-grid">
                  {([
                    ["명세서", dotoriImportPreview.comparison.details.imports],
                    ["사용자", dotoriImportPreview.comparison.details.people],
                    ["계좌", dotoriImportPreview.comparison.details.accounts],
                    ["카드", dotoriImportPreview.comparison.details.cards],
                    ["카테고리 그룹", dotoriImportPreview.comparison.details.categoryGroups],
                    ["카테고리", dotoriImportPreview.comparison.details.categories],
                  ] as const).map(([label, items]) => (
                    <div key={label} className="dotori-import-preview-detail-card">
                      <strong>{label}</strong>
                      {items.added.length || items.removed.length ? (
                        <div className="dotori-import-preview-chips">
                          {items.added.map((item) => (
                            <span key={`add-${item}`} className="dotori-import-preview-chip dotori-import-preview-chip--added">
                              {item}
                            </span>
                          ))}
                          {items.removed.map((item) => (
                            <span key={`remove-${item}`} className="dotori-import-preview-chip dotori-import-preview-chip--removed">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="dotori-import-preview-empty">변경 없음</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dotori-import-preview-empty">상세보기를 열면 현재 로컬과 비교한 추가·제외 항목을 확인할 수 있습니다.</p>
              )}
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}


