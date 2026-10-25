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

## P1 — Smart account + agent plafonné

> Section maintenue par P1. Résumé dans les tableaux partagés « Contract IDs » et « Tx hashes de démo » plus bas.

### Comptes testnet (P1)

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

### Contrats OpenZeppelin (P1)

Source : [`OpenZeppelin/stellar-contracts`](https://github.com/OpenZeppelin/stellar-contracts) tag **`v0.8.0`**, commit **`ddc327eb92d63709436da3a8455f641c2d5476c5`** (`soroban-sdk` 28, testnet en protocole 29). Code non modifié, compilé avec `stellar contract build --package <nom>` (stellar-cli 27.0.0, rustc 1.96.1). WASM versionnés dans `contracts/wasm/`.

| Exemple OZ | WASM | sha256 |
|---|---|---|
| `examples/multisig-smart-account/account` | `multisig_account_example.wasm` | `a22a4bf78858e965ae4c2676c974157e340f8acf99d2552bc9d3390b29e25201` |
| `examples/multisig-smart-account/ed25519-verifier` | `multisig_ed25519_verifier_example.wasm` | `1647f1db6a5fb0a5b1c992f351193dd82633619490ca6a8df094326a6561b898` |
| `examples/multisig-smart-account/spending-limit-policy` | `multisig_spending_limit_policy_example.wasm` | `997649dfe07b8bf76a6f90123a56a3cb1a5f145ed29b3b3415e3603089f0fbfb` |

Points vérifiés dans le code source v0.8.0 :
- `SpendingLimitExceeded` = **#3221** (`NotAllowed` = #3223), dans `packages/accounts/src/policies/spending_limit.rs`. MONOLITH.md indiquait #2221, une valeur d'une version antérieure.
- La fenêtre est exprimée en **ledgers** (`period_ledgers: u32`) et elle est glissante : les dépenses dont `ledger_sequence <= ledger_actuel - period_ledgers` sortent du cumul. 17 280 ledgers × ~5 s ≈ 24 h (clôture moyenne mesurée sur testnet : 5 s).
- Le **client choisit la règle** : `AuthPayload { signers, context_rule_ids }`. Il n'y a pas de bascule automatique vers une autre règle. Si l'agent cite la règle A, il est rejeté : `get_validated_context_by_id` exige que tous les signers d'une règle sans policy soient présents, donc l'erreur est `UnvalidatedContext` #3002, faute de signature owner.
- Signer External (agent) : il signe `sha256(XDR(AuthDigestPreimage { account, signature_payload, context_rule_ids }))`.
- Signer Delegated (owner) : il faut une auth entry supplémentaire pour l'owner, `__check_auth(preimage)` sur le smart account, que la simulation ne renvoie pas. Elle est construite dans `contracts/scripts/lib.ts`.

### Contract IDs P1 (testnet)

| Contrat | ID |
|---|---|
| USDC SAC (Circle testnet, `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, home_domain `centre.io`) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Smart account (`multisig_account_example`) | [`CC5D2NUS2GXAWMTK2DMSNJHVRGRH5GBEZNUMEPIOPBPQQJN6GDLO43KA`](https://stellar.expert/explorer/testnet/contract/CC5D2NUS2GXAWMTK2DMSNJHVRGRH5GBEZNUMEPIOPBPQQJN6GDLO43KA) |
| Vérificateur Ed25519 | [`CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB`](https://stellar.expert/explorer/testnet/contract/CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB) |
| Spending-limit policy | [`CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ`](https://stellar.expert/explorer/testnet/contract/CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ) |

Valeurs aussi dans `contracts/deployments.testnet.json`, produit par `npm run deploy` dans `contracts/`.

#### Règles de contexte du smart account (relues on-chain via `get_context_rule`)

| id | Nom | Type | Signer | Policy |
|---|---|---|---|---|
| 0 (A) | `owner` (créée `multisig` par le constructeur de l'exemple OZ, renommée) | `Default` | `Delegated(owner GCIFXLBR…RS7B)` | aucune : plein pouvoir |
| 1 (B) | `agent-usdc-10-24h` | `CallContract(USDC SAC)` | `External(vérificateur Ed25519, 123a7d56…2a3a)` = clé publique de l'agent | spending_limit : `spending_limit = 100000000` (10 USDC), `period_ledgers = 17280` (~24 h) |

#### Tx de déploiement / configuration

| Étape | Tx |
|---|---|
| Upload WASM vérificateur | [`da1fb1a4…`](https://stellar.expert/explorer/testnet/tx/da1fb1a43b2705a19553510ff996a3c1202ee844f027b32cd48ace1051e27702) |
| Création vérificateur | [`a7b7526c…`](https://stellar.expert/explorer/testnet/tx/a7b7526cb31660f78d70de37e71559c3d0de4c8b3cadb8bb9d6bd22f6a5631a6) |
| Upload WASM policy | [`042e846b…`](https://stellar.expert/explorer/testnet/tx/042e846b95e2b1ee53867c072899ffd8bf5f60fb3bbc58b8c1ac4492f663578a) |
| Création policy | [`2b0dfc9b…`](https://stellar.expert/explorer/testnet/tx/2b0dfc9b255cd04e5a234dbc13e1cd52434ad1484a1ed672627806dcce5b1c0e) |
| Upload WASM smart account | [`aa7b707b…`](https://stellar.expert/explorer/testnet/tx/aa7b707b3aab032a739d38f7d1c6835868c2a2b8e7d089ecfa8504d610243792) |
| Création smart account + règle A (constructeur) | [`a9781d7c…`](https://stellar.expert/explorer/testnet/tx/a9781d7c5bba0cecae0eee844ea0fc9b8bcb2b70b90d425ca74bef2601690768) |
| `add_context_rule` règle B, autorisée par l'owner via la règle A (auth Delegated) | [`3f92c989…`](https://stellar.expert/explorer/testnet/tx/3f92c989446c0f8957be7c74a91e26e99cdfd40fef7232615034c58f6f1202b2) |
| `update_context_rule_name(0, "owner")`, flux d'approbation owner : owner = source de la tx, auth imbriquée `__check_auth` en credentials « source account », une seule signature d'enveloppe (ce que fait Freighter) | [`f3c762b4…`](https://stellar.expert/explorer/testnet/tx/f3c762b4bc658eaa18fcda5fbbe67e9d55f3272c0bad400d252b5872bafc35a4) |

### Go/no-go P1 — 2026-10-25 (`npm run gonogo` dans `contracts/`) : 🟢 GO

État initial : smart account 60 USDC (3 × 20 USDC du faucet Circle, regroupés), budget agent 0 / 10 USDC.

| Scénario | Résultat | Tx |
|---|---|---|
| a) agent → 5 USDC vers alice (règle B, signature Ed25519 de l'agent) | ✅ succès, budget agent 5 / 10 | [`4ba72789…`](https://stellar.expert/explorer/testnet/tx/4ba72789cf7825eb285c743da14d92ad2de4971b9e793045b7889576e5449679) |
| b) agent → 50 USDC vers alice (règle B) | ✅ **rejetée par le réseau** : tx incluse dans un ledger, statut FAILED, `Error(Contract, #3221)` `SpendingLimitExceeded`. La simulation renvoyait déjà #3221. Aucun USDC n'a bougé. | [`cfda69da…`](https://stellar.expert/explorer/testnet/tx/cfda69da1eeeb89228f4e86b7673f214eb4c524843089632d8e7e51cdf01620c) |
| c) owner → 50 USDC vers alice (règle A, auth Delegated de l'owner) | ✅ succès, budget agent inchangé (5 / 10) | [`a394bd32…`](https://stellar.expert/explorer/testnet/tx/a394bd32034d6b7fdf4b4cb62837193f0b8db9b67c149c805345eec028660eb7) |
| Remise à zéro : alice renvoie 55 USDC au smart account | ✅ | [`530e836a…`](https://stellar.expert/explorer/testnet/tx/530e836a4021b07c8ff9aa2a6d9f9b9e79d63685eca9acde36c665642b503648) |

Regroupement initial des USDC vers le smart account : owner [`73c36e30…`](https://stellar.expert/explorer/testnet/tx/73c36e3098a5a57b7a48c843a1bf89854805ddfd47fdd515f7aced6c8b44af49), agent [`1df5bcf8…`](https://stellar.expert/explorer/testnet/tx/1df5bcf88ef10cf5179d96e84fb9ba4787b564ddd55d7b7584cc9667b209f8aa), alice [`d56034e3…`](https://stellar.expert/explorer/testnet/tx/d56034e33ec5c670185ab70859804c0c2c534a973c3c21f67ec3cd2603837d9a).

Pour la tx b), la simulation échoue et ne fournit donc pas d'empreinte de stockage (footprint). Le script la récupère en simulant un transfert de 1 USDC avec le même nonce, puis soumet la tx de 50 USDC signée : c'est le réseau qui l'exécute et la rejette.

### Pipeline agent (`/api/intent`), testé sur testnet le 2026-10-25

| Test | Résultat | Tx |
|---|---|---|
| Executor : « paie 0.5 USDC à Alice » | AUTO_EXECUTE, signé par l'agent (règle B) | [`39a1395f…`](https://stellar.expert/explorer/testnet/tx/39a1395fdc44c211abf0a364a814e4bd8685dbb75177e8cc0441eb2962be8ab8) |
| Executor : « paie 6 USDC à Alice » (budget restant 4.5) | NEEDS_APPROVAL, tentative de l'agent **rejetée on-chain #3221** | [`bf62de1d…`](https://stellar.expert/explorer/testnet/tx/bf62de1d045d446bcd98028c652126970f96917f100d67dd4d6f08a6cebb3da7) |
| … puis `unsignedXdr` signé par l'owner (signature d'enveloppe, comme Freighter) | ✅ règle A | [`2a07f513…`](https://stellar.expert/explorer/testnet/tx/2a07f513e5a0a68426cf909df3375043a55808e3e6518a34b0a7cdce54821e2b) |
| HTTP `POST /api/intent` « paie 0.3 USDC à Alice » | AUTO_EXECUTE | [`7b59cc04…`](https://stellar.expert/explorer/testnet/tx/7b59cc0492681770cbf321c60c52d0e585b0a554d78c8593fd7f351caa18b9ac) |
| HTTP `POST /api/intent` « paie 50 USDC à Alice » | needs_owner_approval + rejet on-chain #3221 | [`3560dba5…`](https://stellar.expert/explorer/testnet/tx/3560dba557df6c6bedc61c863111d0942bedce6bf1fafb93db89d119fb4c3f0c) |

### Démo navigateur — `/agent-p1` avec Freighter (owner = Account 2 `GCIF…RS7B`, testnet), 2026-10-25 ~14:29 UTC

Flux complet validé manuellement : chat → planner → gatekeeper → tentative de l'agent → carte d'approbation → signature Freighter (`signTransaction`) → `POST /api/agent/submit`.

| Étape | Résultat | Tx |
|---|---|---|
| Tentative de l'agent au-dessus du plafond (source = agent, règle B) | **FAILED on-chain**, `SpendingLimitExceeded` #3221, ledger 5382987 | [`eb70b4a2…`](https://stellar.expert/explorer/testnet/tx/eb70b4a2cd5eaf80d7df9bed9aacac25ee7e99a100f0d35d0b92015f16293676) |
| Approbation de l'owner signée dans Freighter (source = owner, règle A) | ✅ SUCCESS, ledger 5382996 | [`39a0634f…`](https://stellar.expert/explorer/testnet/tx/39a0634f3ea7df229504c3b152342fc111d60be057df00e5007ebb5b34884243) |

Remboursements d'alice vers le smart account : [`42d70ea9…`](https://stellar.expert/explorer/testnet/tx/42d70ea967e2643ae63aec7d923a6626720f8ebc95f1a3445fe3297888510c81), [`ea88ec4d…`](https://stellar.expert/explorer/testnet/tx/ea88ec4d58642946ee0a215dbc0de6822984e381b73a86a8cd68fab5612f932d).

### Coffre → agent : « Approvisionner l'agent » (onglet Coffre)

`withdraw(from, to = smart account de l'agent, amount)` du coffre confidentiel : la sortie est **publique** (montant visible), le solde du coffre reste caché. Même appel `submitWithdraw` que le bouton (`ConfidentialVault.withdraw(amount, onPhase, to)`), testé avec `npm run ct:withdraw-to-contract -- CC5D…43KA` : smart account 60 → **61 USDC**, [`8a0cd48d…`](https://stellar.expert/explorer/testnet/tx/8a0cd48dce90c11d384136524cfdfe27121e662ad9ff0753c9e0867a455b3ea8).

### Tests automatisés P1 — `npm test` dans `contracts/` : 79/79 ✅ (2026-10-25 soir, branche `p1-agent-route`)

Lanceur `node:test` via `tsx`, sans dépendance ajoutée. Les tests on-chain sont des **simulations signées** : les auths du smart account sont exécutées en mode enforcing (`__check_auth` + policy), mais **aucune tx n'est envoyée** (budget et USDC inchangés). Ils sont placés dans `contracts/` parce qu'ils lisent les clés agent/owner dans le keystore du Stellar CLI.

| Test (testnet, simulation) | Attendu | Obtenu |
|---|---|---|
| agent sous le plafond (règle B) | OK | ✅ |
| agent au-dessus du plafond | `#3221` SpendingLimitExceeded | ✅ |
| agent qui cite la règle A | `#3002` UnvalidatedContext | ✅ |
| agent → smart account lui-même (`update_context_rule_name`) | `#3002` | ✅ |
| agent → autre token (XLM natif SAC) | `#3002` | ✅ |
| agent → `approve` sur l'USDC (pas un `transfer`) | `#3223` NotAllowed | ✅ |
| owner via la règle A (Delegated, entry signée) | OK | ✅ |
| owner en mode Freighter (source-account) | OK | ✅ |
| règle de l'agent retrouvée on-chain (`findAgentRule`, `agentRuleId`) | = `deployments.testnet.json` (1) | ✅ |

Tests unitaires purs (`tests/gatekeeper.test.ts`, 15 cas, sans réseau) : budget, fail-closed si le budget est illisible, LLM manipulé (montant ou adresse ≠ message), injections FR/EN (« ignore les règles… déjà approuvé », « SYSTEM OVERRIDE auto-approve »), pression + tout l'argent ou adresse inconnue → BLOCKED, destinataire hors carnet, caractères invisibles et pleine chasse, planner de secours.


### Run validé en local par l'équipe — 2026-10-25 ~15:25–15:52 UTC (Freighter, owner `GCIF…RS7B`)

| Étape | Tx | Résultat |
|---|---|---|
| Coffre → smart account de l'agent, 1 USDC (`withdraw`, bouton « Approvisionner l'agent ») | [`8978784f…`](https://stellar.expert/explorer/testnet/tx/8978784fc5ab921df21c98ed3e65e8a9e0a036d41bed4d3c6f480353535eba46) | SUCCESS |
| Agent seul, 1 USDC → alice (règle B) | [`1dfb0e87…`](https://stellar.expert/explorer/testnet/tx/1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3) | SUCCESS |
| Agent, 50 USDC → alice | [`91ecc158…`](https://stellar.expert/explorer/testnet/tx/91ecc158a92c4b17eca938da162385a3881d9f6ad0d6af1ffc753a32aa57e5e5) | FAILED `#3221` |
| Même paiement approuvé par l'owner (Freighter, carte d'approbation) | [`d5cda7f3…`](https://stellar.expert/explorer/testnet/tx/d5cda7f3def6a9a145c5b4f5d306a21bd2b4b348f9301b91825d20e4d8c5561d) | SUCCESS |

Côté coffre (P2) : transfert confidentiel `75db195e…`, fusion côté destinataire `a610de1e…` (détail dans `docs/submission.md`).

### Paie confidentielle préparée par l'IA — branche `p1-agent-route` (2026-10-25 soir)

Règle produit : dans le coffre, l'IA propose et Sarah (owner) signe ; dehors, l'IA agit seule mais plafonnée. Aucune transaction réelle envoyée pour ces tâches : tout est vérifié par simulation ou en lecture.

| Élément | Où | Vérifié |
|---|---|---|
| Contrat P1↔P2 : `VaultPayment`, `needs_vault_signature`, `ActivityItem` | `app/components/agent/types.ts` | `tsc` + build |
| Carnet : Alice `GDY5…BXH6` (hors coffre), Bob `GBCQZMHQ…B32GV` (bob du run e2e, inscrit, auditeur 1, clé non conservée), Carol `GDTMYTVU…XPH3` (inscrite, auditeur 1) | `app/lib/agent/contacts.ts` | `isRegistered` en simulation : Bob ✅, Carol ✅, Alice non inscrite |
| Routage privé / public, fail-closed | `app/lib/agent/vault.ts`, `app/app/api/intent/route.ts` | tests `routing.test.ts` + on-chain (Bob / Alice) |
| Paie (Carol 3, Bob 2) | `app/lib/agent/payroll.ts` | `payroll.test.ts` + LLM réel (fr/en/pt) |
| B12 session owner (SEP-53), mode démo simulé, 20 msg / 10 min / IP | `app/lib/agent/session.ts`, `OwnerSession.tsx` | `session.test.ts` ; flux complet testé avec la clé owner du keystore CLI (même digest SEP-53 que l'extension Freighter, lu dans `signBlob.ts` / `encodeSep53Message`) ; pas encore cliqué avec Freighter |
| B1 premier paiement | gatekeeper + `paidAddresses()` (Horizon) | `routing.test.ts` |
| A1 fautes de frappe (Damerau-Levenshtein) | `contacts.ts` | `names.test.ts` (12 tests) + LLM réel |
| A2/A3 champs manquants en code + mémoire 6 tours | `app/lib/agent/slots.ts` | `slots.test.ts` + LLM réel (« paie » → « 2 usdc » → « bob ») |
| A7 lectures `budget` / `address` | executor | `routing.test.ts` + LLM réel |
| B4 pause / reprise (XDR non signés) | `app/lib/agent/pause.ts`, `PauseBanner.tsx` | simulation : `remove_context_rule(1)` ~0,10 XLM de frais totaux ; `add_context_rule` ~0,021 XLM de frais ressources (dry-run reset-agent). Non envoyées. |
| Activité reconstruite on-chain, aucun montant privé | `app/lib/agent/activity.ts` | 38 éléments lus, 0 montant privé ; reçu `75db195e…` accepté, `1dfb0e87…` refusé (pas confidentiel) |
| Éval parsing | `eval/parsing.jsonl`, `npm run eval` | 44/44 (LLM sur 20/44, 429 Groq sur le reste → planner de secours) |

Rétention `getEvents` sur le RPC testnet : `ledgerRetentionWindow = 120960` ledgers (~7 jours), mesuré via `getHealth` le 2026-10-25.

### Frais d'un paiement de l'agent (vérifié le 2026-10-25, méta des tx via `getTransaction`)

Presque tout est du **loyer** (`rent_fee_charged`) : chaque paiement ajoute un `SpendingEntry` à l'entrée persistante `AccountContext(smart account, règle)` de la policy (`CAOT4R…`), que la policy prolonge à 30 jours (`SPENDING_LIMIT_EXTEND_AMOUNT = 30 * DAY_IN_LEDGERS`, seuil 29 j, `spending_limit.rs` @ `ddc327eb`). Le calcul coûte ~0,0012 XLM.

| Tx (agent, source = `GAJD…D33`) | Historique policy | Frais | dont loyer |
|---|---|---|---|
| [`4ba72789…`](https://stellar.expert/explorer/testnet/tx/4ba72789cf7825eb285c743da14d92ad2de4971b9e793045b7889576e5449679) (création de l'entrée, TTL → 5900381) | 0 → 1 | 30,795 XLM | 30,794 |
| `39a1395f…` | 1 → 2 | 3,209 | 3,208 |
| `7b59cc04…` | 2 → 3 | 3,209 | 3,208 |
| `bff713c7…` | 3 → 4 | 3,653 | 3,652 |
| `b229e085…` | 4 → 5 | 3,841 | 3,839 |
| [`b6fb0519…`](https://stellar.expert/explorer/testnet/tx/b6fb05198fdc02dc4ee07213da0e494269348fa621aa0dcc10b59e8835febb2e) | 5 → 6 | 7,556 | 7,554 |
| [`1dfb0e87…`](https://stellar.expert/explorer/testnet/tx/1dfb0e874f56980a54c4c8fcbd550230105bc216619a63543062e62e8534d4d3) | 6 → 7 | 9,864 | 9,863 |
| [`e2a14595…`](https://stellar.expert/explorer/testnet/tx/e2a145957c68894f946a59eb7cc81d216610bea76507203e0e58244c137b962a) (0,5 USDC, 16:11 UTC, via la prod) | 7 → 8 | 11,146 | 11,144 |

Pourquoi ça monte : `stellar network settings --internal` (testnet, 16:15 UTC) donne `soroban_state_target_size_bytes` = 4,0 Go, `live_soroban_state_size_window` 4,056 → 4,141 Go sur ~2,7 h, `soroban_state_rent_fee_growth_factor` = 5000 : au-dessus de la cible, le loyer par octet grimpe. Simulation du paiement suivant : ~12,8 XLM. Solde XLM de l'agent : 9926,7 XLM → ~770 paiements au tarif du moment (moins si le tarif monte encore). Le reset (`add_context_rule`, payé par l'owner, 7543 XLM) est estimé à ~56,8 XLM en dry-run. Mainnet non mesuré.

## Contract IDs (testnet)

| Contrat | ID |
|---|---|
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Smart account | `CC5D2NUS2GXAWMTK2DMSNJHVRGRH5GBEZNUMEPIOPBPQQJN6GDLO43KA` — détails P1 ci-dessus |
| Vérificateur Ed25519 | `CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB` |
| Spending-limit policy | `CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ` |
| Confidential Token (USDC) | `CAYYT5UWB22VLV4Z7DU7DN7V6XFPGIDP5ZD3HV4S6HVQMCGLI5CFLERJ` — détails P2 ci-dessous |
| Registre d'auditeurs Monolith | `CB5YIDSUCNESNOJK2UFFJA6E3O5BGAPYEQ6F353WGNM4UBGGX3H45IGQ` (auditeur #1) |

## Tx hashes de démo (testnet)

| Scénario | Hash |
|---|---|
| Agent → 5 USDC (succès) | [`4ba72789…`](https://stellar.expert/explorer/testnet/tx/4ba72789cf7825eb285c743da14d92ad2de4971b9e793045b7889576e5449679) |
| Agent → 50 USDC (échec #3221) | [`cfda69da…`](https://stellar.expert/explorer/testnet/tx/cfda69da1eeeb89228f4e86b7673f214eb4c524843089632d8e7e51cdf01620c) · depuis l'app : [`eb70b4a2…`](https://stellar.expert/explorer/testnet/tx/eb70b4a2cd5eaf80d7df9bed9aacac25ee7e99a100f0d35d0b92015f16293676) |
| Owner → 50 USDC (approbation) | [`a394bd32…`](https://stellar.expert/explorer/testnet/tx/a394bd32034d6b7fdf4b4cb62837193f0b8db9b67c149c805345eec028660eb7) · avec Freighter depuis l'app : [`39a0634f…`](https://stellar.expert/explorer/testnet/tx/39a0634f3ea7df229504c3b152342fc111d60be057df00e5007ebb5b34884243) |
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

### Paie confidentielle — membres du coffre (2026-10-25, `npm run ct:register-member`)

Personnages : **Sarah** = owner `GCIF…RS7B` (Freighter), **Alice** et **Bob** = salariés, **Marc** = comptable = auditeur #1.
[`scripts/register-member.ts`](../scripts/register-member.ts) ouvre un compte coffre pour une clé passée en `MEMBER_SECRET` :
trustline USDC si absente, puis `register` avec l'auditeur #1. La clé confidentielle est dérivée comme dans l'app avec Freighter
(signature Ed25519 du payload SEP-53 de `skSigningMessage(token, compte)`, puis `deriveSk`) : rien n'est écrit sur disque, et le même
compte importé dans Freighter retrouve la même clé dans `/vault`. Idempotent (relancé sur Bob : « already registered »).

| Membre | Adresse | Étape | Tx (testnet) |
|---|---|---|---|
| Bob (clé : keystore Stellar CLI local, alias `bob`) | `GA5HRQORQCUWGG6ACM6SMLWJO75Q7BWFGERVOBLR4FVSSQGZPPHE5NJH` | friendbot `create_account` | [`5f682661…`](https://stellar.expert/explorer/testnet/tx/5f68266116239d27f190d2dd0f9218cfa69d0b37e2c41911a4a47b7a91a6eb85) |
| | | trustline USDC | [`d07ca741…`](https://stellar.expert/explorer/testnet/tx/d07ca741601f7f71020e23f09c7d2721f69fc3130b7ba6af04870dff7d654a8c) |
| | | `register` (auditeur #1, preuve vérifiée on-chain), ledger 5387045 | [`44db85ba…`](https://stellar.expert/explorer/testnet/tx/44db85ba5ff4b044b6c3388661469a6ad847d279791b9a83c0dbad049fa6def6) |
| Alice (carnet de l'agent, clé : identité `alice` de P1) | `GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6` | `isRegistered` = **false** au 2026-10-25 20:05 UTC | à faire : `MEMBER_SECRET=$(stellar keys show alice) npm run ct:register-member` |

**Coffre de Sarah** (lu on-chain le 2026-10-25 ~20:05 UTC) : inscrite, auditeur #1, solde en attente vide.
Événements publics : `deposit` 10 USDC [`4bd33026…`](https://stellar.expert/explorer/testnet/tx/4bd330265fcdfcfef343a8ca26ec667e92f0fa8cab39de771cda44b06e81ca04),
`deposit` 1 USDC [`17156e05…`](https://stellar.expert/explorer/testnet/tx/17156e05a6f2a3d55ac2e22c9d49a76550515b2beb21af7e80965f5d73fa950f),
`withdraw` 1 USDC vers le smart account [`8978784f…`](https://stellar.expert/explorer/testnet/tx/8978784fc5ab921df21c98ed3e65e8a9e0a036d41bed4d3c6f480353535eba46),
et un `confidential_transfer` au montant caché vers `GDTM…XPH3` [`75db195e…`](https://stellar.expert/explorer/testnet/tx/75db195e4ad59a0cf12e0a15e99a21f44b59b5813d62012cb2f7a4e224256bfc).
Solde disponible = 10 − (montant caché) < 10 USDC. Solde USDC public : 9 USDC.

Réapprovisionnement pour la paie (Sarah, `/vault` + Freighter, 2026-10-25 20:14 UTC) :
`deposit` 9 USDC [`a780cdd5…`](https://stellar.expert/explorer/testnet/tx/a780cdd5ca08eef57ae301a829d6066699b951bb0d512c9823761cc27835e0c3) (ledger 5387133),
`merge` [`37db3c35…`](https://stellar.expert/explorer/testnet/tx/37db3c3510f412ed5eefa002be93e11cab266b9cd3fadb79684a70aaeb511113) (ledger 5387135).
Solde en réception relu vide après le merge ; solde disponible = 19 − (montant caché de `75db195e…`), lisible seulement par Sarah (`/vault`) ou Marc (`/auditor`).
(Un premier essai est parti du mauvais compte Freighter, `GCXA…FI3H` : `4c518bc5…` / `7ac0b7a9…`, sans effet sur le coffre de Sarah.)

### Paie confidentielle préparée par l'agent, signée par Sarah — preview `p2-vault-agent`, 2026-10-25 20:28 UTC

Flux : `/agent` → « verse les salaires » → `/api/intent` renvoie `needs_vault_signature` (Carol 3 + Bob 2, montants fixés dans
`lib/agent/payroll.ts`, pas par le LLM) → **VaultPayCard** : pour chaque paiement, lecture de l'état du coffre → preuve `transfer`
dans le navigateur → signature Freighter de Sarah (`GCIF…RS7B`) → réseau → `POST /api/agent/vault-receipt { to, hash }` (sans montant).
L'agent n'a ni la clé du coffre ni son solde. URL : https://monolith-git-p2-vault-agent-oskarcouliou-4325s-projects.vercel.app/agent (preview, pas la prod).

| Paiement | Tx | Ledger | Résultat |
|---|---|---|---|
| Sarah → Carol `GDTM…XPH3`, `confidential_transfer` | [`5b1f9b15…`](https://stellar.expert/explorer/testnet/tx/5b1f9b15572ebce6c15098802a62858be165332b72bd92d962823d3517b0e2d6) | 5387304 | SUCCESS, source `GCIF…RS7B` |
| Sarah → Bob `GBCQ…32GV`, `confidential_transfer` | [`038ecfcf…`](https://stellar.expert/explorer/testnet/tx/038ecfcfa42b43da9dbc9576cac6f21f7b41fbded9f4ab5417e2c0c55631710f) | 5387308 | SUCCESS, source `GCIF…RS7B` |

Vérifié : les deux événements `transfer` du token n'ont pas de champ montant (seulement les chiffrés `vTilde`, `vAudR`, `vAudS`…) ;
`GET /api/agent/activity` liste les deux reçus en `channel: private`, `kind: paid`, sans `amountUsdc`.
**Lecture par Marc (auditeur #1), 2026-10-25 ~20:50 UTC** : clé d'audit vérifiée contre le registre (`k·H == get_key(1)`),
puis déchiffrement des événements, en script (`auditTransfer`) et dans la page `/auditor` (dev local) :

| Tx | Public (stellar.expert, `/auditor` sans clé) | Marc |
|---|---|---|
| `5b1f9b15…` Sarah → Carol | chiffré | **3.00 USDC**, solde de Sarah après : 6.00 |
| `038ecfcf…` Sarah → Bob | chiffré | **2.00 USDC**, solde de Sarah après : 4.00 |

Les deux canaux d'audit (destinataire, émetteur) concordent. Solde du coffre de Sarah après la paie : 4.00 USDC (lu par l'auditeur).

### Run complet sur la preview `p2-vault-agent` (Sarah connectée, `SESSION_SECRET`), 2026-10-25 21:22–21:24 UTC

Avant : reset du budget agent par l'owner (`npm run reset-agent`) — `remove_context_rule(1)` [`4f8eeaf7…`](https://stellar.expert/explorer/testnet/tx/4f8eeaf722708c30ce3438de0c3748b70df17d9af47b2597d2ab2c5bcd358234),
`add_context_rule` → règle B id 2 [`3167d0ac…`](https://stellar.expert/explorer/testnet/tx/3167d0ac4006cff2e06b2fd96cecc2e21247bae91dfef3225570e72792f0a0b8) ; budget relu 0 / 10 USDC.
Visiteur non connecté : `mode: "simulation"`, résultat `simulated`, budget inchangé (rien n'est envoyé).

| Étape | Tx | Ledger | Résultat (vérifié via Horizon / RPC `getTransaction`) |
|---|---|---|---|
| Coffre → smart account de l'agent, 10 USDC (`withdraw`, public) | [`38d8f730…`](https://stellar.expert/explorer/testnet/tx/38d8f730f7f4b4ab6b6f69d07849eec0fb21e0cf7db21b2aa8e8a9d17ed92ef9) | 5387951 | SUCCESS, source Sarah |
| Agent seul, 1 USDC → Alice (USDC `transfer`, règle B) | [`635685b9…`](https://stellar.expert/explorer/testnet/tx/635685b9ed8f9fc2c9340a2eab762b003fefef78deccaeb29be5cfd5e682d55b) | 5387956 | SUCCESS, source agent |
| Agent, 50 USDC → Alice | [`fce3ce82…`](https://stellar.expert/explorer/testnet/tx/fce3ce827bcba9076faa55d36f30bcca5caf59f90c6f9af8d50e2a2e6e44785a) | 5387959 | **FAILED `#3221`** |
| Même paiement approuvé par Sarah (Freighter, règle A) | [`750cbd98…`](https://stellar.expert/explorer/testnet/tx/750cbd9862ba0f665c7fe0049e297d8d7340a823d10503e6e3648bf7f63ec9c2) | 5387962 | SUCCESS, source Sarah |
| Paie : Sarah → Carol, `confidential_transfer` (VaultPayCard) | [`2c027f5f…`](https://stellar.expert/explorer/testnet/tx/2c027f5f789398ec4f66d56f0c8f7561649fd06db05d6237a7b4dfffd25f9e45) | 5387969 | SUCCESS, événement sans montant |
| Paie : Sarah → Bob, `confidential_transfer` (VaultPayCard) | [`5d8a77ec…`](https://stellar.expert/explorer/testnet/tx/5d8a77eca33f4d96ccff28fb460466240db8d4b1c03528670466c30629eb6941) | 5387972 | SUCCESS, événement sans montant |

`/api/agent/activity` après le run : public Alice 1 (payé), public Alice 50 (refusé), public Alice 50 (payé), privé Carol et Bob (payé, sans montant).

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

### v2 browser run — live app + Freighter (Firefox), 2026-10-25 13:46 UTC

Account `GD46SGQRPKDSWAS665C7OWIPY6TBWRMSSNZLAHZJDFBDAMPBRCYLRLAB` → `GCXA…FI3H` (both registered with auditor #1). Proofs generated in the browser.

| Step | Public? | Tx |
|---|---|---|
| `register` (proof 1.3 s) | — | `e0a242…2cb1e9` |
| `deposit` 10 USDC | **amount public** | [`aa356955…`](https://stellar.expert/explorer/testnet/tx/aa356955c552236f50fced2993de5f0f72908b07f6c7b2ad3d8f502008b51e20) |
| `merge` | — | `f79f2f…3a7a65` |
| **`confidential_transfer` 2.5 USDC** (proof 1.9 s) | **amount hidden** | [`2e6d3957…`](https://stellar.expert/explorer/testnet/tx/2e6d3957b08d96eba12cb7299a16504e266c2a665109e696d20bc76818b2c76b) |
| `/auditor`: shared public key → refused · our key → 2.50, sender balance after 7.50 | off-chain | — |

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
