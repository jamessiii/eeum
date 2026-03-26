import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";

type AppModalProps = PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  dialogClassName?: string;
}>;

export function AppModal({ open, title, description, footer, onClose, children, dialogClassName }: AppModalProps) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const currentCount = Number(body.dataset.appModalCount ?? "0");
    const nextCount = currentCount + 1;

    body.dataset.appModalCount = String(nextCount);
    root.classList.add("app-modal-open");
    body.classList.add("app-modal-open");

    return () => {
      const latestCount = Number(body.dataset.appModalCount ?? "1");
      const remainingCount = Math.max(0, latestCount - 1);

      if (remainingCount === 0) {
        delete body.dataset.appModalCount;
        root.classList.remove("app-modal-open");
        body.classList.remove("app-modal-open");
        return;
      }

      body.dataset.appModalCount = String(remainingCount);
    };
  }, [open]);

  if (!open) return null;

  const modal = (
    <div className="app-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`app-modal-dialog${dialogClassName ? ` ${dialogClassName}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="app-modal-body">{children}</div>
        {footer ? <footer className="app-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return modal;
  }

  return createPortal(modal, document.body);
}
