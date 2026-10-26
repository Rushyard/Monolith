# MONOLITH — HackMeridian 2026

> Fichier de référence unique du projet. À mettre à la racine du repo (ou à coller dans `CLAUDE.md`) pour que Claude Code le lise à chaque session.
> **Règle d'or : rien dans le code, le README, la vidéo ou le pitch qui ne soit vérifié sur testnet.**

---

## 0. TL;DR

| | |
|---|---|
| **Event** | HackMeridian, Lisbonne (ONE16), 25–26 oct. 2026 |
| **Deadline** | **Lundi 26 oct., 12h00** — objectif de soumission **11h30** |
| **Tracks** | Builder : **Genesis** · Thématique : **Stellar Composed** |
| **Équipe** | 2 personnes. **Toi = P1** (smart account + agent). **Mate = P2** (coffre confidentiel + frontend) |
| **Pitch** | *Ta trésorerie reste confidentielle. Ton agent ne peut dépenser que ce que le contrat lui autorise.* |
| **Moment fort de la démo** | L'agent paie 5 USDC seul ; il tente 50 USDC → **la transaction est rejetée par le réseau Stellar** (pas par notre serveur) ; l'owner approuve avec sa signature → ça passe. |

---

## 1. Le produit

### Utilisateur cible
Un freelance ou une petite équipe qui veut déléguer des paiements à un agent IA (outils, APIs, prestataires) **sans exposer sa trésorerie** et **sans donner les pleins pouvoirs à l'agent**.

### Problèmes
1. Sur une blockchain publique, soldes et montants payés sont lisibles par tous (clients, concurrents, salariés).
2. Donner un wallet à un agent = lui confier tout l'argent. Les « limites » vivent en général dans le code de l'agent, donc invérifiables.

### Solution
1. **Coffre confidentiel** (Confidential Tokens OpenZeppelin) : soldes et montants des transferts confidentiels cachés on-chain ; un auditeur autorisé peut révéler un montant précis.
2. **Agent à budget plafonné on-chain** (Smart Account OpenZeppelin + spending-limit policy) : sous le plafond l'agent agit seul ; au-delà, le réseau refuse. Seul l'owner débloque.

### Public vs caché — à dire mot pour mot
| Visible on-chain | Caché on-chain |
|---|---|
| Toutes les adresses (expéditeur, destinataire) | Soldes du coffre confidentiel |
| Dépôts dans le coffre et retraits du coffre | Montants des transferts confidentiels |
| Paiements de l'agent (budget public, plafonné) | |
| Le fait qu'une adresse a un compte confidentiel | |

**C'est confidentiel, pas anonyme.**

### Interdits dans le pitch (faux ou invérifiés)
- ❌ « swap confidentiel », « ta stratégie de trading est invisible »
- ❌ « impossible sur Ethereum/Solana » (Solana a Token-2022, le standard ERC-7984 vient d'Ethereum)
- ❌ APY, rendements, protocoles (Templar, Blend…) non testés par nous
- ❌ argument MEV / front-running (argument Ethereum, sera challengé)
- ❌ « premiers au monde » : Pocket, Lucent, Covenant, QuietBook existent

### Ce qui nous différencie (honnêtement)
Les wallets confidentiels existent (Pocket, Lucent). Les agents plafonnés existent (Agent Card). **La combinaison trésorerie confidentielle + budget agent plafonné on-chain, avec une démo de bout en bout qui marche, est notre angle.** L'exécution prime sur l'idée.

---

## 2. Grille de notation (page Build)

Ordre de priorité du jury : **Adoption → Discovery → Continuation**. Revue **asynchrone** (vidéo + deck + repo + réponses) ; pitch live seulement pour les finalistes, **mercredi 28 oct.**

| Critère | Poids | Comment on le gagne |
|---|---|---|
| Alignement track | 20 % | Composed = smart accounts OZ + Confidential Tokens + (x402). Le dire explicitement. |
| Valeur utilisateur | 20 % | Persona concret (freelance/petite équipe), problème formulé simplement. |
| Exécution technique | 15 % | Tx hashes réels, cas d'échec démontré, tests de contrat. |
| Innovation | 15 % | La combinaison + le rejet on-chain visible en démo. |
| Progrès pendant le hack | 10 % | Commits fréquents, disclosure claire du travail antérieur. |
| Potentiel marché | 10 % | Trésorerie/paie (cas d'usage officiel des CT), agents qui paient (stratégie SDF 2026). |
| Design / UX | 10 % | Un juge comprend en 30 s. URL live obligatoire. |

**3 briques qui marchent > 8 briques à moitié faites.**

### Requis Genesis
- PoC ou MVP fonctionnel (une maquette seule est insuffisante)
- Tourne sur **Stellar testnet**
- Au moins une feature/standard/primitive Stellar intégrée
- Travail technique réalisé pendant le hack + problème, utilisateur cible, proposition de valeur

### Requis pour tous les projets
- Repo GitHub **public**
- README : résumé, problème, setup, installation, variables d'env, instructions de démo
- Overview d'architecture : comment Stellar est utilisé, **contract IDs**, wallets, intégrations, APIs
- Démo live **ou** vidéo ; **URL publique obligatoire** pour une app utilisateur
- Preuve d'une transaction on-chain testnet
- **Disclosure du travail antérieur** et de ce qui a été fait pendant l'event

### Le jury (ce qu'ils regardent)
- **SDF (majorité)** : adoption réelle, bonne utilisation de Stellar. **Bri** a codé la démo CT de référence (*Who Ate Gerald*) → elle vérifiera nos affirmations privacy. **Tyler van der Hoeven** (Frontier Lab) : bleeding-edge. **Jane Wang** : RWA. **Kelly Hendricks** : enterprise.
- **ROZO** (Shawn Muggle) : paiements stablecoin, x402 / MPP pour agents.
- **SocketFi** (TinkerPal) : smart wallets, passkeys, onboarding.
- **57Blocks** (Leo) : ingénierie sérieuse, PayFi (ils ont travaillé sur Huma) → on ne fait **pas** de PayFi.
- **BAF** (Daniela Henao, Laura Estupiñan) : impact, inclusion, LATAM.
- **Doris** (Functor Network) : gestion de clés pour agents.

---

## 3. Architecture

```
┌──────────────────────── Next.js (Vercel) ────────────────────────┐
│  Onglet COFFRE (client)            │  Onglet AGENT (chat)         │
│  - register / deposit / merge      │  - message → /api/intent     │
│  - confidential transfer           │  - carte d'approbation owner │
│  - vue auditeur (disclosure)       │  - raisonnement + historique │
│  Preuves générées dans le navigateur (bb.js / UltraHonk)          │
├────────────────────────────────────┴─────────────────────────────┤
│  API routes Next.js (serveur) : /api/intent, /api/agent/*         │
│  LLM → { action, amount, to }  →  Executor (clé agent, server-only)│
└───────────────┬──────────────────────────────────┬────────────────┘
                │                                  │
     Confidential Token (OZ)            Smart Account (OZ)
     + vérificateur UltraHonk           ├─ Règle A : owner (Delegated, Freighter) — plein pouvoir
       (Nethermind)                     └─ Règle B : CallContract(USDC SAC)
                │                           signer = agent (Ed25519 externe)
                │                           policy = spending_limit (ex. 10 USDC / 24 h)
                └──────────── Stellar testnet ───────────────┘
```

**Choix structurant : une seule app Next.js** (frontend + API routes). Un seul déploiement Vercel, pas de serveur Express séparé à héberger. La clé de l'agent vit uniquement dans les variables d'env serveur.

**Le pré-check côté serveur sert à l'affichage. La vraie barrière est la policy on-chain.** Le dire dans le README.

---

## 4. P1 — Smart account + agent plafonné (toi)

### Ce qu'on sait de la spending-limit policy OZ (vérifié)
- Plafond **cumulatif sur une fenêtre glissante** (rolling window), état stocké par `(account, context_rule_id)`.
- S'installe sur une règle **`CallContract`** et ne mesure **que les appels `transfer`** du token ciblé. Tout autre appel sur cette règle est rejeté (`NotAllowed`).
- Dépassement : erreur **`SpendingLimitExceeded` (#3221)**.
- Pas de bascule automatique entre règles (vérifié dans OZ v0.8.0) : c'est le **client qui choisit la règle** via `context_rule_ids` dans l'`AuthPayload`. L'agent ne peut citer que la règle B (il n'est pas signer de la règle A) ; au-delà du plafond, la tx est rejetée. Seule une tx signée par l'owner via la règle A fait passer le paiement.
- Max 15 règles de contexte par smart account.
- Option : une policy « plafond par transaction » (cf. `tx-max-policy` d'Agent Card) si on veut « max 10 USDC par paiement » en plus du cumul.

### Étapes
1. **Setup** : Stellar CLI ≥ 25.2, Rust + target `wasm32v1-none`. Identités testnet : `owner`, `agent`, `alice` (financées via friendbot).
2. **USDC testnet** : trustline USDC (émetteur Circle testnet) sur les comptes classiques, USDC via le faucet Circle. Récupérer l'adresse du **SAC USDC** (`stellar contract id asset --asset USDC:<ISSUER> --network testnet`).
3. **Déployer** depuis les WASM audités d'`OpenZeppelin/stellar-contracts` (exemples `examples/multisig/...`) :
   - le smart account (owner = **Delegated signer** = compte Freighter)
   - le vérificateur Ed25519 + l'agent comme **signer externe Ed25519**
   - la spending-limit policy
4. **Règles** : A = owner, sans policy. B = `CallContract(USDC SAC)`, signer agent, policy spending_limit.
5. **Approvisionner** le smart account en USDC.
6. **Test go/no-go (14h)** :
   - agent → `transfer` 5 USDC vers alice ✅ (garder le hash)
   - agent → `transfer` 50 USDC ❌ `SpendingLimitExceeded` (garder le hash de simulation/échec)
   - owner → `transfer` 50 USDC via Freighter ✅
7. **Backend** `POST /api/intent` :
   - LLM avec sortie structurée (zod) : `{ action: "pay" | "balance" | "history", amount?, to? }`
   - carnet de contacts (« Alice » → adresse) pour la démo
   - Executor : construit l'appel `transfer` USDC depuis le smart account, signe l'auth entry avec la clé agent, simule, envoie
   - si la simulation renvoie #3221 → répondre `{ status: "needs_owner_approval", unsignedXdr }`
8. **Approbation owner** : le frontend fait signer `unsignedXdr` par Freighter (Stellar Wallets Kit), puis soumet.
9. **Tests de contrat** (bonus exécution) : succès sous plafond, échec au-dessus, fenêtre glissante.

### Références P1
- Docs OZ : `docs.openzeppelin.com/stellar-contracts/accounts/smart-account` · `/context-rules` · `/signers-and-verifiers` · `/policies`
- Repo : `github.com/OpenZeppelin/stellar-contracts` (exemples multisig + spending-limit-policy)
- Référence la plus proche : `github.com/402md/agentcard` (smart account + spending limit + tx-max + x402). **S'en inspirer, le créditer dans le README, écrire notre propre code.**
- Accélérateur possible (alpha, à tester 15 min max) : `Soneso/stellar-agent-wallet` (`cargo install stellar-agent-cli`), commandes `smart-account`, `deploy-policy`, `get-spending-limit`.

---

## 5. P2 — Coffre confidentiel + frontend (mate)

### Ce qu'on sait des Confidential Tokens (vérifié)
- Wrapper autour de n'importe quel token SEP-41 (dont l'USDC via SAC). Soldes = **engagements de Pedersen**.
- Opérations : `register`, `deposit`, `merge`, `confidential_transfer`, `withdraw`.
- Preuves **UltraHonk** (circuits Noir d'OZ), vérifiées on-chain par le vérificateur de Nethermind.
- Rôles de la démo officielle : détenteur, destinataire de divulgation, **auditeur**.
- Extensions de conformité : gel par compte, allowlist (`ComplianceConfig`).
- Code stable : `OpenZeppelin/stellar-contracts` → `packages/confidential`, exemples `examples/confidential`. (L'ancienne branche `feat/confidential-verifier-ultrahonk` est supprimée.)
- Contrats et circuits audités par OZ Security (remédiation terminée fin juillet 2026, rapport pas encore publié). **Toujours testnet uniquement / developer preview.**

### Étapes
1. **11h30–14h** : cloner `stellar-confidential-token-demo` (OZ) et les exemples ; tester `stellar-confidential-token-sdk` (npm, communautaire). Déployer un wrapper CT sur l'USDC testnet. **Mesurer le temps de génération d'une preuve dans le navigateur.**
2. **Go/no-go (14h)** : un `confidential_transfer` réussi, montant illisible sur `stellar.expert/explorer/testnet/tx/<hash>`.
3. **14h–17h** : Next.js + `@creit-tech/stellar-wallets-kit`. Onglet Coffre : enregistrer, déposer, merger, transférer. Indicateur de chargement pendant les preuves.
4. **17h–19h** : vue auditeur (révéler le montant d'un transfert avec la clé de divulgation). Shell de l'onglet Agent.
5. **19h** : intégration avec P1.
6. **19h–23h** : carte d'approbation owner, affichage du raisonnement de l'agent, design. **Premier déploiement Vercel à 21h.**

### Références P2
- Annonce : `stellar.org/blog/developers/developer-preview-confidential-tokens-on-stellar`
- Docs privacy : `developers.stellar.org/docs/build/apps/privacy`
- Démo de Bri : `gerald.stellar.buzz` · code `github.com/stellar-experimental/who-ate-gerald`
- Prior art à lire (et à ne pas copier) : `github.com/justmert/pocket` (wallet public + privé, vendorise bb.js + SRS + circuits), `github.com/ToluLabs/Lucent` (paie et escrow confidentiels, couche de divulgation)

### Plan B si les CT bloquent
Si à **16h** aucun transfert confidentiel ne passe : le mate bascule à plein temps sur le frontend et le polish de P1. Monolith devient « agent avec garde-fou on-chain » (P1 + P3). On le présente honnêtement.

---

## 6. P3 — Bonus (seulement si P1 et P2 sont stables)

| Bonus | Vérif préalable (≤ 30 min) | Piège connu |
|---|---|---|
| **Swap Soroswap** (public, dans le budget agent) | Soroswap déployé sur testnet avec un pool USDC/XLM liquide ? Adresses via `soroswap-router-sdk` ou l'API Soroswap. | La spending-limit **rejette** l'appel au routeur (pas un `transfer`). Il faut une règle dédiée au routeur avec une policy custom, ou renoncer. Les tokens testnet Soroswap peuvent différer de l'USDC Circle. |
| **x402** (l'agent paie une API) | Facilitator OZ testnet + `@x402/stellar`. | Issue **x402 #3764** : le schéma Stellar rejette les paiements d'un smart account avec spending-limit. **Repli** : le smart account vire un budget plafonné vers la clé propre de l'agent, qui paie en x402. |
| **Passkey + relayer** (zéro seed phrase, zéro frais) | `smart-account-kit` / passkey-kit + relayer OZ. | La dérivation de clé doit suivre la dérivation canonique du SDK OZ, sinon fonds bloqués (dépôt possible, retrait impossible). |

**Swap dans le pitch : « l'agent peut payer (et swapper) dans son budget public ; la trésorerie reste dans le coffre ». Jamais « swap confidentiel ».**

---

## 7. Outillage — à installer avant de coder

### Claude Code (vérifié sur la doc Stellar)
```bash
# Skill officiel Stellar (contrats Soroban, SDKs, RPC, assets, wallets, tests, sécurité)
/plugin marketplace add stellar/stellar-dev-skill
/plugin install stellar-dev@stellar-dev

# Raven : MCP distant, doc Stellar + données live de l'écosystème
claude mcp add --transport http stellar-raven "https://raven.stellar.buzz/mcp"
# puis /mcp → Authenticate → connexion dans le navigateur
```
Dans chaque session : *« Run `stellar skill` and follow its conventions for every stellar command in this session. »* (guide intégré au Stellar CLI)

Réflexe : **toute affirmation technique passe par Raven avant d'entrer dans le README ou le pitch.**

### Toolchain
```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli      # vérifier: stellar --version  (≥ 25.2)
stellar network use testnet
stellar keys generate owner --fund
stellar keys generate agent --fund
stellar keys generate alice --fund
node -v                                 # ≥ 20
npm i -g vercel                         # ou le MCP Vercel
gh auth login                           # repo public dès le début
```

### Paquets npm (frontend / API)
```
@stellar/stellar-sdk
@creit-tech/stellar-wallets-kit
zod
groq-sdk            # ou @anthropic-ai/sdk
stellar-confidential-token-sdk   # à évaluer (P2)
soroswap-router-sdk              # P3 seulement
@x402/stellar @x402/fetch        # P3 seulement
```

---

## 8. Repo

```
monolith/
├── MONOLITH.md            # ce fichier (ou CLAUDE.md)
├── README.md
├── .env.example
├── contracts/             # policies custom éventuelles + scripts de déploiement
│   └── scripts/deploy-smart-account.sh
├── app/                   # Next.js
│   ├── app/
│   │   ├── page.tsx
│   │   ├── vault/         # onglet Coffre (P2)
│   │   ├── agent/         # onglet Agent (P1 UI)
│   │   └── api/
│   │       ├── intent/route.ts
│   │       └── agent/[...]/route.ts
│   └── lib/
│       ├── stellar.ts     # RPC, réseau, helpers tx
│       ├── smartAccount.ts
│       ├── confidential.ts
│       └── llm.ts
└── docs/
    └── architecture.md    # schéma + contract IDs + tx hashes
```

### `.env.example`
```
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_USDC_SAC=
NEXT_PUBLIC_SMART_ACCOUNT_ID=
NEXT_PUBLIC_CT_CONTRACT_ID=
AGENT_SECRET_KEY=          # server-only, jamais NEXT_PUBLIC
LLM_API_KEY=
```

### Conventions
- Commits petits et fréquents, préfixés `p1:`, `p2:`, `docs:`, `fix:`.
- Chaque contract ID et chaque tx hash de démo va immédiatement dans `docs/architecture.md`.
- Aucun secret commité.

---

## 9. Emploi du temps (nuit blanche, ~24 h)

### Dimanche
| Heure | Toi (P1) | Mate (P2) |
|---|---|---|
| 11h30–14h | Déployer smart account + règles + policy | Exemples CT, SDK, wrapper sur USDC, temps de preuve |
| **14h00** ⚠️ | **Go/no-go** : 5 ✅ / 50 ❌ / owner 50 ✅ | **Go/no-go** : transfert confidentiel illisible |
| 14h–17h | `/api/intent` : LLM + Executor | Next.js + Wallets Kit + onglet Coffre |
| 17h–19h | Approbation owner (XDR → Freighter) | Vue auditeur + shell Agent |
| **19h00** 🔗 | **Intégration** | |
| 19h–21h | 30 min de vérif Soroswap, puis swap ou tests d'échec | Carte d'approbation, raisonnement agent, **1er déploiement Vercel** |
| 21h–23h | Endpoints balance + historique | Design |
| 23h–23h45 | 💤 | Design |
| 23h45–00h30 | Relecture des commits | 💤 |

### Lundi
| Heure | Toi | Mate |
|---|---|---|
| 00h30–03h | Bonus P3 (x402 avec repli, ou passkey) sinon stabilisation | Erreurs, états de chargement, stabilisation du coffre |
| 03h–05h | **Test complet à deux sur l'URL Vercel, comme un juge** | |
| 05h–07h | README + `docs/architecture.md` | Pitch deck |
| 07h–08h | Corrections, redéploiement | |
| **08h00** 🧊 | **Gel des features** | |
| 08h–09h | Script de la vidéo ensemble | |
| 09h–10h30 | Enregistrement + montage (2–3 min) | |
| 10h30–11h30 | Soumission sur le portail | |
| **11h30** ✅ | **Soumis.** 30 min de marge. | |

---

## 10. Script de la vidéo (2 min 30)

1. **0:00–0:20 — Problème.** « Sur une blockchain publique, tout le monde voit ta trésorerie. Et donner un wallet à un agent IA, c'est lui donner tout ton argent. »
2. **0:20–1:00 — Coffre.** Dépôt (on montre qu'il est public), transfert confidentiel, ouverture de stellar.expert : montant illisible. Vue auditeur : montant révélé.
3. **1:00–1:50 — Agent.** « Paie 5 USDC à Alice » → passe seul. « Paie 50 USDC à Alice » → **rejet du réseau, lien explorer, erreur #3221**. Approbation owner avec Freighter → passe.
4. **1:50–2:15 — Architecture.** Schéma : smart account OZ, spending-limit, Confidential Tokens, ce qui est public / caché.
5. **2:15–2:30 — Suite.** Mainnet des CT, passkeys, x402, cas trésorerie/paie.

## 11. Pitch deck (6 slides)
1. Problème (2 phrases + persona)
2. Solution (le pitch en une ligne + le tableau public/caché)
3. Démo (3 captures : explorer illisible, rejet #3221, approbation)
4. Architecture + pourquoi Stellar (smart accounts OZ, CT natifs du réseau, frais faibles, USDC natif)
5. Ce qui a été fait pendant le hack vs avant (disclosure du travail antérieur)
6. Suite + équipe

---

## 12. README — squelette
```
# Monolith
One line pitch.
## Problem
## Solution
## What is public vs hidden on-chain   ← tableau
## Demo                                ← URL live + vidéo + tx hashes
## Architecture                        ← schéma + contract IDs
## How Stellar is used                 ← smart account OZ, spending_limit, Confidential Tokens, USDC SAC
## Setup / Install / Env vars / Run
## Limitations (honest)                ← testnet only, CT developer preview, entrées/sorties publiques, adresses visibles
## Prior work & what we built during HackMeridian
   - Travail antérieur : pattern du pipeline d'agent (planner LLM validé par schéma, gatekeeper déterministe, executor) et parties du prompt du planner, adaptés d'un de nos projets précédents. Tout le reste a été construit pendant HackMeridian.
   - Inspirations créditées : OpenZeppelin examples, Agent Card, Who Ate Gerald.
## Team
```

---

## 13. Checklist de soumission
- [ ] Repo public, README complet, `.env.example`
- [ ] `docs/architecture.md` avec contract IDs + tx hashes (succès, échec #3221, approbation owner, transfert confidentiel)
- [ ] URL Vercel live testée en navigation privée
- [ ] Vidéo 2–3 min
- [ ] Pitch deck
- [ ] Tracks : **Genesis** + **Stellar Composed**
- [ ] Disclosure du travail antérieur
- [ ] Aucune affirmation de la section « Interdits »

---

## 14. Risques et réponses
| Risque | Signal | Réponse |
|---|---|---|
| Déploiement smart account bloque | Pas de tx réussie à 13h30 | Tester `stellar-agent-cli` ou reprendre le flux d'Agent Card |
| CT bloquent | Pas de transfert confidentiel à 16h | Plan B : mate sur frontend/P1 |
| Preuves trop lentes dans le navigateur | > 30 s | Indicateur de progression, préparer des transferts à l'avance pour la vidéo |
| x402 refuse le smart account | Issue #3764 | Repli : budget viré vers la clé de l'agent |
| Swap refusé par la policy | `NotAllowed` sur le routeur | Abandonner les swaps |
| Vercel cassé lundi matin | — | Déployer dès dimanche 21h, redéployer à chaque merge |
| Fatigue | Bugs bêtes après 3h | Siestes de 45 min décalées, gel à 8h |

## 15. Glossaire express
- **Smart account** : un compte qui est un contrat ; il décide lui-même qui peut signer quoi.
- **Règle de contexte** : « pour tel appel de contrat, tels signataires et telles policies ».
- **Policy** : contrat qui ajoute une condition (ex. plafond de dépense).
- **SAC** : Stellar Asset Contract, l'interface Soroban d'un asset classique comme l'USDC.
- **Engagement de Pedersen** : nombre qui « verrouille » un montant sans le révéler.
- **UltraHonk** : système de preuve à divulgation nulle de connaissance utilisé par les CT.
- **Clé de divulgation** : permet à un auditeur de révéler un montant précis, et rien d'autre.
