import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { AppModal } from "../components/AppModal";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

type PersonDraftState = {
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
};

const EMPTY_PERSON_DRAFT: PersonDraftState = {
  name: "",
  displayName: "",
  role: "member",
  memo: "",
  isActive: true,
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

export function PeoplePage() {
  const { addPerson, state, updatePerson } = useAppState();
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<PersonDraftState>(EMPTY_PERSON_DRAFT);
  const [editDraft, setEditDraft] = useState<PersonDraftState>(EMPTY_PERSON_DRAFT);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const people = scope.people;
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

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 관리</span>
            <h2 className="section-title">사람</h2>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreateDraft(EMPTY_PERSON_DRAFT);
              setIsCreateModalOpen(true);
            }}
          >
            사람 등록
          </button>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 목록</span>
            <h2 className="section-title">등록된 사람 관리</h2>
          </div>
          <span className="badge text-bg-dark">{people.length}명</span>
        </div>
        {!people.length ? (
          <EmptyStateCallout
            kicker="첫 단계"
            title="입력과 업로드에 연결할 사람을 먼저 등록해주세요"
            description="사람이 정리되어 있어야 계좌, 카드, 업로드 매핑이 자연스럽게 이어집니다."
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
                      <p className="mb-0 text-secondary">
                        거래 {usage.transactionCount}건 · 공동지출 {formatCurrency(usage.sharedExpenseAmount)}
                      </p>
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
                        <div>
                          <span className="section-kicker">공동지출</span>
                          <strong>{formatCurrency(usage.sharedExpenseAmount)}</strong>
                        </div>
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
        title="사람 등록"
        description="이름과 표시 이름만 먼저 맞춰도 연결 흐름이 훨씬 안정적입니다."
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
        open={Boolean(editingPerson)}
        title="사람 수정"
        description="필터와 연결 규칙에 쓰는 정보만 빠르게 수정할 수 있습니다."
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
