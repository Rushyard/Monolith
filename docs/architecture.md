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

## Contract IDs (testnet)

| Contrat | ID |
|---|---|
| USDC SAC | |
| Smart account | |
| Vérificateur Ed25519 | |
| Spending-limit policy | |
| Confidential Token | |

## Tx hashes de démo (testnet)

| Scénario | Hash |
|---|---|
| Agent → 5 USDC (succès) | |
| Agent → 50 USDC (échec #2221) | |
| Owner → 50 USDC (approbation) | |
| Transfert confidentiel | |
