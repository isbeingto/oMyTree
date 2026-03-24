import { HttpError } from "../../lib/errors.js";

export function unwrapWeKnoraData(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

export async function readWeKnoraResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

export function createWeKnoraError(response, data) {
  let message = "weknora_request_failed";
  let code = "weknora_request_failed";
  let detail = null;

  if (data && typeof data === "object") {
    const nestedMessage =
      (typeof data?.error?.message === "string" && data.error.message) ||
      (typeof data?.error === "string" && data.error) ||
      null;
    const nestedCode =
      (typeof data?.error?.code === "number" && data.error.code) ||
      (typeof data?.error?.code === "string" && data.error.code) ||
      null;

    message = (typeof data.message === "string" && data.message) || nestedMessage || message;
    code =
      (typeof data.code === "string" && data.code) ||
      (typeof data.code === "number" && String(data.code)) ||
      (nestedCode !== null ? String(nestedCode) : code);
    detail = data.details || data.detail || data;
  } else if (typeof data === "string" && data.trim()) {
    message = data.trim().slice(0, 500);
    detail = data;
  }

  return new HttpError({
    status: response.status,
    code,
    message,
    detail,
  });
}
