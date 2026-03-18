import { Link } from "react-router-dom";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function CardsPage() {
  const { addCard, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const cards = scope.cards;
  const accountMap = new Map(scope.accounts.map((item) => [item.id, item.name]));
  const transactions = scope.transactions.filter((item) => item.status === "active");

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">자산 관리</span>
            <h2 className="section-title">카드</h2>
          </div>
        </div>
        <p className="text-secondary">
          카드를 등록해두면 카드 명세서 업로드, 사용일과 결제일 구분, 카드별 지출 흐름 분석까지 이어서 정리하기 쉬워집니다.
        </p>
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
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">카드 목록</span>
            <h2 className="section-title">등록된 카드 보기</h2>
          </div>
          <span className="badge text-bg-dark">{cards.length}개</span>
        </div>
        {!cards.length ? (
          <EmptyStateCallout
            kicker="명세서 준비"
            title="업로드 전에 카드를 등록해두면 좋아요"
            description="카드 명세서 파서가 붙어갈수록 카드 정보와 결제 계좌를 연결해두는 것이 분석 정확도에 도움이 됩니다."
            actions={
              <Link to="/imports" className="btn btn-outline-primary btn-sm">
                업로드 화면으로 이동
              </Link>
            }
          />
        ) : (
          <div className="resource-grid">
            {cards.map((card, index) => (
              (() => {
                const cardTransactions = transactions.filter((item) => item.cardId === card.id);
                const cardSpend = cardTransactions
                  .filter((item) => item.isExpenseImpact)
                  .reduce((sum, item) => sum + item.amount, 0);
                return (
                  <article key={card.id} className="resource-card" style={getMotionStyle(index + 2)}>
                    <h3>{card.name}</h3>
                    <p className="mb-1 text-secondary">{card.issuerName}</p>
                    <p className="mb-1 text-secondary">{card.cardNumberMasked || "마스킹 없음"}</p>
                    <p className="mb-1 text-secondary">사용 거래 {cardTransactions.length}건</p>
                    <p className="mb-1 text-secondary">누적 사용액 {formatCurrency(cardSpend)}</p>
                    <p className="mb-0 text-secondary">
                      결제 계좌 {card.linkedAccountId ? accountMap.get(card.linkedAccountId) ?? "연결 안 됨" : "연결 안 됨"}
                    </p>
                  </article>
                );
              })()
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
