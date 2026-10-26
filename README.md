# Monolith

**The AI proposes, the chain caps, the human signs, and the vault stays private.**

Monolith gives a company a private vault where its AI agent prepares confidential payments that the owner signs, and a small public petty cash the agent spends on its own under a cap enforced by the Stellar network.

Built on Stellar testnet for HackMeridian 2026 (tracks: **Genesis** · **Stellar Composed**).

**Live demo: https://monolith-nine-rosy.vercel.app** (testnet, public, no account needed: visitors get simulations; real agent payments need the owner's Freighter sign-in)

**Cast** (the same in the app, the docs and the video):
- **Sarah** — founder, owner of the account (`GCIF…RS7B`).
- **Bob** and **Carol** — employees with a vault account. Payroll: Carol 3 USDC, Bob 2 USDC.
- **Alice** — outside contractor, no vault account, paid from the agent's public petty cash.
- **Marc** — the accountant, auditor #1 of our registry.

## Problem

A crypto account is all or nothing: everyone sees everything, and whoever holds the key can spend everything. That is already a problem for a company (salaries, suppliers and treasury are public), and it gets worse when an AI agent gets the key: the more you automate, the more you expose and the more you risk.

## Solution

```
                Sarah (owner) ── Freighter: signs, approves
                      │
     ┌────────────────┴─────────────────┐
     │  PRIVATE VAULT                   │  PUBLIC PETTY CASH
     │  Confidential Token (OZ)         │  smart account (OZ) + spending_limit
     │  Bob, Carol                      │  Alice
     │  AI proposes → Sarah signs       │  AI pays alone ≤ 10 USDC / ~24 h
     │  (proof in her browser)          │  over the cap → #3221 → Sarah approves
     │  amounts hidden, Marc reads them │  amounts public, cap enforced on-chain
     └──────────────────────────────────┘
                 We hide how much, not who.
```

1. **Private vault** — USDC wrapped in a Stellar **Confidential Token** (OpenZeppelin's `stellar-confidential` protocol 0.8.0). Balances and transfer amounts are Pedersen commitments, hidden on-chain. Each operation carries a zero-knowledge proof (UltraHonk) checked by an on-chain verifier. Each account designates **its auditor** when it opens the vault (here Marc, auditor #1): only that auditor's key can reveal transfer amounts, and nothing else. Our token is bound to **our own auditor registry**, so the reference demo's public auditor key opens nothing. For a vault recipient the AI never pays: it prepares the payments (e.g. "run payroll") and Sarah signs each one in her browser.
2. **Public petty cash with an on-chain cap** — an OpenZeppelin **smart account** with a `spending_limit` policy. Under the cap the agent pays alone; above it the **Stellar network itself rejects the transaction**. Only the owner can approve more. The server-side pre-check is for display only; the real barrier is the on-chain policy.

The agent's cap is **10 USDC over a rolling window of 17,280 ledgers (~24 h)**, enforced by OpenZeppelin's `spending_limit` policy on the agent's rule of the smart account. The agent can only call `transfer` on the USDC contract; anything else is rejected by the network. Above the cap, the agent's transaction fails on-chain with `Error(Contract, #3221)` (`SpendingLimitExceeded`), and the app prepares the same payment for the **owner**, who signs it once in **Freighter**.

Submission texts, video script and on-chain proofs: [`docs/submission.md`](docs/submission.md).

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
| **Confidential transfer from a test account to Bob, 7.5 USDC — amount hidden** (`npm run ct:e2e`); our auditor reads 7.5, the shared public key can't | [`1cfe3715…`](https://stellar.expert/explorer/testnet/tx/1cfe37158b1fa2fd25e84468c6d9949bfc69c4710d08bc547630631f007095ff) |
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

## The agent: confidential payroll prepared by the AI

Product rule: **inside the vault, the AI proposes and the owner signs. Outside, the AI acts alone, but capped.** Cast of the demo: Sarah (owner, `GCIF…RS7B`), Bob and Carol (employees with a vault account), Alice (outside the vault, paid from the agent's public petty cash), Marc (accountant = our auditor id 1).

What `POST /api/intent` does, all of it covered by `npm test` in `contracts/` (123 tests, 14 of them on testnet as signed simulations, no transaction sent):

- **Private / public routing.** Before any payment the server checks on-chain whether the recipient has a confidential account (`ChainClient.isRegistered`, a simulation of `confidential_balance`, cached 60 s). Registered → the agent pays nothing and returns `needs_vault_signature` with the list of payments; Sarah signs and proves each confidential transfer in her own browser. The agent never holds the vault keys and never proves anything. Not registered → the capped petty cash (rule B, on-chain cap, `#3221`, Freighter approval), unchanged. **Fail-closed:** if the vault check fails, nothing is paid in public (that would reveal the amount); the API answers with an explicit error.
- **"Run payroll"** (`verse les salaires`, `paie l'équipe`, `run payroll`, `pagar salários`): `app/lib/agent/payroll.ts` fixes people and amounts (Carol 3 USDC, Bob 2 USDC), never the LLM → `needs_vault_signature` with 2 payments. An employee outside the vault, pressure wording, an amount or an address in the message → `BLOCKED`.
- **Same gatekeeper for both channels.** Pressure, amount different from the message, address not in the plan: public → owner approval; vault → `BLOCKED`.
- **Owner session, visitors in simulation.** Sarah signs a one-time challenge (5 min) with Freighter `signMessage`; the server checks the SEP-53 signature (`ed25519(sha256("Stellar Signed Message:\n" + message))`, format read in Freighter's extension source `signBlob.ts` / `encodeSep53Message`) against the owner's public key and sets an `HttpOnly; Secure; SameSite=Strict` cookie signed with `SESSION_SECRET`, valid 8 h. The owner's secret key never reaches the server. Everyone else is in **demo mode**: planner + gatekeeper + a signed simulation of the agent's transaction, nothing sent; the answer says "Simulation : ce paiement aurait été exécuté / refusé (#3221)". Without `SESSION_SECRET`, nobody is owner. `/api/intent` is limited to 20 messages / 10 min per IP for visitors.
- **First payment (B1).** An address outside the contact book that the smart account never paid (Horizon history) needs the owner's approval even under the cap: "Premier paiement vers cette adresse".
- **Typos (A1).** Names are resolved on the server with a Damerau-Levenshtein distance over names and aliases: distance 0 → OK; ≤ 2 → "Did you mean Alice?" and nothing is paid; more → "give me their G… address". If the LLM silently fixes a typo, the raw message is checked too. A corrected name never triggers a payment.
- **Missing details (A2/A3), checked in code.** "pay" → "How much, and to whom?", "pay 5 usdc" → "To whom?", "pay alice" → "How much?" (same in French and Portuguese) (even if the LLM guessed an amount). The client sends its last turns; the server only uses them to complete an answer to its own question, then runs the whole pipeline on the combined text.
- **Reads (A7).** `budget` (cap, spent, remaining, read from the policy) and `address` (contact book or smart account): the server writes the answer, the LLM never states a number or an address.
- **Pause (B4).** The owner can remove the agent's rule (`remove_context_rule`, rule found with `findAgentRule`) and add it back with the same parameters as `reset-agent.ts`: the server prepares unsigned XDRs (owner as source) with simulated fees, Sarah signs in Freighter. No agent rule on-chain → verdict `PAUSED`. It only cuts the public petty cash; in the vault Sarah already signs everything. The two transactions were only simulated (pause ~0.10 XLM, re-add ~0.02 XLM in resource fees on 2026-10-25), not sent.
- **Mandate (expiring agent rights).** The agent's rule B carries a `valid_until` ledger (OpenZeppelin context rules). Sarah gives or renews it with one `update_context_rule_valid_until` signed in Freighter ("give the agent a 7-day mandate", 1 hour to 30 days; or `npm run mandate`); renewing keeps the same rule, so the budget already spent is not reset. Once it expires, the network refuses the agent's signature (`#3002`, proven on testnet: [`29fff98a…`](https://stellar.expert/explorer/testnet/tx/29fff98a454362b97b85bd9810b74a67eeaac5e638040a05c25c1526a169cc10)), the API answers `expired` with no transaction and offers to put the petty cash back in the vault, and the `budget` answer shows the time left. The code refuses to put an expiry on any rule other than the agent's: an expiry on the owner's rule could lock the account permanently (OpenZeppelin `smart_account/mod.rs`).
- **Activity feed.** `GET /api/agent/activity` is rebuilt from the chain on each call (cached 30 s): public payments and refusals from the Horizon history of the agent and owner accounts (decoded USDC SAC `transfer` calls, refusal code read with `getTransaction`), private payments from the confidential token's `transfer` events whose sender is the owner, **addresses and hash only, never an amount**. `POST /api/agent/vault-receipt { to, hash }` checks on-chain that the hash is a successful `confidential_transfer` from the owner to `to`, then shows it immediately.

### Languages

Every sentence the server writes (clarifications, missing-detail questions, vault and payroll texts, first-payment reason, demo-mode simulation texts, budget and address answers, pause, errors) and the fallback planner's keywords live in one file, `app/lib/agent/i18n.ts`, in English, French and Portuguese. Language = the user's message (simple fr/en/pt detection), else the language the client sends (`lang` in the `/api/intent` body, `?lang=` or the `x-monolith-lang` header), else English, the site's default. Every response of `/api/intent` carries the `lang` it used. The LLM writes its own questions in the user's language.

### Parsing eval (`npm run eval` in `contracts/`)

66 sentences in `eval/parsing.jsonl` (typos, missing details, answers to the agent's own question, payroll, the agent's mandate, private/public routing, injections, reads, unsupported requests; French, English, Portuguese), run through the real `/api/intent` pipeline in demo mode (simulation only). Each line also checks that the server answered in the message's language. Result on 2026-10-26:

| Category | Score |
|---|---|
| typo | 10/10 |
| slots | 11/11 |
| memory (answer to the agent's question) | 5/5 |
| payroll | 5/5 |
| private | 5/5 |
| public | 5/5 |
| injection | 7/7 |
| reads | 9/9 |
| unsupported | 3/3 |
| mandate | 6/6 |
| **Total** | **66/66** (fr 28/28, en 21/21, pt 17/17) |

Honest caveats: Groq rate-limited us (HTTP 429) during the run, so the LLM planner answered 25 of the 66 sentences; the others went through the regex fallback planner or a code check that runs before the LLM. Both paths go through the same server-side checks. The paused state (B4) is not in the eval: it would need a real on-chain transaction to remove the agent's rule; the `PAUSED` text is covered by unit tests in the three languages.

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
| `SESSION_SECRET` | agent API | **server-only**, ≥ 32 random characters (`openssl rand -hex 32`). Signs the owner session cookie and challenges. **Missing → nobody is owner, everyone is in simulation** |
| `HORIZON_URL` | agent API | optional, default `https://horizon-testnet.stellar.org` (activity feed, first-payment check) |
| `AGENT_PUBLIC_KEY` | agent API | optional, the agent's G address; only used to find its rule when `AGENT_SECRET_KEY` is absent |
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
npm test              # 123 tests: 14 on testnet (signed simulations, rule discovery, vault membership, demo-mode simulation, pause and mandate XDRs; no tx sent) + 109 unit tests (incl. every server sentence in en/fr/pt, mandate)
npm run eval          # parsing eval: eval/parsing.jsonl through the real /api/intent, demo mode (no tx)
npm run reset-agent   # fresh agent rule (remove old rule B, add a new one): restores the budget; --days N adds a mandate; --dry-run to preview
npm run mandate -- --days 7   # agent mandate: update_context_rule_valid_until on the agent's rule (--ledgers N, --none, --status, --dry-run)
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
- **Agent payment fees are almost all storage rent, so they follow testnet's rent rate.** Tx [`1dfb0e87…`](https://stellar.expert/explorer/testnet/tx/1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3): 9.864 XLM charged, 9.863 XLM of it `rent_fee_charged`, 0.0012 XLM for compute. Each payment appends an entry to the spending-limit policy's persistent history, which the policy keeps alive for 30 days (OZ `SPENDING_LIMIT_EXTEND_AMOUNT = 30 * DAY_IN_LEDGERS`). On the afternoon of 2026-10-25 testnet's live Soroban state (~4.14 GB) was above the protocol's 4.0 GB target and our payments went from 3.2 to 11.1 XLM in three hours; that evening the network's target read 7.0 GB and the same payment cost 0.0048 XLM ([`6d344bf8…`](https://stellar.expert/explorer/testnet/tx/6d344bf8030bf3e23ed9c2077e09889293e270001c5b3e7c4cb5204574d0dd33)). We have not measured mainnet.
- **Owner approval on the public demo.** Only the owner's Freighter account can sign the approval. Visitors are in demo mode: the agent's transaction is only simulated and nothing reaches the network; the video shows the real flow with Sarah signed in.
- **Owner login tested with the owner key, not yet clicked in a browser.** The server check was run end to end with the owner's key from the Stellar CLI keystore, signing the same SEP-53 digest Freighter's extension signs (read in its source). A click-through with Freighter itself is still to do.
- **Best-effort memory on serverless.** The per-IP limit (20 messages / 10 min), the one-time challenge nonces, the vault receipts and the recent blocked / waiting lines of the activity feed live in the memory of one Vercel instance: a cold start or a second instance resets them. The challenge itself is HMAC-signed and expires after 5 minutes, and the truth of the activity feed stays on-chain.
- **The vault hides how much, not who.** In the payroll, anyone sees that Sarah's account sent confidential transfers to Bob and Carol; only the amounts are hidden.
- **The petty cash is public.** Payments outside the vault (Alice) are ordinary USDC transfers from the smart account: amount and recipient visible.
- **Signing vault payments happens in the frontend.** The API returns `needs_vault_signature`; the vault screen that lets Sarah sign each confidential transfer is P2's part of the app.
- **The agent key is a server secret.** It can only spend within the cap and only USDC `transfer` (`#3223` for anything else, `#3002` on any other contract or rule, both tested), but it lives in Vercel's environment.
- **Small contact book.** Alice (`GDY5…BXH6`, outside the vault), Bob (`GBCQ…32GV`, the `bob` of our vault e2e run, registered with auditor 1; its key was not kept, so Bob can receive but not merge or spend) and Carol (`GDTM…XPH3`, registered with auditor 1). Any other address requires the owner's approval.
- **LLM rate limits.** On Groq's free tier the planner can get HTTP 429; the app then answers with the deterministic fallback planner (regex), which covers the demo sentences.
- **x402.** Paying x402 APIs straight from the smart account is blocked today by [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764) (the facilitator rejects the policy's `spending_limit_enforced` event, `@x402/stellar` 2.28.0).

Our feedback to OpenZeppelin, Stellar and Freighter (what worked, friction, suggestions), each point checked against the code, the docs or the chain: [`docs/feedback.md`](docs/feedback.md).

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
