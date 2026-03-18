import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { REVIEW_TYPE_LABELS } from "../../domain/reviews/meta";
import {
  isActiveExpenseImpactTransaction,
  isActiveInternalTransferTransaction,
  isActiveSharedExpenseTransaction,
} from "../../domain/transactions/meta";
import { getSourceBreakdown } from "../../domain/transactions/sourceBreakdown";
import { getWorkspaceHealthSummary } from "../../domain/workspace/health";
import type { WorkspaceBundle } from "../../shared/types/models";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { CompletionBanner } from "../components/CompletionBanner";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { SourceBreakdownSection } from "../components/SourceBreakdownSection";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

export function ImportsPage() {
  const { commitImportedBundle, previewWorkbookImport, state } = useAppState();
  const navigate = useNavigate();
  const [previewBundle, setPreviewBundle] = useState<WorkspaceBundle | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const health = getWorkspaceHealthSummary(scope);
  const imports = [...scope.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const openReviews = health.openReviews;
  const uncategorizedCount = health.uncategorizedCount;
  const untaggedCount = health.untaggedCount;
  const sharedExpenseCount = scope.transactions.filter(isActiveSharedExpenseTransaction).length;
  const internalTransferCount = scope.transactions.filter(isActiveInternalTransferTransaction).length;
  const sourceBreakdown = getSourceBreakdown(scope.transactions);
  const latestImport = imports[0] ?? null;
  const postImportFlow = [
    {
      id: "reviews",
      title: "검토함 정리",
      description: openReviews.length
        ? `${openReviews.length}건의 자동 검토 후보가 남아 있습니다.`
        : "열려 있는 검토 항목이 없어 다음 단계로 넘어갈 수 있습니다.",
      to: "/reviews",
      actionLabel: "검토함 열기",
      completed: openReviews.length === 0,
    },
    {
      id: "categories",
      title: "분류 마무리",
      description: uncategorizedCount
        ? `${uncategorizedCount}건의 미분류 거래를 정리하면 통계가 더 정확해집니다.`
        : "미분류 거래가 없어 대시보드 해석을 더 믿고 볼 수 있습니다.",
      to: uncategorizedCount ? "/transactions?cleanup=uncategorized" : "/categories",
      actionLabel: "분류 화면 열기",
      completed: uncategorizedCount === 0,
    },
    {
      id: "tags",
      title: "태그 흐름 정리",
      description: untaggedCount
        ? `${untaggedCount}건의 무태그 거래를 묶으면 같은 맥락의 소비를 더 빠르게 비교할 수 있습니다.`
        : "무태그 거래가 없어 태그 기준 흐름도 바로 확인할 수 있습니다.",
      to: untaggedCount ? "/transactions?cleanup=untagged" : "/transactions",
      actionLabel: "태그 정리 열기",
      completed: untaggedCount === 0,
    },
    {
      id: "shared",
      title: "공동지출 흐름 확인",
      description: sharedExpenseCount
        ? `${sharedExpenseCount}건의 공동지출을 정산으로 이어지는 흐름으로 한 번 더 확인해두면 좋습니다.`
        : "공동지출로 따로 확인할 흐름이 없어 다음 단계로 넘어갈 수 있습니다.",
      to: "/transactions?nature=shared",
      actionLabel: "공동지출 점검하기",
      completed: sharedExpenseCount === 0,
    },
    {
      id: "internal-transfer",
      title: "내부이체 흐름 확인",
      description: internalTransferCount
        ? `${internalTransferCount}건의 내부이체를 모아 보고 소비 통계에 과하게 잡히지 않는지 확인해보세요.`
        : "내부이체로 따로 점검할 흐름이 없어 바로 진단 확인으로 넘어갈 수 있습니다.",
      to: "/transactions?nature=internal_transfer",
      actionLabel: "내부이체 점검하기",
      completed: internalTransferCount === 0,
    },
    {
      id: "dashboard",
      title: "진단 확인",
      description: health.postImportReady
        ? "이번 달 소비 진단과 저축률 가이드를 확인할 준비가 되었습니다."
        : "검토와 분류, 태그 정리를 먼저 끝내면 이번 달 진단을 더 정확히 볼 수 있습니다.",
      to: "/",
      actionLabel: "대시보드 보기",
      completed: health.postImportReady,
    },
  ];
  const completedPostImportSteps = postImportFlow.filter((step) => step.completed).length;
  const postImportProgress = postImportFlow.length ? completedPostImportSteps / postImportFlow.length : 0;
  const isPostImportReady = postImportFlow.every((step) => step.completed);
  const nextPostImportStep = postImportFlow.find((step) => !step.completed) ?? null;
  const reviewTypeSummary = Object.entries(
    openReviews.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.reviewType] = (accumulator[item.reviewType] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const previewReviewSummary = previewBundle
    ? Object.entries(
        previewBundle.reviews.reduce<Record<string, number>>((accumulator, item) => {
          accumulator[item.reviewType] = (accumulator[item.reviewType] ?? 0) + 1;
          return accumulator;
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : [];
  const previewTransactionSummary = previewBundle
    ? previewBundle.transactions.reduce(
        (accumulator, transaction) => {
          accumulator.byType[transaction.transactionType] = (accumulator.byType[transaction.transactionType] ?? 0) + 1;
          if (isActiveExpenseImpactTransaction(transaction)) {
            accumulator.expenseCount += 1;
            accumulator.expenseAmount += transaction.amount;
          }
          if (isActiveInternalTransferTransaction(transaction)) accumulator.internalTransferCount += 1;
          if (isActiveSharedExpenseTransaction(transaction)) accumulator.sharedExpenseCount += 1;
          return accumulator;
        },
        {
          byType: {
            expense: 0,
            income: 0,
            transfer: 0,
            adjustment: 0,
          },
          expenseCount: 0,
          expenseAmount: 0,
          internalTransferCount: 0,
          sharedExpenseCount: 0,
        },
      )
    : null;

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
            <p className="mb-0 text-secondary">파일을 바로 저장하지 않고, 먼저 미리보기로 거래와 검토 항목 규모를 보여드립니다.</p>
          </div>
          <input
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                setIsPreparingPreview(true);
                try {
                  const bundle = await previewWorkbookImport(file);
                  setPreviewBundle(bundle);
                  setPreviewFileName(file.name);
                } finally {
                  setIsPreparingPreview(false);
                }
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
        {isPreparingPreview ? <p className="small text-secondary mt-3 mb-0">엑셀 데이터를 분석해서 미리보기를 준비하고 있습니다.</p> : null}
      </section>

      {previewBundle ? (
        <section className="card shadow-sm" style={getMotionStyle(1)}>
          <div className="section-head">
            <div>
              <span className="section-kicker">업로드 미리보기</span>
              <h2 className="section-title">저장 전에 가져올 내용을 확인하세요</h2>
            </div>
            <span className="badge text-bg-primary">{previewBundle.workspace.name}</span>
          </div>
          <p className="text-secondary">
            <strong>{previewFileName}</strong> 파일을 새 워크스페이스로 가져올 준비가 되었습니다. 아래 요약을 보고 그대로 저장할지 먼저
            판단할 수 있습니다.
          </p>
          <div className="classification-flow-grid">
            <article className="stat-card">
              <span className="stat-label">거래</span>
              <strong>{previewBundle.transactions.length}건</strong>
              <div className="small text-secondary mt-2">카드, 이체, 내부이체 후보를 포함한 전체 거래 수입니다.</div>
            </article>
            <article className="stat-card">
              <span className="stat-label">검토 항목</span>
              <strong>{previewBundle.reviews.length}건</strong>
              <div className="small text-secondary mt-2">중복, 환불, 내부이체, 공동지출, 미분류 후보가 함께 생성됩니다.</div>
            </article>
            <article className="stat-card">
              <span className="stat-label">구성 데이터</span>
              <strong>
                {previewBundle.people.length}명 · {previewBundle.accounts.length}계좌 · {previewBundle.cards.length}카드
              </strong>
              <div className="small text-secondary mt-2">업로드와 함께 사람, 계좌, 카드 정보도 워크스페이스에 정리됩니다.</div>
            </article>
          </div>
          <div className="resource-grid mt-4">
            {previewReviewSummary.length ? (
              previewReviewSummary.map(([reviewType, count]) => (
                <article key={reviewType} className="resource-card">
                  <h3>{REVIEW_TYPE_LABELS[reviewType as keyof typeof REVIEW_TYPE_LABELS] ?? reviewType}</h3>
                  <p className="mb-0 text-secondary">{count}건</p>
                </article>
              ))
            ) : (
              <article className="resource-card">
                <h3>검토 항목 없음</h3>
                <p className="mb-0 text-secondary">이 파일은 즉시 분류 흐름으로 이어갈 수 있는 상태입니다.</p>
              </article>
            )}
          </div>
          {previewTransactionSummary ? (
            <div className="resource-grid mt-4">
              <article className="resource-card">
                <h3>실지출로 반영될 거래</h3>
                <p className="mb-0 text-secondary">
                  {previewTransactionSummary.expenseCount}건 · {formatCurrency(previewTransactionSummary.expenseAmount)}
                </p>
              </article>
              <article className="resource-card">
                <h3>거래 유형 구성</h3>
                <p className="mb-0 text-secondary">
                  지출 {previewTransactionSummary.byType.expense}건 · 수입 {previewTransactionSummary.byType.income}건 · 이체{" "}
                  {previewTransactionSummary.byType.transfer}건
                </p>
              </article>
              <article className="resource-card">
                <h3>내부이체 후보</h3>
                <p className="mb-0 text-secondary">{previewTransactionSummary.internalTransferCount}건</p>
              </article>
              <article className="resource-card">
                <h3>공동지출 후보</h3>
                <p className="mb-0 text-secondary">{previewTransactionSummary.sharedExpenseCount}건</p>
              </article>
            </div>
          ) : null}
          <div className="d-flex flex-wrap gap-2 mt-4">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                commitImportedBundle(previewBundle, previewFileName);
                setPreviewBundle(null);
                setPreviewFileName("");
                void navigate("/transactions");
              }}
            >
              이 미리보기로 가져오기
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => {
                setPreviewBundle(null);
                setPreviewFileName("");
              }}
            >
              다시 선택하기
            </button>
          </div>
        </section>
      ) : null}

      <section className="card shadow-sm" style={getMotionStyle(previewBundle ? 2 : 1)}>
        <div className="section-head">
          <div>
            <span className="section-kicker">업로드 결과 보기</span>
            <h2 className="section-title">방금 가져온 데이터에서 볼 것</h2>
          </div>
          <span className="badge text-bg-dark">{Math.round(postImportProgress * 100)}%</span>
        </div>
        <div className="guide-progress">
          <div className="guide-progress-bar" aria-hidden="true">
            <div className="guide-progress-fill" style={{ width: `${postImportProgress * 100}%` }} />
          </div>
          <div className="small text-secondary mt-3">
            업로드 이후 흐름 {postImportFlow.length}단계 중 {completedPostImportSteps}단계가 정리됐습니다.
          </div>
        </div>
        {nextPostImportStep ? (
          <div className="review-summary-panel mt-4">
            <div className="review-summary-copy">
              <strong>지금 가장 먼저 할 일</strong>
              <p className="mb-0 text-secondary">{nextPostImportStep.description}</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Link to={nextPostImportStep.to} className="btn btn-outline-primary btn-sm">
                {nextPostImportStep.actionLabel}
              </Link>
            </div>
          </div>
        ) : null}
        <div className="flow-journey-grid mb-4">
          {postImportFlow.map((step, index) => (
            <article key={step.id} className={`flow-journey-card${step.completed ? " completed" : ""}`} style={getMotionStyle(index + 1)}>
              <span className="flow-journey-step">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p className="mb-0 text-secondary">{step.description}</p>
              <Link to={step.to} className={`btn btn-sm mt-3 ${step.completed ? "btn-outline-success" : "btn-outline-primary"}`}>
                {step.actionLabel}
              </Link>
            </article>
          ))}
        </div>
        {isPostImportReady ? (
          <CompletionBanner
            className="mb-4"
            title="업로드 이후 정리를 마쳤습니다."
            description="검토와 분류, 태그 정리까지 끝나서 이제 대시보드와 정산 화면에서 이번 달 흐름을 비교적 안정적으로 볼 수 있습니다."
            actions={
              <>
                <Link to="/" className="btn btn-primary btn-sm">
                  대시보드 보기
                </Link>
                <Link to="/settlements" className="btn btn-outline-secondary btn-sm">
                  정산 화면 보기
                </Link>
              </>
            }
          />
        ) : null}
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
            <span className="stat-label">무태그 거래</span>
            <strong>{untaggedCount}건</strong>
            <div className="small text-secondary mt-2">태그가 비어 있는 소비만 바로 모아두고 거래 정리 모드에서 같은 맥락의 지출을 빠르게 묶을 수 있습니다.</div>
            <Link to="/transactions?cleanup=untagged" className="btn btn-outline-secondary btn-sm mt-3">
              무태그 정리 바로가기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">공동지출 흐름</span>
            <strong>{sharedExpenseCount}건</strong>
            <div className="small text-secondary mt-2">정산으로 이어지는 공동지출만 모아서, 부담 분배와 연결이 자연스러운지 한 번 더 확인할 수 있습니다.</div>
            <Link to="/transactions?nature=shared" className="btn btn-outline-secondary btn-sm mt-3">
              공동지출 점검하기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">내부이체 흐름</span>
            <strong>{internalTransferCount}건</strong>
            <div className="small text-secondary mt-2">내 계좌 간 이동이나 생활비 이체가 소비로 과하게 잡히지 않는지 거래 흐름으로 점검해보세요.</div>
            <Link to="/transactions?nature=internal_transfer" className="btn btn-outline-secondary btn-sm mt-3">
              내부이체 점검하기
            </Link>
          </article>
          <article className="stat-card">
            <span className="stat-label">미분류 거래</span>
            <strong>{uncategorizedCount}건</strong>
            <div className="small text-secondary mt-2">반복 지출 제안과 함께 미분류 거래를 분류해야 대시보드 해석이 살아납니다.</div>
            <Link to="/transactions?cleanup=uncategorized" className="btn btn-outline-primary btn-sm mt-3">
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
        <SourceBreakdownSection
          items={sourceBreakdown}
          kicker="수단 기준 흐름"
          emptyMessage="아직 수단 기준으로 볼 거래 데이터가 충분하지 않습니다."
          buttonVariant="secondary"
          motionStartIndex={6}
        />
      </section>

      <section className="card shadow-sm" style={getMotionStyle(previewBundle ? 3 : 2)}>
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

      <section className="card shadow-sm" style={getMotionStyle(previewBundle ? 4 : 3)}>
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

      <section className="card shadow-sm" style={getMotionStyle(previewBundle ? 5 : 4)}>
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
