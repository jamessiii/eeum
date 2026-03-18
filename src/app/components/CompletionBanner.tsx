import type { ReactNode } from "react";

interface CompletionBannerProps {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

export function CompletionBanner({ title, description, actions, className = "" }: CompletionBannerProps) {
  const classes = ["completion-banner", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <strong>{title}</strong>
      <p className="mb-0 text-secondary">{description}</p>
      {actions ? <div className="completion-actions">{actions}</div> : null}
    </div>
  );
}
