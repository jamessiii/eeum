import { createContext, useContext, useEffect, useMemo, useReducer, useState, type PropsWithChildren } from "react";
import { clearAppState, loadAppState, saveAppState } from "../../data/db/appDb";
import {
  createEmptyState,
  createFinancialProfileBase,
  createStarterCategories,
  createStarterTags,
  createWorkspaceBase,
  mergeWorkspaceBundle,
} from "../../domain/app/defaults";
import type { AppState, FinancialProfile, ReviewItem, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";
import { useToast } from "../toast/ToastProvider";

type NewTransactionInput = {
  workspaceId: string;
  occurredAt: string;
  settledAt: string;
  transactionType: Transaction["transactionType"];
  sourceType: Transaction["sourceType"];
  ownerPersonId: string | null;
  cardId: string | null;
  accountId: string | null;
  merchantName: string;
  description: string;
  amount: number;
  categoryId: string | null;
  tagIds: string[];
  isSharedExpense: boolean;
  isExpenseImpact: boolean;
};

type FinancialProfileInput = Pick<
  FinancialProfile,
  "monthlyNetIncome" | "targetSavingsRate" | "warningSpendRate" | "warningFixedCostRate"
>;

type SettlementInput = {
  workspaceId: string;
  month: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  amount: number;
  note: string;
};

type Action =
  | { type: "hydrate"; payload: AppState }
  | { type: "setActiveWorkspace"; payload: string }
  | { type: "mergeBundle"; payload: WorkspaceBundle }
  | { type: "reset" }
  | { type: "replaceState"; payload: AppState }
  | { type: "resolveReview"; payload: { reviewId: string; status: "resolved" | "dismissed" } }
  | { type: "applyReviewSuggestion"; payload: { reviewId: string } }
  | { type: "addPerson"; payload: { workspaceId: string; name: string } }
  | { type: "addAccount"; payload: { workspaceId: string; name: string; institutionName: string } }
  | { type: "addCard"; payload: { workspaceId: string; name: string; issuerName: string } }
  | { type: "addCategory"; payload: { workspaceId: string; name: string } }
  | { type: "addTag"; payload: { workspaceId: string; name: string } }
  | { type: "setFinancialProfile"; payload: { workspaceId: string; values: FinancialProfileInput } }
  | { type: "addSettlement"; payload: SettlementInput }
  | { type: "addTransaction"; payload: NewTransactionInput }
  | { type: "assignCategory"; payload: { workspaceId: string; transactionId: string; categoryId: string } }
  | { type: "assignCategoryByMerchant"; payload: { workspaceId: string; merchantName: string; categoryId: string } }
  | { type: "assignCategoryBatch"; payload: { workspaceId: string; transactionIds: string[]; categoryId: string } }
  | { type: "assignTag"; payload: { workspaceId: string; transactionId: string; tagId: string } }
  | { type: "assignTagBatch"; payload: { workspaceId: string; transactionIds: string[]; tagId: string } }
  | { type: "assignTagByMerchant"; payload: { workspaceId: string; merchantName: string; tagId: string } };

function applyReviewSuggestionToTransactions(transactions: Transaction[], review: ReviewItem) {
  const relatedTransactionId = review.relatedTransactionIds[0] ?? null;

  return transactions.map((transaction) => {
    if (transaction.id !== review.primaryTransactionId) {
      return transaction;
    }

    switch (review.reviewType) {
      case "duplicate_candidate":
        return {
          ...transaction,
          status: "cancelled" as const,
          isExpenseImpact: false,
        };
      case "refund_candidate":
        return {
          ...transaction,
          transactionType: "income" as const,
          amount: Math.abs(transaction.amount),
          isExpenseImpact: false,
          refundOfTransactionId: relatedTransactionId,
        };
      case "internal_transfer_candidate":
        return {
          ...transaction,
          transactionType: "transfer" as const,
          isInternalTransfer: true,
          isExpenseImpact: false,
          categoryId: null,
        };
      case "shared_expense_candidate":
        return {
          ...transaction,
          isSharedExpense: true,
        };
      default:
        return transaction;
    }
  });
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "setActiveWorkspace":
      return { ...state, activeWorkspaceId: action.payload };
    case "mergeBundle":
      return mergeWorkspaceBundle(state, action.payload);
    case "reset":
      return createEmptyState();
    case "replaceState":
      return action.payload;
    case "resolveReview":
      return {
        ...state,
        reviews: state.reviews.map((review) =>
          review.id === action.payload.reviewId ? { ...review, status: action.payload.status } : review,
        ),
      };
    case "applyReviewSuggestion": {
      const review = state.reviews.find((item) => item.id === action.payload.reviewId);
      if (!review) return state;

      return {
        ...state,
        transactions: applyReviewSuggestionToTransactions(state.transactions, review),
        reviews: state.reviews.map((item) =>
          item.id === action.payload.reviewId ? { ...item, status: "resolved" } : item,
        ),
      };
    }
    case "addPerson":
      return {
        ...state,
        people: [
          ...state.people,
          { id: createId("person"), workspaceId: action.payload.workspaceId, name: action.payload.name, role: "member" },
        ],
      };
    case "addAccount":
      return {
        ...state,
        accounts: [
          ...state.accounts,
          {
            id: createId("account"),
            workspaceId: action.payload.workspaceId,
            ownerPersonId: null,
            name: action.payload.name,
            institutionName: action.payload.institutionName,
            accountNumberMasked: "",
            accountType: "checking",
            isShared: false,
          },
        ],
      };
    case "addCard":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            id: createId("card"),
            workspaceId: action.payload.workspaceId,
            ownerPersonId: null,
            name: action.payload.name,
            issuerName: action.payload.issuerName,
            cardNumberMasked: "",
            linkedAccountId: null,
          },
        ],
      };
    case "addCategory":
      return {
        ...state,
        categories: [
          ...state.categories,
          {
            id: createId("category"),
            workspaceId: action.payload.workspaceId,
            name: action.payload.name,
            direction: "expense",
            fixedOrVariable: "variable",
            necessity: "discretionary",
            budgetable: true,
            reportable: true,
          },
        ],
      };
    case "addTag":
      return {
        ...state,
        tags: [
          ...state.tags,
          {
            id: createId("tag"),
            workspaceId: action.payload.workspaceId,
            name: action.payload.name,
            color: "#6f42c1",
          },
        ],
      };
    case "setFinancialProfile":
      return {
        ...state,
        financialProfiles: state.financialProfiles.map((profile) =>
          profile.workspaceId === action.payload.workspaceId ? { ...profile, ...action.payload.values } : profile,
        ),
      };
    case "addSettlement":
      return {
        ...state,
        settlements: [
          ...state.settlements,
          {
            id: createId("settlement"),
            workspaceId: action.payload.workspaceId,
            month: action.payload.month,
            fromPersonId: action.payload.fromPersonId,
            toPersonId: action.payload.toPersonId,
            amount: Math.abs(action.payload.amount),
            note: action.payload.note,
            completedAt: new Date().toISOString(),
          },
        ],
      };
    case "addTransaction":
      return {
        ...state,
        transactions: [
          ...state.transactions,
          {
            id: createId("tx"),
            workspaceId: action.payload.workspaceId,
            occurredAt: new Date(action.payload.occurredAt).toISOString(),
            settledAt: action.payload.settledAt ? new Date(action.payload.settledAt).toISOString() : null,
            transactionType: action.payload.transactionType,
            sourceType: action.payload.sourceType,
            ownerPersonId: action.payload.ownerPersonId,
            cardId: action.payload.cardId,
            accountId: action.payload.accountId,
            fromAccountId: action.payload.transactionType === "transfer" ? action.payload.accountId : null,
            toAccountId: null,
            merchantName: action.payload.merchantName,
            description: action.payload.description,
            amount: Math.abs(action.payload.amount),
            categoryId: action.payload.categoryId,
            tagIds: action.payload.tagIds,
            isInternalTransfer: action.payload.transactionType === "transfer" && !action.payload.isExpenseImpact,
            isExpenseImpact: action.payload.isExpenseImpact,
            isSharedExpense: action.payload.isSharedExpense,
            refundOfTransactionId: null,
            status: "active",
          },
        ],
      };
    case "assignCategory":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? { ...transaction, categoryId: action.payload.categoryId }
            : transaction,
        ),
      };
    case "assignCategoryByMerchant":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.merchantName === action.payload.merchantName &&
          transaction.isExpenseImpact
             ? { ...transaction, categoryId: action.payload.categoryId }
             : transaction,
        ),
      };
    case "assignCategoryBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? { ...transaction, categoryId: action.payload.categoryId }
            : transaction,
        ),
      };
    }
    case "assignTag":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transaction.id === action.payload.transactionId
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    case "assignTagBatch": {
      const transactionIdSet = new Set(action.payload.transactionIds);
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId && transactionIdSet.has(transaction.id)
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    }
    case "assignTagByMerchant":
      return {
        ...state,
        transactions: state.transactions.map((transaction) =>
          transaction.workspaceId === action.payload.workspaceId &&
          transaction.merchantName === action.payload.merchantName &&
          transaction.isExpenseImpact
            ? {
                ...transaction,
                tagIds: transaction.tagIds.includes(action.payload.tagId)
                  ? transaction.tagIds
                  : [...transaction.tagIds, action.payload.tagId],
              }
            : transaction,
        ),
      };
    default:
      return state;
  }
}

interface AppStateContextValue {
  state: AppState;
  isReady: boolean;
  createEmptyWorkspace: (name?: string) => void;
  createDemoWorkspace: () => Promise<void>;
  previewWorkbookImport: (file: File) => Promise<WorkspaceBundle>;
  commitImportedBundle: (bundle: WorkspaceBundle, fileName: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  resetApp: () => Promise<void>;
  exportState: () => void;
  importState: (file: File) => Promise<void>;
  resolveReview: (reviewId: string) => void;
  dismissReview: (reviewId: string) => void;
  applyReviewSuggestion: (reviewId: string) => void;
  addPerson: (workspaceId: string, name: string) => void;
  addAccount: (workspaceId: string, name: string, institutionName: string) => void;
  addCard: (workspaceId: string, name: string, issuerName: string) => void;
  addCategory: (workspaceId: string, name: string) => void;
  addTag: (workspaceId: string, name: string) => void;
  setFinancialProfile: (workspaceId: string, values: FinancialProfileInput) => void;
  addSettlement: (input: SettlementInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
  assignCategory: (workspaceId: string, transactionId: string, categoryId: string) => void;
  assignCategoryByMerchant: (workspaceId: string, merchantName: string, categoryId: string) => void;
  assignCategoryBatch: (workspaceId: string, transactionIds: string[], categoryId: string) => void;
  assignTag: (workspaceId: string, transactionId: string, tagId: string) => void;
  assignTagBatch: (workspaceId: string, transactionIds: string[], tagId: string) => void;
  assignTagByMerchant: (workspaceId: string, merchantName: string, tagId: string) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, createEmptyState());
  const [isReady, setIsReady] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    void loadAppState(createEmptyState()).then((stored) => {
      dispatch({ type: "hydrate", payload: stored });
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    void saveAppState(state);
  }, [isReady, state]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      isReady,
      createEmptyWorkspace(name = "새 가계부") {
        const workspace = createWorkspaceBase(name, "empty");
        dispatch({
          type: "mergeBundle",
          payload: {
            workspace,
            financialProfile: createFinancialProfileBase(workspace.id),
            people: [],
            accounts: [],
            cards: [],
            categories: createStarterCategories(workspace.id),
            tags: createStarterTags(workspace.id),
            transactions: [],
            reviews: [],
            imports: [],
            settlements: [],
          },
        });
        showToast(`"${name}" 워크스페이스를 만들었습니다.`, "success");
      },
      async createDemoWorkspace() {
        const { createHouseholdV2DemoBundle } = await import("../../dev/seeds/householdV2Seed");
        dispatch({ type: "mergeBundle", payload: createHouseholdV2DemoBundle() });
        showToast("테스트 워크스페이스를 불러왔습니다.", "success");
      },
      async previewWorkbookImport(file) {
        const { parseHouseholdWorkbook } = await import("../../domain/imports/householdWorkbook");
        const bundle = await parseHouseholdWorkbook(file);
        showToast(`${file.name} 미리보기를 준비했습니다.`, "info");
        return bundle;
      },
      commitImportedBundle(bundle, fileName) {
        dispatch({ type: "mergeBundle", payload: bundle });
        showToast(`${fileName} 업로드를 완료했습니다.`, "success");
      },
      setActiveWorkspace(workspaceId) {
        dispatch({ type: "setActiveWorkspace", payload: workspaceId });
        const workspace = state.workspaces.find((item) => item.id === workspaceId);
        if (workspace) {
          showToast(`${workspace.name}로 전환했습니다.`, "info");
        }
      },
      async resetApp() {
        await clearAppState();
        dispatch({ type: "reset" });
        showToast("로컬 데이터를 초기화했습니다.", "success");
      },
      exportState() {
        const blob = new Blob(
          [
            JSON.stringify(
              {
                appVersion: "0.1.0",
                schemaVersion: state.schemaVersion,
                exportedAt: new Date().toISOString(),
                data: state,
              },
              null,
              2,
            ),
          ],
          { type: "application/json;charset=utf-8" },
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `household-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("백업 파일을 다운로드했습니다.", "success");
      },
      async importState(file) {
        const text = await file.text();
        const parsed = JSON.parse(text) as { data?: AppState };
        if (!parsed.data) {
          showToast("백업 파일 형식을 확인해주세요.", "error");
          throw new Error("backup-data-missing");
        }
        dispatch({ type: "replaceState", payload: parsed.data });
        showToast(`${file.name} 백업을 불러왔습니다.`, "success");
      },
      resolveReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "resolved" } });
        showToast("검토 항목을 확인 완료로 처리했습니다.", "success");
      },
      dismissReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "dismissed" } });
        showToast("검토 항목을 나중에 보기로 넘겼습니다.", "info");
      },
      applyReviewSuggestion(reviewId) {
        dispatch({ type: "applyReviewSuggestion", payload: { reviewId } });
        showToast("검토 제안을 거래 데이터에 반영했습니다.", "success");
      },
      addPerson(workspaceId, name) {
        dispatch({ type: "addPerson", payload: { workspaceId, name } });
        showToast(`${name} 구성원을 추가했습니다.`, "success");
      },
      addAccount(workspaceId, name, institutionName) {
        dispatch({ type: "addAccount", payload: { workspaceId, name, institutionName } });
        showToast(`${name} 계좌를 추가했습니다.`, "success");
      },
      addCard(workspaceId, name, issuerName) {
        dispatch({ type: "addCard", payload: { workspaceId, name, issuerName } });
        showToast(`${name} 카드를 추가했습니다.`, "success");
      },
      addCategory(workspaceId, name) {
        dispatch({ type: "addCategory", payload: { workspaceId, name } });
        showToast(`${name} 카테고리를 추가했습니다.`, "success");
      },
      addTag(workspaceId, name) {
        dispatch({ type: "addTag", payload: { workspaceId, name } });
        showToast(`${name} 태그를 추가했습니다.`, "success");
      },
      setFinancialProfile(workspaceId, values) {
        dispatch({ type: "setFinancialProfile", payload: { workspaceId, values } });
        showToast("재무 기준선을 저장했습니다.", "success");
      },
      addSettlement(input) {
        dispatch({ type: "addSettlement", payload: input });
        showToast("정산 완료 내역을 기록했습니다.", "success");
      },
      addTransaction(input) {
        dispatch({ type: "addTransaction", payload: input });
        showToast(`${input.merchantName} 거래를 추가했습니다.`, "success");
      },
      assignCategory(workspaceId, transactionId, categoryId) {
        dispatch({ type: "assignCategory", payload: { workspaceId, transactionId, categoryId } });
        showToast("거래 카테고리를 지정했습니다.", "success");
      },
      assignCategoryByMerchant(workspaceId, merchantName, categoryId) {
        dispatch({ type: "assignCategoryByMerchant", payload: { workspaceId, merchantName, categoryId } });
        showToast(`${merchantName} 반복 거래에 카테고리를 반영했습니다.`, "success");
      },
      assignCategoryBatch(workspaceId, transactionIds, categoryId) {
        dispatch({ type: "assignCategoryBatch", payload: { workspaceId, transactionIds, categoryId } });
        const category = state.categories.find((item) => item.id === categoryId);
        showToast(`${transactionIds.length}건 거래에 ${category?.name ?? "카테고리"}를 일괄 반영했습니다.`, "success");
      },
      assignTag(workspaceId, transactionId, tagId) {
        dispatch({ type: "assignTag", payload: { workspaceId, transactionId, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${tag?.name ?? "태그"} 태그를 거래에 추가했습니다.`, "success");
      },
      assignTagBatch(workspaceId, transactionIds, tagId) {
        dispatch({ type: "assignTagBatch", payload: { workspaceId, transactionIds, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${transactionIds.length}건 거래에 ${tag?.name ?? "태그"}를 일괄 반영했습니다.`, "success");
      },
      assignTagByMerchant(workspaceId, merchantName, tagId) {
        dispatch({ type: "assignTagByMerchant", payload: { workspaceId, merchantName, tagId } });
        const tag = state.tags.find((item) => item.id === tagId);
        showToast(`${merchantName} 반복 거래에 ${tag?.name ?? "태그"}를 반영했습니다.`, "success");
      },
    }),
    [isReady, showToast, state],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
