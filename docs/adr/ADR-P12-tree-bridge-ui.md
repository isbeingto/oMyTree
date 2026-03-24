# ADR-P12: Surface Tree Bridge Health During SSR

- **Date:** 2025-02-20
- **Status:** Accepted
- **Related Work:** [ADR-P11: Bus & Tree Bridge Snapshot](../ADR/adr-p11-bus-tree-bridge.md)

## Problem
Server-side rendering (SSR) of the Ecosystem page must surface the Tree Bridge status reliably. The SSR runtime executes outside the Next.js proxy stack, so it cannot depend on path rewrites that only operate during inbound HTTP handling. Without an absolute API base, SSR calls to `/metrics/tree` fail in production-like environments, leaving users without visibility into Tree Bridge health.

## Decision
1. Resolve an absolute API base using `NEXT_PUBLIC_API_BASE`, defaulting to `http://127.0.0.1:8000`, and trim any trailing slashes before issuing SSR fetches.
2. Fetch `/metrics/tree` with `cache: "no-store"` and parse the response into metric counters.
3. Validate `linzhi_tree_updates_total` as a non-negative integer and `linzhi_tree_last_trace_present` as a boolean flag (`0` or `1`). Only when both counters are present and valid do we expose a `Tree Bridge: OK` badge; otherwise the UI falls back to Pending or Error states.

## Consequences
- Tree Bridge surfacing is independent of `/metrics/ext`, ensuring the badge renders even when the external snapshot is unavailable.
- SSR fetches consistently reach the backend API regardless of deployment topology, preventing environment-specific regressions.
- The UI verifier (`verify-p12-ui.sh`) enforces correct badge rendering and response headers for `/metrics/tree`.

## Alternatives Considered
- **Rely on Next.js rewrites during SSR:** Rejected because server-side code bypasses the rewrite layer, breaking in production.
- **Proxy Tree Bridge metrics through `/metrics/ext`:** Rejected due to coupling risk—`/metrics/ext` downtime would hide Tree Bridge status.
- **Defer Tree Bridge rendering to client-side hydration:** Rejected to preserve SSR observability guarantees and to keep the badge visible without client JavaScript.
