import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuideBeaconScene } from "../components/GuideBeaconScene";
import { useAppState } from "../state/AppStateProvider";

export const WORKSPACE_SETUP_KEY = "household-webapp.workspace-setup";
export const ONBOARDING_COMPLETE_KEY = "household-webapp.onboarding-complete";

type SetupPhase = "intro" | "person" | "creating";
type CreatingStage = "idle" | "text-fading" | "beacon-exiting";

export function EmptyWorkspaceScreen() {
  const navigate = useNavigate();
  const { createEmptyWorkspace } = useAppState();
  const [personName, setPersonName] = useState("");
  const [phase, setPhase] = useState<SetupPhase>("intro");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [introIndex, setIntroIndex] = useState(0);
  const [creatingStage, setCreatingStage] = useState<CreatingStage>("idle");
  const personInputRef = useRef<HTMLInputElement | null>(null);
  const transitionTimersRef = useRef<number[]>([]);
  const trimmedPersonName = personName.trim();
  const introLines = ["흩어진 조각을 모아", "하나의 흐름으로 이어 기록합니다."];

  const moveToPhase = (nextPhase: SetupPhase) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setPhase(nextPhase);
      setIsTransitioning(false);
    }, 1320);
  };

  useEffect(() => {
    if (phase === "person") {
      window.requestAnimationFrame(() => personInputRef.current?.focus());
    }

    if (phase === "creating") {
      setCreatingStage("idle");
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      transitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      transitionTimersRef.current = [];
    };
  }, []);

  const finalizeOnboarding = () => {
    transitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    transitionTimersRef.current = [];

    const textFadeDuration = 920;
    const beaconExitDelayAfterText = 1000;
    const beaconExitDuration = 620;
    const navigateDelayAfterExit = 2000;

    const textFadeTimer = window.setTimeout(
      () => setCreatingStage("beacon-exiting"),
      textFadeDuration + beaconExitDelayAfterText,
    );
    const finishTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(
        WORKSPACE_SETUP_KEY,
        JSON.stringify({
          workspaceName: "",
          personName: trimmedPersonName,
        }),
      );
      window.sessionStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      createEmptyWorkspace();
      void navigate("/", { replace: true });
    }, textFadeDuration + beaconExitDelayAfterText + beaconExitDuration + navigateDelayAfterExit);

    transitionTimersRef.current = [textFadeTimer, finishTimer];
  };

  return (
    <main className={`empty-workspace-shell${phase === "creating" && creatingStage === "beacon-exiting" ? " is-finishing" : ""}`}>
      <div className="empty-workspace-ambient empty-workspace-ambient-left" aria-hidden="true" />
      <div className="empty-workspace-ambient empty-workspace-ambient-right" aria-hidden="true" />

      {phase === "intro" ? (
        <div className="empty-workspace-orb-test" aria-hidden="true">
          <GuideBeaconScene
            variant="v7"
            state={introIndex === 0 ? "entering" : "idle"}
            mode={introIndex === 0 ? "intro" : "default"}
          />
        </div>
      ) : null}

      {phase === "intro" ? (
        <button
          type="button"
          className={`empty-workspace-intro-text${isTransitioning ? " is-transitioning" : ""}`}
          onClick={() => {
            if (isTransitioning) return;
            setIsTransitioning(true);
            window.setTimeout(() => {
              if (introIndex >= introLines.length - 1) {
                setPhase("person");
              } else {
                setIntroIndex((current) => current + 1);
              }
              setIsTransitioning(false);
            }, 920);
          }}
        >
          <div className="empty-workspace-intro-lines" aria-label={introLines[introIndex]}>
            <span
              key={introLines[introIndex]}
              className={`empty-workspace-intro-line is-active${introIndex === 0 ? " is-delayed" : ""}`}
            >
              {introLines[introIndex]}
            </span>
          </div>
        </button>
      ) : phase === "person" ? (
        <section
          className={`empty-workspace-onboarding${isTransitioning ? " is-transitioning" : ""}`}
          aria-labelledby="empty-workspace-title"
        >
          <form
            className="empty-workspace-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmedPersonName) return;
              setCreatingStage("idle");
              moveToPhase("creating");
            }}
          >
            <span className="hero-kicker">이음 시작</span>
            <h1 id="empty-workspace-title">당신의 이름은?</h1>
            <input
              ref={personInputRef}
              className="form-control empty-workspace-input"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="이름 입력"
              maxLength={24}
            />
            <div className="empty-workspace-helper-row">
              <p className="empty-workspace-helper" />
              <button className="btn btn-primary empty-workspace-start-button" type="submit" disabled={!trimmedPersonName}>
                시작하기
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {phase === "creating" ? (
        <div className="empty-workspace-orb-test" aria-hidden="true">
          <GuideBeaconScene variant="v7" state={creatingStage === "beacon-exiting" ? "exiting" : "idle"} />
        </div>
      ) : null}

      {phase === "creating" ? (
        <button
          type="button"
          className={`empty-workspace-intro-text empty-workspace-start-text${creatingStage !== "idle" ? " is-transitioning" : ""}`}
          aria-live="polite"
          onClick={() => {
            if (creatingStage !== "idle") return;
            setCreatingStage("text-fading");
            finalizeOnboarding();
          }}
        >
          <div className="empty-workspace-intro-lines" aria-label="올바른 소비습관으로 이어지는 여정, 이음에서 시작합니다">
            <span className="empty-workspace-intro-line is-active">올바른 소비습관으로 이어지는 여정,</span>
            <span className="empty-workspace-intro-line is-active">이음에서 시작합니다</span>
          </div>
        </button>
      ) : null}
    </main>
  );
}
