# Source reuse and isolation audit

Audit date: 2026-09-22. Parent source baseline: `33412926bf447b0a544917ea5ff3f195c5acb612`.

## Scope

Read the current web authentication, wallet, launch, protocol, URL guard, API, feed, chart, portfolio, chat, routing, testing and deployment sources. Supporting review read every line of the 5,157-line current backend handler plus its authentication, treasury, custody, market, chain and V4 modules. Native clients were reviewed for DTO and deep-link assumptions. No source comments were treated as independent proof of live protocol safety.

## Reused or adapted

- `web-handlesend/src/lib/utils.ts`: class-name composition pattern.
- `web-handlesend/src/components/ui/button.tsx`: Radix/CVA button foundation, restyled for ObjectPad.
- `web-handlesend/src/lib/safe-url.ts`: URL-guard concepts, tightened to HTTPS without credentials or control characters.
- `web-handlesend/src/lib/pons.ts`: Robinhood Chain definition, deployment addresses, launch selector/struct, live factory terms and ERC-20/curve ABI shapes. No inherited floating-point quote arithmetic.
- `web-handlesend/src/lib/wallet.tsx`: selected Privy wallet → Viem signing pattern, with independent app ID and no automatic embedded-wallet provisioning.
- `functions/privy.ts`: ES256/JWKS verification approach, hardened with application-scoped caches, strict key matching, expiration/nbf checks, token bounds and refresh throttling.
- Backend patterns: string/BigInt amounts, transaction/log uniqueness, canonical receipt checks, explicit operation state and synchronous durable mutations.

## Not imported

The current backend handler schedules financial work even on GET requests. It was not used as an ObjectPad route, dependency or API target. No custody, case/reward system, treasury allocator, buyback, X gift, legacy registry or automatic fund movement was copied.

The source application has inconsistent curve-reserve formulas, incomplete transaction recovery, incomplete market history, and fee-routing assumptions specific to its own treasury. These are not inherited as financial guarantees.

## Protocol evidence and remaining uncertainty

The source declared four indexed fields on a non-anonymous `TokenLaunched` event, which is not valid EVM event layout. Read-only audit evidence found four total topics, meaning signature plus three indexed addresses. ObjectPad's ABI uses three indexed addresses and leaves the remaining address in event data. The last two words are intentionally named `value0`/`value1`; their meanings are not asserted as supply.

A historical launch receipt was checked during audit, but no ObjectPad launch was performed. Contract implementation source, proxy/admin permissions, immutability, event semantics across deployments and post-graduation execution still require authoritative review. Runtime-code pins alone do not prove a proxy's implementation or governance cannot change.

ObjectPad preserves config 0, native quote, no protocol buyback, 150-bps creator tax and the inherited protocol interface. A separately configured fee recipient and explicit policy approval are required. It does not claim the parent application's offchain treasury split applies.

## New trust boundaries

- New `ObjectPad` Durable Object, instance `objectpad-production-v1`, `op_*` tables.
- Distinct `OBJECTPAD_*` server variables and `VITE_OBJECTPAD_*` client variables.
- New private capture/artifact buckets and immutable content keys under `objectpad/v1/`.
- Public pseudonymous creator IDs are hashes, not the authentication provider's raw account subject.
- No private image is served through an unauthenticated capture route.
- Paid-provider submission ambiguity requires review, never a silent second task.
- Publication requires both transaction kinds confirmed. Operator restrictions survive receipt rechecks.
- Public record commitments cannot be updated or deleted through normal SQL mutations.

## Security review corrections made

- Prevented a surviving launch receipt from republishing a record whose provenance receipt was invalidated.
- Separated persistent moderation state from chain status so polling cannot undo a hide.
- Bound human approval to the capture manifest and invalidated it on retakes/uploads.
- Added bounded/coalesced JWKS refresh for unknown-key attacks.
- Clamped QR expiration to capture-session expiry and rejected expired-session claims.
- Added same-account device recovery that revokes previous device secrets and unused tickets.
- Allowed re-simulation of an expired, never-armed prepared operation; uncertain wallet submissions remain locked.

These changes have regression tests. They are not an independent security audit or a production certification.
