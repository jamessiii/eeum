import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { getWorkspaceHeaderSummary } from "../domain/workspace/summary";
import { MotionProvider } from "./motion/MotionProvider";
import { AppGuidePanel } from "./components/AppGuidePanel";
import { EmptyWorkspaceScreen } from "./pages/EmptyWorkspaceScreen";
import { LoadingScreen } from "./pages/LoadingScreen";
import { AppStateProvider, useAppState } from "./state/AppStateProvider";
import { getActiveWorkspace, getWorkspaceScope } from "./state/selectors";
import { ToastProvider, useToast } from "./toast/ToastProvider";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage").then((module) => ({ default: module.TransactionsPage })),
);
const ImportsPage = lazy(() => import("./pages/ImportsPage").then((module) => ({ default: module.ImportsPage })));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage").then((module) => ({ default: module.ReviewsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const DeveloperPage = lazy(() => import("./pages/DeveloperPage").then((module) => ({ default: module.DeveloperPage })));

const DEVELOPER_MODE_KEY = "household-webapp.developer-mode";
const THEME_STORAGE_KEY = "household-webapp.theme";

type ThemeMode = "light" | "dark";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const baseNavItems: NavItem[] = [
  { to: "/", label: "대시보드", end: true },
  { to: "/transactions", label: "거래" },
  { to: "/imports", label: "업로드" },
  { to: "/reviews", label: "검토함" },
  { to: "/settings", label: "설정" },
  { to: "/dev", label: "개발자" },
];

function useDeveloperMode() {
  const [isDeveloperModeUnlocked, setIsDeveloperModeUnlocked] = useState(false);
  const [unlockAttempts, setUnlockAttempts] = useState<number[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    const stored = window.localStorage.getItem(DEVELOPER_MODE_KEY);
    setIsDeveloperModeUnlocked(stored === "unlocked");
  }, []);

  const registerUnlockTap = () => {
    if (isDeveloperModeUnlocked) return;

    const now = Date.now();
    const nextAttempts = [...unlockAttempts.filter((attempt) => now - attempt < 1800), now];
    setUnlockAttempts(nextAttempts);

    if (nextAttempts.length >= 5) {
      window.localStorage.setItem(DEVELOPER_MODE_KEY, "unlocked");
      setIsDeveloperModeUnlocked(true);
      setUnlockAttempts([]);
      showToast("개발자 모드가 해금되었습니다.", "success");
    }
  };

  const lockDeveloperMode = () => {
    window.localStorage.removeItem(DEVELOPER_MODE_KEY);
    setIsDeveloperModeUnlocked(false);
    setUnlockAttempts([]);
    showToast("개발자 모드를 다시 숨겼습니다.", "info");
  };

  return { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode };
}

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getPreferredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.body.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  return {
    themeMode,
    toggleThemeMode: () => setThemeMode((current) => (current === "dark" ? "light" : "dark")),
  };
}

function AppTopNav({ isDeveloperModeUnlocked }: { isDeveloperModeUnlocked: boolean }) {
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<{ width: number; x: number; visible: boolean }>({
    width: 0,
    x: 0,
    visible: false,
  });

  const navItems = useMemo(
    () => baseNavItems.filter((item) => isDeveloperModeUnlocked || item.to !== "/dev"),
    [isDeveloperModeUnlocked],
  );

  const activeKey = useMemo(() => {
    const pathname = location.pathname || "/";
    if (pathname === "/people" || pathname === "/accounts" || pathname === "/cards" || pathname === "/categories") {
      return "/settings";
    }
    const exact = navItems.find((item) => item.to === pathname);
    if (exact) return exact.to;
    const partial = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
    return partial?.to ?? "/";
  }, [location.pathname, navItems]);

  useEffect(() => {
    const syncIndicator = () => {
      const nav = navRef.current;
      const activeLink = linkRefs.current[activeKey];
      if (!nav || !activeLink) {
        setIndicatorStyle((current) => ({ ...current, visible: false }));
        return;
      }

      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      const navStyles = window.getComputedStyle(nav);
      const navPaddingLeft = Number.parseFloat(navStyles.paddingLeft) || 0;
      setIndicatorStyle({
        width: linkRect.width,
        x: linkRect.left - navRect.left - navPaddingLeft,
        visible: true,
      });
    };

    syncIndicator();
    window.addEventListener("resize", syncIndicator);
    return () => window.removeEventListener("resize", syncIndicator);
  }, [activeKey]);

  return (
    <nav ref={navRef} className="app-top-nav">
      <div
        className={`app-top-nav-indicator${indicatorStyle.visible ? " visible" : ""}`}
        style={{
          width: `${indicatorStyle.width}px`,
          transform: `translateX(${indicatorStyle.x}px)`,
        }}
      />
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          ref={(element) => {
            linkRefs.current[item.to] = element;
          }}
          to={item.to}
          end={item.end}
          className="nav-link"
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/people" element={<Navigate to="/settings?tab=people" replace />} />
        <Route path="/accounts" element={<Navigate to="/settings?tab=accounts" replace />} />
        <Route path="/cards" element={<Navigate to="/settings?tab=cards" replace />} />
        <Route path="/categories" element={<Navigate to="/settings?tab=categories" replace />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/settlements" element={<Navigate to="/" replace />} />
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

function AppFrame() {
  const { isReady, setActiveWorkspace, state } = useAppState();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  const { themeMode, toggleThemeMode } = useThemeMode();
  const [isTopbarCondensed, setIsTopbarCondensed] = useState(false);

  useEffect(() => {
    let frameId = 0;

    const syncTopbar = () => {
      frameId = 0;
      setIsTopbarCondensed(window.scrollY > 24);
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

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;
  const scope = getWorkspaceScope(state, activeWorkspace.id);
  const headerSummary = getWorkspaceHeaderSummary({
    imports: scope.imports,
    reviews: scope.reviews,
    transactions: scope.transactions,
    peopleCount: scope.people.length,
  });
  const latestImport = headerSummary.latestImport;
  const workspaceBadgeClass =
    activeWorkspace.source === "demo"
      ? "text-bg-info"
      : activeWorkspace.source === "imported"
        ? "text-bg-success"
        : "text-bg-secondary";
  const workspaceBadgeLabel =
    activeWorkspace.source === "demo"
      ? "?뚯뒪??紐⑤뱶"
      : activeWorkspace.source === "imported"
        ? "?낅줈???곗씠??"
        : "鍮?紐⑤뱶";

  return (
    <div className="app-shell">
      <header className={`app-topbar${isTopbarCondensed ? " condensed" : ""}`}>
        <div className="app-topbar-main">
          <div className="app-brand-block">
            <span className="sidebar-kicker">Household Web App</span>
            <button type="button" className="sidebar-brand-button" onClick={registerUnlockTap}>
              <h1>가계부 웹앱</h1>
            </button>
            <p className="sidebar-copy">빠르게 기록하고 바로 정리하는 흐름입니다.</p>
          </div>
          <div className="app-topbar-compact-header">
            <span className="section-kicker">Current Workspace</span>
            <div className="app-topbar-workspace-row">
              <strong>{activeWorkspace.name}</strong>
              <span className={`badge ${workspaceBadgeClass}`}>{workspaceBadgeLabel}</span>
            </div>
            <span className="app-topbar-compact-meta">
              거래 {headerSummary.transactionsCount}건 · 검토 {headerSummary.openReviewCount}건 · 사용자 {headerSummary.peopleCount}명
            </span>
          </div>
          <div className="app-topbar-actions">
            <select
              className="form-select workspace-select"
              value={activeWorkspace.id}
              onChange={(event) => setActiveWorkspace(event.target.value)}
            >
              {state.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <button type="button" className="theme-toggle-button" onClick={toggleThemeMode}>
              <span className="theme-toggle-button-label">테마</span>
              <strong>{themeMode === "dark" ? "Light" : "Dark"}</strong>
            </button>
          </div>
          {isTopbarCondensed ? <AppTopNav isDeveloperModeUnlocked={isDeveloperModeUnlocked} /> : null}
        </div>
        {!isTopbarCondensed ? <AppTopNav isDeveloperModeUnlocked={isDeveloperModeUnlocked} /> : null}
      </header>

      <div className="app-main">
        <section className="app-header">
          <div className="app-header-copy">
            <span className="section-kicker">활성 워크스페이스</span>
            <h2 className="mb-0">{activeWorkspace.name}</h2>
            <p className="app-header-meta">
              거래 {headerSummary.transactionsCount}건 · 검토 {headerSummary.openReviewCount}건 · 사용자 {headerSummary.peopleCount}명            
              {latestImport ? ` · 최근 업로드 ${latestImport.importedAt.slice(0, 10)}` : ""}
            </p>
          </div>
          <span
            className={`badge ${
              activeWorkspace.source === "demo"
                ? "text-bg-info"
                : activeWorkspace.source === "imported"
                  ? "text-bg-success"
                  : "text-bg-secondary"
            }`}
          >
            {activeWorkspace.source === "demo"
              ? "테스트 모드"
              : activeWorkspace.source === "imported"
                ? "업로드 데이터"
                : "빈 모드"}
          </span>
        </section>

        <main className="app-content">
          <AppGuidePanel />
          <div className="route-stage">
            <div className="route-page">
              <AppRoutes
                isDeveloperModeUnlocked={isDeveloperModeUnlocked}
                lockDeveloperMode={lockDeveloperMode}
              />
            </div>
          </div>
        </main>
      </div>
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
