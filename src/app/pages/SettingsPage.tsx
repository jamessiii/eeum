import { useEffect, useState } from "react";
import { startGuideReplay } from "../../domain/guidance/guideRuntime";
import { formatPercent } from "../../shared/utils/format";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";
import { useThemeMode } from "../useThemeMode";

type ProfileDraftState = {
  targetSavingsRate: string;
  warningSpendRate: string;
  warningFixedCostRate: string;
};

type EditableProfileField = keyof ProfileDraftState;

function createProfileDraft(profile: ReturnType<typeof getWorkspaceScope>["financialProfile"]): ProfileDraftState {
  return {
    targetSavingsRate: String(Math.round((profile?.targetSavingsRate ?? 0) * 100)),
    warningSpendRate: String(Math.round((profile?.warningSpendRate ?? 0) * 100)),
    warningFixedCostRate: String(Math.round((profile?.warningFixedCostRate ?? 0) * 100)),
  };
}

function hasNumericValue(value: string) {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

function formatDraftPercent(value: string) {
  if (!hasNumericValue(value)) return "입력 필요";
  return formatPercent(Number(value) / 100);
}

export function SettingsPage() {
  const { exportState, importState, setFinancialProfile, state } = useAppState();
  const { themeMode, toggleThemeMode } = useThemeMode();
  const workspaceId = state.activeWorkspaceId!;
  const profile = getWorkspaceScope(state, workspaceId).financialProfile;
  const [profileDraft, setProfileDraft] = useState<ProfileDraftState>(() => createProfileDraft(profile));
  const [activeProfileField, setActiveProfileField] = useState<EditableProfileField | null>(null);

  useEffect(() => {
    setProfileDraft(createProfileDraft(profile));
    setActiveProfileField(null);
  }, [workspaceId, profile?.targetSavingsRate, profile?.warningSpendRate, profile?.warningFixedCostRate]);

  const persistProfileDraft = (nextDraft: ProfileDraftState) => {
    setFinancialProfile(workspaceId, {
      monthlyNetIncome: profile?.monthlyNetIncome ?? 0,
      targetSavingsRate: Number(nextDraft.targetSavingsRate || 0) / 100,
      warningSpendRate: Number(nextDraft.warningSpendRate || 0) / 100,
      warningFixedCostRate: Number(nextDraft.warningFixedCostRate || 0) / 100,
    });
  };

  const updateProfileDraft = (field: EditableProfileField, value: string) => {
    setProfileDraft((current) => ({ ...current, [field]: value }));
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

  return (
    <div className="page-stack">
      <section className="settings-shell-card card shadow-sm" data-guide-target="settings-page-overview">
        <div className="settings-shell-header">
          <div>
            <span className="section-kicker">설정</span>
            <h2 className="section-title settings-shell-title">설정</h2>
          </div>
        </div>
        <div className="settings-shell-body">
          <section className="settings-section-block">
            <div className="settings-summary-row">
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
                        aria-label="Save setting"
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
                        aria-label="Edit setting"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <article className="resource-card settings-panel-card">
              <div>
                <span className="section-kicker">백업</span>
                <h3 className="mb-1">데이터 내보내기와 가져오기</h3>
                <p className="mb-0 text-secondary">현재 가계부의 데이터를 JSON 파일로 저장하거나 다시 불러옵니다.</p>
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
            </article>

            <article className="resource-card settings-panel-card">
              <div>
                <span className="section-kicker">앱 관리</span>
                <h3 className="mb-1">테마</h3>
                <p className="mb-0 text-secondary">앱에서 사용할 기본 테마를 전환합니다.</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="theme-toggle-button" onClick={toggleThemeMode}>
                  <span className="theme-toggle-button-label">테마</span>
                  <strong>{themeMode === "dark" ? "Light" : "Dark"}</strong>
                </button>
              </div>
            </article>

            <article className="resource-card settings-panel-card">
              <div>
                <span className="section-kicker">앱 관리</span>
                <h3 className="mb-1">실험실</h3>
                <p className="mb-0 text-secondary">이음 Lab에서 실험 중인 기능과 도구를 새 탭으로 엽니다.</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <a
                  className="btn btn-outline-secondary"
                  href="https://jamessiii.github.io/eeumlab/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  실험실 열기
                </a>
              </div>
            </article>

            <article className="resource-card settings-panel-card">
              <div>
                <span className="section-kicker">가이드</span>
                <h3 className="mb-1">가이드 테스트 시작</h3>
                <p className="mb-0 text-secondary">
                  메인 가이드를 단계별로 다시 재생해서 흐름을 직접 테스트할 수 있습니다. 테스트를 끝내면 실제 진행 상태로 돌아갑니다.
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline-secondary" onClick={() => startGuideReplay(workspaceId)}>
                  테스트 시작
                </button>
              </div>
            </article>
          </section>
        </div>
      </section>
    </div>
  );
}
