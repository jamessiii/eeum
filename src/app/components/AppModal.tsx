import type { PropsWithChildren, ReactNode } from "react";
import { createPortal } from "react-dom";

type AppModalProps = PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
}>;

export function AppModal({ open, title, description, footer, onClose, children }: AppModalProps) {
  if (!open) return null;

  const modal = (
    <div className="app-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="app-modal-dialog"
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
