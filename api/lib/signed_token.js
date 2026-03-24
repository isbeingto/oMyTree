import crypto from "node:crypto";

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeJson(value) {
  return base64UrlEncode(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64UrlDecodeToString(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("invalid base64url");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function timingSafeEqualString(a, b) {
  const abuf = Buffer.from(String(a));
  const bbuf = Buffer.from(String(b));
  if (abuf.length !== bbuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(abuf, bbuf);
}

export function signPayload(payload, secret) {
  if (!secret) {
    throw new Error("missing secret");
  }
  const body = base64UrlEncodeJson(payload);
  const sig = base64UrlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyPayload(token, secret) {
  if (!secret) {
    throw new Error("missing secret");
  }
  if (typeof token !== "string" || !token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, sig] = parts;
  if (!body || !sig) {
    return null;
  }

  const expected = base64UrlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  if (!timingSafeEqualString(expected, sig)) {
    return null;
  }

  try {
    const raw = base64UrlDecodeToString(body);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
