# Architecture

> Chaque contract ID et chaque tx hash de démo est ajouté ici dès qu'il existe (testnet).

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

## Comptes testnet (P1)

Comptes classiques créés avec `stellar keys generate <nom> --network testnet --fund` (financés par friendbot). Les secrets restent dans le keystore local du Stellar CLI (`~/.config/stellar/identity/`), jamais dans le repo.

| Rôle | Adresse |
|---|---|
| owner (Delegated signer, Freighter) | `GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B` |
| agent (signer Ed25519 externe, server-only) | `GAJDU7KW7ZZ7DOOTEHV5WILNF2CPBAWJE332I7PEAFLSU7LIVIVDUD33` |
| alice (destinataire de démo) | `GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6` |

### Trustlines USDC (change-trust)

| Compte | Tx hash |
|---|---|
| owner | [`4af0b04a…`](https://stellar.expert/explorer/testnet/tx/4af0b04ac1fe19bd7ebdff0d622c914ee7d58674a0752bba15ae263ecd265c0d) |
| agent | [`988740c5…`](https://stellar.expert/explorer/testnet/tx/988740c558e1ca6aa4a15de70117acc59c6cf6460a19aa87f293346628f12a37) |
| alice | [`04615991…`](https://stellar.expert/explorer/testnet/tx/046159910798a72759be62ac430d687af1f12d901e3e1adcb8201c44ff49fe83) |

Le smart account est un contrat (`C…`) : il n'a pas besoin de trustline, son solde USDC vit directement dans le SAC.

## Contrats OpenZeppelin (P1)

Source : [`OpenZeppelin/stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts) tag **`v0.8.0`**, commit **`ddc327eb92d63709436da3a8455f641c2d5476c5`** (`soroban-sdk` 28, testnet en protocole 29). Code non modifié, compilé avec `stellar contract build --package <nom>` (stellar-cli 27.0.0, rustc 1.96.1). WASM versionnés dans `contracts/wasm/`.

| Exemple OZ | WASM | sha256 |
|---|---|---|
| `examples/multisig-smart-account/account` | `multisig_account_example.wasm` | `a22a4bf78858e965ae4c2676c974157e340f8acf99d2552bc9d3390b29e25201` |
| `examples/multisig-smart-account/ed25519-verifier` | `multisig_ed25519_verifier_example.wasm` | `1647f1db6a5fb0a5b1c992f351193dd82633619490ca6a8df094326a6561b898` |
| `examples/multisig-smart-account/spending-limit-policy` | `multisig_spending_limit_policy_example.wasm` | `997649dfe07b8bf76a6f90123a56a3cb1a5f145ed29b3b3415e3603089f0fbfb` |

Points vérifiés dans le code source v0.8.0 :
- `SpendingLimitExceeded` = **#3221** (`NotAllowed` = #3223), dans `packages/accounts/src/policies/spending_limit.rs`. MONOLITH.md indiquait #2221, une valeur d'une version antérieure.
- La fenêtre est exprimée en **ledgers** (`period_ledgers: u32`) et elle est glissante : les dépenses dont `ledger_sequence <= ledger_actuel - period_ledgers` sortent du cumul. 17 280 ledgers × ~5 s ≈ 24 h (clôture moyenne mesurée sur testnet : 5 s).
- Le **client choisit la règle** : `AuthPayload { signers, context_rule_ids }`. Il n'y a pas de bascule automatique vers une autre règle. Si l'agent cite la règle A, il est rejeté (`UnauthorizedSigner` #3016), car il n'en est pas signer.
- Signer External (agent) : il signe `sha256(XDR(AuthDigestPreimage { account, signature_payload, context_rule_ids }))`.
- Signer Delegated (owner) : il faut une auth entry supplémentaire pour l'owner, `__check_auth(preimage)` sur le smart account, que la simulation ne renvoie pas. Elle est construite dans `contracts/scripts/lib.ts`.

## Contract IDs (testnet)

| Contrat | ID |
|---|---|
| USDC SAC (Circle testnet, `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, home_domain `centre.io`) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Smart account | |
| Vérificateur Ed25519 | |
| Spending-limit policy | |
| Confidential Token | |

## Tx hashes de démo (testnet)

| Scénario | Hash |
|---|---|
| Agent → 5 USDC (succès) | |
| Agent → 50 USDC (échec #3221 SpendingLimitExceeded) | |
| Owner → 50 USDC (approbation) | |
| Transfert confidentiel | |
