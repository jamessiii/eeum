import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuideBeaconScene } from "../components/GuideBeaconScene";
import { useAppState } from "../state/AppStateProvider";

export const WORKSPACE_SETUP_KEY = "household-webapp.workspace-setup";
export const ONBOARDING_COMPLETE_KEY = "household-webapp.onboarding-complete";

type SetupPhase = "intro" | "workspace" | "person" | "creating";
type CreatingStage = "idle" | "text-fading" | "beacon-exiting";

export function EmptyWorkspaceScreen() {
  const navigate = useNavigate();
  const { createEmptyWorkspace } = useAppState();
  const [workspaceName, setWorkspaceName] = useState("");
  const [personName, setPersonName] = useState("");
  const [phase, setPhase] = useState<SetupPhase>("intro");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [introIndex, setIntroIndex] = useState(0);
  const [creatingStage, setCreatingStage] = useState<CreatingStage>("idle");
  const workspaceInputRef = useRef<HTMLInputElement | null>(null);
  const personInputRef = useRef<HTMLInputElement | null>(null);
  const transitionTimersRef = useRef<number[]>([]);
  const trimmedWorkspaceName = workspaceName.trim();
  const trimmedPersonName = personName.trim();
  const introLines = ["흩어졌던 것들이", "하나의 이야기로 남습니다"];

  const moveToPhase = (nextPhase: SetupPhase) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setPhase(nextPhase);
      setIsTransitioning(false);
    }, 1320);
  };

  useEffect(() => {
    if (phase === "workspace") {
      window.requestAnimationFrame(() => workspaceInputRef.current?.focus());
    }

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
          workspaceName: trimmedWorkspaceName,
          personName: trimmedPersonName,
        }),
      );
      window.sessionStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      createEmptyWorkspace(trimmedWorkspaceName);
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
                setPhase("workspace");
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
      ) : phase === "workspace" || phase === "person" ? (
        <section
          key={phase}
          className={`empty-workspace-onboarding${isTransitioning ? " is-transitioning" : ""}`}
          aria-labelledby="empty-workspace-title"
        >
          {phase === "workspace" ? (
            <form
              className="empty-workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!trimmedWorkspaceName) return;
                moveToPhase("person");
              }}
            >
              <span className="hero-kicker">Step 1</span>
              <h1 id="empty-workspace-title">이야기의 이름을 입력해주세요.</h1>
              <input
                ref={workspaceInputRef}
                className="form-control empty-workspace-input"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="예: 2026 우리집 이야기"
                maxLength={40}
              />
              <div className="empty-workspace-helper-row">
                <p className="empty-workspace-helper" />
                <button className="btn btn-primary empty-workspace-start-button" type="submit" disabled={!trimmedWorkspaceName}>
                  다음
                </button>
              </div>
            </form>
          ) : null}

          {phase === "person" ? (
            <form
              className="empty-workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!trimmedPersonName) return;
                setCreatingStage("idle");
                moveToPhase("creating");
              }}
            >
              <span className="hero-kicker">Step 2</span>
              <h1 id="empty-workspace-title">이야기의 주인공은</h1>
              <input
                ref={personInputRef}
                className="form-control empty-workspace-input"
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
                placeholder="예: 지민"
                maxLength={24}
              />
              <div className="empty-workspace-helper-row">
                <button
                  type="button"
                  className="btn empty-workspace-back-button"
                  onClick={() => moveToPhase("workspace")}
                >
                  이전
                </button>
                <button className="btn btn-primary empty-workspace-start-button" type="submit" disabled={!trimmedPersonName}>
                  시작하기
                </button>
              </div>
            </form>
          ) : null}
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
          <div className="empty-workspace-intro-lines" aria-label="지금 바로 시작합니다.">
            <span className="empty-workspace-intro-line is-active">지금 바로 시작합니다.</span>
          </div>
        </button>
      ) : null}
    </main>
  );
}
