# Feedback on the tools we used

Monolith was built in 24 hours on Stellar testnet with OpenZeppelin `stellar-contracts` v0.8.0 (smart account, Ed25519 verifier, `spending_limit` policy; commit `ddc327eb`), OpenZeppelin's Confidential Tokens (`stellar-confidential` 0.8.0), Freighter and the Stellar RPC. Everything below comes from things we measured, hit while building, or read in the source; transaction hashes are in [`docs/architecture.md`](architecture.md).

## What worked very well

- **Context rules are the right abstraction for AI agents.** One rule for the owner, one rule for the agent with its own signer and policy: the agent's limit is enforced by the account itself, not by our server. Giving an agent a capped, revocable key took one `add_context_rule` call (and `remove_context_rule` revokes it).
- **Error codes are precise and testable.** `#3221 SpendingLimitExceeded` (over the cap), `#3223 NotAllowed` (a call other than `transfer`, e.g. `approve` on USDC) and `#3002 UnvalidatedContext` (another contract, or the agent naming the owner's rule) let us write on-chain tests for each case and show a rejected transaction as proof in the demo.
- **Simulation is a great test harness.** Signed simulations run `__check_auth` and the policy for real, so we test the full authorization path without spending budget or fees.
- **Confidential Tokens + auditor registry** gave us "confidential, not anonymous" out of the box: transfer amounts and balances are hidden on-chain, and each transfer carries encrypted copies for the sender's and the recipient's designated auditors.

## Friction and suggestions

### `spending_limit` fees are almost all storage rent
Each payment appends an entry to `spending_history`, and reading the policy data extends that entry to 30 days (`SPENDING_LIMIT_EXTEND_AMOUNT = 30 * DAY_IN_LEDGERS`, threshold 29 days), even though our window is ~24 h. On one agent payment we paid **9.864 XLM, of which 9.863 XLM was rent** and 0.0012 XLM compute. That afternoon (2026-10-25), testnet's live Soroban state (~4.14 GB) was above its 4.0 GB target, and our payments went from 3.2 to 11.1 XLM in three hours. The same evening the network setting `soroban_state_target_size_bytes` read 7.0 GB, and the same agent payment cost 0.0048 XLM. So the cost mostly follows the network's rent rate, but the 30-day lifetime of a 24-hour history makes each payment pay for far more rent than the window needs.
*Suggestion:* let the entry's TTL extension follow `period_ledgers` (or make it configurable), or offer a bucketed counter mode (spent per N ledgers) with constant storage size. (Entries outside the window are already pruned on each payment by `cleanup_old_entries`.)

### `spending_limit` only allows `transfer`
On a rule that carries the policy, any call other than a `transfer` with a readable amount is rejected with `#3223 NotAllowed`. That is safe, but it means an agent cannot be given a capped budget for anything else (a swap router, a payment contract): the value of those calls cannot be capped with this policy. We scoped the agent rule to `CallContract(USDC SAC)` and only `transfer`.
*Suggestion:* a policy that caps outgoing value for any call (for example based on balance deltas), or a clear note in the docs on this limit.

### Discovering rules
There is `get_context_rule(id)` and `get_context_rules_count()`. Ids are never reused after `remove_context_rule` (after our reset the agent's rule went from id 1 to id 2), and `get_context_rules_count()` counts active rules, so the active ids are not `0..count-1`. We scan ids until we have seen `count` rules.
*Suggestion:* a view that returns the active rule ids (or all active rules). The `context_rule_added` / `context_rule_removed` events already let an indexer follow changes.

### Rule selection is explicit
The client must pass `context_rule_ids` in the auth payload; there is no automatic fallback to another rule. That is the right security choice, but it surprised us at first.
*Suggestion:* one paragraph and an example in the docs ("the agent must name rule B; if it names the owner's rule, you get #3002").

### Questions we could not answer in 24 h
- Is there, or will there be, a per-transaction maximum policy? (Rules already support an expiry, `valid_until`; we did not use it.)
- Can a smart account hold a confidential balance directly, so an agent could pay confidentially from its own capped allowance?
- Could an allowance with a rolling window be checked inside the confidential-transfer circuit, so a cap applies to hidden amounts?

## Confidential Tokens
- Proving runs in the browser (bb.js needs `SharedArrayBuffer`), so the page needs cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`). Worth a highlighted note in the quick start.
- Recipients must be registered before they can receive (a transfer needs the recipient's viewing key), and received funds must be merged before they can be spent. Both are logical, but a user-facing flow needs a "pending → merge" step that is easy to forget in a demo.
- The auditor registry is set up with an `admin` and a `manager`; `register_key` and `rotate_key` take an `operator` that must hold a role. In our deployment one team account holds both. For a real company, it would help to document how the company itself can control the key of its own auditor id.

## Freighter and the RPC
- `signMessage` signs SEP-53 style: ed25519 over `sha256("Stellar Signed Message:\n" + message)`. We confirmed it in the extension code (`signBlob.ts`, `encodeSep53Message`). The API docs show the verification example with this prefix; naming SEP-53 there would help.
- `getEvents` retention on the testnet RPC is 120,960 ledgers (~7 days, from `getHealth`). Our activity feed rebuilds from events, so older private activity disappears from it.

## x402
Paying an x402 resource from a smart account that has a spending-limit policy is blocked today ([x402-foundation/x402#3764](https://github.com/x402-foundation/x402/issues/3764), open: the Stellar `exact` facilitator rejects the policy's `spending_limit_enforced` event). We kept x402 out of the submission rather than ship it untested.
