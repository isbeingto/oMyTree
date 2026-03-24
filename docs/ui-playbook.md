# UI Playbook – Ecosystem Bridge Panel

## Overview
The Ecosystem page exposes a **Bridge** panel that reflects the health of the
tree bridge metrics emitted by the backend. The server component fetches
`/metrics` via an absolute URL derived from `NEXT_PUBLIC_API_BASE`
(defaulting to `http://127.0.0.1:8000`) with trailing slashes removed before
issuing the request. This keeps SSR compatible with production deployments
that disable Next.js rewrites.

## Status Evaluation
The Bridge badge evaluates the following counters from the unified metrics
payload:

- `linzhi_bridge_events_forwarded_total`
- `linzhi_bridge_errors_total`
- `linzhi_bridge_last_event_ts`
- `linzhi_bridge_last_trace_present`

The panel renders according to strict validation rules:

- **Bridge: OK** – every counter is present, is a safe integer, and
  `last_trace_present` is either `0` or `1`.
- **Bridge: Pending** – one or more counters are missing, or the unified
  metrics request fails.
- **Bridge: Error** – counters are present but violate the integer/trace
  invariants. The panel also surfaces the specific failure cause under the
  badge for quick inspection.

These checks are isolated from the legacy `/metrics/ext` request; an outage in
the ext snapshot does not affect Bridge status rendering.

## Verification Fixture
For acceptance testing a query-string fixture is available:

```
/ecosystem?fixture=bridge-invalid
```

When supplied, SSR forces the Bridge panel into the **Error** state and emits a
`Bridge metrics fixture forced invalid` note while leaving other panels
untouched. This allows verifiers to assert degraded behaviour without mutating
backend state. The fixture is ignored in normal navigation.
