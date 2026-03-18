import { Link } from "react-router-dom";
import { REVIEW_TYPE_LABELS } from "../../domain/reviews/meta";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ImportsPage() {
  const { importWorkbook, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const imports = [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const openReviews = scope.reviews.filter((item) => item.status === "open");
  const uncategorizedCount = scope.transactions.filter(
    (item) => item.status === "active" && item.isExpenseImpact && !item.categoryId,
  ).length;
  const latestImport = imports[0] ?? null;
  const reviewTypeSummary = Object.entries(
    openReviews.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.reviewType] = (accumulator[item.reviewType] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)}>
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
            <p className="mb-0 text-secondary">업로드한 파일로 새 워크스페이스를 만들고 거래와 검토 항목을 정규화합니다.</p>
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

      <section className="card shadow-sm" style={getMotionStyle(1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 결과 보기</span>
            <h2 className="section-title">방금 가져온 데이터에서 볼 것</h2>
          </div>
        </div>
        <div className="classification-flow-grid">
          <article className="stat-card">
            <span className="stat-label">열린 검토</span>
            <strong>{openReviews.length}건</strong>
            <div className="small text-secondary mt-2">중복, 환불, 내부이체 후보부터 정리하면 통계가 훨씬 정확해집니다.</div>
            <Link to="/reviews" className="btn btn-outline-secondary btn-sm mt-3">
              검토함 열기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">미분류 거래</span>
            <strong>{uncategorizedCount}건</strong>
            <div className="small text-secondary mt-2">반복 지출 제안과 함께 미분류 거래를 분류해야 대시보드 해석이 살아납니다.</div>
            <Link to="/categories" className="btn btn-outline-primary btn-sm mt-3">
              분류 화면 열기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">최종 확인</span>
            <strong>대시보드</strong>
            <div className="small text-secondary mt-2">검토와 분류가 끝나면 이번 달 소비 진단과 저축률 가이드를 확인해보세요.</div>
            <Link to="/" className="btn btn-primary btn-sm mt-3">
              대시보드 보기
            </Link>
          </article>
        </div>
      </section>

      <section className="card shadow-sm" style={getMotionStyle(2)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">검토 유형 요약</span>
            <h2 className="section-title">무슨 종류의 확인이 필요한지</h2>
          </div>
        </div>
        {!reviewTypeSummary.length ? (
          <EmptyStateCallout
            kicker="검토 없음"
            title="지금 열려 있는 검토 항목이 없습니다"
            description="업로드 후 자동 검토 후보가 없거나 이미 모두 정리된 상태입니다."
          />
        ) : (
          <div className="resource-grid">
            {reviewTypeSummary.map(([reviewType, count], index) => (
                <article key={reviewType} className="resource-card" style={getMotionStyle(index + 3)}>
                <h3>{REVIEW_TYPE_LABELS[reviewType as keyof typeof REVIEW_TYPE_LABELS] ?? reviewType}</h3>
                <p className="mb-0 text-secondary">{count}건</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(3)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">최근 업로드</span>
            <h2 className="section-title">가장 최근 가져온 파일</h2>
          </div>
        </div>
        {!latestImport ? (
          <EmptyStateCallout
            kicker="첫 데이터 입력"
            title="아직 업로드 이력이 없습니다"
            description="가계부 v2 엑셀 파일을 올리면 새 워크스페이스가 생성되고, 이후 분류와 통계까지 이어서 처리할 수 있습니다."
          />
        ) : (
          <div className="resource-grid">
            <article className="resource-card">
              <h3>{latestImport.fileName}</h3>
              <p className="mb-1 text-secondary">{latestImport.importedAt.slice(0, 19).replace("T", " ")}</p>
              <p className="mb-0 text-secondary">총 {latestImport.rowCount}개 거래 · 검토 {latestImport.reviewCount}건</p>
            </article>
            <article className="resource-card">
              <h3>{latestImport.parserId}</h3>
              <p className="mb-1 text-secondary">현재 적용된 파서</p>
              <p className="mb-0 text-secondary">업로드 후에는 검토함과 분류 화면으로 바로 이어지는 흐름을 권장합니다.</p>
            </article>
          </div>
        )}
      </section>

      <section className="card shadow-sm" style={getMotionStyle(4)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 이력</span>
            <h2 className="section-title">가져온 파일 기록</h2>
          </div>
          <span className="badge text-bg-dark">{imports.length}건</span>
        </div>
        {!imports.length ? (
          <EmptyStateCallout
            kicker="이력 없음"
            title="업로드한 파일이 아직 없습니다"
            description="가계부 v2 엑셀을 올리면 이곳에서 어떤 파일을 언제 불러왔는지 계속 확인할 수 있습니다."
          />
        ) : (
          <div className="review-list">
            {imports.map((item, index) => (
              <article key={item.id} className="review-card" style={getMotionStyle(index + 5)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">{item.parserId}</span>
                    <h3>{item.fileName}</h3>
                    <p className="mb-2 text-secondary">
                      {item.importedAt.slice(0, 19).replace("T", " ")} · 총 {item.rowCount}개 거래 · 검토 {item.reviewCount}건
                    </p>
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
