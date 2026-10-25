# Monolith

**Your treasury stays confidential. Your AI agent can only spend what the contract allows.**

Built on Stellar testnet for HackMeridian 2026 (tracks: **Genesis** · **Stellar Composed**).

**Live demo: https://monolith-nine-rosy.vercel.app** (testnet, public, no login)

## Problem

A freelancer or a small team wants to let an AI agent pay for tools, APIs and contractors. Two things stop them:

1. **On a public chain, everything is readable.** Balances and payment amounts are visible to clients, competitors and employees.
2. **Giving an agent a wallet means giving it all the money.** The "limits" usually live in the agent's own code, so nobody can verify them.

## Solution

1. **Confidential vault** — USDC wrapped in a Stellar **Confidential Token** (OpenZeppelin's `stellar-confidential` protocol 0.8.0). Balances and transfer amounts are Pedersen commitments, hidden on-chain. Each operation carries a zero-knowledge proof (UltraHonk) checked by an on-chain verifier. Each account designates **its auditor** (say, the team's accountant) when it opens the vault: only that auditor's key can reveal transfer amounts, and nothing else. Our token is bound to **our own auditor registry**, so the reference demo's public auditor key opens nothing.
2. **Agent with an on-chain spending cap** — an OpenZeppelin **smart account** with a `spending_limit` policy. Under the cap the agent pays alone; above it the **Stellar network itself rejects the transaction**. Only the owner can approve more. The server-side pre-check is for display only; the real barrier is the on-chain policy.

> TODO P1: confirm the cap value and period, and the owner-approval flow, once deployed.

## What is public vs hidden on-chain

| Visible on-chain | Hidden on-chain |
|---|---|
| All addresses (sender, recipient) | Confidential vault balances |
| Deposits into the vault and withdrawals out of it (amounts included) | Amounts of confidential transfers |
| Agent payments (public, capped budget) | |
| The fact that an address has a confidential account | |

**Confidential, not anonymous.**

## Demo

### Live app — https://monolith-nine-rosy.vercel.app

| Page | What it shows |
|---|---|
| [`/vault`](https://monolith-nine-rosy.vercel.app/vault) | Connect Freighter (testnet), get test XLM/USDC, then `register` → `deposit` → `merge` → confidential transfer → `withdraw`. Proofs are generated **in your browser** (bb.js, WebAssembly). |
| [`/auditor`](https://monolith-nine-rosy.vercel.app/auditor) | "Lire la chaîne" lists every operation on our token as anyone sees it (transfers: **chiffré**). Pasting the designated auditor's key reveals the amounts; the key is checked on-chain against our registry and is never shipped with the app. "Essayer la clé publique de la démo de référence" shows that the shared public auditor key opens nothing. No wallet needed. |
| [`/agent`](https://monolith-nine-rosy.vercel.app/agent) | TODO P1 — agent chat and owner approval card. |

Fastest check for a judge (no wallet): open `/auditor` and click **Lire la chaîne**. The confidential transfer `1cfe3715…` shows as **chiffré** (encrypted) on-chain; check on stellar.expert that the amount is not readable there either. Click **Essayer la clé publique de la démo de référence**: the key is refused and the amount stays unreadable. The video shows the designated auditor pasting the real key and seeing **7.50** USDC with the sender's balance after (12.50).

### Video

TODO: video link.

### On-chain proof (testnet)

| Scenario | Tx |
|---|---|
| Our auditor registry created (OZ registry wasm already on testnet) / our auditor key registered | [`ee207713…`](https://stellar.expert/explorer/testnet/tx/ee207713564ab7731ad3afd56707be1b765704c1b9d0caa53135365d7644b491) / [`78c52ed8…`](https://stellar.expert/explorer/testnet/tx/78c52ed8b22bc1768f6bfbb84d020d2974fc3a2f27ef67270ebf905ae725536e) |
| Confidential USDC deployed, bound to our registry | [`8694ce7a…`](https://stellar.expert/explorer/testnet/tx/8694ce7a180a59cc6ccc34c10eaf674be89ddbd861b73d96b6089526a13dc6d7) |
| **Confidential transfer alice → bob, 7.5 USDC — amount hidden**; our auditor reads 7.5, the shared public key can't | [`1cfe3715…`](https://stellar.expert/explorer/testnet/tx/1cfe37158b1fa2fd25e84468c6d9949bfc69c4710d08bc547630631f007095ff) |
| Deposit 20 USDC into the vault (amount public) | [`3f2c290d…`](https://stellar.expert/explorer/testnet/tx/3f2c290d48511402c60e089c6517ee86d4c8a4797b097c276df95cf8b32ca0c7) |
| Withdraw 7.5 USDC from the vault (amount public) | [`ec88598c…`](https://stellar.expert/explorer/testnet/tx/ec88598c0bdbca215539e3136ef035008afc1425c8494611fdaa4ac4f3211a33) |
| Earlier v1 token (shared public auditor): same flow from the live app with Freighter, proofs in the browser — transfer 2.5 USDC hidden | [`cd205da4…`](https://stellar.expert/explorer/testnet/tx/cd205da465d9e9c6aee973224be66d8afbc994c10c3a3b50a363ab05ce2e698e) |
| Agent pays 5 USDC alone (under the cap) | TODO P1 |
| Agent tries 50 USDC → rejected by the network (`#2221`) | TODO P1 |
| Owner approves 50 USDC | TODO P1 |

Every step (register, merge, …) and the v1 runs are in [`docs/architecture.md`](docs/architecture.md).

## Architecture

```
┌──────────────────────── Next.js (Vercel) ────────────────────────┐
│  VAULT tab (client)                │  AGENT tab (chat)            │
│  - register / deposit / merge      │  - message → /api/intent     │
│  - confidential transfer/withdraw  │  - owner approval card       │
│  - auditor view (disclosure)       │  - reasoning + history       │
│  Proofs generated in the browser (bb.js / UltraHonk)              │
├────────────────────────────────────┴─────────────────────────────┤
│  Next.js API routes (server): /api/intent, /api/agent/*           │
│  LLM → { action, amount, to }  →  executor (agent key, server-only)│
└───────────────┬──────────────────────────────────┬────────────────┘
     Confidential Token (OZ 0.8.0)          Smart Account (OZ)
     + UltraHonk verifier                   ├─ rule A: owner (Freighter)
     + OUR auditor registry                 └─ rule B: CallContract(USDC SAC)
                                                signer = agent (Ed25519)
                                                policy = spending_limit
                └──────────── Stellar testnet ────────────┘
```

One Next.js app: frontend + API routes, one Vercel deployment. The agent key lives only in server-side environment variables.

### Contract IDs (testnet)

| Contract | ID |
|---|---|
| **Monolith confidential USDC** (vanilla: no admin, no freeze, no clawback) | `CAYYT5UWB22VLV4Z7DU7DN7V6XFPGIDP5ZD3HV4S6HVQMCGLI5CFLERJ` |
| **Monolith auditor registry** (ours; our auditor is `auditor_id = 1`) | `CB5YIDSUCNESNOJK2UFFJA6E3O5BGAPYEQ6F353WGNM4UBGGX3H45IGQ` |
| USDC SAC (Circle testnet) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| UltraHonk verifier (shared) | `CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ` |
| Confidential token factory (shared) | `CAWPCXMW47UET5Z4N5T44PRDGAY6CZVP2O2JDEBL7YWEUHJGQ2BR4L6R` |
| Smart account | TODO P1 |
| Ed25519 verifier | TODO P1 |
| Spending-limit policy | TODO P1 |

Details, deploy tx and every demo hash: [`docs/architecture.md`](docs/architecture.md). Machine-readable: [`deployments/testnet.json`](deployments/testnet.json).

## How Stellar is used

- **Confidential Tokens** (`stellar-confidential` 0.8.0): our token wraps the testnet **USDC SAC** and was deployed through the shared factory with `deploy_vanilla_token`. We use `register`, `deposit`, `merge`, `confidential_transfer` and `withdraw`. Each one carries an UltraHonk proof, verified on-chain.
- **In-browser proving**: the vault builds witnesses and proves with `@aztec/bb.js` inside the page. This needs `SharedArrayBuffer`, so the app is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
- **Key derivation from the wallet**: the user's confidential key is derived from a **SEP-53** message signature in **Freighter**. Same account and same token give the same key on any device; nothing secret is stored. We sign twice and compare to make sure the signature is deterministic.
- **Designated auditor (compliance)**: we created our own instance of OpenZeppelin's auditor registry from the wasm already installed on testnet (no new contract code), registered our auditor's Grumpkin key (`K_aud = k·H`), and bound our token to it through the factory. Each account picks its auditor at `register`. The auditor view checks a pasted key against the registry, then decrypts transfer amounts and sender balances from on-chain events, with no wallet and no proving. See [`scripts/deploy-auditor.ts`](scripts/deploy-auditor.ts).
- **Soroban RPC events** rebuild balances and history; links point to stellar.expert.
- **Smart account + `spending_limit` policy (OpenZeppelin)**: TODO P1.

## Setup / Install / Env vars / Run

Requirements: Node ≥ 20, npm. For the vault: the [Freighter](https://www.freighter.app/) extension set to **Testnet**.

```bash
git clone https://github.com/Rushyard/Monolith && cd Monolith
npm install                       # npm workspaces; postinstall builds the vendored SDK
cp .env.example app/.env.local    # optional for the vault/auditor (defaults point to our testnet token)
npm run dev                       # http://localhost:3000
```

`npm run build` makes a production build. The `prebuild` step compiles `packages/ct-sdk` and copies bb.js's browser build into `app/public/vendor/bb` (git-ignored).

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | all | `testnet` |
| `NEXT_PUBLIC_RPC_URL` | all | default `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_USDC_SAC` | vault, agent | default: Circle testnet USDC SAC |
| `NEXT_PUBLIC_CT_CONTRACT_ID` | vault, auditor | default: our confidential USDC |
| `NEXT_PUBLIC_SMART_ACCOUNT_ID` | agent | TODO P1 |
| `AGENT_SECRET_KEY` | agent API | **server-only**, never `NEXT_PUBLIC_` |
| `LLM_API_KEY` | agent API | **server-only** |

Scripts (Node, testnet):

```bash
npm run ct:auditor  # our auditor registry + key + a confidential USDC bound to it; writes deployments/{testnet,auditor}.json
npm run ct:e2e      # full confidential run with fresh friendbot accounts, checks our auditor reads it and the shared public key can't
npm run ct:deploy   # (v1) confidential USDC on the shared registry
```

> TODO P1: smart account deploy script and its steps.

## Limitations (honest)

- **Testnet only.** Confidential Tokens are a developer preview.
- **One auditor, held by the team.** Our auditor key (`auditor_id = 1` in our registry) is held by the Monolith team for the demo; it is not in the repo or the app. In a real deployment the account's accountant or compliance officer generates it. The registry admin can rotate it (`rotate_key`). Judges can't reveal amounts themselves without that key; the video shows it.
- **We reuse shared infrastructure, as OpenZeppelin recommends.** The UltraHonk verifier and the factory were deployed by `brozorec/stellar-confidential-token-demo`, not by us. The verifier's verification keys are byte-identical to OpenZeppelin's audited ones (`stellar-contracts` → `packages/confidential/circuits/vks`). Our auditor registry runs OpenZeppelin's registry wasm as installed on testnet by that demo.
- **v1 token.** Our first token (`CB4T3M…`) used the shared registry's auditor 0, whose secret is public: anyone can decrypt it. It stays on testnet as history; the app no longer uses it.
- **Entry and exit are public.** Deposits and withdrawals show their amounts; only transfers inside the vault are hidden.
- **Addresses are visible.** Confidential, not anonymous: anyone sees who transacts with whom and that an address has a confidential account.
- **History window.** The auditor view reads events from the Soroban RPC, which keeps about 7 days. After that the table is empty until new operations happen (`npm run ct:e2e`).
- **Proof timing.** In Node: register 1.4–1.8 s, transfer 3.4 s, withdraw 2.7 s. In the browser (live app, measured by hand, Freighter signature included): open the vault < 10 s, confidential transfer < 20 s.
- **Browser support.** Proving needs cross-origin isolation through `COEP: credentialless`: Chrome/Edge/Brave and Firefox ≥ 119. Safari does not support it. Tested end to end with Freighter in Firefox. On Firefox, Freighter may need "Always allow" for the site before the page can see it.
- **Key cached in the browser.** After deriving the confidential key from the Freighter signature, the app caches it in `localStorage` so you don't re-sign on every visit. Anyone with access to that browser profile can read your confidential balances (not move funds: that still needs Freighter).
- **Agent pre-check** on the server is for display; the on-chain policy is the real limit. TODO P1: other agent limitations.

## Prior work & what we built during HackMeridian

Everything in this repo was written during HackMeridian (25–26 Oct 2026), except the vendored SDK below. See the commit history.

**Not our code:**
- [`packages/ct-sdk`](packages/ct-sdk) is a vendored copy of [`brozorec/stellar-confidential-token-sdk`](https://github.com/brozorec/stellar-confidential-token-sdk) at commit `aad1706` (MIT), unmodified under `src/` and `circuits/`. See [`VENDORED.md`](packages/ct-sdk/VENDORED.md).
- The verifier and token factory contracts, and the auditor-registry wasm we instantiated, are shared deployments from [`brozorec/stellar-confidential-token-demo`](https://github.com/brozorec/stellar-confidential-token-demo) (MIT), built on [`OpenZeppelin/stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts) `packages/confidential`.
- Adapted with credit (MIT, noted in file headers): the bb.js vendoring script (`scripts/vendor-bb.mjs`) and the Freighter key-derivation flow (`app/lib/ct/derive-key.ts`), both from that demo.

**Built during the event:** our auditor registry and key, deployment of our confidential USDC, the testnet end-to-end run, the vault and auditor UI with in-browser proving, the Next.js app and its "2001: A Space Odyssey" design, the Vercel deployment. TODO P1: smart account, policy, agent.

**Earlier concept:** Orchestra (ETHGlobal Cannes 2026, Ethereum / Safe / Uniswap) explored an agent with guardrails. No code reused.

**Inspirations, credited:** OpenZeppelin examples, Agent Card, Who Ate Gerald.

## Team

- **Oskar** — confidential vault, auditor view, frontend, deployment
- **Sylane** — smart account, spending-limit policy, AI agent
