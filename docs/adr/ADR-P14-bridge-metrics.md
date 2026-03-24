# ADR P14-A — Bridge Metrics Enrichment

- **Status:** Accepted (2025-03-03)
- **Deciders:** Codex Executor (A-02)
- **Context:** Bridge observability from P11–P13 proved the tree engine receives events, yet downstream consumers lack normalized counters for auditing and Prometheus scraping.

## Problem

Operations needs monotonic, integer-only counters describing bridge behaviour (forwarded events, errors, timestamps, trace visibility) without breaking the previously accepted metrics contracts (P6–P13). Existing endpoints expose minimal state, leaving gaps for on-call diagnostics and automated verifiers.

## Decision

- Extend the in-memory tree bridge to track:
  - `forwarded_total`: non-decreasing safe integer mirroring handled events.
  - `errors_total`: safe integer incremented on malformed payloads or runtime exceptions.
  - `last_event_ts`: epoch-millisecond safe integer (0 when never triggered).
  - `last_trace_id`: trimmed string for the latest handled trace (null if absent).
- Sanitize all bridge counters before emission to guarantee non-negative safe integers regardless of internal mutations.
- Surface the counters via two public surfaces:
  - `/metrics` gains a `## bridge` section with four Prometheus-compatible gauges (`linzhi_bridge_*`).
  - `/api/integration/tree/stats` includes `{forwarded_total, error_total, last_event_ts, last_trace_id}` alongside existing fields.
- Ship `codex/accept/verify_p14a_backend.sh` to enforce HTTP headers, counter integrity, cross-endpoint consistency, and monotonic increments after emitting a `branch.confirm` event.

## Rationale

- **Observability completeness:** Downstream scrapers and UI clients now consume the same sanitized counters, avoiding duplicate parsing logic.
- **Safety:** Clamping to safe integers prevents overflows or NaN leakage in Prometheus and JSON consumers.
- **Compatibility:** Existing tree metrics (`linzhi_tree_*`) remain untouched, so P11–P13 verifiers continue to pass.
- **Rollback:** The feature remains in-memory; reverting requires removing the bridge additions and verification script without database migrations.

## Consequences

- Additional logging occurs if bridge handlers throw; this mirrors bus subscriber behaviour and aids debugging.
- Future UI work (P14-B/C) can consume the enriched stats without backend changes.
- Operators should adopt the new verifier in CI to guard against regressions.

## Verification

- `codex/accept/verify_p14a_backend.sh`
- Existing P12/P13 backend verifiers.

## References

- [ADR P11 — Bridge Event Bus to Tree Engine](../ADR/adr-p11-bus-tree-bridge.md)
- [ADR P12 — Tree Bridge Badge](./ADR-P12-tree-bridge-ui.md)
- [ADR P13 — Unified Metrics & Health Probes](./ADR-P13-unified-metrics-health.md)
