import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCardUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
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

type CardDraftState = {
  ownerPersonId: string;
  name: string;
  issuerName: string;
  cardNumberMasked: string;
  linkedAccountId: string;
  cardType: (typeof CARD_TYPE_OPTIONS)[number]["value"];
  memo: string;
};

const EMPTY_CARD_DRAFT: CardDraftState = {
  ownerPersonId: "",
  name: "",
  issuerName: "",
  cardNumberMasked: "",
  linkedAccountId: "",
  cardType: "credit",
  memo: "",
};

function createDraftFromCard(card?: {
  ownerPersonId: string | null;
  name: string;
  issuerName: string;
  cardNumberMasked: string;
  linkedAccountId: string | null;
  cardType: CardDraftState["cardType"];
  memo: string;
}): CardDraftState {
  if (!card) return EMPTY_CARD_DRAFT;
  return {
    ownerPersonId: card.ownerPersonId ?? "",
    name: card.name,
    issuerName: card.issuerName,
    cardNumberMasked: card.cardNumberMasked,
    linkedAccountId: card.linkedAccountId ?? "",
    cardType: card.cardType,
    memo: card.memo,
  };
}

function normalizeDraftValues(draft: CardDraftState) {
  return {
    ownerPersonId: draft.ownerPersonId || null,
    name: draft.name.trim(),
    issuerName: draft.issuerName.trim(),
    cardNumberMasked: draft.cardNumberMasked.trim(),
    linkedAccountId: draft.linkedAccountId || null,
    cardType: draft.cardType,
    memo: draft.memo.trim(),
  };
}

export function CardsPage() {
  const { addCard, state, updateCard } = useAppState();
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CardDraftState>(EMPTY_CARD_DRAFT);
  const [editDraft, setEditDraft] = useState<CardDraftState>(EMPTY_CARD_DRAFT);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const cards = scope.cards;
  const people = scope.people.filter((person) => person.isActive);
  const personMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const accountMap = new Map(scope.accounts.map((item) => [item.id, item.alias || item.name]));
  const accountSharedMap = new Map(scope.accounts.map((item) => [item.id, item.isShared]));
  const transactions = getActiveTransactions(scope.transactions);

  const editingCard = useMemo(() => cards.find((card) => card.id === editingCardId) ?? null, [cards, editingCardId]);
  const getOwnerOptions = (ownerPersonId: string | null) =>
    ownerPersonId ? scope.people.filter((person) => person.isActive || person.id === ownerPersonId) : people;

  const openCreateModal = () => {
    setCreateDraft(EMPTY_CARD_DRAFT);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    setEditingCardId(cardId);
    setEditDraft(createDraftFromCard(card));
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">자산 관리</span>
            <h2 className="section-title">카드</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            카드 등록
          </button>
        </div>
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
            description="카드사, 카드명, 결제 계좌가 먼저 잡혀 있어야 업로드 후 매핑 흐름이 매끄럽게 이어집니다."
            actions={
              <>
                <Link to="/imports" className="btn btn-outline-primary btn-sm">
                  업로드 화면 보기
                </Link>
                <Link to="/settings?tab=accounts" className="btn btn-outline-secondary btn-sm">
                  계좌 관리 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid compact-resource-grid">
            {cards.map((card, index) => {
              const usage = getCardUsageSummary(transactions, card.id);
              const isExpanded = expandedCardId === card.id;
              const linkedAccountName = card.linkedAccountId
                ? `${accountSharedMap.get(card.linkedAccountId) ? "공동 계좌 " : ""}${accountMap.get(card.linkedAccountId) ?? "-"}`
                : "미연결";

              return (
                <article key={card.id} className={`resource-card compact-resource-card${isExpanded ? " expanded" : ""}`} style={getMotionStyle(index + 2)}>
                  <div className="compact-card-summary">
                    <div>
                      <div className="compact-card-meta">
                        <span className="badge text-bg-secondary">
                          {CARD_TYPE_OPTIONS.find((option) => option.value === card.cardType)?.label ?? "기타"}
                        </span>
                        <span className="compact-card-caption">{personMap.get(card.ownerPersonId ?? "") ?? "미지정"}</span>
                      </div>
                      <h3 className="mb-1">{card.name}</h3>
                      <p className="mb-1 text-secondary">{card.issuerName}</p>
                      <p className="mb-0 text-secondary">결제 {linkedAccountName} · 사용 {formatCurrency(usage.expenseAmount)}</p>
                    </div>
                    <div className="compact-card-actions">
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEditModal(card.id)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className="expand-toggle-button"
                        onClick={() => setExpandedCardId((current) => (current === card.id ? null : card.id))}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "상세 접기" : "상세 펼치기"}
                      >
                        {isExpanded ? "▴" : "▾"}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="compact-card-details">
                      <div className="compact-detail-grid">
                        <div>
                          <span className="section-kicker">소유자</span>
                          <strong>{personMap.get(card.ownerPersonId ?? "") ?? "미지정"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">연결 계좌</span>
                          <strong>{linkedAccountName}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">끝표기</span>
                          <strong>{card.cardNumberMasked || "-"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">사용 거래</span>
                          <strong>{usage.transactionCount}건</strong>
                        </div>
                      </div>
                      {card.memo ? <div className="compact-note">{card.memo}</div> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AppModal
        open={isCreateModalOpen}
        title="카드 등록"
        description="카드 이름과 결제 계좌만 먼저 맞춰도 업로드 연결이 훨씬 쉬워집니다."
        onClose={() => setIsCreateModalOpen(false)}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = normalizeDraftValues(createDraft);
            if (!values.name) return;
            addCard(workspaceId, values);
            setIsCreateModalOpen(false);
            setCreateDraft(EMPTY_CARD_DRAFT);
          }}
        >
          <label>
            카드 이름
            <input className="form-control" value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            카드사
            <input className="form-control" value={createDraft.issuerName} onChange={(event) => setCreateDraft((current) => ({ ...current, issuerName: event.target.value }))} />
          </label>
          <label>
            소유자
            <select className="form-select" value={createDraft.ownerPersonId} onChange={(event) => setCreateDraft((current) => ({ ...current, ownerPersonId: event.target.value }))}>
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
            <select className="form-select" value={createDraft.linkedAccountId} onChange={(event) => setCreateDraft((current) => ({ ...current, linkedAccountId: event.target.value }))}>
              <option value="">연결 안 함</option>
              {scope.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.alias || account.name}
                  {account.isShared ? " (공동)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            카드 종류
            <select className="form-select" value={createDraft.cardType} onChange={(event) => setCreateDraft((current) => ({ ...current, cardType: event.target.value as CardDraftState["cardType"] }))}>
              {CARD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            카드 끝표기
            <input className="form-control" value={createDraft.cardNumberMasked} onChange={(event) => setCreateDraft((current) => ({ ...current, cardNumberMasked: event.target.value }))} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea className="form-control" rows={3} value={createDraft.memo} onChange={(event) => setCreateDraft((current) => ({ ...current, memo: event.target.value }))} />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              저장
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={Boolean(editingCard)}
        title="카드 수정"
        description="주요 정보만 바로 고치고, 상세 정보는 펼쳐서 다시 확인할 수 있습니다."
        onClose={() => {
          setEditingCardId(null);
          setEditDraft(EMPTY_CARD_DRAFT);
        }}
      >
        {editingCard ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeDraftValues(editDraft);
              if (!values.name) return;
              updateCard(workspaceId, editingCard.id, values);
              setEditingCardId(null);
              setEditDraft(EMPTY_CARD_DRAFT);
            }}
          >
            <label>
              카드 이름
              <input className="form-control" value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              카드사
              <input className="form-control" value={editDraft.issuerName} onChange={(event) => setEditDraft((current) => ({ ...current, issuerName: event.target.value }))} />
            </label>
            <label>
              소유자
              <select className="form-select" value={editDraft.ownerPersonId} onChange={(event) => setEditDraft((current) => ({ ...current, ownerPersonId: event.target.value }))}>
                <option value="">미지정</option>
                {getOwnerOptions(editingCard.ownerPersonId).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName || person.name}
                    {!person.isActive ? " (보관됨)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              연결 계좌
              <select className="form-select" value={editDraft.linkedAccountId} onChange={(event) => setEditDraft((current) => ({ ...current, linkedAccountId: event.target.value }))}>
                <option value="">연결 안 함</option>
                {scope.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.alias || account.name}
                    {account.isShared ? " (공동)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              카드 종류
              <select className="form-select" value={editDraft.cardType} onChange={(event) => setEditDraft((current) => ({ ...current, cardType: event.target.value as CardDraftState["cardType"] }))}>
                {CARD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              카드 끝표기
              <input className="form-control" value={editDraft.cardNumberMasked} onChange={(event) => setEditDraft((current) => ({ ...current, cardNumberMasked: event.target.value }))} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editDraft.memo} onChange={(event) => setEditDraft((current) => ({ ...current, memo: event.target.value }))} />
            </label>
            <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" type="submit">
                저장
              </button>
            </div>
          </form>
        ) : null}
      </AppModal>
    </div>
  );
}
