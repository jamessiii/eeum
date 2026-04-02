type GuideSampleState = {
  personIds: string[];
  accountIds: string[];
  cardIds: string[];
  transactionIds: string[];
  reviewIds: string[];
  importIds: string[];
  incomeIds: string[];
};

const DEFAULT_GUIDE_SAMPLE_STATE: GuideSampleState = {
  personIds: [],
  accountIds: [],
  cardIds: [],
  transactionIds: [],
  reviewIds: [],
  importIds: [],
  incomeIds: [],
};

function getGuideSampleStateKey(workspaceId: string) {
  return `spending-diary.guide-sample.${workspaceId}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeIdList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readGuideSampleState(workspaceId: string): GuideSampleState {
  if (!canUseStorage()) return DEFAULT_GUIDE_SAMPLE_STATE;

  try {
    const raw = window.localStorage.getItem(getGuideSampleStateKey(workspaceId));
    if (!raw) return DEFAULT_GUIDE_SAMPLE_STATE;
    const parsed = JSON.parse(raw) as Partial<GuideSampleState>;
    return {
      personIds: normalizeIdList(parsed.personIds),
      accountIds: normalizeIdList(parsed.accountIds),
      cardIds: normalizeIdList(parsed.cardIds),
      transactionIds: normalizeIdList(parsed.transactionIds),
      reviewIds: normalizeIdList(parsed.reviewIds),
      importIds: normalizeIdList(parsed.importIds),
      incomeIds: normalizeIdList(parsed.incomeIds),
    };
  } catch {
    return DEFAULT_GUIDE_SAMPLE_STATE;
  }
}

export function writeGuideSampleState(workspaceId: string, nextState: GuideSampleState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(getGuideSampleStateKey(workspaceId), JSON.stringify(nextState));
}

export function clearGuideSampleState(workspaceId: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(getGuideSampleStateKey(workspaceId));
}

export function hasGuideSampleState(state: GuideSampleState) {
  return (
    state.personIds.length > 0 ||
    state.accountIds.length > 0 ||
    state.cardIds.length > 0 ||
    state.transactionIds.length > 0 ||
    state.reviewIds.length > 0 ||
    state.importIds.length > 0 ||
    state.incomeIds.length > 0
  );
}
