import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { MotionProvider } from "./motion/MotionProvider";
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

function AppShell() {
  const { isReady, setActiveWorkspace, state } = useAppState();

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

  return (
    <HashRouter>
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
          <nav className="nav flex-column app-nav">
            <NavLink to="/" end className="nav-link">
              대시보드
            </NavLink>
            <NavLink to="/transactions" className="nav-link">
              거래
            </NavLink>
            <NavLink to="/people" className="nav-link">
              사람
            </NavLink>
            <NavLink to="/accounts" className="nav-link">
              계좌관리
            </NavLink>
            <NavLink to="/cards" className="nav-link">
              카드관리
            </NavLink>
            <NavLink to="/categories" className="nav-link">
              카테고리
            </NavLink>
            <NavLink to="/imports" className="nav-link">
              업로드
            </NavLink>
            <NavLink to="/reviews" className="nav-link">
              검토함
            </NavLink>
            <NavLink to="/settlements" className="nav-link">
              정산
            </NavLink>
            <NavLink to="/settings" className="nav-link">
              설정
            </NavLink>
            <NavLink to="/dev" className="nav-link">
              개발자
            </NavLink>
          </nav>
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
