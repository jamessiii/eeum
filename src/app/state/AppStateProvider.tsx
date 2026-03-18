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
import { parseHouseholdWorkbook } from "../../domain/imports/householdWorkbook";
import { createHouseholdV2DemoBundle } from "../../dev/seeds/householdV2Seed";
import type { AppState, FinancialProfile, Transaction, WorkspaceBundle } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";

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
  isSharedExpense: boolean;
  isExpenseImpact: boolean;
};

type FinancialProfileInput = Pick<
  FinancialProfile,
  "monthlyNetIncome" | "targetSavingsRate" | "warningSpendRate" | "warningFixedCostRate"
>;

type Action =
  | { type: "hydrate"; payload: AppState }
  | { type: "setActiveWorkspace"; payload: string }
  | { type: "mergeBundle"; payload: WorkspaceBundle }
  | { type: "reset" }
  | { type: "replaceState"; payload: AppState }
  | { type: "resolveReview"; payload: { reviewId: string; status: "resolved" | "dismissed" } }
  | { type: "addPerson"; payload: { workspaceId: string; name: string } }
  | { type: "addAccount"; payload: { workspaceId: string; name: string; institutionName: string } }
  | { type: "addCard"; payload: { workspaceId: string; name: string; issuerName: string } }
  | { type: "addCategory"; payload: { workspaceId: string; name: string } }
  | { type: "addTag"; payload: { workspaceId: string; name: string } }
  | { type: "setFinancialProfile"; payload: { workspaceId: string; values: FinancialProfileInput } }
  | { type: "addTransaction"; payload: NewTransactionInput };

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
            tagIds: [],
            isInternalTransfer: action.payload.transactionType === "transfer" && !action.payload.isExpenseImpact,
            isExpenseImpact: action.payload.isExpenseImpact,
            isSharedExpense: action.payload.isSharedExpense,
            refundOfTransactionId: null,
            status: "active",
          },
        ],
      };
    default:
      return state;
  }
}

interface AppStateContextValue {
  state: AppState;
  isReady: boolean;
  createEmptyWorkspace: (name?: string) => void;
  createDemoWorkspace: () => void;
  importWorkbook: (file: File) => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => void;
  resetApp: () => Promise<void>;
  exportState: () => void;
  importState: (file: File) => Promise<void>;
  resolveReview: (reviewId: string) => void;
  dismissReview: (reviewId: string) => void;
  addPerson: (workspaceId: string, name: string) => void;
  addAccount: (workspaceId: string, name: string, institutionName: string) => void;
  addCard: (workspaceId: string, name: string, issuerName: string) => void;
  addCategory: (workspaceId: string, name: string) => void;
  addTag: (workspaceId: string, name: string) => void;
  setFinancialProfile: (workspaceId: string, values: FinancialProfileInput) => void;
  addTransaction: (input: NewTransactionInput) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, createEmptyState());
  const [isReady, setIsReady] = useState(false);

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
          },
        });
      },
      createDemoWorkspace() {
        dispatch({ type: "mergeBundle", payload: createHouseholdV2DemoBundle() });
      },
      async importWorkbook(file) {
        const bundle = await parseHouseholdWorkbook(file);
        dispatch({ type: "mergeBundle", payload: bundle });
      },
      setActiveWorkspace(workspaceId) {
        dispatch({ type: "setActiveWorkspace", payload: workspaceId });
      },
      async resetApp() {
        await clearAppState();
        dispatch({ type: "reset" });
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
      },
      async importState(file) {
        const text = await file.text();
        const parsed = JSON.parse(text) as { data?: AppState };
        if (!parsed.data) {
          throw new Error("backup-data-missing");
        }
        dispatch({ type: "replaceState", payload: parsed.data });
      },
      resolveReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "resolved" } });
      },
      dismissReview(reviewId) {
        dispatch({ type: "resolveReview", payload: { reviewId, status: "dismissed" } });
      },
      addPerson(workspaceId, name) {
        dispatch({ type: "addPerson", payload: { workspaceId, name } });
      },
      addAccount(workspaceId, name, institutionName) {
        dispatch({ type: "addAccount", payload: { workspaceId, name, institutionName } });
      },
      addCard(workspaceId, name, issuerName) {
        dispatch({ type: "addCard", payload: { workspaceId, name, issuerName } });
      },
      addCategory(workspaceId, name) {
        dispatch({ type: "addCategory", payload: { workspaceId, name } });
      },
      addTag(workspaceId, name) {
        dispatch({ type: "addTag", payload: { workspaceId, name } });
      },
      setFinancialProfile(workspaceId, values) {
        dispatch({ type: "setFinancialProfile", payload: { workspaceId, values } });
      },
      addTransaction(input) {
        dispatch({ type: "addTransaction", payload: input });
      },
    }),
    [isReady, state],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
