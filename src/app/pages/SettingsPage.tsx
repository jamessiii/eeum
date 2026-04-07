import { useEffect, useMemo, useRef, useState } from "react";
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
  if (!hasNumericValue(value)) return "?낅젰 ?꾩슂";
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
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
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
      title: "紐⑺몴 ?異뺣쪧",
      preview: formatDraftPercent(profileDraft.targetSavingsRate),
      placeholder: "20",
    },
    {
      key: "warningSpendRate",
      title: "吏異?寃쎄퀬 湲곗?",
      preview: formatDraftPercent(profileDraft.warningSpendRate),
      placeholder: "80",
    },
    {
      key: "warningFixedCostRate",
      title: "怨좎젙吏異?寃쎄퀬 湲곗?",
      preview: formatDraftPercent(profileDraft.warningFixedCostRate),
      placeholder: "55",
    },
  ];

  return (
    <div className="page-stack">
      <section className="settings-shell-card page-section" data-guide-target="settings-page-overview">
        <div className="settings-shell-header">
          <div>
            <span className="section-kicker">?ㅼ젙</span>
            <h2 className="section-title settings-shell-title">?ㅼ젙</h2>
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
                        ??
                      </button>
                    </div>
                  ) : (
                    <div className="settings-profile-display-row">
                      <p className="settings-profile-value-static">{card.preview}</p>
                      <button
                        type="button"
                        className="board-case-edit-button settings-profile-edit-button"
                        onClick={() => setActiveProfileField(card.key)}
                        aria-label={`${card.title} ?섏젙`}
                      >
                        ??
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <article className="resource-card settings-panel-card settings-panel-card--actions" data-guide-target="settings-backup">
              <div className="settings-panel-copy">
                <span className="section-kicker">諛깆뾽</span>
                <h3 className="mb-1">데이터 내보내기와 가져오기</h3>
                <p className="mb-0 text-secondary">?꾩옱 媛怨꾨? ?곗씠?곕? JSON ?뚯씪濡???ν븯嫄곕굹 ?ㅼ떆 遺덈윭?듬땲??</p>
              </div>
              <div className="settings-panel-actions">
                <button className="btn btn-primary" onClick={() => setIsExportConfirmOpen(true)}>
                  ?꾩껜 ?곗씠???대낫?닿린
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => backupImportInputRef.current?.click()}
                >
                  諛깆뾽 ?뚯씪 媛?몄삤湲?
                </button>
                <input
                  ref={backupImportInputRef}
                  hidden
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      const isJsonFile = file.name.toLowerCase().endsWith(".json");
                      if (!isJsonFile) {
                        window.alert("JSON 諛깆뾽 ?뚯씪留?媛?몄삱 ???덉뼱??");
                        event.currentTarget.value = "";
                        return;
                      }
                      void importState(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </article>

            <article className="resource-card settings-panel-card settings-panel-card--actions" data-guide-target="settings-theme">
              <div className="settings-panel-copy">
                <span className="section-kicker">화면 관리</span>
                <h3 className="mb-1">?뚮쭏</h3>
                <p className="mb-0 text-secondary">?깆뿉???ъ슜??湲곕낯 ?뚮쭏瑜??꾪솚?⑸땲??</p>
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
                  <span className="theme-toggle-button-label">?뚮쭏</span>
                  <strong>{themeMode === "dark" ? "Light" : "Dark"}</strong>
                </button>
              </div>
            </article>

            <article className="resource-card settings-panel-card" data-guide-target="settings-loop-priority">
              <div className="settings-panel-copy">
                <span className="section-kicker">猷⑦봽 異붿쿇</span>
                <h3 className="mb-1">猷⑦봽 異붿쿇 移댄뀒怨좊━</h3>
                <p className="mb-0 text-secondary">?ш린??怨좊Ⅸ 移댄뀒怨좊━ ?덉뿉?쒕쭔 猷⑦봽?ㅽ뀒?댁뀡 異붿쿇??蹂댁뿬以띾땲??</p>
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
        title="?꾩껜 ?곗씠???대낫?닿린"
        description="?꾩껜 ?곗씠?곕? 諛깆뾽 ?뚯씪濡??대낫?댁떆寃좎뒿?덇퉴?"
        onClose={() => setIsExportConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIsExportConfirmOpen(false)}>
              痍⑥냼
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                exportState();
                setIsExportConfirmOpen(false);
              }}
            >
              ?대낫?닿린
            </button>
          </>
        }
      >
        <p className="mb-0 text-secondary">?꾩옱 ?뚰겕?ㅽ럹?댁뒪 ?곗씠?곌? JSON 諛깆뾽 ?뚯씪濡???λ맗?덈떎.</p>
      </AppModal>
    </div>
  );
}
