import { useMemo } from "react";
import { getManagedLoopGroups } from "../../domain/loops/managedLoops";
import { formatCurrency } from "../../shared/utils/format";
import { getMotionStyle } from "../../shared/utils/motion";
import { EmptyStateCallout } from "../components/EmptyStateCallout";
import { useAppState } from "../state/AppStateProvider";
import { getWorkspaceScope } from "../state/selectors";

function buildPolyline(values: number[], width: number, height: number, maxValue: number) {
  if (!values.length) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = values.length > 1 ? step * index : width / 2;
      const y = height - (Math.max(value, 0) / Math.max(maxValue, 1)) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LoopAnnualPage() {
  const { state } = useAppState();
  const workspaceId = state.activeWorkspaceId!;
  const scope = getWorkspaceScope(state, workspaceId);
  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, index) => `${currentYear}-${String(index + 1).padStart(2, "0")}`);
  const loopTrendRows = useMemo(() => {
    const managedLoops = getManagedLoopGroups(scope.transactions).slice(0, 6);
    return managedLoops.map((loop) => {
      const values = months.map((month) =>
        loop.transactions
          .filter((transaction) => transaction.occurredAt.startsWith(month))
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      );
      return {
        ...loop,
        values,
        maxAmount: Math.max(...values, 0),
        totalAmount: values.reduce((sum, value) => sum + value, 0),
      };
    });
  }, [months, scope.transactions]);
  const chartMax = Math.max(...loopTrendRows.map((item) => item.maxAmount), 1);

  return (
    <section className="card shadow-sm" style={getMotionStyle(0)}>
      <div className="section-head">
        <div>
          <span className="section-kicker">루프 가격변동</span>
          <h2 className="section-title">해기록 루프 그래프</h2>
        </div>
      </div>
      {loopTrendRows.length ? (
        <div className="dashboard-year-trend-list">
          {loopTrendRows.map((item, index) => (
            <div key={item.key} className="dashboard-year-trend-row" style={getMotionStyle(index + 1)}>
              <div className="dashboard-year-trend-copy">
                <strong>{item.merchantName}</strong>
                <span>{formatCurrency(item.totalAmount)}</span>
                <span>최고 {formatCurrency(item.maxAmount)}</span>
              </div>
              <svg viewBox="0 0 420 54" preserveAspectRatio="none" className="dashboard-year-sparkline" aria-hidden="true">
                <path d={buildPolyline(item.values, 420, 54, chartMax)} className="dashboard-year-spark dashboard-year-spark--category" />
              </svg>
            </div>
          ))}
          <div className="dashboard-year-axis dashboard-year-axis--compact">
            <span className="dashboard-year-axis-spacer" aria-hidden="true" />
            <div className="dashboard-year-axis-months">
              {months.map((month) => (
                <span key={month}>{Number(month.slice(5, 7))}월</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyStateCallout
          kicker="해기록 루프"
          title="그래프로 볼 루프가 아직 없습니다"
          description="결제내역에서 루프를 몇 개 지정하면 해기록에서 가격 변동 그래프를 볼 수 있습니다."
        />
      )}
    </section>
  );
}
