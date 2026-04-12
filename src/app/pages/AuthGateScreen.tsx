import { useMemo, useState } from "react";
import { joinByInviteCode, signInWithPin, signUpWithPin, switchSpace, type PinSignInResponse } from "../api/auth";
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

type PendingSignIn = {
  baseUrl: string;
  data: PinSignInResponse;
};

function getAvailableSpaces(data: PinSignInResponse) {
  const spaces = data.availableSpaces?.length
    ? data.availableSpaces
    : [
        {
          spaceId: data.space.id,
          spaceName: data.space.name,
          inviteCode: data.space.inviteCode,
          role: data.membership.role,
        },
      ];

  return [...spaces].sort((left, right) => left.spaceName.localeCompare(right.spaceName, "ko-KR"));
}

export function AuthGateScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getAnalysisApiBaseUrl() ?? "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUpMode = mode === "sign-up";
  const trimmedDisplayName = displayName.trim();
  const trimmedApiBaseUrl = apiBaseUrl.trim();
  const trimmedPin = pin.trim();
  const trimmedInviteCode = inviteCode.trim().toUpperCase();
  const canSubmit = Boolean(trimmedApiBaseUrl && trimmedDisplayName && trimmedPin.length >= 4 && !isSubmitting);
  const canJoinByInvite = Boolean(pendingSignIn && trimmedInviteCode && !isSubmitting);
  const availableSpaces = pendingSignIn ? getAvailableSpaces(pendingSignIn.data) : [];

  const helperText = useMemo(() => {
    if (pendingSignIn) {
      return "이미 참여한 공간을 다시 선택하거나, 새 초대코드로 다른 공간에 참여할 수 있습니다.";
    }
    if (!trimmedApiBaseUrl) return "다이어리 서버 주소를 입력해주세요.";
    if (!trimmedDisplayName) return "이름을 입력해주세요.";
    if (trimmedPin.length < 4) return "비밀번호는 4자리 이상 입력해주세요.";
    return isSignUpMode
      ? "가입이 완료되면 바로 로그인 화면으로 돌아갑니다."
      : "로그인 후 들어갈 공간을 선택할 수 있습니다.";
  }, [isSignUpMode, pendingSignIn, trimmedApiBaseUrl, trimmedDisplayName, trimmedPin.length]);

  return (
    <main className="auth-gate-shell">
      <div className="auth-gate-panel">
        <div className="auth-gate-brand">
          <img className="auth-gate-brand-logo" src={`${ASSET_BASE}logo2.png`} alt="" aria-hidden="true" />
          <div className="auth-gate-brand-copy">
            <span className="auth-gate-kicker">SPENDING DIARY</span>
            <h1>{pendingSignIn ? "공간 선택" : isSignUpMode ? "간이 회원가입" : "소비일기 로그인"}</h1>
            <p>
              {pendingSignIn
                ? `${pendingSignIn.data.user.displayName}님, 들어갈 공간을 선택해주세요.`
                : isSignUpMode
                  ? "이름과 비밀번호로 개인 공간을 만들고 바로 로그인할 수 있습니다."
                  : "간단한 이름과 비밀번호로 소비일기 공간에 로그인합니다."}
            </p>
          </div>
        </div>

        {pendingSignIn ? (
          <div className="auth-gate-form">
            <div className="auth-gate-space-list">
              {availableSpaces.map((space) => {
                const isCurrent = space.spaceId === pendingSignIn.data.space.id;
                return (
                  <button
                    key={space.spaceId}
                    type="button"
                    className={`auth-gate-space-card${isCurrent ? " is-current" : ""}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      if (!pendingSignIn) return;

                      if (isCurrent) {
                        writeAuthSession(createAuthSession(pendingSignIn.baseUrl, pendingSignIn.data));
                        showToast(`${space.spaceName} 공간으로 들어갑니다.`, "success");
                        onSignedIn();
                        return;
                      }

                      setIsSubmitting(true);
                      void switchSpace({
                        apiBaseUrl: pendingSignIn.baseUrl,
                        sessionKey: pendingSignIn.data.session.sessionKey,
                        spaceId: space.spaceId,
                      })
                        .then(({ baseUrl, data }) => {
                          writeAuthSession(createAuthSession(baseUrl, data));
                          showToast(`${data.space.name} 공간으로 들어갑니다.`, "success");
                          onSignedIn();
                        })
                        .catch((error) => {
                          showToast(error instanceof Error ? error.message : "공간 전환에 실패했습니다.", "error");
                        })
                        .finally(() => {
                          setIsSubmitting(false);
                        });
                    }}
                  >
                    <div className="auth-gate-space-card-copy">
                      <strong>{space.spaceName}</strong>
                      <span>초대코드 {space.inviteCode}</span>
                    </div>
                    <span className="auth-gate-space-card-role">{space.role}</span>
                  </button>
                );
              })}
            </div>

            <label className="auth-gate-field">
              <span>초대코드</span>
              <input
                className="form-control"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="예: 1A2B3C4D"
                maxLength={32}
              />
            </label>

            <button
              className="btn btn-secondary auth-gate-submit"
              type="button"
              disabled={!canJoinByInvite}
              onClick={() => {
                if (!pendingSignIn) return;
                setIsSubmitting(true);
                void joinByInviteCode({
                  apiBaseUrl: pendingSignIn.baseUrl,
                  sessionKey: pendingSignIn.data.session.sessionKey,
                  inviteCode: trimmedInviteCode,
                })
                  .then(({ baseUrl, data }) => {
                    writeAuthSession(createAuthSession(baseUrl, data));
                    showToast(`${data.space.name} 공간에 참여했습니다.`, "success");
                    onSignedIn();
                  })
                  .catch((error) => {
                    showToast(error instanceof Error ? error.message : "초대코드 참여에 실패했습니다.", "error");
                  })
                  .finally(() => {
                    setIsSubmitting(false);
                  });
              }}
            >
              초대코드로 참여하기
            </button>

            <button
              type="button"
              className="btn btn-ghost auth-gate-switch"
              disabled={isSubmitting}
              onClick={() => {
                setPendingSignIn(null);
                setInviteCode("");
              }}
            >
              로그인 화면으로 돌아가기
            </button>

            <p className="auth-gate-helper">{helperText}</p>
          </div>
        ) : (
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
                    setPendingSignIn({ baseUrl, data });
                    setInviteCode("");
                    showToast("로그인되었습니다. 들어갈 공간을 선택해주세요.", "success");
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
                placeholder="https://diary-server.eeumai.com"
                autoComplete="url"
              />
            </label>

            <label className="auth-gate-field">
              <span>이름</span>
              <input
                className="form-control"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="예: 김소정"
                autoComplete="username"
                maxLength={80}
              />
            </label>

            <label className="auth-gate-field">
              <span>비밀번호</span>
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
        )}
      </div>
    </main>
  );
}
