import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function SettingsPage() {
  const { exportState, importState, resetApp, setFinancialProfile, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const profile = getWorkspaceScope(state, workspaceId).financialProfile;

  return (
    <div className="page-grid">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">재무 기준선</span>
            <h2 className="section-title">월 수입과 경고 기준</h2>
          </div>
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
            <input name="warningFixedCostRate" type="number" className="form-control" defaultValue={Math.round((profile?.warningFixedCostRate ?? 0) * 100)} />
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
          이 앱은 로컬 우선 구조이므로 JSON 백업/복원 기능을 기본 제공합니다. 다른 기기에서도 같은 파일을 불러와 이어서 사용할 수 있습니다.
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
            <h2 className="section-title">개발 중 재시작</h2>
          </div>
        </div>
        <p className="text-secondary">개발 중 테스트를 반복할 수 있도록 전체 저장소를 초기화합니다.</p>
        <button className="btn btn-outline-danger" onClick={() => void resetApp()}>
          전체 데이터 초기화
        </button>
      </section>
    </div>
  );
}
