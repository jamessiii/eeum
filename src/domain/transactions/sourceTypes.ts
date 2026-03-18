import type { Transaction } from "../../shared/types/models";

export const SOURCE_TYPE_LABELS: Record<Transaction["sourceType"], string> = {
  manual: "수동입력",
  account: "계좌",
  card: "카드",
  import: "가져오기",
};

export const SOURCE_TYPE_OPTIONS: Transaction["sourceType"][] = ["manual", "account", "card", "import"];

export function getSourceTypeLabel(sourceType: Transaction["sourceType"]) {
  return SOURCE_TYPE_LABELS[sourceType];
}
