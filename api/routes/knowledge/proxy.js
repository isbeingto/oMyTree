import { HttpError } from "../../lib/errors.js";
import { getTraceId } from "../../lib/trace.js";
import http from "node:http";
import https from "node:https";
import {
  createWeKnoraError,
  readWeKnoraResponseBody,
  unwrapWeKnoraData,
} from "./adapter.js";

function getWeKnoraBaseUrl() {
  const raw = typeof process.env.WEKNORA_BASE_URL === "string" ? process.env.WEKNORA_BASE_URL.trim() : "";
  return raw || "http://127.0.0.1:8081";
}

function getWeKnoraTenantId() {
  return typeof process.env.WEKNORA_TENANT_ID === "string" ? process.env.WEKNORA_TENANT_ID.trim() : "";
}

function allowGlobalKeyFallback() {
  // P0 SECURITY: Global key fallback is DISABLED by default to enforce tenant isolation.
  // Only enable for emergency debugging with explicit "DANGER_YES" value.
  return process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK === "DANGER_YES";
}

function getGlobalWeKnoraApiKey() {
  return typeof process.env.WEKNORA_API_KEY === "string" ? process.env.WEKNORA_API_KEY.trim() : "";
}

function resolveWeKnoraApiKey(res, extraHeaders) {
  const headerKey =
    extraHeaders &&
    (extraHeaders["X-API-Key"] ||
      extraHeaders["x-api-key"] ||
      extraHeaders["x-api-key".toLowerCase()]);
  const fromExtra = typeof headerKey === "string" ? headerKey.trim() : "";
  if (fromExtra) return fromExtra;

  const fromLocals = typeof res?.locals?.weknoraApiKey === "string" ? res.locals.weknoraApiKey.trim() : "";
  if (fromLocals) return fromLocals;

  const globalKey = getGlobalWeKnoraApiKey();
  if (allowGlobalKeyFallback() && globalKey) {
    const traceId = getTraceId(res);
    const workspaceId = res?.locals?.workspaceId || null;
    const userId = res?.locals?.authUserId || null;
    console.warn("[weknora] ⚠️ using global WEKNORA_API_KEY fallback", {
      traceId: traceId || null,
      workspaceId,
      userId,
    });
    return globalKey;
  }

  return "";
}

function buildWeKnoraUrl(path, query) {
  const base = getWeKnoraBaseUrl().replace(/\/+$/, "");
  const url = new URL(`${base}/api/v1${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === "undefined" || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

function buildWeKnoraHeaders(res, extraHeaders) {
  const traceId = getTraceId(res);
  const apiKey = resolveWeKnoraApiKey(res, extraHeaders || {});
  if (!apiKey) {
    throw new HttpError({
      status: 500,
      code: "workspace_weknora_key_missing",
      message: "workspace WeKnora api key is not configured",
      hint:
        "Provision workspaces.weknora_api_key_encrypted, or set WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK=true for a temporary migration fallback",
    });
  }

  const headers = {
    "X-API-Key": apiKey,
    ...extraHeaders,
  };

  // Avoid relying on X-Tenant-ID (WeKnora isolates by API key). Only attach it when explicitly provided,
  // or as an optional fallback for legacy deployments.
  const tenantId = getWeKnoraTenantId();
  if (!("X-Tenant-ID" in headers) && !("x-tenant-id" in headers) && tenantId) {
    headers["X-Tenant-ID"] = tenantId;
  }

  if (traceId) {
    headers["x-trace-id"] = traceId;
  }

  return headers;
}

function buildWeKnoraBody(body, headers) {
  if (!body) {
    return undefined;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return body;
  }

  if (typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return body;
  }

  headers["Content-Type"] = "application/json";
  return JSON.stringify(body);
}

async function requestWeKnoraViaNodeHttp({ url, method, headers, body }) {
  const client = url.protocol === "https:" ? https : http;

  const outgoingHeaders = { ...headers };
  let bodyBuffer = null;
  if (typeof body !== "undefined") {
    bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
    const hasContentLength = Object.keys(outgoingHeaders).some(
      (key) => String(key).toLowerCase() === "content-length"
    );
    if (!hasContentLength) {
      outgoingHeaders["Content-Length"] = String(bodyBuffer.length);
    }
  }

  return await new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method,
        headers: outgoingHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const payload = Buffer.concat(chunks);
          const contentType = String(res.headers["content-type"] || "");
          let data = null;

          if (contentType.includes("application/json")) {
            try {
              data = JSON.parse(payload.toString("utf8"));
            } catch {
              data = null;
            }
          } else {
            try {
              data = payload.toString("utf8");
            } catch {
              data = null;
            }
          }

          const headersLike = {
            get(name) {
              const key = String(name || "").toLowerCase();
              const value = res.headers[key];
              if (Array.isArray(value)) return value.join(", ");
              return value ? String(value) : "";
            },
          };

          resolve({
            status: res.statusCode || 0,
            headers: headersLike,
            data,
          });
        });
      }
    );

    req.on("error", (err) => reject(err));

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

export async function requestWeKnoraJson({
  method,
  path,
  query,
  headers = {},
  body,
  res,
}) {
  const url = buildWeKnoraUrl(path, query);
  const requestHeaders = buildWeKnoraHeaders(res, { ...headers });
  const requestBody = buildWeKnoraBody(body, requestHeaders);

  // WeKnora hybrid-search uses GET with JSON body, but Node fetch forbids GET bodies.
  if (method === "GET" && typeof requestBody !== "undefined") {
    const response = await requestWeKnoraViaNodeHttp({
      url,
      method,
      headers: requestHeaders,
      body: requestBody,
    });

    if (response.status < 200 || response.status >= 300) {
      throw createWeKnoraError(response, response.data);
    }

    return unwrapWeKnoraData(response.data);
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const data = await readWeKnoraResponseBody(response);
  if (!response.ok) {
    throw createWeKnoraError(response, data);
  }

  return unwrapWeKnoraData(data);
}

export async function requestWeKnoraRawJson({
  method,
  path,
  query,
  headers = {},
  body,
  res,
}) {
  const url = buildWeKnoraUrl(path, query);
  const requestHeaders = buildWeKnoraHeaders(res, { ...headers });
  const requestBody = buildWeKnoraBody(body, requestHeaders);

  if (method === "GET" && typeof requestBody !== "undefined") {
    const response = await requestWeKnoraViaNodeHttp({
      url,
      method,
      headers: requestHeaders,
      body: requestBody,
    });

    if (response.status < 200 || response.status >= 300) {
      throw createWeKnoraError(response, response.data);
    }

    return response.data;
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const data = await readWeKnoraResponseBody(response);
  if (!response.ok) {
    throw createWeKnoraError(response, data);
  }

  return data;
}

export async function requestWeKnoraStream({
  method,
  path,
  query,
  headers = {},
  body,
  res,
}) {
  const url = buildWeKnoraUrl(path, query);
  const requestHeaders = buildWeKnoraHeaders(res, { ...headers });
  const requestBody = buildWeKnoraBody(body, requestHeaders);

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  if (!response.ok) {
    const data = await readWeKnoraResponseBody(response);
    throw createWeKnoraError(response, data);
  }

  return response;
}
