export type ID = string;

export interface Workspace {
  id: ID;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: "empty" | "demo" | "imported";
}

export interface FinancialProfile {
  id: ID;
  workspaceId: ID;
  monthlyNetIncome: number;
  targetSavingsRate: number;
  warningSpendRate: number;
  warningFixedCostRate: number;
  loopPriorityCategoryIds?: ID[];
}

export interface Person {
  id: ID;
  workspaceId: ID;
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
  sortOrder?: number;
  isHidden?: boolean;
}

export interface Account {
  id: ID;
  workspaceId: ID;
  ownerPersonId: ID | null;
  primaryPersonId?: ID | null;
  participantPersonIds?: ID[];
  accountGroupType?: "personal" | "meeting";
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  accountType: "checking" | "savings" | "loan" | "cash" | "other";
  usageType: "daily" | "salary" | "shared" | "card_payment" | "savings" | "investment" | "loan" | "other";
  isShared: boolean;
  memo: string;
  createdImportRecordId?: ID | null;
  sortOrder?: number;
  isHidden?: boolean;
}

export interface Card {
  id: ID;
  workspaceId: ID;
  ownerPersonId: ID | null;
  name: string;
  issuerName: string;
  cardNumberMasked: string;
  linkedAccountId: ID | null;
  cardType: "credit" | "check" | "debit" | "prepaid" | "other";
  memo: string;
  createdImportRecordId?: ID | null;
  sortOrder?: number;
  isHidden?: boolean;
}

export interface Category {
  id: ID;
  workspaceId: ID;
  name: string;
  categoryType: "group" | "category";
  parentCategoryId: ID | null;
  linkedAccountId?: ID | null;
  sortOrder: number;
  isHidden: boolean;
  direction: "expense" | "income" | "transfer" | "mixed";
  fixedOrVariable: "fixed" | "variable";
  necessity: "essential" | "discretionary";
  budgetable: boolean;
  reportable: boolean;
}

export interface Tag {
  id: ID;
  workspaceId: ID;
  name: string;
  color: string;
}

export interface Transaction {
  id: ID;
  workspaceId: ID;
  importRecordId?: ID | null;
  occurredAt: string;
  settledAt: string | null;
  transactionType: "expense" | "income" | "transfer" | "adjustment";
  sourceType: "card" | "account" | "manual" | "import";
  ownerPersonId: ID | null;
  cardId: ID | null;
  accountId: ID | null;
  fromAccountId: ID | null;
  toAccountId: ID | null;
  merchantName: string;
  description: string;
  amount: number;
  originalAmount?: number;
  discountAmount?: number;
  categoryId: ID | null;
  tagIds: ID[];
  isInternalTransfer: boolean;
  isExpenseImpact: boolean;
  isSharedExpense: boolean;
  isLoop?: boolean;
  isLoopIgnored?: boolean;
  loopGroupOverrideKey?: string | null;
  loopDisplayName?: string | null;
  refundOfTransactionId: ID | null;
  status: "active" | "refunded" | "cancelled";
}

export interface ReviewItem {
  id: ID;
  workspaceId: ID;
  importRecordId?: ID | null;
  reviewType:
    | "duplicate_candidate"
    | "refund_candidate"
    | "category_suggestion"
    | "uncategorized_transaction"
    | "internal_transfer_candidate"
    | "shared_expense_candidate";
  status: "open" | "resolved" | "dismissed";
  primaryTransactionId: ID;
  relatedTransactionIds: ID[];
  confidenceScore: number;
  summary: string;
  suggestedCategoryId?: ID | null;
}

export interface ImportRecord {
  id: ID;
  workspaceId: ID;
  fileName: string;
  statementMonth?: string | null;
  fileFingerprint?: string | null;
  contentFingerprint?: string | null;
  importedAt: string;
  parserId: string;
  rowCount: number;
  reviewCount: number;
}

export interface SettlementRecord {
  id: ID;
  workspaceId: ID;
  month: string;
  transferKey: string;
  fromAccountId: ID | null;
  toAccountId: ID | null;
  amount: number;
  note: string;
  completedAt: string;
}

export interface IncomeEntry {
  id: ID;
  workspaceId: ID;
  ownerPersonId: ID | null;
  occurredAt: string;
  sourceName: string;
  amount: number;
  createdAt: string;
}

export interface WorkspaceBundle {
  workspace: Workspace;
  financialProfile: FinancialProfile;
  people: Person[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  reviews: ReviewItem[];
  imports: ImportRecord[];
  settlements: SettlementRecord[];
  incomeEntries: IncomeEntry[];
}

export interface AppState {
  schemaVersion: number;
  activeWorkspaceId: ID | null;
  workspaces: Workspace[];
  financialProfiles: FinancialProfile[];
  people: Person[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  reviews: ReviewItem[];
  imports: ImportRecord[];
  settlements: SettlementRecord[];
  incomeEntries: IncomeEntry[];
}
