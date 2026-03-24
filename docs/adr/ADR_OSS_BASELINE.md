# ADR: Open-Source Baseline for v0.4-lite

- **Status:** Accepted
- **Date:** 2025-10-27
- **Context:** Preparing the LinZhi platform for the v0.4-lite ecosystem rollout while preserving the v0.3.2 runtime behavior.

## Decision

1. **No external services** will be contacted in v0.4-lite mode. All integration manifests must remain empty until a future ADR revises this policy.
2. **Extensibility endpoints** are scaffolded but return placeholder content:
   - `/api/ext/manifest` responds with `{ "plugins": [], "mode": "v0.4-lite" }`.
   - `/metrics/ext` responds with a text/plain document beginning with `# linzhi v0.4-lite`.
3. **License compliance** is enforced with an allowlist limited to `MIT`, `BSD`, `Apache-2.0`, and `CC-BY`. Tooling that evaluates production dependencies must fail if additional licenses are detected.

## Consequences

- Developers can rely on stable placeholder endpoints while building the broader ecosystem without risking outbound network access.
- Runtime behavior for existing users remains unchanged; the new routes are additive and return empty data.
- The license script offers early detection for incompatible packages, supporting future ecosystem expansion under a compliant baseline.

## Follow-up

- Revisit the manifest and metrics contracts once external integrations are approved.
- Extend the license allowlist through a formal ADR when additional licenses are required.
