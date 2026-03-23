import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type AppButtonVariant = "primary" | "secondary" | "outlinePrimary";
type AppButtonSize = "md" | "sm";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
};

const variantClassNameMap: Record<AppButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-outline-secondary",
  outlinePrimary: "btn-outline-primary",
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { className, type = "button", variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx("btn", variantClassNameMap[variant], size === "sm" && "btn-sm", className)}
      {...props}
    />
  );
});
