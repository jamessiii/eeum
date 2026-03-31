import type { Transaction } from "../../shared/types/models";
import { getLoopGroupKey, getLoopGroupTransactions, normalizeLoopText } from "./loopMatcher";

export type LoopCandidateGroup = {
  key: string;
  merchantName: string;
  transactionIds: string[];
  transactions: Transaction[];
};

export function getLoopCandidateGroup(target: Transaction, transactions: Transaction[]) {
  const merchantKey = normalizeLoopText(target.merchantName);
  if (!merchantKey) {
    return {
      key: target.id,
      merchantName: target.merchantName,
      transactionIds: [target.id],
      transactions: [target],
    } satisfies LoopCandidateGroup;
  }

  const candidates = getLoopGroupTransactions(target, transactions);

  return {
    key: getLoopGroupKey(target),
    merchantName: target.merchantName,
    transactionIds: candidates.map((transaction) => transaction.id),
    transactions: candidates,
  } satisfies LoopCandidateGroup;
}
