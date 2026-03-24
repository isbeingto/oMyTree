import { getFlag } from "./flags";

export type ObservabilityEvent = {
  route: string;
  method: string;
  status: number;
  traceId: string | null;
};

export function logEvent(event: ObservabilityEvent): void {
  if (!getFlag("observability")) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    route: event.route,
    method: event.method.toUpperCase(),
    status: event.status,
    traceId: event.traceId ?? null
  };

  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info("[observability]", payload);
  }
}
