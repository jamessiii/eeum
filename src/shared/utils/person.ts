import type { Person } from "../types/models";

export function getPersonDisplayLabel(person: Person): string {
  const displayName = person.displayName?.trim();
  if (displayName) return displayName;

  const name = person.name?.trim();
  if (name) return name;

  const linkedUserDisplayName = person.linkedUserDisplayName?.trim();
  if (linkedUserDisplayName) return linkedUserDisplayName;

  return person.id;
}
