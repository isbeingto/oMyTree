# ADR-P13: Unified Metrics Endpoint and Health Probes

- **Date:** 2025-02-24
- **Status:** Accepted
- **Related Work:** [P13 verification scripts](../../codex/accept/verify_p13_backend.sh)

## Context
Platform metrics were scattered across `/metrics/ext`, `/metrics/bus`, and `/metrics/tree`, requiring Prometheus
scrapes to maintain multiple targets. Observability consumers also needed liveness and readiness probes that echoed
trace identifiers without depending on optional infrastructure such as PostgreSQL or Redis.

## Decision
1. Publish a unified `/metrics` endpoint that concatenates the existing metric sections verbatim so comment lines, counter
   names, and ordering remain stable for Prometheus scrapes.
2. Share formatting helpers that reject non-numeric counter values and normalise negative values to zero before
   rendering the Prometheus text exposition format.
3. Mount a trace-aware `/healthz` liveness probe that exposes `ok`, `pid`, and `uptime_ms`, plus a `/readyz` readiness
   probe that pings configured PostgreSQL and Redis clients while falling back to `"skip"` when they are absent.
4. Send `Cache-Control: no-store` on all metrics endpoints so scrapers and browsers always receive fresh counter data.

## Consequences
- Prometheus keeps a single scrape target whose header and comment lines match the historic endpoints, preventing rule
  churn and preserving alert labels.
- Trace-aware health probes enable HTTP clients to correlate liveness and readiness responses with upstream requests
  without relying on external network calls.
- Strict counter validation surfaces instrumentation bugs early because non-numeric samples now raise HTTP 500, which
  keeps invalid series out of long-term storage.

## Alternatives Considered
- **Expose `/metrics` as JSON:** Rejected because it would force Prometheus users to write bespoke exporters and break
  compatibility with text scrapes.
- **Proxy `/readyz` through third-party status pages:** Rejected because external network dependencies degrade the
  readiness signal when the platform is otherwise healthy.
- **Silently coerce invalid counters to zero:** Rejected to avoid masking instrumentation regressions.

## Migration Notes
- Existing `/metrics/ext`, `/metrics/bus`, and `/metrics/tree` callers remain supported and emit the same counter lines.
- Prometheus targets should prefer `/metrics` but can roll back by switching to the legacy endpoints if necessary.
- Future error-budget counters (for example, `linzhi_readyz_failures_total`) can be added by extending the shared
  formatting helpers, guaranteeing consistent validation without breaking the current output schema.
