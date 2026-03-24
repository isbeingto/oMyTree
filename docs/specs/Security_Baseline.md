# Security Baseline v0.4-lite (P8)

- **Tags:** v0.4-lite, v0.4.1-secure
- **Root Cause Reference:** P7 double `extRouter()` registration (see `docs/logs/MANUAL_HOTFIX_LOG.md`).
- **Owner:** Codex (A-02)

## API Response Headers
- `Content-Security-Policy: default-src 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

## Sandbox Isolation
Removed: legacy `/ecosystem` sandbox verification page.

## Verification
- Run `bash codex/accept/verify_p8_security.sh` to assert the headers on `/api/ext/manifest`.
- Reference `scripts/tools/pm2_verify.sh` to confirm `linzhi-api` and `linzhi-web` remain the only PM2 processes in scope.

## Related Records
- Architectural rationale: `docs/adr/ADR_P8_Security_Baseline.md`
- Manual remediation log: `docs/logs/MANUAL_HOTFIX_LOG.md`
- State timeline: `docs/state/README_STATE.md`
