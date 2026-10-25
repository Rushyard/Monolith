# Monolith — HackMeridian 2026 submission texts

Everything below is checked against testnet transactions (links at the end) or the code in this repo. Tracks: **Genesis** · **Stellar Composed**. Live demo: https://monolith-nine-rosy.vercel.app

## (a) Descriptions

**Short (1 sentence)**

Monolith keeps a small team's USDC treasury confidential on Stellar and lets an AI agent pay from it, under a spending cap that the Stellar network itself enforces.

**Long (~150 words)**

On a public chain, a team's balances and payments are readable by clients, competitors and employees. And giving an AI agent a wallet usually means giving it all the money, because its "limits" live in its own code. Monolith fixes both on Stellar testnet. The vault wraps USDC in a Stellar Confidential Token (OpenZeppelin `stellar-confidential` 0.8.0). Balances and transfer amounts are hidden on-chain, every operation carries a zero-knowledge proof generated in the browser, and only the auditor that each account designates can reveal amounts. The agent pays from an OpenZeppelin smart account. Its rule only allows USDC `transfer`, with a `spending_limit` policy of 10 USDC per ~24 h. Under the cap, the agent pays alone. Above it, the network rejects the transaction (`#3221 SpendingLimitExceeded`), and the owner approves the same payment with one Freighter signature. One Next.js app, deployed on Vercel.

## (b) Likely form answers

**Problem**
A freelancer or a small team wants an AI agent to pay for tools, APIs and contractors. On a public ledger, every balance and payment amount is visible. And handing an agent a key means trusting limits written in the agent's own code, which nobody can verify.

**Target user**
Freelancers, small teams and small DAOs that hold a USDC treasury on Stellar, want an AI agent to handle routine payments, and need an accountant or compliance officer to be able to check the books.

**Value proposition**
- Confidential, not anonymous: amounts and balances are hidden from the public, but the designated auditor can read them.
- An agent spending cap that holds even if our server or the AI is compromised. It is enforced by the smart account's on-chain policy, not by our code. The server-side pre-check only drives the display.
- When the agent hits the cap, the owner approves with one Freighter signature. They don't need to move funds or change keys.

**How Stellar is used**
- **Confidential Tokens:** OpenZeppelin `stellar-confidential` 0.8.0.
  - USDC wrapped in a confidential token bound to **our own auditor registry** (OZ registry wasm).
  - Balances and amounts are Pedersen commitments; UltraHonk proofs are generated in the browser with bb.js and checked by an on-chain verifier.
  - Operations: `register`, `deposit`, `merge`, `confidential_transfer`, `withdraw`.
- **Smart account:** OpenZeppelin `stellar-contracts` v0.8.0 (`multisig-smart-account` example), with two context rules:
  - rule A: the owner as a `Delegated` signer, full power;
  - rule B: `CallContract(USDC SAC)`, the agent as an `External` Ed25519 signer through the OZ verifier contract, and the `spending_limit` policy (10 USDC over 17,280 ledgers).
- **Soroban authorization:** we sign the auth entries for both signer types ourselves. The owner's approval is a single Freighter `signTransaction`: the owner is the transaction source, and the nested `__check_auth` uses source-account credentials.
- **Circle testnet USDC** through its Stellar Asset Contract (SAC), and **Freighter** for every user signature.
- **Funding the agent from the vault:** a `withdraw` from the confidential vault straight into the agent's smart account (a public exit).

**Built during the hack vs before**
All code in this repo was written during HackMeridian (25–26 Oct 2026). The exceptions:
- the vendored `stellar-confidential-token-sdk` (`brozorec`, MIT, commit `aad1706`);
- the shared verifier and token factory deployments from `brozorec/stellar-confidential-token-demo` (MIT);
- OpenZeppelin's smart account, Ed25519 verifier and spending-limit policy examples, deployed unmodified.

Prior work by the same team: the Planner → deterministic Gatekeeper → Executor architecture, and parts of the planner prompt and safety rules, come from Orchestra (ETHGlobal Cannes 2026, Ethereum/Safe). All Stellar code is new.

**Next steps**
- Let the agent pay x402 APIs. Paying straight from the smart account is blocked by [x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764): the facilitator rejects the policy's event. A workaround (fund the agent's own account through the capped rule, then pay x402 from it) is written on the `x402` branch, but not yet run on testnet.
- Fund the agent without revealing the amount. Today, the vault → agent withdrawal is public.
- Measure fees on mainnet. On testnet today, an agent payment costs several XLM, almost all of it storage rent for the policy's spending history (see README, Limitations).
- More policies per rule (per-recipient limits, expiry), and more than one auditor per team.

## (c) Video script — 2 min 30, 5 scenes

Screen setup: the live app in one tab, stellar.expert (testnet) in another. Show each tx hash in full on stellar.expert. The hashes below are the 25 Oct 2026 testnet transactions from our validated run. If you record a fresh run instead, swap in the new hashes, but say the same things.

### Scene 1 — The problem (0:00–0:25)
On screen: the home page, then stellar.expert on a plain USDC payment, showing the amount.

> "On a public blockchain, anyone can read your balance and every payment you make. And if you give an AI agent a wallet, you give it all the money: its limits live in its own code. Monolith fixes both, on Stellar."

### Scene 2 — Confidential vault (0:25–1:00)
On screen: `/vault` with Freighter (owner account `GCIF…RS7B`). Show the deposit (public amount), then the confidential transfer. Then stellar.expert:
- deposit 10 USDC: [`4bd33026…`](https://stellar.expert/explorer/testnet/tx/4bd330265fcdfcfef343a8ca26ec667e92f0fa8cab39de771cda44b06e81ca04)
- confidential transfer to `GDTM…PH3`: [`75db195e…`](https://stellar.expert/explorer/testnet/tx/75db195e4ad59a0cf12e0a15e99a21f44b59b5813d62012cb2f7a4e224256bfc), where no amount is readable
- recipient merges it into their balance: [`a610de1e…`](https://stellar.expert/explorer/testnet/tx/a610de1eb7bb94af5e85b4ec0cb9af97c131aa4e0addc938b02ef9c119320cd6)

> "This is the vault: USDC wrapped in a Stellar Confidential Token. Deposits are public, but inside the vault, balances and amounts are hidden. The zero-knowledge proof is generated right here in the browser and checked on-chain. On the explorer, this transfer has no readable amount. The recipient merges it into their balance."

### Scene 3 — The auditor (1:00–1:25)
On screen: `/auditor` → "Lire la chaîne": the transfer `75db195e…` shows as *chiffré* (encrypted). Click "Essayer la clé publique de la démo de référence": refused. Paste our auditor key: the amount appears. Read out the amount the screen shows; don't say a number in advance.

> "Confidential doesn't mean unaccountable. Each account picks its auditor when it opens the vault. Anyone sees this transfer as encrypted, and the public key from the reference demo opens nothing. Our designated auditor's key, checked on-chain against our registry, reveals the amount — and nothing else."

### Scene 4 — Funding the agent, and the agent paying alone (1:25–1:55)
On screen: `/vault` → "Approvisionner l'agent" with 1 USDC. Then `/agent`: type "paie 1 USDC à Alice", show the reasoning panel and the budget bar. Then stellar.expert:
- vault → agent's smart account, 1 USDC (public): [`8978784f…`](https://stellar.expert/explorer/testnet/tx/8978784fc5ab921df21c98ed3e65e8a9e0a036d41bed4d3c6f480353535eba46)
- agent pays 1 USDC to Alice on its own (rule B, agent's Ed25519 key): [`1dfb0e87…`](https://stellar.expert/explorer/testnet/tx/1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3)

> "The owner funds the agent from the vault. This exit is public, but the vault balance stays hidden. The agent lives in an OpenZeppelin smart account. Its only right: send USDC, up to 10 per 24 hours. 'Pay Alice 1 USDC': under the cap, it pays alone, with its own key."

### Scene 5 — The network says no, the owner says yes (1:55–2:30)
On screen: `/agent`: type "paie 50 USDC à Alice". Show the red rejection, then the approval card → Freighter (owner account) → success. Then stellar.expert:
- agent's attempt, 50 USDC: **FAILED**, `Error(Contract, #3221)` `SpendingLimitExceeded`, no USDC moved: [`91ecc158…`](https://stellar.expert/explorer/testnet/tx/91ecc158a92c4b17eca938da162385a3881d9f6ad0d6af1ffc753a32aa57e5e5)
- same 50 USDC payment, approved by the owner with one Freighter signature: [`d5cda7f3…`](https://stellar.expert/explorer/testnet/tx/d5cda7f3def6a9a145c5b4f5d306a21bd2b4b348f9301b91825d20e4d8c5561d)

> "Now 50 USDC. Our server didn't block this: the Stellar network did. The transaction is in a ledger, failed with SpendingLimitExceeded, and not one USDC moved. Even if our server or the AI were compromised, the agent couldn't spend more. The owner approves the same payment with one Freighter signature, and it goes through. Monolith: a confidential treasury, and an agent that can only spend what the contract allows."

## Transactions used above (all testnet, 2026-10-25 UTC, checked with `getTransaction`)

| Time | Tx | Call | Result |
|---|---|---|---|
| 15:25:32 | `4bd330265fcdfcfef343a8ca26ec667e92f0fa8cab39de771cda44b06e81ca04` | confidential USDC `CAYYT5…`.`deposit` (owner, 100000000 = 10 USDC) | SUCCESS |
| 15:32:42 | `75db195e4ad59a0cf12e0a15e99a21f44b59b5813d62012cb2f7a4e224256bfc` | `confidential_transfer` owner → `GDTMYTVU…XPH3` (amount hidden) | SUCCESS |
| 15:42:52 | `8978784fc5ab921df21c98ed3e65e8a9e0a036d41bed4d3c6f480353535eba46` | `withdraw` owner → smart account `CC5D2N…43KA`, 10000000 = 1 USDC | SUCCESS |
| 15:48:02 | `1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3` | USDC SAC `transfer` smart account → alice, 1 USDC, source = agent | SUCCESS |
| 15:49:22 | `91ecc158a92c4b17eca938da162385a3881d9f6ad0d6af1ffc753a32aa57e5e5` | USDC SAC `transfer` smart account → alice, 50 USDC, source = agent | FAILED `#3221` |
| 15:49:32 | `d5cda7f3def6a9a145c5b4f5d306a21bd2b4b348f9301b91825d20e4d8c5561d` | USDC SAC `transfer` smart account → alice, 50 USDC, source = owner (Freighter) | SUCCESS |
| 15:52:12 | `a610de1eb7bb94af5e85b4ec0cb9af97c131aa4e0addc938b02ef9c119320cd6` | `merge` by `GDTMYTVU…XPH3` (recipient) | SUCCESS |
