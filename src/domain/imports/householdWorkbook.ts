import * as XLSX from "xlsx";
import { createFinancialProfileBase, createStarterCategories, createStarterTags, createWorkspaceBase } from "../app/defaults";
import type { Account, Card, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { excelSerialToIso } from "../../shared/utils/date";
import { createId } from "../../shared/utils/id";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeaderCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[,\s원]/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

function guessIssuer(cardName: string) {
  const normalized = cardName.toUpperCase();
  if (normalized.includes("현대") || normalized.includes("HYUNDAI")) return "현대카드";
  if (normalized.includes("우리") || normalized.includes("WOORI")) return "우리카드";
  if (normalized.includes("ZERO") || normalized.includes("Z ")) return "현대카드";
  return "미분류 카드사";
}

function findCategoryId(categories: WorkspaceBundle["categories"], name: string): string | null {
  const aliasMap: Record<string, string> = {
    "학자금": "학자금 대출",
    "가족활동": "가족 활동",
    "개인지출": "개인 지출",
    "생활비": "추가 지출",
    "데이트/여행경비": "데이트/여행",
    "하이패스": "통행료/하이패스",
    "주담대": "주택담보대출",
    "식대(회사)": "회사 식대",
    "의복비": "의류",
    "형준용돈": "용돈",
    "소정용돈": "용돈",
    "경조사비": "경조사",
    "자동차리스": "자동차 리스"
  };
  const resolvedName = aliasMap[name] ?? name;
  return categories.find((category) => category.categoryType === "category" && category.name === resolvedName)?.id ?? null;
}
function inferCategoryIdFromMerchant(categories: WorkspaceBundle["categories"], merchantName: string): string | null {
  const normalizedMerchantName = normalizeText(merchantName).toUpperCase();

  const categoryRules: Array<{ categoryName: string; pattern: RegExp }> = [
    { categoryName: "\uAD50\uD1B5\uBE44", pattern: /KTX|SRT|\uCF54\uB808\uC77C|\uCCA0\uB3C4\uC2B9\uCC28\uAD8C|\uD2F0\uBA38\uB2C8|\uC9C0\uD558\uCCA0|\uBC84\uC2A4|\uD0DD\uC2DC/u },
    { categoryName: "\uD1B5\uC2E0\uBE44", pattern: /KT|SKT|LGU\+|\uD1B5\uC2E0|\uC778\uD130\uB137/u },
    { categoryName: "\uC77C\uBC18 \uC2DD\uBE44", pattern: /\uCE74\uD398|\uCEE4\uD53C|\uC2DD\uB2F9|\uC678\uC2DD|\uBC30\uB2EC|\uB9E5\uB3C4\uB0A0\uB4DC|\uC2A4\uD0C0\uBC85\uC2A4|\uC2E0\uC120\uAD6C\uC774/u },
    { categoryName: "\uC0DD\uD544\uD488", pattern: /\uCFE0\uD321|\uB124\uC774\uBC84\uD398\uC774|\uC774\uB9C8\uD2B8|\uD648\uD50C\uB7EC\uC2A4|\uB2E4\uC774\uC18C|GS25|CU|\uC138\uBE10\uC77C\uB808\uBE10/u },
  ];

  for (const rule of categoryRules) {
    if (rule.pattern.test(normalizedMerchantName)) {
      return findCategoryId(categories, rule.categoryName);
    }
  }

  return null;
}

function createReview(
  workspaceId: string,
  primaryTransactionId: string,
  reviewType: ReviewItem["reviewType"],
  summary: string,
  confidenceScore: number,
  relatedTransactionIds: string[] = [],
): ReviewItem {
  return {
    id: createId("review"),
    workspaceId,
    reviewType,
    status: "open",
    primaryTransactionId,
    relatedTransactionIds,
    confidenceScore,
    summary,
  };
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

function parseStatementDate(value: unknown, fallbackYear = new Date().getFullYear()): string | null {
  const normalized = normalizeText(value);
  if (!normalized || normalized === "-") return null;

  const fullMatch = normalized.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (fullMatch) {
    const [, year, month, day] = fullMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
  }

  const shortMatch = normalized.match(/(\d{1,2})\.(\d{1,2})/);
  if (shortMatch) {
    const [, month, day] = shortMatch;
    return new Date(fallbackYear, Number(month) - 1, Number(day)).toISOString();
  }

  return null;
}

function sanitizeMerchantName(value: string) {
  return normalizeText(value).replace(/[-\s]+$/u, "").trim();
}

function extractMerchantAndAmount(rawMerchant: string, numericCandidates: number[]) {
  const compactMerchant = normalizeText(rawMerchant);
  const normalizedNumericCandidates = numericCandidates.filter((value) => value !== 0);
  const trailingTokenMatch = compactMerchant.match(/-?[\d,]+$/);
  const trailingToken = trailingTokenMatch?.[0] ?? "";
  const suffixAmounts: Array<{ amount: number; token: string }> = [];

  if (trailingToken) {
    for (let index = 0; index < trailingToken.length; index += 1) {
      const token = trailingToken.slice(index);
      if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(token)) continue;
      const amount = parseAmount(token);
      if (amount === 0) continue;
      suffixAmounts.push({ amount, token });
    }
  }

  const merchantSuffix =
    suffixAmounts.length === 0
      ? null
      : suffixAmounts.find((item) => item.token === trailingToken) ??
        (normalizedNumericCandidates.length === 0
          ? suffixAmounts.reduce((best, current) => (current.token.length < best.token.length ? current : best), suffixAmounts[0])
          : suffixAmounts.reduce((best, current) => {
            const bestDistance = Math.min(...normalizedNumericCandidates.map((candidate) => Math.abs(candidate - best.amount)));
            const currentDistance = Math.min(...normalizedNumericCandidates.map((candidate) => Math.abs(candidate - current.amount)));
            return currentDistance < bestDistance ? current : best;
          }, suffixAmounts[0]));

  const merchantAmount = merchantSuffix?.amount ?? 0;
  const merchantName =
    merchantSuffix && trailingToken
      ? sanitizeMerchantName(compactMerchant.slice(0, compactMerchant.length - trailingToken.length))
      : sanitizeMerchantName(compactMerchant);
  const candidates = [merchantAmount, ...normalizedNumericCandidates].filter((value) => value !== 0);
  const amount =
    candidates.length > 0
      ? candidates.reduce((best, current) => {
          const currentAbs = Math.abs(current);
          const bestAbs = Math.abs(best);
          if (currentAbs > bestAbs) return current;
          if (currentAbs === bestAbs && current > best) return current;
          return best;
        }, candidates[0])
      : 0;

  return {
    merchantName: merchantName || sanitizeMerchantName(compactMerchant),
    amount,
  };
}

function isHyundaiDiscountRow(rawMerchant: string, amount: number) {
  const trailingAmountMatch = normalizeText(rawMerchant).match(/(-?\d[\d,]*)$/);
  const trailingAmount = trailingAmountMatch ? parseAmount(trailingAmountMatch[1]) : 0;
  return amount < 0 && trailingAmount === 0;
}

function normalizeCancelledMerchantName(merchantName: string) {
  return normalizeText(merchantName).replace(/^취소[-\s]*/u, "").trim();
}

function removeUncategorizedReviews(reviews: ReviewItem[], primaryTransactionId: string) {
  for (let index = reviews.length - 1; index >= 0; index -= 1) {
    if (reviews[index].primaryTransactionId === primaryTransactionId && reviews[index].reviewType === "uncategorized_transaction") {
      reviews.splice(index, 1);
    }
  }
}

export async function parseHouseholdWorkbook(file: File): Promise<WorkspaceBundle> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const workspace = createWorkspaceBase(file.name.replace(/\.xlsx?$/i, ""), "imported");
  const financialProfile = createFinancialProfileBase(workspace.id);
  const categories = createStarterCategories(workspace.id);
  const tags = createStarterTags(workspace.id);

  const peopleByName = new Map<string, Person>();
  const accountsByName = new Map<string, Account>();
  const cardsByName = new Map<string, Card>();
  const transactions: Transaction[] = [];
  const reviews: ReviewItem[] = [];

  const ensurePerson = (name: string): Person => {
    const normalized = normalizeText(name) || "사용자";
    const existing = peopleByName.get(normalized);
    if (existing) return existing;

    const next: Person = {
      id: createId("person"),
      workspaceId: workspace.id,
      name: normalized,
      displayName: normalized,
      role: peopleByName.size === 0 ? "owner" : "member",
      memo: "",
      isActive: true,
    };
    peopleByName.set(normalized, next);
    return next;
  };

  const ensureAccount = (name: string, ownerName = "", institution = "", number = ""): Account => {
    const normalized = normalizeText(name) || "미정 계좌";
    const existing = accountsByName.get(normalized);
    if (existing) return existing;

    const owner = ownerName ? ensurePerson(ownerName) : null;
    const isShared = normalized.includes("공동");
    const next: Account = {
      id: createId("account"),
      workspaceId: workspace.id,
      ownerPersonId: isShared ? null : owner?.id ?? null,
      name: normalized,
      alias: normalized,
      institutionName: normalizeText(institution) || "미정 금융기관",
      accountNumberMasked: maskText(number),
      accountType: "checking",
      usageType: isShared ? "shared" : "daily",
      isShared,
      memo: "",
    };
    accountsByName.set(normalized, next);
    return next;
  };

  const ensureCard = (name: string, ownerName = "", issuerOverride?: string): Card => {
    const normalized = normalizeText(name) || "미정 카드";
    const existing = cardsByName.get(normalized);
    if (existing) return existing;

    const owner = ownerName ? ensurePerson(ownerName) : null;
    const next: Card = {
      id: createId("card"),
      workspaceId: workspace.id,
      ownerPersonId: owner?.id ?? null,
      name: normalized,
      issuerName: issuerOverride ?? guessIssuer(normalized),
      cardNumberMasked: maskText(normalized),
      linkedAccountId: null,
      cardType: "credit",
      memo: "",
    };
    cardsByName.set(normalized, next);
    return next;
  };

  const pushTransaction = (transaction: Transaction, createUncategorizedReview = false) => {
    transactions.push(transaction);
    if (createUncategorizedReview && transaction.status === "active" && !transaction.categoryId) {
      reviews.push(
        createReview(
          workspace.id,
          transaction.id,
          "uncategorized_transaction",
          `${transaction.merchantName} 거래는 카테고리 지정이 필요합니다.`,
          0.41,
        ),
      );
    }
  };

  const parseHouseholdAccountSheet = () => {
    const accountSheet = workbook.Sheets["계좌"];
    if (!accountSheet) return;
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(accountSheet, { header: 1, defval: null });
    rows.forEach((row) => {
      const values = row.filter((cell) => cell !== null && String(cell).trim() !== "");
      if (values.length < 4) return;
      const [name, number, institution, owner] = values;
      ensureAccount(String(name), String(owner), String(institution), String(number));
    });
  };

  const parseHouseholdTransferSheet = (sheetName: string, ownerName: string) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const owner = ensurePerson(ownerName);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    rows.forEach((row) => {
      const fromAccount = ensureAccount(normalizeText(row["출금통장"]), owner.name);
      const toName = normalizeText(row["입금통장"]);
      const toAccount = accountsByName.get(toName) ?? null;
      const categoryName = normalizeText(row["카테고리"]) || "기타";
      const flowType = normalizeText(row["지출/이체"]);
      const transactionType = flowType.includes("지출") ? "expense" : "transfer";
      const occurredAt = excelSerialToIso(Number(row["이체일"] ?? 0));

      const transaction: Transaction = {
        id: createId("tx"),
        workspaceId: workspace.id,
        occurredAt,
        settledAt: occurredAt,
        transactionType,
        sourceType: "account",
        ownerPersonId: owner.id,
        cardId: null,
        accountId: fromAccount.id,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount?.id ?? null,
        merchantName: toName || "계좌이체",
        description: normalizeText(row["비고"]),
        amount: Math.abs(Number(row["이체금액"] ?? 0)),
        categoryId: findCategoryId(categories, categoryName),
        tagIds: [],
        isInternalTransfer: transactionType === "transfer" && Boolean(toAccount),
        isExpenseImpact: transactionType === "expense",
        isSharedExpense: false,
        refundOfTransactionId: null,
        status: "active",
      };

      pushTransaction(transaction, transaction.isExpenseImpact);

      if (transaction.isInternalTransfer) {
        reviews.push(
          createReview(
            workspace.id,
            transaction.id,
            "internal_transfer_candidate",
            `${fromAccount.name}에서 ${toAccount?.name ?? "미정 계좌"}로 이동한 거래는 내부이체 후보입니다.`,
            0.88,
          ),
        );
      }
    });
  };

  const parseHouseholdCardSheet = (
    sheetName: string,
    ownerName: string,
    dateColumn: string,
    cardColumn: string,
    merchantColumn: string,
    amountColumn: string,
    categoryColumn: string,
  ) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const owner = ensurePerson(ownerName);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    rows.forEach((row) => {
      const cardName = normalizeText(row[cardColumn]);
      const merchant = normalizeText(row[merchantColumn]);
      const amount = Number(row[amountColumn] ?? 0);
      if (!cardName || !merchant || !amount) return;

      const card = ensureCard(cardName, owner.name);
      const occurredAt = excelSerialToIso(Number(row[dateColumn] ?? 0));
      const categoryName = normalizeText(row[categoryColumn]) || "기타";

      pushTransaction(
        {
          id: createId("tx"),
          workspaceId: workspace.id,
          occurredAt,
          settledAt: occurredAt,
          transactionType: "expense",
          sourceType: "card",
          ownerPersonId: owner.id,
          cardId: card.id,
          accountId: card.linkedAccountId,
          fromAccountId: null,
          toAccountId: null,
          merchantName: merchant,
          description: "",
          amount: Math.abs(amount),
          categoryId: findCategoryId(categories, categoryName),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: true,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: "active",
        },
        !normalizeText(row[categoryColumn]),
      );
    });
  };

  const parseWooriCardStatement = () => {
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      return rows.some((row) => normalizeHeaderCell(row?.[0]) === "이용일자" && normalizeHeaderCell(row?.[4]) === "이용가맹점(은행)명");
    });
    if (!sheetName) return false;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
    const headerRowIndex = rows.findIndex((row) => normalizeHeaderCell(row?.[0]) === "이용일자" && normalizeHeaderCell(row?.[4]) === "이용가맹점(은행)명");
    if (headerRowIndex < 0) return false;

    const fallbackYear = new Date().getFullYear();
    for (const row of rows.slice(headerRowIndex + 2)) {
      const occurredAt = parseStatementDate(row[0], fallbackYear);
      const cardName = normalizeText(row[2]);
      const saleType = normalizeText(row[3]);
      const merchantName = normalizeText(row[4]);
      const amount = parseAmount(row[5]);
      if (!occurredAt || !cardName || !merchantName || amount === 0) continue;
      if (merchantName.includes("소계")) continue;

      const ownerName = normalizeText(row[1]).includes("본인") ? "본인" : "사용자";
      const card = ensureCard(cardName, ownerName, "우리카드");
      const isCancelled = saleType.includes("취소") || amount < 0;

      pushTransaction(
        {
          id: createId("tx"),
          workspaceId: workspace.id,
          occurredAt,
          settledAt: occurredAt,
          transactionType: "expense",
          sourceType: "card",
          ownerPersonId: card.ownerPersonId,
          cardId: card.id,
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          merchantName,
          description: "",
          amount: Math.abs(amount),
          categoryId: inferCategoryIdFromMerchant(categories, normalizeCancelledMerchantName(merchantName)),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        !isCancelled,
      );
    }

    return transactions.length > 0;
  };

  const parseLegacyWooriCardStatement = () => {
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      return rows.some(
        (row) =>
          normalizeHeaderCell(row?.[0]) === "이용일" &&
          normalizeHeaderCell(row?.[5]) === "이용카드" &&
          normalizeHeaderCell(row?.[8]) === "이용가맹점(은행)명",
      );
    });
    if (!sheetName) return false;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
    const headerRowIndex = rows.findIndex(
      (row) =>
        normalizeHeaderCell(row?.[0]) === "이용일" &&
        normalizeHeaderCell(row?.[5]) === "이용카드" &&
        normalizeHeaderCell(row?.[8]) === "이용가맹점(은행)명",
    );
    if (headerRowIndex < 0) return false;

    const fallbackYear = new Date().getFullYear();
    for (const row of rows.slice(headerRowIndex + 2)) {
      const occurredAt = parseStatementDate(row[0], fallbackYear);
      const cardName = normalizeText(row[5]);
      const saleType = normalizeText(row[6]);
      const merchantName = normalizeText(row[8]);
      const amount = parseAmount(row[10]) || parseAmount(row[13]);
      if (!occurredAt || !cardName || !merchantName || amount === 0) continue;
      if (merchantName.includes("소계") || merchantName.includes("전월미결제금액")) continue;

      const ownerName = normalizeText(row[4]).includes("본인") ? "본인" : "사용자";
      const card = ensureCard(cardName, ownerName, "우리카드");
      const isCancelled = saleType.includes("취소") || amount < 0;

      pushTransaction(
        {
          id: createId("tx"),
          workspaceId: workspace.id,
          occurredAt,
          settledAt: occurredAt,
          transactionType: "expense",
          sourceType: "card",
          ownerPersonId: card.ownerPersonId,
          cardId: card.id,
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          merchantName: normalizeCancelledMerchantName(merchantName),
          description: "",
          amount: Math.abs(amount),
          originalAmount: Math.abs(amount),
          discountAmount: 0,
          categoryId: inferCategoryIdFromMerchant(categories, normalizeCancelledMerchantName(merchantName)),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        !isCancelled,
      );
    }

    return transactions.length > 0;
  };

  const parseLegacyHyundaiCardActivityStatement = () => {
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      return rows.some(
        (row) =>
          normalizeHeaderCell(row?.[0]) === "이용일자" &&
          normalizeHeaderCell(row?.[2]) === "카드명(카드뒤4자리)" &&
          normalizeHeaderCell(row?.[3]) === "가맹점명" &&
          normalizeHeaderCell(row?.[6]) === "이용금액",
      );
    });
    if (!sheetName) return false;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
    const headerRowIndex = rows.findIndex(
      (row) =>
        normalizeHeaderCell(row?.[0]) === "이용일자" &&
        normalizeHeaderCell(row?.[2]) === "카드명(카드뒤4자리)" &&
        normalizeHeaderCell(row?.[3]) === "가맹점명" &&
        normalizeHeaderCell(row?.[6]) === "이용금액",
    );
    if (headerRowIndex < 0) return false;

    for (const row of rows.slice(headerRowIndex + 1)) {
      const occurredAt = parseStatementDate(row[0]);
      const cardName = normalizeText(row[2]);
      const merchantName = normalizeText(row[3]);
      const amount = parseAmount(row[6]);
      if (!occurredAt || !cardName || !merchantName || amount === 0) continue;

      const ownerName = normalizeText(row[1]).includes("본인") ? "본인" : "사용자";
      const card = ensureCard(cardName, ownerName, "현대카드");

      if (amount < 0) {
        for (let index = transactions.length - 1; index >= 0; index -= 1) {
          const previous = transactions[index];
          if (
            previous.sourceType !== "card" ||
            previous.cardId !== card.id ||
            previous.occurredAt.slice(0, 10) !== occurredAt.slice(0, 10) ||
            previous.status !== "active"
          ) {
            continue;
          }

          const originalAmount = previous.originalAmount ?? previous.amount;
          const discountAmount = (previous.discountAmount ?? 0) + Math.abs(amount);
          transactions[index] = {
            ...previous,
            originalAmount,
            discountAmount,
            amount: Math.max(0, originalAmount - discountAmount),
          };
          break;
        }
        continue;
      }

      pushTransaction(
        {
          id: createId("tx"),
          workspaceId: workspace.id,
          occurredAt,
          settledAt: normalizeText(row[11]) ? parseStatementDate(row[11]) ?? occurredAt : occurredAt,
          transactionType: "expense",
          sourceType: "card",
          ownerPersonId: card.ownerPersonId,
          cardId: card.id,
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          merchantName,
          description: "",
          amount: Math.abs(amount),
          originalAmount: Math.abs(amount),
          discountAmount: 0,
          categoryId: inferCategoryIdFromMerchant(categories, merchantName),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: true,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: "active",
        },
        true,
      );
    }

    return transactions.length > 0;
  };

  const parseHyundaiCardStatement = () => {
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      return rows.some((row) => normalizeHeaderCell(row?.[0]) === "이용일" && normalizeHeaderCell(row?.[1]) === "이용카드" && normalizeHeaderCell(row?.[2]) === "이용가맹점");
    });
    if (!sheetName) return false;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
    const headerRowIndex = rows.findIndex((row) => normalizeHeaderCell(row?.[0]) === "이용일" && normalizeHeaderCell(row?.[1]) === "이용카드");
    if (headerRowIndex < 0) return false;

    for (const row of rows.slice(headerRowIndex + 1)) {
      const occurredAt = parseStatementDate(row[0]);
      const cardName = normalizeText(row[1]);
      const rawMerchant = normalizeText(row[2]);
      if (!occurredAt || !cardName || !rawMerchant || rawMerchant.includes("소계")) continue;

      const { merchantName, amount } = extractMerchantAndAmount(rawMerchant, [
        parseAmount(row[3]),
        parseAmount(row[5]),
        parseAmount(row[6]),
        parseAmount(row[7]),
        parseAmount(row[8]),
        parseAmount(row[9]),
      ]);
      if (!merchantName || amount === 0) continue;

      const ownerName = cardName.includes("본인") ? "본인" : "사용자";
      const card = ensureCard(cardName, ownerName, "현대카드");
      const isCancelled = amount < 0;

      if (isHyundaiDiscountRow(rawMerchant, amount)) {
        for (let index = transactions.length - 1; index >= 0; index -= 1) {
          const previous = transactions[index];
          if (
            previous.sourceType !== "card" ||
            previous.cardId !== card.id ||
            previous.occurredAt.slice(0, 10) !== occurredAt.slice(0, 10) ||
            previous.status !== "active"
          ) {
            continue;
          }

          const originalAmount = previous.originalAmount ?? previous.amount;
          const discountAmount = (previous.discountAmount ?? 0) + Math.abs(amount);
          transactions[index] = {
            ...previous,
            originalAmount,
            discountAmount,
            amount: Math.max(0, originalAmount - discountAmount),
          };
          break;
        }
        continue;
      }

      pushTransaction(
        {
          id: createId("tx"),
          workspaceId: workspace.id,
          occurredAt,
          settledAt: occurredAt,
          transactionType: "expense",
          sourceType: "card",
          ownerPersonId: card.ownerPersonId,
          cardId: card.id,
          accountId: null,
          fromAccountId: null,
          toAccountId: null,
          merchantName,
          description: "",
          amount: Math.abs(amount),
          originalAmount: Math.abs(amount),
          discountAmount: 0,
          categoryId: inferCategoryIdFromMerchant(categories, merchantName),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        !isCancelled,
      );
    }

    return transactions.length > 0;
  };

  parseHouseholdAccountSheet();
  parseHouseholdTransferSheet("정민 이체", "정민");
  parseHouseholdTransferSheet("태정 이체", "태정");
  parseHouseholdCardSheet("정민 카드", "정민", "이용일", "이용카드", "이용가맹점", "이용금액", "카테고리");
  parseHouseholdCardSheet("태정 카드", "태정", "이용일", "카드번호", "사용처/가맹점", "이용금액", "카테고리");

  if (transactions.length === 0) {
    parseWooriCardStatement();
  }
  if (transactions.length === 0) {
    parseLegacyWooriCardStatement();
  }
  if (transactions.length === 0) {
    parseHyundaiCardStatement();
  }
  if (transactions.length === 0) {
    parseLegacyHyundaiCardActivityStatement();
  }

  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    const transaction = transactions[index];
    if (transaction.sourceType !== "card" || transaction.status !== "cancelled") continue;

    const normalizedMerchantName = normalizeCancelledMerchantName(transaction.merchantName);
    let merged = false;

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = transactions[previousIndex];
      if (previous.sourceType !== "card" || previous.cardId !== transaction.cardId || previous.status === "cancelled") {
        continue;
      }
      if (normalizeCancelledMerchantName(previous.merchantName) !== normalizedMerchantName) {
        continue;
      }

      const originalAmount = previous.originalAmount ?? previous.amount;
      const remainingAmount = Math.max(0, previous.amount - transaction.amount);
      const nextStatus = remainingAmount === 0 ? "cancelled" : "active";
      transactions[previousIndex] = {
        ...previous,
        merchantName: normalizedMerchantName,
        originalAmount,
        amount: remainingAmount,
        status: nextStatus,
        isExpenseImpact: nextStatus === "active" && previous.isExpenseImpact,
      };

      if (nextStatus === "cancelled") {
        removeUncategorizedReviews(reviews, previous.id);
      }

      transactions.splice(index, 1);
      removeUncategorizedReviews(reviews, transaction.id);
      merged = true;
      break;
    }

    if (!merged) {
      transactions[index] = {
        ...transaction,
        merchantName: normalizedMerchantName,
      };
    }
  }

  const seen = new Map<string, Transaction>();
  for (const transaction of transactions) {
    const key = [
      transaction.occurredAt.slice(0, 10),
      transaction.amount.toFixed(0),
      transaction.merchantName.replace(/\s+/g, ""),
      transaction.ownerPersonId ?? "",
    ].join("|");

    const existing = seen.get(key);
    if (existing) {
      reviews.push(
        createReview(
          workspace.id,
          transaction.id,
          "duplicate_candidate",
          `${transaction.merchantName} 거래는 같은 날짜와 금액 조합이 있어 중복 후보로 분류됐습니다.`,
          0.79,
          [existing.id],
        ),
      );
    } else {
      seen.set(key, transaction);
    }
  }

  for (const transaction of transactions) {
    if (transaction.status !== "cancelled") continue;
    const candidate = transactions.find(
      (item) =>
        item.id !== transaction.id &&
        item.status === "active" &&
        item.merchantName.replace(/^취소-/, "") === transaction.merchantName.replace(/^취소-/, "") &&
        sameAmount(item.amount, transaction.amount),
    );
    if (!candidate) continue;

    reviews.push(
      createReview(
        workspace.id,
        transaction.id,
        "refund_candidate",
        `${transaction.merchantName} 취소 거래가 기존 사용 내역과 연결될 수 있습니다.`,
        0.72,
        [candidate.id],
      ),
    );
  }

  return {
    workspace,
    financialProfile,
    people: [...peopleByName.values()],
    accounts: [...accountsByName.values()],
    cards: [...cardsByName.values()],
    categories,
    tags,
    transactions,
    reviews,
    imports: [
      {
        id: createId("import"),
        workspaceId: workspace.id,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        parserId: transactions.length > 0 ? "household-statement-import" : "household-v2-workbook",
        rowCount: transactions.length,
        reviewCount: reviews.length,
      },
    ],
    settlements: [],
  };
}
