import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type AppButtonVariant = "primary" | "secondary" | "neutral" | "outlinePrimary" | "danger" | "outlineDanger";
type AppButtonSize = "md" | "sm" | "s";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  busy?: boolean;
  busyLabel?: string;
};

const variantClassNameMap: Record<AppButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-outline-secondary",
  neutral: "btn-outline-secondary",
  outlinePrimary: "btn-outline-primary",
  danger: "btn-danger",
  outlineDanger: "btn-outline-danger",
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { children, className, type = "button", variant = "primary", size = "md", busy = false, busyLabel, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx("btn", variantClassNameMap[variant], size === "sm" && "btn-sm", size === "s" && "btn-s", busy && "is-busy", className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <>
          <span className="app-button-spinner" aria-hidden="true" />
          <span>{busyLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
