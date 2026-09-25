# ObjectPad — contracts and operations notes

The ObjectPad application now runs from this workspace's registered apps:

- Website: `web-handlesend/` (Vite + React). Canonical origin `https://objectpad.rork.app`.
- Backend: `functions/` (Cloudflare Worker + one Durable Object, `ObjectPad`). URL `https://objectpad-backend.rork.app`.

This folder keeps only what those apps do not contain: Solidity contracts, deployment environment names and the operations/readiness notes.

## What is live

- Sign-in (Privy, shared app id `VITE_PRIVY_APP_ID`), creator profile, wallet binding by signed challenge.
- Desktop session → single-use, account-bound QR handoff (10 min) → mobile capture of 12 guided angles.
- Server-side image pipeline in the Worker: strict JPEG decode, re-encode (drops EXIF/GPS/all metadata), sharpness/exposure/duplicate checks, automated content screening (Rork Toolkit AI gateway), private storage in Durable Object SQLite.
- Meshy Multi-Image to 3D (`meshy-7.1`, four canonical views) through the Rork Toolkit proxy, polled by durable alarms; GLB + preview downloaded, validated (closed glTF subset, texture limits, bounds) and stored content-addressed.
- Object Record generation (canonical JSON, SHA-256 commitments).

## What is operator-blocked

Onchain launches need the provenance registry deployed on Robinhood Chain (4663):

1. Deploy `contracts/ObjectPadRegistry.sol` with `contracts/script/Deploy.s.sol` from a funded deployer wallet.
2. Set backend env: `OBJECTPAD_REGISTRY_ADDRESS`, `OBJECTPAD_REGISTRY_CODE_HASH` (keccak256 of runtime code), `OBJECTPAD_ATTESTOR_PRIVATE_KEY` (the attestor configured in the registry).
3. Optional: deploy the fee vault factory and set `OBJECTPAD_VAULT_FACTORY_ADDRESS` + `OBJECTPAD_VAULT_FACTORY_CODE_HASH`. Without it, the 1.5% creator fee goes directly to the creator wallet.

Pons V2 factory/router code hashes are pinned in `functions/objectpad/server/record-service.ts`.

## Environment names (no values)

See `deployment/environment.names`.
