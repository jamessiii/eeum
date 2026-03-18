import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function PeoplePage() {
  const { addPerson, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const people = getWorkspaceScope(state, workspaceId).people;

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">구성원 관리</span>
          <h2 className="section-title">사람</h2>
        </div>
      </div>
      <form
        className="simple-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement | null;
          const value = input?.value.trim() ?? "";
          if (!value) return;
          addPerson(workspaceId, value);
          event.currentTarget.reset();
        }}
      >
        <input name="name" className="form-control" placeholder="이름" />
        <button className="btn btn-primary" type="submit">
          사람 추가
        </button>
      </form>
      <div className="resource-grid mt-4">
        {people.map((person) => (
          <article key={person.id} className="resource-card">
            <h3>{person.name}</h3>
            <p className="mb-0 text-secondary">{person.role === "owner" ? "소유자" : "구성원"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
