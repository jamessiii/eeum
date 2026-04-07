import * as XLSX from "xlsx";
import { createFinancialProfileBase, createStarterCategories, createStarterTags, createWorkspaceBase } from "../app/defaults";
import type { Account, Card, Category, ImportRecord, Person, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { excelSerialToIso } from "../../shared/utils/date";
import { createId } from "../../shared/utils/id";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeFingerprintText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function digestHex(input: string | ArrayBuffer) {
  const source = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function buildImportFingerprints(file: File, buffer: ArrayBuffer, transactions: Transaction[]) {
  const fileFingerprint = await digestHex(buffer);
  const contentSource = [
    normalizeFingerprintText(file.name.replace(/\.[^.]+$/u, "")),
    ...transactions
      .map((transaction) =>
        [
          transaction.occurredAt.slice(0, 10),
          transaction.settledAt?.slice(0, 10) ?? "",
          transaction.transactionType,
          transaction.status,
          transaction.amount.toFixed(0),
          normalizeFingerprintText(transaction.merchantName),
          normalizeFingerprintText(transaction.description),
        ].join("|"),
      )
      .sort(),
  ].join("\n");
  const contentFingerprint = await digestHex(contentSource);
  return { fileFingerprint, contentFingerprint };
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

function normalizeAccountNumber(value: string) {
  return value.trim();
}

function normalizePersonNameForMatch(value: string) {
  return value.replace(/\s+/g, "").trim();
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

type ImportClassificationContext = {
  categories: Category[];
  transactions: Transaction[];
};

type MerchantHistoryCategoryBucket = {
  name: string;
  parentName?: string;
  fixedOrVariable: Category["fixedOrVariable"];
  count: number;
};

type HistoricalMerchantProfile = {
  merchantKey: string;
  count: number;
  monthCount: number;
  uniqueCategoryCount: number;
  amountAverage: number;
  amountSpreadRate: number;
  dominantCategory: MerchantHistoryCategoryBucket;
  dominantCategoryShare: number;
};

type HistoricalMerchantAccumulator = {
  count: number;
  minAmount: number;
  maxAmount: number;
  amountSum: number;
  monthKeys: Set<string>;
  categoryBuckets: Map<string, MerchantHistoryCategoryBucket>;
};

const AUTO_BLOCKED_MERCHANT_PATTERNS = [
  /네이버\s*페이|NAVER\s*PAY/u,
  /카카오\s*페이|KAKAO\s*PAY/u,
  /토스|TOSS/u,
  /페이코|PAYCO/u,
  /다날|DANAL/u,
  /KG\s*이니시스|INI?SIS|KCP|NHN/u,
  /쿠팡|COUPANG/u,
  /배달의민족|배민|요기요|쿠팡이츠/u,
];

function normalizeMerchantKey(value: string) {
  return normalizeText(value).toUpperCase().replace(/[^0-9A-Z가-힣]/gu, "");
}

function matchesMerchantPattern(merchantName: string, pattern: RegExp) {
  const normalizedMerchantName = normalizeText(merchantName).toUpperCase();
  const compactMerchantName = normalizedMerchantName.replace(/\s+/g, "");
  return pattern.test(normalizedMerchantName) || pattern.test(compactMerchantName);
}

function isAutoBlockedMerchant(merchantName: string) {
  return AUTO_BLOCKED_MERCHANT_PATTERNS.some((pattern) => matchesMerchantPattern(merchantName, pattern));
}

function cloneCategoriesForWorkspace(categories: Category[], workspaceId: string) {
  const groupIdMap = new Map<string, string>();
  const clonedGroups = categories
    .filter((category) => category.categoryType === "group")
    .map((category) => {
      const nextId = createId("category");
      groupIdMap.set(category.id, nextId);
      return {
        ...category,
        id: nextId,
        workspaceId,
        parentCategoryId: null,
      };
    });

  const clonedLeafCategories = categories
    .filter((category) => category.categoryType === "category")
    .map((category) => ({
      ...category,
      id: createId("category"),
      workspaceId,
      parentCategoryId: category.parentCategoryId ? (groupIdMap.get(category.parentCategoryId) ?? null) : null,
    }));

  return [...clonedGroups, ...clonedLeafCategories];
}

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

function inferRuleBasedCategoryDecision(categories: WorkspaceBundle["categories"], merchantName: string): CategoryInference {
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
      patterns: [/NETFLIX|YOUTUBE|SPOTIFY|MELON|FLO|WAVVE|TIVING|DISNEY|APPLE\.COM\/BILL|NOTION|CANVA|ADOBE|CHATGPT|OPENAI|쿠팡와우/u],
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
    if (!rule.patterns.some((pattern) => matchesMerchantPattern(merchantName, pattern))) continue;

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

function buildHistoricalMerchantProfiles(
  transactions: Transaction[],
  categories: Category[],
) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const groupNameMap = new Map(
    categories.filter((category) => category.categoryType === "group").map((category) => [category.id, category.name]),
  );
  const merchantMap = new Map<string, HistoricalMerchantAccumulator>();

  for (const transaction of transactions) {
    if (!transaction.isExpenseImpact || transaction.transactionType !== "expense" || transaction.status !== "active") continue;
    if (!transaction.categoryId) continue;

    const category = categoryMap.get(transaction.categoryId);
    if (!category || category.categoryType !== "category") continue;

    const merchantKey = normalizeMerchantKey(transaction.merchantName);
    if (!merchantKey) continue;

    const bucket =
      merchantMap.get(merchantKey) ??
      (() => {
        const created: HistoricalMerchantAccumulator = {
          count: 0,
          minAmount: Number.MAX_SAFE_INTEGER,
          maxAmount: 0,
          amountSum: 0,
          monthKeys: new Set<string>(),
          categoryBuckets: new Map<string, MerchantHistoryCategoryBucket>(),
        };
        merchantMap.set(merchantKey, created);
        return created;
      })();

    const amount = Math.abs(transaction.amount);
    const parentName = category.parentCategoryId ? (groupNameMap.get(category.parentCategoryId) ?? undefined) : undefined;
    const categoryKey = `${parentName ?? ""}::${category.name}`;
    const categoryBucket = bucket.categoryBuckets.get(categoryKey) ?? {
      name: category.name,
      parentName,
      fixedOrVariable: category.fixedOrVariable,
      count: 0,
    };

    bucket.count += 1;
    bucket.minAmount = Math.min(bucket.minAmount, amount);
    bucket.maxAmount = Math.max(bucket.maxAmount, amount);
    bucket.amountSum += amount;
    bucket.monthKeys.add(transaction.occurredAt.slice(0, 7));
    categoryBucket.count += 1;
    bucket.categoryBuckets.set(categoryKey, categoryBucket);
  }

  return new Map(
    [...merchantMap.entries()]
      .map(([merchantKey, profile]): [string, HistoricalMerchantProfile] | null => {
        const dominantCategory = [...profile.categoryBuckets.values()].sort((left, right) => right.count - left.count)[0] ?? null;
        if (!dominantCategory) return null;

        const amountAverage = Math.round(profile.amountSum / Math.max(1, profile.count));
        const amountSpreadRate = amountAverage ? (profile.maxAmount - profile.minAmount) / amountAverage : 0;

        return [
          merchantKey,
          {
            merchantKey,
            count: profile.count,
            monthCount: profile.monthKeys.size,
            uniqueCategoryCount: profile.categoryBuckets.size,
            amountAverage,
            amountSpreadRate,
            dominantCategory,
            dominantCategoryShare: dominantCategory.count / Math.max(1, profile.count),
          },
        ];
      })
      .filter((entry): entry is [string, HistoricalMerchantProfile] => Boolean(entry)),
  );
}

function inferHistoryBasedCategoryDecision(
  categories: WorkspaceBundle["categories"],
  merchantName: string,
  historicalProfiles: Map<string, HistoricalMerchantProfile>,
): CategoryInference {
  const profile = historicalProfiles.get(normalizeMerchantKey(merchantName));
  if (!profile) return null;

  const category = findCategoryCandidate(
    categories,
    profile.dominantCategory.name,
    profile.dominantCategory.parentName ? { parentName: profile.dominantCategory.parentName } : undefined,
  );
  if (!category) return null;

  const hasStableRecurringPattern =
    profile.count >= 4 &&
    profile.monthCount >= 3 &&
    profile.uniqueCategoryCount === 1 &&
    profile.dominantCategoryShare >= 0.9 &&
    profile.amountSpreadRate <= 0.1;

  if (
    !isAutoBlockedMerchant(merchantName) &&
    profile.dominantCategory.fixedOrVariable === "fixed" &&
    hasStableRecurringPattern
  ) {
    return {
      mode: "auto",
      categoryId: category.id,
      categoryLabel: category.label,
      confidenceScore: 0.9,
    };
  }

  const hasSuggestibleHistory =
    profile.count >= 3 &&
    profile.monthCount >= 2 &&
    profile.dominantCategoryShare >= 0.8 &&
    profile.amountSpreadRate <= 0.45;

  if (!hasSuggestibleHistory) return null;

  return {
    mode: "review",
    categoryId: category.id,
    categoryLabel: category.label,
    confidenceScore: 0.74,
  };
}

function inferCategoryDecision(
  categories: WorkspaceBundle["categories"],
  merchantName: string,
  historicalProfiles: Map<string, HistoricalMerchantProfile>,
): CategoryInference {
  const ruleDecision = inferRuleBasedCategoryDecision(categories, merchantName);
  const historyDecision = inferHistoryBasedCategoryDecision(categories, merchantName, historicalProfiles);

  if (ruleDecision?.mode === "auto") return ruleDecision;
  if (ruleDecision?.mode === "review") {
    if (historyDecision?.mode === "review" && historyDecision.confidenceScore > ruleDecision.confidenceScore) {
      return historyDecision;
    }
    return ruleDecision;
  }

  return historyDecision;
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

function createStableDateIso(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

function parseStatementDate(value: unknown, fallbackYear = new Date().getFullYear()): string | null {
  const normalized = normalizeText(value);
  if (!normalized || normalized === "-") return null;

  const fullMatch = normalized.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (fullMatch) {
    const [, year, month, day] = fullMatch;
    return createStableDateIso(Number(year), Number(month), Number(day));
  }

  const shortMatch = normalized.match(/(\d{1,2})\.(\d{1,2})/);
  if (shortMatch) {
    const [, month, day] = shortMatch;
    return createStableDateIso(fallbackYear, Number(month), Number(day));
  }

  return null;
}

function normalizeTemplateHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[()[\]{}<>._\-/:]/g, "")
    .trim()
    .toUpperCase();
}

function headerMatchesAlias(header: unknown, aliases: string[]) {
  const normalizedHeader = normalizeTemplateHeader(header);
  if (!normalizedHeader) return false;
  return aliases.some((alias) => {
    const normalizedAlias = normalizeTemplateHeader(alias);
    return normalizedHeader === normalizedAlias || normalizedHeader.includes(normalizedAlias);
  });
}

type StatementColumnKey =
  | "date"
  | "time"
  | "card"
  | "ownerType"
  | "merchant"
  | "approvedAmount"
  | "saleType"
  | "installmentMonths"
  | "approvalNumber"
  | "cancelStatus"
  | "benefitAmount"
  | "paymentAmount"
  | "settledDate";

type StatementTemplate = {
  id: string;
  required: StatementColumnKey[];
  minimumMatchedColumnCount: number;
  aliases: Record<StatementColumnKey, string[]>;
  excludedSheetAliases?: string[];
};

const STATEMENT_COLUMN_ALIASES: Record<StatementColumnKey, string[]> = {
  date: [
    "이용일자",
    "이용일",
    "승인일자",
    "거래일자",
    "매출일자",
    "사용일자",
    "거래일",
    "이용일시",
  ],
  time: ["승인시각", "승인시간", "이용시간", "거래시간", "사용시간", "매출시간"],
  card: [
    "카드번호",
    "이용카드",
    "카드명",
    "사용카드",
    "카드명카드번호4자리",
    "카드명(카드번호4자리)",
    "카드명(번호끝4자리)",
    "카드명/번호",
    "카드",
  ],
  ownerType: ["본인가족구분", "본인/가족", "회원구분", "소유구분", "카드구분", "사용자구분", "회원명"],
  merchant: [
    "가맹점명",
    "사용처/가맹점",
    "사용처",
    "이용가맹점",
    "이용가맹점(상호명)",
    "이용가맹점상호명",
    "가맹점",
    "상호명",
    "이용처",
  ],
  approvedAmount: [
    "승인금액(원)",
    "승인금액",
    "이용금액",
    "사용금액",
    "매출금액",
    "이용총액",
    "합계금액",
    "원금",
  ],
  saleType: ["일시불할부구분", "일시불/할부", "매출구분", "거래구분", "이용구분", "승인구분", "구분"],
  installmentMonths: ["할부개월", "할부기간", "할부개월수", "할부", "회차"],
  approvalNumber: ["승인번호", "매출번호", "거래번호", "전표번호", "사용번호"],
  cancelStatus: ["취소여부", "취소유무", "취소구분", "매출취소여부", "상태", "취소"],
  benefitAmount: [
    "혜택금액",
    "할인금액",
    "할인금액(원)",
    "청구할인금액",
    "즉시할인금액",
    "할인(원)",
    "할인액",
    "혜택액",
  ],
  paymentAmount: [
    "결제금액",
    "청구금액",
    "입금금액",
    "입금금액(취소금액)",
    "이번달입금하실금액",
    "이번달청구금액",
    "결제예정금액",
    "이번달입금하실금액_원금",
    "결제단위금액",
    "결제단위원금액",
    "결제단위원금",
    "통합청구금액",
    "통합청구금액(원)",
    "결제단위금액(원)",
  ],
  settledDate: ["결제일", "청구일", "입금기준일", "결제예정일", "납부일", "출금예정일"],
};

const COLUMN_DRIVEN_STATEMENT_TEMPLATES: StatementTemplate[] = [
  {
    id: "card_statement_detail",
    required: ["date", "merchant", "approvedAmount"],
    minimumMatchedColumnCount: 5,
    aliases: STATEMENT_COLUMN_ALIASES,
    excludedSheetAliases: [
      "결제단위번호",
      "통합청구구분",
      "결제은행",
      "결제계좌",
      "대표카드",
      "발송방법",
      "선택",
    ],
  },
];

function detectIssuerNameByWorkbook(fileName: string, sheetNames: string[]) {
  const searchPool = [fileName, ...sheetNames].join(" ").toUpperCase();
  if (searchPool.includes("HYUNDAI") || searchPool.includes("현대")) return "현대카드";
  if (searchPool.includes("LOTTE") || searchPool.includes("롯데")) return "롯데카드";
  if (searchPool.includes("SHINHAN") || searchPool.includes("신한")) return "신한카드";
  if (searchPool.includes("KB") || searchPool.includes("KOOKMIN") || searchPool.includes("국민")) return "국민카드";
  if (searchPool.includes("WOORI") || searchPool.includes("우리")) return "우리카드";
  return "미분류 카드";
}

function resolveStatementTemplate(
  rows: (string | null)[][],
  template: StatementTemplate,
): { headerRowIndex: number; columnIndexByKey: Partial<Record<StatementColumnKey, number>>; matchedColumnCount: number } | null {
  let bestMatch: { headerRowIndex: number; columnIndexByKey: Partial<Record<StatementColumnKey, number>>; matchedColumnCount: number } | null = null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const columnIndexByKey: Partial<Record<StatementColumnKey, number>> = {};

    row.forEach((cell, cellIndex) => {
      (Object.keys(template.aliases) as StatementColumnKey[]).forEach((key) => {
        if (typeof columnIndexByKey[key] === "number") return;
        if (headerMatchesAlias(cell, template.aliases[key])) {
          columnIndexByKey[key] = cellIndex;
        }
      });
    });

    const hasExcludedAlias = (template.excludedSheetAliases ?? []).some((alias) =>
      row.some((cell) => headerMatchesAlias(cell, [alias])),
    );
    if (hasExcludedAlias) continue;

    const isMatch = template.required.every((key) => typeof columnIndexByKey[key] === "number");
    const matchedColumnCount = Object.keys(columnIndexByKey).length;
    if (isMatch && matchedColumnCount >= template.minimumMatchedColumnCount) {
      const candidate = {
        headerRowIndex: rowIndex,
        columnIndexByKey,
        matchedColumnCount,
      };
      if (!bestMatch || candidate.matchedColumnCount > bestMatch.matchedColumnCount) {
        bestMatch = candidate;
      }
    }
  }

  return bestMatch;
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

export async function parseHouseholdWorkbook(file: File, context?: ImportClassificationContext): Promise<WorkspaceBundle> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const workspace = createWorkspaceBase(file.name.replace(/\.xlsx?$/i, ""), "imported");
  const financialProfile = createFinancialProfileBase(workspace.id);
  const categories =
    context?.categories?.length ? cloneCategoriesForWorkspace(context.categories, workspace.id) : createStarterCategories(workspace.id);
  const tags = createStarterTags(workspace.id);
  const historicalProfiles = buildHistoricalMerchantProfiles(context?.transactions ?? [], context?.categories ?? []);

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
      accountNumberMasked: normalizeAccountNumber(number),
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

  const parseDetectedHouseholdTransferSheets = () => {
    workbook.SheetNames.filter((sheetName) => {
      const normalized = normalizeText(sheetName);
      return normalized.endsWith("이체") && normalized !== "계좌";
    }).forEach((sheetName) => {
      const ownerName = normalizeText(sheetName).replace(/\s*이체$/u, "").trim();
      if (!ownerName) return;
      parseHouseholdTransferSheet(sheetName, ownerName);
    });
  };

  const parseDetectedHouseholdCardSheets = () => {
    workbook.SheetNames.filter((sheetName) => {
      const normalized = normalizeText(sheetName);
      return normalized.endsWith("카드") && normalized !== "카드";
    }).forEach((sheetName) => {
      const ownerName = normalizeText(sheetName).replace(/\s*카드$/u, "").trim();
      if (!ownerName) return;

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      const headerRow = rows.find((row) => row.some((cell) => normalizeText(cell).length > 0)) ?? [];
      const normalizedHeaders = headerRow.map((cell) => normalizeText(cell));

      if (
        normalizedHeaders.includes("이용일") &&
        normalizedHeaders.includes("이용카드") &&
        normalizedHeaders.includes("이용가맹점") &&
        normalizedHeaders.includes("이용금액")
      ) {
        parseHouseholdCardSheet(sheetName, ownerName, "이용일", "이용카드", "이용가맹점", "이용금액", "카테고리");
        return;
      }

      if (
        normalizedHeaders.includes("이용일자") &&
        normalizedHeaders.includes("카드번호") &&
        normalizedHeaders.includes("사용처/가맹점") &&
        normalizedHeaders.includes("이용금액")
      ) {
        parseHouseholdCardSheet(sheetName, ownerName, "이용일자", "카드번호", "사용처/가맹점", "이용금액", "카테고리");
      }
    });
  };

  const finalizePrimaryOwner = () => {
    const preferredOwner = [...peopleByName.values()].find((person) =>
      normalizePersonNameForMatch(`${person.displayName} ${person.name}`).includes("형준"),
    );
    if (!preferredOwner) return;

    peopleByName.forEach((person, key) => {
      peopleByName.set(key, {
        ...person,
        role: person.id === preferredOwner.id ? "owner" : "member",
      });
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
            const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName), historicalProfiles);
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
          const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName), historicalProfiles);
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
            const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName), historicalProfiles);
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
          const decision = inferCategoryDecision(categories, normalizeCancelledMerchantName(merchantName), historicalProfiles);
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
            const decision = inferCategoryDecision(categories, merchantName, historicalProfiles);
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
          const decision = inferCategoryDecision(categories, merchantName, historicalProfiles);
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

  const parseDomesticCardUsageLookupStatement = () => {
    const detailSheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      return rows.some(
        (row) =>
          normalizeHeaderCell(row?.[0]) === "카드번호" &&
          normalizeHeaderCell(row?.[1]) === "본인가족구분" &&
          normalizeHeaderCell(row?.[2]) === "승인일자" &&
          normalizeHeaderCell(row?.[3]) === "승인시각" &&
          normalizeHeaderCell(row?.[4]) === "가맹점명" &&
          normalizeHeaderCell(row?.[5]) === "승인금액(원)" &&
          normalizeHeaderCell(row?.[6]) === "일시불할부구분" &&
          normalizeHeaderCell(row?.[8]) === "승인번호" &&
          normalizeHeaderCell(row?.[9]) === "취소여부" &&
          normalizeHeaderCell(row?.[11]) === "결제일",
      );
    });
    if (!detailSheetName) return false;

    const detailSheet = workbook.Sheets[detailSheetName];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(detailSheet, { header: 1, defval: null });
    const headerRowIndex = rows.findIndex(
      (row) =>
        normalizeHeaderCell(row?.[0]) === "카드번호" &&
        normalizeHeaderCell(row?.[1]) === "본인가족구분" &&
        normalizeHeaderCell(row?.[2]) === "승인일자" &&
        normalizeHeaderCell(row?.[3]) === "승인시각" &&
        normalizeHeaderCell(row?.[4]) === "가맹점명" &&
        normalizeHeaderCell(row?.[5]) === "승인금액(원)" &&
        normalizeHeaderCell(row?.[8]) === "승인번호" &&
        normalizeHeaderCell(row?.[9]) === "취소여부" &&
        normalizeHeaderCell(row?.[11]) === "결제일",
    );
    if (headerRowIndex < 0) return false;

    const issuerName = "현대카드";
    const approvalTransactionIndex = new Map<string, number>();

    for (const row of rows.slice(headerRowIndex + 1)) {
      const cardNumber = normalizeText(row[0]);
      const ownerType = normalizeText(row[1]);
      const occurredAt = parseStatementDate(row[2]);
      const merchantName = normalizeText(row[4]);
      const amount = parseAmount(row[5]);
      const installmentType = normalizeText(row[6]);
      const installmentMonths = normalizeText(row[7]);
      const approvalNumber = normalizeText(row[8]);
      const cancelStatus = normalizeText(row[9]);
      const pointAmount = parseAmount(row[10]);
      const settledAt = parseStatementDate(row[11]) ?? occurredAt;

      if (!cardNumber || !occurredAt || !merchantName || amount === 0) continue;

      const ownerName = ownerType.includes("본인") ? "본인" : ownerType || "사용자";
      const last4 = extractCardNumberMasked(cardNumber);
      const cardName = `${issuerName} ${last4 || "카드"}`;
      const card = ensureCard(cardName, ownerName, issuerName);
      const normalizedMerchantName = normalizeCancelledMerchantName(merchantName);
      const isCancelled = cancelStatus.includes("취소") || amount < 0;
      const approvalKey = approvalNumber ? `${card.id}|${approvalNumber}` : "";

      if (isCancelled && approvalKey) {
        const previousIndex = approvalTransactionIndex.get(approvalKey);
        if (typeof previousIndex === "number") {
          const previous = transactions[previousIndex];
          if (previous && previous.status === "active") {
            transactions[previousIndex] = {
              ...previous,
              merchantName: normalizedMerchantName,
              status: "cancelled",
              isExpenseImpact: false,
              amount: Math.abs(previous.amount),
            };
            removePendingCategoryReviews(reviews, previous.id);
            continue;
          }
        }
      }

      const descriptionParts = [
        installmentType || null,
        installmentMonths && installmentMonths !== "0" ? `${installmentMonths}개월` : null,
        approvalNumber ? `승인 ${approvalNumber}` : null,
        pointAmount > 0 ? `포인트 ${pointAmount}` : null,
      ].filter((value): value is string => Boolean(value));

      const transaction: Transaction = {
        id: createId("tx"),
        workspaceId: workspace.id,
        occurredAt,
        settledAt: settledAt ?? occurredAt,
        transactionType: "expense",
        sourceType: "card",
        ownerPersonId: card.ownerPersonId,
        cardId: card.id,
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        merchantName: normalizedMerchantName,
        description: descriptionParts.join(" · "),
        amount: Math.abs(amount),
        originalAmount: Math.abs(amount),
        discountAmount: 0,
        categoryId: (() => {
          const decision = inferCategoryDecision(categories, normalizedMerchantName, historicalProfiles);
          return !isCancelled && decision?.mode === "auto" ? decision.categoryId : null;
        })(),
        tagIds: [],
        isInternalTransfer: false,
        isExpenseImpact: !isCancelled,
        isSharedExpense: false,
        refundOfTransactionId: null,
        status: isCancelled ? "cancelled" : "active",
      };

      const decision = inferCategoryDecision(categories, normalizedMerchantName, historicalProfiles);
      pushTransaction(transaction, {
        createUncategorizedReview: !isCancelled,
        suggestedCategoryId: !isCancelled && decision?.mode === "review" ? decision.categoryId : null,
        suggestedCategoryLabel: !isCancelled && decision?.mode === "review" ? decision.categoryLabel : null,
        suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
      });

      if (!isCancelled && approvalKey) {
        approvalTransactionIndex.set(approvalKey, transactions.length - 1);
      }
    }

    return transactions.length > 0;
  };

  const parseColumnDrivenCardStatement = () => {
    const issuerName = detectIssuerNameByWorkbook(file.name, workbook.SheetNames);
    const approvalTransactionIndex = new Map<string, number>();
    let parsedCount = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, defval: null });
      const matchedTemplate = COLUMN_DRIVEN_STATEMENT_TEMPLATES
        .map((template) => ({ template, resolved: resolveStatementTemplate(rows, template) }))
        .find((entry) => entry.resolved);

      if (!matchedTemplate?.resolved) continue;

      const { columnIndexByKey, headerRowIndex } = matchedTemplate.resolved;

      for (const row of rows.slice(headerRowIndex + 1)) {
        const getCell = (key: StatementColumnKey) => {
          const index = columnIndexByKey[key];
          return typeof index === "number" ? row[index] : null;
        };

        const occurredAt = parseStatementDate(getCell("date"));
        const merchantName = normalizeText(getCell("merchant"));
        const approvedAmount = parseAmount(getCell("approvedAmount"));
        if (!occurredAt || !merchantName || approvedAmount === 0) continue;

        const benefitAmount = Math.abs(parseAmount(getCell("benefitAmount")));
        const paymentAmountRaw = parseAmount(getCell("paymentAmount"));
        const paymentAmount = Math.abs(paymentAmountRaw);
        const cancelStatus = normalizeText(getCell("cancelStatus"));
        const approvalNumber = normalizeText(getCell("approvalNumber"));
        const ownerType = normalizeText(getCell("ownerType"));
        const cardValue = normalizeText(getCell("card"));
        const installmentType = normalizeText(getCell("saleType"));
        const installmentMonths = normalizeText(getCell("installmentMonths"));
        const settledAt = parseStatementDate(getCell("settledDate")) ?? occurredAt;
        const isCancelled = cancelStatus.includes("취소") || approvedAmount < 0 || paymentAmountRaw < 0;

        const ownerName = ownerType.includes("본인") ? "본인" : ownerType || "사용자";
        const last4 = extractCardNumberMasked(cardValue);
        const cardName =
          cardValue && cardValue.length > 4 && !/^\d+$/.test(cardValue.replace(/\D+/g, ""))
            ? cardValue
            : `${issuerName} ${last4 || "카드"}`;
        const card = ensureCard(cardName, ownerName, issuerName);
        const normalizedMerchantName = normalizeCancelledMerchantName(merchantName);
        const approvalKey = approvalNumber ? `${card.id}|${approvalNumber}` : "";

        if (isCancelled && approvalKey) {
          const previousIndex = approvalTransactionIndex.get(approvalKey);
          if (typeof previousIndex === "number") {
            const previous = transactions[previousIndex];
            if (previous && previous.status === "active") {
              transactions[previousIndex] = {
                ...previous,
                merchantName: normalizedMerchantName,
                status: "cancelled",
                isExpenseImpact: false,
              };
              removePendingCategoryReviews(reviews, previous.id);
              parsedCount += 1;
              continue;
            }
          }
        }

        const originalAmount = Math.abs(approvedAmount);
        const inferredDiscountAmount =
          benefitAmount > 0
            ? benefitAmount
            : paymentAmount > 0 && paymentAmount < originalAmount
              ? originalAmount - paymentAmount
              : 0;
        const netAmount = paymentAmount > 0 ? paymentAmount : Math.max(0, originalAmount - inferredDiscountAmount);
        const descriptionParts = [
          installmentType || null,
          installmentMonths && installmentMonths !== "0" ? `${installmentMonths}개월` : null,
          approvalNumber ? `승인 ${approvalNumber}` : null,
          inferredDiscountAmount > 0 ? `할인 ${inferredDiscountAmount}` : null,
        ].filter((value): value is string => Boolean(value));

        const decision = inferCategoryDecision(categories, normalizedMerchantName, historicalProfiles);
        pushTransaction(
          {
            id: createId("tx"),
            workspaceId: workspace.id,
            occurredAt,
            settledAt,
            transactionType: "expense",
            sourceType: "card",
            ownerPersonId: card.ownerPersonId,
            cardId: card.id,
            accountId: null,
            fromAccountId: null,
            toAccountId: null,
            merchantName: normalizedMerchantName,
            description: descriptionParts.join(" · "),
            amount: netAmount,
            originalAmount,
            discountAmount: inferredDiscountAmount,
            categoryId: !isCancelled && decision?.mode === "auto" ? decision.categoryId : null,
            tagIds: [],
            isInternalTransfer: false,
            isExpenseImpact: !isCancelled,
            isSharedExpense: false,
            refundOfTransactionId: null,
            status: isCancelled ? "cancelled" : "active",
          },
          {
            createUncategorizedReview: !isCancelled,
            suggestedCategoryId: !isCancelled && decision?.mode === "review" ? decision.categoryId : null,
            suggestedCategoryLabel: !isCancelled && decision?.mode === "review" ? decision.categoryLabel : null,
            suggestedConfidenceScore: decision?.mode === "review" ? decision.confidenceScore : undefined,
          },
        );

        if (!isCancelled && approvalKey) {
          approvalTransactionIndex.set(approvalKey, transactions.length - 1);
        }
        parsedCount += 1;
      }
    }

    return parsedCount > 0;
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
            const decision = inferCategoryDecision(categories, merchantName, historicalProfiles);
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
          const decision = inferCategoryDecision(categories, merchantName, historicalProfiles);
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
  parseDetectedHouseholdTransferSheets();
  parseDetectedHouseholdCardSheets();
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
    parseColumnDrivenCardStatement();
  }
  if (transactions.length === 0) {
    parseDomesticCardUsageLookupStatement();
  }
  if (transactions.length === 0) {
    parseHyundaiCardStatement();
  }
  if (transactions.length === 0) {
    parseLegacyHyundaiCardActivityStatement();
  }

  finalizePrimaryOwner();

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
      const discountAmount = Math.max(previous.discountAmount ?? 0, originalAmount - remainingAmount);
      const nextStatus = remainingAmount === 0 ? "cancelled" : "active";
      transactions[previousIndex] = {
        ...previous,
        merchantName: normalizedMerchantName,
        originalAmount,
        discountAmount,
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

  const importFingerprints = await buildImportFingerprints(file, buffer, transactions);
  const importRecord: ImportRecord = {
    id: createId("import"),
    workspaceId: workspace.id,
    fileName: file.name,
    importedAt: new Date().toISOString(),
    parserId: transactions.length > 0 ? "household-statement-import" : "household-v2-workbook",
    rowCount: transactions.length,
    reviewCount: reviews.length,
    fileFingerprint: importFingerprints.fileFingerprint,
    contentFingerprint: importFingerprints.contentFingerprint,
  };

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
    imports: [importRecord],
    settlements: [],
    incomeEntries: [],
  };
}
