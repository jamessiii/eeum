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
}

export interface Person {
  id: ID;
  workspaceId: ID;
  name: string;
  displayName: string;
  role: "owner" | "member";
  memo: string;
  isActive: boolean;
}

export interface Account {
  id: ID;
  workspaceId: ID;
  ownerPersonId: ID | null;
  name: string;
  alias: string;
  institutionName: string;
  accountNumberMasked: string;
  accountType: "checking" | "savings" | "loan" | "cash" | "other";
  usageType: "daily" | "salary" | "shared" | "card_payment" | "savings" | "investment" | "loan" | "other";
  isShared: boolean;
  memo: string;
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
}

export interface Category {
  id: ID;
  workspaceId: ID;
  name: string;
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
  categoryId: ID | null;
  tagIds: ID[];
  isInternalTransfer: boolean;
  isExpenseImpact: boolean;
  isSharedExpense: boolean;
  refundOfTransactionId: ID | null;
  status: "active" | "refunded" | "cancelled";
}

export interface ReviewItem {
  id: ID;
  workspaceId: ID;
  reviewType:
    | "duplicate_candidate"
    | "refund_candidate"
    | "uncategorized_transaction"
    | "internal_transfer_candidate"
    | "shared_expense_candidate";
  status: "open" | "resolved" | "dismissed";
  primaryTransactionId: ID;
  relatedTransactionIds: ID[];
  confidenceScore: number;
  summary: string;
}

export interface ImportRecord {
  id: ID;
  workspaceId: ID;
  fileName: string;
  importedAt: string;
  parserId: string;
  rowCount: number;
  reviewCount: number;
}

export interface SettlementRecord {
  id: ID;
  workspaceId: ID;
  month: string;
  fromPersonId: ID | null;
  toPersonId: ID | null;
  amount: number;
  note: string;
  completedAt: string;
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
}
