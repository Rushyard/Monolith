# x402 — tester l'option B en local

> Branche `x402` (partie de `p1`). Le code est écrit et couvert par des tests unitaires sans réseau (20/20), mais **aucun paiement x402 n'a encore été fait sur testnet** : je n'avais ni les clés ni l'accès au facilitator. Rien de ce flux ne va dans le README ou le pitch tant que les étapes 5 à 8 ci-dessous ne sont pas passées et que leurs hashes ne sont pas dans `docs/architecture.md`.

## Ce qui est implémenté

```
« recharge ton compte de 0.1 USDC »          « donne-moi les données de marché »
            │                                              │
   /api/intent → planner → gatekeeper              /api/intent → planner → gatekeeper
            │  action topup (≤ 1 USDC)                     │  action market_data (0,01 USDC)
            ▼                                              ▼
 Smart account ──transfer USDC (règle B, signé agent,   Compte G de l'agent ──@x402/fetch──► GET /api/premium/market-data
 compté dans la spending-limit 10 USDC / 24 h)──►            (signe l'auth entry du transfert)      │ withX402 (@x402/next)
                         Compte G de l'agent                                                       ▼
                                                                         facilitator https://x402.org/facilitator
                                                                         verify → handler → settle (tx on-chain, frais payés
                                                                         par le facilitator) → header PAYMENT-RESPONSE
```

Pourquoi ce détour (option B, MONOLITH.md §6) : l'issue x402 #3764, le schéma Stellar « exact » rejette les paiements signés par un smart account avec spending-limit. Le smart account garde la barrière on-chain sur le topup ; le compte G de l'agent ne détient que ce qui a été rechargé.

| Fichier | Rôle |
|---|---|
| `app/lib/x402/config.ts` | réseau `stellar:testnet`, facilitator, prix 0,01 USDC, `payTo`, plafond topup 1 USDC |
| `app/lib/x402/server.ts` | `x402ResourceServer` + `ExactStellarScheme` (serveur), config de route, handler `withX402` |
| `app/lib/x402/client.ts` | client de l'agent : `createEd25519Signer` + `ExactStellarScheme` (client), spend controls et politique (USDC du projet, ≤ 0,01 USDC, `exact`, `stellar:testnet`) |
| `app/app/api/premium/market-data/route.ts` | la route payante |
| `app/lib/agent/{planner,gatekeeper,executor}.ts` | actions `topup` et `market_data` |
| `app/scripts/x402-buy.ts` | achat x402 en CLI, sans agent ni LLM |
| `app/tests/x402.test.ts` | 20 tests unitaires |

### Isolation du SDK v16

`@x402/stellar@2.28.0` dépend de `@stellar/stellar-sdk ^16.3.0`, l'app est en `17.3.0`. Comme les plages ne se recoupent pas, npm installe une copie imbriquée (`app/node_modules/@x402/stellar/node_modules/@stellar/stellar-sdk` = 16.4.1). En plus :

- `app/lib/x402/` est le seul code applicatif qui importe `@x402/*`, et il n'importe jamais `@stellar/stellar-sdk` ni `lib/agent/core` ;
- seules des strings traversent la frontière (clé secrète `S…`, adresses, montants) : aucun `Keypair`/`xdr`/`Transaction` v17 n'arrive dans du code v16 ;
- `next.config.ts` : `serverExternalPackages: ["@x402/stellar", "@x402/core", "@x402/fetch"]`, pour que Next ne bundle pas ces paquets et que Node résolve chaque copie du SDK à sa place ;
- les trois premiers tests de `app/tests/x402.test.ts` vérifient les versions installées, le fichier que Node charge vraiment pour `@x402/stellar`, les frontières d'import, et qu'une même clé secrète donne la même adresse G en v16 et en v17.

Vérification manuelle : `cd app && npm ls @stellar/stellar-sdk` doit afficher `17.3.0` à la racine et `16.4.1` sous `@x402/stellar`.

## 0. Prérequis

- Node ≥ 20, `jq`, Stellar CLI avec les identités `agent`, `owner`, `alice` (celles de `docs/architecture.md`).
- Compte G de l'agent `GAJDU7KW…UD33` : trustline USDC déjà en place (tx `988740c5…`).
- `payTo` par défaut = alice `GDY5SERG…BXH6`, trustline USDC déjà en place (tx `04615991…`).
- Budget de l'agent (règle B) non épuisé : le topup compte dans les 10 USDC / 24 h.

## 1. Installer et lancer les tests unitaires

```bash
git fetch origin x402 && git checkout x402
cd app
npm ci
npm ls @stellar/stellar-sdk      # 17.3.0 à la racine, 16.4.1 sous @x402/stellar
npm test                         # 20 tests, sans réseau ni clé
cd ../contracts && npm ci && npm run test:unit && cd ../app   # tests gatekeeper existants (15)
```

> `@stellar/freighter-api` est importé par `components/agent/ApprovalCard.tsx` mais absent de `app/package.json` sur `p1` (côté P2). Si `npx tsc --noEmit` ou `npm run build` échoue sur ce module : `npm i --no-save @stellar/freighter-api` (ou merger la branche de P2). Ce n'est pas lié à x402.

## 2. Vérifier que le facilitator supporte `stellar:testnet`

Je n'ai pas pu joindre `https://x402.org/facilitator` depuis mon environnement : **c'est le premier point à vérifier.**

```bash
curl -s https://x402.org/facilitator/supported | jq '.kinds[] | select(.network == "stellar:testnet")'
```

Attendu : au moins une entrée `{"scheme": "exact", "network": "stellar:testnet", "extra": {"areFeesSponsored": true}, …}`. Le client Stellar exige `areFeesSponsored: true` (le facilitator est la source de la tx et paie les frais).

Si rien ne sort : ce facilitator ne gère pas Stellar testnet. Il faut un facilitator qui l'annonce (MONOLITH.md cite le facilitator OZ testnet) ; mets son URL dans `X402_FACILITATOR_URL` (étape 3) et refais ce `curl` avec elle.

## 3. Variables d'environnement

```bash
# depuis app/
printf 'AGENT_SECRET_KEY=%s\n' "$(stellar keys show agent)" >> .env.local
# facultatif : LLM (sinon le planner de secours comprend les phrases de la démo)
# echo 'LLM_API_KEY=gsk_...' >> .env.local
# facultatif : autre facilitator / autre bénéficiaire
# echo 'X402_FACILITATOR_URL=https://...' >> .env.local
# echo 'X402_PAY_TO=G...' >> .env.local
```

## 4. Démarrer l'app et voir le 402

```bash
npm run dev          # http://localhost:3000
```

Dans un autre terminal :

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/premium/market-data
# → 402

curl -s -D - -o /dev/null http://localhost:3000/api/premium/market-data \
  | grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\r' | jq -R '@base64d | fromjson | .accepts'
# → [{ "scheme": "exact", "network": "stellar:testnet", "amount": "100000",
#      "asset": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
#      "payTo": "GDY5SERG…BXH6", "extra": { "areFeesSponsored": true }, … }]
```

Un **500** à cette étape veut presque toujours dire que `GET <facilitator>/supported` a échoué ou n'annonce pas `stellar:testnet` : regarde le terminal de `npm run dev` (message `Failed to fetch supported kinds from facilitator` ou `RouteConfigurationError`), puis reviens à l'étape 2.

## 5. État de départ

```bash
cd ../contracts && npm run status && cd ../app
```

Note le **solde agent (G)**, le solde d'alice et le budget restant de l'agent.

## 6. Scénario de démo via l'agent (`/api/intent`)

À faire dans cet ordre. Même chose dans le navigateur sur http://localhost:3000/agent-p1 en tapant les mêmes phrases.

**a) Données de marché avec un compte agent vide → `needs_topup`** (seulement si le solde agent (G) est < 0,01 USDC)

```bash
curl -s localhost:3000/api/intent -H 'Content-Type: application/json' \
  -d '{"message":"donne-moi les données de marché"}' | jq '{verdict: .verdict.verdict, result: .result}'
# → verdict "AUTO_EXECUTE", result.status "needs_topup"
```

**b) Topup refusé au-delà de 1 USDC → `BLOCKED`, aucune tx**

```bash
curl -s localhost:3000/api/intent -H 'Content-Type: application/json' \
  -d '{"message":"recharge ton compte de 2 USDC"}' | jq '{verdict: .verdict.verdict, triggered: .verdict.triggered, status: .result.status}'
# → "BLOCKED", ["topup-max"], "blocked"
```

**c) Topup de 0,1 USDC → `topped_up`** (tx on-chain, signée par l'agent via la règle B)

```bash
curl -s localhost:3000/api/intent -H 'Content-Type: application/json' \
  -d '{"message":"recharge ton compte de 0.1 USDC"}' | jq '{verdict: .verdict.verdict, result: .result}'
# → "AUTO_EXECUTE", result.status "topped_up", result.explorerUrl, result.agentUsdc
```

**d) Données de marché → `x402_paid`** (paiement x402 de 0,01 USDC depuis le compte G de l'agent)

```bash
curl -s localhost:3000/api/intent -H 'Content-Type: application/json' \
  -d '{"message":"donne-moi les données de marché"}' | jq '{status: .result.status, payer: .result.payer, payTo: .result.payTo, settlement: .result.settlement, pairs: .result.data.pairs}'
# → status "x402_paid", settlement.transaction = hash de la tx réglée par le facilitator
```

**e) Vérifier on-chain**

```bash
cd ../contracts && npm run status && cd ../app
# agent (G) : +0,1 puis −0,01 ; alice (payTo) : +0,01 ; budget agent : −0,1 (le topup), le paiement x402 n'y touche pas
```

Ouvre `result.explorerUrl` (topup) et `result.settlement.explorerUrl` (x402) sur stellar.expert. Attendu (à confirmer, pas encore observé) : la tx x402 a pour source le compte du facilitator, qui paie les frais, et contient un `transfer` USDC `agent → alice` de `100000` unités.

## 7. Achat x402 seul (sans agent ni LLM), pour isoler un problème

```bash
# depuis app/, avec npm run dev lancé
AGENT_SECRET_KEY=$(stellar keys show agent) npm run x402:buy -- http://localhost:3000/api/premium/market-data
# → { "ok": true, "data": { … }, "settlement": { "transaction": "…", "explorerUrl": "…" } }
```

## 8. Reporter les preuves

Ajouter dans `docs/architecture.md`, section « x402 (option B) », les hashes du topup (6c) et du règlement x402 (6d), avec la date.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| 500 sur `/api/premium/market-data` | facilitator injoignable ou sans `stellar:testnet` | étape 2 ; logs de `npm run dev` |
| `Exact scheme requires areFeesSponsored to be true` | le facilitator ne sponsorise pas les frais Stellar | autre facilitator (`X402_FACILITATOR_URL`) |
| `rejected by spendControls` / aucune exigence acceptée | le serveur demande un autre asset, un autre réseau ou > 0,01 USDC | vérifier `NEXT_PUBLIC_USDC_SAC` et le 402 (étape 4) |
| erreur de simulation `trustline` / `balance` côté agent | pas de trustline ou solde < 0,01 USDC sur le compte G de l'agent | topup (6c) ; `npm run status` |
| `x402 : HTTP 402 …` après paiement | le facilitator a refusé `verify` ou `settle` (ex. `payTo` sans trustline USDC) | lire le corps ; changer `X402_PAY_TO` vers un compte G avec trustline |
| `#3221 SpendingLimitExceeded` sur le topup | budget de l'agent épuisé sur 24 h | attendre la fenêtre, ou `npm run reset-agent` dans `contracts/` |
| `Cannot find module '@stellar/freighter-api'` | dépendance P2 absente de `package.json` | `npm i --no-save @stellar/freighter-api` |

## Vercel

Rien de plus à configurer que `AGENT_SECRET_KEY` (déjà en place) ; `X402_*` facultatives. L'agent appelle la route premium sur l'origine de la requête `/api/intent` (ou `X402_RESOURCE_BASE_URL`). Avec la Deployment Protection de Vercel activée, cet appel serveur → serveur peut recevoir une page d'authentification : fixer alors `X402_RESOURCE_BASE_URL` sur l'URL de production publique.
