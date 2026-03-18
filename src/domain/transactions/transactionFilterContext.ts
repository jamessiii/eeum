import { getSourceTypeLabel, SOURCE_TYPE_OPTIONS } from "./sourceTypes";
import type { Person, Transaction } from "../../shared/types/models";

interface TransactionFilterContextInput {
  ownerPersonId: string;
  sourceType: "all" | Transaction["sourceType"];
  people: Person[];
}

export function getTransactionFilterContext(input: TransactionFilterContextInput) {
  const activeOwnerName =
    input.ownerPersonId !== "all" ? input.people.find((person) => person.id === input.ownerPersonId)?.name ?? null : null;

  const activeSourceTypeLabel =
    input.sourceType !== "all" && SOURCE_TYPE_OPTIONS.includes(input.sourceType)
      ? getSourceTypeLabel(input.sourceType)
      : null;

  return {
    activeOwnerName,
    activeSourceTypeLabel,
  };
}
