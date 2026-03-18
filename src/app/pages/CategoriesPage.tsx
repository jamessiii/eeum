import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function CategoriesPage() {
  const { addCategory, addTag, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">분류 관리</span>
            <h2 className="section-title">카테고리</h2>
          </div>
        </div>
        <form
          className="simple-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (!value) return;
            addCategory(workspaceId, value);
            event.currentTarget.reset();
          }}
        >
          <input name="name" className="form-control" placeholder="카테고리 이름" />
          <button className="btn btn-primary" type="submit">
            카테고리 추가
          </button>
        </form>
        <div className="resource-grid mt-4">
          {scope.categories.map((category) => (
            <article key={category.id} className="resource-card">
              <h3>{category.name}</h3>
              <p className="mb-1 text-secondary">
                {category.direction} · {category.fixedOrVariable}
              </p>
              <p className="mb-0 text-secondary">{category.necessity}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">분류 관리</span>
            <h2 className="section-title">태그</h2>
          </div>
        </div>
        <form
          className="simple-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
            const value = input?.value.trim() ?? "";
            if (!value) return;
            addTag(workspaceId, value);
            event.currentTarget.reset();
          }}
        >
          <input name="name" className="form-control" placeholder="태그 이름" />
          <button className="btn btn-primary" type="submit">
            태그 추가
          </button>
        </form>
        <div className="resource-grid mt-4">
          {scope.tags.map((tag) => (
            <article key={tag.id} className="resource-card">
              <h3>{tag.name}</h3>
              <div className="tag-color-chip" style={{ backgroundColor: tag.color }} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
