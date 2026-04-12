import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  options: AppSelectOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  size?: "md" | "sm";
  dataGuideTarget?: string;
};

type DropdownStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
};

function getWindowScrollX() {
  return window.scrollX || window.pageXOffset || 0;
}

function getWindowScrollY() {
  return window.scrollY || window.pageYOffset || 0;
}

export function AppSelect({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  buttonClassName,
  dropdownClassName,
  style,
  disabled = false,
  placeholder,
  size = "md",
  dataGuideTarget,
}: AppSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const scrollX = getWindowScrollX();
      const scrollY = getWindowScrollY();
      const viewportPadding = 12;
      const gap = 6;
      const preferredHeight = 260;
      const maxWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
      const estimatedContentWidth = Math.max(
        rect.width,
        ...options.map((option) => option.label.length * 10 + 52),
      );
      const width = Math.min(maxWidth, estimatedContentWidth);
      const belowSpace = window.innerHeight - rect.bottom - viewportPadding;
      const aboveSpace = rect.top - viewportPadding;
      const openUpward = belowSpace < 180 && aboveSpace > belowSpace;
      const availableHeight = Math.max(140, openUpward ? aboveSpace - gap : belowSpace - gap);
      const maxHeight = Math.min(preferredHeight, availableHeight);
      const top = openUpward
        ? Math.max(scrollY + viewportPadding, scrollY + rect.top - maxHeight - gap)
        : scrollY + rect.bottom + gap;
      const left = Math.min(
        Math.max(scrollX + viewportPadding, scrollX + rect.left),
        Math.max(scrollX + viewportPadding, scrollX + window.innerWidth - viewportPadding - width),
      );

      setDropdownStyle({
        top,
        left,
        width,
        maxHeight,
        openUpward,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, options]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    const selectedEnabledIndex = enabledOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedEnabledIndex >= 0 ? selectedEnabledIndex : 0);
  }, [enabledOptions, isOpen, value]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const list = listRef.current;
    const activeOption = list?.querySelector<HTMLElement>('[data-app-select-active="true"]');
    if (!list || !activeOption) return;

    const listTop = list.scrollTop;
    const listBottom = listTop + list.clientHeight;
    const optionTop = activeOption.offsetTop;
    const optionBottom = optionTop + activeOption.offsetHeight;

    if (optionTop < listTop) {
      list.scrollTop = optionTop - 4;
      return;
    }

    if (optionBottom > listBottom) {
      list.scrollTop = optionBottom - list.clientHeight + 4;
    }
  }, [activeIndex, isOpen]);

  const commitValue = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const moveActiveIndex = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    setActiveIndex((current) => {
      if (current < 0) return direction > 0 ? 0 : enabledOptions.length - 1;
      const nextIndex = current + direction;
      if (nextIndex < 0) return enabledOptions.length - 1;
      if (nextIndex >= enabledOptions.length) return 0;
      return nextIndex;
    });
  };

  return (
    <div className={clsx("app-select", className, disabled && "is-disabled", isOpen && "is-open")} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx("app-select-trigger", size === "sm" && "app-select-trigger--sm", buttonClassName)}
        onClick={() => {
          if (disabled) return;
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            moveActiveIndex(1);
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            moveActiveIndex(-1);
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            const nextOption = enabledOptions[activeIndex] ?? null;
            if (nextOption) {
              commitValue(nextOption.value);
            }
          }
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        data-guide-target={dataGuideTarget}
      >
        <span className={clsx("app-select-value", !selectedOption && "is-placeholder")}>
          {selectedOption?.label ?? placeholder ?? ""}
        </span>
        <span className="app-select-caret" aria-hidden="true" />
      </button>

      {isOpen && dropdownStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={listRef}
              className={clsx(
                "app-select-dropdown",
                dropdownStyle.openUpward && "is-open-upward",
                dropdownClassName,
              )}
              style={{
                position: "absolute",
                top: `${dropdownStyle.top}px`,
                left: `${dropdownStyle.left}px`,
                width: `${dropdownStyle.width}px`,
                maxHeight: `${dropdownStyle.maxHeight}px`,
              }}
              role="listbox"
              aria-label={ariaLabel}
            >
              {options.map((option) => {
                const enabledIndex = enabledOptions.findIndex((item) => item.value === option.value);
                const isActive = !option.disabled && enabledIndex >= 0 && enabledIndex === activeIndex;
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={clsx(
                      "app-select-option",
                      isSelected && "is-selected",
                      isActive && "is-active",
                    )}
                    data-app-select-active={isActive ? "true" : "false"}
                    onMouseEnter={() => {
                      if (option.disabled || enabledIndex < 0) return;
                      setActiveIndex(enabledIndex);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      if (option.disabled) return;
                      commitValue(option.value);
                    }}
                    disabled={option.disabled}
                  >
                    <span className="app-select-option-label">{option.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
