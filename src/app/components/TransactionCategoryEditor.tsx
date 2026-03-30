import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCategoryLabel, getLeafCategories } from "../../domain/categories/meta";
import type { Category, Transaction } from "../../shared/types/models";

interface TransactionCategoryEditorProps {
  transaction: Transaction;
  categories: Category[];
  categoryName: string | null;
  onCategoryChange: (categoryId: string) => void;
  onCategoryCommit?: (categoryId: string) => void;
  guideTarget?: string;
  reviewSuggestionLabel?: string | null;
  isReviewFocused?: boolean;
}

type CategorySuggestionRow = {
  id: string;
  label: string;
  normalizedLabel: string;
  normalizedName: string;
};

type SuggestionLayerStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
};

export function TransactionCategoryEditor({
  transaction,
  categories,
  categoryName,
  onCategoryChange,
  onCategoryCommit,
  guideTarget,
  reviewSuggestionLabel,
  isReviewFocused = false,
}: TransactionCategoryEditorProps) {
  const canEdit = transaction.transactionType === "expense" && !transaction.isInternalTransfer;
  const currentCategoryId = transaction.categoryId ?? "";
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const leafCategories = useMemo(() => getLeafCategories(categories), [categories]);
  const [draftValue, setDraftValue] = useState(categoryName ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suggestionLayerStyle, setSuggestionLayerStyle] = useState<SuggestionLayerStyle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const isComposingRef = useRef(false);
  const pendingCompositionCommitRef = useRef(false);

  useEffect(() => {
    setDraftValue(categoryName ?? "");
  }, [categoryName, transaction.id]);

  const suggestionRows = useMemo<CategorySuggestionRow[]>(
    () =>
      leafCategories.map((category) => {
        const label = getCategoryLabel(category, categoryMap);
        return {
          id: category.id,
          label,
          normalizedLabel: label.trim().toLowerCase(),
          normalizedName: category.name.trim().toLowerCase(),
        };
      }),
    [categoryMap, leafCategories],
  );

  const resolveCategoryId = useMemo(
    () => (rawValue: string) => {
      const normalizedValue = rawValue.trim().toLowerCase();
      if (!normalizedValue) return "";

      const exactMatch = suggestionRows.find((category) => {
        return category.normalizedName === normalizedValue || category.normalizedLabel === normalizedValue;
      });
      if (exactMatch) return exactMatch.id;

      const prefixMatch = suggestionRows.find((category) => {
        return category.normalizedName.startsWith(normalizedValue) || category.normalizedLabel.startsWith(normalizedValue);
      });
      if (prefixMatch) return prefixMatch.id;

      const partialMatch = suggestionRows.find((category) => {
        return category.normalizedName.includes(normalizedValue) || category.normalizedLabel.includes(normalizedValue);
      });
      return partialMatch?.id ?? null;
    },
    [suggestionRows],
  );

  const resolveExactCategoryId = useMemo(
    () => (rawValue: string) => {
      const normalizedValue = rawValue.trim().toLowerCase();
      if (!normalizedValue) return "";

      const exactMatch = suggestionRows.find((category) => {
        return category.normalizedName === normalizedValue || category.normalizedLabel === normalizedValue;
      });

      return exactMatch?.id ?? null;
    },
    [suggestionRows],
  );

  const commitCategoryChange = () => {
    const resolvedCategoryId = resolveCategoryId(draftValue);
    if (resolvedCategoryId === null) {
      setDraftValue(categoryName ?? "");
      return;
    }

    if (resolvedCategoryId === currentCategoryId) {
      const nextLabel = resolvedCategoryId
        ? suggestionRows.find((category) => category.id === resolvedCategoryId)?.label ?? (categoryName ?? draftValue.trim())
        : "";
      setDraftValue(nextLabel);
      return;
    }

    onCategoryChange(resolvedCategoryId);
    onCategoryCommit?.(resolvedCategoryId);
    const nextLabel = resolvedCategoryId
      ? suggestionRows.find((category) => category.id === resolvedCategoryId)?.label ?? draftValue.trim()
      : "";
    setDraftValue(nextLabel);
  };

  const moveFocus = (direction: "next" | "prev") => {
    const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-transaction-grid-editor="true"]'));
    const currentIndex = editors.findIndex((item) => item === inputRef.current);
    if (currentIndex < 0) return;

    const target = direction === "next" ? editors[currentIndex + 1] : editors[currentIndex - 1];
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  };

  const resolvedDraftCategoryId = resolveCategoryId(draftValue);
  const isCategoryFilled = resolvedDraftCategoryId !== null && resolvedDraftCategoryId !== "";
  const normalizedDraftValue = draftValue.trim().toLowerCase();
  const filteredCategories = suggestionRows
    .filter((category) => {
      if (!normalizedDraftValue) return true;
      return category.normalizedName.includes(normalizedDraftValue) || category.normalizedLabel.includes(normalizedDraftValue);
    })
    .slice(0, 12);
  const shouldShowSuggestions = isFocused && filteredCategories.length > 0;
  const highlightedSuggestion =
    shouldShowSuggestions && activeSuggestionIndex >= 0
      ? filteredCategories[Math.min(activeSuggestionIndex, filteredCategories.length - 1)] ?? null
      : null;
  const tone = isCategoryFilled
    ? {
        borderColor: "rgba(96, 165, 250, 0.98)",
        background: "rgba(219, 234, 254, 0.92)",
        ringColor: "rgba(59, 130, 246, 0.2)",
      }
    : {
        borderColor: "rgba(249, 115, 22, 0.98)",
        background: "rgba(255, 237, 213, 0.92)",
        ringColor: "rgba(249, 115, 22, 0.2)",
      };

  useEffect(() => {
    if (!shouldShowSuggestions) {
      setSuggestionLayerStyle(null);
      return;
    }

    const updateSuggestionLayerPosition = () => {
      const input = inputRef.current;
      if (!input) {
        setSuggestionLayerStyle(null);
        return;
      }

      const rect = input.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const preferredHeight = 216;
      const maxWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
      const estimatedContentWidth = Math.max(
        rect.width,
        ...filteredCategories.map((category) => category.label.length * 11 + 34),
      );
      const width = Math.min(maxWidth, estimatedContentWidth);
      const belowSpace = window.innerHeight - rect.bottom - viewportPadding;
      const aboveSpace = rect.top - viewportPadding;
      const openUpward = belowSpace < 180 && aboveSpace > belowSpace;
      const availableHeight = Math.max(120, openUpward ? aboveSpace - gap : belowSpace - gap);
      const maxHeight = Math.min(preferredHeight, availableHeight);
      const top = openUpward ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap;
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - viewportPadding - width),
      );

      setSuggestionLayerStyle({
        top,
        left,
        width,
        maxHeight,
        openUpward,
      });
    };

    updateSuggestionLayerPosition();
    window.addEventListener("resize", updateSuggestionLayerPosition);
    window.addEventListener("scroll", updateSuggestionLayerPosition, true);

    return () => {
      window.removeEventListener("resize", updateSuggestionLayerPosition);
      window.removeEventListener("scroll", updateSuggestionLayerPosition, true);
    };
  }, [filteredCategories, shouldShowSuggestions]);

  useEffect(() => {
    if (!shouldShowSuggestions) {
      setActiveSuggestionIndex(0);
      return;
    }

    setActiveSuggestionIndex((current) => {
      if (current < 0) return -1;
      return Math.min(current, filteredCategories.length - 1);
    });
  }, [filteredCategories.length, shouldShowSuggestions]);

  useEffect(() => {
    if (!shouldShowSuggestions || activeSuggestionIndex < 0) return;

    const list = suggestionListRef.current;
    const activeButton = list?.querySelector<HTMLElement>('[data-suggestion-active="true"]');
    if (!list || !activeButton) return;

    const listTop = list.scrollTop;
    const listBottom = listTop + list.clientHeight;
    const optionTop = activeButton.offsetTop;
    const optionBottom = optionTop + activeButton.offsetHeight;

    if (optionTop < listTop) {
      list.scrollTop = optionTop - 4;
      return;
    }

    if (optionBottom > listBottom) {
      list.scrollTop = optionBottom - list.clientHeight + 4;
    }
  }, [activeSuggestionIndex, shouldShowSuggestions]);

  const applySuggestion = (categoryId: string, label: string) => {
    skipNextBlurCommitRef.current = true;
    setDraftValue(label);
    if (categoryId !== currentCategoryId) {
      onCategoryChange(categoryId);
      onCategoryCommit?.(categoryId);
    }
    setIsFocused(false);
    inputRef.current?.focus();
  };

  if (!canEdit) {
    return <div>{categoryName ?? "미분류"}</div>;
  }

  return (
    <div
      className={`transaction-category-editor${isReviewFocused ? " is-review-focused" : ""}`}
      data-guide-target={guideTarget}
    >
      <input
        ref={inputRef}
        className="form-control form-control-sm"
        style={{
          width: "100%",
          minWidth: 0,
          borderWidth: "1.5px",
          borderColor: tone.borderColor,
          background: tone.background,
          boxShadow: isFocused ? `0 0 0 0.22rem ${tone.ringColor}` : `0 0 0 0.08rem ${tone.ringColor}`,
        }}
        value={draftValue}
        data-transaction-grid-editor="true"
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          setActiveSuggestionIndex(-1);

          if (isComposingRef.current) return;

          const exactCategoryId = resolveExactCategoryId(nextValue);
          if (exactCategoryId && exactCategoryId !== currentCategoryId) {
            onCategoryChange(exactCategoryId);
            onCategoryCommit?.(exactCategoryId);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          setActiveSuggestionIndex(-1);
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          if (isComposingRef.current) {
            pendingCompositionCommitRef.current = true;
            return;
          }
          commitCategoryChange();
        }}
        onFocus={(event) => {
          setIsFocused(true);
          setActiveSuggestionIndex(-1);
          event.currentTarget.select();
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
          pendingCompositionCommitRef.current = false;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          if (pendingCompositionCommitRef.current) {
            pendingCompositionCommitRef.current = false;
            commitCategoryChange();
          }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || isComposingRef.current) {
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            if (highlightedSuggestion) {
              applySuggestion(highlightedSuggestion.id, highlightedSuggestion.label);
              return;
            }
            skipNextBlurCommitRef.current = true;
            commitCategoryChange();
            moveFocus("next");
            return;
          }

          if (event.key === "Tab") {
            event.preventDefault();
            skipNextBlurCommitRef.current = true;
            commitCategoryChange();
            moveFocus(event.shiftKey ? "prev" : "next");
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (shouldShowSuggestions) {
              setActiveSuggestionIndex((current) => Math.min(current + 1, filteredCategories.length - 1));
              return;
            }
            moveFocus("next");
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (shouldShowSuggestions) {
              setActiveSuggestionIndex((current) => (current < 0 ? filteredCategories.length - 1 : Math.max(current - 1, 0)));
              return;
            }
            moveFocus("prev");
            return;
          }

          if (event.key === "Escape") {
            setIsFocused(false);
            setActiveSuggestionIndex(-1);
          }
        }}
      />
      {shouldShowSuggestions && suggestionLayerStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={suggestionListRef}
              className={`transaction-category-suggestion-list transaction-category-suggestion-list--floating${
                suggestionLayerStyle.openUpward ? " is-open-upward" : ""
              }`}
              data-guide-target="transactions-uncategorized-category-suggestions"
              style={{
                position: "fixed",
                top: `${suggestionLayerStyle.top}px`,
                left: `${suggestionLayerStyle.left}px`,
                width: `${suggestionLayerStyle.width}px`,
                maxHeight: `${suggestionLayerStyle.maxHeight}px`,
              }}
              role="listbox"
              aria-label="카테고리 추천"
            >
              {filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`transaction-category-suggestion-item${category.id === highlightedSuggestion?.id ? " is-active" : ""}`}
                  data-suggestion-active={category.id === highlightedSuggestion?.id ? "true" : "false"}
                  data-guide-target="transactions-uncategorized-category-option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(category.id, category.label);
                  }}
                >
                  <span className="transaction-category-suggestion-name">{category.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      {reviewSuggestionLabel ? (
        <div className={`transaction-category-review-hint${isReviewFocused ? " is-review-focused" : ""}`}>
          <strong>제안</strong>
          <span>{reviewSuggestionLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
