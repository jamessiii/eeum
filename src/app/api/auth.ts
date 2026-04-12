import { resolveAnalysisApiBaseUrl } from "./analysisConfig";

export type PinSignInRequest = {
  apiBaseUrl?: string;
  displayName: string;
  pin: string;
  deviceName?: string;
  clientType?: string;
  activePageKey?: string;
  sessionKey?: string;
};

export type PinSignInResponse = {
  created: boolean;
  user: {
    id: number;
    email: string;
    displayName: string;
    profileColor: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  space: {
    id: number;
    name: string;
    slug: string;
    inviteCode: string;
    description: string;
    timezone: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  membership: {
    id: number;
    spaceId: number;
    spaceName: string;
    userId: number;
    userDisplayName: string;
    userEmail: string;
    role: string;
    status: string;
    invitedAt: string | null;
    joinedAt: string | null;
    lastActiveAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: number;
    sessionKey: string;
    userId: number;
    userDisplayName: string;
    spaceId: number | null;
    deviceName: string;
    clientType: string;
    activePageKey: string | null;
    workspaceName: string | null;
    targetKind: string | null;
    targetId: string | null;
    targetLabel: string | null;
    autoSyncEnabled: boolean;
    dotoriConnected: boolean;
    vpnReachable: boolean;
    status: string;
    lastSeenAt: string;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  availableSpaces: Array<{
    spaceId: number;
    spaceName: string;
    inviteCode: string;
    role: string;
  }>;
};

export type PinSignUpRequest = {
  apiBaseUrl?: string;
  displayName: string;
  pin: string;
};

export type PinSignUpResponse = {
  displayName: string;
  spaceName: string;
};

export type JoinByInviteRequest = {
  apiBaseUrl?: string;
  sessionKey: string;
  inviteCode: string;
};

export type SwitchSpaceRequest = {
  apiBaseUrl?: string;
  sessionKey: string;
  spaceId: number;
};

type ErrorResponse = {
  message?: string;
  error?: string;
};

async function readErrorMessage(response: Response) {
  try {
    const parsed = (await response.json()) as ErrorResponse;
    return parsed.message || parsed.error || `로그인에 실패했습니다. (${response.status})`;
  } catch {
    return `로그인에 실패했습니다. (${response.status})`;
  }
}

export async function signInWithPin(request: PinSignInRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("서버 주소를 입력해주세요.");
  }

  const response = await fetch(`${baseUrl}/api/auth/pin-sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      displayName: request.displayName,
      pin: request.pin,
      deviceName: request.deviceName ?? "Spending Diary",
      clientType: request.clientType ?? "web",
      activePageKey: request.activePageKey ?? "dashboard",
      sessionKey: request.sessionKey,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    baseUrl,
    data: (await response.json()) as PinSignInResponse,
  };
}

export async function signUpWithPin(request: PinSignUpRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("?쒕쾭 二쇱냼瑜??낅젰?댁＜?몄슂.");
  }

  const response = await fetch(`${baseUrl}/api/auth/pin-sign-up`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      displayName: request.displayName,
      pin: request.pin,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    baseUrl,
    data: (await response.json()) as PinSignUpResponse,
  };
}

export async function joinByInviteCode(request: JoinByInviteRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("서버 주소를 입력해주세요.");
  }

  const response = await fetch(`${baseUrl}/api/auth/join-by-invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sessionKey: request.sessionKey,
      inviteCode: request.inviteCode,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    baseUrl,
    data: (await response.json()) as PinSignInResponse,
  };
}

export async function switchSpace(request: SwitchSpaceRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("?쒕쾭 二쇱냼瑜??낅젰?댁＜?몄슂.");
  }

  const response = await fetch(`${baseUrl}/api/auth/switch-space`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sessionKey: request.sessionKey,
      spaceId: request.spaceId,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    baseUrl,
    data: (await response.json()) as PinSignInResponse,
  };
}
