// A2/A3 : champs d'un paiement vérifiés EN CODE sur le message brut (pas sur la sortie du LLM),
// et mémoire courte pour compléter la réponse de l'utilisateur à notre propre question.
//   « paie »         → « Payer combien, et à qui ? »
//   « paie 5 usdc »  → « À qui ? »
//   « paie alice »   → « Combien ? »   (même si le LLM a inventé un montant)
import { BOOK, damerauLevenshtein, normaliseName } from "./contacts";
import { PAYROLL_RE, stripAccents } from "./planner";

export const SLOT_QUESTIONS = {
  both: "Payer combien, et à qui ?",
  to: "À qui ?",
  amount: "Combien ?",
} as const;

const PAY_VERB = /\b(pa(ie|ye|yer|y|ies)|send|envoie|envoyer|vire|virer|transf[eè]re|transf[eé]rer|pague|pagar|envie|enviar|transfira)\b/;
const RECIPIENT_PREP = /\b(?:à|a|to|para|pour|vers)\s+(?:l[ae']\s*)?([a-z][a-z'-]{1,30})\b/;
const NOT_A_NAME = new Set(["moi", "me", "mim", "lui", "eux", "quelqu", "quelqu'un", "someone", "alguem", "usdc", "dollars", "usd"]);

export type Slots = { isPay: boolean; amount: boolean; recipient: boolean };

/** Lit le message brut : verbe de paiement, montant (avec ou sans unité), destinataire. */
export function paymentSlots(message: string): Slots {
  const text = normaliseName(message).replace(/[‘’]/g, "'");
  const raw = message.normalize("NFKC");
  const isPay = PAY_VERB.test(text);
  const amount = /(^|[^\w.])\d+(?:[.,]\d+)?(?![\w])/.test(text.replace(/\bG[A-Z2-7]{55}\b/gi, ""));
  const words = text.split(/[^a-z0-9']+/).filter(Boolean);
  const nearContact = words.some((w) => BOOK.some((c) => [c.name, ...c.aliases].some((k) => damerauLevenshtein(w, normaliseName(k)) <= 2 && w.length >= 3)));
  const prep = RECIPIENT_PREP.exec(text)?.[1];
  const recipient = /\bG[A-Z2-7]{55}\b/.test(raw) || nearContact || (!!prep && !NOT_A_NAME.has(prep));
  return { isPay, amount, recipient };
}

/** Question à poser si un paiement est demandé sans montant ou sans destinataire, sinon null. */
export function slotQuestion(message: string): string | null {
  const s = paymentSlots(message);
  if (!s.isPay) return null;
  // « paie l'équipe », « pay the team » : la paie a ses montants et ses salariés fixés en code.
  if (PAYROLL_RE.test(stripAccents(message.toLowerCase())) && !s.amount) return null;
  if (!s.amount && !s.recipient) return SLOT_QUESTIONS.both;
  if (!s.recipient) return SLOT_QUESTIONS.to;
  if (!s.amount) return SLOT_QUESTIONS.amount;
  return null;
}

export type Turn = { role: "user" | "assistant"; text: string };
export const MEMORY_TURNS = 6;

/**
 * Si le dernier message de l'agent est une de NOS questions de champ, recolle la demande
 * précédente de l'utilisateur et sa réponse (« paie alice » + « 5 » → « paie alice 5 »).
 * Tout le pipeline (planner, safety net, gatekeeper) tourne ensuite sur le texte combiné.
 * L'historique vient du client : il ne donne aucun droit, il ne fait que compléter du texte.
 */
export function withMemory(message: string, history: Turn[] = []): string {
  const recent = history.slice(-MEMORY_TURNS);
  const isSlotQ = (t?: Turn) => t?.role === "assistant" && (Object.values(SLOT_QUESTIONS) as string[]).includes(t.text.trim());
  const parts: string[] = [];
  // Remonte : [user, NOTRE question]* juste avant le message courant.
  let i = recent.length - 1;
  while (i >= 1 && isSlotQ(recent[i]) && recent[i - 1].role === "user") {
    parts.unshift(recent[i - 1].text.trim());
    i -= 2;
  }
  return parts.length ? `${parts.join(" ")} ${message.trim()}` : message;
}
