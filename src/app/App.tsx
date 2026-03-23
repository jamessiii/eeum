import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { GUIDE_V1_RESET_EVENT, readGuideRuntime } from "../domain/guidance/guideRuntime";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { getWorkspaceHeaderSummary } from "../domain/workspace/summary";
import { MotionProvider } from "./motion/MotionProvider";
import { AppModal } from "./components/AppModal";
import { AppGuidePanel } from "./components/AppGuidePanel";
import { EmptyStateCallout } from "./components/EmptyStateCallout";
import { EmptyWorkspaceScreen, ONBOARDING_COMPLETE_KEY, WORKSPACE_SETUP_KEY } from "./pages/EmptyWorkspaceScreen";
import { LoadingScreen } from "./pages/LoadingScreen";
import { AppStateProvider, useAppState } from "./state/AppStateProvider";
import { getActiveWorkspace, getWorkspaceScope } from "./state/selectors";
import { ToastProvider, useToast } from "./toast/ToastProvider";
import { useThemeMode } from "./useThemeMode";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage").then((module) => ({ default: module.TransactionsPage })),
);
const AccountTransfersPage = lazy(() =>
  import("./pages/AccountTransfersPage").then((module) => ({ default: module.AccountTransfersPage })),
);
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
  {
    to: "/transactions",
    label: "조각모음",
    subItems: [
      { key: "cards", label: "카드조각", to: "/transactions" },
      { key: "transfers", label: "이체조각", to: "/transactions?view=transfers" },
    ],
  },
  {
    to: "/people",
    label: "이음",
    subItems: [
      { key: "assets", label: "자산", to: "/people" },
      { key: "classification", label: "분류", to: "/people?view=classification" },
    ],
  },
  { to: "/settlements", label: "맺음" },
  {
    to: "/",
    label: "기록",
    end: true,
    subItems: [
      { key: "month", label: "달 기록", to: "/" },
      { key: "year", label: "해 기록", to: "/?view=year" },
    ],
  },
];

const navGuideTargetMap: Record<string, string> = {
  "/transactions": "nav-transactions",
  "/people": "nav-people",
  "/settlements": "nav-settlements",
  "/": "nav-dashboard",
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

function AppTopNav() {
  const location = useLocation();

  const activeKey = useMemo<string | null>(() => {
    const pathname = location.pathname || "/";
    if (pathname === "/account-transfers" || pathname === "/imports" || pathname === "/reviews") {
      return "/transactions";
    }
    if (pathname === "/accounts" || pathname === "/cards" || pathname === "/categories") {
      return "/people";
    }
    if (pathname === "/settings" || pathname === "/dev") {
      return null;
    }
    const exact = baseNavItems.find((item) => item.to === pathname);
    if (exact) return exact.to;
    const partial = baseNavItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
    return partial?.to ?? null;
  }, [location.pathname]);

  const activeSubKey = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    if (activeKey === "/transactions") {
      return searchParams.get("view") === "transfers" ? "transfers" : "cards";
    }
    if (activeKey === "/people") {
      return searchParams.get("view") === "classification" ? "classification" : "assets";
    }
    if (activeKey === "/") {
      return searchParams.get("view") === "year" ? "year" : "month";
    }
    return null;
  }, [activeKey, location.search]);

  return (
    <nav className="app-top-nav" data-guide-target="nav-menu">
      {baseNavItems.map((item, index) => (
        <Fragment key={item.to}>
          {index > 0 ? (
            <span className="app-top-nav-group-divider" aria-hidden="true">
              |
            </span>
          ) : null}
          <div className={`app-top-nav-group${item.to === activeKey ? " is-active" : ""}`}>
            <NavLink
              to={item.to}
              end={item.end}
              className="nav-link nav-parent-link"
              data-guide-target={navGuideTargetMap[item.to] ?? undefined}
            >
              {item.label}
            </NavLink>
            {item.to === activeKey && item.subItems?.length ? (
              <div className="app-top-subnav">
                {item.subItems.map((subItem) => (
                  <Fragment key={subItem.key}>
                    <Link
                      to={subItem.to}
                      className={`nav-link nav-sub-link${activeSubKey === subItem.key ? " active" : ""}`}
                    >
                      {subItem.label}
                    </Link>
                  </Fragment>
                ))}
              </div>
            ) : null}
          </div>
        </Fragment>
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
        <Route path="/" element={<RecordsPage />} />
        <Route path="/transactions" element={<CollectionsPage />} />
        <Route path="/account-transfers" element={<Navigate to="/transactions?view=transfers" replace />} />
        <Route path="/people" element={<ConnectionPage />} />
        <Route path="/accounts" element={<Navigate to="/people" replace />} />
        <Route path="/cards" element={<Navigate to="/people" replace />} />
        <Route path="/categories" element={<Navigate to="/people?view=classification" replace />} />
        <Route path="/imports" element={<Navigate to="/transactions" replace />} />
        <Route path="/reviews" element={<Navigate to="/transactions" replace />} />
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

function SettingsIcon() {
  return (
    <svg className="app-topbar-settings-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="10.9" y="1.4" width="2.2" height="4.4" rx="1.1" />
        <rect x="10.9" y="18.2" width="2.2" height="4.4" rx="1.1" />
        <rect x="18.2" y="10.9" width="4.4" height="2.2" rx="1.1" />
        <rect x="1.4" y="10.9" width="4.4" height="2.2" rx="1.1" />
        <rect x="16.7" y="3.4" width="2.2" height="4.4" rx="1.1" transform="rotate(45 17.8 5.6)" />
        <rect x="16.7" y="16.2" width="2.2" height="4.4" rx="1.1" transform="rotate(135 17.8 18.4)" />
        <rect x="5.1" y="16.2" width="2.2" height="4.4" rx="1.1" transform="rotate(-135 6.2 18.4)" />
        <rect x="5.1" y="3.4" width="2.2" height="4.4" rx="1.1" transform="rotate(-45 6.2 5.6)" />
      </g>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 5.35a6.65 6.65 0 1 0 0 13.3a6.65 6.65 0 0 0 0-13.3Zm0 3.75a2.9 2.9 0 1 1 0 5.8a2.9 2.9 0 0 1 0-5.8Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CollectionsPage() {
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") === "transfers" ? "transfers" : "cards";
  return activeView === "cards" ? <TransactionsPage /> : <AccountTransfersPage />;
}

function ConnectionPage() {
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") === "classification" ? "classification" : "assets";
  return activeView === "assets" ? <PeoplePage /> : <CategoriesPage />;
}

function RecordsPage() {
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") === "year" ? "year" : "month";

  return (
    <>
      {activeView === "month" ? (
        <DashboardPage />
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
        className="board-case-title-input workspace-name-input"
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
  onEdit,
  className,
  titleTag = "h2",
}: {
  name: string;
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
        onDoubleClick={onEdit}
        title="더블클릭하면 이름 수정"
      >
        {content}
      </button>
      <button
        type="button"
        className="board-case-edit-button workspace-name-edit-button"
        onClick={onEdit}
        aria-label="가계부 이름 수정"
        title="가계부 이름 수정"
      >
        <EditIcon />
      </button>
    </div>
  );
}

function AppFrame() {
  const { addPerson, createEmptyWorkspace, isReady, renameWorkspace, setActiveWorkspace, state } = useAppState();
  const { isDeveloperModeUnlocked, registerUnlockTap, lockDeveloperMode } = useDeveloperMode();
  useThemeMode();
  const [isEditingWorkspaceName, setIsEditingWorkspaceName] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
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
    if (!isEditingWorkspaceName && state.activeWorkspaceId) {
      const currentWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
      if (currentWorkspace) setWorkspaceNameDraft(currentWorkspace.name);
    }
  }, [isEditingWorkspaceName, state.activeWorkspaceId, state.workspaces]);

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
  const workspaceBadgeClass =
    activeWorkspace.source === "demo"
      ? "text-bg-info"
      : activeWorkspace.source === "imported"
        ? "text-bg-success"
        : null;
  const workspaceBadgeLabel =
    activeWorkspace.source === "demo" ? "데모" : activeWorkspace.source === "imported" ? "업로드됨" : null;

  return (
    <div className={`app-shell${isOnboardingEntering ? " is-onboarding-entering" : ""}`}>
      <header className="app-topbar condensed">
        <div className="app-topbar-main">
          <div className="app-brand-block">
            <span className="sidebar-kicker">이음</span>
            <button type="button" className="sidebar-brand-button">
              <h1>이음</h1>
            </button>
            <p className="sidebar-copy">이음은 빠르게 기록하고 자연스럽게 정리하는 생활 가계부 서비스입니다.</p>
          </div>
          <div className="app-topbar-compact-header">
            <span className="section-kicker">현재 가계부</span>
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
                  onEdit={openWorkspaceNameEditor}
                  className="workspace-name-row-inline"
                  titleTag="strong"
                />
              )}
              {workspaceBadgeClass && workspaceBadgeLabel ? (
                <span className={`badge ${workspaceBadgeClass}`}>{workspaceBadgeLabel}</span>
              ) : null}
            </div>
            <span className="app-topbar-compact-meta">
              카드내역 {headerSummary.transactionsCount}건 · 검토 {headerSummary.openReviewCount}건 · 사용자 {headerSummary.peopleCount}명
            </span>
          </div>
          <div className="app-topbar-actions">
            <AppTopNav />
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
            <NavLink
              to="/settings"
              className={({ isActive }) => `app-topbar-settings-link${isActive ? " active" : ""}`}
              aria-label="설정"
              title="설정"
              onClick={registerUnlockTap}
            >
              <SettingsIcon />
            </NavLink>
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
