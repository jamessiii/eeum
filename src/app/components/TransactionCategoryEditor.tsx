import { useEffect, useMemo, useRef, useState } from "react";
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
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const leafCategories = useMemo(() => getLeafCategories(categories), [categories]);
  const [draftValue, setDraftValue] = useState(categoryName ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const isComposingRef = useRef(false);
  const pendingCompositionCommitRef = useRef(false);
  const listId = `transaction-category-options-${transaction.id}`;

  useEffect(() => {
    setDraftValue(categoryName ?? "");
  }, [categoryName, transaction.id]);

  const resolveCategoryId = useMemo(
    () => (rawValue: string) => {
      const normalizedValue = rawValue.trim().toLowerCase();
      if (!normalizedValue) return "";

      const resolveLabel = (category: Category) => getCategoryLabel(category, categoryMap).trim().toLowerCase();

      const exactMatch = leafCategories.find((category) => {
        return category.name.trim().toLowerCase() === normalizedValue || resolveLabel(category) === normalizedValue;
      });
      if (exactMatch) return exactMatch.id;

      const prefixMatch = leafCategories.find((category) => {
        return category.name.trim().toLowerCase().startsWith(normalizedValue) || resolveLabel(category).startsWith(normalizedValue);
      });
      if (prefixMatch) return prefixMatch.id;

      const partialMatch = leafCategories.find((category) => {
        return category.name.trim().toLowerCase().includes(normalizedValue) || resolveLabel(category).includes(normalizedValue);
      });
      return partialMatch?.id ?? null;
    },
    [categoryMap, leafCategories],
  );

  const resolveExactCategoryId = useMemo(
    () => (rawValue: string) => {
      const normalizedValue = rawValue.trim().toLowerCase();
      if (!normalizedValue) return "";

      const resolveLabel = (category: Category) => getCategoryLabel(category, categoryMap).trim().toLowerCase();
      const exactMatch = leafCategories.find((category) => {
        return category.name.trim().toLowerCase() === normalizedValue || resolveLabel(category) === normalizedValue;
      });

      return exactMatch?.id ?? null;
    },
    [categoryMap, leafCategories],
  );

  const commitCategoryChange = () => {
    const resolvedCategoryId = resolveCategoryId(draftValue);
    if (resolvedCategoryId === null) {
      setDraftValue(categoryName ?? "");
      return;
    }

    onCategoryChange(resolvedCategoryId);
    onCategoryCommit?.(resolvedCategoryId);
    const nextLabel = resolvedCategoryId
      ? (() => {
          const matchedCategory = leafCategories.find((category) => category.id === resolvedCategoryId);
          return matchedCategory ? getCategoryLabel(matchedCategory, categoryMap) : draftValue.trim();
        })()
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

  if (!canEdit) {
    return <div>{categoryName ?? "미분류"}</div>;
  }

  const resolvedDraftCategoryId = resolveCategoryId(draftValue);
  const isCategoryFilled = resolvedDraftCategoryId !== null && resolvedDraftCategoryId !== "";
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
        list={listId}
        value={draftValue}
        data-transaction-grid-editor="true"
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);

          if (isComposingRef.current) return;

          const exactCategoryId = resolveExactCategoryId(nextValue);
          if (exactCategoryId) {
            onCategoryChange(exactCategoryId);
            onCategoryCommit?.(exactCategoryId);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
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
            skipNextBlurCommitRef.current = true;
            commitCategoryChange();
            moveFocus("next");
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            skipNextBlurCommitRef.current = true;
            commitCategoryChange();
            moveFocus("prev");
          }
        }}
      />
      {reviewSuggestionLabel ? (
        <div className={`transaction-category-review-hint${isReviewFocused ? " is-review-focused" : ""}`}>
          <strong>제안</strong>
          <span>{reviewSuggestionLabel}</span>
        </div>
      ) : null}
      <datalist id={listId}>
        <option value="" label="카테고리 없음" />
        {leafCategories.map((category) => (
          <option key={category.id} value={getCategoryLabel(category, categoryMap)} />
        ))}
      </datalist>
    </div>
  );
}
