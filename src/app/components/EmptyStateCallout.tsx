import type { ReactNode } from "react";

export function EmptyStateCallout({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`empty-state-callout${actions ? " has-actions" : ""}${className ? ` ${className}` : ""}`}>
      <div className="empty-state-copy-block">
        <span className="section-kicker">{kicker}</span>
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-copy">{description}</p>
      </div>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </section>
  );
}
