import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GuideBeacon } from "../components/GuideBeacon";
import { useAppState } from "../state/AppStateProvider";

export const WORKSPACE_SETUP_KEY = "household-webapp.workspace-setup";

type SetupPhase = "intro" | "workspace" | "person" | "creating";

export function EmptyWorkspaceScreen() {
  const navigate = useNavigate();
  const { createEmptyWorkspace } = useAppState();
  const [workspaceName, setWorkspaceName] = useState("");
  const [personName, setPersonName] = useState("");
  const [phase, setPhase] = useState<SetupPhase>("intro");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [introIndex, setIntroIndex] = useState(0);
  const workspaceInputRef = useRef<HTMLInputElement | null>(null);
  const personInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedWorkspaceName = workspaceName.trim();
  const trimmedPersonName = personName.trim();
  const introLines = ["안녕하세요.", "더욱 간편해진 가계관리.", "지금 바로 시작하겠습니다."];

  const moveToPhase = (nextPhase: SetupPhase) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setPhase(nextPhase);
      setIsTransitioning(false);
    }, 220);
  };

  useEffect(() => {
    if (phase === "workspace") {
      window.requestAnimationFrame(() => workspaceInputRef.current?.focus());
    }

    if (phase === "person") {
      window.requestAnimationFrame(() => personInputRef.current?.focus());
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "creating") return;

    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(
        WORKSPACE_SETUP_KEY,
        JSON.stringify({
          workspaceName: trimmedWorkspaceName,
          personName: trimmedPersonName,
        }),
      );
      createEmptyWorkspace(trimmedWorkspaceName);
      void navigate("/", { replace: true });
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [createEmptyWorkspace, navigate, phase, trimmedPersonName, trimmedWorkspaceName]);

  return (
    <main className="empty-workspace-shell">
      <div className="empty-workspace-ambient empty-workspace-ambient-left" aria-hidden="true" />
      <div className="empty-workspace-ambient empty-workspace-ambient-right" aria-hidden="true" />

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
            }, 460);
          }}
        >
          {introIndex === 0 ? (
            <div className="empty-workspace-orb-test" aria-hidden="true">
              <div className="ai-sphere-stage guide-beacon-scene guide-beacon-scene--delayed">
                <GuideBeacon variant="v1" state="entering" />
              </div>
            </div>
          ) : null}
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
              <h1 id="empty-workspace-title">가계부 이름을 입력하세요.</h1>
              <input
                ref={workspaceInputRef}
                className="form-control empty-workspace-input"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="예: 2026 우리집 가계부"
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
                moveToPhase("creating");
              }}
            >
              <span className="hero-kicker">Step 2</span>
              <h1 id="empty-workspace-title">사용자 이름을 입력하세요.</h1>
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
        <div className="empty-workspace-intro-text empty-workspace-start-text" aria-live="polite">
          <div className="empty-workspace-intro-lines" aria-label="지금 바로 시작합니다.">
            <span className="empty-workspace-intro-line is-active">지금 바로 시작합니다.</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
