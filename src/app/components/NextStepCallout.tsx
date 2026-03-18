import { Link } from "react-router-dom";

type NextStepCalloutProps = {
  title?: string;
  description: string;
  actionLabel: string;
  to: string;
  className?: string;
};

export function NextStepCallout({
  title = "지금 가장 먼저 할 일",
  description,
  actionLabel,
  to,
  className,
}: NextStepCalloutProps) {
  return (
    <div className={`review-summary-panel${className ? ` ${className}` : ""}`}>
      <div className="review-summary-copy">
        <strong>{title}</strong>
        <p className="mb-0 text-secondary">{description}</p>
      </div>
      <div className="d-flex flex-wrap gap-2">
        {to.startsWith("#") ? (
          <a href={to} className="btn btn-outline-primary btn-sm">
            {actionLabel}
          </a>
        ) : (
          <Link to={to} className="btn btn-outline-primary btn-sm">
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
