import { useEffect, useMemo, useRef, useState } from "react";
import { isActiveTransaction } from "../../domain/transactions/meta";
import type { Category, Transaction } from "../../shared/types/models";

interface TransactionCategoryEditorProps {
  transaction: Transaction;
  categories: Category[];
  categoryName: string | null;
  onCategoryChange: (categoryId: string) => void;
}

export function TransactionCategoryEditor({
  transaction,
  categories,
  categoryName,
  onCategoryChange,
}: TransactionCategoryEditorProps) {
  const canEdit = isActiveTransaction(transaction);
  const [draftValue, setDraftValue] = useState(categoryName ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const listId = `transaction-category-options-${transaction.id}`;

  useEffect(() => {
    setDraftValue(categoryName ?? "");
  }, [categoryName, transaction.id]);

  const resolveCategoryId = useMemo(
    () => (rawValue: string) => {
      const normalizedValue = rawValue.trim().toLowerCase();
      if (!normalizedValue) return "";

      const exactMatch = categories.find((category) => category.name.trim().toLowerCase() === normalizedValue);
      if (exactMatch) return exactMatch.id;

      const prefixMatch = categories.find((category) => category.name.trim().toLowerCase().startsWith(normalizedValue));
      if (prefixMatch) return prefixMatch.id;

      const partialMatch = categories.find((category) => category.name.trim().toLowerCase().includes(normalizedValue));
      return partialMatch?.id ?? null;
    },
    [categories],
  );

  const commitCategoryChange = () => {
    const resolvedCategoryId = resolveCategoryId(draftValue);
    if (resolvedCategoryId === null) {
      setDraftValue(categoryName ?? "");
      return;
    }

    onCategoryChange(resolvedCategoryId);
    const nextLabel = resolvedCategoryId
      ? categories.find((category) => category.id === resolvedCategoryId)?.name ?? draftValue.trim()
      : "";
    setDraftValue(nextLabel);
  };

  const moveFocus = (direction: "next" | "prev") => {
    const editors = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-category-editor="true"]'),
    );
    const currentIndex = editors.findIndex((item) => item === inputRef.current);
    if (currentIndex < 0) return;

    const target = direction === "next" ? editors[currentIndex + 1] : editors[currentIndex - 1];
    if (!target) return;
    target.focus();
    target.select();
  };

  if (!canEdit) {
    return <div>{categoryName ?? "미분류"}</div>;
  }

  return (
    <div>
      <input
        ref={inputRef}
        className="form-control form-control-sm"
        style={{ maxWidth: 180 }}
        list={listId}
        value={draftValue}
        placeholder="카테고리 입력"
        data-category-editor="true"
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => {
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          commitCategoryChange();
        }}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
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
      <datalist id={listId}>
        <option value="" label="카테고리 없음" />
        {categories.map((category) => (
          <option key={category.id} value={category.name} />
        ))}
      </datalist>
    </div>
  );
}
