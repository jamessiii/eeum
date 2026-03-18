type JourneyStepLike = {
  completed: boolean;
};

export function getJourneyProgress<TStep extends JourneyStepLike>(steps: TStep[]) {
  const completedCount = steps.filter((step) => step.completed).length;
  const totalCount = steps.length;
  const progress = totalCount ? completedCount / totalCount : 0;
  const isReady = steps.every((step) => step.completed);
  const nextStep = steps.find((step) => !step.completed) ?? null;

  return {
    completedCount,
    totalCount,
    progress,
    isReady,
    nextStep,
  };
}
