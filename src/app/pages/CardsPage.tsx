import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function CardsPage() {
  const { addCard, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const cards = getWorkspaceScope(state, workspaceId).cards;

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">자산 관리</span>
          <h2 className="section-title">카드</h2>
        </div>
      </div>
      <form
        className="simple-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
          const issuerInput = form.elements.namedItem("issuer") as HTMLInputElement | null;
          const name = nameInput?.value.trim() ?? "";
          const issuer = issuerInput?.value.trim() ?? "";
          if (!name) return;
          addCard(workspaceId, name, issuer || "직접입력");
          form.reset();
        }}
      >
        <input name="name" className="form-control" placeholder="카드 이름" />
        <input name="issuer" className="form-control" placeholder="카드사" />
        <button className="btn btn-primary" type="submit">
          카드 추가
        </button>
      </form>
      <div className="resource-grid mt-4">
        {cards.map((card) => (
          <article key={card.id} className="resource-card">
            <h3>{card.name}</h3>
            <p className="mb-1 text-secondary">{card.issuerName}</p>
            <p className="mb-0 text-secondary">{card.cardNumberMasked || "마스킹 없음"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
