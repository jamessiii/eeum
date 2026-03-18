import { EmptyStateCallout } from "../components/EmptyStateCallout";
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

      {!people.length ? (
        <div className="mt-4">
          <EmptyStateCallout
            kicker="첫 단계"
            title="함께 관리할 사람을 먼저 등록하세요"
            description="개인 지출과 공동 지출을 나누고, 나중에 정산까지 하려면 구성원 정보가 먼저 필요합니다."
          />
        </div>
      ) : (
        <div className="resource-grid mt-4">
          {people.map((person) => (
            <article key={person.id} className="resource-card">
              <h3>{person.name}</h3>
              <p className="mb-0 text-secondary">{person.role === "owner" ? "소유자" : "구성원"}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
