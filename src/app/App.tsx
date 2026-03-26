import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { GUIDE_V1_RESET_EVENT, readGuideRuntime } from "../domain/guidance/guideRuntime";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { MotionProvider } from "./motion/MotionProvider";
import { AppModal } from "./components/AppModal";
import { AppGuidePanel } from "./components/AppGuidePanel";
import { EmptyStateCallout } from "./components/EmptyStateCallout";
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
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const DeveloperPage = lazy(() => import("./pages/DeveloperPage").then((module) => ({ default: module.DeveloperPage })));

const DEVELOPER_MODE_KEY = "household-webapp.developer-mode";
const CREATE_WORKSPACE_OPTION = "__create_workspace__";

type NavSubItem = {
  key: string;
  label: string;
  to: string;
};

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  subItems?: NavSubItem[];
};

const baseNavItems: NavItem[] = [
  { to: "/dashboard", label: "첫장" },
  {
    to: "/collections",
    label: "조각",
    subItems: [
      { key: "income", label: "수입", to: "/collections/income" },
      { key: "card", label: "결제내역", to: "/collections/card" },
    ],
  },
  {
    to: "/connections",
    label: "이음",
    subItems: [
      { key: "assets", label: "자산", to: "/connections/assets" },
      { key: "categories", label: "분류", to: "/connections/categories" },
    ],
  },
  { to: "/settlements", label: "흐름" },
  {
    to: "/records",
    label: "기록",
    end: true,
    subItems: [
      { key: "moon", label: "달 기록", to: "/records/moon" },
      { key: "sun", label: "해 기록", to: "/records/sun" },
    ],
  },
];
const developerNavItem: NavItem = { to: "/dev", label: "DEV" };

const navGuideTargetMap: Record<string, string> = {
  "/dashboard": "nav-dashboard",
  "/collections": "nav-collections",
  "/connections": "nav-connections",
  "/settlements": "nav-settlements",
  "/records": "nav-records",
};

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

function AppTopNav({ isDeveloperModeUnlocked }: { isDeveloperModeUnlocked: boolean }) {
  const location = useLocation();
  const navItems = useMemo(
    () => (isDeveloperModeUnlocked ? [...baseNavItems, developerNavItem] : baseNavItems),
    [isDeveloperModeUnlocked],
  );
  const [openSubnavKey, setOpenSubnavKey] = useState<string | null>(null);

  const activeKey = useMemo<string | null>(() => {
    const pathname = location.pathname || "/";
    if (
      pathname === "/dashboard"
    ) {
      return "/dashboard";
    }
    if (
      pathname === "/" ||
      pathname.startsWith("/collections") ||
      pathname === "/transactions" ||
      pathname === "/account-transfers" ||
      pathname === "/imports" ||
      pathname === "/reviews"
    ) {
      return "/collections";
    }
    if (
      pathname.startsWith("/connections") ||
      pathname === "/people" ||
      pathname === "/accounts" ||
      pathname === "/cards" ||
      pathname === "/categories"
    ) {
      return "/connections";
    }
    if (pathname.startsWith("/records")) {
      return "/records";
    }
    if (pathname === "/settings") {
      return null;
    }
    const exact = navItems.find((item) => item.to === pathname);
    if (exact) return exact.to;
    const partial = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
    return partial?.to ?? null;
  }, [location.pathname, navItems]);

  const activeSubKey = useMemo(() => {
    if (activeKey === "/collections") {
      if (location.pathname === "/account-transfers" || location.pathname.startsWith("/collections/transfer")) {
        return "transfer";
      }
      if (location.pathname.startsWith("/collections/income")) {
        return "income";
      }
      return "card";
    }
    if (activeKey === "/connections") {
      return location.pathname === "/categories" || location.pathname.startsWith("/connections/categories") ? "categories" : "assets";
    }
    if (activeKey === "/records") {
      return location.pathname.startsWith("/records/sun") ? "sun" : "moon";
    }
    return null;
  }, [activeKey, location.pathname]);

  useEffect(() => {
    setOpenSubnavKey(null);
  }, [location.pathname, location.search]);

  return (
    <nav className="app-top-nav" data-guide-target="nav-menu">
      {navItems.map((item, index) => {
        const subItems = item.subItems ?? [];
        const hasSubnav = subItems.length > 0;
        const isSubnavOpen = openSubnavKey === item.to;

        return (
          <Fragment key={item.to}>
            {index > 0 ? (
              <span className="app-top-nav-group-divider" aria-hidden="true">
                |
              </span>
            ) : null}
            <div
              className={`app-top-nav-group${hasSubnav ? " has-subnav" : ""}${item.to === activeKey ? " is-active" : ""}${isSubnavOpen ? " is-subnav-open" : ""}`}
              onMouseEnter={hasSubnav ? () => setOpenSubnavKey(item.to) : undefined}
              onMouseLeave={
                hasSubnav
                  ? (event) => {
                      const nextTarget = event.relatedTarget;
                      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                        setOpenSubnavKey((current) => (current === item.to ? null : current));
                      }
                    }
                  : undefined
              }
              onFocusCapture={hasSubnav ? () => setOpenSubnavKey(item.to) : undefined}
              onBlurCapture={
                hasSubnav
                  ? (event) => {
                      const nextTarget = event.relatedTarget;
                      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                        setOpenSubnavKey((current) => (current === item.to ? null : current));
                      }
                    }
                  : undefined
              }
            >
              {hasSubnav ? (
                <button
                  type="button"
                  className={`nav-link nav-parent-link nav-parent-button${item.to === activeKey ? " active" : ""}`}
                  data-guide-target={navGuideTargetMap[item.to] ?? undefined}
                  aria-haspopup="true"
                  aria-expanded={isSubnavOpen}
                >
                  {item.label}
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={`nav-link nav-parent-link${item.to === activeKey ? " active" : ""}`}
                  data-guide-target={navGuideTargetMap[item.to] ?? undefined}
                >
                  {item.label}
                </NavLink>
              )}
              {hasSubnav ? (
                <div className="app-top-subnav" aria-label={`${item.label} 하위 메뉴`}>
                  {subItems.map((subItem) => (
                    <Fragment key={subItem.key}>
                      <Link
                        to={subItem.to}
                        className={`nav-link nav-sub-link${activeSubKey === subItem.key ? " active" : ""}`}
                        aria-current={activeSubKey === subItem.key ? "page" : undefined}
                        onClick={() => setOpenSubnavKey(null)}
                      >
                        {subItem.label}
                      </Link>
                    </Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          </Fragment>
        );
      })}
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
        <div className="page-stack">
          <EmptyStateCallout
            kicker="해 기록"
            title="한 해의 흐름을 곧 더 길게 돌아볼 수 있어요"
            description="지금은 달 기록을 중심으로 보여주고 있어요. 해 기록은 한 해의 소비 흐름과 맺음의 변화를 차분히 모아볼 수 있게 이어서 준비할게요."
          />
        </div>
      )}
    </>
  );
}

function AppFrame() {
  const { addPerson, createEmptyWorkspace, isReady, setActiveWorkspace, state } = useAppState();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  useThemeMode();
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [guideBeaconState, setGuideBeaconState] = useState<"hidden" | "entering" | "idle">("hidden");
  const [isGuideBeaconMounted, setIsGuideBeaconMounted] = useState(false);
  const [guidePanelExpandSignal, setGuidePanelExpandSignal] = useState(0);
  const [isGuidePanelForceCollapsed, setIsGuidePanelForceCollapsed] = useState(true);
  const [isOnboardingEntering, setIsOnboardingEntering] = useState(false);
  const hasPlayedGuideBeaconIntroRef = useRef(false);

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

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

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
      <header className="app-topbar condensed">
        <div className="app-topbar-main">
          <div className="app-brand-block">
            <span className="sidebar-kicker">이음</span>
            <button type="button" className="sidebar-brand-button" onClick={registerUnlockTap}>
              <h1>이음</h1>
            </button>
            <p className="sidebar-copy">이음은 빠르게 기록하고 자연스럽게 정리하는 생활 가계부 서비스입니다.</p>
          </div>
          <div className="app-topbar-compact-header">
            <Link to="/collections/card" className="app-topbar-logo-link" aria-label="이음 결제내역으로 이동" onClick={registerUnlockTap}>
              <img className="app-topbar-logo-image" src={`${import.meta.env.BASE_URL}logo.png`} alt="이음" />
            </Link>
          </div>
          <div className="app-topbar-actions">
            <AppTopNav isDeveloperModeUnlocked={isDeveloperModeUnlocked} />
            <select
              className="form-select workspace-select"
              value={activeWorkspace.id}
              onChange={(event) => {
                if (event.target.value === CREATE_WORKSPACE_OPTION) {
                  setNewWorkspaceName("");
                  setIsCreateWorkspaceOpen(true);
                  return;
                }
                setActiveWorkspace(event.target.value);
              }}
            >
              {state.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value={CREATE_WORKSPACE_OPTION}>+ 새 가계부 추가...</option>
            </select>
            <div className="app-topbar-settings-cluster">
              <span className="app-topbar-settings-divider" aria-hidden="true">
                |
              </span>
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
        </div>
      </header>

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
