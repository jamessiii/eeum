export const GUIDE_V1_RESET_EVENT = "household-webapp:guide-v1-reset";

export type GuideFlowMode = "prompt" | "active" | "tips";

type GuideRuntimeSnapshot = {
  flowMode: GuideFlowMode;
  visitedStepIds: string[];
  dismissedTipIds: string[];
};

type GuideRuntimeState = {
  flowMode: GuideFlowMode;
  replayStepIndex: number | null;
  visitedStepIds: string[];
  dismissedTipIds: string[];
  replaySnapshot: GuideRuntimeSnapshot | null;
};

const DEFAULT_GUIDE_RUNTIME_STATE: GuideRuntimeState = {
  flowMode: "prompt",
  replayStepIndex: null,
  visitedStepIds: [],
  dismissedTipIds: [],
  replaySnapshot: null,
};

function getGuideRuntimeKey(workspaceId: string) {
  return `household-webapp.guide-v1.${workspaceId}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function isGuideFlowMode(value: unknown): value is GuideFlowMode {
  return value === "prompt" || value === "active" || value === "tips";
}

export function readGuideRuntime(workspaceId: string): GuideRuntimeState {
  if (!canUseStorage()) return DEFAULT_GUIDE_RUNTIME_STATE;

  try {
    const raw = window.localStorage.getItem(getGuideRuntimeKey(workspaceId));
    if (!raw) return DEFAULT_GUIDE_RUNTIME_STATE;
    const parsed = JSON.parse(raw) as Partial<GuideRuntimeState>;

    return {
      flowMode: isGuideFlowMode(parsed.flowMode) ? parsed.flowMode : DEFAULT_GUIDE_RUNTIME_STATE.flowMode,
      replayStepIndex: typeof parsed.replayStepIndex === "number" ? parsed.replayStepIndex : null,
      visitedStepIds: Array.isArray(parsed.visitedStepIds) ? parsed.visitedStepIds.filter((value): value is string => typeof value === "string") : [],
      dismissedTipIds: Array.isArray(parsed.dismissedTipIds)
        ? parsed.dismissedTipIds.filter((value): value is string => typeof value === "string")
        : [],
      replaySnapshot:
        parsed.replaySnapshot &&
        isGuideFlowMode(parsed.replaySnapshot.flowMode) &&
        Array.isArray(parsed.replaySnapshot.visitedStepIds) &&
        Array.isArray(parsed.replaySnapshot.dismissedTipIds)
          ? {
              flowMode: parsed.replaySnapshot.flowMode,
              visitedStepIds: parsed.replaySnapshot.visitedStepIds.filter((value): value is string => typeof value === "string"),
              dismissedTipIds: parsed.replaySnapshot.dismissedTipIds.filter((value): value is string => typeof value === "string"),
            }
          : null,
    };
  } catch {
    return DEFAULT_GUIDE_RUNTIME_STATE;
  }
}

function writeGuideRuntime(workspaceId: string, nextState: GuideRuntimeState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(getGuideRuntimeKey(workspaceId), JSON.stringify(nextState));
}

export function startGuideFlow(workspaceId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.flowMode === "active") {
    dispatchGuideReset(workspaceId);
    return;
  }

  writeGuideRuntime(workspaceId, {
    ...current,
    flowMode: "active",
  });
  dispatchGuideReset(workspaceId);
}

export function snoozeGuideFlow(workspaceId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.flowMode === "tips") return;

  writeGuideRuntime(workspaceId, {
    ...current,
    flowMode: "tips",
  });
}

export function startGuideReplay(workspaceId: string) {
  const current = readGuideRuntime(workspaceId);
  const nextState: GuideRuntimeState = {
    flowMode: current.flowMode,
    replayStepIndex: 0,
    visitedStepIds: [],
    dismissedTipIds: [],
    replaySnapshot: {
      flowMode: current.replaySnapshot?.flowMode ?? current.flowMode,
      visitedStepIds: current.replaySnapshot?.visitedStepIds ?? current.visitedStepIds,
      dismissedTipIds: current.replaySnapshot?.dismissedTipIds ?? current.dismissedTipIds,
    },
  };
  if (
    current.flowMode === nextState.flowMode &&
    current.replayStepIndex === nextState.replayStepIndex &&
    current.visitedStepIds.length === 0 &&
    current.dismissedTipIds.length === 0
  ) {
    dispatchGuideReset(workspaceId);
    return;
  }
  writeGuideRuntime(workspaceId, nextState);
  dispatchGuideReset(workspaceId);
}

export function finishGuideReplay(workspaceId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.replayStepIndex === null) return;
  writeGuideRuntime(workspaceId, {
    flowMode: current.replaySnapshot?.flowMode ?? current.flowMode,
    replayStepIndex: null,
    visitedStepIds: current.replaySnapshot?.visitedStepIds ?? current.visitedStepIds,
    dismissedTipIds: current.replaySnapshot?.dismissedTipIds ?? current.dismissedTipIds,
    replaySnapshot: null,
  });
}

export function advanceGuideReplay(workspaceId: string, totalStepCount: number) {
  const current = readGuideRuntime(workspaceId);
  if (current.replayStepIndex === null) return;

  const nextIndex = current.replayStepIndex + 1;
  writeGuideRuntime(workspaceId, {
    ...current,
    replayStepIndex: nextIndex >= totalStepCount ? null : nextIndex,
  });
}

export function rewindGuideReplay(workspaceId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.replayStepIndex === null) return;

  writeGuideRuntime(workspaceId, {
    ...current,
    replayStepIndex: Math.max(0, current.replayStepIndex - 1),
  });
}

export function markGuideStepVisited(workspaceId: string, stepId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.visitedStepIds.includes(stepId)) return;
  writeGuideRuntime(workspaceId, {
    ...current,
    visitedStepIds: [...current.visitedStepIds, stepId],
  });
}

export function dismissGuideTip(workspaceId: string, tipId: string) {
  const current = readGuideRuntime(workspaceId);
  if (current.dismissedTipIds.includes(tipId)) return;
  writeGuideRuntime(workspaceId, {
    ...current,
    dismissedTipIds: [...current.dismissedTipIds, tipId],
  });
}

export function dispatchGuideReset(workspaceId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GUIDE_V1_RESET_EVENT, {
      detail: { workspaceId },
    }),
  );
}
