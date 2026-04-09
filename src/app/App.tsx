import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  createBackupContent,
  createEmptyBackupPreviewSummary,
  summarizeBackupPayload,
} from "../domain/app/backup";
import { GUIDE_V1_RESET_EVENT, readGuideRuntime } from "../domain/guidance/guideRuntime";
import { Link, useNavigate } from "react-router-dom";
import {
  clearDotoriPresence,
  createDotoriPresenceSocketUrl,
  healthCheckDotoriStorage,
  loadLatestDotoriBackup,
  saveDotoriBackup,
  sendDotoriPresenceHeartbeat,
  type DotoriBackupMetadata,
  type DotoriPresenceSnapshot,
} from "./api/dotoriStorage";
import { getPresenceAccent } from "./dotoriPresenceVisuals";
import { MotionProvider } from "./motion/MotionProvider";
import { DotoriPresenceProvider, type DotoriPresenceTarget } from "./presence/DotoriPresenceContext";
import { AppModal } from "./components/AppModal";
import { AppGuidePanel } from "./components/AppGuidePanel";
import {
  createDotoriBackupFileName,
  DOTORI_BACKUP_FOLDER_NAME,
  DOTORI_SYNC_SESSION_EVENT,
  getDotoriClientId,
  isSameDotoriBackupVersion,
  readDotoriSyncSession,
  writeDotoriSyncSession,
  type DotoriSyncSession,
} from "./dotoriSync";
import { EmptyWorkspaceScreen, ONBOARDING_COMPLETE_KEY, WORKSPACE_SETUP_KEY } from "./pages/EmptyWorkspaceScreen";
import { LoadingScreen } from "./pages/LoadingScreen";
import { AppStateProvider, useAppState } from "./state/AppStateProvider";
import { getActiveWorkspace } from "./state/selectors";
import { ToastProvider, useToast } from "./toast/ToastProvider";
import { useThemeMode } from "./useThemeMode";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage").then((module) => ({ default: module.TransactionsPage })),
);
const AccountTransfersPage = lazy(() =>
  import("./pages/AccountTransfersPage").then((module) => ({ default: module.AccountTransfersPage })),
);
const IncomePage = lazy(() => import("./pages/IncomePage").then((module) => ({ default: module.IncomePage })));
const PeoplePage = lazy(() => import("./pages/PeoplePage").then((module) => ({ default: module.PeoplePage })));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage").then((module) => ({ default: module.CategoriesPage })));
const SettlementsPage = lazy(() =>
  import("./pages/SettlementsPage").then((module) => ({ default: module.SettlementsPage })),
);
const LoopStationPage = lazy(() =>
  import("./pages/LoopStationPage").then((module) => ({ default: module.LoopStationPage })),
);
const LoopAnnualPage = lazy(() =>
  import("./pages/LoopAnnualPage").then((module) => ({ default: module.LoopAnnualPage })),
);
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const DeveloperPage = lazy(() => import("./pages/DeveloperPage").then((module) => ({ default: module.DeveloperPage })));

const DEVELOPER_MODE_KEY = "spending-diary.developer-mode";
const ASSET_BASE = import.meta.env.BASE_URL;
const DOTORI_AUTO_SYNC_DEBOUNCE_MS = 1200;
const DOTORI_HEALTH_POLL_INTERVAL_MS = 20 * 1000;
const DOTORI_PRESENCE_HEARTBEAT_INTERVAL_MS = 3 * 1000;

type DotoriReachabilityState = "idle" | "online" | "offline";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

type NavEntry = NavItem | { type: "divider"; id: string };

const baseNavItems: NavEntry[] = [
  { to: "/dashboard", label: "첫장" },
  { to: "/settlements", label: "마무리" },
  { to: "/records", label: "돌아보기" },
  { type: "divider", id: "nav-divider-primary" },
  { to: "/connections/assets", label: "카드/계좌" },
  { to: "/connections/categories", label: "카테고리" },
  { to: "/loops", label: "고정비" },
  { type: "divider", id: "nav-divider-secondary" },
];
const developerNavItem: NavEntry = { to: "/dev", label: "DEV" };

const navGuideTargetMap: Record<string, string> = {
  "/dashboard": "nav-dashboard",
  "/connections/assets": "nav-sub-assets",
  "/connections/categories": "nav-sub-categories",
  "/settlements": "nav-sub-transfers",
  "/loops": "nav-sub-loops",
  "/records": "nav-sub-moon",
  "/dev": "nav-dev",
  "/settings": "nav-settings",
};

const navIconKeyMap: Record<string, string> = {
  "/dashboard": "menu-home",
  "/connections/assets": "menu-card-account",
  "/connections/categories": "menu-category",
  "/settlements": "menu-finish",
  "/loops": "menu-fixed-cost",
  "/records": "menu-review",
  "/dev": "lab",
  "/settings": "menu-settings",
};

function getDesktopHeaderTitle(pathname: string) {
  if (pathname === "/dashboard") {
    const today = new Date();
    return `${today.getFullYear()}년 ${today.getMonth() + 1}월`;
  }
  if (pathname.startsWith("/records")) return "돌아보기";
  if (pathname.startsWith("/connections")) return "연결";
  if (pathname === "/settlements") return "마무리";
  if (pathname.startsWith("/loops")) return "고정비";
  if (pathname.startsWith("/flows")) return "흐름";
  if (pathname.startsWith("/collections")) return "기록";
  if (pathname === "/settings") return "설정";
  return "소비일기";
}

function getPresencePageLabel(pathname: string) {
  if (pathname === "/dashboard") return "첫장";
  if (pathname.startsWith("/connections/assets")) return "카드/계좌";
  if (pathname.startsWith("/connections/categories")) return "카테고리";
  if (pathname === "/settlements") return "마무리";
  if (pathname.startsWith("/loops")) return "고정비";
  if (pathname.startsWith("/records")) return "돌아보기";
  if (pathname === "/settings") return "설정";
  if (pathname.startsWith("/dev")) return "DEV";
  return "소비일기";
}

function isNavItem(entry: NavEntry): entry is NavItem {
  return "to" in entry;
}

function isImageNavIcon(iconKey: string) {
  return iconKey.startsWith("menu-");
}

function createMenuIconSrc(iconKey: string) {
  return `${ASSET_BASE}menu-icons/${iconKey}.png`;
}

function useDeveloperMode() {
  const [isDeveloperModeUnlocked, setIsDeveloperModeUnlocked] = useState(false);
  const [, setUnlockAttempts] = useState<number[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    const stored = window.localStorage.getItem(DEVELOPER_MODE_KEY);
    setIsDeveloperModeUnlocked(stored === "unlocked");
  }, []);

  const registerUnlockTap = () => {
    if (isDeveloperModeUnlocked) return;
    const now = Date.now();
    setUnlockAttempts((current) => {
      const nextAttempts = [...current.filter((attempt) => now - attempt < 3000), now];

      if (nextAttempts.length >= 5) {
        window.localStorage.setItem(DEVELOPER_MODE_KEY, "unlocked");
        setIsDeveloperModeUnlocked(true);
        showToast("개발자 모드가 잠금 해제되었습니다.", "success");
        return [];
      }

      return nextAttempts;
    });
  };

  const lockDeveloperMode = () => {
    window.localStorage.removeItem(DEVELOPER_MODE_KEY);
    setIsDeveloperModeUnlocked(false);
    setUnlockAttempts([]);
    showToast("개발자 모드를 다시 잠갔습니다.", "info");
  };

  return { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode };
}

function getActiveMainKey(pathname: string, navItems: NavItem[]) {
  if (pathname === "/dashboard") {
    return "/dashboard";
  }
  if (pathname === "/settings") {
    return "/settings";
  }
  if (pathname.startsWith("/connections/categories") || pathname === "/categories") return "/connections/categories";
  if (pathname.startsWith("/connections/assets") || pathname === "/people" || pathname === "/accounts" || pathname === "/cards")
    return "/connections/assets";
  if (pathname === "/settlements") return "/settlements";
  if (pathname.startsWith("/loops")) return "/loops";
  if (pathname.startsWith("/records")) return "/records";
  if (pathname === "/dev") return "/dev";
  const exact = navItems.find((item) => item.to === pathname);
  if (exact) return exact.to;
  const partial = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return partial?.to ?? null;
}

function AppSidebarNav({
  isDeveloperModeUnlocked,
  onNavigate,
  presenceConnections = [],
}: {
  isDeveloperModeUnlocked: boolean;
  onNavigate?: () => void;
  presenceConnections?: DotoriPresenceSnapshot["connections"];
}) {
  const location = useLocation();
  const navEntries = useMemo(
    () => (isDeveloperModeUnlocked ? [...baseNavItems, developerNavItem] : baseNavItems),
    [isDeveloperModeUnlocked],
  );
  const navItems = useMemo(() => navEntries.filter(isNavItem), [navEntries]);
  const activeKey = useMemo(() => getActiveMainKey(location.pathname || "/", navItems), [location.pathname, navItems]);

  return (
    <nav className="sidebar-nav" aria-label="주요 메뉴" data-guide-target="nav-menu">
      {[...navEntries, { to: "/settings", label: "설정" }].map((item, index) => {
        if (!isNavItem(item)) {
          return <div key={item.id ?? `divider-${index}`} className="sidebar-nav-divider" aria-hidden="true" />;
        }
        const iconKey = navIconKeyMap[item.to] ?? "dot";
        const itemPresenceConnections = presenceConnections.filter((connection) => connection.page === item.label);
        return (
        <div key={item.to} className={`sidebar-nav-section${activeKey === item.to ? " is-active" : ""}`}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive: isLinkActive }) => `sidebar-nav-parent sidebar-nav-link${isLinkActive || activeKey === item.to ? " is-active" : ""}${itemPresenceConnections.length ? " has-presence" : ""}`}
            data-guide-target={navGuideTargetMap[item.to] ?? undefined}
            onClick={onNavigate}
          >
            {isImageNavIcon(iconKey) ? (
              <img className="nav-sidebar-icon-image" src={createMenuIconSrc(iconKey)} alt="" aria-hidden="true" />
            ) : (
              <span className={`nav-sidebar-icon nav-sidebar-icon--${iconKey}`} aria-hidden="true" />
            )}
            <span className="sidebar-nav-parent-label">
              <span>{item.label}</span>
              {itemPresenceConnections.length ? (
                <span className="sidebar-nav-presence-list" aria-hidden="true">
                  {itemPresenceConnections
                    .slice(0, 3)
                    .map((connection) => {
                      const accent = getPresenceAccent(connection.username);
                      return (
                        <span
                          key={`${item.to}-${connection.clientId}`}
                          className="sidebar-nav-presence-badge"
                          style={
                            {
                              "--presence-bg": accent.background,
                              "--presence-border": accent.border,
                              "--presence-text": accent.text,
                            } as never
                          }
                        >
                          {connection.username}
                        </span>
                      );
                    })}
                </span>
              ) : null}
            </span>
          </NavLink>
        </div>
      )})}
    </nav>
  );
}

function RouteSideEffectCleanup() {
  const location = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;

    delete document.body.dataset.appModalCount;
    document.body.classList.remove("app-modal-open");
    document.documentElement.classList.remove("app-modal-open");
    document.querySelectorAll(".app-modal-backdrop").forEach((node) => node.remove());
  }, [location.pathname, location.search]);

  return null;
}

function AppRoutes({
  isDeveloperModeUnlocked,
  lockDeveloperMode,
}: {
  isDeveloperModeUnlocked: boolean;
  lockDeveloperMode: () => void;
}) {
  return (
    <Suspense fallback={<LoadingScreen message="화면을 준비하는 중입니다." />}>
      <RouteSideEffectCleanup />
      <Routes>
        <Route path="/" element={<SectionIndexRedirect defaultPath="/dashboard" />} />
        <Route path="/dashboard" element={<DashboardPage mode="dashboard" />} />
        <Route path="/collections" element={<SectionIndexRedirect defaultPath="/collections/card" />} />
        <Route path="/collections/card" element={<TransactionsPage />} />
        <Route path="/collections/transfer" element={<AccountTransfersPage />} />
        <Route path="/collections/income" element={<IncomePage />} />
        <Route
          path="/records"
          element={<SectionIndexRedirect defaultPath="/records/month" alternatePath="/records/year" viewKey="view" alternateValue="year" />}
        />
        <Route path="/records/month" element={<RecordsPage view="month" />} />
        <Route path="/records/year" element={<RecordsPage view="year" />} />
        <Route path="/records/moon" element={<PathRedirect to="/records/month" />} />
        <Route path="/records/sun" element={<PathRedirect to="/records/year" />} />
        <Route
          path="/connections"
          element={
            <SectionIndexRedirect
              defaultPath="/connections/assets"
              alternatePath="/connections/categories"
              viewKey="view"
              alternateValue="classification"
            />
          }
        />
        <Route path="/connections/assets" element={<PeoplePage />} />
        <Route path="/connections/categories" element={<CategoriesPage />} />
        <Route path="/transactions" element={<SectionIndexRedirect defaultPath="/collections/card" />} />
        <Route path="/account-transfers" element={<PathRedirect to="/collections/transfer" />} />
        <Route
          path="/people"
          element={
            <SectionIndexRedirect
              defaultPath="/connections/assets"
              alternatePath="/connections/categories"
              viewKey="view"
              alternateValue="classification"
            />
          }
        />
        <Route path="/accounts" element={<PathRedirect to="/connections/assets" />} />
        <Route path="/cards" element={<PathRedirect to="/connections/assets" />} />
        <Route path="/categories" element={<PathRedirect to="/connections/categories" />} />
        <Route path="/imports" element={<PathRedirect to="/collections/card" />} />
        <Route path="/reviews" element={<PathRedirect to="/collections/card" />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/loops" element={<LoopStationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/dev"
          element={
            isDeveloperModeUnlocked ? (
              <DeveloperPage onLockDeveloperMode={lockDeveloperMode} />
            ) : (
              <Navigate to="/settings" replace />
            )
          }
        />
      </Routes>
    </Suspense>
  );
}

function PathRedirect({ to }: { to: string }) {
  const location = useLocation();
  const search = location.search || "";
  return <Navigate to={`${to}${search}`} replace />;
}

function SectionIndexRedirect({
  defaultPath,
  alternatePath,
  viewKey,
  alternateValue,
}: {
  defaultPath: string;
  alternatePath?: string;
  viewKey?: string;
  alternateValue?: string;
}) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const shouldUseAlternate = viewKey && alternatePath && alternateValue ? searchParams.get(viewKey) === alternateValue : false;
  if (viewKey) {
    searchParams.delete(viewKey);
  }
  const nextSearch = searchParams.toString();
  const nextPath = shouldUseAlternate && alternatePath ? alternatePath : defaultPath;
  return <Navigate to={`${nextPath}${nextSearch ? `?${nextSearch}` : ""}`} replace />;
}

function RecordsPage({ view }: { view: "month" | "year" }) {
  return (
    <div className="page-stack">
      <section className="records-view-shell">
        <div className="records-view-tabs" role="tablist" aria-label="통계 보기 방식">
          <NavLink
            to="/records/month"
            className={({ isActive }) => `records-view-tab${isActive ? " is-active" : ""}`}
            aria-current={view === "month" ? "page" : undefined}
          >
            월별
          </NavLink>
          <NavLink
            to="/records/year"
            className={({ isActive }) => `records-view-tab${isActive ? " is-active" : ""}`}
            aria-current={view === "year" ? "page" : undefined}
          >
            연도별
          </NavLink>
        </div>
      </section>
      {view === "month" ? (
        <DashboardPage mode="moon" />
      ) : (
        <>
          <DashboardPage mode="sun" />
          <LoopAnnualPage />
        </>
      )}
    </div>
  );
}

function AppBrandMark({ size = "compact" }: { size?: "compact" | "expanded" }) {
  return (
    <span className={`app-brand-mark app-brand-mark--${size}`} aria-label="소비일기">
      <img className="app-brand-image" src={`${ASSET_BASE}logo2.png`} alt="" aria-hidden="true" />
      <span className="app-brand-word-stack">
        <span className="app-brand-word">소비일기</span>
        {size === "expanded" ? null : null}
      </span>
    </span>
  );
}

function DotoriStatusPanel({
  vpnStatusLabel,
  connectionStatusLabel,
  autoSyncStatusLabel,
  concurrentStatusLabel,
  otherConnections,
}: {
  vpnStatusLabel: string;
  connectionStatusLabel: string;
  autoSyncStatusLabel: string;
  concurrentStatusLabel: string;
  otherConnections: DotoriPresenceSnapshot["connections"];
}) {
  return (
    <div className="app-sidebar-status-panel">
      <div className="app-sidebar-status-row">
        <strong>VPN</strong>
        <span className={`app-sidebar-status-pill${vpnStatusLabel === "ON" ? " is-online" : " is-offline"}`}>
          {vpnStatusLabel}
        </span>
      </div>
      <div className="app-sidebar-status-row">
        <strong>도토리창고</strong>
        <span className={`app-sidebar-status-pill${connectionStatusLabel === "ON" ? " is-online" : " is-offline"}`}>
          {connectionStatusLabel}
        </span>
      </div>
      <div className="app-sidebar-status-row">
        <strong>자동동기화</strong>
        <span className={`app-sidebar-status-pill${autoSyncStatusLabel === "ON" ? " is-online" : " is-offline"}`}>
          {autoSyncStatusLabel}
        </span>
      </div>
      <div className="app-sidebar-status-row app-sidebar-status-row--full">
        <span className="app-sidebar-status-text">{concurrentStatusLabel}</span>
      </div>
      {otherConnections.length ? (
        <div className="app-sidebar-status-presence">
          {otherConnections.slice(0, 3).map((connection) => (
            <span key={`${connection.clientId}-${connection.lastSeenAt}`} className="app-sidebar-status-presence-chip">
              {connection.username}
              {connection.workspaceName ? ` · ${connection.workspaceName}` : ""}
              {connection.page ? ` · ${connection.page}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AppFrame() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addPerson, createEmptyWorkspace, importState, isReady, state } = useAppState();
  const { showToast } = useToast();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  useThemeMode();
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [dotoriSession, setDotoriSession] = useState<DotoriSyncSession>(() => readDotoriSyncSession());
  const [, setIsDotoriAutoSyncRunning] = useState(false);
  const [dotoriReachability, setDotoriReachability] = useState<DotoriReachabilityState>("idle");
  const [dotoriPresence, setDotoriPresence] = useState<DotoriPresenceSnapshot>({ onlineCount: 0, connections: [] });
  const [dotoriPresenceRenderTick, setDotoriPresenceRenderTick] = useState(0);
  const [dotoriRemoteSyncSignal, setDotoriRemoteSyncSignal] = useState(0);
  const [dotoriRemoteBackupHint, setDotoriRemoteBackupHint] = useState<DotoriBackupMetadata | null>(null);
  const [dotoriPresenceTarget, setDotoriPresenceTarget] = useState<DotoriPresenceTarget>({
    kind: null,
    id: null,
    label: null,
  });
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [guideBeaconState, setGuideBeaconState] = useState<"hidden" | "entering" | "idle">("hidden");
  const [isGuideBeaconMounted, setIsGuideBeaconMounted] = useState(false);
  const [guidePanelExpandSignal, setGuidePanelExpandSignal] = useState(0);
  const [isGuidePanelForceCollapsed, setIsGuidePanelForceCollapsed] = useState(true);
  const [isOnboardingEntering, setIsOnboardingEntering] = useState(false);
  const hasPlayedGuideBeaconIntroRef = useRef(false);
  const hasNormalizedInitialRouteRef = useRef(false);
  const dotoriAutoSyncTimeoutRef = useRef<number | null>(null);
  const dotoriAutoSyncErrorMessageRef = useRef<string | null>(null);
  const dotoriAutoImportRunningRef = useRef(false);
  const dotoriSessionRef = useRef(dotoriSession);
  const localBackupCommitIdRef = useRef<string | null>(null);
  const dotoriClientIdRef = useRef<string>(getDotoriClientId());
  const dotoriPresenceSocketRef = useRef<WebSocket | null>(null);
  const dotoriPresenceReconnectTimeoutRef = useRef<number | null>(null);
  const dotoriPresenceIntentionalCloseRef = useRef(false);
  const dotoriPresencePayloadRef = useRef<{
    clientId: string;
    page: string;
    workspaceName: string | null;
    targetKind: string | null;
    targetId: string | null;
    targetLabel: string | null;
    autoSyncEnabled: boolean;
    dotoriConnected: boolean;
    vpnReachable: boolean;
  } | null>(null);

  const localBackupContent = useMemo(() => createBackupContent(state), [state]);
  const localBackupSummary = useMemo(() => summarizeBackupPayload(localBackupContent), [localBackupContent]);
  const activeWorkspaceName = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
    [state.activeWorkspaceId, state.workspaces],
  );

  useEffect(() => {
    dotoriSessionRef.current = dotoriSession;
  }, [dotoriSession]);

  useEffect(() => {
    localBackupCommitIdRef.current = localBackupSummary.backupCommitId ?? null;
  }, [localBackupSummary.backupCommitId]);

  const dotoriPresencePayload = useMemo(
    () => ({
      clientId: dotoriClientIdRef.current,
      page: getPresencePageLabel(location.pathname),
      workspaceName: activeWorkspaceName,
      targetKind: dotoriPresenceTarget.kind,
      targetId: dotoriPresenceTarget.id,
      targetLabel: dotoriPresenceTarget.label,
      autoSyncEnabled: dotoriSession.autoSyncEnabled,
      dotoriConnected: dotoriSession.connected,
      vpnReachable: dotoriReachability === "online",
    }),
    [
      activeWorkspaceName,
      dotoriPresenceTarget.id,
      dotoriPresenceTarget.kind,
      dotoriPresenceTarget.label,
      dotoriReachability,
      dotoriSession.autoSyncEnabled,
      dotoriSession.connected,
      location.pathname,
    ],
  );

  useEffect(() => {
    dotoriPresencePayloadRef.current = dotoriPresencePayload;
  }, [dotoriPresencePayload]);

  useEffect(() => {
    let frameId = 0;

    const syncTopbar = () => {
      frameId = 0;
    };

    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(syncTopbar);
    };

    syncTopbar();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (state.workspaces.length) return;
    hasPlayedGuideBeaconIntroRef.current = false;
    setIsGuideBeaconMounted(false);
    setGuideBeaconState("hidden");
    setIsGuidePanelForceCollapsed(true);
  }, [state.workspaces.length]);

  useEffect(() => {
    if (!isReady || !state.activeWorkspaceId) return;

    const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
    if (!activeWorkspace) return;

    const pendingSetup = window.sessionStorage.getItem(WORKSPACE_SETUP_KEY);
    try {
      if (pendingSetup) {
        const parsed = JSON.parse(pendingSetup) as { workspaceName?: string; personName?: string };
        const personName = parsed.personName?.trim();
        if (personName) {
          addPerson(activeWorkspace.id, { name: personName, displayName: personName, role: "owner" });
        }
      }
    } catch {
      return;
    } finally {
      if (pendingSetup) {
        window.sessionStorage.removeItem(WORKSPACE_SETUP_KEY);
      }
    }
  }, [addPerson, isReady, state.activeWorkspaceId, state.workspaces]);

  useEffect(() => {
    if (!isReady || !state.activeWorkspaceId) return;
    if (hasPlayedGuideBeaconIntroRef.current) return;

    const guideRuntime = readGuideRuntime(state.activeWorkspaceId);
    const shouldAutoExpandGuidePanel = guideRuntime.replayStepIndex !== null || guideRuntime.flowMode !== "tips";

    hasPlayedGuideBeaconIntroRef.current = true;
    setIsGuideBeaconMounted(false);
    setGuideBeaconState("hidden");
    setIsGuidePanelForceCollapsed(true);

    let frameA = 0;
    let frameB = 0;
    const timers: number[] = [];

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        timers.push(
          window.setTimeout(() => {
            setIsGuideBeaconMounted(true);
            setGuideBeaconState("entering");
          }, 1000),
        );
        timers.push(
          window.setTimeout(() => {
            setGuideBeaconState("idle");
          }, 2900),
        );
        if (shouldAutoExpandGuidePanel) {
          timers.push(
            window.setTimeout(() => {
              setGuidePanelExpandSignal((current) => current + 1);
              setIsGuidePanelForceCollapsed(false);
            }, 3900),
          );
        }
      });
    });

    return () => {
      if (frameA) window.cancelAnimationFrame(frameA);
      if (frameB) window.cancelAnimationFrame(frameB);
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [isReady, state.activeWorkspaceId]);

  useEffect(() => {
    if (!isReady || !state.activeWorkspaceId) return;
    const didCompleteOnboarding = window.sessionStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
    if (!didCompleteOnboarding) return;

    setIsOnboardingEntering(true);
    window.sessionStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    const timerId = window.setTimeout(() => {
      setIsOnboardingEntering(false);
    }, 1400);

    return () => window.clearTimeout(timerId);
  }, [isReady, state.activeWorkspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGuideReset = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId && detail.workspaceId !== state.activeWorkspaceId) return;

      setIsGuideBeaconMounted(true);
      setGuideBeaconState("idle");
      setGuidePanelExpandSignal((current) => current + 1);
      setIsGuidePanelForceCollapsed(false);
    };

    window.addEventListener(GUIDE_V1_RESET_EVENT, handleGuideReset as EventListener);
    return () => window.removeEventListener(GUIDE_V1_RESET_EVENT, handleGuideReset as EventListener);
  }, [state.activeWorkspaceId]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setDotoriPresenceTarget({ kind: null, id: null, label: null });
  }, [location.pathname]);

  useEffect(() => {
    if (!isReady) return;
    if (!state.workspaces.length) return;
    if (hasNormalizedInitialRouteRef.current) return;

    hasNormalizedInitialRouteRef.current = true;

    if (location.pathname !== "/dashboard") {
      navigate("/dashboard", { replace: true });
    }
  }, [isReady, location.pathname, navigate, state.workspaces.length]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.classList.toggle("app-mobile-nav-open", isMobileNavOpen);
    document.documentElement.classList.toggle("app-mobile-nav-open", isMobileNavOpen);

    return () => {
      document.body.classList.remove("app-mobile-nav-open");
      document.documentElement.classList.remove("app-mobile-nav-open");
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSession = () => {
      setDotoriSession(readDotoriSyncSession());
    };

    const handleCustomSync = () => {
      syncSession();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "spending-diary.dotori-sync-session") return;
      syncSession();
    };

    window.addEventListener(DOTORI_SYNC_SESSION_EVENT, handleCustomSync as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DOTORI_SYNC_SESSION_EVENT, handleCustomSync as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!dotoriSession.form.host.trim() || !dotoriSession.form.port.trim() || !dotoriSession.form.username.trim() || !dotoriSession.form.password.trim()) {
      setDotoriReachability("idle");
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    const checkHealth = async () => {
      try {
        await healthCheckDotoriStorage(dotoriSession.form);
        if (!cancelled) {
          setDotoriReachability("online");
        }
      } catch {
        if (!cancelled) {
          setDotoriReachability("offline");
        }
      }
    };

    void checkHealth();
    intervalId = window.setInterval(() => {
      void checkHealth();
    }, DOTORI_HEALTH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dotoriSession.form]);

  useEffect(() => {
    const isConnectionReady =
      dotoriSession.connected &&
      dotoriReachability === "online" &&
      Boolean(
        dotoriSession.form.host.trim() &&
          dotoriSession.form.port.trim() &&
          dotoriSession.form.username.trim() &&
          dotoriSession.form.password.trim(),
      );

    if (!isConnectionReady) {
      dotoriPresenceIntentionalCloseRef.current = true;
      if (dotoriPresenceReconnectTimeoutRef.current) {
        window.clearTimeout(dotoriPresenceReconnectTimeoutRef.current);
        dotoriPresenceReconnectTimeoutRef.current = null;
      }
      if (dotoriPresenceSocketRef.current) {
        dotoriPresenceSocketRef.current.close();
        dotoriPresenceSocketRef.current = null;
      }
      setDotoriPresence({ onlineCount: 0, connections: [] });
      return;
    }

    const socketUrl = createDotoriPresenceSocketUrl(dotoriSession.form);
    const shouldUsePollingFallback =
      typeof window !== "undefined" && window.location.protocol === "https:" && socketUrl.startsWith("ws://");

    if (shouldUsePollingFallback) {
      let cancelled = false;
      let intervalId = 0;

      const sendHeartbeat = async () => {
        try {
          const snapshot = await sendDotoriPresenceHeartbeat(dotoriSession.form, dotoriPresencePayload);
          if (!cancelled) {
            setDotoriPresence({
              ...snapshot,
              connections: [...snapshot.connections],
            });
            setDotoriPresenceRenderTick((current) => current + 1);
          }
        } catch {
          if (!cancelled) {
            setDotoriPresence({ onlineCount: 0, connections: [] });
            setDotoriPresenceRenderTick((current) => current + 1);
          }
        }
      };

      void sendHeartbeat();
      intervalId = window.setInterval(() => {
        void sendHeartbeat();
      }, DOTORI_PRESENCE_HEARTBEAT_INTERVAL_MS);

      return () => {
        cancelled = true;
        window.clearInterval(intervalId);
        void clearDotoriPresence(dotoriSession.form, dotoriClientIdRef.current).catch(() => {});
      };
    }

    const connectPresenceSocket = () => {
      if (dotoriPresenceReconnectTimeoutRef.current) {
        window.clearTimeout(dotoriPresenceReconnectTimeoutRef.current);
        dotoriPresenceReconnectTimeoutRef.current = null;
      }

      const socket = new WebSocket(socketUrl);
      dotoriPresenceIntentionalCloseRef.current = false;
      dotoriPresenceSocketRef.current = socket;

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "auth",
            username: dotoriSession.form.username.trim(),
            password: dotoriSession.form.password,
            ...(dotoriPresencePayloadRef.current ?? {
              clientId: dotoriClientIdRef.current,
              page: "소비일기",
              workspaceName: null,
              targetKind: null,
              targetId: null,
              targetLabel: null,
              autoSyncEnabled: false,
              dotoriConnected: true,
              vpnReachable: true,
            }),
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data || "{}")) as {
            type?: string;
            snapshot?: DotoriPresenceSnapshot;
            metadata?: DotoriBackupMetadata;
            error?: string;
          };
          if (message.type === "presence-snapshot" && message.snapshot) {
            setDotoriPresence({
              ...message.snapshot,
              connections: [...message.snapshot.connections],
            });
            setDotoriPresenceRenderTick((current) => current + 1);
            return;
          }
          if (message.type === "backup-updated" && message.metadata?.fileName) {
            setDotoriRemoteBackupHint(message.metadata);
            setDotoriRemoteSyncSignal((current) => current + 1);
          }
        } catch {
          setDotoriPresence({ onlineCount: 0, connections: [] });
          setDotoriPresenceRenderTick((current) => current + 1);
        }
      });

      socket.addEventListener("close", () => {
        if (dotoriPresenceSocketRef.current === socket) {
          dotoriPresenceSocketRef.current = null;
        }
        setDotoriPresence({ onlineCount: 0, connections: [] });
        setDotoriPresenceRenderTick((current) => current + 1);
        if (!dotoriPresenceIntentionalCloseRef.current) {
          dotoriPresenceReconnectTimeoutRef.current = window.setTimeout(() => {
            connectPresenceSocket();
          }, 1000);
        }
      });

      socket.addEventListener("error", () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      });
    };

    connectPresenceSocket();

    return () => {
      dotoriPresenceIntentionalCloseRef.current = true;
      if (dotoriPresenceReconnectTimeoutRef.current) {
        window.clearTimeout(dotoriPresenceReconnectTimeoutRef.current);
        dotoriPresenceReconnectTimeoutRef.current = null;
      }
      if (dotoriPresenceSocketRef.current) {
        dotoriPresenceSocketRef.current.close();
        dotoriPresenceSocketRef.current = null;
      }
    };
  }, [dotoriPresencePayload, dotoriReachability, dotoriSession.connected, dotoriSession.form]);

  useEffect(() => {
    const socket = dotoriPresenceSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !dotoriSession.connected || dotoriReachability !== "online") {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "update",
        ...dotoriPresencePayload,
      }),
    );
  }, [dotoriPresencePayload, dotoriReachability, dotoriSession.connected]);

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
    showToast,
  ]);

  useEffect(() => {
    if (!isReady || !dotoriSession.connected || !dotoriSession.autoSyncEnabled || dotoriReachability !== "online") {
      return;
    }
    setDotoriRemoteSyncSignal((current) => current + 1);
  }, [dotoriReachability, dotoriSession.autoSyncEnabled, dotoriSession.connected, isReady]);

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

    if (isSameDotoriBackupVersion(dotoriSession.syncedBackup, { fileName: null, savedAt: null, backupCommitId: localBackupSummary.backupCommitId })) {
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
              ...savedBackup,
              backupCommitId: localBackupSummary.backupCommitId,
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
    }, DOTORI_AUTO_SYNC_DEBOUNCE_MS);

    return () => {
      if (dotoriAutoSyncTimeoutRef.current) {
        window.clearTimeout(dotoriAutoSyncTimeoutRef.current);
        dotoriAutoSyncTimeoutRef.current = null;
      }
    };
  }, [dotoriSession, isReady, localBackupContent, localBackupSummary, showToast]);

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

  const desktopHeaderTitle = getDesktopHeaderTitle(location.pathname);
  const otherPresenceConnections = dotoriPresence.connections.filter((connection) => connection.clientId !== dotoriClientIdRef.current);
  const vpnStatusLabel =
    dotoriReachability === "online"
      ? "ON"
      : dotoriReachability === "offline"
        ? "OFF"
        : "OFF";
  const connectionStatusLabel = dotoriSession.connected ? "ON" : "OFF";
  const autoSyncStatusLabel = dotoriSession.autoSyncEnabled
    ? "ON"
    : "OFF";
  const concurrentStatusLabel =
    dotoriReachability !== "online"
      ? "접속 상태 확인 전"
      : otherPresenceConnections.length
        ? `${otherPresenceConnections.length}명 함께 접속 중`
        : "나만 접속 중";

  const closeCreateWorkspaceModal = () => {
    setIsCreateWorkspaceOpen(false);
    setNewWorkspaceName("");
  };

  const submitCreateWorkspace = () => {
    const trimmedName = newWorkspaceName.trim();
    createEmptyWorkspace(trimmedName || undefined);
    closeCreateWorkspaceModal();
  };

  return (
    <DotoriPresenceProvider
      value={{
        presenceConnections: otherPresenceConnections,
        currentTarget: dotoriPresenceTarget,
        setCurrentTarget: setDotoriPresenceTarget,
      }}
    >
    <div className={`app-shell${isOnboardingEntering ? " is-onboarding-entering" : ""}`}>
      <aside className="app-sidebar" aria-label="주요 메뉴">
        <div className="app-sidebar-panel">
          <div className="app-sidebar-header">
            <Link to="/dashboard" className="sidebar-brand-button app-sidebar-brand" onClick={registerUnlockTap} aria-label="소비일기 첫장으로 이동">
              <AppBrandMark size="expanded" />
            </Link>
            <p className="app-sidebar-copy">작은 소비도, 소중한 기억이 되도록.</p>
          </div>

          <div className="app-sidebar-nav">
            <AppSidebarNav
              key={`sidebar-desktop-${dotoriPresenceRenderTick}`}
              isDeveloperModeUnlocked={isDeveloperModeUnlocked}
              presenceConnections={otherPresenceConnections}
            />
          </div>

          <div className="app-sidebar-footer">
            <DotoriStatusPanel
              vpnStatusLabel={vpnStatusLabel}
              connectionStatusLabel={connectionStatusLabel}
              autoSyncStatusLabel={autoSyncStatusLabel}
              concurrentStatusLabel={concurrentStatusLabel}
              otherConnections={otherPresenceConnections}
            />
          </div>
        </div>
      </aside>

      <header className="app-topbar condensed">
        <div className="app-brand-block app-topbar-desktop-copy">
          <div className="app-topbar-title-cluster">
            <div className="app-topbar-title-nav" aria-hidden="true">
              <button type="button" className="app-topbar-title-arrow">‹</button>
              <button type="button" className="app-topbar-title-arrow">›</button>
            </div>
            <strong>{desktopHeaderTitle}</strong>
          </div>
        </div>
        <button
          type="button"
          className={`mobile-nav-toggle${isMobileNavOpen ? " is-open" : ""}`}
          aria-label={isMobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="app-topbar-compact-header">
          <Link
            to="/dashboard"
            className="app-topbar-logo-link app-topbar-mobile-brand"
            aria-label="소비일기 첫장으로 이동"
            onClick={registerUnlockTap}
          >
            <AppBrandMark size="compact" />
          </Link>
        </div>
        <div className="app-topbar-actions">
          <div className="app-topbar-settings-cluster">
            <div className="app-topbar-date-chip">{activeWorkspace.name}</div>
            <Link to="/dashboard" className="app-topbar-ghost-button">
              오늘
            </Link>
            <Link to="/collections/card" className="app-topbar-primary-button">
              + 기록하기
            </Link>
            <NavLink
              to="/settings"
              className={({ isActive }) => `app-topbar-settings-link${isActive ? " active" : ""}`}
              aria-label="설정"
              title="설정"
            >
              설정
            </NavLink>
          </div>
        </div>
      </header>

      <div
        className={`app-mobile-nav-backdrop${isMobileNavOpen ? " is-open" : ""}`}
        aria-hidden={!isMobileNavOpen}
        onClick={() => setIsMobileNavOpen(false)}
      />
      <aside className={`app-mobile-drawer${isMobileNavOpen ? " is-open" : ""}`} aria-hidden={!isMobileNavOpen}>
        <div className="app-mobile-drawer-head">
          <Link
            to="/dashboard"
            className="sidebar-brand-button"
            aria-label="소비일기 첫장으로 이동"
            onClick={() => {
              registerUnlockTap();
              setIsMobileNavOpen(false);
            }}
          >
            <AppBrandMark size="compact" />
          </Link>
        </div>
        <div className="app-mobile-drawer-section">
          <span className="sidebar-kicker">전체 메뉴</span>
          <AppSidebarNav
            key={`sidebar-mobile-${dotoriPresenceRenderTick}`}
            isDeveloperModeUnlocked={isDeveloperModeUnlocked}
            onNavigate={() => setIsMobileNavOpen(false)}
            presenceConnections={otherPresenceConnections}
          />
        </div>
        <div className="app-mobile-drawer-footer">
          <DotoriStatusPanel
            vpnStatusLabel={vpnStatusLabel}
            connectionStatusLabel={connectionStatusLabel}
            autoSyncStatusLabel={autoSyncStatusLabel}
            concurrentStatusLabel={concurrentStatusLabel}
            otherConnections={otherPresenceConnections}
          />
        </div>
      </aside>

      <div className="app-main">
        <main className="app-content">
          <AppGuidePanel
            beaconState={guideBeaconState}
            showBeacon={isGuideBeaconMounted}
            expandSignal={guidePanelExpandSignal}
            forceCollapsed={isGuidePanelForceCollapsed}
          />
          <div className="route-stage">
            <div className="route-page">
              <AppRoutes isDeveloperModeUnlocked={isDeveloperModeUnlocked} lockDeveloperMode={lockDeveloperMode} />
            </div>
          </div>
        </main>
      </div>

      <AppModal
        open={isCreateWorkspaceOpen}
        title="새 가계부 추가"
        description="새 가계부 이름을 입력하면 비어 있는 가계부가 바로 생성됩니다."
        onClose={closeCreateWorkspaceModal}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitCreateWorkspace();
          }}
        >
          <label style={{ gridColumn: "1 / -1" }}>
            가계부 이름
            <input
              autoFocus
              className="form-control"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              placeholder="예: 2026 우리집 가계부"
            />
          </label>
          <div className="d-flex justify-content-end gap-2" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn btn-outline-secondary" onClick={closeCreateWorkspaceModal}>
              취소
            </button>
            <button className="btn btn-primary" type="submit">
              생성
            </button>
          </div>
        </form>
      </AppModal>

    </div>
    </DotoriPresenceProvider>
  );
}

function AppShell() {
  return (
    <HashRouter>
      <AppFrame />
    </HashRouter>
  );
}

export default function App() {
  return (
    <MotionProvider>
      <ToastProvider>
        <AppStateProvider>
          <AppShell />
        </AppStateProvider>
      </ToastProvider>
    </MotionProvider>
  );
}
