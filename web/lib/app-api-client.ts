import { resolveApiBase } from "@/app/_lib/resolveApiBase";

export class AppApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = "AppApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

type AppApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | object | null;
};

function normalizePath(path: string): string {
  if (!path) return "/api";
  if (path.startsWith("/api/") || path === "/api") return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/api${suffix}`;
}

function resolveRequestUrl(path: string): string {
  const normalizedPath = normalizePath(path);
  if (typeof window !== "undefined") {
    return normalizedPath;
  }
  return `${resolveApiBase()}${normalizedPath}`;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function buildBody(body: AppApiRequestOptions["body"], headers: Headers): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === "string" || body instanceof Blob || body instanceof URLSearchParams) {
    return body;
  }
  if (isFormData(body)) {
    headers.delete("Content-Type");
    return body;
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return JSON.stringify(body);
}

function extractErrorMessage(payload: unknown, fallbackStatus: number): { message: string; code?: string } {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message =
      (typeof record.message === "string" && record.message) ||
      (typeof record.error === "string" && record.error) ||
      `Request failed with ${fallbackStatus}`;
    const code = typeof record.code === "string" ? record.code : undefined;
    return { message, code };
  }
  return { message: `Request failed with ${fallbackStatus}` };
}

export async function appApiRequest<T>(path: string, options: AppApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const body = buildBody(options.body, headers);

  const response = await fetch(resolveRequestUrl(path), {
    ...options,
    body,
    headers,
    credentials: options.credentials ?? "include",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const { message, code } = extractErrorMessage(payload, response.status);
    throw new AppApiError(message, response.status, code, payload);
  }

  return payload as T;
}

export async function appApiFetch(path: string, options: AppApiRequestOptions = {}) {
  const headers = new Headers(options.headers);
  const body = buildBody(options.body, headers);

  return fetch(resolveRequestUrl(path), {
    ...options,
    body,
    headers,
    credentials: options.credentials ?? "include",
  });
}

export async function appApiGet<T>(path: string, options: Omit<AppApiRequestOptions, "method" | "body"> = {}) {
  return appApiRequest<T>(path, { ...options, method: "GET" });
}

export async function appApiPost<T>(
  path: string,
  body?: AppApiRequestOptions["body"],
  options: Omit<AppApiRequestOptions, "method" | "body"> = {}
) {
  return appApiRequest<T>(path, { ...options, method: "POST", body });
}

export async function appApiPut<T>(
  path: string,
  body?: AppApiRequestOptions["body"],
  options: Omit<AppApiRequestOptions, "method" | "body"> = {}
) {
  return appApiRequest<T>(path, { ...options, method: "PUT", body });
}

export async function appApiDelete<T>(
  path: string,
  options: Omit<AppApiRequestOptions, "method"> = {}
) {
  return appApiRequest<T>(path, { ...options, method: "DELETE" });
}

export async function appApiText(
  path: string,
  options: Omit<AppApiRequestOptions, "method" | "body"> = {}
) {
  const response = await appApiFetch(path, { ...options, method: "GET" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AppApiError(text || `Request failed with ${response.status}`, response.status);
  }
  return response.text();
}
