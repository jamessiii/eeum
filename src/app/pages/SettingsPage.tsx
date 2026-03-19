import { Link, useSearchParams } from "react-router-dom";
import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { AccountsPage } from "./AccountsPage";
import { CardsPage } from "./CardsPage";
import { CategoriesPage } from "./CategoriesPage";
import { PeoplePage } from "./PeoplePage";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const SETTINGS_TABS = [
  { id: "profile", label: "기준값" },
  { id: "people", label: "사용자" },
  { id: "accounts", label: "계좌" },
  { id: "cards", label: "카드" },
  { id: "categories", label: "분류" },
  { id: "backup", label: "백업" },
  { id: "app", label: "앱 관리" },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

function isSettingsTab(value: string | null): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export function SettingsPage() {
  const { exportState, importState, resetApp, setFinancialProfile, state } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = state.activeWorkspaceId!;
  const profile = getWorkspaceScope(state, workspaceId).financialProfile;
  const currentTab = isSettingsTab(searchParams.get("tab")) ? searchParams.get("tab") : "profile";
  const hasBaseline = Boolean(profile?.monthlyNetIncome);

  const renderTabContent = () => {
    if (currentTab === "people") return <PeoplePage />;
    if (currentTab === "accounts") return <AccountsPage />;
    if (currentTab === "cards") return <CardsPage />;
    if (currentTab === "categories") return <CategoriesPage />;
    if (currentTab === "backup") {
      return (
        <section className="card shadow-sm">
          <div className="section-head">
            <div>
              <span className="section-kicker">백업 / 복원</span>
              <h2 className="section-title">데이터 백업</h2>
            </div>
          </div>
          <div className="settings-compact-copy">
            <p className="text-secondary mb-0">현재 워크스페이스를 JSON으로 내보내거나 복원합니다.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => exportState()}>
              전체 데이터 내보내기
            </button>
            <label className="btn btn-outline-primary">
              백업 파일 가져오기
              <input
                hidden
                type="file"
                accept=".json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importState(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </section>
      );
    }

    if (currentTab === "app") {
      return (
        <section className="card shadow-sm">
          <div className="section-head">
            <div>
              <span className="section-kicker">앱 관리</span>
              <h2 className="section-title">초기화와 상태 확인</h2>
            </div>
          </div>
          {!profile?.monthlyNetIncome ? (
            <EmptyStateCallout
              kicker="기준선 필요"
              title="먼저 월 수입을 입력해주세요"
              description="기준값부터 넣으면 진단이 더 정확해집니다."
            />
          ) : (
            <div className="settings-compact-copy">
              <p className="mb-2 text-secondary">현재 기준선 요약</p>
              <div className="resource-grid">
                <article className="resource-card">
                  <h3>월 순수입</h3>
                  <p className="mb-0 text-secondary">{formatCurrency(profile.monthlyNetIncome)}</p>
                </article>
                <article className="resource-card">
                  <h3>지출 경고 기준</h3>
                  <p className="mb-0 text-secondary">{formatPercent(profile.warningSpendRate)}</p>
                </article>
              </div>
            </div>
          )}
          <div className="d-flex justify-content-end">
            <button className="btn btn-outline-danger" onClick={() => void resetApp()}>
              전체 데이터 초기화
            </button>
          </div>
        </section>
      );
    }

    return (
        <section className="card shadow-sm">
          <div className="section-head">
            <div>
              <span className="section-kicker">재무 기준값</span>
            <h2 className="section-title">월 수입과 경고선</h2>
            </div>
          </div>
        <div className="settings-summary-row">
          <article className="resource-card">
            <h3>월 순수입</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatCurrency(profile?.monthlyNetIncome ?? 0) : "아직 입력 전"}
            </p>
          </article>
          <article className="resource-card">
            <h3>목표 저축률</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.targetSavingsRate ?? 0) : "입력 필요"}
            </p>
          </article>
          <article className="resource-card">
            <h3>지출 경고 기준</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.warningSpendRate ?? 0) : "입력 필요"}
            </p>
          </article>
          <article className="resource-card">
            <h3>고정지출 경고 기준</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.warningFixedCostRate ?? 0) : "입력 필요"}
            </p>
          </article>
        </div>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setFinancialProfile(workspaceId, {
              monthlyNetIncome: Number(formData.get("monthlyNetIncome") || 0),
              targetSavingsRate: Number(formData.get("targetSavingsRate") || 0) / 100,
              warningSpendRate: Number(formData.get("warningSpendRate") || 0) / 100,
              warningFixedCostRate: Number(formData.get("warningFixedCostRate") || 0) / 100,
            });
          }}
        >
          <label>
            <span>월 순수입</span>
            <input name="monthlyNetIncome" type="number" className="form-control" defaultValue={profile?.monthlyNetIncome ?? 0} />
          </label>
          <label>
            <span>목표 저축률 (%)</span>
            <input name="targetSavingsRate" type="number" className="form-control" defaultValue={Math.round((profile?.targetSavingsRate ?? 0) * 100)} />
          </label>
          <label>
            <span>지출 경고 기준 (%)</span>
            <input name="warningSpendRate" type="number" className="form-control" defaultValue={Math.round((profile?.warningSpendRate ?? 0) * 100)} />
          </label>
          <label>
            <span>고정지출 경고 기준 (%)</span>
            <input
              name="warningFixedCostRate"
              type="number"
              className="form-control"
              defaultValue={Math.round((profile?.warningFixedCostRate ?? 0) * 100)}
            />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              기준 저장
            </button>
          </div>
        </form>
        {hasBaseline ? (
          <CompletionBanner
            className="mt-4"
            title="기준값 저장이 끝났습니다"
            description="이제 거래나 정산에서 바로 확인하면 됩니다."
            actions={
              <>
                <Link to="/settlements" className="btn btn-outline-primary btn-sm">
                  정산 보기
                </Link>
                <Link to="/transactions" className="btn btn-outline-secondary btn-sm">
                  거래 보기
                </Link>
              </>
            }
          />
        ) : null}
      </section>
    );
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm settings-shell-card">
        <div className="section-head">
          <div>
            <span className="section-kicker">설정</span>
            <h2 className="section-title">기본 설정</h2>
          </div>
        </div>
        <div className="settings-tab-strip">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab-button${currentTab === tab.id ? " active" : ""}`}
              onClick={() => setSearchParams(tab.id === "profile" ? {} : { tab: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
      {renderTabContent()}
    </div>
  );
}
