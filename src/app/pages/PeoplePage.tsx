import { Link } from "react-router-dom";
import { getPersonUsageSummary } from "../../domain/assets/usageSummary";
import { getActiveTransactions } from "../../domain/transactions/meta";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function getPersonRoleLabel(role: "owner" | "member") {
  return role === "owner" ? "기본 사용자" : "구성원";
}

export function PeoplePage() {
  const { addPerson, state, updatePerson } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const people = scope.people;
  const transactions = getActiveTransactions(scope.transactions);

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">구성원 관리</span>
            <h2 className="section-title">사람</h2>
          </div>
        </div>
        <p className="text-secondary">
          업로드와 수기 입력이 누구 것인지 연결되려면 사람 정보가 먼저 정리되어 있어야 합니다. 표시 이름과 역할을 먼저 맞춰두면
          정산과 필터 흐름도 자연스럽게 이어집니다.
        </p>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = String(formData.get("name") ?? "").trim();
            if (!name) return;

            addPerson(workspaceId, {
              name,
              displayName: String(formData.get("displayName") ?? "").trim() || name,
              role: String(formData.get("role") ?? "member") === "owner" ? "owner" : "member",
              memo: String(formData.get("memo") ?? "").trim(),
              isActive: formData.get("isActive") === "on",
            });

            event.currentTarget.reset();
          }}
        >
          <label>
            이름
            <input name="name" className="form-control" placeholder="예: 형준" />
          </label>
          <label>
            표시 이름
            <input name="displayName" className="form-control" placeholder="화면에 보여줄 이름" />
          </label>
          <label>
            역할
            <select name="role" className="form-select" defaultValue="member">
              <option value="owner">기본 사용자</option>
              <option value="member">구성원</option>
            </select>
          </label>
          <label className="compact-check">
            <span className="fw-semibold">현재 사용 중</span>
            <input name="isActive" type="checkbox" className="form-check-input mt-0" defaultChecked />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            메모
            <textarea name="memo" className="form-control" rows={3} placeholder="업로드 파일에서 쓰는 이름, 정산 주의사항 등을 적어둘 수 있습니다." />
          </label>
          <div className="d-flex justify-content-end" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              사람 추가
            </button>
          </div>
        </form>
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
                <Link to="/accounts" className="btn btn-outline-primary btn-sm">
                  계좌 관리 보기
                </Link>
                <Link to="/imports" className="btn btn-outline-secondary btn-sm">
                  업로드 흐름 보기
                </Link>
              </>
            }
          />
        ) : (
          <div className="resource-grid">
            {people.map((person, index) => {
              const usage = getPersonUsageSummary(transactions, person.id);

              return (
                <article key={person.id} className="resource-card" style={getMotionStyle(index + 2)}>
                  <div className="w-100 d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <h3 className="mb-1">{person.displayName || person.name}</h3>
                      <p className="mb-1 text-secondary">{person.name !== person.displayName ? `원본 이름 ${person.name}` : getPersonRoleLabel(person.role)}</p>
                      <p className="mb-0 text-secondary">
                        거래 {usage.transactionCount}건 · 공동지출 {formatCurrency(usage.sharedExpenseAmount)}
                      </p>
                    </div>
                    <span className={`badge ${person.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                      {person.isActive ? "사용 중" : "보관"}
                    </span>
                  </div>

                  <form
                    className="profile-form w-100"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const name = String(formData.get("name") ?? "").trim();
                      if (!name) return;

                      updatePerson(workspaceId, person.id, {
                        name,
                        displayName: String(formData.get("displayName") ?? "").trim() || name,
                        role: String(formData.get("role") ?? "member") === "owner" ? "owner" : "member",
                        memo: String(formData.get("memo") ?? "").trim(),
                        isActive: formData.get("isActive") === "on",
                      });
                    }}
                  >
                    <label>
                      이름
                      <input name="name" className="form-control" defaultValue={person.name} />
                    </label>
                    <label>
                      표시 이름
                      <input name="displayName" className="form-control" defaultValue={person.displayName} />
                    </label>
                    <label>
                      역할
                      <select name="role" className="form-select" defaultValue={person.role}>
                        <option value="owner">기본 사용자</option>
                        <option value="member">구성원</option>
                      </select>
                    </label>
                    <label className="compact-check">
                      <span className="fw-semibold">현재 사용 중</span>
                      <input name="isActive" type="checkbox" className="form-check-input mt-0" defaultChecked={person.isActive} />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      메모
                      <textarea name="memo" className="form-control" rows={3} defaultValue={person.memo} />
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
