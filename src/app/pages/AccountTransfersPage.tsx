import { getMotionStyle } from "../../shared/utils/motion";

export function AccountTransfersPage() {
  return (
    <div className="page-stack">
      <section className="card shadow-sm" style={getMotionStyle(0)} data-guide-target="account-transfers-entry">
        <div className="section-head">
          <div>
            <span className="section-kicker">이체내역</span>
            <h2 className="section-title">이체내역</h2>
          </div>
        </div>
        <p className="text-secondary mb-0">준비중입니다.</p>
      </section>
    </div>
  );
}
