import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { getAccountUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
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
  { value: "daily", label: "일반 생활비" },
  { value: "salary", label: "급여 수령" },
  { value: "shared", label: "공동 자금" },
  { value: "card_payment", label: "카드 결제" },
  { value: "savings", label: "저축" },
  { value: "investment", label: "투자" },
  { value: "loan", label: "대출 관리" },
  { value: "other", label: "기타" },
] as const;

type AccountUsageType = (typeof ACCOUNT_USAGE_OPTIONS)[number]["value"];

type AccountDraftState = {
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

const EMPTY_ACCOUNT_DRAFT: AccountDraftState = {
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

function createDraftFromAccount(account?: {
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  ownerPersonId: string | null;
  accountType: AccountDraftState["accountType"];
  usageType: AccountUsageType;
  isShared: boolean;
  memo: string;
}): AccountDraftState {
  if (!account) return EMPTY_ACCOUNT_DRAFT;
  return {
    name: account.name,
    alias: account.alias,
    institutionName: account.institutionName,
    accountNumberMasked: account.accountNumberMasked,
    ownerPersonId: account.ownerPersonId ?? "",
    accountType: account.accountType,
    usageType: account.isShared ? "shared" : account.usageType,
    isShared: account.isShared,
    memo: account.memo,
  };
}

function normalizeDraftValues(draft: AccountDraftState) {
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

export function AccountsPage() {
  const { addAccount, state, updateAccount } = useAppState();
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AccountDraftState>(EMPTY_ACCOUNT_DRAFT);
  const [editDraft, setEditDraft] = useState<AccountDraftState>(EMPTY_ACCOUNT_DRAFT);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const accounts = scope.accounts;
  const people = scope.people.filter((person) => person.isActive);
  const personMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const transactions = getActiveTransactions(scope.transactions);

  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId],
  );

  const openCreateModal = () => {
    setCreateDraft(EMPTY_ACCOUNT_DRAFT);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    setEditingAccountId(accountId);
    setEditDraft(createDraftFromAccount(account));
  };

  const getOwnerOptions = (ownerPersonId: string | null) =>
    ownerPersonId ? scope.people.filter((person) => person.isActive || person.id === ownerPersonId) : people;

  const handleDraftPatch = (
    updater: Dispatch<SetStateAction<AccountDraftState>>,
    patch: Partial<AccountDraftState>,
  ) => {
    updater((current) => {
      const next = { ...current, ...patch };
      if (next.isShared) {
        next.ownerPersonId = "";
        next.usageType = "shared";
      } else if (next.usageType === "shared") {
        next.usageType = "daily";
      }
      return next;
    });
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">자산 관리</span>
            <h2 className="section-title">계좌</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            계좌 등록
          </button>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">계좌 목록</span>
            <h2 className="section-title">등록된 계좌 관리</h2>
          </div>
          <span className="badge text-bg-dark">{accounts.length}개</span>
        </div>
        {!accounts.length ? (
          <EmptyStateCallout
            kicker="자산 준비"
            title="분석 전에 계좌를 먼저 등록해주세요"
            description="생활비, 카드결제, 급여통장처럼 역할이 다른 계좌를 먼저 구분해두면 업로드와 거래 분류가 훨씬 수월해집니다."
            actions={
              <>
                <Link to="/settings?tab=cards" className="btn btn-outline-primary btn-sm">
                  카드 관리 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 화면 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid compact-resource-grid">
            {accounts.map((account, index) => {
              const usage = getAccountUsageSummary(transactions, account.id);
              const isExpanded = expandedAccountId === account.id;
              const usageLabel = ACCOUNT_USAGE_OPTIONS.find((option) => option.value === (account.isShared ? "shared" : account.usageType))?.label ?? "기타";

              return (
                <article key={account.id} className={`resource-card compact-resource-card${isExpanded ? " expanded" : ""}`} style={getMotionStyle(index + 2)}>
                  <div className="compact-card-summary">
                    <div>
                      <div className="compact-card-meta">
                        <span className={`badge ${account.isShared ? "text-bg-success" : "text-bg-secondary"}`}>{account.isShared ? "공동" : "개인"}</span>
                        <span className="compact-card-caption">{usageLabel}</span>
                      </div>
                      <h3 className="mb-1">{account.alias || account.name}</h3>
                      <p className="mb-1 text-secondary">{account.institutionName || "직접입력"}</p>
                      <p className="mb-0 text-secondary">
                        {account.isShared ? "공동 계좌" : personMap.get(account.ownerPersonId ?? "") ?? "미지정"} · 지출 {formatCurrency(usage.expenseAmount)}
                      </p>
                    </div>
                    <div className="compact-card-actions">
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEditModal(account.id)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className="expand-toggle-button"
                        onClick={() => setExpandedAccountId((current) => (current === account.id ? null : account.id))}
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
                          <strong>{account.isShared ? "공동" : personMap.get(account.ownerPersonId ?? "") ?? "미지정"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">계좌 유형</span>
                          <strong>{ACCOUNT_TYPE_OPTIONS.find((option) => option.value === account.accountType)?.label ?? "기타"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">끝번호</span>
                          <strong>{account.accountNumberMasked || "-"}</strong>
                        </div>
                        <div>
                          <span className="section-kicker">내부이체</span>
                          <strong>{usage.internalTransferCount}건</strong>
                        </div>
                      </div>
                      {account.memo ? <div className="compact-note">{account.memo}</div> : null}
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
        title="계좌 등록"
        description="주요 정보만 먼저 입력하고, 필요할 때 다시 수정하면 됩니다."
        onClose={() => setIsCreateModalOpen(false)}
      >
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = normalizeDraftValues(createDraft);
            if (!values.name) return;
            addAccount(workspaceId, values);
            setIsCreateModalOpen(false);
            setCreateDraft(EMPTY_ACCOUNT_DRAFT);
          }}
        >
          <label>
            계좌 이름
            <input
              className="form-control"
              value={createDraft.name}
              onChange={(event) => handleDraftPatch(setCreateDraft, { name: event.target.value })}
            />
          </label>
          <label>
            표시명
            <input
              className="form-control"
              value={createDraft.alias}
              onChange={(event) => handleDraftPatch(setCreateDraft, { alias: event.target.value })}
            />
          </label>
          <label>
            금융기관
            <input
              className="form-control"
              value={createDraft.institutionName}
              onChange={(event) => handleDraftPatch(setCreateDraft, { institutionName: event.target.value })}
            />
          </label>
          <label>
            계좌 끝번호
            <input
              className="form-control"
              value={createDraft.accountNumberMasked}
              onChange={(event) => handleDraftPatch(setCreateDraft, { accountNumberMasked: event.target.value })}
            />
          </label>
          <label>
            소유자
            <select
              className="form-select"
              value={createDraft.ownerPersonId}
              disabled={createDraft.isShared}
              onChange={(event) => handleDraftPatch(setCreateDraft, { ownerPersonId: event.target.value })}
            >
              <option value="">공동 또는 미지정</option>
              {people.map((person) => (
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
              value={createDraft.accountType}
              onChange={(event) => handleDraftPatch(setCreateDraft, { accountType: event.target.value as AccountDraftState["accountType"] })}
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
              value={createDraft.isShared ? "shared" : createDraft.usageType}
              disabled={createDraft.isShared}
              onChange={(event) => handleDraftPatch(setCreateDraft, { usageType: event.target.value as AccountUsageType })}
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
              checked={createDraft.isShared}
              onChange={(event) => handleDraftPatch(setCreateDraft, { isShared: event.target.checked })}
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea
              className="form-control"
              rows={3}
              value={createDraft.memo}
              onChange={(event) => handleDraftPatch(setCreateDraft, { memo: event.target.value })}
            />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              저장
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={Boolean(editingAccount)}
        title="계좌 수정"
        description="연결 규칙은 유지하고, 필요한 정보만 바로 고칠 수 있습니다."
        onClose={() => {
          setEditingAccountId(null);
          setEditDraft(EMPTY_ACCOUNT_DRAFT);
        }}
      >
        {editingAccount ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = normalizeDraftValues(editDraft);
              if (!values.name) return;
              updateAccount(workspaceId, editingAccount.id, values);
              setEditingAccountId(null);
              setEditDraft(EMPTY_ACCOUNT_DRAFT);
            }}
          >
            <label>
              계좌 이름
              <input className="form-control" value={editDraft.name} onChange={(event) => handleDraftPatch(setEditDraft, { name: event.target.value })} />
            </label>
            <label>
              표시명
              <input className="form-control" value={editDraft.alias} onChange={(event) => handleDraftPatch(setEditDraft, { alias: event.target.value })} />
            </label>
            <label>
              금융기관
              <input className="form-control" value={editDraft.institutionName} onChange={(event) => handleDraftPatch(setEditDraft, { institutionName: event.target.value })} />
            </label>
            <label>
              계좌 끝번호
              <input className="form-control" value={editDraft.accountNumberMasked} onChange={(event) => handleDraftPatch(setEditDraft, { accountNumberMasked: event.target.value })} />
            </label>
            <label>
              소유자
              <select
                className="form-select"
                value={editDraft.ownerPersonId}
                disabled={editDraft.isShared}
                onChange={(event) => handleDraftPatch(setEditDraft, { ownerPersonId: event.target.value })}
              >
                <option value="">공동 또는 미지정</option>
                {getOwnerOptions(editingAccount.ownerPersonId).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName || person.name}
                    {!person.isActive ? " (보관됨)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              계좌 유형
              <select
                className="form-select"
                value={editDraft.accountType}
                onChange={(event) => handleDraftPatch(setEditDraft, { accountType: event.target.value as AccountDraftState["accountType"] })}
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
                value={editDraft.isShared ? "shared" : editDraft.usageType}
                disabled={editDraft.isShared}
                onChange={(event) => handleDraftPatch(setEditDraft, { usageType: event.target.value as AccountUsageType })}
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
                checked={editDraft.isShared}
                onChange={(event) => handleDraftPatch(setEditDraft, { isShared: event.target.checked })}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              메모
              <textarea className="form-control" rows={3} value={editDraft.memo} onChange={(event) => handleDraftPatch(setEditDraft, { memo: event.target.value })} />
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
