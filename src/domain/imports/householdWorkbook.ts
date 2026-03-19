import * as XLSX from "xlsx";
import { createFinancialProfileBase, createStarterCategories, createStarterTags, createWorkspaceBase } from "../app/defaults";
import type { Account, Card, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { excelSerialToIso } from "../../shared/utils/date";
import { createId } from "../../shared/utils/id";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function maskText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

function guessIssuer(cardName: string): string {
  if (cardName.includes("삼성")) return "삼성카드";
  if (cardName.includes("우리") || cardName.toUpperCase().includes("Z")) return "우리카드";
  if (cardName.toUpperCase().includes("ZERO") || cardName.includes("현대")) return "현대카드";
  return "미분류 카드사";
}

function findCategoryId(categories: WorkspaceBundle["categories"], name: string): string | null {
  return categories.find((category) => category.name === name)?.id ?? null;
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
    const normalized = normalizeText(name) || "이름없음";
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
    const isShared = normalized.includes("생활비") || normalized.includes("공동");
    const usageType: Account["usageType"] = normalized.includes("카드값")
      ? "card_payment"
      : isShared
        ? "shared"
        : "daily";

    const next: Account = {
      id: createId("account"),
      workspaceId: workspace.id,
      ownerPersonId: owner?.id ?? null,
      name: normalized,
      alias: normalized,
      institutionName: normalizeText(institution) || "미정 금융기관",
      accountNumberMasked: maskText(number),
      accountType: normalized.includes("대출") ? "loan" : "checking",
      usageType,
      isShared,
      memo: "",
    };
    accountsByName.set(normalized, next);
    return next;
  };

  const ensureCard = (name: string, ownerName = ""): Card => {
    const normalized = normalizeText(name) || "미정 카드";
    const existing = cardsByName.get(normalized);
    if (existing) return existing;

    const owner = ownerName ? ensurePerson(ownerName) : null;
    const ownerNameText = owner?.name ?? "";
    const linkedAccount =
      ownerNameText === "형준"
        ? accountsByName.get("형준 카드값") ?? null
        : ownerNameText === "소정"
          ? accountsByName.get("소정 카드값") ?? null
          : null;

    const next: Card = {
      id: createId("card"),
      workspaceId: workspace.id,
      ownerPersonId: owner?.id ?? null,
      name: normalized,
      issuerName: guessIssuer(normalized),
      cardNumberMasked: maskText(normalized),
      linkedAccountId: linkedAccount?.id ?? null,
      cardType: "credit",
      memo: "",
    };
    cardsByName.set(normalized, next);
    return next;
  };

  const accountSheet = workbook.Sheets["계좌"];
  if (accountSheet) {
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(accountSheet, { header: 1, defval: null });
    rows.forEach((row) => {
      const values = row.filter((cell) => cell !== null && String(cell).trim() !== "");
      if (values.length < 4) return;
      const [name, number, institution, owner] = values;
      ensureAccount(String(name), String(owner), String(institution), String(number));
    });
  }

  const parseTransferSheet = (sheetName: string, ownerName: string) => {
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
        isSharedExpense: categoryName === "생활비" || categoryName === "가족생활",
        refundOfTransactionId: null,
        status: "active",
      };

      transactions.push(transaction);

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

  const parseCardSheet = (
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
      const categoryName = normalizeText(row[categoryColumn]);

      if (!cardName || !merchant || !amount) return;

      const card = ensureCard(cardName, owner.name);
      const occurredAt = excelSerialToIso(Number(row[dateColumn] ?? 0));
      const transaction: Transaction = {
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
        description: card.name,
        amount: Math.abs(amount),
        categoryId: findCategoryId(categories, categoryName || "기타"),
        tagIds: [],
        isInternalTransfer: false,
        isExpenseImpact: true,
        isSharedExpense: categoryName === "생활비" || categoryName === "가족생활",
        refundOfTransactionId: null,
        status: "active",
      };

      transactions.push(transaction);

      if (!categoryName) {
        reviews.push(
          createReview(
            workspace.id,
            transaction.id,
            "uncategorized_transaction",
            `${merchant} 거래의 카테고리가 비어 있어 검토가 필요합니다.`,
            0.41,
          ),
        );
      }
    });
  };

  parseTransferSheet("형준 이체", "형준");
  parseTransferSheet("소정 이체", "소정");
  parseCardSheet("형준 카드", "형준", "이용일", "이용카드", "이용가맹점", "이용금액", "카테고리");
  parseCardSheet("소정 카드", "소정", "이용일", "카드번호", "사용처가맹점", "이용금액", "카테고리");

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
          `${transaction.merchantName} 거래는 같은 날짜/금액 조합이 있어 중복 후보로 분류했습니다.`,
          0.79,
          [existing.id],
        ),
      );
    } else {
      seen.set(key, transaction);
    }
  }

  for (const transaction of transactions) {
    if (transaction.amount >= 0) continue;
    const normalizedAmount = Math.abs(transaction.amount);
    const candidate = transactions.find(
      (item) =>
        item.id !== transaction.id &&
        item.merchantName === transaction.merchantName &&
        sameAmount(item.amount, normalizedAmount),
    );
    if (!candidate) continue;

    reviews.push(
      createReview(
        workspace.id,
        transaction.id,
        "refund_candidate",
        `${transaction.merchantName} 환불 거래가 기존 지출과 연결될 수 있습니다.`,
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
        parserId: "household-v2-workbook",
        rowCount: transactions.length,
        reviewCount: reviews.length,
      },
    ],
    settlements: [],
  };
}
