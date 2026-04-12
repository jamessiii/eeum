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
import { migrateFoundationData, type FoundationMigrationSummary } from "../api/foundationMigration";
import { switchSpace } from "../api/auth";
import { requestServerJson } from "../api/serverState";
import { AUTH_SESSION_EVENT, clearAuthSession, createAuthSession, readAuthSession, writeAuthSession } from "../authSession";
import { AppSelect } from "../components/AppSelect";
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

type MembershipRoleValue = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type SpaceMembershipSummary = {
  id: number;
  spaceId: number;
  userId: number;
  userDisplayName: string;
  userEmail: string;
  role: MembershipRoleValue;
  status: "INVITED" | "ACTIVE" | "LEFT";
};

const MEMBERSHIP_ROLE_OPTIONS: Array<{ value: MembershipRoleValue; label: string }> = [
  { value: "OWNER", label: "오너" },
  { value: "ADMIN", label: "어드민" },
  { value: "MEMBER", label: "멤버" },
  { value: "VIEWER", label: "뷰어" },
];

function getMembershipRoleLabel(role: MembershipRoleValue | string) {
  return MEMBERSHIP_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

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
  const [isFoundationMigrationRunning, setIsFoundationMigrationRunning] = useState(false);
  const [foundationMigrationSummary, setFoundationMigrationSummary] = useState<FoundationMigrationSummary | null>(null);
  const [spaceInviteCode, setSpaceInviteCode] = useState<string | null>(null);
  const [spaceMemberships, setSpaceMemberships] = useState<SpaceMembershipSummary[]>([]);
  const [isMembershipsLoading, setIsMembershipsLoading] = useState(false);
  const [membershipUpdatingId, setMembershipUpdatingId] = useState<number | null>(null);
  const [personLinkSelections, setPersonLinkSelections] = useState<Record<string, string>>({});
  const [personLinkUpdatingId, setPersonLinkUpdatingId] = useState<string | null>(null);
  const [spaceSwitchingId, setSpaceSwitchingId] = useState<number | null>(null);
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

  const authSession = readAuthSession();
  const availableSpaces = [...(authSession?.availableSpaces ?? [])].sort((left, right) => left.spaceName.localeCompare(right.spaceName, "ko-KR"));

  const loadSpaceMemberships = async (session: NonNullable<typeof authSession>) => {
    setIsMembershipsLoading(true);
    try {
      const memberships = await requestServerJson<SpaceMembershipSummary[]>(session, `/api/memberships?spaceId=${session.spaceId}`);
      setSpaceMemberships(memberships);
    } finally {
      setIsMembershipsLoading(false);
    }
  };

  useEffect(() => {
    if (!authSession) {
      setSpaceInviteCode(null);
      setSpaceMemberships([]);
      return;
    }

    void Promise.all([
      requestServerJson<{
        id: number;
        name: string;
        slug: string;
        inviteCode: string;
      }>(authSession, `/api/spaces/${authSession.spaceId}`, undefined, { withSessionHeader: false }),
      requestServerJson<SpaceMembershipSummary[]>(authSession, `/api/memberships?spaceId=${authSession.spaceId}`),
    ])
      .then(([space, memberships]) => {
        setSpaceInviteCode(space.inviteCode ?? null);
        setSpaceMemberships(memberships);
      })
      .catch(() => {
        setSpaceInviteCode(null);
        setSpaceMemberships([]);
      })
      .finally(() => {
        setIsMembershipsLoading(false);
      });
  }, [authSession?.apiBaseUrl, authSession?.spaceId, authSession?.sessionKey]);

  const currentMembership = authSession
    ? spaceMemberships.find((membership) => membership.userId === authSession.userId) ?? null
    : null;
  const canManageMembershipRoles = currentMembership?.role === "OWNER" && currentMembership.status === "ACTIVE";
  const orderedMemberships = [...spaceMemberships].sort((left, right) => {
    const roleWeight = (role: MembershipRoleValue) =>
      role === "OWNER" ? 0 : role === "ADMIN" ? 1 : role === "MEMBER" ? 2 : 3;
    return roleWeight(left.role) - roleWeight(right.role) || left.userDisplayName.localeCompare(right.userDisplayName, "ko-KR");
  });
  const activeMemberships = orderedMemberships.filter((membership) => membership.status === "ACTIVE");
  const peopleSorted = [...scope.people].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || (left.displayName || left.name).localeCompare(right.displayName || right.name, "ko-KR"),
  );

  useEffect(() => {
    setPersonLinkSelections((current) => {
      const next = { ...current };
      let changed = false;

      for (const person of scope.people) {
        const linkedUserId = person.linkedUserId ?? "";
        if (!(person.id in next)) {
          next[person.id] = linkedUserId;
          changed = true;
          continue;
        }

        if (current[person.id] === linkedUserId) {
          next[person.id] = linkedUserId;
        }
      }

      for (const personId of Object.keys(next)) {
        if (!scope.people.some((person) => person.id === personId)) {
          delete next[personId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [scope.people]);

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

  const handleFoundationMigration = async () => {
    const authSession = readAuthSession();
    if (!authSession) {
      showToast("먼저 서버 로그인부터 완료해주세요.", "error");
      return;
    }

    if (!scope.people.length && !scope.accounts.length && !scope.cards.length && !scope.categories.length) {
      showToast("옮길 기초 데이터가 없습니다.", "info");
      return;
    }

    setIsFoundationMigrationRunning(true);

    try {
      const summary = await migrateFoundationData({
        apiBaseUrl: authSession.apiBaseUrl,
        spaceId: authSession.spaceId,
        sessionKey: authSession.sessionKey,
        people: scope.people,
        accounts: scope.accounts,
        cards: scope.cards,
        categories: scope.categories,
      });

      setFoundationMigrationSummary(summary);
      showToast("사용자, 카드·계좌, 카테고리를 서버로 옮겼습니다.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "기초 데이터 이전 중 오류가 발생했습니다.";
      showToast(message, "error");
    } finally {
      setIsFoundationMigrationRunning(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    showToast("로그아웃되었습니다.", "info");
  };

  const handleCopyInviteCode = async () => {
    if (!spaceInviteCode) {
      showToast("초대코드를 아직 불러오지 못했습니다.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(spaceInviteCode);
      showToast("초대코드를 복사했습니다.", "success");
    } catch {
      showToast("초대코드 복사에 실패했습니다.", "error");
    }
  };

  const handleMembershipRoleChange = async (membership: SpaceMembershipSummary, nextRole: MembershipRoleValue) => {
    if (!authSession) {
      showToast("먼저 서버 로그인부터 완료해주세요.", "error");
      return;
    }

    setMembershipUpdatingId(membership.id);
    try {
      await requestServerJson(authSession, `/api/memberships/${membership.id}`, {
        method: "PUT",
        body: JSON.stringify({
          spaceId: membership.spaceId,
          userId: membership.userId,
          role: nextRole,
          status: membership.status,
        }),
      });
      await loadSpaceMemberships(authSession);
      showToast(`${membership.userDisplayName} 권한을 ${MEMBERSHIP_ROLE_OPTIONS.find((option) => option.value === nextRole)?.label ?? nextRole}(으)로 변경했습니다.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "멤버 권한 변경 중 오류가 발생했습니다.";
      showToast(message, "error");
    } finally {
      setMembershipUpdatingId(null);
    }
  };

  const handlePersonLinkConnect = async (personId: string) => {
    if (!authSession) {
      showToast("먼저 서버 로그인부터 완료해주세요.", "error");
      return;
    }

    const selectedUserId = personLinkSelections[personId];
    const person = peopleSorted.find((item) => item.id === personId);
    if (!selectedUserId || !person) {
      showToast("연결할 멤버를 먼저 선택해주세요.", "error");
      return;
    }

    setPersonLinkUpdatingId(personId);
    try {
      await requestServerJson(authSession, `/api/people/${personId}/link-user`, {
        method: "POST",
        body: JSON.stringify({
          spaceId: Number(workspaceId),
          userId: Number(selectedUserId),
        }),
      });
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: authSession }));
      showToast(`${person.displayName || person.name} 사용자에 멤버를 연결했습니다.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "사용자 연결 중 오류가 발생했습니다.";
      showToast(message, "error");
    } finally {
      setPersonLinkUpdatingId(null);
    }
  };

  const handlePersonLinkDisconnect = async (personId: string) => {
    if (!authSession) {
      showToast("먼저 서버 로그인부터 완료해주세요.", "error");
      return;
    }

    const person = peopleSorted.find((item) => item.id === personId);
    if (!person?.linkedUserId) return;

    setPersonLinkUpdatingId(personId);
    try {
      await requestServerJson(authSession, `/api/people/${personId}/link-user?spaceId=${workspaceId}`, {
        method: "DELETE",
      });
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: authSession }));
      showToast(`${person.displayName || person.name} 사용자 연결을 해제했습니다.`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "사용자 연결 해제 중 오류가 발생했습니다.";
      showToast(message, "error");
    } finally {
      setPersonLinkUpdatingId(null);
    }
  };

  const handleSwitchSpace = async (spaceId: number) => {
    if (!authSession) {
      showToast("먼저 서버 로그인부터 완료해주세요.", "error");
      return;
    }

    setSpaceSwitchingId(spaceId);
    try {
      const { baseUrl, data } = await switchSpace({
        apiBaseUrl: authSession.apiBaseUrl,
        sessionKey: authSession.sessionKey,
        spaceId,
      });
      writeAuthSession(createAuthSession(baseUrl, data));
      showToast(`${data.space.name} 공간으로 전환했습니다.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "공간 전환에 실패했습니다.";
      showToast(message, "error");
    } finally {
      setSpaceSwitchingId(null);
    }
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
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">서버 초기 이전</span>
                    <p className="settings-backup-group-description">
                      현재 브라우저의 사용자, 계좌, 카드, 카테고리만 빈 서버 공간으로 한 번 옮깁니다.
                    </p>
                    <div className="settings-foundation-migration-summary">
                      <span>사용자 {scope.people.length}명</span>
                      <span>계좌 {scope.accounts.length}개</span>
                      <span>카드 {scope.cards.length}개</span>
                      <span>
                        카테고리 그룹 {scope.categories.filter((category) => category.categoryType === "group").length}개 / 전체{" "}
                        {scope.categories.length}개
                      </span>
                      {foundationMigrationSummary ? (
                        <strong>
                          이전 완료: 사용자 {foundationMigrationSummary.peopleCount}명, 계좌 {foundationMigrationSummary.accountCount}개, 카드{" "}
                          {foundationMigrationSummary.cardCount}개, 카테고리 그룹 {foundationMigrationSummary.categoryGroupCount}개, 카테고리{" "}
                          {foundationMigrationSummary.categoryCount}개
                        </strong>
                      ) : null}
                    </div>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                    <button type="button" className="btn btn-primary" onClick={() => void handleFoundationMigration()} disabled={isFoundationMigrationRunning}>
                      {isFoundationMigrationRunning ? "옮기는 중..." : "서버로 옮기기"}
                    </button>
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">공간 초대코드</span>
                    <p className="settings-backup-group-description">다른 사람이 이 코드를 입력하면 현재 공간에 참여할 수 있습니다.</p>
                    <div className="settings-foundation-migration-summary">
                      <strong>{spaceInviteCode ?? "불러오는 중..."}</strong>
                    </div>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                    <button type="button" className="btn btn-outline-primary" onClick={() => void handleCopyInviteCode()} disabled={!spaceInviteCode}>
                      복사하기
                    </button>
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">공간 전환</span>
                    <p className="settings-backup-group-description">이미 참여한 다른 공간이 있으면 여기서 바로 이동할 수 있습니다.</p>
                    <div className="settings-membership-note">
                      현재 공간: <strong>{authSession?.spaceName ?? "확인 중..."}</strong>
                    </div>
                  </div>
                  <div className="settings-space-list">
                    {availableSpaces.length ? (
                      availableSpaces.map((space) => {
                        const isCurrent = authSession?.spaceId === space.spaceId;
                        const isSwitching = spaceSwitchingId === space.spaceId;
                        return (
                          <div key={space.spaceId} className={`settings-space-item${isCurrent ? " is-current" : ""}`}>
                            <div className="settings-space-copy">
                              <div className="settings-membership-name-row">
                                <strong>{space.spaceName}</strong>
                                <span className="settings-membership-status">{getMembershipRoleLabel(space.role)}</span>
                              </div>
                              <span>초대코드 {space.inviteCode}</span>
                            </div>
                            <button
                              type="button"
                              className={`btn ${isCurrent ? "btn-outline-secondary" : "btn-outline-primary"}`}
                              disabled={isCurrent || isSwitching}
                              onClick={() => void handleSwitchSpace(space.spaceId)}
                            >
                              {isCurrent ? "현재 공간" : isSwitching ? "이동 중..." : "들어가기"}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="settings-membership-empty">참여 중인 다른 공간이 없습니다.</div>
                    )}
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">공간 멤버 권한</span>
                    <p className="settings-backup-group-description">현재 공간에 참여한 멤버 권한을 확인하고 조정합니다.</p>
                    <div className="settings-membership-note">
                      {canManageMembershipRoles
                        ? "현재 로그인 계정은 OWNER입니다. 다른 멤버의 권한을 변경할 수 있습니다."
                        : "현재 로그인 계정은 OWNER가 아니어서 권한을 변경할 수 없습니다."}
                    </div>
                  </div>
                  <div className="settings-membership-list">
                    {isMembershipsLoading ? (
                      <div className="settings-membership-empty">불러오는 중...</div>
                    ) : orderedMemberships.length ? (
                      orderedMemberships.map((membership) => {
                        const isMe = authSession?.userId === membership.userId;
                        const isUpdating = membershipUpdatingId === membership.id;
                        return (
                          <div key={membership.id} className="settings-membership-item">
                            <div className="settings-membership-copy">
                              <div className="settings-membership-name-row">
                                <strong>{membership.userDisplayName}</strong>
                                {isMe ? <span className="settings-membership-me">나</span> : null}
                                <span className="settings-membership-status">{membership.status}</span>
                              </div>
                              <span>{membership.userEmail}</span>
                            </div>
                            <div className="settings-membership-actions">
                              <AppSelect
                                value={membership.role}
                                onChange={(nextValue) => void handleMembershipRoleChange(membership, nextValue as MembershipRoleValue)}
                                options={MEMBERSHIP_ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                                ariaLabel={`${membership.userDisplayName} 권한`}
                                disabled={!canManageMembershipRoles || isMe || isUpdating}
                                size="sm"
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="settings-membership-empty">아직 참여한 멤버가 없습니다.</div>
                    )}
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">사용자 연결</span>
                    <p className="settings-backup-group-description">수동으로 만든 사용자 항목과 실제 공간 멤버를 연결하거나 해제합니다.</p>
                    <div className="settings-membership-note">
                      {canManageMembershipRoles
                        ? "연결이 필요한 멤버를 선택해 사용자 항목에 붙일 수 있습니다."
                        : "현재 로그인 계정은 OWNER가 아니어서 사용자 연결을 변경할 수 없습니다."}
                    </div>
                  </div>
                  <div className="settings-membership-list">
                    {peopleSorted.length ? (
                      peopleSorted.map((person) => {
                        const selectedUserId = personLinkSelections[person.id] ?? "";
                        const linkedUserId = person.linkedUserId ?? null;
                        const isUpdating = personLinkUpdatingId === person.id;
                        const availableMemberships = activeMemberships;

                        return (
                          <div key={person.id} className="settings-membership-item">
                            <div className="settings-membership-copy">
                              <div className="settings-membership-name-row">
                                <strong>{person.displayName || person.name}</strong>
                                <span className={`settings-membership-status${linkedUserId ? " is-linked" : " is-unlinked"}`}>
                                  {linkedUserId ? "연결됨" : "미연결"}
                                </span>
                              </div>
                              <span>
                                {person.linkedUserDisplayName
                                  ? `${person.linkedUserDisplayName} 멤버와 연결됨`
                                  : activeMemberships.length
                                    ? "연결할 공간 멤버를 선택해주세요."
                                    : "아직 연결된 공간 멤버가 없습니다."}
                              </span>
                            </div>
                            <div className="settings-person-link-actions">
                              <AppSelect
                                value={selectedUserId}
                                onChange={(nextValue) =>
                                  setPersonLinkSelections((current) => ({
                                    ...current,
                                    [person.id]: nextValue,
                                  }))
                                }
                                options={[
                                  { value: "", label: "멤버 선택" },
                                  ...availableMemberships.map((membership) => ({
                                    value: String(membership.userId),
                                    label: membership.userDisplayName,
                                  })),
                                ]}
                                ariaLabel={`${person.displayName || person.name} 연결 멤버 선택`}
                                disabled={!canManageMembershipRoles || isUpdating}
                                size="sm"
                              />
                              <div className="settings-person-link-button-row">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void handlePersonLinkConnect(person.id)}
                                  disabled={!canManageMembershipRoles || !selectedUserId || isUpdating}
                                >
                                  연결
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={() => void handlePersonLinkDisconnect(person.id)}
                                  disabled={!canManageMembershipRoles || !linkedUserId || isUpdating}
                                >
                                  해제
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="settings-membership-empty">연결할 사용자 항목이 아직 없습니다.</div>
                    )}
                  </div>
                </section>
                <section className="settings-backup-group">
                  <div className="settings-backup-group-copy">
                    <span className="settings-backup-group-label">세션</span>
                    <p className="settings-backup-group-description">현재 로그인된 사용자 세션을 종료하고 로그인 화면으로 돌아갑니다.</p>
                  </div>
                  <div className="settings-panel-actions settings-backup-action-row">
                    <button type="button" className="btn btn-outline-primary" onClick={handleLogout}>
                      로그아웃
                    </button>
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


