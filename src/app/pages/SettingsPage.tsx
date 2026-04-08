import { useEffect, useRef, useState } from "react";
import { createBackupContent } from "../../domain/app/backup";
import { formatPercent } from "../../shared/utils/format";
import {
  healthCheckDotoriStorage,
  loadLatestDotoriBackup,
  loadLatestDotoriBackupMetadata,
  saveDotoriBackup,
  type DotoriBackupMetadata,
  type DotoriConnectionForm,
} from "../api/dotoriStorage";
import { AppModal } from "../components/AppModal";
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
const DOTORI_BACKUP_FOLDER_NAME = "소비일기 데이터베이스";
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

function formatDotoriBackupFileName(date = new Date()) {
  return `${date.getFullYear()}년${date.getMonth() + 1}월${date.getDate()}일의기록.json`;
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

function isSameDotoriBackupVersion(left: DotoriBackupMetadata | null, right: DotoriBackupMetadata | null) {
  if (!left || !right) return false;
  return left.fileName === right.fileName && (left.savedAt ?? null) === (right.savedAt ?? null);
}

function isJsonBackupFile(file: File) {
  return file.name.toLowerCase().endsWith(".json");
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
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const transactionPackageImportInputRef = useRef<HTMLInputElement | null>(null);
  const foundationPackageImportInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setProfileDraft(createProfileDraft(profile));
    setActiveProfileField(null);
  }, [workspaceId, profile?.targetSavingsRate, profile?.warningSpendRate, profile?.warningFixedCostRate]);

  useEffect(() => {
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

  useEffect(() => {
    setIsDotoriConnected(false);
    setDotoriSyncedBackup(null);
    setDotoriStatusMessage("도토리창고 연결을 확인해주세요.");
    setDotoriLatestFileName(null);
  }, [dotoriForm.host, dotoriForm.port, dotoriForm.username, dotoriForm.password]);

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
    setDotoriForm((current) => ({ ...current, [field]: value as never }));
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
      setIsDotoriConnected(false);
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
      showToast("도토리창고 로그인 확인이 완료되었습니다.", "success");
    });

  const handleDotoriSave = () =>
    withDotoriAction("save", async () => {
      const fileName = formatDotoriBackupFileName();
      let latestRemoteBackup: DotoriBackupMetadata | null = null;
      try {
        latestRemoteBackup = await loadLatestDotoriBackupMetadata(dotoriForm, DOTORI_BACKUP_FOLDER_NAME);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("404")) {
          throw error;
        }
      }
      if (latestRemoteBackup && !isSameDotoriBackupVersion(dotoriSyncedBackup, latestRemoteBackup)) {
        throw new Error("?꾪넗由ъ갹怨좎뿉 濡쒖뺄蹂대떎 ?ㅼ쟾 諛깆뾽???덉뒿?덈떎. 癒쇱? 遺덈윭?ㅺ린瑜??ㅽ뻾?댁＜?몄슂.");
      }
      const savedBackup = await saveDotoriBackup(dotoriForm, {
        folderName: DOTORI_BACKUP_FOLDER_NAME,
        fileName,
        content: createBackupContent(state),
      });
      setIsDotoriConnected(true);
      setDotoriLatestFileName(savedBackup.fileName);
      setDotoriSyncedBackup(savedBackup);
      setDotoriStatusMessage(`${fileName} 파일을 저장했습니다.`);
      showToast(`${fileName} 파일을 도토리창고에 저장했습니다.`, "success");
    });

  const handleDotoriUpdate = () =>
    withDotoriAction("update", async () => {
      const latestBackup = await loadLatestDotoriBackup(dotoriForm, DOTORI_BACKUP_FOLDER_NAME);
      const backupFile = new File([latestBackup.content], latestBackup.fileName, {
        type: "application/json",
      });
      await importState(backupFile);
      setIsDotoriConnected(true);
      setDotoriLatestFileName(latestBackup.fileName);
      setDotoriSyncedBackup({
        fileName: latestBackup.fileName,
        savedAt: latestBackup.savedAt ?? null,
      });
      setDotoriStatusMessage(`${latestBackup.fileName} 파일을 최신본으로 불러왔습니다.`);
      showToast(`${latestBackup.fileName} 최신 백업을 불러왔습니다.`, "success");
    });

  const handleDotoriDisconnect = () => {
    setIsDotoriConnected(false);
    setDotoriSyncedBackup(null);
    setDotoriStatusMessage("도토리창고 접속을 종료했습니다.");
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
    </div>
  );
}


