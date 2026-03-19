import type { ReviewItem, Transaction } from "../../shared/types/models";
import type { ReviewType } from "./meta";
import type { SOURCE_TYPE_OPTIONS } from "../transactions/sourceTypes";

type ReviewFilterInput = {
  reviews: ReviewItem[];
  transactionMap: Map<string, Transaction>;
  activeFilter: "all" | ReviewType;
  activeTagId: string;
  activeSourceType: "all" | (typeof SOURCE_TYPE_OPTIONS)[number];
};

export function getFilteredReviews({
  reviews,
  transactionMap,
  activeFilter,
  activeTagId,
  activeSourceType,
}: ReviewFilterInput) {
  return reviews
    .filter((item) => (activeFilter === "all" ? true : item.reviewType === activeFilter))
    .filter((item) => {
      if (activeSourceType === "all") return true;
      const primaryTransaction = transactionMap.get(item.primaryTransactionId);
      return primaryTransaction?.sourceType === activeSourceType;
    })
    .filter((item) => {
      if (activeTagId === "all") return true;
      const relatedTagIds = [item.primaryTransactionId, ...item.relatedTransactionIds]
        .map((id) => transactionMap.get(id))
        .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
        .flatMap((transaction) => transaction.tagIds);
      return relatedTagIds.includes(activeTagId);
    });
}
