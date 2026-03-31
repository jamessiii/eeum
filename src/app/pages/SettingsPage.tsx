import { useEffect, useMemo, useState } from "react";
import { completeGuideStepAction } from "../../domain/guidance/guideRuntime";
import { getCategoryLabel } from "../../domain/categories/meta";
import { formatPercent } from "../../shared/utils/format";
import { AppModal } from "../components/AppModal";
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
  const scope = getWorkspaceScope(state, workspaceId);
  const profile = scope.financialProfile;
  const [profileDraft, setProfileDraft] = useState<ProfileDraftState>(() => createProfileDraft(profile));
  const [activeProfileField, setActiveProfileField] = useState<EditableProfileField | null>(null);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const categoryMap = useMemo(() => new Map(scope.categories.map((category) => [category.id, category])), [scope.categories]);
  const loopPriorityOptions = useMemo(
    () =>
      scope.categories
        .filter((category) => category.categoryType === "category" && !category.isHidden && category.direction !== "income")
        .map((category) => ({
          id: category.id,
          label: getCategoryLabel(category, categoryMap),
          name: category.name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "ko")),
    [categoryMap, scope.categories],
  );
  const selectedLoopPriorityCategoryIds = profile?.loopPriorityCategoryIds ?? [];

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
      loopPriorityCategoryIds: profile?.loopPriorityCategoryIds ?? [],
    });
  };

  const updateLoopPriorityCategories = (nextCategoryIds: string[]) => {
    setFinancialProfile(workspaceId, {
      monthlyNetIncome: profile?.monthlyNetIncome ?? 0,
      targetSavingsRate: profile?.targetSavingsRate ?? 0,
      warningSpendRate: profile?.warningSpendRate ?? 0,
      warningFixedCostRate: profile?.warningFixedCostRate ?? 0,
      loopPriorityCategoryIds: nextCategoryIds,
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
            <div className="settings-summary-row" data-guide-target="settings-profile-summary">
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
                        aria-label={`${card.title} 저장`}
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
                        aria-label={`${card.title} 수정`}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <article className="resource-card settings-panel-card settings-panel-card--actions" data-guide-target="settings-backup">
              <div className="settings-panel-copy">
                <span className="section-kicker">백업</span>
                <h3 className="mb-1">데이터 내보내기와 가져오기</h3>
                <p className="mb-0 text-secondary">현재 가계부 데이터를 JSON 파일로 저장하거나 다시 불러옵니다.</p>
              </div>
              <div className="settings-panel-actions">
                <button className="btn btn-primary" onClick={() => setIsExportConfirmOpen(true)}>
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

            <article className="resource-card settings-panel-card settings-panel-card--actions" data-guide-target="settings-theme">
              <div className="settings-panel-copy">
                <span className="section-kicker">화면 관리</span>
                <h3 className="mb-1">테마</h3>
                <p className="mb-0 text-secondary">앱에서 사용할 기본 테마를 전환합니다.</p>
              </div>
              <div className="settings-panel-actions">
                <button
                  type="button"
                  className="theme-toggle-button"
                  data-guide-target="settings-theme-toggle"
                  onClick={() => {
                    toggleThemeMode();
                    completeGuideStepAction(workspaceId, themeMode === "dark" ? "settings-theme-return" : "settings-theme");
                  }}
                >
                  <span className="theme-toggle-button-label">테마</span>
                  <strong>{themeMode === "dark" ? "Light" : "Dark"}</strong>
                </button>
              </div>
            </article>

            <article className="resource-card settings-panel-card" data-guide-target="settings-loop-priority">
              <div className="settings-panel-copy">
                <span className="section-kicker">루프 추천</span>
                <h3 className="mb-1">루프 추천 카테고리</h3>
                <p className="mb-0 text-secondary">여기서 고른 카테고리 안에서만 루프스테이션 추천을 보여줍니다.</p>
              </div>
              <div className="settings-loop-priority-list">
                {loopPriorityOptions.map((option) => {
                  const isSelected = selectedLoopPriorityCategoryIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`settings-loop-priority-chip${isSelected ? " is-selected" : ""}`}
                      onClick={() =>
                        updateLoopPriorityCategories(
                          isSelected
                            ? selectedLoopPriorityCategoryIds.filter((categoryId) => categoryId !== option.id)
                            : [...selectedLoopPriorityCategoryIds, option.id],
                        )
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      </section>
      <AppModal
        open={isExportConfirmOpen}
        title="전체 데이터 내보내기"
        description="전체 데이터를 백업 파일로 내보내시겠습니까?"
        onClose={() => setIsExportConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIsExportConfirmOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                exportState();
                setIsExportConfirmOpen(false);
              }}
            >
              내보내기
            </button>
          </>
        }
      >
        <p className="mb-0 text-secondary">현재 워크스페이스 데이터가 JSON 백업 파일로 저장됩니다.</p>
      </AppModal>
    </div>
  );
}
