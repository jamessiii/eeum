import {
  clearAnalysisApiConfiguration,
  getAnalysisApiBaseUrl,
  setAnalysisApiBaseUrl,
  setAnalysisSpaceId,
} from "./api/analysisConfig";
import type { PinSignInResponse } from "./api/auth";

const AUTH_SESSION_STORAGE_KEY = "spending-diary.auth-session";
export const AUTH_SESSION_EVENT = "spending-diary:auth-session";

export type AuthSession = {
  apiBaseUrl: string;
  userId: number;
  displayName: string;
  spaceId: number;
  spaceName: string;
  sessionKey: string;
  availableSpaces: Array<{
    spaceId: number;
    spaceName: string;
    inviteCode: string;
    role: string;
  }>;
};

function normalizeSession(value: Partial<AuthSession> | null | undefined): AuthSession | null {
  if (!value) return null;
  if (!value.apiBaseUrl || !value.displayName || !value.spaceName || !value.sessionKey) return null;
  if (!value.userId || !value.spaceId) return null;

  const resolvedApiBaseUrl = getAnalysisApiBaseUrl() ?? value.apiBaseUrl;

  return {
    apiBaseUrl: resolvedApiBaseUrl,
    userId: value.userId,
    displayName: value.displayName,
    spaceId: value.spaceId,
    spaceName: value.spaceName,
    sessionKey: value.sessionKey,
    availableSpaces: Array.isArray(value.availableSpaces) ? value.availableSpaces : [],
  };
}

export function readAuthSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw) as Partial<AuthSession>);
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  setAnalysisApiBaseUrl(session.apiBaseUrl);
  setAnalysisSpaceId(session.spaceId);
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: session }));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  clearAnalysisApiConfiguration();
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: null }));
}

export function createAuthSession(baseUrl: string, response: PinSignInResponse): AuthSession {
  return {
    apiBaseUrl: baseUrl,
    userId: response.user.id,
    displayName: response.user.displayName,
    spaceId: response.space.id,
    spaceName: response.space.name,
    sessionKey: response.session.sessionKey,
    availableSpaces: response.availableSpaces ?? [],
  };
}
