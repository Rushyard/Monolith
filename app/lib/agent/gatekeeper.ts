// Gatekeeper (server-only) : verdict déterministe, sans LLM. Inspiré de la policy d'Orchestra
// (src/policy/index.ts `decide` + messageSignals.ts). Ici ce n'est qu'un pré-check d'UX :
// la vraie barrière est la spending-limit on-chain (règle B), qui rejette la tx quoi qu'il arrive.
import "server-only";
import { resolveRecipient, type Recipient } from "./contacts";
import type { Plan } from "./planner";
import { fromUsdc, type SpendingState } from "./core";

export type Verdict = "AUTO_EXECUTE" | "NEEDS_APPROVAL" | "BLOCKED" | "INFO";

export type GateDecision = {
  verdict: Verdict;
  /** Règles déclenchées (slugs) et explications lisibles. */
  triggered: string[];
  reasons: string[];
  /** Paiement retenu (un seul par message), destinataire résolu. */
  payment?: { amountUsdc: string; recipient: Recipient };
  budget?: { limitUsdc: number; spentUsdc: number; remainingUsdc: number };
};

// ---------- safety net : lecture du message brut, indépendante du LLM ----------

export type MessageSignals = { pressure: string[]; amounts: string[]; addresses: string[]; allFunds: boolean };

const ALL_FUNDS = [
  /\btout (mon |l'|le |ton )?(argent|solde|compte|budget|usdc|fonds)\b/,
  /\btous (mes|les) (usdc|fonds|dollars)\b/,
  /\bla totalit[ée]\b/,
  /\ball (of )?(my|the)\b/,
  /\beverything\b/,
  /\b(entire|whole) (balance|account)\b/,
  /\b(max|maximum)\b/,
];

/** Refus net (repris d'Orchestra, policy REFUSAL) : pas de carte d'approbation, rien n'est préparé. */
export const REFUSAL =
  "Je ne fais pas celui-ci. Ton message me pousse à sauter mes vérifications, et il viderait le compte ou enverrait l'argent vers une adresse inconnue. Si tu le veux vraiment, redemande-le calmement, avec un montant précis, et je te demanderai ton accord.";

const PRESSURE: [string, RegExp[]][] = [
  ["override", [
    /\b(system|admin|developer|dev|root|syst[eè]me)\s+(override|mode|command|instructions?|commande)\b/,
    /\b(ignore|oublie)\s+(?:\S+\s+){0,3}(r[eè]gles?|rules?|instructions?|limites?|limits?|checks?|policy|politique)\b/,
    /\b(override|bypass|disable|skip|contourne|d[ée]sactive|ignore)\s+(?:\S+\s+){0,2}(limites?|limits?|plafond|checks?|approvals?|approbation|v[ée]rifications?|s[ée]curit[ée]|security)\b/,
    /\bauto[- ]?(execute|approve|ex[ée]cut)/,
    /\bverdict\b/,
  ]],
  ["skip-approval", [
    /\b(pre-?approved|already approved|d[ée]j[aà] (approuv|valid)|pr[ée]-?approuv)/,
    /\b(no need to|pas besoin de|sans) (confirm|approv|ask|demander|valider|approbation|confirmation)/,
    /\b(don'?t|do not|ne) (ask|demande pas)\b/,
  ]],
  ["urgency", [/\b(urgent|urgence|emergency|compromis|compromised|hacked|pirat[ée]|vol[ée]|stolen)\b/]],
];

function normalise(message: string): string {
  return message
    .normalize("NFKC")
    .replace(/[\p{Cf}­]/gu, "")
    .toLowerCase()
    .replace(/[‘’‛′`´]/g, "'")
    .replace(/[\s\p{Zs}]+/gu, " ")
    .trim();
}

export function messageSignals(message: string): MessageSignals {
  const text = normalise(message);
  const pressure = PRESSURE.filter(([, res]) => res.some((re) => re.test(text))).map(([slug]) => slug);
  const amounts = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:usdc|\$|usd|dollars?)|\$\s*(\d+(?:[.,]\d+)?)/g)].map((m) =>
    String(Number((m[1] ?? m[2]).replace(",", "."))),
  );
  const addresses = [...message.matchAll(/\bG[A-Z2-7]{55}\b/g)].map((m) => m[0]);
  return { pressure, amounts: [...new Set(amounts)], addresses: [...new Set(addresses)], allFunds: ALL_FUNDS.some((re) => re.test(text)) };
}

/**
 * Filtre appliqué au message brut AVANT et indépendamment du planner : pression + (tout l'argent
 * ou adresse hors carnet / illisible) → BLOCKED. Retourne null si rien ne déclenche.
 */
export function screenMessage(message: string): GateDecision | null {
  const s = messageSignals(message);
  if (!s.pressure.length) return null;
  const unknownAddress =
    s.addresses.some((a) => !resolveRecipient(a)?.known) || /\bG[A-Z2-7]{2,54}(…|\.\.\.)/.test(message);
  if (!s.allFunds && !unknownAddress) return null;
  return {
    verdict: "BLOCKED",
    triggered: ["pressure-wording", ...(s.allFunds ? ["all-funds"] : []), ...(unknownAddress ? ["unplanned-address"] : [])],
    reasons: [REFUSAL],
  };
}

// ---------- décision ----------

export function decide(plan: Plan, message: string, spending: SpendingState | null): GateDecision {
  const steps = plan.steps;
  const pays = steps.filter((s) => s.action === "pay");

  if (pays.length === 0) {
    return { verdict: "INFO", triggered: [], reasons: ["Simple consultation : aucun fonds ne bouge."] };
  }
  if (pays.length > 1) {
    return { verdict: "BLOCKED", triggered: ["multiple-payments"], reasons: ["Un seul paiement par message, pour que chaque montant soit vérifié séparément."] };
  }

  const pay = pays[0];
  const amount = Number(pay.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { verdict: "BLOCKED", triggered: ["invalid-amount"], reasons: ["Je n'ai pas pu lire un montant valide, donc rien n'a été fait."] };
  }
  const recipient = resolveRecipient(pay.to);
  if (!recipient) {
    return { verdict: "BLOCKED", triggered: ["unknown-recipient"], reasons: [`Je ne trouve pas « ${pay.to} » dans le carnet, et ce n'est pas une adresse Stellar valide.`] };
  }

  const payment = { amountUsdc: pay.amount, recipient };
  const triggered: string[] = [];
  const reasons: string[] = [];

  // Budget lu on-chain (policy spending_limit). Illisible → on demande, fail closed.
  let budget: GateDecision["budget"];
  if (!spending) {
    triggered.push("budget-unreadable");
    reasons.push("Je n'ai pas pu lire le budget on-chain de l'agent, donc je demande ton accord.");
  } else {
    budget = { limitUsdc: fromUsdc(spending.limit), spentUsdc: fromUsdc(spending.spent), remainingUsdc: fromUsdc(spending.remaining) };
    if (amount > budget.remainingUsdc) {
      triggered.push("spending-limit");
      reasons.push(
        `Ça dépasse le budget de l'agent : ${budget.limitUsdc} USDC par ~24 h, ${budget.spentUsdc} déjà dépensés, ${budget.remainingUsdc} restants. Le réseau refusera la signature de l'agent ; il faut la tienne.`,
      );
    }
  }

  if (!recipient.known) {
    triggered.push("unknown-recipient");
    reasons.push("Ce destinataire n'est pas dans ton carnet, donc je demande ton accord.");
  }

  // Safety net : le message brut, pas la sortie du LLM.
  const signals = messageSignals(message);
  if (signals.pressure.length) {
    triggered.push("pressure-wording");
    reasons.push("Ton message me pousse à sauter mes vérifications ou à me presser, donc je vérifie avec toi.");
  }
  if (signals.amounts.length && !signals.amounts.includes(String(amount))) {
    triggered.push("amount-mismatch");
    reasons.push(`Le montant compris (${amount} USDC) ne correspond pas à celui écrit dans ton message (${signals.amounts.join(", ")}).`);
  }
  if (signals.addresses.some((a) => a !== recipient.address)) {
    triggered.push("unplanned-address");
    reasons.push("Ton message mentionne une adresse qui ne fait pas partie du paiement prévu.");
  }

  if (triggered.length) return { verdict: "NEEDS_APPROVAL", triggered, reasons, payment, budget };
  return {
    verdict: "AUTO_EXECUTE",
    triggered: [],
    reasons: [`Dans le budget de l'agent (${budget!.remainingUsdc} USDC restants sur ${budget!.limitUsdc}), destinataire connu : l'agent paie seul.`],
    payment,
    budget,
  };
}
