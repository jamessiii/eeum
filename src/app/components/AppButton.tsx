import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type AppButtonVariant = "primary" | "secondary" | "neutral" | "outlinePrimary" | "danger" | "outlineDanger";
type AppButtonSize = "md" | "sm" | "s";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
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
  { className, type = "button", variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx("btn", variantClassNameMap[variant], size === "sm" && "btn-sm", size === "s" && "btn-s", className)}
      {...props}
    />
  );
});
