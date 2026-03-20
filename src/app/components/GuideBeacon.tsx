import beaconVideoSrc from "../../beacon/beacon1.mp4";

export type GuideBeaconVariant = "v1" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8";
export type GuideBeaconState = "hidden" | "entering" | "idle" | "exiting";

type GuideBeaconProps = {
  variant?: GuideBeaconVariant;
  state?: GuideBeaconState;
  className?: string;
};

export function GuideBeacon({ variant = "v1", state = "idle", className }: GuideBeaconProps) {
  const rootClassName = [
    "ai-sphere-preview",
    variant === "v2" ? "ai-sphere-preview-flat" : "ai-sphere-preview-tuned",
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

  if (variant === "v3") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <radialGradient id="ai-sphere-core-v3" cx="50%" cy="50%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="28%" stopColor="#d8e4ff" stopOpacity="0.96" />
            <stop offset="58%" stopColor="#7f98ff" stopOpacity="0.82" />
            <stop offset="86%" stopColor="#4e68ff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#4e68ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-core-v3-bloom" cx="50%" cy="50%" r="78%">
            <stop offset="0%" stopColor="#c8d8ff" stopOpacity="0.84" />
            <stop offset="52%" stopColor="#7b95ff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#546eff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-halo-v3" cx="50%" cy="50%" r="74%">
            <stop offset="0%" stopColor="#5f78ff" stopOpacity="0.58" />
            <stop offset="28%" stopColor="#617bff" stopOpacity="0.42" />
            <stop offset="58%" stopColor="#5a72ff" stopOpacity="0.24" />
            <stop offset="82%" stopColor="#536bff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#4e68ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-echo-v3" cx="50%" cy="50%" r="74%">
            <stop offset="52%" stopColor="#cad8ff" stopOpacity="0.46" />
            <stop offset="76%" stopColor="#9fb5ff" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#7e98ff" stopOpacity="0" />
          </radialGradient>
          <filter id="ai-sphere-core-v3-smear" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4.6" />
          </filter>
          <filter id="ai-sphere-halo-v3-soften" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5.8" />
          </filter>
          <filter id="ai-sphere-pulse-v3-soften" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.7" />
          </filter>
          <filter id="ai-sphere-pulse-v3-soften-blue" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="2.3" />
          </filter>
          <filter id="ai-sphere-echo-v3-soften" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        <circle
          className="ai-sphere-v1-halo ai-sphere-v3-halo"
          cx="80"
          cy="80"
          r="34"
          filter="url(#ai-sphere-halo-v3-soften)"
          style={{ fill: "url(#ai-sphere-halo-v3)" }}
        />
        <circle className="ai-sphere-v1-echo ai-sphere-v3-echo echo-a" cx="80" cy="80" r="12" filter="url(#ai-sphere-echo-v3-soften)" style={{ stroke: "url(#ai-sphere-echo-v3)" }} />
        <circle className="ai-sphere-v1-echo ai-sphere-v3-echo echo-b" cx="80" cy="80" r="12" filter="url(#ai-sphere-echo-v3-soften)" style={{ stroke: "url(#ai-sphere-echo-v3)" }} />
        <circle className="ai-sphere-v1-echo ai-sphere-v3-echo echo-c" cx="80" cy="80" r="12" filter="url(#ai-sphere-echo-v3-soften)" style={{ stroke: "url(#ai-sphere-echo-v3)" }} />
        <circle className="ai-sphere-v1-echo ai-sphere-v3-echo echo-d" cx="80" cy="80" r="12" filter="url(#ai-sphere-echo-v3-soften)" style={{ stroke: "url(#ai-sphere-echo-v3)" }} />
        <circle className="ai-sphere-v1-echo ai-sphere-v3-echo echo-e" cx="80" cy="80" r="12" filter="url(#ai-sphere-echo-v3-soften)" style={{ stroke: "url(#ai-sphere-echo-v3)" }} />
        <g className="ai-sphere-core-tuned-drift-wrap ai-sphere-v3-drift-wrap">
          <g className="ai-sphere-v3-core">
            <circle className="ai-sphere-v3-core-bloom" cx="80" cy="80" r="22" style={{ fill: "url(#ai-sphere-core-v3-bloom)" }} />
            <g className="ai-sphere-v3-core-cloud" filter="url(#ai-sphere-core-v3-smear)">
              <circle className="ai-sphere-v3-core-cloud-piece ai-sphere-v3-core-cloud-piece-a" cx="76" cy="82" r="10.5" style={{ fill: "url(#ai-sphere-core-v3)" }} />
              <circle className="ai-sphere-v3-core-cloud-piece ai-sphere-v3-core-cloud-piece-b" cx="86" cy="77" r="8.4" style={{ fill: "url(#ai-sphere-core-v3)" }} />
              <circle className="ai-sphere-v3-core-cloud-piece ai-sphere-v3-core-cloud-piece-c" cx="81" cy="75" r="7.4" style={{ fill: "url(#ai-sphere-core-v3)" }} />
              <circle className="ai-sphere-v3-core-cloud-piece ai-sphere-v3-core-cloud-piece-d" cx="80" cy="84" r="8.8" style={{ fill: "url(#ai-sphere-core-v3)" }} />
            </g>
            <circle className="ai-sphere-v3-core-flare" cx="79" cy="79" r="5.6" style={{ fill: "url(#ai-sphere-core-v3)" }} />
          </g>
        </g>
        <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-plum ai-sphere-core-pulse-tuned ai-sphere-v3-pulse pulse-f" cx="82" cy="79" r="11" filter="url(#ai-sphere-pulse-v3-soften)" />
        <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-blue ai-sphere-core-pulse-tuned ai-sphere-v3-pulse pulse-c" cx="78" cy="78" r="11" filter="url(#ai-sphere-pulse-v3-soften-blue)" />
        <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-blue ai-sphere-core-pulse-tuned ai-sphere-v3-pulse pulse-e" cx="80" cy="84" r="11" filter="url(#ai-sphere-pulse-v3-soften-blue)" />
        <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-tuned ai-sphere-v3-pulse pulse-a" cx="80" cy="80" r="13" filter="url(#ai-sphere-pulse-v3-soften)" />
        <circle className="ai-sphere-core-pulse ai-sphere-core-pulse-tuned ai-sphere-v3-pulse pulse-b" cx="80" cy="80" r="13" filter="url(#ai-sphere-pulse-v3-soften)" />
      </svg>
    );
  }

  if (variant === "v4") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <radialGradient id="ai-sphere-core-v4" cx="50%" cy="48%" r="72%">
            <stop offset="0%" stopColor="#6d7cff" stopOpacity="0.16" />
            <stop offset="52%" stopColor="#5667ff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#3f4dff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-halo-v4" cx="50%" cy="50%" r="76%">
            <stop offset="0%" stopColor="#738bff" stopOpacity="0.2" />
            <stop offset="58%" stopColor="#677dff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#586bff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ai-sphere-shell-v4" x1="22%" y1="18%" x2="78%" y2="82%">
            <stop offset="0%" stopColor="#95f0ff" stopOpacity="0.98" />
            <stop offset="34%" stopColor="#8cb0ff" stopOpacity="0.92" />
            <stop offset="72%" stopColor="#8d65ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f27eff" stopOpacity="0.94" />
          </linearGradient>
          <linearGradient id="ai-sphere-ribbon-v4-a" x1="12%" y1="20%" x2="84%" y2="84%">
            <stop offset="0%" stopColor="#9af6ff" stopOpacity="1" />
            <stop offset="18%" stopColor="#82d4ff" stopOpacity="0.98" />
            <stop offset="46%" stopColor="#7e6dff" stopOpacity="0.78" />
            <stop offset="72%" stopColor="#cb62ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#cb62ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ai-sphere-ribbon-v4-b" x1="78%" y1="12%" x2="18%" y2="92%">
            <stop offset="0%" stopColor="#8cf1ff" stopOpacity="1" />
            <stop offset="16%" stopColor="#7aa7ff" stopOpacity="0.98" />
            <stop offset="44%" stopColor="#a165ff" stopOpacity="0.8" />
            <stop offset="74%" stopColor="#ff71d1" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ff71d1" stopOpacity="0" />
          </linearGradient>
          <filter id="ai-sphere-ribbon-v4-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.9" />
          </filter>
          <filter id="ai-sphere-halo-v4-soften" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6.2" />
          </filter>
          <filter id="ai-sphere-shell-v4-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <clipPath id="ai-sphere-v4-clip">
            <circle cx="80" cy="80" r="31.5" />
          </clipPath>
        </defs>
        <circle className="ai-sphere-v4-halo" cx="80" cy="80" r="40" filter="url(#ai-sphere-halo-v4-soften)" style={{ fill: "url(#ai-sphere-halo-v4)" }} />
        <circle className="ai-sphere-v4-shell-fill" cx="80" cy="80" r="31.5" style={{ fill: "url(#ai-sphere-core-v4)" }} />
        <circle className="ai-sphere-v4-shell-glow" cx="80" cy="80" r="31.5" filter="url(#ai-sphere-shell-v4-glow)" style={{ stroke: "url(#ai-sphere-shell-v4)" }} />
        <circle className="ai-sphere-v4-shell" cx="80" cy="80" r="31.5" style={{ stroke: "url(#ai-sphere-shell-v4)" }} />
        <g className="ai-sphere-v4-ribbons ai-sphere-v4-ribbons-primary" clipPath="url(#ai-sphere-v4-clip)">
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-a" d="M44 38C55 46 63 61 74 72C84 82 98 92 117 86C108 98 95 106 84 116C71 103 58 92 48 79C38 65 38 50 44 38Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-a)" }} />
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-b" d="M40 76C58 58 84 56 99 44C104 58 111 73 123 86C107 88 94 96 82 108C68 104 56 96 40 76Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-b)" }} />
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-c" d="M60 33C80 39 88 55 96 70C102 82 111 91 120 96C105 101 92 110 82 124C76 109 68 95 58 82C47 67 47 49 60 33Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-a)" }} />
        </g>
        <g className="ai-sphere-v4-ribbons ai-sphere-v4-ribbons-secondary" clipPath="url(#ai-sphere-v4-clip)">
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-d" d="M34 66C49 60 58 47 66 35C83 41 96 51 105 67C111 78 117 86 128 91C113 95 98 106 89 124C79 111 70 98 58 90C45 81 38 76 34 66Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-b)" }} />
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-e" d="M48 116C58 98 70 88 84 79C99 69 109 58 112 38C123 51 126 67 122 82C118 98 111 110 101 121C82 123 64 122 48 116Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-a)" }} />
          <path className="ai-sphere-v4-ribbon ai-sphere-v4-ribbon-f" d="M53 44C69 50 85 63 96 78C107 93 119 102 128 104C114 111 99 116 82 118C75 102 66 90 55 80C46 70 43 58 53 44Z" style={{ stroke: "url(#ai-sphere-ribbon-v4-b)" }} />
        </g>
        <circle className="ai-sphere-v4-flare" cx="79" cy="80" r="6.5" />
      </svg>
    );
  }

  if (variant === "v5") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <radialGradient id="ai-sphere-core-v5" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#4456ff" stopOpacity="0.1" />
            <stop offset="54%" stopColor="#3949e7" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#2430a8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-halo-v5" cx="50%" cy="50%" r="78%">
            <stop offset="0%" stopColor="#7e97ff" stopOpacity="0.12" />
            <stop offset="62%" stopColor="#6c7fff" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#596cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ai-sphere-shell-v5" x1="18%" y1="18%" x2="82%" y2="84%">
            <stop offset="0%" stopColor="#9cf6ff" stopOpacity="0.92" />
            <stop offset="34%" stopColor="#7ea7ff" stopOpacity="0.84" />
            <stop offset="72%" stopColor="#8a66ff" stopOpacity="0.86" />
            <stop offset="100%" stopColor="#ff6de3" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="ai-sphere-ribbon-v5-a" x1="14%" y1="16%" x2="86%" y2="86%">
            <stop offset="0%" stopColor="#99f5ff" stopOpacity="1" />
            <stop offset="22%" stopColor="#88d9ff" stopOpacity="0.96" />
            <stop offset="58%" stopColor="#7f75ff" stopOpacity="0.58" />
            <stop offset="84%" stopColor="#b863ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#cf67ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ai-sphere-ribbon-v5-b" x1="80%" y1="10%" x2="20%" y2="94%">
            <stop offset="0%" stopColor="#8bf2ff" stopOpacity="1" />
            <stop offset="20%" stopColor="#77b4ff" stopOpacity="0.94" />
            <stop offset="56%" stopColor="#8c63ff" stopOpacity="0.56" />
            <stop offset="82%" stopColor="#ff70d8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ff70d8" stopOpacity="0" />
          </linearGradient>
          <filter id="ai-sphere-halo-v5-soften" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5.4" />
          </filter>
          <filter id="ai-sphere-shell-v5-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id="ai-sphere-ribbon-v5-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.35" />
          </filter>
          <clipPath id="ai-sphere-v5-clip">
            <circle cx="80" cy="80" r="31.5" />
          </clipPath>
        </defs>
        <circle className="ai-sphere-v5-halo" cx="80" cy="80" r="40" filter="url(#ai-sphere-halo-v5-soften)" style={{ fill: "url(#ai-sphere-halo-v5)" }} />
        <circle className="ai-sphere-v5-shell-fill" cx="80" cy="80" r="31.5" style={{ fill: "url(#ai-sphere-core-v5)" }} />
        <circle className="ai-sphere-v5-shell-glow" cx="80" cy="80" r="31.5" filter="url(#ai-sphere-shell-v5-glow)" style={{ stroke: "url(#ai-sphere-shell-v5)" }} />
        <circle className="ai-sphere-v5-shell" cx="80" cy="80" r="31.5" style={{ stroke: "url(#ai-sphere-shell-v5)" }} />
        <g className="ai-sphere-v5-ribbons ai-sphere-v5-ribbons-primary" clipPath="url(#ai-sphere-v5-clip)">
          <path className="ai-sphere-v5-ribbon ai-sphere-v5-ribbon-a" d="M41 42C53 38 68 44 79 57C90 70 101 83 117 92C103 96 92 104 82 118C71 109 61 99 51 87C41 75 36 57 41 42Z" style={{ stroke: "url(#ai-sphere-ribbon-v5-a)" }} />
          <path className="ai-sphere-v5-ribbon ai-sphere-v5-ribbon-b" d="M44 106C58 92 73 83 88 72C102 62 112 50 116 34C124 49 126 66 121 81C115 95 104 108 92 121C74 118 58 114 44 106Z" style={{ stroke: "url(#ai-sphere-ribbon-v5-b)" }} />
        </g>
        <g className="ai-sphere-v5-ribbons ai-sphere-v5-ribbons-secondary" clipPath="url(#ai-sphere-v5-clip)">
          <path className="ai-sphere-v5-ribbon ai-sphere-v5-ribbon-c" d="M34 69C49 63 60 50 69 34C82 38 95 47 104 61C111 73 118 82 127 87C112 92 98 101 88 116C73 107 58 94 34 69Z" style={{ stroke: "url(#ai-sphere-ribbon-v5-b)" }} />
          <path className="ai-sphere-v5-ribbon ai-sphere-v5-ribbon-d" d="M54 34C68 46 79 61 89 75C97 87 108 97 121 104C105 109 91 116 77 124C73 109 65 95 57 82C49 68 47 48 54 34Z" style={{ stroke: "url(#ai-sphere-ribbon-v5-a)" }} />
        </g>
      </svg>
    );
  }

  if (variant === "v6") {
    return (
      <video
        className={rootClassName}
        src={beaconVideoSrc}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
    );
  }

  if (variant === "v7") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <radialGradient id="ai-sphere-core-v7" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#dffbf5" stopOpacity="0.18" />
            <stop offset="42%" stopColor="#d8fbf3" stopOpacity="0.36" />
            <stop offset="70%" stopColor="#5cf4db" stopOpacity="0.96" />
            <stop offset="88%" stopColor="#2fe0c3" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#87eadf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-halo-v7" cx="50%" cy="50%" r="76%">
            <stop offset="0%" stopColor="#ffd9ff" stopOpacity="0.26" />
            <stop offset="60%" stopColor="#f05cff" stopOpacity="0.38" />
            <stop offset="86%" stopColor="#a02fff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#a56bff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ai-sphere-ring-v7" x1="16%" y1="16%" x2="84%" y2="84%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="48%" stopColor="#d9e5ff" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#a95cff" stopOpacity="0.92" />
          </linearGradient>
          <filter id="ai-sphere-halo-v7-soften" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="7.4" />
          </filter>
          <filter id="ai-sphere-core-v7-soften" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="3.6" />
          </filter>
          <filter id="ai-sphere-ring-v7-glow" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <filter id="ai-sphere-pulse-v7-soften" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        <circle className="ai-sphere-v7-halo" cx="80" cy="80" r="39" filter="url(#ai-sphere-halo-v7-soften)" style={{ fill: "url(#ai-sphere-halo-v7)" }} />
        <circle className="ai-sphere-v7-core" cx="80" cy="80" r="33.2" filter="url(#ai-sphere-core-v7-soften)" style={{ fill: "url(#ai-sphere-core-v7)" }} />
        <circle className="ai-sphere-v7-ring-glow" cx="80" cy="80" r="33.5" filter="url(#ai-sphere-ring-v7-glow)" style={{ stroke: "url(#ai-sphere-ring-v7)" }} />
        <circle className="ai-sphere-v7-ring-outer" cx="78.9" cy="78.7" r="32.1" style={{ stroke: "url(#ai-sphere-ring-v7)" }} />
        <circle className="ai-sphere-v7-ring-inner" cx="81.2" cy="81.5" r="32.1" style={{ stroke: "url(#ai-sphere-ring-v7)" }} />
        <circle className="ai-sphere-v7-ring-mid" cx="80.4" cy="79.4" r="32.1" style={{ stroke: "url(#ai-sphere-ring-v7)" }} />
        <circle className="ai-sphere-v7-pulse ai-sphere-v7-pulse-a" cx="79.2" cy="80.6" r="24.8" filter="url(#ai-sphere-pulse-v7-soften)" />
        <circle className="ai-sphere-v7-pulse ai-sphere-v7-pulse-b" cx="81" cy="79.1" r="24.8" filter="url(#ai-sphere-pulse-v7-soften)" />
      </svg>
    );
  }

  if (variant === "v8") {
    return (
      <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <radialGradient id="ai-sphere-core-v8" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="18%" stopColor="#fff7ff" stopOpacity="0.98" />
            <stop offset="42%" stopColor="#ff9fff" stopOpacity="0.88" />
            <stop offset="78%" stopColor="#b04dff" stopOpacity="0.46" />
            <stop offset="100%" stopColor="#7c2cff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ai-sphere-glow-v8" cx="50%" cy="50%" r="78%">
            <stop offset="0%" stopColor="#ffb6ff" stopOpacity="0.42" />
            <stop offset="56%" stopColor="#d86bff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8b32ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ai-sphere-energy-v8" x1="16%" y1="18%" x2="84%" y2="82%">
            <stop offset="0%" stopColor="#ffb8ff" stopOpacity="0" />
            <stop offset="18%" stopColor="#ffb8ff" stopOpacity="0.96" />
            <stop offset="48%" stopColor="#ff6bff" stopOpacity="0.84" />
            <stop offset="82%" stopColor="#b64dff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#8b32ff" stopOpacity="0" />
          </linearGradient>
          <filter id="ai-sphere-glow-v8-soften" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="6.6" />
          </filter>
          <filter id="ai-sphere-core-v8-soften" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="3.8" />
          </filter>
          <filter id="ai-sphere-energy-v8-soften" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <circle className="ai-sphere-v8-glow" cx="80" cy="80" r="38" filter="url(#ai-sphere-glow-v8-soften)" style={{ fill: "url(#ai-sphere-glow-v8)" }} />
        <g className="ai-sphere-v8-core-group">
          <ellipse className="ai-sphere-v8-core" cx="80" cy="81" rx="20" ry="17" filter="url(#ai-sphere-core-v8-soften)" style={{ fill: "url(#ai-sphere-core-v8)" }} />
          <ellipse className="ai-sphere-v8-core-flare" cx="79" cy="80" rx="28" ry="6.2" />
        </g>
        <g className="ai-sphere-v8-energy-wrap">
          <path className="ai-sphere-v8-energy ai-sphere-v8-energy-a" d="M48 48C60 39 74 40 84 51C94 62 97 80 86 95C76 108 58 112 47 101C37 90 36 61 48 48Z" style={{ stroke: "url(#ai-sphere-energy-v8)" }} filter="url(#ai-sphere-energy-v8-soften)" />
          <path className="ai-sphere-v8-energy ai-sphere-v8-energy-b" d="M113 43C124 53 126 69 119 82C112 95 98 105 86 106C97 93 102 81 103 68C104 57 107 49 113 43Z" style={{ stroke: "url(#ai-sphere-energy-v8)" }} filter="url(#ai-sphere-energy-v8-soften)" />
          <path className="ai-sphere-v8-energy ai-sphere-v8-energy-c" d="M52 110C62 104 73 102 83 107C93 112 101 122 109 121C97 131 81 133 68 128C58 124 52 118 52 110Z" style={{ stroke: "url(#ai-sphere-energy-v8)" }} filter="url(#ai-sphere-energy-v8-soften)" />
          <path className="ai-sphere-v8-energy ai-sphere-v8-energy-d" d="M63 35C73 31 85 31 95 35C89 38 84 44 81 50C77 44 71 38 63 35Z" style={{ stroke: "url(#ai-sphere-energy-v8)" }} filter="url(#ai-sphere-energy-v8-soften)" />
        </g>
      </svg>
    );
  }

  return (
    <svg className={rootClassName} viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <radialGradient id="ai-sphere-core-v1" cx="40%" cy="36%" r="64%">
          <stop offset="0%" stopColor="#f7faff" />
          <stop offset="100%" stopColor="#6f8fff" />
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
