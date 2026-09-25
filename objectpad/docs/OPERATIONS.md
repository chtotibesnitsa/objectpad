# Operator runbook

## Provision separately

1. Create a separate ObjectPad workspace/website and Worker target. Do not rename or replace the parent application's targets.
2. Materialize the package template using that workspace's supported app setup, install with Bun, generate a fresh lockfile and run strict validation.
3. Provision the new Worker, its `ObjectPad` SQLite Durable Object and two private-by-default R2 buckets from `deployment/wrangler.jsonc`. Never reuse an existing application's binding or bucket.
4. Deploy the mandatory private decoder/scanner/renderer service and bind it as `OBJECTPAD_MEDIA`. Its required HTTP interface is described below. The interface is implemented in the ObjectPad caller; the backing service is outstanding.
5. Configure a distinct Privy application, allowed website origins and any social callbacks. No fallback app ID exists. The deployment CSP must be updated with the exact independent API and required Privy login origins before auth acceptance testing; avoid wildcard script/connect permissions.
6. Set only the variable names in `deployment/environment.names`, through secret management—not files or chat. Private variables must never receive a `VITE_` prefix.
7. Deploy the static build to its new HTTPS origin. Set website and API origins exactly, without trailing slash. Configure same-site custom domains if desired; verify CORS and artifact responses.
8. Leave capture and launch switches false while performing the remaining acceptance checks.

## Private MEDIA contract — not yet implemented

The Worker invokes only the service binding. End-user URLs and file paths are never passed as a destination.

### `POST /normalize`

Input: bounded PNG/JPEG bytes, at most 8 MiB. Decode fully in an isolated, resource-limited process. Reject malformed containers, decompression bombs, animated/multiframe payloads, dimensions below 1024 on either side, and over 24 million pixels. Correct orientation, remove EXIF/GPS/comment metadata and normalize to JPEG. Do not return the original bytes with merely a changed MIME type.

Before acceptance, inspect prohibited/sensitive content, object centering and background suitability. Automated classifiers are imperfect; human moderation is also required before record creation. Do not claim legal rights have been verified.

Successful response: normalized `image/jpeg` body; `X-Image-Width`, `X-Image-Height`, `X-Metadata-Stripped: true`, `X-Content-Scan: accepted`, finite `X-Blur` and `X-Exposure`, 64-bit binary `X-Perceptual-Hash`, `X-Object-Centered: true`, and `X-Background-Consistent: true`. Return 422 for rejection or 503 for unavailable inspection. Never set acceptance headers when a decoder/scanner step did not run.

### `POST /model`

Input: bounded static GLB. The Worker already preflights the closed subset, but the service must independently parse/decode geometry and all textures, check index/attribute bounds, finite transforms, bounded world scale and resource budgets, then render the actual asset in an isolated renderer with outbound network blocked. Reject external references, hidden executable extensions, paths/URIs, excess geometry, oversized textures and failed renders.

Output: JSON with base64 `optimized`, `thumbnail` (JPEG), `turntable` (MP4); finite `bounds.min` and `bounds.max`; `rendered: true`; `texturesChecked: true`; truthful `optimizedBy`. The optimized GLB must still satisfy the Worker's closed-subset structural checks. Current limits: original/optimized GLB ≤24 MiB, 100,000 triangles, 16 textures; turntable ≤8 MiB. Add resource exhaustion, malicious-container and renderer-crash tests before deployment.

## Registry deployment

Source: `contracts/ObjectPadRegistry.sol`. Solidity 0.8.30, optimizer 200 runs, via-IR, Paris EVM. The contract and controlled tests can compile without deploying. Run the Foundry suite before release.

The attestor is an immutable dedicated signing identity used only to authorize reviewed registrations. The guardian can pause new registrations, not edit existing records. Keep neither key in the frontend. A compromised immutable attestor requires a new reviewed registry deployment, not an undisclosed upgrade.

A separately authorized operator must deploy with the correct attestor and guardian addresses and confirm actual chain ID 4663. Record the deployment receipt, runtime code hash, constructor arguments and source verification. No deployment was performed here. `contracts/script/Deploy.s.sol` requires explicit `OBJECTPAD_DEPLOY_AUTHORIZED` consent, correct chain, and independent attestor/guardian addresses. It uses the operator's explicitly selected Foundry wallet rather than a bundled private key. Run simulation first; only an operator-authorized `--broadcast` may send. Populate both backend and frontend registry settings only from actual deployment evidence.

Before enabling Pons launches, review authoritative factory/router sources and metadata mutability; confirm exact fee recipient/policy, economics, event layout, reciprocal token/curve identity and proxy/implementation controls. Populate code pins from the reviewed deployment. Do not treat a matching proxy runtime hash as proof of an immutable implementation.

## Ambiguous operations

- Meshy create times out after a potentially accepted POST: job enters `review_required`, capture enters `blocked`. Do not automatically retry a paid creation. Locate the provider task in the provider's authorized dashboard; a reviewed recovery procedure must link it before continuing.
- Wallet opens but returns no hash: operation remains `awaiting_wallet`. Do not release it for a new send solely because the UI timed out or a user says it failed. Inspect wallet nonce and transaction history. Automated nonce-based recovery is not implemented yet.
- A returned hash can be resubmitted for reconciliation without generating another transaction.
- A missing/reorged previously seen receipt locks publication in `reorg_review`. Manual, audited recovery is still required; sticky review is intentionally safer than guessing.
- Retakes invalidate human capture approval. Approval applies only after reconstruction to the final manifest hash.
- Same-account device recovery invalidates the old device secret and unused upload tickets. It does not revive cancelled or expired sessions.
- Provider DELETE is not represented as cancellation. Stopping local polling does not guarantee provider charges or processing stopped.

## Retention, takedown and outages

Raw capture deletion/retention and orphan cleanup are not automated in this delivery. Establish and implement a retention schedule before accepting real imagery. Avoid recording URLs, auth subjects, raw images, tokens or signatures in logs. Current metrics are counters only.

An operator hide restricts future app/API serving and persists through reconciliation. Immutable blockchain commitments and already downloaded/cached media cannot be erased. Content hashes guarantee byte identity, not permanent availability. Configure tested backups, restore procedures and retention/legal-hold rules independently.

Use readiness for configuration diagnostics only. It always reports `productionAccepted: false` in this prototype; no configuration flag alone substitutes for the evidence checklist.
