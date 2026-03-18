import type { ReactNode } from "react";

export function EmptyStateCallout({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="empty-state-callout">
      <span className="section-kicker">{kicker}</span>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-copy">{description}</p>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </section>
  );
}
