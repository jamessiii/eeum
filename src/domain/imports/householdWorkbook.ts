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

function extractCardNumberMasked(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 4) return "";
  return digits.slice(-4);
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
    "개인 지출": "개인지출",
    "생활비": "추가 지출",
    "데이트/여행경비": "데이트/여행",
    "교통비": "일반 교통",
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
  return findCategoryCandidate(categories, resolvedName)?.id ?? null;
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

type CategoryLookup = {
  id: string;
  name: string;
  label: string;
};

type CategoryInference =
  | {
      mode: "auto" | "review";
      categoryId: string;
      categoryLabel: string;
      confidenceScore: number;
    }
  | null;

type CategoryInferenceRule = {
  categoryName: string;
  parentName?: string;
  mode: "auto" | "review";
  confidenceScore: number;
  patterns: RegExp[];
};

function findCategoryCandidate(
  categories: WorkspaceBundle["categories"],
  name: string,
  options?: { parentName?: string },
): CategoryLookup | null {
  const preferredParentByName: Record<string, string> = {
    식비: "생활비",
    카페: "생활비",
  };

  const resolvedParentName = options?.parentName ?? preferredParentByName[name];
  const groupIdByName = new Map(
    categories
      .filter((category) => category.categoryType === "group")
      .map((category) => [category.name, category.id]),
  );
  const candidates = categories.filter((category) => category.categoryType === "category" && category.name === name);
  const matched =
    (resolvedParentName
      ? candidates.find((category) => category.parentCategoryId === groupIdByName.get(resolvedParentName))
      : null) ?? candidates[0];

  if (!matched) return null;

  const parentName =
    categories.find((category) => category.categoryType === "group" && category.id === matched.parentCategoryId)?.name ?? null;

  return {
    id: matched.id,
    name: matched.name,
    label: parentName ? `${parentName} > ${matched.name}` : matched.name,
  };
}

function inferCategoryDecision(categories: WorkspaceBundle["categories"], merchantName: string): CategoryInference {
  const normalizedMerchantName = normalizeText(merchantName).toUpperCase();
  const compactMerchantName = normalizedMerchantName.replace(/\s+/g, "");
  const matchesRule = (rule: CategoryInferenceRule) =>
    rule.patterns.some((pattern) => pattern.test(normalizedMerchantName) || pattern.test(compactMerchantName));

  const rules: CategoryInferenceRule[] = [
    {
      categoryName: "연회비",
      mode: "auto",
      confidenceScore: 0.98,
      patterns: [/연회비|ANNUAL\s*FEE|MEMBERSHIP\s*FEE/u],
    },
    {
      categoryName: "관리비",
      mode: "auto",
      confidenceScore: 0.96,
      patterns: [/관리비|아파트관리비|관리사무소|아파트관리/u],
    },
    {
      categoryName: "공과금",
      mode: "auto",
      confidenceScore: 0.96,
      patterns: [/공과금|전기요금|전기료|한국전력|한전|도시가스|가스요금|가스료|수도요금|수도료|상하수도|지역난방|난방비/u],
    },
    {
      categoryName: "통신비",
      mode: "auto",
      confidenceScore: 0.95,
      patterns: [/\bKT\b|SKT|LG\s*U\+|LGU\+|헬로모바일|알뜰폰|통신요금|휴대폰요금|인터넷요금/u],
    },
    {
      categoryName: "보험료",
      mode: "auto",
      confidenceScore: 0.94,
      patterns: [/보험료|손해보험|생명보험|화재보험|현대해상|삼성화재|DB손해보험|메리츠화재|KB손해보험|한화손해보험|우체국보험/u],
    },
    {
      categoryName: "주유비",
      mode: "auto",
      confidenceScore: 0.93,
      patterns: [/주유소|셀프주유|오일뱅크|칼텍스|S-OIL|SOIL|SK에너지/u],
    },
    {
      categoryName: "통행료/하이패스",
      mode: "auto",
      confidenceScore: 0.93,
      patterns: [/하이패스|통행료|도로공사|고속도로/u],
    },
    {
      categoryName: "교통비",
      mode: "auto",
      confidenceScore: 0.92,
      patterns: [/KTX|SRT|코레일|철도승차권|티머니|캐시비|지하철|버스|택시|카카오\s*T|카카오택시|우티/u],
    },
    {
      categoryName: "약국",
      mode: "auto",
      confidenceScore: 0.95,
      patterns: [/약국/u],
    },
    {
      categoryName: "의료비",
      mode: "auto",
      confidenceScore: 0.92,
      patterns: [/병원|의원|치과|한의원|정형외과|이비인후과|피부과|내과|소아과|약제비/u],
    },
    {
      categoryName: "회사 식대",
      parentName: "생활비",
      mode: "auto",
      confidenceScore: 0.88,
      patterns: [/구내식당|사내식당|직원식당|사원식당/u],
    },
    {
      categoryName: "구독료",
      mode: "auto",
      confidenceScore: 0.91,
      patterns: [
        /NETFLIX|YOUTUBE|SPOTIFY|MELON|FLO|WAVVE|TIVING|DISNEY|APPLE\.COM\/BILL|NOTION|CANVA|ADOBE|CHATGPT|OPENAI|쿠팡와우|정기결제|구독/u,
      ],
    },
    {
      categoryName: "기부금",
      mode: "auto",
      confidenceScore: 0.92,
      patterns: [/기부|후원|월드비전|유니세프|굿네이버스|초록우산|사랑의열매|적십자|세이브\s*더?\s*칠드런|SAVE\s*THE\s*CHILDREN/u],
    },
    {
      categoryName: "경조사",
      mode: "auto",
      confidenceScore: 0.9,
      patterns: [/축의금|부의금|조의금|화환|경조/u],
    },
    {
      categoryName: "자동차 리스",
      mode: "auto",
      confidenceScore: 0.91,
      patterns: [/자동차\s*리스|오토리스|장기렌트|장기렌터카|SK렌터카|롯데렌탈/u],
    },
    {
      categoryName: "카페",
      parentName: "생활비",
      mode: "review",
      confidenceScore: 0.72,
      patterns: [/스타벅스|메가커피|컴포즈|빽다방|이디야|투썸|할리스|폴바셋|커피빈|블루보틀|커피|카페/u],
    },
    {
      categoryName: "식비",
      parentName: "생활비",
      mode: "review",
      confidenceScore: 0.68,
      patterns: [/배달의민족|요기요|쿠팡이츠|맥도날드|버거킹|롯데리아|서브웨이|식당|김밥|국밥|분식|피자|치킨|샐러드|도시락/u],
    },
    {
      categoryName: "생필품",
      parentName: "생활비",
      mode: "review",
      confidenceScore: 0.65,
      patterns: [/GS25|CU|세븐일레븐|이마트24|편의점|다이소|올리브영|이마트|홈플러스|롯데마트|노브랜드|트레이더스|하나로마트/u],
    },
  ];

  for (const rule of rules) {
    if (!matchesRule(rule)) continue;
    const category = findCategoryCandidate(
      categories,
      rule.categoryName,
      rule.parentName ? { parentName: rule.parentName } : undefined,
    );
    if (!category) continue;

    return {
      mode: rule.mode,
      categoryId: category.id,
      categoryLabel: category.label,
      confidenceScore: rule.confidenceScore,
    };
  }

  return null;
}

function createCategorySuggestionReview(
  workspaceId: string,
  primaryTransactionId: string,
  suggestedCategoryId: string,
  suggestedCategoryLabel: string,
  confidenceScore: number,
): ReviewItem {
  return {
    id: createId("review"),
    workspaceId,
    reviewType: "category_suggestion",
    status: "open",
    primaryTransactionId,
    relatedTransactionIds: [],
    confidenceScore,
    summary: `이 항목은 ${suggestedCategoryLabel}로 분류할까요?`,
    suggestedCategoryId,
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

function removePendingCategoryReviews(reviews: ReviewItem[], primaryTransactionId: string) {
  for (let index = reviews.length - 1; index >= 0; index -= 1) {
    if (
      reviews[index].primaryTransactionId === primaryTransactionId &&
      (reviews[index].reviewType === "uncategorized_transaction" || reviews[index].reviewType === "category_suggestion")
    ) {
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
      cardNumberMasked: extractCardNumberMasked(normalized),
      linkedAccountId: null,
      cardType: "credit",
      memo: "",
    };
    cardsByName.set(normalized, next);
    return next;
  };

  const pushTransaction = (
    transaction: Transaction,
    options?: {
      createUncategorizedReview?: boolean;
      suggestedCategoryId?: string | null;
      suggestedCategoryLabel?: string | null;
      suggestedConfidenceScore?: number;
    },
  ) => {
    transactions.push(transaction);
    if (transaction.status !== "active" || transaction.categoryId) return;

    if (options?.suggestedCategoryId && options.suggestedCategoryLabel) {
      reviews.push(
        createCategorySuggestionReview(
          workspace.id,
          transaction.id,
          options.suggestedCategoryId,
          options.suggestedCategoryLabel,
          options.suggestedConfidenceScore ?? 0.65,
        ),
      );
      return;
    }

    return;

    if (options?.createUncategorizedReview) {
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

      pushTransaction(transaction, { createUncategorizedReview: transaction.isExpenseImpact });

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
        { createUncategorizedReview: !normalizeText(row[categoryColumn]) },
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
          categoryId: (() => {
            const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName));
            return decision?.mode === "auto" ? decision.categoryId : null;
          })(),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        (() => {
          const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName));
          return {
            createUncategorizedReview: !isCancelled,
            suggestedCategoryId: !isCancelled && decision?.mode === "review" ? decision.categoryId : null,
            suggestedCategoryLabel: !isCancelled && decision?.mode === "review" ? decision.categoryLabel : null,
            suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
          };
        })(),
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
          categoryId: (() => {
            const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName));
            return decision?.mode === "auto" ? decision.categoryId : null;
          })(),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        (() => {
          const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName));
          return {
            createUncategorizedReview: !isCancelled,
            suggestedCategoryId: !isCancelled && decision?.mode === "review" ? decision.categoryId : null,
            suggestedCategoryLabel: !isCancelled && decision?.mode === "review" ? decision.categoryLabel : null,
            suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
          };
        })(),
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
          categoryId: (() => {
            const decision = inferCategoryDecision(categories, merchantName);
            return decision?.mode === "auto" ? decision.categoryId : null;
          })(),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: true,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: "active",
        },
        (() => {
          const decision = inferCategoryDecision(categories, merchantName);
          return {
            createUncategorizedReview: true,
            suggestedCategoryId: decision?.mode === "review" ? decision.categoryId : null,
            suggestedCategoryLabel: decision?.mode === "review" ? decision.categoryLabel : null,
            suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
          };
        })(),
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
          categoryId: (() => {
            const decision = inferCategoryDecision(categories, merchantName);
            return decision?.mode === "auto" ? decision.categoryId : null;
          })(),
          tagIds: [],
          isInternalTransfer: false,
          isExpenseImpact: !isCancelled,
          isSharedExpense: false,
          refundOfTransactionId: null,
          status: isCancelled ? "cancelled" : "active",
        },
        (() => {
          const decision = inferCategoryDecision(categories, merchantName);
          return {
            createUncategorizedReview: !isCancelled,
            suggestedCategoryId: !isCancelled && decision?.mode === "review" ? decision.categoryId : null,
            suggestedCategoryLabel: !isCancelled && decision?.mode === "review" ? decision.categoryLabel : null,
            suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
          };
        })(),
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
        removePendingCategoryReviews(reviews, previous.id);
      }

      transactions.splice(index, 1);
      removePendingCategoryReviews(reviews, transaction.id);
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
