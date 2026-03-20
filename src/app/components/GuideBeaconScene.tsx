import { GuideBeacon, type GuideBeaconState, type GuideBeaconVariant } from "./GuideBeacon";

type GuideBeaconSceneMode = "default" | "intro" | "floating";

type GuideBeaconSceneProps = {
  variant?: GuideBeaconVariant;
  state?: GuideBeaconState;
  mode?: GuideBeaconSceneMode;
  className?: string;
};

export function GuideBeaconScene({
  variant = "v1",
  state = "idle",
  mode = "default",
  className,
}: GuideBeaconSceneProps) {
  const sceneModeClassName =
    mode === "intro"
      ? "guide-beacon-scene--intro"
      : mode === "floating"
        ? "guide-beacon-scene--floating"
        : undefined;
  const rootClassName = ["ai-sphere-stage", "guide-beacon-scene", sceneModeClassName].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      <GuideBeacon variant={variant} state={state} className={className} />
    </div>
  );
}
