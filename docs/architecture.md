# Architecture

> Chaque contract ID et chaque tx hash de démo est ajouté ici dès qu'il existe (testnet).

## Démo live

**https://monolith-nine-rosy.vercel.app** — public (pas de Deployment Protection), testnet.

| | |
|---|---|
| Pages | [`/`](https://monolith-nine-rosy.vercel.app/) · [`/vault`](https://monolith-nine-rosy.vercel.app/vault) · [`/auditor`](https://monolith-nine-rosy.vercel.app/auditor) · [`/agent`](https://monolith-nine-rosy.vercel.app/agent) |
| Hébergement | Vercel, projet `monolith` (Root Directory `app`, Next.js), lié à `Rushyard/Monolith` |
| Code déployé | branche `claude/awesome-mccarthy-y5fgfb` (déploiement de production) |
| Isolation cross-origin | `COOP: same-origin` + `COEP: credentialless` sur toutes les routes → `window.crossOriginIsolated === true` (requis par bb.js) ; `/vendor/bb/index.js` servi en 200 |

Vérifié avec Playwright (Chromium) le 2026-10-25 : les 4 pages répondent 200, aucune erreur JS,
et `/auditor` lit la chaîne : le transfert confidentiel `1cfe3715…` est « chiffré » ; la clé publique de la démo de référence est refusée (montant illisible) ; notre clé d'audit (collée, vérifiée on-chain) révèle **7.50 USDC**.
La vue auditeur lit les événements via le RPC Soroban, dont la fenêtre de rétention est d'environ 7 jours :
au-delà, il faudra rejouer `npm run ct:e2e` pour avoir des transactions récentes à montrer.

## Schéma

```
┌──────────────────────── Next.js (Vercel) ────────────────────────┐
│  Onglet COFFRE (client)            │  Onglet AGENT (chat)         │
│  - register / deposit / merge      │  - message → /api/intent     │
│  - confidential transfer           │  - carte d'approbation owner │
│  - vue auditeur (disclosure)       │  - raisonnement + historique │
├────────────────────────────────────┴─────────────────────────────┤
│  API routes Next.js (serveur) : /api/intent, /api/agent/*         │
│  LLM → { action, amount, to }  →  Executor (clé agent, server-only)│
└───────────────┬──────────────────────────────────┬────────────────┘
     Confidential Token (OZ)            Smart Account (OZ)
     + vérificateur UltraHonk           ├─ Règle A : owner (Delegated, Freighter)
                                        └─ Règle B : CallContract(USDC SAC)
                                            signer = agent (Ed25519), policy = spending_limit
```

Le pré-check côté serveur sert à l'affichage. La vraie barrière est la policy on-chain.

## Contract IDs (testnet)

| Contrat | ID |
|---|---|
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Smart account | |
| Vérificateur Ed25519 | |
| Spending-limit policy | |
| Confidential Token (USDC) | `CAYYT5UWB22VLV4Z7DU7DN7V6XFPGIDP5ZD3HV4S6HVQMCGLI5CFLERJ` — détails P2 ci-dessous |
| Registre d'auditeurs Monolith | `CB5YIDSUCNESNOJK2UFFJA6E3O5BGAPYEQ6F353WGNM4UBGGX3H45IGQ` (auditeur #1) |

## Tx hashes de démo (testnet)

| Scénario | Hash |
|---|---|
| Agent → 5 USDC (succès) | |
| Agent → 50 USDC (échec #2221) | |
| Owner → 50 USDC (approbation) | |
| Transfert confidentiel (7.5 USDC, montant caché, lisible par notre seul auditeur) | [`1cfe3715…`](https://stellar.expert/explorer/testnet/tx/1cfe37158b1fa2fd25e84468c6d9949bfc69c4710d08bc547630631f007095ff) |

## P2 — Confidential vault (Confidential Tokens, `stellar-confidential` 0.8.0)

| Contract | ID | Owner |
|---|---|---|
| **Monolith confidential USDC v2** (vanilla token, no admin / no freeze / no clawback) | `CAYYT5UWB22VLV4Z7DU7DN7V6XFPGIDP5ZD3HV4S6HVQMCGLI5CFLERJ` | ours — factory `deploy_vanilla_token` with **our** registry, [tx](https://stellar.expert/explorer/testnet/tx/8694ce7a180a59cc6ccc34c10eaf674be89ddbd861b73d96b6089526a13dc6d7), ledger 5382322 |
| **Monolith auditor registry** (OZ `confidential_auditor_example` wasm `b8b24767…`) | `CB5YIDSUCNESNOJK2UFFJA6E3O5BGAPYEQ6F353WGNM4UBGGX3H45IGQ` | ours — admin/manager `GAZ2FGMN…ZQE4A4EM`, [create](https://stellar.expert/explorer/testnet/tx/ee207713564ab7731ad3afd56707be1b765704c1b9d0caa53135365d7644b491), [register_key(1)](https://stellar.expert/explorer/testnet/tx/78c52ed8b22bc1768f6bfbb84d020d2974fc3a2f27ef67270ebf905ae725536e) |
| Underlying: USDC SAC (Circle testnet `GBBD47IF…LLFLA5`) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Circle |
| UltraHonk verifier (VK registry) | `CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ` | shared, deployed by `brozorec/stellar-confidential-token-demo` |
| Token factory | `CAWPCXMW47UET5Z4N5T44PRDGAY6CZVP2O2JDEBL7YWEUHJGQ2BR4L6R` | shared, idem |
| *v1 token (history, shared public auditor 0)* | `CB4T3MNGCLUNVM7A4LCMXSOFRCWA6OODNDLFNDHRUHSDAOLRLAUYJMDD` | ours, [tx](https://stellar.expert/explorer/testnet/tx/712ea387cb5c55ea5ed5cfaac2d160715d6a2bf26abe32e8456b6db6eea4064e) — not used by the app anymore |
| *Shared auditor registry (v1)* | `CBQZRK72Y6KJ5DR4CUHKLHMHIKBMOZNSYTWHRUQPEXA35PRCBMSPBZTW` | shared; its auditor 0 secret is public |

Machine-readable: [`deployments/testnet.json`](../deployments/testnet.json) (v2),
[`deployments/auditor.json`](../deployments/auditor.json) (registry + public key),
[`deployments/testnet-v1-shared-auditor.json`](../deployments/testnet-v1-shared-auditor.json) (v1).

**Our auditor (v2).** v1 used the shared registry's auditor id 0, whose secret
the reference demo publishes, so anyone could decrypt v1 amounts. Only the
registry's admin can add keys, so `npm run ct:auditor`
([`scripts/deploy-auditor.ts`](../scripts/deploy-auditor.ts)):
1. checks the key convention on the shared registry (`K_aud = k·H`) before deploying anything;
2. generates a Grumpkin auditor secret (kept in `.keys/testnet.json`, git-ignored, never in the app);
3. creates our registry instance from OpenZeppelin's registry wasm already installed on testnet (`createCustomContract`, constructor `(admin, manager)`), no compilation, no new contract code;
4. `register_key(1, k·H)` and reads it back;
5. deploys a vanilla confidential USDC through the shared factory with our registry.

Accounts pick `auditor_id = 1` at `register`. The auditor page checks a pasted
key with `k·H == get_key(1)` before decrypting.

**Why these contracts are trustworthy-ish:** the verifier's registered VKs and
the vendored SDK's VKs (`packages/ct-sdk/circuits/vks`) are byte-identical to
`OpenZeppelin/stellar-contracts` → `packages/confidential/circuits/vks`
(audited circuits). Still a developer preview — testnet only.

### v2 run — our auditor, 2026-10-25 13:34 UTC (`npm run ct:e2e`)

Token `CAYYT5UW…LERJ`. alice = `GB7OT6KYOLWATWCNEPDTZZIP6CHI3L4X3YXH6BX7IVCPY2ENMPKIIKXP`, bob = `GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV`

| Step | Public? | Tx |
|---|---|---|
| alice buys 30 USDC on the DEX | public | [`31ff38e8…`](https://stellar.expert/explorer/testnet/tx/31ff38e81fd3068661e4a13a721913697048d01918f6b8752003e7bf2b36a01c) |
| alice / bob `register` (auditor #1) | — | [`0ca7d9fd…`](https://stellar.expert/explorer/testnet/tx/0ca7d9fd38e3b6815b96de8964183b498f228d4bb6384736e3d9e49c725544c5) / [`7c7d8505…`](https://stellar.expert/explorer/testnet/tx/7c7d85059727381454b6d14348352bd9a7c3b9522c0f0f1023b85f0dad81e8cd) |
| alice `deposit` 20 USDC | **amount public** | [`3f2c290d…`](https://stellar.expert/explorer/testnet/tx/3f2c290d48511402c60e089c6517ee86d4c8a4797b097c276df95cf8b32ca0c7) |
| alice `merge` | — | [`da659c09…`](https://stellar.expert/explorer/testnet/tx/da659c0990968c4c172b62a453dcec3fdf04d984500b31dd69743680c97a42e8) |
| **alice → bob `confidential_transfer` 7.5 USDC** | **amount hidden** | [`1cfe3715…`](https://stellar.expert/explorer/testnet/tx/1cfe37158b1fa2fd25e84468c6d9949bfc69c4710d08bc547630631f007095ff) |
| **our auditor** decrypts it → 7.5 USDC, alice's balance after → 12.5 · **shared public key #0 → unreadable** | off-chain | — |
| bob `merge` / `withdraw` 7.5 USDC | **withdraw amount public** | [`fa5b5dad…`](https://stellar.expert/explorer/testnet/tx/fa5b5dad661ef32cf6bf6a335b54b3b22914950df0664d32b49fa123d6c1defb) / [`ec88598c…`](https://stellar.expert/explorer/testnet/tx/ec88598c0bdbca215539e3136ef035008afc1425c8494611fdaa4ac4f3211a33) |

Proofs (Node): register 1.5–3.7 s · transfer 4.4 s · withdraw 3.3 s.

### v1 go/no-go run — 2026-10-25 11:08 UTC (shared auditor, token `CB4T3M…`)

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
withdraw 2.7 s.

### v1 browser run — live app + Freighter (Firefox), 2026-10-25 ~12:55 UTC

Manual test on https://monolith-nine-rosy.vercel.app/vault, proofs generated in the browser (bb.js).
Account `GD46SGQRPKDSWAS665C7OWIPY6TBWRMSSNZLAHZJDFBDAMPBRCYLRLAB`, recipient `GCXA…FI3H`.

| Step | Public? | Tx |
|---|---|---|
| `register` (< 10 s incl. Freighter signature) | — | `795f7013…82fc06f4` |
| `deposit` 10 USDC | **amount public** | [`dd322e73…`](https://stellar.expert/explorer/testnet/tx/dd322e737ab01344e90bd9c8234efa8c66da9b57f9af9c149ee7b4fdc0f62c5a) |
| `merge` | — | `0f77b2fd…d86dca2c` |
| **`confidential_transfer` 2.5 USDC** (< 20 s incl. signature) | **amount hidden** | [`cd205da4…`](https://stellar.expert/explorer/testnet/tx/cd205da465d9e9c6aee973224be66d8afbc994c10c3a3b50a363ab05ce2e698e) |
| `withdraw` 1 USDC | **amount public** | [`eae56979…`](https://stellar.expert/explorer/testnet/tx/eae5697925acb6a0232bba223d795721dff41f5d073a133f90d7aaaed059c53d) |
| `/auditor` decrypts the transfer → 2.50, sender balance after → 7.50 | off-chain | — |

Final vault balance 6.50 USDC (10 − 2.5 − 1), public balance 41 USDC.
