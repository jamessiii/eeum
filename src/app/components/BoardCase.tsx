import type { HTMLAttributes, ReactNode } from "react";

type BoardCaseProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  embedded?: boolean;
};

type BoardCaseSectionProps = HTMLAttributes<HTMLElement> & {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function BoardCase({ title, description, actions, children, embedded = false }: BoardCaseProps) {
  return (
    <section className={`board-case-shell${embedded ? " is-embedded" : ""}`}>
      <div className="board-case-header">
        <div className="board-case-header-copy">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="board-case-actions">{actions}</div> : null}
      </div>
      <div className="board-case-body">{children}</div>
    </section>
  );
}

export function BoardCaseSection({ title, meta, action, children, className = "", ...props }: BoardCaseSectionProps) {
  const mergedClassName = className ? `board-case-section ${className}` : "board-case-section";

  return (
    <section className={mergedClassName} {...props}>
      <div className="board-case-section-head">
        <div className="board-case-section-title-row">
          <h3>{title}</h3>
          {action ? <div className="board-case-section-action">{action}</div> : null}
        </div>
        {meta ? <p>{meta}</p> : null}
      </div>
      <div className="board-case-section-body">{children}</div>
    </section>
  );
}
