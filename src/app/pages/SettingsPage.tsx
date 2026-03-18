import { formatCurrency, formatPercent } from "../../shared/utils/format";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function SettingsPage() {
  const { exportState, importState, resetApp, setFinancialProfile, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const profile = getWorkspaceScope(state, workspaceId).financialProfile;
  const hasBaseline = Boolean(profile?.monthlyNetIncome);

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">재무 기준선</span>
            <h2 className="section-title">월 수입과 경고 기준</h2>
          </div>
        </div>
        <p className="text-secondary">
          기준값이 있어야 지출률, 저축률, 과소비 경고가 제대로 동작합니다. 아직 정확한 금액이 아니어도 대략적인 값부터 넣고 나중에
          조정해도 괜찮습니다.
        </p>
        <div className="resource-grid mb-4">
          <article className="resource-card">
            <h3>월 순수입</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatCurrency(profile?.monthlyNetIncome ?? 0) : "아직 입력 전"}
            </p>
          </article>
          <article className="resource-card">
            <h3>목표 저축률</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.targetSavingsRate ?? 0) : "입력 필요"}
            </p>
          </article>
          <article className="resource-card">
            <h3>지출 경고 기준</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.warningSpendRate ?? 0) : "입력 필요"}
            </p>
          </article>
          <article className="resource-card">
            <h3>고정지출 경고 기준</h3>
            <p className="mb-0 text-secondary">
              {hasBaseline ? formatPercent(profile?.warningFixedCostRate ?? 0) : "입력 필요"}
            </p>
          </article>
        </div>
        <div className="guide-progress mb-4">
          <span className="section-kicker">입력하면 바로 좋아지는 것</span>
          <ul className="next-step-list mt-3">
            <li>대시보드에서 지출률과 저축률이 단순 숫자가 아니라 경고 단계로 해석됩니다.</li>
            <li>이번 달 소비가 많은지, 아직 괜찮은지 더 명확하게 안내할 수 있습니다.</li>
            <li>재무 코치 메모가 실제 기준선을 바탕으로 조언하도록 바뀝니다.</li>
          </ul>
        </div>
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setFinancialProfile(workspaceId, {
              monthlyNetIncome: Number(formData.get("monthlyNetIncome") || 0),
              targetSavingsRate: Number(formData.get("targetSavingsRate") || 0) / 100,
              warningSpendRate: Number(formData.get("warningSpendRate") || 0) / 100,
              warningFixedCostRate: Number(formData.get("warningFixedCostRate") || 0) / 100,
            });
          }}
        >
          <label>
            <span>월 순수입</span>
            <input name="monthlyNetIncome" type="number" className="form-control" defaultValue={profile?.monthlyNetIncome ?? 0} />
          </label>
          <label>
            <span>목표 저축률 (%)</span>
            <input name="targetSavingsRate" type="number" className="form-control" defaultValue={Math.round((profile?.targetSavingsRate ?? 0) * 100)} />
          </label>
          <label>
            <span>지출 경고 기준 (%)</span>
            <input name="warningSpendRate" type="number" className="form-control" defaultValue={Math.round((profile?.warningSpendRate ?? 0) * 100)} />
          </label>
          <label>
            <span>고정지출 경고 기준 (%)</span>
            <input
              name="warningFixedCostRate"
              type="number"
              className="form-control"
              defaultValue={Math.round((profile?.warningFixedCostRate ?? 0) * 100)}
            />
          </label>
          <button className="btn btn-primary" type="submit">
            기준 저장
          </button>
        </form>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">백업 / 복원</span>
            <h2 className="section-title">서버리스 데이터 이동</h2>
          </div>
        </div>
        <p className="text-secondary">
          이 앱은 로컬 저장 구조이므로 백업 파일이 중요합니다. 다른 기기에서 이어서 쓰고 싶다면 내보내기와 가져오기를 기본 루틴처럼
          사용하면 됩니다.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => exportState()}>
            전체 데이터 내보내기
          </button>
          <label className="btn btn-outline-primary">
            백업 파일 가져오기
            <input
              hidden
              type="file"
              accept=".json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importState(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">앱 관리</span>
            <h2 className="section-title">개발 중 테스트용</h2>
          </div>
        </div>
        {!profile?.monthlyNetIncome ? (
          <EmptyStateCallout
            kicker="기준선 필요"
            title="먼저 월 수입을 입력해주세요"
            description="지금은 기준선이 비어 있어서 저축률과 과소비 가이드가 약하게 동작합니다. 위 입력 폼부터 먼저 채워보세요."
          />
        ) : (
          <div className="guide-progress">
            <span className="section-kicker">현재 기준선 상태</span>
            <ul className="next-step-list mt-3">
              <li>월 순수입 {formatCurrency(profile.monthlyNetIncome)} 기준으로 지출률과 저축률을 계산합니다.</li>
              <li>지출 경고 기준 {formatPercent(profile.warningSpendRate)}를 넘기면 대시보드 경고가 강해집니다.</li>
              <li>고정지출이 {formatPercent(profile.warningFixedCostRate)}를 넘기면 구조적 비용 부담 경고가 켜집니다.</li>
            </ul>
            <p className="text-secondary mb-0 mt-3">개발 중 반복 테스트가 필요할 때 아래에서 전체 로컬 데이터를 초기화할 수 있습니다.</p>
          </div>
        )}
        <button className="btn btn-outline-danger mt-3" onClick={() => void resetApp()}>
          전체 데이터 초기화
        </button>
      </section>
    </div>
  );
}
