import { inspect } from "util";

export class HttpError extends Error {
  constructor({ status = 500, code = "internal_error", message, hint = null, detail = null } = {}) {
    super(message || code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.detail = detail;
    Error.captureStackTrace?.(this, HttpError);
  }
}

export function envelope({ error, code, hint = null, detail = null }) {
  return {
    error,
    code,
    hint,
    detail,
  };
}

export function respondWithError(res, errorLike = {}) {
  const traceId = res.locals?.traceId;
  const status = errorLike.status ?? 500;
  const code = errorLike.code ?? "internal_error";
  const message = errorLike.message ?? errorLike.error ?? code;
  const hint = typeof errorLike.hint === "undefined" ? null : errorLike.hint;
  const detail = typeof errorLike.detail === "undefined" ? null : normalizeDetail(errorLike.detail);

  if (traceId) {
    res.setHeader("x-trace-id", traceId);
  }

  res.status(status).json(
    envelope({
      error: message,
      code,
      hint,
      detail,
    })
  );
}

function normalizeDetail(detail) {
  if (detail === null || typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.parse(JSON.stringify(detail));
  } catch (err) {
    return inspect(detail);
  }
}

export function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      if (err instanceof HttpError) {
        respondWithError(res, err);
        return;
      }

      respondWithError(res, {
        status: 500,
        code: "internal_error",
        message: "internal server error",
        detail: err?.message,
      });
    });
  };
}
