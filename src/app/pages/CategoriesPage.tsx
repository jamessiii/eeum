import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BoardCase, BoardCaseSection } from "../components/BoardCase";
import { AppModal } from "../components/AppModal";
import { AppSelect } from "../components/AppSelect";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";
import { getCategoryGroups, getChildCategories, getHiddenCategories } from "../../domain/categories/meta";
import { getMotionStyle } from "../../shared/utils/motion";
import type { Category } from "../../shared/types/models";

type CategoryDraftState = {
  name: string;
  fixedOrVariable: Category["fixedOrVariable"];
};

type DragItem =
  | { categoryId: string; categoryType: "group"; isHidden: boolean }
  | { categoryId: string; categoryType: "category"; parentCategoryId: string | null; isHidden: boolean };

const EMPTY_CATEGORY_DRAFT: CategoryDraftState = {
  name: "",
  fixedOrVariable: "variable",
};

let transparentDragImage: HTMLCanvasElement | null = null;

function createCategoryDraft(category?: Category | null): CategoryDraftState {
  if (!category) return EMPTY_CATEGORY_DRAFT;
  return {
    name: category.name,
    fixedOrVariable: category.fixedOrVariable,
  };
}

function createSequentialLabel(baseLabel: string, existingLabels: string[]) {
  const normalizedLabels = new Set(existingLabels.map((label) => label.trim()).filter(Boolean));
  if (!normalizedLabels.has(baseLabel)) return baseLabel;
  let suffix = 2;
  while (normalizedLabels.has(`${baseLabel} ${suffix}`)) suffix += 1;
  return `${baseLabel} ${suffix}`;
}

function getInsertIndexByHorizontalPointer(event: React.DragEvent<HTMLElement>, baseIndex: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? baseIndex + 1 : baseIndex;
}

function getInsertIndexByVerticalPointer(event: React.DragEvent<HTMLElement>, baseIndex: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? baseIndex + 1 : baseIndex;
}

function getTransparentDragImage() {
  if (typeof document === "undefined") return null;
  if (!transparentDragImage) {
    transparentDragImage = document.createElement("canvas");
    transparentDragImage.width = 1;
    transparentDragImage.height = 1;
  }
  return transparentDragImage;
}

export function CategoriesPage({ embedded = false }: { embedded?: boolean }) {
  const { addCategory, deleteCategory, moveCategory, resetCategoriesToDefaults, state, updateCategory } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categoryMap = useMemo(() => new Map(scope.categories.map((category) => [category.id, category])), [scope.categories]);
  const groups = useMemo(() => getCategoryGroups(scope.categories), [scope.categories]);
  const hiddenCategories = useMemo(() => getHiddenCategories(scope.categories), [scope.categories]);
  const suppressClickRef = useRef(false);

  const [inlineEditingGroupId, setInlineEditingGroupId] = useState<string | null>(null);
  const [pendingInlineGroupName, setPendingInlineGroupName] = useState<string | null>(null);
  const [createChildGroupId, setCreateChildGroupId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [inlineGroupName, setInlineGroupName] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraftState>(EMPTY_CATEGORY_DRAFT);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<"hide" | "delete" | null>(null);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const [isDragOverlayActive, setIsDragOverlayActive] = useState(false);
  const dragOverlayTimeoutRef = useRef<number | null>(null);
  const dragOverlayEnterTimeoutRef = useRef<number | null>(null);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const dragGhostOffsetRef = useRef({ x: 0, y: 0 });
  const [isHiddenPanelOpen, setIsHiddenPanelOpen] = useState(false);
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<string | null>(null);
  const [isResetDefaultsModalOpen, setIsResetDefaultsModalOpen] = useState(false);

  const editingCategory = editingCategoryId ? categoryMap.get(editingCategoryId) ?? null : null;
  const createChildGroup = createChildGroupId ? categoryMap.get(createChildGroupId) ?? null : null;
  const pendingDeleteCategory = pendingDeleteCategoryId ? categoryMap.get(pendingDeleteCategoryId) ?? null : null;

  useEffect(() => {
    if (dragItem) {
      if (dragOverlayTimeoutRef.current) {
        window.clearTimeout(dragOverlayTimeoutRef.current);
        dragOverlayTimeoutRef.current = null;
      }
      if (dragOverlayEnterTimeoutRef.current) {
        window.clearTimeout(dragOverlayEnterTimeoutRef.current);
        dragOverlayEnterTimeoutRef.current = null;
      }
      setIsDragOverlayVisible(true);
      setIsDragOverlayActive(false);
      dragOverlayEnterTimeoutRef.current = window.setTimeout(() => {
        setIsDragOverlayActive(true);
        dragOverlayEnterTimeoutRef.current = null;
      }, 32);
      return;
    }

    setIsDragOverlayActive(false);
    dragOverlayTimeoutRef.current = window.setTimeout(() => {
      setIsDragOverlayVisible(false);
      dragOverlayTimeoutRef.current = null;
    }, 540);

    return () => {
      if (dragOverlayTimeoutRef.current) {
        window.clearTimeout(dragOverlayTimeoutRef.current);
        dragOverlayTimeoutRef.current = null;
      }
      if (dragOverlayEnterTimeoutRef.current) {
        window.clearTimeout(dragOverlayEnterTimeoutRef.current);
        dragOverlayEnterTimeoutRef.current = null;
      }
    };
  }, [dragItem]);

  useEffect(() => {
    if (!dragItem || !dragGhostRef.current) return;

    const handleDragOver = (event: DragEvent) => {
      if (!dragGhostRef.current) return;
      dragGhostRef.current.style.left = `${event.clientX - dragGhostOffsetRef.current.x}px`;
      dragGhostRef.current.style.top = `${event.clientY - dragGhostOffsetRef.current.y}px`;
    };

    window.addEventListener("dragover", handleDragOver, true);
    return () => window.removeEventListener("dragover", handleDragOver, true);
  }, [dragItem]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    dragGhostRef.current.classList.toggle("is-drop-target-hide", activeDropZone === "hide");
    dragGhostRef.current.classList.toggle("is-drop-target-delete", activeDropZone === "delete");
  }, [activeDropZone]);

  const createGroupSection = () => {
    const name = createSequentialLabel("새 그룹", groups.map((group) => group.name));
    addCategory(workspaceId, { name, categoryType: "group", isHidden: false });
    setPendingInlineGroupName(name);
  };

  const startInlineGroupEdit = (group: Category) => {
    setInlineEditingGroupId(group.id);
    setInlineGroupName(group.name);
  };

  const stopInlineGroupEdit = () => {
    setInlineEditingGroupId(null);
    setInlineGroupName("");
  };

  const submitInlineGroupEdit = () => {
    if (!inlineEditingGroupId) return;
    const targetGroup = categoryMap.get(inlineEditingGroupId);
    const name = inlineGroupName.trim();
    if (!targetGroup || !name) {
      stopInlineGroupEdit();
      return;
    }
    if (name !== targetGroup.name) {
      updateCategory(workspaceId, targetGroup.id, { name });
    }
    stopInlineGroupEdit();
  };

  useEffect(() => {
    if (!pendingInlineGroupName) return;
    const createdGroup = groups.find((group) => group.name === pendingInlineGroupName);
    if (!createdGroup) return;
    startInlineGroupEdit(createdGroup);
    setPendingInlineGroupName(null);
  }, [groups, pendingInlineGroupName]);

  const openCreateChildModal = (group: Category) => {
    setCategoryDraft(EMPTY_CATEGORY_DRAFT);
    setCreateChildGroupId(group.id);
  };

  const openEditCategoryModal = (category: Category) => {
    if (suppressClickRef.current) return;
    setCategoryDraft(createCategoryDraft(category));
    setEditingCategoryId(category.id);
  };

  const closeCategoryModal = () => {
    setCreateChildGroupId(null);
    setEditingCategoryId(null);
    setCategoryDraft(EMPTY_CATEGORY_DRAFT);
  };

  const resetDragState = () => {
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
    setDragItem(null);
    setActiveDropZone(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const getCategoryTreeIds = (categoryId: string) => {
    const category = categoryMap.get(categoryId);
    if (!category) return [];
    if (category.categoryType === "group") {
      return scope.categories.filter((item) => item.id === categoryId || item.parentCategoryId === categoryId).map((item) => item.id);
    }
    return [categoryId];
  };

  const getCategoryUsageCount = (categoryId: string) => {
    const ids = new Set(getCategoryTreeIds(categoryId));
    return scope.transactions.filter((transaction) => transaction.categoryId && ids.has(transaction.categoryId)).length;
  };

  const applyHiddenState = (categoryId: string, isHidden: boolean) => {
    const targetIds = getCategoryTreeIds(categoryId);
    targetIds.forEach((id) => updateCategory(workspaceId, id, { isHidden }));
  };

  const requestDeleteCategory = (categoryId: string) => {
    const usageCount = getCategoryUsageCount(categoryId);
    if (usageCount > 0) {
      setPendingDeleteCategoryId(categoryId);
      return;
    }
    deleteCategory(workspaceId, categoryId);
  };

  const startDrag = (item: DragItem, event: React.DragEvent<HTMLElement>) => {
    suppressClickRef.current = true;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.categoryId);
    const sourceElement = event.currentTarget as HTMLElement;
    const dragImage = getTransparentDragImage();
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, 0, 0);
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }

    const sourceRect = sourceElement.getBoundingClientRect();
    dragGhostOffsetRef.current = {
      x: event.clientX - sourceRect.left,
      y: event.clientY - sourceRect.top,
    };

    const ghostElement = sourceElement.cloneNode(true) as HTMLElement;
    ghostElement.classList.add("category-drag-ghost");
    ghostElement.style.position = "fixed";
    ghostElement.style.left = `${event.clientX - dragGhostOffsetRef.current.x}px`;
    ghostElement.style.top = `${event.clientY - dragGhostOffsetRef.current.y}px`;
    ghostElement.style.width = `${sourceRect.width}px`;
    ghostElement.style.minWidth = `${sourceRect.width}px`;
    ghostElement.style.maxWidth = `${sourceRect.width}px`;
    ghostElement.style.pointerEvents = "none";
    ghostElement.style.margin = "0";
    ghostElement.style.opacity = "1";
    ghostElement.style.transform = "none";
    ghostElement.style.filter = "none";
    ghostElement.style.zIndex = "9999";
    ghostElement.style.backdropFilter = "none";
    ghostElement.style.contentVisibility = "visible";
    ghostElement.style.contain = "none";
    ghostElement.style.containIntrinsicSize = "auto";
    document.body.appendChild(ghostElement);
    dragGhostRef.current = ghostElement;

    setDragItem(item);
  };

  const handleGroupDrop = (event: React.DragEvent<HTMLElement>, groupIndex: number) => {
    if (!dragItem || dragItem.categoryType !== "group") return;
    event.preventDefault();
    const targetIndex = getInsertIndexByVerticalPointer(event, groupIndex);
    if (dragItem.isHidden) {
      applyHiddenState(dragItem.categoryId, false);
    }
    moveCategory(workspaceId, dragItem.categoryId, null, targetIndex);
    resetDragState();
  };

  const handleCategoryDrop = (event: React.DragEvent<HTMLElement>, groupId: string, categoryIndex: number) => {
    if (!dragItem || dragItem.categoryType !== "category") return;
    event.preventDefault();
    const targetIndex = getInsertIndexByHorizontalPointer(event, categoryIndex);
    if (dragItem.isHidden) {
      updateCategory(workspaceId, dragItem.categoryId, { isHidden: false, parentCategoryId: groupId });
    }
    moveCategory(workspaceId, dragItem.categoryId, groupId, targetIndex);
    resetDragState();
  };

  const handleCategoryAppendDrop = (event: React.DragEvent<HTMLElement>, groupId: string, itemCount: number) => {
    if (!dragItem || dragItem.categoryType !== "category") return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (dragItem.isHidden) {
      updateCategory(workspaceId, dragItem.categoryId, { isHidden: false, parentCategoryId: groupId });
    }
    moveCategory(workspaceId, dragItem.categoryId, groupId, itemCount);
    resetDragState();
  };

  const getDragStateClassName = (categoryId: string) =>
    `${dragItem?.categoryId === categoryId ? " is-dragging" : ""}${
      dragItem?.categoryId === categoryId && activeDropZone === "hide" ? " is-drop-target-hide" : ""
    }${dragItem?.categoryId === categoryId && activeDropZone === "delete" ? " is-drop-target-delete" : ""}`;

  return (
    <div className={embedded ? "" : "page-stack"}>
      <BoardCase
        embedded={embedded}
        data-guide-target="categories-page-overview"
        title="카테고리 설정"
        description="그룹과 하위 카테고리를 같은 보드 포맷에서 관리합니다. 드래그 앤 드롭, 숨기기, 삭제, 기본값 초기화는 그대로 유지됩니다."
        actions={
          <>
            <button
              type="button"
              className={`board-case-action-button${isHiddenPanelOpen ? " is-active" : ""}`}
              data-guide-target="categories-hidden-toggle"
              onClick={() => setIsHiddenPanelOpen((current) => !current)}
            >
              숨김 {hiddenCategories.length}
            </button>
            <button
              type="button"
              className="board-case-action-button"
              data-guide-target="categories-reset-defaults"
              onClick={() => setIsResetDefaultsModalOpen(true)}
            >
              기본값 초기화
            </button>
          </>
        }
      >
        {!groups.length ? (
          <EmptyStateCallout
            kicker="첫 구조"
            title="먼저 카테고리 그룹을 만들어주세요"
            description="생활비 같은 상위 그룹을 만들고, 그 아래에 실제 거래가 매핑되는 하위 카테고리를 추가하면 됩니다."
            actions={
              <button type="button" className="btn btn-primary btn-sm" data-guide-target="categories-create-group" onClick={createGroupSection}>
                그룹 만들기
              </button>
            }
          />
        ) : (
          <div className="board-case-stack">
            {groups.map((group, groupIndex) => {
              const childCategories = getChildCategories(scope.categories, group.id);
              const isInlineEditing = inlineEditingGroupId === group.id;
              return (
                <BoardCaseSection
                  key={group.id}
                  title={
                    isInlineEditing ? (
                      <input
                        className="board-case-title-input"
                        value={inlineGroupName}
                        onChange={(event) => setInlineGroupName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            submitInlineGroupEdit();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            stopInlineGroupEdit();
                          }
                        }}
                        onBlur={submitInlineGroupEdit}
                        aria-label={`${group.name} 그룹 이름`}
                        autoFocus
                      />
                    ) : (
                      <h3>{group.name}</h3>
                    )
                  }
                  meta={`카테고리 ${childCategories.length}개`}
                  className={`category-case-section${getDragStateClassName(group.id)}`}
                  style={getMotionStyle(groupIndex + 2)}
                  draggable={!isInlineEditing}
                  onDragStart={(event) => startDrag({ categoryId: group.id, categoryType: "group", isHidden: false }, event)}
                  onDragEnd={resetDragState}
                  onDragOver={(event) => {
                    if (dragItem?.categoryType !== "group") return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => handleGroupDrop(event, groupIndex)}
                  action={
                    <button
                      type="button"
                      className="board-case-edit-button"
                      onMouseDown={isInlineEditing ? (event) => event.preventDefault() : undefined}
                      onClick={() => {
                        if (isInlineEditing) {
                          submitInlineGroupEdit();
                          return;
                        }
                        startInlineGroupEdit(group);
                      }}
                      aria-label={isInlineEditing ? `${group.name} 그룹 이름 저장` : `${group.name} 그룹 이름 수정`}
                    >
                      {isInlineEditing ? "✓" : "✎"}
                    </button>
                  }
                >
                  <div
                    className="category-case-grid"
                    onDragOver={(event) => {
                      if (dragItem?.categoryType !== "category") return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => handleCategoryAppendDrop(event, group.id, childCategories.length)}
                  >
                    {childCategories.map((category, categoryIndex) => (
                      <article
                        key={category.id}
                        className={`category-case-card${getDragStateClassName(category.id)}`}
                        draggable
                        onDragStart={(event) =>
                          startDrag(
                            {
                              categoryId: category.id,
                              categoryType: "category",
                              parentCategoryId: category.parentCategoryId,
                              isHidden: false,
                            },
                            event,
                          )
                        }
                        onDragEnd={resetDragState}
                        onDragOver={(event) => {
                          if (dragItem?.categoryType !== "category") return;
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDrop={(event) => {
                          event.stopPropagation();
                          handleCategoryDrop(event, group.id, categoryIndex);
                        }}
                        onClick={() => openEditCategoryModal(category)}
                      >
                        <button
                          type="button"
                          className="board-case-edit-button category-case-card-edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditCategoryModal(category);
                          }}
                          aria-label={`${category.name} 카테고리 수정`}
                        >
                          ✎
                        </button>
                        <div className="category-case-card-copy">
                          <strong>{category.name}</strong>
                          <span>{category.fixedOrVariable === "fixed" ? "고정 지출" : "변동 지출"}</span>
                        </div>
                        <div className={`category-case-pill${category.fixedOrVariable === "fixed" ? " is-fixed" : ""}`}>
                          {category.fixedOrVariable === "fixed" ? "고정" : "변동"}
                        </div>
                      </article>
                    ))}

                    <button type="button" className="category-case-add-card" onClick={() => openCreateChildModal(group)}>
                      <span className="category-case-add-plus">+</span>
                      <strong>{group.name}에 추가</strong>
                    </button>
                  </div>
                </BoardCaseSection>
              );
            })}
          </div>
        )}

        <button type="button" className="category-case-group-add" data-guide-target="categories-create-group" onClick={createGroupSection}>
          <span>+</span>
          <strong>새 그룹 추가</strong>
        </button>
      </BoardCase>

      {isHiddenPanelOpen ? (
        <aside className="category-hidden-panel">
          <div className="category-hidden-panel-head">
            <div>
              <span className="section-kicker">숨김 보관함</span>
              <h3>숨긴 카테고리</h3>
            </div>
            <button type="button" className="board-case-edit-button" onClick={() => setIsHiddenPanelOpen(false)} aria-label="숨김 패널 닫기">
              ×
            </button>
          </div>
          <p className="text-secondary mb-3">여기서 메인 보드로 다시 드래그하면 숨김이 해제됩니다.</p>
          <div className="category-hidden-list">
            {hiddenCategories.map((category) => (
              <article
                key={category.id}
                className={`category-hidden-card${getDragStateClassName(category.id)}`}
                draggable
                onDragStart={(event) =>
                  startDrag(
                    category.categoryType === "group"
                      ? { categoryId: category.id, categoryType: "group", isHidden: true }
                      : {
                          categoryId: category.id,
                          categoryType: "category",
                          parentCategoryId: category.parentCategoryId,
                          isHidden: true,
                        },
                    event,
                  )
                }
                onDragEnd={resetDragState}
              >
                <strong>{category.name}</strong>
                <span>{category.categoryType === "group" ? "그룹" : "카테고리"}</span>
              </article>
            ))}
            {!hiddenCategories.length ? <p className="text-secondary mb-0">숨긴 항목이 없습니다.</p> : null}
          </div>
        </aside>
      ) : null}

      {isDragOverlayVisible && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className={`category-side-zone category-side-zone-left${isDragOverlayActive ? " is-visible" : ""}${activeDropZone === "hide" ? " is-active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setActiveDropZone("hide");
                }}
                onDragLeave={() => setActiveDropZone((current) => (current === "hide" ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragItem) return;
                  applyHiddenState(dragItem.categoryId, true);
                  resetDragState();
                }}
              >
                <span>숨기기</span>
              </div>
              <div
                className={`category-side-zone category-side-zone-right${isDragOverlayActive ? " is-visible" : ""}${activeDropZone === "delete" ? " is-active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setActiveDropZone("delete");
                }}
                onDragLeave={() => setActiveDropZone((current) => (current === "delete" ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragItem) return;
                  requestDeleteCategory(dragItem.categoryId);
                  resetDragState();
                }}
              >
                <span>삭제</span>
              </div>
            </>,
            document.body,
          )
        : null}

      <AppModal
        open={isResetDefaultsModalOpen}
        title="기본 카테고리 초기화"
        description="기본 카테고리 구조를 다시 맞춥니다. 기존 거래에 연결된 카테고리는 유지하고, 기본 카테고리는 복구되며 커스텀 카테고리는 그대로 남겨둡니다."
        onClose={() => setIsResetDefaultsModalOpen(false)}
      >
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setIsResetDefaultsModalOpen(false)}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              resetCategoriesToDefaults(workspaceId);
              setIsResetDefaultsModalOpen(false);
            }}
          >
            초기화
          </button>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(pendingDeleteCategory)}
        title="카테고리 삭제 확인"
        description={
          pendingDeleteCategory
            ? `"${pendingDeleteCategory.name}"은(는) 이미 거래에 사용된 적이 있습니다. 삭제하면 기존 거래의 카테고리 연결이 비어집니다. 계속 삭제할까요?`
            : ""
        }
        onClose={() => setPendingDeleteCategoryId(null)}
      >
        {pendingDeleteCategory ? (
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setPendingDeleteCategoryId(null)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                deleteCategory(workspaceId, pendingDeleteCategory.id);
                setPendingDeleteCategoryId(null);
              }}
            >
              삭제
            </button>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={Boolean(createChildGroup) || Boolean(editingCategory)}
        title={editingCategory ? "하위 카테고리 수정" : "하위 카테고리 추가"}
        description={
          editingCategory
            ? "거래에 직접 매핑되는 하위 카테고리를 수정합니다."
            : `${createChildGroup?.name ?? ""} 그룹 안에 실제 거래용 카테고리를 추가합니다.`
        }
        onClose={closeCategoryModal}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = categoryDraft.name.trim();
            const parentCategoryId = editingCategory?.parentCategoryId ?? createChildGroup?.id ?? null;
            if (!name || !parentCategoryId) return;

            const values = {
              name,
              categoryType: "category" as const,
              parentCategoryId,
              sortOrder: editingCategory?.sortOrder ?? 0,
              isHidden: false,
              fixedOrVariable: categoryDraft.fixedOrVariable,
              necessity: "essential" as const,
              budgetable: true,
              reportable: true,
            };

            if (editingCategory) {
              updateCategory(workspaceId, editingCategory.id, values);
            } else {
              addCategory(workspaceId, values);
            }

            closeCategoryModal();
          }}
        >
          <label>
            카테고리 이름
            <input
              className="form-control"
              value={categoryDraft.name}
              onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="예: 생필품"
            />
          </label>
          <label>
            지출 성격
            <AppSelect
              value={categoryDraft.fixedOrVariable}
              onChange={(nextValue) =>
                setCategoryDraft((current) => ({
                  ...current,
                  fixedOrVariable: nextValue === "fixed" ? "fixed" : "variable",
                }))
              }
              options={[
                { value: "variable", label: "변동 지출" },
                { value: "fixed", label: "고정 지출" },
              ]}
              ariaLabel="지출 성격 선택"
            />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              저장
            </button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}

