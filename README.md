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

The agent's cap is **10 USDC over a rolling window of 17,280 ledgers (~24 h)**, enforced by OpenZeppelin's `spending_limit` policy on the agent's rule of the smart account. The agent can only call `transfer` on the USDC contract; anything else is rejected by the network. Above the cap, the agent's transaction fails on-chain with `Error(Contract, #3221)` (`SpendingLimitExceeded`), and the app prepares the same payment for the **owner**, who signs it once in **Freighter**.

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
| [`/agent`](https://monolith-nine-rosy.vercel.app/agent) | Chat with the agent ("paie 1 USDC à Alice", "quel est mon solde ?"). Shows what the planner understood, what the gatekeeper decided and why, and the on-chain result. Above the cap: link to the agent's transaction **rejected by the network (#3221)**, then an approval card the owner signs with Freighter. The budget bar reads the cap and the spending straight from the on-chain policy. |

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
| **From the live app with Freighter (Firefox), proofs in the browser:** confidential transfer 2.5 USDC — amount hidden; our auditor reads 2.50 | [`2e6d3957…`](https://stellar.expert/explorer/testnet/tx/2e6d3957b08d96eba12cb7299a16504e266c2a665109e696d20bc76818b2c76b) |
| ↳ deposit 10 USDC (public) | [`aa356955…`](https://stellar.expert/explorer/testnet/tx/aa356955c552236f50fced2993de5f0f72908b07f6c7b2ad3d8f502008b51e20) |
| **Agent pays 5 USDC alone** (under the cap, agent's Ed25519 key, rule B) | [`4ba72789…`](https://stellar.expert/explorer/testnet/tx/4ba72789cf7825eb285c743da14d92ad2de4971b9e793045b7889576e5449679) |
| **Agent tries 50 USDC → rejected by the network**: included in a ledger, FAILED, `Error(Contract, #3221)` `SpendingLimitExceeded`, no USDC moved | [`cfda69da…`](https://stellar.expert/explorer/testnet/tx/cfda69da1eeeb89228f4e86b7673f214eb4c524843089632d8e7e51cdf01620c) |
| **Owner approves 50 USDC** (rule A, owner as delegated signer) | [`a394bd32…`](https://stellar.expert/explorer/testnet/tx/a394bd32034d6b7fdf4b4cb62837193f0b8db9b67c149c805345eec028660eb7) |
| **From the app with Freighter:** agent's attempt rejected on-chain (#3221) | [`eb70b4a2…`](https://stellar.expert/explorer/testnet/tx/eb70b4a2cd5eaf80d7df9bed9aacac25ee7e99a100f0d35d0b92015f16293676) |
| ↳ owner approval signed in Freighter, submitted | [`39a0634f…`](https://stellar.expert/explorer/testnet/tx/39a0634f3ea7df229504c3b152342fc111d60be057df00e5007ebb5b34884243) |

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
| **Smart account** (OZ `multisig-smart-account` example, v0.8.0) | `CC5D2NUS2GXAWMTK2DMSNJHVRGRH5GBEZNUMEPIOPBPQQJN6GDLO43KA` |
| Ed25519 verifier (OZ example) | `CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB` |
| Spending-limit policy (OZ example) | `CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ` |

Smart-account rules (read back on-chain with `get_context_rule`):

| Rule | Context | Signer | Policy |
|---|---|---|---|
| A (`owner`, id 0) | any call (`Default`) | owner `GCIF…RS7B`, `Delegated` (signs with Freighter) | none: full power |
| B (`agent-usdc-10-24h`) | `CallContract(USDC SAC)` | agent, `External` Ed25519 via the verifier (key server-only) | `spending_limit`: 10 USDC / 17,280 ledgers |

P1 deployment details (OZ commit `ddc327eb`, WASM hashes, every tx): [`docs/architecture.md`](docs/architecture.md) and [`contracts/deployments.testnet.json`](contracts/deployments.testnet.json).

Details, deploy tx and every demo hash: [`docs/architecture.md`](docs/architecture.md). Machine-readable: [`deployments/testnet.json`](deployments/testnet.json).

## How Stellar is used

- **Confidential Tokens** (`stellar-confidential` 0.8.0): our token wraps the testnet **USDC SAC** and was deployed through the shared factory with `deploy_vanilla_token`. We use `register`, `deposit`, `merge`, `confidential_transfer` and `withdraw`. Each one carries an UltraHonk proof, verified on-chain.
- **In-browser proving**: the vault builds witnesses and proves with `@aztec/bb.js` inside the page. This needs `SharedArrayBuffer`, so the app is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`.
- **Key derivation from the wallet**: the user's confidential key is derived from a **SEP-53** message signature in **Freighter**. Same account and same token give the same key on any device; nothing secret is stored. We sign twice and compare to make sure the signature is deterministic.
- **Designated auditor (compliance)**: we created our own instance of OpenZeppelin's auditor registry from the wasm already installed on testnet (no new contract code), registered our auditor's Grumpkin key (`K_aud = k·H`), and bound our token to it through the factory. Each account picks its auditor at `register`. The auditor view checks a pasted key against the registry, then decrypts transfer amounts and sender balances from on-chain events, with no wallet and no proving. See [`scripts/deploy-auditor.ts`](scripts/deploy-auditor.ts).
- **Soroban RPC events** rebuild balances and history; links point to stellar.expert.
- **Smart account + `spending_limit` policy (OpenZeppelin `stellar-contracts` v0.8.0)**: the treasury the agent spends from is a contract account. Its `__check_auth` checks the **context rule** the client selects (`context_rule_ids` in the `AuthPayload`; there is no fallback to another rule). The agent signs `sha256(XDR(AuthDigestPreimage))` with its Ed25519 key, checked by the Ed25519 verifier contract. The policy keeps a rolling spending history per (account, rule) and only accepts `transfer` on the USDC SAC (`#3223 NotAllowed` otherwise, `#3221 SpendingLimitExceeded` above the cap). The owner is a `Delegated` signer: the app builds a transaction whose source is the owner, so one Freighter `signTransaction` covers both the smart account's auth and the owner's nested `__check_auth` auth. See [`app/lib/agent/core.ts`](app/lib/agent/core.ts).
- **Agent pipeline** (`/api/intent`, server-only): a Groq LLM planner turns the message into a zod-validated plan; a deterministic gatekeeper reads the cap and the spending **from the policy on-chain** and decides (auto / owner approval / blocked); a safety net reads the raw message, not the LLM output (pressure wording, "all my money", amounts or addresses that differ from the plan). This pre-check is for the UI only: if it were wrong, the policy would still reject the agent's transaction.
- **USDC SAC**: the smart account holds and sends Circle testnet USDC through its Stellar Asset Contract (`transfer`), with no trustline needed for a contract address.

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
| `NEXT_PUBLIC_SMART_ACCOUNT_ID` | agent | default: our smart account (`app/lib/agent/deployment.json`) |
| `AGENT_SECRET_KEY` | agent API | **server-only**, never `NEXT_PUBLIC_`. `stellar keys show agent` |
| `LLM_API_KEY` | agent API | **server-only**, Groq key. Without it, a deterministic fallback planner (regex) answers |
| `GROQ_MODEL` | agent API | `qwen/qwen3.8-27b` (checked against Groq's `/models`) |
| `RULE_AGENT_ID` | agent API | optional override. By default the API finds the agent rule on-chain (signer = agent key + spending-limit policy, cached 60 s), so a reset needs no redeploy |

Scripts (Node, testnet):

```bash
npm run ct:auditor  # our auditor registry + key + a confidential USDC bound to it; writes deployments/{testnet,auditor}.json
npm run ct:e2e      # full confidential run with fresh friendbot accounts, checks our auditor reads it and the shared public key can't
npm run ct:deploy   # (v1) confidential USDC on the shared registry
```

Smart account and agent (in `contracts/`, Node + Stellar CLI keystore with identities `owner`, `agent`, `alice`; run `npm install` in `app/` first, the scripts reuse `app/lib/agent/core.ts`):

```bash
cd contracts && npm install
npm run deploy        # Ed25519 verifier + spending-limit policy + smart account (rule A = owner), then adds rule B (agent, 10 USDC / ~24 h)
npm run gonogo        # agent 5 USDC ✅ · agent 50 USDC ❌ #3221 (on-chain) · owner 50 USDC ✅ · alice refunds
npm run status        # balances, cap, spent in the rolling window, remaining budget
npm test              # 24 tests: 9 on testnet (8 signed simulations + on-chain rule discovery) on testnet (no tx sent) + 15 gatekeeper unit tests
npm run reset-agent   # fresh agent rule (remove old rule B, add a new one): restores the budget; --dry-run to preview
npm run refund        # alice sends her USDC back to the smart account
```

The WASMs are OpenZeppelin's `examples/multisig-smart-account` (account, ed25519-verifier, spending-limit-policy) at tag `v0.8.0` / commit `ddc327eb`, unmodified, compiled with `stellar contract build`; committed in `contracts/wasm/` with their sha256 in `docs/architecture.md`.

## Limitations (honest)

- **Testnet only.** Confidential Tokens are a developer preview.
- **One auditor, held by the team.** Our auditor key (`auditor_id = 1` in our registry) is held by the Monolith team for the demo; it is not in the repo or the app. In a real deployment the account's accountant or compliance officer generates it. The registry admin can rotate it (`rotate_key`). Judges can't reveal amounts themselves without that key; the video shows it.
- **We reuse shared infrastructure, as OpenZeppelin recommends.** The UltraHonk verifier and the factory were deployed by `brozorec/stellar-confidential-token-demo`, not by us. The verifier's verification keys are byte-identical to OpenZeppelin's audited ones (`stellar-contracts` → `packages/confidential/circuits/vks`). Our auditor registry runs OpenZeppelin's registry wasm as installed on testnet by that demo.
- **v1 token.** Our first token (`CB4T3M…`) used the shared registry's auditor 0, whose secret is public: anyone can decrypt it. It stays on testnet as history; the app no longer uses it.
- **Entry and exit are public.** Deposits and withdrawals show their amounts; only transfers inside the vault are hidden.
- **Addresses are visible.** Confidential, not anonymous: anyone sees who transacts with whom and that an address has a confidential account.
- **History window.** The auditor view and the private lines of the agent's activity feed (`GET /api/agent/activity`) read events from the Soroban RPC `getEvents`, which only keeps a rolling window: on testnet `getHealth` reports `ledgerRetentionWindow = 120960` ledgers, about 7 days (checked 2026-10-25). Older private payments drop out of the feed; public payments and refusals come from Horizon account history instead. After that window the auditor table is empty until new operations happen (`npm run ct:e2e`).
- **Proof timing.** In Node: register 1.4–1.8 s, transfer 3.4 s, withdraw 2.7 s. In the browser (live app, Firefox): register proof 1.3 s, transfer proof 1.9 s; each step takes < 10–20 s end to end with the Freighter signature and network confirmation.
- **Browser support.** Proving needs cross-origin isolation through `COEP: credentialless`: Chrome/Edge/Brave and Firefox ≥ 119. Safari does not support it. Tested end to end with Freighter in Firefox. On Firefox, Freighter may need "Always allow" for the site before the page can see it.
- **Key cached in the browser.** After deriving the confidential key from the Freighter signature, the app caches it in `localStorage` so you don't re-sign on every visit. Anyone with access to that browser profile can read your confidential balances (not move funds: that still needs Freighter).
- **Agent pre-check** on the server is for display; the on-chain policy is the real limit.
- **Agent payments are public.** The smart account's balance and the agent's payments are ordinary USDC transfers: amounts and recipients are visible. Only the vault is confidential.
- **The budget is consumed.** The cap is cumulative over ~24 h. Once spent, every agent payment is rejected until older payments leave the window; `npm run reset-agent` installs a fresh rule (two owner transactions); the app picks up the new rule id from the chain within 60 s, no redeploy.
- **Agent payments are expensive on testnet today.** Almost the whole fee is storage rent (tx [`1dfb0e87…`](https://stellar.expert/explorer/testnet/tx/1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3): 9.864 XLM charged, 9.863 XLM of it `rent_fee_charged`, 0.0012 XLM for compute). Each payment appends an entry to the spending-limit policy's persistent history, which the policy keeps alive for 30 days (OZ `SPENDING_LIMIT_EXTEND_AMOUNT = 30 * DAY_IN_LEDGERS`), so the extra bytes pay ~30 days of rent. On 2026-10-25 testnet's live Soroban state (~4.14 GB) was above the protocol's 4.0 GB target, which makes rent per byte climb steeply: our payments went from 3.2 XLM to 11.1 XLM in three hours. We have not measured mainnet.
- **Owner approval on the public demo.** Only the owner's Freighter account can sign the approval; visitors see the agent's rejected transaction, and the video shows the approval.
- **The agent key is a server secret.** It can only spend within the cap and only USDC `transfer` (`#3223` for anything else, `#3002` on any other contract or rule, both tested), but it lives in Vercel's environment.
- **Small contact book.** The demo resolves "Alice" to a testnet account; any other address requires the owner's approval.
- **x402.** Paying x402 APIs straight from the smart account is blocked today by [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764) (the facilitator rejects the policy's `spending_limit_enforced` event, `@x402/stellar` 2.28.0).

## Prior work & what we built during HackMeridian

Everything in this repo was written during HackMeridian (25–26 Oct 2026), except the vendored SDK below. See the commit history.

**Not our code:**
- [`packages/ct-sdk`](packages/ct-sdk) is a vendored copy of [`brozorec/stellar-confidential-token-sdk`](https://github.com/brozorec/stellar-confidential-token-sdk) at commit `aad1706` (MIT), unmodified under `src/` and `circuits/`. See [`VENDORED.md`](packages/ct-sdk/VENDORED.md).
- The verifier and token factory contracts, and the auditor-registry wasm we instantiated, are shared deployments from [`brozorec/stellar-confidential-token-demo`](https://github.com/brozorec/stellar-confidential-token-demo) (MIT), built on [`OpenZeppelin/stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts) `packages/confidential`.
- Adapted with credit (MIT, noted in file headers): the bb.js vendoring script (`scripts/vendor-bb.mjs`) and the Freighter key-derivation flow (`app/lib/ct/derive-key.ts`), both from that demo.

- The smart account, Ed25519 verifier and spending-limit policy are OpenZeppelin's `stellar-contracts` examples (`examples/multisig-smart-account`, tag `v0.8.0`, MIT), deployed unmodified.

**Built during the event:** our auditor registry and key, deployment of our confidential USDC, the testnet end-to-end run, the vault and auditor UI with in-browser proving, the Next.js app and its "2001: A Space Odyssey" design, the Vercel deployment; the smart account's deployment and configuration (rules, policy), the Soroban auth signing for its External and Delegated signers, the on-chain spending-limit integration, the agent's planner/gatekeeper/executor, the API routes, the approval card and the tests.

**Prior work — Orchestra.** The agent architecture (Planner → deterministic Gatekeeper → Executor) and parts of the planner prompt and safety-net rules come from Orchestra (ETHGlobal Cannes 2026, same team, Ethereum/Safe). All Stellar code was written during HackMeridian: smart account deployment and configuration, Soroban auth signing (External and Delegated signers), the on-chain spending-limit integration, the executor and the API routes.

**Inspirations, credited:** OpenZeppelin examples, Agent Card, Who Ate Gerald.

## Team

- **Oskar** — confidential vault, auditor view, frontend, deployment
- **Sylane** — smart account, spending-limit policy, AI agent
