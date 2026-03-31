import type { Transaction } from "../../shared/types/models";

const LOOP_STOPWORDS = new Set([
  "승인",
  "승인번호",
  "사용분",
  "청구분",
  "결제분",
  "결제",
  "자동이체",
  "정기결제",
  "일시불",
  "할부",
  "개월",
  "건",
  "회",
  "차",
  "memo",
]);

const BILLING_PREFIX_PATTERNS = [
  /^(?:네이버페이|카카오페이|토스페이(?:먼츠)?|페이코|payco|kicc|kg이니시스|이니시스|다날|갤럭시아머니트리|헥토파이낸셜|토스)\s*[-/:]?\s*/u,
];

function stripLegalEntityWords(value: string) {
  return value
    .replace(/\(주\)|㈜|주식회사|유한회사|유한책임회사|inc\.?|corp\.?|co\.?,?\s*ltd\.?|ltd\.?/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLoopText(value: string) {
  return stripLegalEntityWords(value.normalize("NFKC"))
    .replace(/[_·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripBillingPrefixes(value: string) {
  return BILLING_PREFIX_PATTERNS.reduce((current, pattern) => current.replace(pattern, ""), value);
}

function stripLoopVariableTokens(value: string) {
  return stripBillingPrefixes(normalizeLoopText(value))
    .replace(/20\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?/gu, " ")
    .replace(/\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?/gu, " ")
    .replace(/\d{1,2}\s*월\s*\d{0,2}\s*일?/gu, " ")
    .replace(/\d{1,2}\s*월\s*(?:분|호|차|건|회|사용분|청구분|결제분)?/gu, " ")
    .replace(/\d{1,2}월분/gu, " ")
    .replace(/\d+\s*(?:건|회|차|개월|달|일)/gu, " ")
    .replace(/(?:일시불|할부)\s*\d*\s*개월?/gu, " ")
    .replace(/승인\s*\d+/gu, " ")
    .replace(/[0-9]{4,}/gu, " ")
    .replace(/[()[\]{}<>|]/g, " ")
    .replace(/[-/:,+*&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLoopIdentityText(value: string) {
  const stripped = stripLoopVariableTokens(value);
  return stripped || normalizeLoopText(value);
}

export function getLoopMerchantKey(value: string) {
  return getLoopIdentityText(value);
}

function isUsefulLoopToken(token: string) {
  if (token.length < 2) return false;
  if (LOOP_STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

export function tokenizeLoopDescription(value: string) {
  return getLoopIdentityText(value)
    .split(/[\s/,:()\-[\]{}<>|]+/u)
    .map((token) => token.trim())
    .filter(isUsefulLoopToken);
}

export function getLoopAmountSimilarity(left: number, right: number) {
  const max = Math.max(Math.abs(left), Math.abs(right), 1);
  return 1 - Math.min(1, Math.abs(left - right) / max);
}

export function getLoopDescriptionKey(transaction: Transaction) {
  const tokens = Array.from(new Set(tokenizeLoopDescription(transaction.description))).sort();
  return tokens.slice(0, 3).join("|") || "memo";
}

export function getLoopGroupKey(transaction: Transaction) {
  if (transaction.loopGroupOverrideKey?.trim()) {
    return `manual::${transaction.loopGroupOverrideKey.trim()}`;
  }
  const merchantKey = getLoopIdentityText(transaction.merchantName);
  const categoryKey = transaction.categoryId ?? "uncategorized";
  const descriptionKey = getLoopDescriptionKey(transaction);
  return `${merchantKey}::${categoryKey}::${descriptionKey}`;
}

export function isLoopEligibleTransaction(transaction: Transaction) {
  return (
    transaction.status === "active" &&
    transaction.transactionType === "expense" &&
    transaction.isExpenseImpact &&
    Boolean(normalizeLoopText(transaction.merchantName))
  );
}

export function isSameLoopGroup(left: Transaction, right: Transaction) {
  if (left.loopGroupOverrideKey && right.loopGroupOverrideKey) {
    return left.loopGroupOverrideKey === right.loopGroupOverrideKey;
  }
  const leftMerchant = getLoopIdentityText(left.merchantName);
  const rightMerchant = getLoopIdentityText(right.merchantName);
  if (!leftMerchant || leftMerchant !== rightMerchant) return false;

  const categoryMatches = left.categoryId && right.categoryId ? left.categoryId === right.categoryId : true;
  if (!categoryMatches) return false;

  const amountMatches = getLoopAmountSimilarity(left.amount, right.amount) >= 0.8;
  const leftTokens = tokenizeLoopDescription(left.description);
  const rightTokenSet = new Set(tokenizeLoopDescription(right.description));
  const sharedToken = leftTokens.some((token) => rightTokenSet.has(token));
  const descriptionKeyMatches = getLoopDescriptionKey(left) === getLoopDescriptionKey(right);

  return amountMatches || sharedToken || descriptionKeyMatches;
}

export function getLoopGroupTransactions(target: Transaction, transactions: Transaction[]) {
  return transactions
    .filter((transaction) => isLoopEligibleTransaction(transaction))
    .filter((transaction) => transaction.id === target.id || isSameLoopGroup(target, transaction))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
