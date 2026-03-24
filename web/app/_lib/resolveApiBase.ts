import { getBackendUrl } from "@/lib/base-url";

export function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE?.trim();
  const base = raw && raw.length > 0 ? raw : getBackendUrl();
  const normalized = base.startsWith("http://") || base.startsWith("https://") ? base : `http://${base}`;
  return normalized.replace(/\/+$/, "");
}

export default resolveApiBase;
