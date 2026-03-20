export type GuideBeaconVariant = "v1" | "v2";
export type GuideBeaconState = "entering" | "idle" | "exiting";

type GuideBeaconProps = {
  variant?: GuideBeaconVariant;
  state?: GuideBeaconState;
  className?: string;
};

export function GuideBeacon({ variant = "v1", state = "idle", className }: GuideBeaconProps) {
  const rootClassName = [
    "ai-sphere-preview",
    variant === "v1" ? "ai-sphere-preview-tuned" : "ai-sphere-preview-flat",
    "guide-beacon",
    `guide-beacon--${variant}`,
    `guide-beacon--${state}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (variant === "v2") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <circle className="ai-sphere-flat-halo" cx="80" cy="80" r="34" />
        <circle className="ai-sphere-flat-ring ai-sphere-flat-ring-outer" cx="80" cy="80" r="26" />
        <circle className="ai-sphere-flat-ring ai-sphere-flat-ring-inner" cx="80" cy="80" r="18" />
        <circle className="ai-sphere-flat-core" cx="80" cy="80" r="11" />
        <circle className="ai-sphere-flat-pulse ai-sphere-flat-pulse-blue pulse-flat-a" cx="79" cy="77" r="12" />
        <circle className="ai-sphere-flat-pulse ai-sphere-flat-pulse-blue pulse-flat-b" cx="82" cy="83" r="12" />
        <circle className="ai-sphere-flat-pulse ai-sphere-flat-pulse-plum pulse-flat-c" cx="84" cy="79" r="10" />
      </svg>
    );
  }

  return (
    <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <radialGradient id="ai-sphere-core-v1" cx="40%" cy="36%" r="64%">
          <stop offset="0%" stopColor="#f3f7ff" />
          <stop offset="100%" stopColor="#7f9dff" />
        </radialGradient>
      </defs>
      <circle className="ai-sphere-v1-halo" cx="80" cy="80" r="34" />
      <circle className="ai-sphere-v1-echo echo-a" cx="80" cy="80" r="12" />
      <circle className="ai-sphere-v1-echo echo-b" cx="80" cy="80" r="12" />
      <circle className="ai-sphere-v1-echo echo-c" cx="80" cy="80" r="12" />
      <circle className="ai-sphere-v1-echo echo-d" cx="80" cy="80" r="12" />
      <circle className="ai-sphere-v1-echo echo-e" cx="80" cy="80" r="12" />
      <g className="ai-sphere-core-tuned-drift-wrap">
        <circle className="ai-sphere-core ai-sphere-core-tuned" cx="80" cy="80" r="12" style={{ fill: "url(#ai-sphere-core-v1)" }} />
      </g>
      <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-plum ai-sphere-core-pulse-tuned pulse-f" cx="82" cy="79" r="11" />
      <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-blue ai-sphere-core-pulse-tuned pulse-c" cx="78" cy="78" r="11" />
      <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-blue ai-sphere-core-pulse-tuned pulse-e" cx="80" cy="84" r="11" />
      <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-tuned pulse-a" cx="80" cy="80" r="13" />
      <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-tuned pulse-b" cx="80" cy="80" r="13" />
    </svg>
  );
}
