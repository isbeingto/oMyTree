# ADR: Security Baseline for v0.4-lite (P8)

- **Status:** Accepted
- **Date:** 2025-10-28
- **Tags:** v0.4-lite, v0.4.1-secure

## Context

P8 hardened the LinZhi platform after the P7 double `extRouter()` registration exposed missing response headers on `/api/ext/manifest`. We needed a codified baseline that documents the constitutional security posture before expanding ecosystem integrations.

## Decision

1. Adopt the following default response headers for every API route:
   - `Content-Security-Policy: default-src 'none'`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
2. Maintain verification coverage through `codex/accept/verify_p8_security.sh`, which asserts the header baseline against `/api/ext/manifest`.

## Alternatives Considered

- **Defer headers to a future release:** Rejected because the P7 regression demonstrated immediate risk.
- **Use `default-src 'self'` CSP:** Rejected to keep the surface minimal until external assets are formally approved.
- **Expand policy set with `Permissions-Policy`:** Deferred to P9 roadmap discussions to avoid untested enforcement regressions.

## Consequences

- API middleware enforces the v0.4-lite baseline consistently, unblocking ecosystem clients tagged `v0.4.1-secure`.
- Development environments surface sandbox behavior visually, while production remains unchanged.
- Verification tooling now guards against regressions in both automation and manual hotfix workflows.

## Verification

Run `bash codex/accept/verify_p8_security.sh` after deployments or middleware changes to confirm the baseline headers remain intact.
