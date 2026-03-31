import type { Category, Transaction } from "../../shared/types/models";
import { getLoopDescriptionKey, getLoopMerchantKey, isLoopEligibleTransaction, normalizeLoopText } from "./loopMatcher";

export type LoopRecommendation = {
  merchantKey: string;
  merchantName: string;
  matchedTransactionIds: string[];
  latestAmount: number;
  previousAmount: number;
  reason: string;
  categoryId: string | null;
};

const LOOP_HINT_KEYWORDS = ["로션", "샴푸", "세제", "치약", "구독", "정기", "보험", "사료", "생수", "주유"];

export function getLoopRecommendations(transactions: Transaction[], categories: Category[], selectedCategoryIds: string[] = []) {
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));
  const selectedCategoryIdSet = new Set(selectedCategoryIds);
  const hasSelectedCategories = selectedCategoryIdSet.size > 0;
  const expenseTransactions = transactions.filter((transaction) => {
    if (!isLoopEligibleTransaction(transaction) || transaction.isLoop || transaction.isLoopIgnored) return false;
    if (!hasSelectedCategories) return true;
    return transaction.categoryId ? selectedCategoryIdSet.has(transaction.categoryId) : false;
  });

  const grouped = new Map<string, Transaction[]>();

  for (const transaction of expenseTransactions) {
    const merchantKey = getLoopMerchantKey(transaction.merchantName);
    const categoryKey = transaction.categoryId ?? "uncategorized";
    const key = `${merchantKey}::${categoryKey}`;
    if (!key) continue;
    const current = grouped.get(key);
    if (current) current.push(transaction);
    else grouped.set(key, [transaction]);
  }

  return [...grouped.entries()]
    .map(([merchantKey, items]) => {
      const orderedItems = [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
      if (orderedItems.length < 2) return null;

      const latestTransaction = orderedItems[0];
      const previousTransaction = orderedItems[1] ?? null;
      if (!previousTransaction) return null;

      const amountMatches = latestTransaction.amount === previousTransaction.amount;
      const categoryName = categoryNameMap.get(latestTransaction.categoryId ?? "") ?? "";
      const hintSource = `${normalizeLoopText(latestTransaction.merchantName)} ${getLoopDescriptionKey(latestTransaction)} ${categoryName}`;
      const hasLoopHint = LOOP_HINT_KEYWORDS.some((keyword) => hintSource.includes(keyword));

      if (!amountMatches && !hasLoopHint && orderedItems.length < 3) {
        return null;
      }

      const reason = hasSelectedCategories
        ? "설정에서 고른 카테고리 안에서 반복 소비가 보입니다."
        : amountMatches
          ? "같은 이름과 비슷한 금액으로 여러 번 이어진 흐름입니다."
          : hasLoopHint
            ? "반복 생활비로 보이는 거래가 이어지고 있습니다."
            : "비슷한 거래가 여러 번 이어지고 있습니다.";

      return {
        merchantKey,
        merchantName: getLoopMerchantKey(latestTransaction.merchantName) || latestTransaction.merchantName,
        matchedTransactionIds: orderedItems.map((transaction) => transaction.id),
        latestAmount: latestTransaction.amount,
        previousAmount: previousTransaction.amount,
        reason,
        categoryId: latestTransaction.categoryId ?? previousTransaction.categoryId ?? null,
      } satisfies LoopRecommendation;
    })
    .filter((item): item is LoopRecommendation => Boolean(item))
    .sort(
      (left, right) =>
        right.matchedTransactionIds.length - left.matchedTransactionIds.length ||
        right.latestAmount - left.latestAmount ||
        left.merchantName.localeCompare(right.merchantName, "ko"),
    );
}
