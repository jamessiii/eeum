type JourneyStepLike = {
  completed: boolean;
};

export function getJourneyProgress<TStep extends JourneyStepLike>(steps: TStep[]) {
  let completedCount = 0;
  let nextStep: TStep | null = null;

  for (const step of steps) {
    if (step.completed) {
      completedCount += 1;
      continue;
    }

    if (!nextStep) {
      nextStep = step;
    }
  }

  const totalCount = steps.length;
  const progress = totalCount ? completedCount / totalCount : 0;
  const isReady = completedCount === totalCount;

  return {
    completedCount,
    totalCount,
    progress,
    isReady,
    nextStep,
  };
}

export function getUpcomingJourneySteps<TStep extends JourneyStepLike>(steps: TStep[], limit = 2) {
  return steps.filter((step) => !step.completed).slice(0, limit);
}
