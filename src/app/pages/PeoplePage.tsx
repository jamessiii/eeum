import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "입출금" },
  { value: "savings", label: "저축" },
  { value: "loan", label: "대출" },
  { value: "cash", label: "현금" },
  { value: "other", label: "기타" },
] as const;

const ACCOUNT_USAGE_OPTIONS = [
  { value: "daily", label: "일상 생활비" },
  { value: "salary", label: "급여 수령" },
  { value: "shared", label: "공동 자금" },
  { value: "card_payment", label: "카드 결제" },
  { value: "savings", label: "저축" },
  { value: "investment", label: "투자" },
  { value: "loan", label: "대출 관리" },
  { value: "other", label: "기타" },
] as const;

type AccountUsageType = (typeof ACCOUNT_USAGE_OPTIONS)[number]["value"];

type PersonDraftState = {
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
};

type PersonAccountDraftState = {
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  ownerPersonId: string;
  accountType: (typeof ACCOUNT_TYPE_OPTIONS)[number]["value"];
  usageType: AccountUsageType;
  isShared: boolean;
  memo: string;
};

const EMPTY_PERSON_DRAFT: PersonDraftState = {
  name: "",
  displayName: "",
  role: "member",
  memo: "",
  isActive: true,
};

const EMPTY_PERSON_ACCOUNT_DRAFT: PersonAccountDraftState = {
  name: "",
  alias: "",
  institutionName: "",
  accountNumberMasked: "",
  ownerPersonId: "",
  accountType: "checking",
  usageType: "daily",
  isShared: false,
  memo: "",
};

function getPersonRoleLabel(role: "owner" | "member") {
  return role === "owner" ? "기본 사용자" : "구성원";
}

function createDraftFromPerson(person?: {
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
}): PersonDraftState {
  if (!person) return EMPTY_PERSON_DRAFT;
  return {
    name: person.name,
    displayName: person.displayName,
    role: person.role,
    memo: person.memo,
    isActive: person.isActive,
  };
}

function createAccountDraftForPerson(personId: string): PersonAccountDraftState {
  return {
    ...EMPTY_PERSON_ACCOUNT_DRAFT,
    ownerPersonId: personId,
  };
}

function normalizeAccountDraftValues(draft: PersonAccountDraftState) {
  return {
    ownerPersonId: draft.isShared ? null : draft.ownerPersonId || null,
    name: draft.name.trim(),
    alias: draft.alias.trim(),
    institutionName: draft.institutionName.trim(),
    accountNumberMasked: draft.accountNumberMasked.trim(),
    accountType: draft.accountType,
    usageType: draft.isShared ? "shared" : draft.usageType,
    isShared: draft.isShared,
    memo: draft.memo.trim(),
  };
}

export function PeoplePage() {
  const { addAccount, addPerson, state, updatePerson } = useAppState();
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountOwnerPersonId, setAccountOwnerPersonId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<PersonAccountDraftState>(EMPTY_PERSON_ACCOUNT_DRAFT);
  const [createDraft, setCreateDraft] = useState<PersonDraftState>(EMPTY_PERSON_DRAFT);
  const [editDraft, setEditDraft] = useState<PersonDraftState>(EMPTY_PERSON_DRAFT);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const people = scope.people;
  const activePeople = scope.people.filter((person) => person.isActive);
  const accountsByPersonId = new Map(scope.people.map((person) => [person.id, scope.accounts.filter((account) => account.ownerPersonId === person.id)]));
  const cardsByPersonId = new Map(scope.people.map((person) => [person.id, scope.cards.filter((card) => card.ownerPersonId === person.id)]));
  const transactions = getActiveTransactions(scope.transactions);
  const editingPerson = useMemo(() => people.find((person) => person.id === editingPersonId) ?? null, [people, editingPersonId]);

  const normalizeDraftValues = (draft: PersonDraftState) => {
    const name = draft.name.trim();
    return {
      name,
      displayName: draft.displayName.trim() || name,
      role: draft.role,
      memo: draft.memo.trim(),
      isActive: draft.isActive,
    };
  };

  const openPersonAccountModal = (personId: string) => {
    setAccountOwnerPersonId(personId);
    setAccountDraft(createAccountDraftForPerson(personId));
  };

  const closePersonAccountModal = () => {
    setAccountOwnerPersonId(null);
    setAccountDraft(EMPTY_PERSON_ACCOUNT_DRAFT);
  };

  const patchAccountDraft = (patch: Partial<PersonAccountDraftState>) => {
    setAccountDraft((current) => {
      const next = { ...current, ...patch };
      if (next.isShared) {
        next.ownerPersonId = "";
        next.usageType = "shared";
      } else {
        if (!next.ownerPersonId && accountOwnerPersonId) next.ownerPersonId = accountOwnerPersonId;
        if (next.usageType === "shared") next.usageType = "daily";
      }
      return next;
    });
  };

  const accountOwner = accountOwnerPersonId ? people.find((person) => person.id === accountOwnerPersonId) ?? null : null;

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 관리</span>
            <h2 className="section-title">사용자</h2>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreateDraft(EMPTY_PERSON_DRAFT);
              setIsCreateModalOpen(true);
            }}
          >
            사용자 등록
          </button>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 목록</span>
            <h2 className="section-title">등록된 사용자 관리</h2>
          </div>
          <span className="badge text-bg-dark">{people.length}명</span>
        </div>
        {!people.length ? (
          <EmptyStateCallout
            kicker="첫 단계"
            title="입력과 업로드에 연결할 사용자를 먼저 등록해주세요"
            description="사용자가 정리되어 있어야 계좌, 카드, 업로드 매핑이 자연스럽게 이어집니다."
            actions={
              <>
                <Link to="/settings?tab=accounts" className="btn btn-outline-primary btn-sm">
                  계좌 관리 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 화면 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid compact-resource-grid">
            {people.map((person, index) => {
              const usage = getPersonUsageSummary(transactions, person.id);
              const isExpanded = expandedPersonId === person.id;
              const linkedAccounts = accountsByPersonId.get(person.id) ?? [];
              const linkedCards = cardsByPersonId.get(person.id) ?? [];

              return (
                <article key={person.id} className={`resource-card compact-resource-card${isExpanded ? " expanded" : ""}`} style={getMotionStyle(index + 2)}>
                  <div className="compact-card-summary">
                    <div>
                      <div className="compact-card-meta">
                        <span className={`badge ${person.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                          {person.isActive ? "사용 중" : "보관"}
                        </span>
                        <span className="compact-card-caption">{getPersonRoleLabel(person.role)}</span>
                      </div>
                      <h3 className="mb-1">{person.displayName || person.name}</h3>
                      <p className="mb-1 text-secondary">{person.name !== person.displayName ? `원본 이름 ${person.name}` : " "}</p>
                      <p className="mb-0 text-secondary">거래 {usage.transactionCount}건</p>
                    </div>
                    <div className="compact-card-actions">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setEditingPersonId(person.id);
                          setEditDraft(createDraftFromPerson(person));
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="expand-toggle-button"
                        onClick={() => setExpandedPersonId((current) => (current === person.id ? null : person.id))}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "상세 닫기" : "상세 펼치기"}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="compact-card-details">
                      <div className="compact-detail-grid">
                        <div>
                          <span className="section-kicker">역할</span>
                          <strong>{getPersonRoleLabel(person.role)}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">상태</span>
                          <strong>{person.isActive ? "사용 중" : "보관"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">거래 수</span>
                          <strong>{usage.transactionCount}건</strong>
                        </div>
                      </div>
                      <div className="compact-detail-grid">
                        <div>
                          <span className="section-kicker">등록 계좌</span>
                          <strong>{linkedAccounts.length}개</strong>
                        </div>
                        <div>
                          <span className="section-kicker">등록 카드</span>
                          <strong>{linkedCards.length}개</strong>
                        </div>
                      </div>
                      <div className="person-asset-grid">
                        {linkedAccounts.map((account) => (
                          <article key={account.id} className="person-asset-card">
                            <strong>{account.alias || account.name}</strong>
                            <span>{account.institutionName || "직접 입력"}</span>
                          </article>
                        ))}
                        <button
                          type="button"
                          className="person-asset-card person-asset-card-add"
                          onClick={() => openPersonAccountModal(person.id)}
                          aria-label={`${person.displayName || person.name} 계좌 추가`}
                        >
                          <span className="person-asset-plus">+</span>
                          <span>계좌 추가</span>
                        </button>
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {linkedCards.length ? (
                          linkedCards.map((card) => (
                            <span key={card.id} className="badge text-bg-light">
                              {card.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-secondary small">아직 연결된 카드가 없습니다.</span>
                        )}
                      </div>
                      {person.memo ? <div className="compact-note">{person.memo}</div> : null}
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
        title="사용자 등록"
        description="이름과 표시 이름만 먼저 맞춰두면 연결 흐름이 훨씬 자연스러워집니다."
        onClose={() => setIsCreateModalOpen(false)}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = normalizeDraftValues(createDraft);
            if (!values.name) return;
            addPerson(workspaceId, values);
            setIsCreateModalOpen(false);
            setCreateDraft(EMPTY_PERSON_DRAFT);
          }}
        >
          <label>
            이름
            <input className="form-control" value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            표시 이름
            <input className="form-control" value={createDraft.displayName} onChange={(event) => setCreateDraft((current) => ({ ...current, displayName: event.target.value }))} />
          </label>
          <label>
            역할
            <select className="form-select" value={createDraft.role} onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value === "owner" ? "owner" : "member" }))}>
              <option value="owner">기본 사용자</option>
              <option value="member">구성원</option>
            </select>
          </label>
          <label className="compact-check">
            <span className="fw-semibold">현재 사용 중</span>
            <input
              type="checkbox"
              className="form-check-input mt-0"
              checked={createDraft.isActive}
              onChange={(event) => setCreateDraft((current) => ({ ...current, isActive: event.target.checked }))}
            />
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
        open={Boolean(accountOwner)}
        title="계좌 등록"
        description={
          accountOwner
            ? `${accountOwner.displayName || accountOwner.name} 사용자 카드 안에서 바로 계좌를 추가합니다.`
            : ""
        }
        onClose={closePersonAccountModal}
      >
        {accountOwner ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeAccountDraftValues(accountDraft);
              if (!values.name) return;
              addAccount(workspaceId, values);
              closePersonAccountModal();
            }}
          >
            <label>
              계좌 이름
              <input className="form-control" value={accountDraft.name} onChange={(event) => patchAccountDraft({ name: event.target.value })} />
            </label>
            <label>
              표시명
              <input className="form-control" value={accountDraft.alias} onChange={(event) => patchAccountDraft({ alias: event.target.value })} />
            </label>
            <label>
              금융기관
              <input className="form-control" value={accountDraft.institutionName} onChange={(event) => patchAccountDraft({ institutionName: event.target.value })} />
            </label>
            <label>
              계좌 번호
              <input className="form-control" value={accountDraft.accountNumberMasked} onChange={(event) => patchAccountDraft({ accountNumberMasked: event.target.value })} />
            </label>
            <label>
              소유자
              <select
                className="form-select"
                value={accountDraft.ownerPersonId}
                disabled={accountDraft.isShared}
                onChange={(event) => patchAccountDraft({ ownerPersonId: event.target.value })}
              >
                <option value="">공동 또는 미지정</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName || person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              계좌 유형
              <select
                className="form-select"
                value={accountDraft.accountType}
                onChange={(event) => patchAccountDraft({ accountType: event.target.value as PersonAccountDraftState["accountType"] })}
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              용도
              <select
                className="form-select"
                value={accountDraft.isShared ? "shared" : accountDraft.usageType}
                disabled={accountDraft.isShared}
                onChange={(event) => patchAccountDraft({ usageType: event.target.value as AccountUsageType })}
              >
                {ACCOUNT_USAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-check">
              <span className="fw-semibold">공동 자금 계좌</span>
              <input
                type="checkbox"
                className="form-check-input mt-0"
                checked={accountDraft.isShared}
                onChange={(event) => patchAccountDraft({ isShared: event.target.checked })}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={accountDraft.memo} onChange={(event) => patchAccountDraft({ memo: event.target.value })} />
            </label>
            <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" type="submit">
                저장
              </button>
            </div>
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={Boolean(editingPerson)}
        title="사용자 수정"
        description="필터와 연결 규칙에 닿는 정보만 빠르게 수정할 수 있습니다."
        onClose={() => {
          setEditingPersonId(null);
          setEditDraft(EMPTY_PERSON_DRAFT);
        }}
      >
        {editingPerson ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeDraftValues(editDraft);
              if (!values.name) return;
              updatePerson(workspaceId, editingPerson.id, values);
              setEditingPersonId(null);
              setEditDraft(EMPTY_PERSON_DRAFT);
            }}
          >
            <label>
              이름
              <input className="form-control" value={editDraft.name} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              표시 이름
              <input className="form-control" value={editDraft.displayName} onChange={(event) => setEditDraft((current) => ({ ...current, displayName: event.target.value }))} />
            </label>
            <label>
              역할
              <select className="form-select" value={editDraft.role} onChange={(event) => setEditDraft((current) => ({ ...current, role: event.target.value === "owner" ? "owner" : "member" }))}>
                <option value="owner">기본 사용자</option>
                <option value="member">구성원</option>
              </select>
            </label>
            <label className="compact-check">
              <span className="fw-semibold">현재 사용 중</span>
              <input
                type="checkbox"
                className="form-check-input mt-0"
                checked={editDraft.isActive}
                onChange={(event) => setEditDraft((current) => ({ ...current, isActive: event.target.checked }))}
              />
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

