const API_BASE_URL_STORAGE_KEY = "spending-diary.analysis.api-base-url";
const SPACE_ID_STORAGE_KEY = "spending-diary.analysis.space-id";

function readStorageValue(key: string) {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key)?.trim();
  return value ? value : null;
}

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function normalizeSpaceId(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numericValue = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(numericValue) || numericValue <= 0) return null;
  return numericValue;
}

export function getAnalysisApiBaseUrl() {
  return (
    normalizeBaseUrl(readStorageValue(API_BASE_URL_STORAGE_KEY)) ??
    normalizeBaseUrl(import.meta.env.VITE_DIARY_API_BASE_URL)
  );
}

export function getAnalysisSpaceId() {
  return (
    normalizeSpaceId(readStorageValue(SPACE_ID_STORAGE_KEY)) ??
    normalizeSpaceId(import.meta.env.VITE_DIARY_SPACE_ID)
  );
}

export function isAnalysisApiConfigured() {
  return Boolean(getAnalysisApiBaseUrl() && getAnalysisSpaceId());
}

export function setAnalysisApiBaseUrl(value: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
}

export function setAnalysisSpaceId(value: string | number) {
  if (typeof window === "undefined") return;
  const normalized = normalizeSpaceId(value);
  if (!normalized) {
    window.localStorage.removeItem(SPACE_ID_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SPACE_ID_STORAGE_KEY, String(normalized));
}

export function clearAnalysisApiConfiguration() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  window.localStorage.removeItem(SPACE_ID_STORAGE_KEY);
}

export function resolveAnalysisApiBaseUrl(value?: string | null) {
  return normalizeBaseUrl(value) ?? getAnalysisApiBaseUrl();
}
