# Readiness and acceptance evidence

Status: **INDEPENDENT SOURCE PROTOTYPE — NOT DEPLOYED — LIVE CAPTURE/LAUNCH BLOCKED**.

## What has been validated locally

- Strict TypeScript validation of frontend, shared models and backend source passed.
- Vite production bundling passed using the existing, read-only local toolchain. Third-party Privy pure-annotation warnings and stale Browserslist data are non-fatal; independent dependency installation is still required.
- 117 automated Vitest checks passed: canonical hashes, malicious URLs/names, QR ownership/replay/expiry/rotation, session idempotency, device recovery, moderation invalidation, image/GLB boundaries, transaction ambiguity/finality, immutable SQL commitments, publication/reorg/moderation regressions, service gates, JWT claims/signatures and refresh throttling, plus economy policy parity with contract source, cross-archive duplicate frame/near-duplicate/model/manifest rejection, optional link-step publication rules, trending scoring/decay/visibility and fail-closed Artifact metadata.
- Registry, Forge (crafting), fee vault/factory, burn engine and test contracts compiled with Solidity 0.8.30, optimizer/via-IR and Paris EVM.
- 35 Foundry tests passed locally (Foundry stable). Registry: replay, bound creator/name, expiry, guardian pause, append-only revisions, single-use model and capture-manifest hashes, creator-only name-matched token linking, one token per record. Economy: crafting locks and mints, published multipliers, $OBJECTPAD burn to the dead address, unlinked/duplicate/undersized/fee-on-transfer recipes rejected, lock-gated dissolve returns every coin, owner-only claim/dissolve, pro-rata weighted rewards, no retroactive rewards, rewards follow transfer, predictable CREATE2 vault addresses, 50/25/25 harvest split, burn fallback when no Artifact holds a coin, pull fallback for rejecting creators, keeper-only capped burns with graduation guard and curve/token binding. This is a controlled local EVM with mock Pons contracts, not Robinhood Chain deployment or external audit.
- 76 Playwright assertions passed against the locally served production bundle: the hero pitch renders before WebGL, the 3D scan hero auto-advances through its phases, desktop/mobile routes (including Craft, Inventory, Burn and Earnings) have no overflow, the not-deployed economy screens show no fabricated figures, mobile navigation works, reduced motion is respected and there are no uncaught page errors. Screenshots of every hero phase and the new screens were inspected. This does not test real camera capture, sign-in, a provider job or wallet transactions.
- Existing web, backend, Android, iOS source and root deployment configuration have no delivery diff. Generated auto-bundled iOS additions were removed. No live parent backend was probed for data because GET paths can perform financial work.

## Rork publishing limitation

`runChecks({ appPath: 'objectpad' })` returned no registered app. The independent installer, icon and OG generators rejected this path for the same reason. The workspace only supports one app per framework and one Worker bundle. No replacement deployment, root manifest edit, website rename or redirection was attempted.

The new directory is portable source, not an activated preview target. The existing CasePad preview remains unchanged. There is no honest ObjectPad production URL to provide.

## Remaining implementation and integration blockers

1. Provision an independent ObjectPad workspace and materialize/install/lock its package manifest.
2. Implement and security-test the private MEDIA image decoder, content scanner, mesh optimizer, texture validator and renderer. The calling boundary is present, but the backing service is absent. Missing credentials alone do not complete this work.
3. Provision separate private buckets/DO, auth application, allowed origins and provider credentials. Test real session renewal, mobile auth handoff, media delivery and production CSP/CORS.
4. Complete retention/deletion/orphan cleanup, bounded workload scheduling, operator inspection/recovery workflows and production monitoring. Current global-DO serialization is conservative but not a scaled job queue.
5. Curve trading, charts, inventory and earnings read live chain state and use wallet-signed transactions, but have not been exercised against a real ObjectPad launch. Graduated-coin (post-curve) trading is not routed. Full wallet indexing beyond the newest 25 archive records is outstanding.
6. Complete persistent offline capture, authenticated-session upload recovery ergonomics, hardware/browser camera acceptance and accessibility auditing on real devices.
7. Complete the thesis revision index/UI, while retaining the registry's append-only correction model.
8. Complete and approve primary logo/icon, light/dark exported wordmarks, X banner and OG/share image in the independent target. Delivered social backgrounds are templates, not finished approved cards.
9. Obtain an independent contract/security review of the registry, Forge, fee vaults and burn engine. Fork-test the vault against the deployed Pons fee escrow (contract recipient, `claim()` payout) before relying on it. Launch the $OBJECTPAD token on Pons (explicit operator action and funds), then run `contracts/script/Deploy.s.sol` with explicit authorization, verify sources, and set code pins, `VITE_OBJECTPAD_*` addresses and fee policy approval from evidence.
11. The burn keeper is an operator key; a scheduler that calls `execute` with a fresh quoted minimum output is not yet implemented.
10. Perform the real capture → provider → artifacts → registry → Pons → public exhibit run using explicit wallet approvals. Store only verifiable acceptance facts in the supplied null-valued evidence template.

## Real acceptance checklist — none completed in this delivery

- [ ] Independent HTTPS frontend and API are reachable at their own domain.
- [ ] Fresh account and profile are established through real auth.
- [ ] A physical object is captured using a real phone; twelve distinct views pass server validation.
- [ ] Replay, expired QR, wrong account, wrong device, cancellation and offline retry behave correctly on actual browsers.
- [ ] Exactly four identified canonical views reach a real Meshy task; provider task ID and cost are recorded privately.
- [ ] Original/optimized GLB, rendered thumbnail and turntable are validated and re-read from durable storage with matching hashes.
- [ ] Creator review and human moderation approve the final capture-manifest hash.
- [ ] Canonical metadata bytes and hash are fixed before a signature is requested.
- [ ] The reviewed registry deployment is verified on chain 4663.
- [ ] User explicitly approves registration; the expected event/name/hashes/creator are decoded at the required canonical depth.
- [ ] User separately approves a simulated Pons launch with exact name and canonical website reference.
- [ ] Receipt and token/curve identity checks succeed; both canonical receipts remain reconciled.
- [ ] The public exhibit appears only after both proofs; raw captures stay private.
- [ ] Operator restrictions remain in effect after reconciliation; reorg fixtures and real RPC outage behavior are checked.
- [ ] No misleading ownership, authenticity, uniqueness, token-value or network-endorsement claims appear.

No fake task IDs, contract addresses, model hashes, transactions, captured objects or completion evidence were inserted into public data to satisfy this checklist.
