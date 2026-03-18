import { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { MotionProvider } from "./motion/MotionProvider";
import { AppGuidePanel } from "./components/AppGuidePanel";
import { AccountsPage } from "./pages/AccountsPage";
import { CardsPage } from "./pages/CardsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DeveloperPage } from "./pages/DeveloperPage";
import { EmptyWorkspaceScreen } from "./pages/EmptyWorkspaceScreen";
import { ImportsPage } from "./pages/ImportsPage";
import { LoadingScreen } from "./pages/LoadingScreen";
import { PeoplePage } from "./pages/PeoplePage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SettlementsPage } from "./pages/SettlementsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AppStateProvider, useAppState } from "./state/AppStateProvider";
import { getActiveWorkspace } from "./state/selectors";
import { ToastProvider } from "./toast/ToastProvider";

const navItems = [
  { to: "/", label: "대시보드", end: true },
  { to: "/transactions", label: "거래" },
  { to: "/people", label: "사람" },
  { to: "/accounts", label: "계좌관리" },
  { to: "/cards", label: "카드관리" },
  { to: "/categories", label: "카테고리" },
  { to: "/imports", label: "업로드" },
  { to: "/reviews", label: "검토함" },
  { to: "/settlements", label: "정산" },
  { to: "/settings", label: "설정" },
  { to: "/dev", label: "개발자" },
];

function SidebarNav() {
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<{ height: number; y: number; visible: boolean }>({
    height: 0,
    y: 0,
    visible: false,
  });

  const activeKey = useMemo(() => {
    const pathname = location.pathname || "/";
    const exact = navItems.find((item) => item.to === pathname);
    if (exact) return exact.to;
    const partial = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
    return partial?.to ?? "/";
  }, [location.pathname]);

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
      setIndicatorStyle({
        height: linkRect.height,
        y: linkRect.top - navRect.top,
        visible: true,
      });
    };

    syncIndicator();
    window.addEventListener("resize", syncIndicator);
    return () => window.removeEventListener("resize", syncIndicator);
  }, [activeKey]);

  return (
    <nav ref={navRef} className="nav flex-column app-nav">
      <div
        className={`app-nav-indicator${indicatorStyle.visible ? " visible" : ""}`}
        style={{
          height: `${indicatorStyle.height}px`,
          transform: `translateY(${indicatorStyle.y}px)`,
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

function AppFrame() {
  const { isReady, setActiveWorkspace, state } = useAppState();

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div>
          <span className="sidebar-kicker">Household Web App</span>
          <h1>가계부 웹앱</h1>
        </div>
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
        <SidebarNav />
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <span className="section-kicker">활성 워크스페이스</span>
            <h2 className="mb-0">{activeWorkspace.name}</h2>
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
        </header>

        <main className="app-content">
          <AppGuidePanel />
          <div className="route-stage">
            <div className="route-page">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/cards" element={<CardsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/imports" element={<ImportsPage />} />
                <Route path="/reviews" element={<ReviewsPage />} />
                <Route path="/settlements" element={<SettlementsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/dev" element={<DeveloperPage />} />
              </Routes>
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
