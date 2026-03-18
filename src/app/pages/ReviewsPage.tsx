import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

const reviewTypeLabel: Record<string, string> = {
  duplicate_candidate: "중복 후보",
  refund_candidate: "환불 연결 후보",
  uncategorized_transaction: "미분류 거래",
  internal_transfer_candidate: "내부이체 후보",
  shared_expense_candidate: "공동지출 후보",
};

const reviewActionLabel: Record<string, string> = {
  duplicate_candidate: "중복으로 제외",
  refund_candidate: "환불로 연결",
  uncategorized_transaction: "검토 완료",
  internal_transfer_candidate: "내부이체로 확정",
  shared_expense_candidate: "공동지출로 확정",
};

export function ReviewsPage() {
  const { applyReviewSuggestion, dismissReview, resolveReview, state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const transactions = new Map(scope.transactions.map((item) => [item.id, item]));
  const reviews = scope.reviews.filter((item) => item.status === "open");

  return (
    <section className="card shadow-sm">
      <div className="section-head">
        <div>
          <span className="section-kicker">검토함</span>
          <h2 className="section-title">자동 감지 결과 검토</h2>
        </div>
        <span className="badge text-bg-warning">{reviews.length}건</span>
      </div>
      <p className="text-secondary">
        팝업으로 즉답을 강요하지 않고, 확인이 필요한 항목을 여기에 모아둡니다. 거래 흐름을 보고 한 번에 정리할 수 있게
        만드는 화면입니다.
      </p>

      {!reviews.length ? (
        <EmptyStateCallout
          kicker="검토 완료"
          title="열려 있는 검토 항목이 없습니다"
          description="중복, 환불, 내부이체, 공동지출 후보를 모두 정리했습니다. 이제 대시보드와 정산 화면의 수치를 더 믿고 볼 수 있습니다."
        />
      ) : (
        <div className="review-list">
          {reviews.map((review, index) => {
            const primaryTransaction = transactions.get(review.primaryTransactionId) ?? null;
            const relatedTransactions = review.relatedTransactionIds
              .map((id) => transactions.get(id))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));

            return (
              <article key={review.id} className="review-card" style={getMotionStyle(index)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className="review-type">{reviewTypeLabel[review.reviewType] ?? review.reviewType}</span>
                    <h3>{review.summary}</h3>
                    {primaryTransaction ? (
                      <p className="mb-2 text-secondary">
                        기준 거래: {primaryTransaction.occurredAt.slice(0, 10)} · {primaryTransaction.merchantName} ·{" "}
                        {primaryTransaction.amount.toLocaleString("ko-KR")}원
                      </p>
                    ) : null}
                    {relatedTransactions.length ? (
                      <div className="small text-secondary">
                        관련 거래:{" "}
                        {relatedTransactions
                          .map((item) => `${item.merchantName} ${item.amount.toLocaleString("ko-KR")}원`)
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <span className="badge text-bg-light">신뢰도 {Math.round(review.confidenceScore * 100)}%</span>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      if (review.reviewType === "uncategorized_transaction") {
                        resolveReview(review.id);
                        return;
                      }
                      applyReviewSuggestion(review.id);
                    }}
                  >
                    {reviewActionLabel[review.reviewType] ?? "적용"}
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => dismissReview(review.id)}>
                    나중에 보기
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
