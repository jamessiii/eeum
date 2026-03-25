import { createFinancialProfileBase, createStarterCategories, createWorkspaceBase } from "../app/defaults";
import type { Category, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";

export const GUIDE_SAMPLE_FILE_NAME = "가이드 샘플 결제내역.xlsx";
export const GUIDE_SAMPLE_PARSER_ID = "guide-sample-v1";
export const GUIDE_SAMPLE_MEMO = "guide-sample-v1";

function findCategory(categories: Category[], name: string) {
  const category = categories.find((item) => item.categoryType === "category" && item.name === name);
  if (!category) {
    throw new Error(`guide-sample-category-missing:${name}`);
  }
  return category;
}

function createMonthDate(day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0).toISOString();
}

export function createGuideSampleBundle({
  ownerName,
}: {
  ownerName?: string | null;
} = {}): WorkspaceBundle {
  const workspace = createWorkspaceBase("가이드 샘플", "imported");
  const financialProfile = createFinancialProfileBase(workspace.id);
  const categories = createStarterCategories(workspace.id);

  const subscriptionCategory = findCategory(categories, "구독료");
  const foodCategory = findCategory(categories, "식비");

  const ownerLabel = ownerName?.trim() || "가이드 사용자";
  const person = {
    id: createId("person"),
    workspaceId: workspace.id,
    name: ownerLabel,
    displayName: ownerLabel,
    role: "member" as const,
    memo: GUIDE_SAMPLE_MEMO,
    isActive: true,
    sortOrder: 0,
    isHidden: false,
  };

  const account = {
    id: createId("account"),
    workspaceId: workspace.id,
    ownerPersonId: person.id,
    name: "가이드 연결계좌",
    alias: "",
    institutionName: "가이드뱅크",
    accountNumberMasked: "1234",
    accountType: "checking" as const,
    usageType: "card_payment" as const,
    isShared: false,
    memo: GUIDE_SAMPLE_MEMO,
    sortOrder: 0,
    isHidden: false,
  };

  const card = {
    id: createId("card"),
    workspaceId: workspace.id,
    ownerPersonId: person.id,
    name: "가이드 샘플카드",
    issuerName: "가이드카드",
    cardNumberMasked: "5678",
    linkedAccountId: account.id,
    cardType: "credit" as const,
    memo: GUIDE_SAMPLE_MEMO,
    sortOrder: 0,
    isHidden: false,
  };

  const transactions: Transaction[] = [
    {
      id: createId("tx"),
      workspaceId: workspace.id,
      occurredAt: createMonthDate(3),
      settledAt: createMonthDate(3),
      transactionType: "expense",
      sourceType: "card",
      ownerPersonId: person.id,
      cardId: card.id,
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      merchantName: "넷플릭스",
      description: "가이드 샘플 - 구독 결제",
      amount: 17_000,
      originalAmount: 17_000,
      discountAmount: 0,
      categoryId: null,
      tagIds: [],
      isInternalTransfer: false,
      isExpenseImpact: true,
      isSharedExpense: false,
      refundOfTransactionId: null,
      status: "active",
    },
    {
      id: createId("tx"),
      workspaceId: workspace.id,
      occurredAt: createMonthDate(7),
      settledAt: createMonthDate(7),
      transactionType: "expense",
      sourceType: "card",
      ownerPersonId: person.id,
      cardId: card.id,
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      merchantName: "네이버페이",
      description: "가이드 샘플 - 미분류 결제",
      amount: 23_500,
      originalAmount: 23_500,
      discountAmount: 0,
      categoryId: null,
      tagIds: [],
      isInternalTransfer: false,
      isExpenseImpact: true,
      isSharedExpense: false,
      refundOfTransactionId: null,
      status: "active",
    },
    {
      id: createId("tx"),
      workspaceId: workspace.id,
      occurredAt: createMonthDate(10),
      settledAt: createMonthDate(10),
      transactionType: "expense",
      sourceType: "card",
      ownerPersonId: person.id,
      cardId: card.id,
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      merchantName: "김밥천국",
      description: "가이드 샘플 - 이미 분류된 결제",
      amount: 9_500,
      originalAmount: 9_500,
      discountAmount: 0,
      categoryId: foodCategory.id,
      tagIds: [],
      isInternalTransfer: false,
      isExpenseImpact: true,
      isSharedExpense: false,
      refundOfTransactionId: null,
      status: "active",
    },
  ];

  const reviews: ReviewItem[] = [
    {
      id: createId("review"),
      workspaceId: workspace.id,
      reviewType: "category_suggestion",
      status: "open",
      primaryTransactionId: transactions[0]!.id,
      relatedTransactionIds: [],
      confidenceScore: 0.96,
      summary: "반복되는 구독 결제로 보여요.",
      suggestedCategoryId: subscriptionCategory.id,
    },
    {
      id: createId("review"),
      workspaceId: workspace.id,
      reviewType: "uncategorized_transaction",
      status: "open",
      primaryTransactionId: transactions[1]!.id,
      relatedTransactionIds: [],
      confidenceScore: 0.72,
      summary: "카테고리가 비어 있어 확인이 필요해요.",
      suggestedCategoryId: null,
    },
  ];

  return {
    workspace,
    financialProfile,
    people: [person],
    accounts: [account],
    cards: [card],
    categories,
    tags: [],
    transactions,
    reviews,
    imports: [
      {
        id: createId("import"),
        workspaceId: workspace.id,
        fileName: GUIDE_SAMPLE_FILE_NAME,
        importedAt: new Date().toISOString(),
        parserId: GUIDE_SAMPLE_PARSER_ID,
        rowCount: transactions.length,
        reviewCount: reviews.length,
      },
    ],
    settlements: [],
  };
}
