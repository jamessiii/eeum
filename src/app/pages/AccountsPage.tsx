import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function AccountsPage() {
  const { addAccount, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const accounts = getWorkspaceScope(state, workspaceId).accounts;

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">자산 관리</span>
          <h2 className="section-title">계좌</h2>
        </div>
      </div>
      <form
        className="simple-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const nameInput = form.elements.namedItem("name") as HTMLInputElement | null;
          const institutionInput = form.elements.namedItem("institution") as HTMLInputElement | null;
          const name = nameInput?.value.trim() ?? "";
          const institutionName = institutionInput?.value.trim() ?? "";
          if (!name) return;
          addAccount(workspaceId, name, institutionName || "직접입력");
          form.reset();
        }}
      >
        <input name="name" className="form-control" placeholder="계좌 이름" />
        <input name="institution" className="form-control" placeholder="금융기관" />
        <button className="btn btn-primary" type="submit">
          계좌 추가
        </button>
      </form>
      <div className="resource-grid mt-4">
        {accounts.map((account) => (
          <article key={account.id} className="resource-card">
            <h3>{account.name}</h3>
            <p className="mb-1 text-secondary">{account.institutionName}</p>
            <p className="mb-0 text-secondary">
              {account.isShared ? "공동 계좌" : "개인 계좌"} · {account.accountNumberMasked || "마스킹 없음"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
