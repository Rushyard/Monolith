# Monolith

**Your treasury stays confidential. Your AI agent can only spend what the contract allows.**

Built on Stellar testnet for HackMeridian 2026 (tracks: **Genesis** · **Stellar Composed**).

**Live demo: https://monolith-nine-rosy.vercel.app** (testnet, public, no login)

## Problem

A freelancer or a small team wants to let an AI agent pay for tools, APIs and contractors. Two things stop them:

1. **On a public chain, everything is readable.** Balances and payment amounts are visible to clients, competitors and employees.
2. **Giving an agent a wallet means giving it all the money.** The "limits" usually live in the agent's own code, so nobody can verify them.

## Solution

1. **Confidential vault** — USDC wrapped in a Stellar **Confidential Token** (OpenZeppelin's `stellar-confidential` protocol 0.8.0). Balances and transfer amounts are Pedersen commitments, hidden on-chain. Each operation carries a zero-knowledge proof (UltraHonk) checked by an on-chain verifier. An authorized **auditor** can reveal the amount of a transfer, and nothing else.
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
| [`/auditor`](https://monolith-nine-rosy.vercel.app/auditor) | "Read the chain" lists every operation on our token as anyone sees it; "Apply the audit key" reveals each confidential amount. No wallet needed. |
| [`/agent`](https://monolith-nine-rosy.vercel.app/agent) | TODO P1 — agent chat and owner approval card. |

Fastest check for a judge: open `/auditor`, click **Lire la chaîne**, then **Appliquer la clé d'audit**. The confidential transfer `59b6c363…` shows as **chiffré** (encrypted) on-chain and **7.50** USDC once audited. You can confirm on stellar.expert that the amount is not readable there.

### Video

TODO: video link.

### On-chain proof (testnet)

| Scenario | Tx |
|---|---|
| **Confidential transfer alice → bob, 7.5 USDC — amount hidden** | [`59b6c363…`](https://stellar.expert/explorer/testnet/tx/59b6c3639e71e797128e4543fc090842d05de0eafeda7d5cdf0aca9d66bd16d8) |
| Deposit 20 USDC into the vault (amount public) | [`288153d4…`](https://stellar.expert/explorer/testnet/tx/288153d4c2f9ea4cca800fd28097de4401813611c49322b4da39d392cc7ce361) |
| Withdraw 7.5 USDC from the vault (amount public) | [`93e38994…`](https://stellar.expert/explorer/testnet/tx/93e3899473aed840a289bee2dfb790039c79a4d4d2f77009b4d0ab7f1495f0a8) |
| **Same flow from the live app, proofs made in the browser (Freighter):** confidential transfer 2.5 USDC — amount hidden | [`cd205da4…`](https://stellar.expert/explorer/testnet/tx/cd205da465d9e9c6aee973224be66d8afbc994c10c3a3b50a363ab05ce2e698e) |
| ↳ deposit 10 USDC / withdraw 1 USDC (public) | [`dd322e73…`](https://stellar.expert/explorer/testnet/tx/dd322e737ab01344e90bd9c8234efa8c66da9b57f9af9c149ee7b4fdc0f62c5a) / [`eae56979…`](https://stellar.expert/explorer/testnet/tx/eae5697925acb6a0232bba223d795721dff41f5d073a133f90d7aaaed059c53d) |
| Agent pays 5 USDC alone (under the cap) | TODO P1 |
| Agent tries 50 USDC → rejected by the network (`#2221`) | TODO P1 |
| Owner approves 50 USDC | TODO P1 |

The full confidential run (register, merge, …) is in [`docs/architecture.md`](docs/architecture.md#gono-go-run--2026-10-25-1108-utc-npm-run-cte2e).

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
     + auditor registry                     └─ rule B: CallContract(USDC SAC)
                                                signer = agent (Ed25519)
                                                policy = spending_limit
                └──────────── Stellar testnet ────────────┘
```

One Next.js app: frontend + API routes, one Vercel deployment. The agent key lives only in server-side environment variables.

### Contract IDs (testnet)

| Contract | ID |
|---|---|
| **Monolith confidential USDC** (vanilla: no admin, no freeze, no clawback) | `CB4T3MNGCLUNVM7A4LCMXSOFRCWA6OODNDLFNDHRUHSDAOLRLAUYJMDD` |
| USDC SAC (Circle testnet) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| UltraHonk verifier (shared) | `CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ` |
| Auditor registry (shared, we use `auditor_id = 0`) | `CBQZRK72Y6KJ5DR4CUHKLHMHIKBMOZNSYTWHRUQPEXA35PRCBMSPBZTW` |
| Confidential token factory (shared) | `CAWPCXMW47UET5Z4N5T44PRDGAY6CZVP2O2JDEBL7YWEUHJGQ2BR4L6R` |
| Smart account | TODO P1 |
| Ed25519 verifier | TODO P1 |
| Spending-limit policy | TODO P1 |

Details, deploy tx and every demo hash: [`docs/architecture.md`](docs/architecture.md). Machine-readable: [`deployments/testnet.json`](deployments/testnet.json).

## How Stellar is used

- **Confidential Tokens** (`stellar-confidential` 0.8.0): our token wraps the testnet **USDC SAC** and was deployed through the shared factory with `deploy_vanilla_token`. We use `register`, `deposit`, `merge`, `confidential_transfer` and `withdraw`. Each one carries an UltraHonk proof, verified on-chain.
- **In-browser proving**: the vault builds witnesses and proves with `@aztec/bb.js` inside the page. This needs `SharedArrayBuffer`, so the app is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
- **Key derivation from the wallet**: the user's confidential key is derived from a **SEP-53** message signature in **Freighter**. Same account and same token give the same key on any device; nothing secret is stored. We sign twice and compare to make sure the signature is deterministic.
- **Selective disclosure**: the token is bound to an auditor key. The auditor view decrypts transfer amounts and sender balances from on-chain events, with no wallet and no proving.
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
npm run ct:e2e      # full confidential run with fresh friendbot accounts; writes deployments/testnet-e2e.json
npm run ct:deploy   # deploy a new confidential USDC through the factory; writes deployments/testnet.json
```

> TODO P1: smart account deploy script and its steps.

## Limitations (honest)

- **Testnet only.** Confidential Tokens are a developer preview.
- **The demo auditor key is public.** We use the shared auditor registry entry `auditor_id = 0`, whose secret was published on purpose by the reference demo so anyone can act as auditor. So today **anyone can decrypt amounts on our token**. A real deployment registers its own auditor key, which never leaves the auditor's machine.
- **We reuse shared infrastructure.** The verifier, auditor registry and factory were deployed by `brozorec/stellar-confidential-token-demo`, not by us. Their verification keys are byte-identical to OpenZeppelin's (`stellar-contracts` → `packages/confidential/circuits/vks`).
- **Entry and exit are public.** Deposits and withdrawals show their amounts; only transfers inside the vault are hidden.
- **Addresses are visible.** Confidential, not anonymous: anyone sees who transacts with whom and that an address has a confidential account.
- **History window.** The auditor view reads events from the Soroban RPC, which keeps about 7 days. After that the table is empty until new operations happen (`npm run ct:e2e`).
- **Proof timing.** In Node: register 1.4–1.8 s, transfer 3.4 s, withdraw 2.7 s. In the browser (live app, measured by hand, Freighter signature included): open the vault < 10 s, confidential transfer < 20 s.
- **Browser support.** Proving needs cross-origin isolation through `COEP: credentialless`: Chrome/Edge/Brave and Firefox ≥ 119. Safari does not support it. Tested end to end with Freighter in a Chromium-based browser. On Firefox, Freighter may need "Always allow" for the site before the page can see it.
- **Key cached in the browser.** After deriving the confidential key from the Freighter signature, the app caches it in `localStorage` so you don't re-sign on every visit. Anyone with access to that browser profile can read your confidential balances (not move funds: that still needs Freighter).
- **Agent pre-check** on the server is for display; the on-chain policy is the real limit. TODO P1: other agent limitations.

## Prior work & what we built during HackMeridian

Everything in this repo was written during HackMeridian (25–26 Oct 2026), except the vendored SDK below. See the commit history.

**Not our code:**
- [`packages/ct-sdk`](packages/ct-sdk) is a vendored copy of [`brozorec/stellar-confidential-token-sdk`](https://github.com/brozorec/stellar-confidential-token-sdk) at commit `aad1706` (MIT), unmodified under `src/` and `circuits/`. See [`VENDORED.md`](packages/ct-sdk/VENDORED.md).
- The verifier, auditor registry and token factory contracts are shared deployments from [`brozorec/stellar-confidential-token-demo`](https://github.com/brozorec/stellar-confidential-token-demo) (MIT), built on [`OpenZeppelin/stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts) `packages/confidential`.
- Adapted with credit (MIT, noted in file headers): the bb.js vendoring script (`scripts/vendor-bb.mjs`) and the Freighter key-derivation flow (`app/lib/ct/derive-key.ts`), both from that demo.

**Built during the event:** deployment of our confidential USDC, the testnet end-to-end run, the vault and auditor UI with in-browser proving, the Next.js app and its "2001: A Space Odyssey" design, the Vercel deployment. TODO P1: smart account, policy, agent.

**Earlier concept:** Orchestra (ETHGlobal Cannes 2026, Ethereum / Safe / Uniswap) explored an agent with guardrails. No code reused.

**Inspirations, credited:** OpenZeppelin examples, Agent Card, Who Ate Gerald.

## Team

- **Oskar** — confidential vault, auditor view, frontend, deployment
- **Sylane** — smart account, spending-limit policy, AI agent
