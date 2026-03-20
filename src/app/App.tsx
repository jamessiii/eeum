import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { CSSProperties } from "react";
import { getWorkspaceHeaderSummary } from "../domain/workspace/summary";
import { MotionProvider } from "./motion/MotionProvider";
import { AppModal } from "./components/AppModal";
import { AppGuidePanel } from "./components/AppGuidePanel";
import { EmptyWorkspaceScreen, WORKSPACE_SETUP_KEY } from "./pages/EmptyWorkspaceScreen";
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
const CREATE_WORKSPACE_OPTION = "__create_workspace__";

type ThemeMode = "light" | "dark";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const baseNavItems: NavItem[] = [
  { to: "/", label: "대시보드", end: true },
  { to: "/transactions", label: "거래내역" },
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
      showToast("개발자 모드가 잠금 해제되었습니다.", "success");
    }
  };

  const lockDeveloperMode = () => {
    window.localStorage.removeItem(DEVELOPER_MODE_KEY);
    setIsDeveloperModeUnlocked(false);
    setUnlockAttempts([]);
    showToast("개발자 모드를 다시 잠갔습니다.", "info");
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

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M4 20l4.2-1 9.5-9.5-3.2-3.2L5 15.8 4 20zm12-15.4l3.2 3.2 1.1-1.1a1.5 1.5 0 000-2.1l-1.1-1.1a1.5 1.5 0 00-2.1 0L16 4.6z"
        fill="currentColor"
      />
    </svg>
  );
}

function WorkspaceNameEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  inline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  inline?: boolean;
}) {
  return (
    <div className={`workspace-name-editor${inline ? " workspace-name-editor-inline" : ""}`}>
      <input
        autoFocus
        className="form-control workspace-name-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSubmit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}

function WorkspaceNameDisplay({
  name,
  onUnlock,
  onEdit,
  className,
  titleTag = "h2",
}: {
  name: string;
  onUnlock: () => void;
  onEdit: () => void;
  className?: string;
  titleTag?: "h2" | "strong";
}) {
  const content = titleTag === "strong" ? <strong>{name}</strong> : <h2 className="mb-0">{name}</h2>;

  return (
    <div className={`workspace-name-row${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="sidebar-brand-button workspace-name-trigger"
        onClick={onUnlock}
        onDoubleClick={onEdit}
        title="5번 누르면 개발자 모드 해금, 더블클릭하면 이름 수정"
      >
        {content}
      </button>
      <button
        type="button"
        className="workspace-name-edit-button"
        onClick={onEdit}
        aria-label="가계부 이름 수정"
        title="가계부 이름 수정"
      >
        <EditIcon />
      </button>
    </div>
  );
}

function GuideArrivalCue({ onDone }: { onDone: () => void }) {
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<"gather" | "travel">("gather");

  useEffect(() => {
    let frameId = 0;
    let attempts = 0;

    const resolveTarget = () => {
      const panel = document.querySelector<HTMLElement>('[data-guide-anchor="panel"]');
      const fab = document.querySelector<HTMLElement>('[data-guide-anchor="fab"]');
      const anchor = panel ?? fab;

      if (!anchor) {
        attempts += 1;
        if (attempts < 20) {
          frameId = window.requestAnimationFrame(resolveTarget);
          return;
        }
        onDone();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      setTarget({
        x: rect.left + rect.width * 0.5,
        y: rect.top + Math.min(rect.height * 0.42, 72),
      });
    };

    frameId = window.requestAnimationFrame(resolveTarget);
    return () => window.cancelAnimationFrame(frameId);
  }, [onDone]);

  useEffect(() => {
    if (!target) return;

    const travelTimer = window.setTimeout(() => setPhase("travel"), 720);
    const doneTimer = window.setTimeout(onDone, 2280);
    return () => {
      window.clearTimeout(travelTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone, target]);

  if (!target) return null;

  return (
    <div className="guide-arrival-overlay" aria-hidden="true">
      <div
        className={`guide-arrival-orb guide-arrival-orb-${phase}`}
        style={
          {
            "--guide-target-x": `${target.x}px`,
            "--guide-target-y": `${target.y}px`,
          } as CSSProperties
        }
      >
        <span className="guide-arrival-core" />
        <span className="guide-arrival-particle particle-a" />
        <span className="guide-arrival-particle particle-b" />
        <span className="guide-arrival-particle particle-c" />
        <span className="guide-arrival-particle particle-d" />
        <span className="guide-arrival-particle particle-e" />
      </div>
      <span
        className={`guide-arrival-target ${phase === "travel" ? "is-active" : ""}`}
        style={
          {
            "--guide-target-x": `${target.x}px`,
            "--guide-target-y": `${target.y}px`,
          } as CSSProperties
        }
      />
    </div>
  );
}

function AppFrame() {
  const { addPerson, createEmptyWorkspace, isReady, renameWorkspace, setActiveWorkspace, state } = useAppState();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  const { themeMode, toggleThemeMode } = useThemeMode();
  const [isTopbarCondensed, setIsTopbarCondensed] = useState(false);
  const [isEditingWorkspaceName, setIsEditingWorkspaceName] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [isGuideCueActive, setIsGuideCueActive] = useState(false);

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

  useEffect(() => {
    if (!isEditingWorkspaceName && state.activeWorkspaceId) {
      const currentWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
      if (currentWorkspace) setWorkspaceNameDraft(currentWorkspace.name);
    }
  }, [isEditingWorkspaceName, state.activeWorkspaceId, state.workspaces]);

  useEffect(() => {
    if (!isReady || !state.activeWorkspaceId) return;

    const pendingSetup = window.sessionStorage.getItem(WORKSPACE_SETUP_KEY);
    if (!pendingSetup) return;

    const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
    if (!activeWorkspace) return;

    try {
      const parsed = JSON.parse(pendingSetup) as { workspaceName?: string; personName?: string };
      const personName = parsed.personName?.trim();
      if (personName) {
        addPerson(activeWorkspace.id, { name: personName, displayName: personName, role: "owner" });
      }
      window.setTimeout(() => setIsGuideCueActive(true), 180);
    } catch {
      return;
    } finally {
      window.sessionStorage.removeItem(WORKSPACE_SETUP_KEY);
    }
  }, [addPerson, isReady, state.activeWorkspaceId, state.workspaces]);

  if (!isReady) return <LoadingScreen />;
  if (!state.workspaces.length) return <EmptyWorkspaceScreen />;

  const activeWorkspace = getActiveWorkspace(state);
  if (!activeWorkspace) return <EmptyWorkspaceScreen />;

  const openWorkspaceNameEditor = () => {
    setWorkspaceNameDraft(activeWorkspace.name);
    setIsEditingWorkspaceName(true);
  };

  const closeWorkspaceNameEditor = () => {
    setWorkspaceNameDraft(activeWorkspace.name);
    setIsEditingWorkspaceName(false);
  };

  const submitWorkspaceName = () => {
    const trimmedName = workspaceNameDraft.trim();
    if (!trimmedName) {
      closeWorkspaceNameEditor();
      return;
    }
    if (trimmedName !== activeWorkspace.name) {
      renameWorkspace(activeWorkspace.id, trimmedName);
    }
    setIsEditingWorkspaceName(false);
  };

  const closeCreateWorkspaceModal = () => {
    setIsCreateWorkspaceOpen(false);
    setNewWorkspaceName("");
  };

  const submitCreateWorkspace = () => {
    const trimmedName = newWorkspaceName.trim();
    createEmptyWorkspace(trimmedName || undefined);
    closeCreateWorkspaceModal();
  };

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
      ? "데모"
      : activeWorkspace.source === "imported"
        ? "업로드됨"
        : "빈 작업공간";

  return (
    <div className="app-shell">
      <header className={`app-topbar${isTopbarCondensed ? " condensed" : ""}`}>
        <div className="app-topbar-main">
          <div className="app-brand-block">
            <span className="sidebar-kicker">Household Web App</span>
            <button type="button" className="sidebar-brand-button" onClick={registerUnlockTap}>
              <h1>가계부 웹앱</h1>
            </button>
            <p className="sidebar-copy">빠르게 기록하고 자연스럽게 정리하는 생활 가계부입니다.</p>
          </div>
          <div className="app-topbar-compact-header">
            <span className="section-kicker">Current Workspace</span>
            <div className="app-topbar-workspace-row">
              {isEditingWorkspaceName ? (
                <WorkspaceNameEditor
                  value={workspaceNameDraft}
                  onChange={setWorkspaceNameDraft}
                  onSubmit={submitWorkspaceName}
                  onCancel={closeWorkspaceNameEditor}
                  inline
                />
              ) : (
                <WorkspaceNameDisplay
                  name={activeWorkspace.name}
                  onUnlock={registerUnlockTap}
                  onEdit={openWorkspaceNameEditor}
                  className="workspace-name-row-inline"
                  titleTag="strong"
                />
              )}
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
            <span className="section-kicker">활성 작업공간</span>
            {isEditingWorkspaceName ? (
              <WorkspaceNameEditor
                value={workspaceNameDraft}
                onChange={setWorkspaceNameDraft}
                onSubmit={submitWorkspaceName}
                onCancel={closeWorkspaceNameEditor}
              />
            ) : (
              <WorkspaceNameDisplay
                name={activeWorkspace.name}
                onUnlock={registerUnlockTap}
                onEdit={openWorkspaceNameEditor}
              />
            )}
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
              ? "데모"
              : activeWorkspace.source === "imported"
                ? "업로드됨"
                : "빈 작업공간"}
          </span>
        </section>

        <main className="app-content">
          <AppGuidePanel />
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
        description="새 워크스페이스 이름을 입력하면 비어 있는 가계부가 바로 생성됩니다."
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

      {isGuideCueActive ? <GuideArrivalCue onDone={() => setIsGuideCueActive(false)} /> : null}
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
