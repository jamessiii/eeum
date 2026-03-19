import { Link } from "react-router-dom";
import { useState } from "react";
import { getCardUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const CARD_TYPE_OPTIONS = [
  { value: "credit", label: "신용카드" },
  { value: "check", label: "체크카드" },
  { value: "debit", label: "직불카드" },
  { value: "prepaid", label: "선불카드" },
  { value: "other", label: "기타" },
] as const;

export function CardsPage() {
  const { addCard, state, updateCard } = useAppState();
  const [createLinkedAccountId, setCreateLinkedAccountId] = useState("");
  const [ownerDraftByCard, setOwnerDraftByCard] = useState<Record<string, string>>({});
  const [linkedAccountDraftByCard, setLinkedAccountDraftByCard] = useState<Record<string, string>>({});
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const cards = scope.cards;
  const people = scope.people.filter((person) => person.isActive);
  const personMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((item) => [item.id, item.alias || item.name]));
  const accountSharedMap = new Map(scope.accounts.map((item) => [item.id, item.isShared]));
  const transactions = getActiveTransactions(scope.transactions);
  const getOwnerOptions = (ownerPersonId: string | null) =>
    ownerPersonId ? scope.people.filter((person) => person.isActive || person.id === ownerPersonId) : people;
  const getCardFormValues = (formData: FormData) => ({
    ownerPersonId: String(formData.get("ownerPersonId") ?? "") || null,
    name: String(formData.get("name") ?? "").trim(),
    issuerName: String(formData.get("issuerName") ?? "").trim(),
    cardNumberMasked: String(formData.get("cardNumberMasked") ?? "").trim(),
    linkedAccountId: String(formData.get("linkedAccountId") ?? "") || null,
    cardType: String(formData.get("cardType") ?? "credit") as "credit" | "check" | "debit" | "prepaid" | "other",
    memo: String(formData.get("memo") ?? "").trim(),
  });

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
          카드 업로드는 카드사와 카드 이름이 정확해야 매핑이 자연스럽습니다. 결제 계좌와 카드 종류를 같이 묶어두면 카드 사용과 실제 출금
          흐름을 이어서 볼 수 있습니다.
        </p>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const values = getCardFormValues(formData);
            if (!values.name) return;

            addCard(workspaceId, values);

            event.currentTarget.reset();
            setCreateLinkedAccountId("");
          }}
        >
          <label>
            카드 이름
            <input name="name" className="form-control" placeholder="예: 우리 Z Family" />
          </label>
          <label>
            카드사
            <input name="issuerName" className="form-control" placeholder="예: 우리카드" />
          </label>
          <label>
            소유자
            <select name="ownerPersonId" className="form-select" defaultValue="">
              <option value="">미지정</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName || person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            연결 계좌
            <select
              name="linkedAccountId"
              className="form-select"
              value={createLinkedAccountId}
              onChange={(event) => setCreateLinkedAccountId(event.target.value)}
            >
              <option value="">연결 안 함</option>
              {scope.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.alias || account.name}
                  {account.isShared ? " (공동)" : ""}
                </option>
              ))}
            </select>
          </label>
          {createLinkedAccountId && accountSharedMap.get(createLinkedAccountId) ? (
            <div className="small text-secondary" style={{ gridColumn: "1 / -1" }}>
              공동 계좌에 연결된 카드라서 결제 흐름이 공동 자금 기준으로 이어집니다.
            </div>
          ) : null}
          <label>
            카드 종류
            <select name="cardType" className="form-select" defaultValue="credit">
              {CARD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            카드 끝표기
            <input name="cardNumberMasked" className="form-control" placeholder="예: 4032 또는 family" />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea name="memo" className="form-control" rows={3} placeholder="명세서 업로드 파일명, 가족카드 여부, 실사용자 등 메모를 남길 수 있습니다." />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              카드 추가
            </button>
          </div>
        </form>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">카드 목록</span>
            <h2 className="section-title">등록된 카드 관리</h2>
          </div>
          <span className="badge text-bg-dark">{cards.length}개</span>
        </div>
        {!cards.length ? (
          <EmptyStateCallout
            kicker="명세서 준비"
            title="업로드 전에 카드를 먼저 등록해두면 좋습니다"
            description="카드사, 카드명, 결제 계좌가 먼저 잡혀 있어야 명세서 업로드 후 매핑 흐름이 매끄럽게 이어집니다."
            actions={
              <>
                <Link to="/imports" className="btn btn-outline-primary btn-sm">
                  업로드 화면 보기
                </Link>
                <Link to="/accounts" className="btn btn-outline-secondary btn-sm">
                  계좌 관리 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid">
            {cards.map((card, index) => {
              const usage = getCardUsageSummary(transactions, card.id);
              const selectedOwnerPersonId = ownerDraftByCard[card.id] ?? card.ownerPersonId ?? "";
              const selectedLinkedAccountId = linkedAccountDraftByCard[card.id] ?? card.linkedAccountId ?? "";

              return (
                <article key={card.id} className="resource-card" style={getMotionStyle(index + 2)}>
                  <div className="w-100 d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <h3 className="mb-1">{card.name}</h3>
                      <p className="mb-1 text-secondary">{card.issuerName}</p>
                      <p className="mb-0 text-secondary">
                        {personMap.get(selectedOwnerPersonId) ?? "미지정"} · 결제{" "}
                        {selectedLinkedAccountId
                          ? `${accountSharedMap.get(selectedLinkedAccountId) ? "공동 계좌 " : ""}${accountMap.get(selectedLinkedAccountId) ?? "-"}`
                          : "미연결"} · 사용 {formatCurrency(usage.expenseAmount)}
                      </p>
                    </div>
                    <span className="badge text-bg-secondary">{CARD_TYPE_OPTIONS.find((option) => option.value === card.cardType)?.label ?? "기타"}</span>
                  </div>

                  <form
                    className="profile-form w-100"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const values = getCardFormValues(formData);
                      if (!values.name) return;

                      updateCard(workspaceId, card.id, values);
                      setOwnerDraftByCard((current) => {
                        const next = { ...current };
                        delete next[card.id];
                        return next;
                      });
                      setLinkedAccountDraftByCard((current) => {
                        const next = { ...current };
                        delete next[card.id];
                        return next;
                      });
                    }}
                  >
                    <label>
                      카드 이름
                      <input name="name" className="form-control" defaultValue={card.name} />
                    </label>
                    <label>
                      카드사
                      <input name="issuerName" className="form-control" defaultValue={card.issuerName} />
                    </label>
                    <label>
                      소유자
                      <select
                        name="ownerPersonId"
                        className="form-select"
                        value={selectedOwnerPersonId}
                        onChange={(event) =>
                          setOwnerDraftByCard((current) => ({
                            ...current,
                            [card.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">미지정</option>
                        {getOwnerOptions(card.ownerPersonId).map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName || person.name}
                            {!person.isActive ? " (보관됨)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      연결 계좌
                      <select
                        name="linkedAccountId"
                        className="form-select"
                        value={selectedLinkedAccountId}
                        onChange={(event) =>
                          setLinkedAccountDraftByCard((current) => ({
                            ...current,
                            [card.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">연결 안 함</option>
                        {scope.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.alias || account.name}
                            {account.isShared ? " (공동)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedLinkedAccountId && accountSharedMap.get(selectedLinkedAccountId) ? (
                      <div className="small text-secondary" style={{ gridColumn: "1 / -1" }}>
                        공동 계좌에 연결된 카드라서 결제 흐름이 공동 자금 기준으로 이어집니다.
                      </div>
                    ) : null}
                    <label>
                      카드 종류
                      <select name="cardType" className="form-select" defaultValue={card.cardType}>
                        {CARD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      카드 끝표기
                      <input name="cardNumberMasked" className="form-control" defaultValue={card.cardNumberMasked} />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      메모
                      <textarea name="memo" className="form-control" rows={3} defaultValue={card.memo} />
                    </label>
                    <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
                      <button className="btn btn-outline-primary btn-sm" type="submit">
                        저장
                      </button>
                    </div>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
