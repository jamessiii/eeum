import { Link } from "react-router-dom";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ImportsPage() {
  const { importWorkbook, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const imports = [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const openReviews = scope.reviews.filter((item) => item.status === "open").length;
  const uncategorizedCount = scope.transactions.filter(
    (item) => item.status === "active" && item.isExpenseImpact && !item.categoryId,
  ).length;

  return (
    <div className="page-stack">
      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 센터</span>
            <h2 className="section-title">워크북 가져오기</h2>
          </div>
        </div>
        <p className="text-secondary">
          현재는 <strong>가계부 v2 워크북</strong> 업로드를 지원합니다. 현대카드, 우리카드, 삼성카드 명세서와 일반화된 규칙 기반
          파서는 2차 작업으로 남겨두고 있습니다.
        </p>

        <label className="upload-dropzone">
          <div>
            <strong>엑셀 워크북 업로드</strong>
            <p className="mb-0 text-secondary">업로드한 파일로 새로운 워크스페이스를 만들고 거래와 검토 항목을 정규화합니다.</p>
          </div>
          <input
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importWorkbook(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 다음 단계</span>
            <h2 className="section-title">바로 이어서 할 일</h2>
          </div>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card">
            <span className="stat-label">1단계</span>
            <strong>검토함 확인</strong>
            <div className="small text-secondary mt-2">중복, 환불, 내부이체 후보를 먼저 정리하면 지출 통계가 더 정확해집니다.</div>
            <Link to="/reviews" className="btn btn-outline-secondary btn-sm mt-3">
              검토함 열기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">2단계</span>
            <strong>반복 지출 분류</strong>
            <div className="small text-secondary mt-2">반복 가맹점은 한 번 분류하면 여러 거래에 한꺼번에 반영할 수 있습니다.</div>
            <Link to="/categories" className="btn btn-outline-primary btn-sm mt-3">
              분류 화면 열기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">3단계</span>
            <strong>대시보드 확인</strong>
            <div className="small text-secondary mt-2">검토와 분류가 끝날수록 이번 달 소비 진단과 저축률 가이드가 믿을 만해집니다.</div>
            <Link to="/" className="btn btn-primary btn-sm mt-3">
              대시보드 보기
            </Link>
          </article>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 이력</span>
            <h2 className="section-title">가져온 파일 기록</h2>
          </div>
          <span className="badge text-bg-dark">{imports.length}건</span>
        </div>
        {!imports.length ? (
          <EmptyStateCallout
            kicker="첫 데이터 입력"
            title="아직 업로드 이력이 없습니다"
            description="가계부 v2 엑셀 파일을 올리면 새 워크스페이스가 생성되고, 이후 분류와 통계까지 이어서 처리할 수 있습니다."
          />
        ) : (
          <div className="review-list">
            {imports.map((item) => (
              <article key={item.id} className="review-card">
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">{item.parserId}</span>
                    <h3>{item.fileName}</h3>
                    <p className="mb-2 text-secondary">
                      {item.importedAt.slice(0, 19).replace("T", " ")} · 총 {item.rowCount}개 거래 · 검토 {item.reviewCount}건
                    </p>
                    <div className="d-flex flex-wrap gap-2">
                      <span className="badge text-bg-warning">열린 검토 {openReviews}건</span>
                      <span className="badge text-bg-info">미분류 거래 {uncategorizedCount}건</span>
                    </div>
                  </div>
                  <Link to="/categories" className="btn btn-sm btn-outline-primary">
                    분류 이어서 하기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
