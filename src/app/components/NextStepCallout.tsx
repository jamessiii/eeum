import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type NextStepCalloutAction = {
  label: string;
  to: string;
  variant?: "primary" | "secondary";
};

type NextStepCalloutProps = {
  title?: string;
  description: string;
  actionLabel?: string;
  to?: string;
  actions?: NextStepCalloutAction[];
  extraActions?: ReactNode;
  className?: string;
};

function renderAction({ label, to, variant = "primary" }: NextStepCalloutAction) {
  const className = `btn btn-outline-${variant} btn-sm`;

  if (to.startsWith("#")) {
    return (
      <a key={`${label}-${to}`} href={to} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link key={`${label}-${to}`} to={to} className={className}>
      {label}
    </Link>
  );
}

export function NextStepCallout({
  title = "지금 가장 먼저 할 일을 확인해 주세요.",
  description,
  actionLabel,
  to,
  actions,
  extraActions,
  className,
}: NextStepCalloutProps) {
  const resolvedActions =
    actions && actions.length
      ? actions
      : actionLabel && to
        ? [{ label: actionLabel, to, variant: "primary" as const }]
        : [];

  return (
    <div className={`review-summary-panel dashboard-summary-action-panel${className ? ` ${className}` : ""}`}>
      <div className="review-summary-copy">
        <strong>{title}</strong>
        <p className="mb-0 text-secondary">{description}</p>
      </div>
      {resolvedActions.length || extraActions ? (
        <div className="dashboard-summary-action">
          {resolvedActions.map(renderAction)}
          {extraActions}
        </div>
      ) : null}
    </div>
  );
}
