import { useEffect, useRef, useState, type PointerEvent, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";

type AppModalProps = PropsWithChildren<{
  open: boolean;
  title: ReactNode;
  ariaLabel?: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  dialogClassName?: string;
  mobilePresentation?: "dialog" | "sheet";
}>;

export function AppModal({
  open,
  title,
  ariaLabel,
  description,
  footer,
  onClose,
  children,
  dialogClassName,
  mobilePresentation = "dialog",
}: AppModalProps) {
  const [isRendered, setIsRendered] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const sheetDragPointerIdRef = useRef<number | null>(null);
  const sheetDragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsRendered(true);
      setIsClosing(false);
      setSheetDragOffset(0);
      setIsSheetDragging(false);
      sheetDragPointerIdRef.current = null;
      sheetDragStartYRef.current = null;
      return;
    }

    if (!isRendered) return;

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsRendered(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 220);

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isRendered, open]);

  useEffect(() => {
    if (!isRendered || typeof document === "undefined") return;

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
  }, [isRendered]);

  const handleSheetPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mobilePresentation !== "sheet") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    sheetDragPointerIdRef.current = event.pointerId;
    sheetDragStartYRef.current = event.clientY;
    setIsSheetDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleSheetPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (mobilePresentation !== "sheet") return;
    if (!isSheetDragging || sheetDragPointerIdRef.current !== event.pointerId || sheetDragStartYRef.current === null) return;
    const deltaY = Math.max(0, event.clientY - sheetDragStartYRef.current);
    setSheetDragOffset(deltaY);
  };

  const handleSheetPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (mobilePresentation !== "sheet") return;
    if (sheetDragPointerIdRef.current !== event.pointerId) return;

    const shouldClose = sheetDragOffset >= 88;
    sheetDragPointerIdRef.current = null;
    sheetDragStartYRef.current = null;
    setIsSheetDragging(false);

    if (shouldClose) {
      setSheetDragOffset(0);
      onClose();
      return;
    }

    setSheetDragOffset(0);
  };

  if (!isRendered) return null;

  const modal = (
    <div
      className={`app-modal-backdrop${mobilePresentation === "sheet" ? " app-modal-backdrop--mobile-sheet" : ""}${isClosing ? " is-closing" : ""}`}
      role="presentation"
      onClick={onClose}
    >
      <section
        className={`app-modal-dialog${dialogClassName ? ` ${dialogClassName}` : ""}${
          mobilePresentation === "sheet" ? " app-modal-dialog--mobile-sheet" : ""
        }${isClosing ? " is-closing" : ""}${isSheetDragging ? " is-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : "dialog")}
        onClick={(event) => event.stopPropagation()}
        style={mobilePresentation === "sheet" && sheetDragOffset > 0 ? { transform: `translate3d(0, ${sheetDragOffset}px, 0)` } : undefined}
      >
        {mobilePresentation === "sheet" ? (
          <div
            className="app-modal-sheet-handle"
            aria-hidden="true"
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
          />
        ) : null}
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
