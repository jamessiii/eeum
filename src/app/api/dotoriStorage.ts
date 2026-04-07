export type DotoriConnectionForm = {
  host: string;
  port: string;
  username: string;
  password: string;
  rememberCredentials: boolean;
};

type DotoriLatestBackupResponse = {
  fileName: string;
  content: string;
  savedAt?: string | null;
};

export type DotoriBackupMetadata = {
  fileName: string;
  savedAt?: string | null;
};

type DotoriErrorResponse = {
  message?: string;
  error?: string;
};

type DotoriRequestOptions = {
  method?: "GET" | "POST";
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
