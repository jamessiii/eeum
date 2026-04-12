import { resolveAnalysisApiBaseUrl } from "./analysisConfig";

export type AppPresenceConnection = {
  userId: number;
  username: string;
  userEmail: string;
  clientId: string;
  deviceName: string;
  clientType: string;
  page: string;
  workspaceName: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  activityLabel?: string | null;
  autoSyncEnabled: boolean;
  dotoriConnected: boolean;
  vpnReachable: boolean;
  connectedAt: string;
  lastSeenAt: string;
};

export type AppPresenceSnapshot = {
  ok?: boolean;
  onlineCount: number;
  connections: AppPresenceConnection[];
};

export type PresenceSnapshotResponse = {
  ok?: boolean;
  onlineCount: number;
  connections: Array<{
    userId: number;
    userDisplayName: string;
    userEmail: string;
    sessionKey: string;
    deviceName: string;
    clientType: string;
    activePageKey: string | null;
    workspaceName: string | null;
    targetKind: string | null;
    targetId: string | null;
    targetLabel: string | null;
    activityLabel: string | null;
    autoSyncEnabled: boolean;
    dotoriConnected: boolean;
    vpnReachable: boolean;
    connectedAt: string;
    lastSeenAt: string;
  }>;
};

type PresenceHeartbeatRequest = {
  apiBaseUrl?: string;
  sessionKey: string;
  userId: number;
  spaceId: number;
  deviceName: string;
  clientType: string;
  activePageKey: string | null;
  workspaceName: string | null;
  targetKind: string | null;
  targetId: string | null;
  targetLabel: string | null;
  activityLabel?: string | null;
  autoSyncEnabled: boolean;
  dotoriConnected: boolean;
  vpnReachable: boolean;
};

type PresenceClearRequest = {
  apiBaseUrl?: string;
  sessionKey: string;
  spaceId?: number;
};

type ErrorResponse = {
  message?: string;
  error?: string;
};

export function normalizePresenceSnapshot(response: PresenceSnapshotResponse): AppPresenceSnapshot {
  return {
    ok: response.ok,
    onlineCount: response.onlineCount,
    connections: response.connections.map((connection) => ({
      userId: connection.userId,
      username: connection.userDisplayName,
      userEmail: connection.userEmail,
      clientId: connection.sessionKey,
      deviceName: connection.deviceName,
      clientType: connection.clientType,
      page: connection.activePageKey ?? "소비일기",
      workspaceName: connection.workspaceName,
      targetKind: connection.targetKind,
      targetId: connection.targetId,
      targetLabel: connection.targetLabel,
      activityLabel: connection.activityLabel,
      autoSyncEnabled: connection.autoSyncEnabled,
      dotoriConnected: connection.dotoriConnected,
      vpnReachable: connection.vpnReachable,
      connectedAt: connection.connectedAt,
      lastSeenAt: connection.lastSeenAt,
    })),
  };
}

async function readErrorMessage(response: Response) {
  try {
    const parsed = (await response.json()) as ErrorResponse;
    return parsed.message || parsed.error || `요청에 실패했습니다. (${response.status})`;
  } catch {
    return `요청에 실패했습니다. (${response.status})`;
  }
}

export async function sendPresenceHeartbeat(request: PresenceHeartbeatRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) {
    throw new Error("서버 주소를 입력해주세요.");
  }

  const response = await fetch(`${baseUrl}/api/presence/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sessionKey: request.sessionKey,
      userId: request.userId,
      spaceId: request.spaceId,
      deviceName: request.deviceName,
      clientType: request.clientType,
      activePageKey: request.activePageKey,
      workspaceName: request.workspaceName,
      targetKind: request.targetKind,
      targetId: request.targetId,
      targetLabel: request.targetLabel,
      activityLabel: request.activityLabel ?? null,
      autoSyncEnabled: request.autoSyncEnabled,
      dotoriConnected: request.dotoriConnected,
      vpnReachable: request.vpnReachable,
      status: "ACTIVE",
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return normalizePresenceSnapshot((await response.json()) as PresenceSnapshotResponse);
}

export async function clearPresence(request: PresenceClearRequest) {
  const baseUrl = resolveAnalysisApiBaseUrl(request.apiBaseUrl);
  if (!baseUrl) return;

  const searchParams = new URLSearchParams({ sessionKey: request.sessionKey });
  if (request.spaceId) {
    searchParams.set("spaceId", String(request.spaceId));
  }

  const response = await fetch(`${baseUrl}/api/presence?${searchParams.toString()}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return normalizePresenceSnapshot((await response.json()) as PresenceSnapshotResponse);
}

export function createPresenceSocketUrl(baseUrl: string) {
  const resolvedBaseUrl = resolveAnalysisApiBaseUrl(baseUrl);
  if (!resolvedBaseUrl) {
    throw new Error("서버 주소를 입력해주세요.");
  }

  const url = new URL(resolvedBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}
