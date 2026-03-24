# ADR P11 — Bridge Event Bus to Tree Engine

- **Status**: Accepted (2025-11-01)
- **Deciders**: Codex Executor (A-02)
- **Context**: Constitution v0.4-lite governance, P6–P10 already deployed

## Problem

Tree-related workflows emit events (`branch.confirm`, `tree.update`) on the in-memory bus introduced in P9. Operations needs basic telemetry that proves the Tree Engine still reacts to those events without forcing persistent storage or UI work. P6–P10 guarantees (headers, security posture, and observability surface) must remain untouched.

## Decision

Introduce an in-memory Tree Bridge that subscribes to the existing Event Bus and maintains lightweight counters:

- Track total handled events, last update timestamp, last trace identifier, and last topic.
- Accept topics case-insensitively, but never mutate payloads.
- Expose state through two additive read-only endpoints: Prometheus metrics (`/metrics/tree`) and integration stats JSON (`/api/integration/tree/stats`).
- Keep all changes in-memory to respect rollback requirements and avoid schema drift.

## Rationale

- **Rollback safety**: By keeping the bridge in-process and stateful only in memory, reverting the feature is as simple as removing the module—no migrations or data cleanup required.
- **Topic focus**: `branch.confirm` and `tree.update` represent the Tree Engine lifecycle touchpoints. Observing only these topics limits noise while proving the end-to-end path.
- **Observability alignment**: Prometheus metrics match the Constitution v0.4-lite contract. The JSON stats route mirrors existing integration diagnostics, ensuring operators can debug without scraping text metrics.
- **Security continuity**: The endpoints reuse the global security headers middleware; no changes to P8–P10 protections.

## Consequences

- Metrics and stats can catch regressions where the bridge stops receiving events (e.g., counter stalls, trace absence).
- The bridge adds negligible CPU overhead because the bus delivers events synchronously with guarded subscribers.
- Future UI tasks can consume `/api/integration/tree/stats` without requiring backend changes.

## Verification

- Automated verifier: [`codex/accept/verify_p11_backend.sh`](../../codex/accept/verify_p11_backend.sh) asserts the emit → bridge → metrics/stat flow, including headers and trace propagation.

## References

- Constitution v0.4-lite observability clause — `/metrics/*` endpoints must be text/plain, no-store.
- P9 Event Bus ADR — ensured emitters remain non-blocking and trace-aware.
