export type DotoriConnectionForm = {
  host: string;
  port: string;
  username: string;
  password: string;
  rememberCredentials: boolean;
};

type DotoriLatestBackupResponse = {
  exists?: boolean;
  fileName: string | null;
  content: string | null;
  savedAt?: string | null;
};

export type DotoriPresenceConnection = {
  username: string;
  clientId: string;
  page: string;
  workspaceName: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  autoSyncEnabled: boolean;
  dotoriConnected: boolean;
  vpnReachable: boolean;
  connectedAt: string;
  lastSeenAt: string;
};

export type DotoriPresenceSnapshot = {
  ok?: boolean;
  onlineCount: number;
  connections: DotoriPresenceConnection[];
};

export type DotoriBackupMetadata = {
  exists?: boolean;
  fileName: string | null;
  savedAt?: string | null;
  backupCommitId?: string | null;
};

type DotoriErrorResponse = {
  message?: string;
  error?: string;
};

type DotoriRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: string;
};

function normalizeBaseUrl(form: DotoriConnectionForm) {
  const host = form.host.trim();
  const port = form.port.trim();
  if (!host) {
    throw new Error("도토리창고 호스트를 입력해주세요.");
  }

  const withProtocol = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  const normalizedHost = withProtocol.replace(/\/+$/, "");
  if (!port) {
    return normalizedHost;
  }

  const parsed = new URL(normalizedHost);
  parsed.port = port;
  return parsed.toString().replace(/\/+$/, "");
}

export function createDotoriPresenceSocketUrl(form: DotoriConnectionForm) {
  const baseUrl = new URL(normalizeBaseUrl(form));
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = "/ws/spending-diary-presence";
  baseUrl.search = "";
  baseUrl.hash = "";
  return baseUrl.toString();
}

function createAuthorizationHeader(username: string, password: string) {
  return `Basic ${window.btoa(`${username}:${password}`)}`;
}

async function readErrorMessage(response: Response) {
  try {
    const parsed = (await response.json()) as DotoriErrorResponse;
    return parsed.message || parsed.error || `요청에 실패했습니다. (${response.status})`;
  } catch {
    return `요청에 실패했습니다. (${response.status})`;
  }
}

async function requestDotori<T>(
  form: DotoriConnectionForm,
  path: string,
  options: DotoriRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(form)}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: createAuthorizationHeader(form.username.trim(), form.password),
      "Content-Type": "application/json",
    },
    body: options.body,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function healthCheckDotoriStorage(form: DotoriConnectionForm) {
  return requestDotori<{ ok?: boolean; message?: string }>(form, "/api/spending-diary/health");
}

export async function saveDotoriBackup(
  form: DotoriConnectionForm,
  payload: { folderName: string; fileName: string; content: string },
) {
  return requestDotori<DotoriBackupMetadata>(form, "/api/spending-diary/backups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loadLatestDotoriBackup(form: DotoriConnectionForm, folderName: string) {
  const searchParams = new URLSearchParams({ folderName });
  return requestDotori<DotoriLatestBackupResponse>(
    form,
    `/api/spending-diary/backups/latest?${searchParams.toString()}`,
  );
}

export async function loadLatestDotoriBackupMetadata(form: DotoriConnectionForm, folderName: string) {
  const searchParams = new URLSearchParams({ folderName });
  return requestDotori<DotoriBackupMetadata>(
    form,
    `/api/spending-diary/backups/latest/meta?${searchParams.toString()}`,
  );
}

export async function sendDotoriPresenceHeartbeat(
  form: DotoriConnectionForm,
  payload: {
    clientId: string;
    page: string;
    workspaceName: string | null;
    autoSyncEnabled: boolean;
    dotoriConnected: boolean;
    vpnReachable: boolean;
  },
) {
  return requestDotori<DotoriPresenceSnapshot>(form, "/api/spending-diary/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loadDotoriPresence(form: DotoriConnectionForm) {
  return requestDotori<DotoriPresenceSnapshot>(form, "/api/spending-diary/presence");
}

export async function clearDotoriPresence(form: DotoriConnectionForm, clientId: string) {
  const searchParams = new URLSearchParams({ clientId });
  return requestDotori<DotoriPresenceSnapshot>(form, `/api/spending-diary/presence?${searchParams.toString()}`, {
    method: "DELETE",
  });
}

