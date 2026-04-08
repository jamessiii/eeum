import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { GUIDE_V1_RESET_EVENT, readGuideRuntime } from "../domain/guidance/guideRuntime";
import { Link, useNavigate } from "react-router-dom";
import { MotionProvider } from "./motion/MotionProvider";
import { AppModal } from "./components/AppModal";
import { AppGuidePanel } from "./components/AppGuidePanel";
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

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const baseNavItems: NavItem[] = [
  { to: "/dashboard", label: "첫장" },
  { to: "/connections/assets", label: "자산" },
  { to: "/connections/categories", label: "분류" },
  { to: "/settlements", label: "이체" },
  { to: "/loops", label: "루프스테이션" },
  { to: "/records/moon", label: "달기록" },
  { to: "/records/sun", label: "해기록" },
];
const developerNavItem: NavItem = { to: "/dev", label: "DEV" };

const navGuideTargetMap: Record<string, string> = {
  "/dashboard": "nav-dashboard",
  "/connections/assets": "nav-sub-assets",
  "/connections/categories": "nav-sub-categories",
  "/settlements": "nav-sub-transfers",
  "/loops": "nav-sub-loops",
  "/records/moon": "nav-sub-moon",
  "/records/sun": "nav-sub-sun",
  "/dev": "nav-dev",
  "/settings": "nav-settings",
};

const navIconKeyMap: Record<string, string> = {
  "/dashboard": "home",
  "/connections/assets": "link",
  "/connections/categories": "link",
  "/settlements": "flow",
  "/loops": "flow",
  "/records/moon": "note",
  "/records/sun": "note",
  "/dev": "lab",
  "/settings": "settings",
};

function getDesktopHeaderTitle(pathname: string) {
  if (pathname === "/dashboard" || pathname.startsWith("/records/moon")) {
    const today = new Date();
    return `${today.getFullYear()}년 ${today.getMonth() + 1}월`;
  }
  if (pathname.startsWith("/records/sun")) return "해 기록";
  if (pathname.startsWith("/connections")) return "연결";
  if (pathname.startsWith("/flows") || pathname === "/settlements" || pathname.startsWith("/loops")) return "흐름";
  if (pathname.startsWith("/collections")) return "기록";
  if (pathname === "/settings") return "설정";
  return "소비일기";
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
  if (pathname.startsWith("/records/moon") || pathname === "/dashboard") return pathname === "/dashboard" ? "/dashboard" : "/records/moon";
  if (pathname.startsWith("/records/sun")) return "/records/sun";
  if (pathname === "/dev") return "/dev";
  const exact = navItems.find((item) => item.to === pathname);
  if (exact) return exact.to;
  const partial = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return partial?.to ?? null;
}

function AppSidebarNav({
  isDeveloperModeUnlocked,
  onNavigate,
}: {
  isDeveloperModeUnlocked: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const navItems = useMemo(
    () => (isDeveloperModeUnlocked ? [...baseNavItems, developerNavItem] : baseNavItems),
    [isDeveloperModeUnlocked],
  );
  const activeKey = useMemo(() => getActiveMainKey(location.pathname || "/", navItems), [location.pathname, navItems]);

  return (
    <nav className="sidebar-nav" aria-label="주요 메뉴" data-guide-target="nav-menu">
      {[...navItems, { to: "/settings", label: "설정" }].map((item) => (
        <div key={item.to} className={`sidebar-nav-section${activeKey === item.to ? " is-active" : ""}`}>
          <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive: isLinkActive }) => `sidebar-nav-parent sidebar-nav-link${isLinkActive || activeKey === item.to ? " is-active" : ""}`}
            data-guide-target={navGuideTargetMap[item.to] ?? undefined}
            onClick={onNavigate}
          >
            <span className={`nav-sidebar-icon nav-sidebar-icon--${navIconKeyMap[item.to] ?? "dot"}`} aria-hidden="true" />
            <span className="sidebar-nav-parent-label">{item.label}</span>
          </NavLink>
        </div>
      ))}
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
          element={<SectionIndexRedirect defaultPath="/records/moon" alternatePath="/records/sun" viewKey="view" alternateValue="year" />}
        />
        <Route path="/records/moon" element={<RecordsPage view="moon" />} />
        <Route path="/records/sun" element={<RecordsPage view="sun" />} />
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

function RecordsPage({ view }: { view: "moon" | "sun" }) {
  return (
    <>
      {view === "moon" ? (
        <DashboardPage mode="moon" />
      ) : (
        <>
          <DashboardPage mode="sun" />
          <LoopAnnualPage />
        </>
      )}
    </>
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

function AppFrame() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addPerson, createEmptyWorkspace, isReady, state } = useAppState();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  useThemeMode();
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [guideBeaconState, setGuideBeaconState] = useState<"hidden" | "entering" | "idle">("hidden");
  const [isGuideBeaconMounted, setIsGuideBeaconMounted] = useState(false);
  const [guidePanelExpandSignal, setGuidePanelExpandSignal] = useState(0);
  const [isGuidePanelForceCollapsed, setIsGuidePanelForceCollapsed] = useState(true);
  const [isOnboardingEntering, setIsOnboardingEntering] = useState(false);
  const hasPlayedGuideBeaconIntroRef = useRef(false);
  const hasNormalizedInitialRouteRef = useRef(false);

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

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

  const desktopHeaderTitle = getDesktopHeaderTitle(location.pathname);

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
            <AppSidebarNav isDeveloperModeUnlocked={isDeveloperModeUnlocked} />
          </div>

          <div className="app-sidebar-footer">
            <div className="app-sidebar-note">
              <img className="app-sidebar-note-image" src={`${ASSET_BASE}slogan.png`} alt="기록이 쌓이면, 마음의 흐름이 보여요" />
            </div>
            <div className="app-sidebar-banner">
              <img className="app-sidebar-banner-image" src={`${ASSET_BASE}dotori-banner.png`} alt="도토리창고 배너" />
            </div>
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
          <AppSidebarNav isDeveloperModeUnlocked={isDeveloperModeUnlocked} onNavigate={() => setIsMobileNavOpen(false)} />
        </div>
        <div className="app-mobile-drawer-footer">
          <div className="app-sidebar-note">
            <img className="app-sidebar-note-image" src={`${ASSET_BASE}slogan.png`} alt="기록이 쌓이면, 마음의 흐름이 보여요" />
          </div>
          <div className="app-sidebar-banner">
            <img className="app-sidebar-banner-image" src={`${ASSET_BASE}dotori-banner.png`} alt="도토리창고 배너" />
          </div>
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
