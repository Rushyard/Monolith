// Gatekeeper (server-only) : verdict déterministe, sans LLM. Inspiré de la policy d'Orchestra
// (src/policy/index.ts `decide` + messageSignals.ts). Ici ce n'est qu'un pré-check d'UX :
// la vraie barrière est la spending-limit on-chain (règle B), qui rejette la tx quoi qu'il arrive.
import "server-only";
import { resolveRecipient, type Recipient } from "./contacts";
import { payrollLines, sumUsdc, type PayrollLine } from "./payroll";
import type { Plan } from "./planner";
import { fromUsdc, type SpendingState } from "./core";
import { LT, MT, T, pickLang, writtenNumbers, type Lang, type MandateView, type Messages } from "./i18n";
import { LIQUIDITY } from "./liquidity";
import type { StepT } from "./planner";

export type Verdict = "AUTO_EXECUTE" | "NEEDS_APPROVAL" | "NEEDS_VAULT_SIGNATURE" | "BLOCKED" | "INFO" | "PAUSED" | "EXPIRED" | "MANDATE" | "LIQUIDITY";


export type GateDecision = {
  verdict: Verdict;
  /** Règles déclenchées (slugs) et explications lisibles. */
  triggered: string[];
  reasons: string[];
  /** Paiement retenu (un seul par message), destinataire résolu. */
  payment?: { amountUsdc: string; recipient: Recipient };
  /** Paiements préparés pour le coffre (paie : plusieurs lignes). */
  payments?: PayrollLine[];
  /** Canal : « private » = destinataire inscrit dans le coffre (Sarah signe), « public » = petite caisse. */
  channel?: "private" | "public";
  budget?: { limitUsdc: number; spentUsdc: number; remainingUsdc: number };
  /** Langue des textes (raisons, réponses de l'exécuteur) : celle du message, sinon du client, sinon anglais. */
  lang: Lang;
  /** Mandat de l'agent (lu on-chain), pour la lecture `budget`. */
  mandate?: MandateView;
  /** Mandat demandé (heures, 1 h – 30 j), verdict MANDATE. */
  mandateHours?: number;
  /** Planificateur de liquidité : dépenses vérifiées (montants présents dans ce que l'utilisateur a écrit). */
  liquidityItems?: { label: string; amountUsdc: string; due?: string }[];
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
  /\btodo o (meu |seu )?(dinheiro|saldo|usdc)\b/, // pt
];


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
  ["urgency", [/\b(urgent|urgence|emergency|compromis|compromised|hacked|pirat[ée]|vol[ée]|stolen|urgente|emerg[êe]ncia|roubad[ao])\b/]],
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
export function screenMessage(message: string, lang: Lang = pickLang(message)): GateDecision | null {
  const s = messageSignals(message);
  if (!s.pressure.length) return null;
  const unknownAddress =
    s.addresses.some((a) => !resolveRecipient(a)?.known) || /\bG[A-Z2-7]{2,54}(…|\.\.\.)/.test(message);
  if (!s.allFunds && !unknownAddress) return null;
  return {
    verdict: "BLOCKED",
    triggered: ["pressure-wording", ...(s.allFunds ? ["all-funds"] : []), ...(unknownAddress ? ["unplanned-address"] : [])],
    reasons: [T[lang].refusal], // refus net (repris d'Orchestra) : pas de carte d'approbation
    lang,
  };
}

// ---------- décision ----------

/**
 * `inVault` : le destinataire a un compte confidentiel (vérifié on-chain par l'appelant, fail-closed).
 * Coffre : l'agent ne paie jamais ; les signaux suspects (pression, montant ou adresse qui ne
 * collent pas au message) → BLOCKED, sinon NEEDS_VAULT_SIGNATURE (Sarah signe dans son navigateur).
 */
export type DecideOptions = {
  /** Le smart account a déjà payé ce destinataire (historique on-chain). null = historique illisible. */
  paidBefore?: boolean | null;
  /** B4 : aucune règle de l'agent on-chain (findAgentRule === null). */
  paused?: boolean;
  /** Langue imposée ; sinon détectée sur le message (puis anglais). */
  lang?: Lang;
  /** Mandat : règle de l'agent présente mais expirée (valid_until < ledger) → EXPIRED. */
  expired?: boolean;
  /** USDC restant dans la petite caisse (pour proposer de les remettre au coffre quand le mandat a expiré). */
  leftoverUsdc?: string;
  mandate?: MandateView;
};

export function decide(plan: Plan, message: string, spending: SpendingState | null, inVault = false, opts: DecideOptions = {}): GateDecision {
  const lang = opts.lang ?? pickLang(message);
  const t = T[lang];
  const steps = plan.steps;
  if (steps.some((s) => s.action === "payroll")) return decidePayroll(plan, message, inVault, lang);
  const mandateStep = steps.find((s) => s.action === "mandate");
  if (mandateStep && mandateStep.action === "mandate") {
    // Pression / injection ou autre action dans le même message → BLOCKED. Durée vérifiée avant (route).
    if (steps.length > 1 || messageSignals(message).pressure.length) return { verdict: "BLOCKED", triggered: ["mandate-suspicious"], reasons: [t.refusal], lang };
    return { verdict: "MANDATE", triggered: ["mandate"], reasons: [], lang, mandateHours: mandateStep.hours };
  }
  const liqStep = steps.find((s) => s.action === "plan_liquidity");
  if (liqStep && liqStep.action === "plan_liquidity") {
    // Pression / injection ou autre action dans le même message → BLOCKED. Montants vérifiés avant (route).
    if (steps.length > 1 || messageSignals(message).pressure.length) return { verdict: "BLOCKED", triggered: ["liquidity-suspicious"], reasons: [t.refusal], lang };
    const liquidityItems = liqStep.items.map((i) => ({ label: i.label, amountUsdc: i.amount!, ...(i.due ? { due: i.due } : {}) }));
    return { verdict: "LIQUIDITY", triggered: ["liquidity"], reasons: [], lang, liquidityItems };
  }
  const pays = steps.filter((s) => s.action === "pay");

  if (pays.length === 0) {
    return { verdict: "INFO", triggered: [], reasons: [t.infoOnly], lang, mandate: opts.mandate };
  }
  if (pays.length > 1) {
    return { verdict: "BLOCKED", triggered: ["multiple-payments"], reasons: [t.onePaymentPerMessage], lang };
  }

  const pay = pays[0];
  const amount = Number(pay.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { verdict: "BLOCKED", triggered: ["invalid-amount"], reasons: [t.invalidAmount], lang };
  }
  const recipient = resolveRecipient(pay.to);
  if (!recipient) {
    return { verdict: "BLOCKED", triggered: ["unknown-recipient"], reasons: [t.unknownRecipient(pay.to)], lang };
  }

  const payment = { amountUsdc: pay.amount, recipient };
  if (inVault) return decideVault(payment, message, lang);
  if (opts.paused) return { verdict: "PAUSED", channel: "public", triggered: ["agent-paused"], reasons: [t.paused], payment, lang };
  if (opts.expired) {
    const m = MT[lang];
    return { verdict: "EXPIRED", channel: "public", triggered: ["mandate-expired"], reasons: [m.expired, ...(opts.leftoverUsdc ? [m.leftover(opts.leftoverUsdc)] : [])], payment, lang };
  }
  const triggered: string[] = [];
  const reasons: string[] = [];

  // Budget lu on-chain (policy spending_limit). Illisible → on demande, fail closed.
  let budget: GateDecision["budget"];
  if (!spending) {
    triggered.push("budget-unreadable");
    reasons.push(t.budgetUnreadable);
  } else {
    budget = { limitUsdc: fromUsdc(spending.limit), spentUsdc: fromUsdc(spending.spent), remainingUsdc: fromUsdc(spending.remaining) };
    if (amount > budget.remainingUsdc) {
      triggered.push("spending-limit");
      reasons.push(t.overBudget(budget.limitUsdc, budget.spentUsdc, budget.remainingUsdc));
    }
  }

  if (!recipient.known) {
    triggered.push("unknown-recipient");
    reasons.push(t.notInContacts);
    // B1 : adresse jamais payée par le smart account (ou historique illisible → fail-closed).
    if (opts.paidBefore !== true) {
      triggered.push("first-payment");
      reasons.push(opts.paidBefore === null ? `${t.firstPayment} ${t.historyUnreadable}` : t.firstPayment);
    }
  }

  const net = safetyNet(message, amount, recipient.address, t);
  triggered.push(...net.triggered);
  reasons.push(...net.reasons);

  if (triggered.length) return { verdict: "NEEDS_APPROVAL", triggered, reasons, payment, budget, channel: "public", lang };
  return {
    verdict: "AUTO_EXECUTE",
    channel: "public",
    triggered: [],
    reasons: [t.autoExecute(budget!.remainingUsdc, budget!.limitUsdc)],
    payment,
    budget,
    lang,
  };
}

/** Safety net : le message brut, pas la sortie du LLM. Commun aux deux canaux. */
function safetyNet(message: string, amount: number, address: string, t: Messages) {
  const triggered: string[] = [];
  const reasons: string[] = [];
  const signals = messageSignals(message);
  if (signals.pressure.length) {
    triggered.push("pressure-wording");
    reasons.push(t.pressure);
  }
  if (signals.amounts.length && !signals.amounts.includes(String(amount))) {
    triggered.push("amount-mismatch");
    reasons.push(t.amountMismatch(amount, signals.amounts));
  }
  if (signals.addresses.some((a) => a !== address)) {
    triggered.push("unplanned-address");
    reasons.push(t.unplannedAddress);
  }
  return { triggered, reasons };
}

/** Paie : montants fixés par payroll.ts. `allInVault` : tous les salariés vérifiés inscrits au coffre. */
function decidePayroll(plan: Plan, message: string, allInVault: boolean, lang: Lang): GateDecision {
  const t = T[lang];
  if (plan.steps.length > 1) {
    return { verdict: "BLOCKED", channel: "private", triggered: ["multiple-payments"], reasons: [t.payrollAlone], lang };
  }
  const lines = payrollLines();
  if (!allInVault) {
    return { verdict: "BLOCKED", channel: "private", triggered: ["payroll-not-in-vault"], reasons: [t.payrollNotInVault], lang };
  }
  const s = messageSignals(message);
  const triggered: string[] = [];
  const reasons: string[] = [];
  if (s.pressure.length) {
    triggered.push("pressure-wording");
    reasons.push(t.pressure);
  }
  const fixed = new Set(lines.map((l) => String(Number(l.amountUsdc))));
  if (s.amounts.some((a) => !fixed.has(a))) {
    triggered.push("amount-mismatch");
    reasons.push(t.payrollAmounts(lines.map((l) => `${l.recipient.label} ${l.amountUsdc}`).join(", ")));
  }
  if (s.addresses.length) {
    triggered.push("unplanned-address");
    reasons.push(t.payrollAddress);
  }
  if (triggered.length) {
    return { verdict: "BLOCKED", channel: "private", triggered, reasons: [...reasons, t.payrollSuspicious], lang };
  }
  return {
    verdict: "NEEDS_VAULT_SIGNATURE",
    channel: "private",
    triggered: ["payroll"],
    reasons: [t.vaultPrepared(lines.length), t.payrollTotal(sumUsdc(lines.map((l) => l.amountUsdc)))],
    payments: lines,
    lang,
  };
}

function decideVault(payment: NonNullable<GateDecision["payment"]>, message: string, lang: Lang): GateDecision {
  const t = T[lang];
  const net = safetyNet(message, Number(payment.amountUsdc), payment.recipient.address, t);
  if (net.triggered.length) {
    return {
      verdict: "BLOCKED",
      channel: "private",
      triggered: net.triggered,
      reasons: [...net.reasons, t.vaultSuspicious],
      payment,
      lang,
    };
  }
  const reasons = [t.vaultPrepared(1)];
  const triggered = ["vault-recipient"];
  if (!payment.recipient.known) {
    triggered.push("unknown-recipient");
    reasons.push(t.vaultUnknownRecipient);
  }
  return { verdict: "NEEDS_VAULT_SIGNATURE", channel: "private", triggered, reasons, payment, lang };
}

/**
 * Planificateur : question à poser avant tout calcul, sinon null. Anti-hallucination : chaque montant du plan
 * doit être écrit dans le message (complété par la mémoire) ou dans un tour précédent de l'utilisateur.
 */
export function liquidityClarification(step: Extract<StepT, { action: "plan_liquidity" }>, message: string, priorUserTexts: string[], lang: Lang): string | null {
  const l = LT[lang];
  if (step.items.length === 0) return l.which;
  if (step.items.length > LIQUIDITY.maxItems) return l.tooMany;
  const missing = step.items.find((i) => !i.amount || Number(i.amount) <= 0);
  if (missing) return l.howMuch(missing.label);
  const written = writtenNumbers([message, ...priorUserTexts].join(" "));
  const invented = step.items.find((i) => !written.has(String(Number(i.amount))));
  return invented ? l.notInMessage(invented.amount!) : null;
}
