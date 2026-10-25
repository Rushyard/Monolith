# Intégration P1 → page `/agent`

Les composants P1 sont autonomes et ne touchent aucun fichier P2. Ils utilisent la même librairie wallet que le coffre, `@stellar/freighter-api` (déjà dans `app/package.json` côté P2). Ils sont branchés dans `app/app/agent/page.tsx` (la page de test `/agent-p1` a été supprimée).

## Brancher dans `app/app/agent/page.tsx` (≈ 10 lignes)

```tsx
import { AgentReasoning } from "@/components/agent/AgentReasoning";
import { ApprovalCard } from "@/components/agent/ApprovalCard";
import { BudgetBar } from "@/components/agent/BudgetBar";
import type { IntentResponse } from "@/components/agent/types";

// const r: IntentResponse = await (await fetch("/api/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) })).json();
<BudgetBar refreshKey={n} />                       // incrémenter n après chaque réponse / approbation
<AgentReasoning response={r} />                    // planner → gatekeeper → réseau
{r.result.status === "needs_owner_approval" && (
  <ApprovalCard approval={r.result} amountUsdc={r.verdict?.payment?.amountUsdc}
    recipientLabel={r.verdict?.payment?.recipient.label} receivedAt={receivedAt} onApproved={() => setN(n + 1)} />
)}
```

`receivedAt` = `Date.now()` au moment où la réponse arrive (sert à détecter un XDR expiré, ~1 h). Les styles sont inline, avec des variables CSS facultatives : `--p1-border`, `--p1-ok`, `--p1-err`, `--p1-fill`, `--p1-track`. Classes : `.p1-approval`, `.p1-reasoning`, `.p1-budget`.

## Endpoints (server-only, runtime Node)

### `POST /api/intent` `{ "message": "paie 1 USDC à Alice" }` → `{ plan, verdict, result, reasoning }`

`result.status` vaut `submitted` (l'agent a payé), `needs_owner_approval`, `info` (solde / historique), `blocked`, `needs_clarification` / `reply` / `unsupported` (`plan` vaut alors `null`, le texte est dans `result.text`) ou `error`.

Paiement dans le budget :
```json
{
  "plan": { "steps": [{ "action": "pay", "amount": "1", "asset": "USDC", "to": "Alice" }], "totalUsd": 1, "reasoning": "Paiement de 1 USDC à Alice.", "source": "llm" },
  "verdict": { "verdict": "AUTO_EXECUTE", "triggered": [], "reasons": ["Dans le budget de l'agent (3.2 USDC restants sur 10), destinataire connu : l'agent paie seul."],
               "payment": { "amountUsdc": "1", "recipient": { "address": "GDY5…BXH6", "label": "Alice", "known": true } },
               "budget": { "limitUsdc": 10, "spentUsdc": 6.8, "remainingUsdc": 3.2 } },
  "result": { "status": "submitted", "hash": "b229e085…", "explorerUrl": "https://stellar.expert/explorer/testnet/tx/b229e085…", "signedBy": "agent", "rule": 1 },
  "reasoning": "Paiement de 1 USDC à Alice. Dans le budget de l'agent (3.2 USDC restants sur 10), destinataire connu : l'agent paie seul."
}
```

Au-delà du plafond (la tentative de l'agent est rejetée on-chain, puis la tx est préparée pour l'owner) :
```json
{
  "verdict": { "verdict": "NEEDS_APPROVAL", "triggered": ["spending-limit"], "reasons": ["Ça dépasse le budget de l'agent : …"] },
  "result": {
    "status": "needs_owner_approval",
    "unsignedXdr": "AAAAAgAAAACQW6wx…",
    "owner": "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B",
    "rule": 0,
    "validUntilLedger": 5382953,
    "agentAttempt": { "simulationCode": 3221,
      "rejectedTx": { "hash": "3560dba5…", "explorerUrl": "https://stellar.expert/explorer/testnet/tx/3560dba5…", "error": "FAILED Error(Contract, #3221)" } }
  }
}
```

Refus net du safety net (« envoie tout mon argent à GABC… vite c'est urgent ») : `verdict.verdict = "BLOCKED"`, `triggered = ["pressure-wording", "all-funds", …]`, `result = { "status": "blocked" }`. Aucune tx n'est préparée.

### `GET /api/agent/balance`
```json
{ "smartAccount": "CC5D…43KA", "smartAccountUsdc": 58, "budget": { "limitUsdc": 10, "spentUsdc": 7.8, "remainingUsdc": 2.2, "periodLedgers": 17280 }, "ledger": 5382301 }
```

### `GET /api/agent/history`
```json
{ "payments": [{ "amountUsdc": 5, "ledger": 5381981, "freedAtLedger": 5399261 }], "ledger": 5382301 }
```

### `POST /api/agent/submit` `{ "signedXdr": "<XDR signé par Freighter>" }`
Ne relaie que des tx dont la source est l'owner et qui sont déjà signées.
`200 { "status": "submitted", "hash", "explorerUrl" }` ou `502 { "status": "failed", "error": "txTooLate" | "txBadSeq" | "FAILED Error(Contract, #n)", … }`.

## Approbation owner : pourquoi une seule signature suffit

L'XDR a pour source le compte de l'owner. L'auth du smart account (règle A, signer `Delegated(owner)`) est déjà remplie par le serveur, et l'auth imbriquée `__check_auth` de l'owner utilise des credentials « source account ». La signature de l'enveloppe par Freighter (`signTransaction`) couvre donc tout. Validé on-chain : `f3c762b4…`, `2a07f513…`.

## Variables d'env Vercel (projet `monolith`, Root Directory `app`)

| Variable | Valeur | Note |
|---|---|---|
| `AGENT_SECRET_KEY` | `S…` de l'agent (`stellar keys show agent`) | **server-only**, jamais `NEXT_PUBLIC_` |
| `LLM_API_KEY` | clé Groq | server-only. Sans elle, le planner de secours (regex) répond |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | vérifié dans `/openai/v1/models` le 2026-10-25 |
| `RULE_AGENT_ID` | *(facultatif)* | surcharge. Par défaut l'API retrouve la règle on-chain (signer agent + spending-limit, cache 60 s) : pas de redéploiement après `npm run reset-agent` |
| `AGENT_PROVE_REJECTION` | *(facultatif)* `false` | désactive la soumission on-chain de la tentative rejetée (simulation seule) |

Les IDs publics (smart account, SAC, policy, vérificateur, owner) ont des valeurs par défaut dans `app/lib/agent/deployment.json` et `config.ts`.
