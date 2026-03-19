import { Link } from "react-router-dom";
import { getAccountUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
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

export function AccountsPage() {
  const { addAccount, state, updateAccount } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const accounts = scope.accounts;
  const people = scope.people.filter((person) => person.isActive);
  const personMap = new Map(scope.people.map((person) => [person.id, person.displayName || person.name]));
  const transactions = getActiveTransactions(scope.transactions);
  const getOwnerOptions = (ownerPersonId: string | null) =>
    ownerPersonId ? scope.people.filter((person) => person.isActive || person.id === ownerPersonId) : people;
  const getAccountFormValues = (formData: FormData) => {
    const isShared = formData.get("isShared") === "on";
    return {
      ownerPersonId: isShared ? null : String(formData.get("ownerPersonId") ?? "") || null,
      name: String(formData.get("name") ?? "").trim(),
      alias: String(formData.get("alias") ?? "").trim(),
      institutionName: String(formData.get("institutionName") ?? "").trim(),
      accountNumberMasked: String(formData.get("accountNumberMasked") ?? "").trim(),
      accountType: String(formData.get("accountType") ?? "checking") as "checking" | "savings" | "loan" | "cash" | "other",
      usageType: String(formData.get("usageType") ?? "daily") as
        | "daily"
        | "salary"
        | "shared"
        | "card_payment"
        | "savings"
        | "investment"
        | "loan"
        | "other",
      isShared,
      memo: String(formData.get("memo") ?? "").trim(),
    };
  };

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">자산 관리</span>
            <h2 className="section-title">계좌</h2>
          </div>
        </div>
        <p className="text-secondary">
          계좌는 업로드 매핑과 카드 결제 연결의 기준점입니다. 표시명과 용도까지 잡아두면 거래 흐름을 계좌 단위로 훨씬 안정적으로 읽을 수
          있습니다.
        </p>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const values = getAccountFormValues(formData);
            if (!values.name) return;

            addAccount(workspaceId, values);

            event.currentTarget.reset();
          }}
        >
          <label>
            계좌 이름
            <input name="name" className="form-control" placeholder="예: 형준 월급통장" />
          </label>
          <label>
            표시명
            <input name="alias" className="form-control" placeholder="짧게 보여줄 이름" />
          </label>
          <label>
            금융기관
            <input name="institutionName" className="form-control" placeholder="예: 국민은행" />
          </label>
          <label>
            계좌 끝번호
            <input name="accountNumberMasked" className="form-control" placeholder="예: 5850" />
          </label>
          <label>
            소유자
            <select name="ownerPersonId" className="form-select" defaultValue="">
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
            <select name="accountType" className="form-select" defaultValue="checking">
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            용도
            <select name="usageType" className="form-select" defaultValue="daily">
              {ACCOUNT_USAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-check">
            <span className="fw-semibold">공동 자금 계좌</span>
            <input name="isShared" type="checkbox" className="form-check-input mt-0" />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea name="memo" className="form-control" rows={3} placeholder="업로드 파일 이름, 이체 규칙, 카드 결제 계좌 여부 등을 적어둘 수 있습니다." />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              계좌 추가
            </button>
          </div>
        </form>
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
                <Link to="/cards" className="btn btn-outline-primary btn-sm">
                  카드 관리 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 화면 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid">
            {accounts.map((account, index) => {
              const usage = getAccountUsageSummary(transactions, account.id);

              return (
                <article key={account.id} className="resource-card" style={getMotionStyle(index + 2)}>
                  <div className="w-100 d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <h3 className="mb-1">{account.alias || account.name}</h3>
                      <p className="mb-1 text-secondary">
                        {account.name !== account.alias && account.alias ? `원본 이름 ${account.name}` : account.institutionName}
                      </p>
                      <p className="mb-0 text-secondary">
                        {account.isShared ? "공동 계좌" : personMap.get(account.ownerPersonId ?? "") ?? "미지정"} · 지출 {formatCurrency(usage.expenseAmount)} ·
                        내부이체 {usage.internalTransferCount}건
                      </p>
                    </div>
                    <span className={`badge ${account.isShared ? "text-bg-success" : "text-bg-secondary"}`}>{account.isShared ? "공동" : "개인"}</span>
                  </div>

                  <form
                    className="profile-form w-100"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const values = getAccountFormValues(formData);
                      if (!values.name) return;

                      updateAccount(workspaceId, account.id, values);
                    }}
                  >
                    <label>
                      계좌 이름
                      <input name="name" className="form-control" defaultValue={account.name} />
                    </label>
                    <label>
                      표시명
                      <input name="alias" className="form-control" defaultValue={account.alias} />
                    </label>
                    <label>
                      금융기관
                      <input name="institutionName" className="form-control" defaultValue={account.institutionName} />
                    </label>
                    <label>
                      계좌 끝번호
                      <input name="accountNumberMasked" className="form-control" defaultValue={account.accountNumberMasked} />
                    </label>
                    <label>
                      소유자
                      <select name="ownerPersonId" className="form-select" defaultValue={account.ownerPersonId ?? ""}>
                        <option value="">공동 또는 미지정</option>
                        {getOwnerOptions(account.ownerPersonId).map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName || person.name}
                            {!person.isActive ? " (보관됨)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      계좌 유형
                      <select name="accountType" className="form-select" defaultValue={account.accountType}>
                        {ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      용도
                      <select name="usageType" className="form-select" defaultValue={account.usageType}>
                        {ACCOUNT_USAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="compact-check">
                      <span className="fw-semibold">공동 자금 계좌</span>
                      <input name="isShared" type="checkbox" className="form-check-input mt-0" defaultChecked={account.isShared} />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      메모
                      <textarea name="memo" className="form-control" rows={3} defaultValue={account.memo} />
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
