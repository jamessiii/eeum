import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCategoryGroups, getChildCategories, getHiddenCategories } from "../../domain/categories/meta";
import { getMotionStyle } from "../../shared/utils/motion";
import type { Category } from "../../shared/types/models";
import { AppModal } from "../components/AppModal";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

type GroupDraftState = {
  name: string;
};

type CategoryDraftState = {
  name: string;
  fixedOrVariable: Category["fixedOrVariable"];
};

type DragItem =
  | { categoryId: string; categoryType: "group"; isHidden: boolean }
  | { categoryId: string; categoryType: "category"; parentCategoryId: string | null; isHidden: boolean };

const EMPTY_GROUP_DRAFT: GroupDraftState = { name: "" };
const EMPTY_CATEGORY_DRAFT: CategoryDraftState = {
  name: "",
  fixedOrVariable: "variable",
};
let transparentDragImage: HTMLCanvasElement | null = null;

function createGroupDraft(category?: Category | null): GroupDraftState {
  return { name: category?.name ?? "" };
}

function createCategoryDraft(category?: Category | null): CategoryDraftState {
  if (!category) return EMPTY_CATEGORY_DRAFT;
  return {
    name: category.name,
    fixedOrVariable: category.fixedOrVariable,
  };
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

export function CategoriesPage() {
  const { addCategory, deleteCategory, moveCategory, state, updateCategory } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const categoryMap = useMemo(() => new Map(scope.categories.map((category) => [category.id, category])), [scope.categories]);
  const groups = useMemo(() => getCategoryGroups(scope.categories), [scope.categories]);
  const hiddenCategories = useMemo(() => getHiddenCategories(scope.categories), [scope.categories]);
  const suppressClickRef = useRef(false);

  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [createChildGroupId, setCreateChildGroupId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraftState>(EMPTY_GROUP_DRAFT);
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

  const editingGroup = editingGroupId ? categoryMap.get(editingGroupId) ?? null : null;
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

    window.addEventListener("dragover", handleDragOver);
    return () => window.removeEventListener("dragover", handleDragOver);
  }, [dragItem]);

  useEffect(() => {
    if (!dragGhostRef.current) return;
    dragGhostRef.current.classList.toggle("is-drop-target-hide", activeDropZone === "hide");
    dragGhostRef.current.classList.toggle("is-drop-target-delete", activeDropZone === "delete");
  }, [activeDropZone]);

  const openCreateGroupModal = () => {
    setGroupDraft(EMPTY_GROUP_DRAFT);
    setIsCreateGroupModalOpen(true);
  };

  const openEditGroupModal = (group: Category) => {
    setGroupDraft(createGroupDraft(group));
    setEditingGroupId(group.id);
  };

  const closeGroupModal = () => {
    setIsCreateGroupModalOpen(false);
    setEditingGroupId(null);
    setGroupDraft(EMPTY_GROUP_DRAFT);
  };

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

  const handleCategoryDrop = (
    event: React.DragEvent<HTMLElement>,
    groupId: string,
    categoryIndex: number,
  ) => {
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

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">카테고리 구조</span>
            <h2 className="section-title">카테고리 탭</h2>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIsHiddenPanelOpen((current) => !current)}>
              숨김 항목 {hiddenCategories.length}
            </button>
          </div>
        </div>
        <p className="mb-0 text-secondary">
          그룹과 하위 카테고리를 직접 배치합니다. 왼쪽은 숨기기, 오른쪽은 삭제 영역입니다. 숨긴 카테고리는 보관함에서 다시 꺼낼 수 있습니다.
        </p>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">보드 관리</span>
            <h2 className="section-title">그룹과 하위 카테고리</h2>
          </div>
          <span className="badge text-bg-dark">
            그룹 {groups.length}개 · 카테고리 {scope.categories.filter((category) => category.categoryType === "category" && !category.isHidden).length}개
          </span>
        </div>

        {!groups.length ? (
          <EmptyStateCallout
            kicker="첫 구조"
            title="먼저 카테고리 그룹을 만들어 주세요"
            description="생활비, 식비처럼 상위 그룹을 만들고 그 안에 하위 카테고리를 쌓는 구조로 시작합니다."
            actions={
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreateGroupModal}>
                그룹 만들기
              </button>
            }
          />
        ) : (
          <div className="category-board-stack">
            {groups.map((group, groupIndex) => {
              const childCategories = getChildCategories(scope.categories, group.id);
              return (
                <section
                  key={group.id}
                  className={`category-group-board${dragItem?.categoryId === group.id ? " is-dragging" : ""}${dragItem?.categoryId === group.id && activeDropZone === "hide" ? " is-drop-target-hide" : ""}${dragItem?.categoryId === group.id && activeDropZone === "delete" ? " is-drop-target-delete" : ""}`}
                  style={getMotionStyle(groupIndex + 2)}
                  draggable
                  onDragStart={(event) => startDrag({ categoryId: group.id, categoryType: "group", isHidden: false }, event)}
                  onDragEnd={resetDragState}
                  onDragOver={(event) => {
                    if (dragItem?.categoryType !== "group") return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => handleGroupDrop(event, groupIndex)}
                >
                  <div className="category-group-head">
                    <div>
                      <h3>{group.name}</h3>
                      <p>하위 카테고리 {childCategories.length}개</p>
                    </div>
                    <button type="button" className="category-board-icon-button" onClick={() => openEditGroupModal(group)} aria-label={`${group.name} 그룹 수정`}>
                      <span draggable={false}>✎</span>
                    </button>
                  </div>

                  <div
                    className="category-child-grid"
                    onDragOver={(event) => {
                      if (dragItem?.categoryType !== "category") return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => handleCategoryAppendDrop(event, group.id, childCategories.length)}
                  >
                    {childCategories.map((category, categoryIndex) => (
                      <article
                        key={category.id}
                        className={`category-child-tile${dragItem?.categoryId === category.id ? " is-dragging" : ""}${dragItem?.categoryId === category.id && activeDropZone === "hide" ? " is-drop-target-hide" : ""}${dragItem?.categoryId === category.id && activeDropZone === "delete" ? " is-drop-target-delete" : ""}`}
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
                          className="category-board-icon-button category-child-edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditCategoryModal(category);
                          }}
                          aria-label={`${category.name} 카테고리 수정`}
                        >
                          <span draggable={false}>✎</span>
                        </button>
                        <strong>{category.name}</strong>
                        <span>{category.fixedOrVariable === "fixed" ? "고정" : "변동"}</span>
                      </article>
                    ))}

                    <button
                      type="button"
                      className="category-child-tile category-child-tile-add"
                      onClick={() => openCreateChildModal(group)}
                    >
                      <span className="category-child-plus">+</span>
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <button type="button" className="category-group-add-board" onClick={openCreateGroupModal}>
          <span>+</span>
          <strong>새 그룹 추가</strong>
        </button>
      </section>

      {isHiddenPanelOpen ? (
        <aside className="category-hidden-panel">
          <div className="category-hidden-panel-head">
            <div>
              <span className="section-kicker">숨김 보관함</span>
              <h3>숨김 카테고리</h3>
            </div>
            <button type="button" className="category-board-icon-button" onClick={() => setIsHiddenPanelOpen(false)} aria-label="숨김 패널 닫기">
              <span draggable={false}>✕</span>
            </button>
          </div>
          <p className="text-secondary mb-3">여기서 카드를 메인 보드로 드래그하면 다시 사용할 수 있습니다.</p>
          <div className="category-hidden-list">
            {hiddenCategories.map((category) => (
              <article
                key={category.id}
                className={`category-hidden-card${dragItem?.categoryId === category.id ? " is-dragging" : ""}${dragItem?.categoryId === category.id && activeDropZone === "hide" ? " is-drop-target-hide" : ""}${dragItem?.categoryId === category.id && activeDropZone === "delete" ? " is-drop-target-delete" : ""}`}
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
        open={isCreateGroupModalOpen || Boolean(editingGroup)}
        title={editingGroup ? "카테고리 그룹 수정" : "카테고리 그룹 추가"}
        description={editingGroup ? "부모 그룹 이름을 수정합니다." : "생활비, 식비처럼 상위 그룹을 먼저 만듭니다."}
        onClose={closeGroupModal}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = groupDraft.name.trim();
            if (!name) return;

            if (editingGroup) {
              updateCategory(workspaceId, editingGroup.id, { name });
            } else {
              addCategory(workspaceId, { name, categoryType: "group", isHidden: false });
            }

            closeGroupModal();
          }}
        >
          <label style={{ gridColumn: "1 / -1" }}>
            그룹 이름
            <input
              className="form-control"
              value={groupDraft.name}
              onChange={(event) => setGroupDraft({ name: event.target.value })}
              placeholder="예: 생활비"
            />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              저장
            </button>
          </div>
        </form>
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
            <select
              className="form-select"
              value={categoryDraft.fixedOrVariable}
              onChange={(event) =>
                setCategoryDraft((current) => ({
                  ...current,
                  fixedOrVariable: event.target.value === "fixed" ? "fixed" : "variable",
                }))
              }
            >
              <option value="variable">변동 지출</option>
              <option value="fixed">고정 지출</option>
            </select>
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
