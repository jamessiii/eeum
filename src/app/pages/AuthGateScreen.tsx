import { useMemo, useState } from "react";
import { signInWithPin, signUpWithPin } from "../api/auth";
import { getAnalysisApiBaseUrl } from "../api/analysisConfig";
import { createAuthSession, writeAuthSession } from "../authSession";
import { useToast } from "../toast/ToastProvider";

const ASSET_BASE = import.meta.env.BASE_URL;

function createSessionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pin-${crypto.randomUUID()}`;
  }
  return `pin-${Date.now()}`;
}

export function AuthGateScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getAnalysisApiBaseUrl() ?? "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUpMode = mode === "sign-up";
  const trimmedDisplayName = displayName.trim();
  const trimmedApiBaseUrl = apiBaseUrl.trim();
  const trimmedPin = pin.trim();
  const canSubmit = Boolean(trimmedApiBaseUrl && trimmedDisplayName && trimmedPin.length >= 4 && !isSubmitting);

  const helperText = useMemo(() => {
    if (!trimmedApiBaseUrl) return "다이어리 서버 주소를 입력해주세요.";
    if (!trimmedDisplayName) return "이름을 입력해주세요.";
    if (trimmedPin.length < 4) return "비밀번호는 4자리 이상으로 입력해주세요.";
    return isSignUpMode
      ? "회원가입을 완료하면 다시 로그인 화면으로 돌아갑니다."
      : "가입한 이름과 비밀번호로 기존 공간에 로그인합니다.";
  }, [isSignUpMode, trimmedApiBaseUrl, trimmedDisplayName, trimmedPin]);

  return (
    <main className="auth-gate-shell">
      <div className="auth-gate-panel">
        <div className="auth-gate-brand">
          <img className="auth-gate-brand-logo" src={`${ASSET_BASE}logo2.png`} alt="" aria-hidden="true" />
          <div className="auth-gate-brand-copy">
            <span className="auth-gate-kicker">SPENDING DIARY</span>
            <h1>{isSignUpMode ? "간이 회원가입" : "소비일기 로그인"}</h1>
            <p>
              {isSignUpMode
                ? "이름과 비밀번호로 새 공간을 만들고, 가입이 끝나면 로그인 화면으로 돌아갑니다."
                : "가입한 이름과 비밀번호로 소비일기 공간에 들어갑니다."}
            </p>
          </div>
        </div>

        <form
          className="auth-gate-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            setIsSubmitting(true);

            const request = isSignUpMode
              ? signUpWithPin({
                  apiBaseUrl: trimmedApiBaseUrl,
                  displayName: trimmedDisplayName,
                  pin: trimmedPin,
                }).then(({ data }) => {
                  showToast(`${data.displayName} 회원가입이 완료되었습니다. 로그인해주세요.`, "success");
                  setMode("sign-in");
                  setPin("");
                })
              : signInWithPin({
                  apiBaseUrl: trimmedApiBaseUrl,
                  displayName: trimmedDisplayName,
                  pin: trimmedPin,
                  deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Browser" : "Desktop Browser",
                  clientType: navigator.userAgent.includes("Mobile") ? "mobile" : "web",
                  activePageKey: "dashboard",
                  sessionKey: createSessionKey(),
                }).then(({ baseUrl, data }) => {
                  writeAuthSession(createAuthSession(baseUrl, data));
                  showToast("로그인이 완료되었습니다.", "success");
                  onSignedIn();
                });

            void request
              .catch((error) => {
                showToast(
                  error instanceof Error
                    ? error.message
                    : isSignUpMode
                      ? "회원가입에 실패했습니다."
                      : "로그인에 실패했습니다.",
                  "error",
                );
              })
              .finally(() => {
                setIsSubmitting(false);
              });
          }}
        >
          <label className="auth-gate-field">
            <span>서버 주소</span>
            <input
              className="form-control"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="https://diary.eeumai.com"
              autoComplete="url"
            />
          </label>

          <label className="auth-gate-field">
            <span>이름</span>
            <input
              className="form-control"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="예: 소정"
              autoComplete="username"
              maxLength={80}
            />
          </label>

          <label className="auth-gate-field">
            <span>{isSignUpMode ? "비밀번호" : "비밀번호"}</span>
            <input
              className="form-control"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="4자리 이상"
              autoComplete={isSignUpMode ? "new-password" : "current-password"}
              inputMode="numeric"
              maxLength={20}
            />
          </label>

          <p className="auth-gate-helper">{helperText}</p>

          <button className="btn btn-primary auth-gate-submit" type="submit" disabled={!canSubmit}>
            {isSubmitting ? (isSignUpMode ? "가입하는 중..." : "로그인 중...") : isSignUpMode ? "회원가입" : "로그인"}
          </button>

          <button
            type="button"
            className="btn btn-ghost auth-gate-switch"
            onClick={() => {
              setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
              setPin("");
            }}
            disabled={isSubmitting}
          >
            {isSignUpMode ? "로그인으로 돌아가기" : "회원가입"}
          </button>
        </form>
      </div>
    </main>
  );
}
