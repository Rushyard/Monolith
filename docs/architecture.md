# Architecture — contract IDs & demo transactions

Every contract ID and demo tx hash goes here as soon as it exists (see `MONOLITH.md` §8).
Network: **Stellar testnet**.

## P2 — Confidential vault (Confidential Tokens, `stellar-confidential` 0.8.0)

| Contract | ID | Owner |
|---|---|---|
| **Monolith confidential USDC** (vanilla token, no admin / no freeze / no clawback) | `CB4T3MNGCLUNVM7A4LCMXSOFRCWA6OODNDLFNDHRUHSDAOLRLAUYJMDD` | ours — deployed via the factory, [tx](https://stellar.expert/explorer/testnet/tx/712ea387cb5c55ea5ed5cfaac2d160715d6a2bf26abe32e8456b6db6eea4064e), ledger 5380562 |
| Underlying: USDC SAC (Circle testnet `GBBD47IF…LLFLA5`) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Circle |
| UltraHonk verifier (VK registry) | `CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ` | shared, deployed by `brozorec/stellar-confidential-token-demo` |
| Auditor registry (we use `auditor_id = 0`) | `CBQZRK72Y6KJ5DR4CUHKLHMHIKBMOZNSYTWHRUQPEXA35PRCBMSPBZTW` | shared, idem |
| Token factory | `CAWPCXMW47UET5Z4N5T44PRDGAY6CZVP2O2JDEBL7YWEUHJGQ2BR4L6R` | shared, idem |

Machine-readable copy: [`deployments/testnet.json`](../deployments/testnet.json).

**Honest caveat — auditor key.** The shared auditor id 0 has a *publicly known*
secret key (published by the reference demo so anyone can play the auditor).
So today anyone can decrypt amounts on our token. Fine for a demo; a real
deployment registers its own auditor key. Planned: deploy our own verifier +
auditor if time allows.

**Why these contracts are trustworthy-ish:** the verifier's registered VKs and
the vendored SDK's VKs (`packages/ct-sdk/circuits/vks`) are byte-identical to
`OpenZeppelin/stellar-contracts` → `packages/confidential/circuits/vks`
(audited circuits). Still a developer preview — testnet only.

### Go/no-go run — 2026-10-25 11:08 UTC (`npm run ct:e2e`)

alice = `GD74JAC6YD6OFRVCNFSUVLX6UJKWSTWWO3WSZ7IROZQWLZ25F2XRZIA5`, bob = `GC6C2LR643VOW2VDXNZ2UOUHQS3H5GKMIGNGNMSNHAWQQ4WXAPBW3D34`

| Step | Public? | Tx |
|---|---|---|
| alice buys 30 USDC on the DEX | public | [`2d261505…`](https://stellar.expert/explorer/testnet/tx/2d261505700e9687554b44735fe55ddb754f52746b80afade258c2131bec6664) |
| alice `register` (proof verified on-chain) | — | [`9e3d5d25…`](https://stellar.expert/explorer/testnet/tx/9e3d5d2518b6e393b953f1fee738ca53bf1cef6bb3a56076a9b687604a41389c) |
| bob `register` | — | [`4055b807…`](https://stellar.expert/explorer/testnet/tx/4055b807422e7f9fa3297fbf11636f98bb7e7d3ae58519d6bf6338247975c3a4) |
| alice `deposit` 20 USDC | **amount public** | [`288153d4…`](https://stellar.expert/explorer/testnet/tx/288153d4c2f9ea4cca800fd28097de4401813611c49322b4da39d392cc7ce361) |
| alice `merge` | — | [`fec96e36…`](https://stellar.expert/explorer/testnet/tx/fec96e361c0c12aa7905d29e38d95ae0077708c13ce56abc12530767a4c9e11d) |
| **alice → bob `confidential_transfer` 7.5 USDC** | **amount hidden** (addresses visible) | [`59b6c363…`](https://stellar.expert/explorer/testnet/tx/59b6c3639e71e797128e4543fc090842d05de0eafeda7d5cdf0aca9d66bd16d8) |
| auditor decrypts that transfer → 7.5 USDC, alice's balance after → 12.5 | off-chain | — |
| bob `merge` | — | [`01ccedca…`](https://stellar.expert/explorer/testnet/tx/01ccedca370330729644cda0068db23a8ba0611c5288313a4ccb929a86aaf5e6) |
| bob `withdraw` 7.5 USDC | **amount public** | [`93e38994…`](https://stellar.expert/explorer/testnet/tx/93e3899473aed840a289bee2dfb790039c79a4d4d2f77009b4d0ab7f1495f0a8) |

Proof generation (Node, this machine): register 1.4–1.8 s · transfer 3.4 s ·
withdraw 2.7 s. Browser timing still to measure.

## P1 — Smart account + capped agent

_TODO (P1): smart account ID, Ed25519 verifier, spending-limit policy, context rules, tx hashes (5 ✅ / 50 ❌ #2221 / owner 50 ✅)._
