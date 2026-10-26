// A2/A3 : champs d'un paiement vérifiés EN CODE sur le message brut (pas sur la sortie du LLM),
// et mémoire courte pour compléter la réponse de l'utilisateur à notre propre question.
//   « paie » / « pay » / « pague »      → « Payer combien, et à qui ? » (dans la langue du message)
//   « paie 5 usdc »                       → « À qui ? »
//   « paie alice »                        → « Combien ? »   (même si le LLM a inventé un montant)
import { BOOK, damerauLevenshtein, normaliseName } from "./contacts";
import { KEYWORDS, T, allLangs, isLiquidityQuestion, keywordText, pickLang, type Lang } from "./i18n";

export type Slots = { isPay: boolean; amount: boolean; recipient: boolean };

/** Lit le message brut : verbe de paiement, montant (avec ou sans unité), destinataire. */
export function paymentSlots(message: string): Slots {
  const text = normaliseName(message).replace(/[‘’]/g, "'");
  const raw = message.normalize("NFKC");
  const isPay = KEYWORDS.pay.test(text);
  const amount = /(^|[^\w.])\d+(?:[.,]\d+)?(?![\w])/.test(text.replace(/\bG[A-Z2-7]{55}\b/gi, ""));
  const words = text.split(/[^a-z0-9']+/).filter(Boolean);
  const nearContact = words.some((w) => BOOK.some((c) => [c.name, ...c.aliases].some((k) => damerauLevenshtein(w, normaliseName(k)) <= 2 && w.length >= 3)));
  const prep = KEYWORDS.recipientPrep.exec(text)?.[1];
  const recipient = /\bG[A-Z2-7]{55}\b/.test(raw) || nearContact || (!!prep && !KEYWORDS.notAName.has(prep));
  return { isPay, amount, recipient };
}

/** Question à poser si un paiement est demandé sans montant ou sans destinataire, sinon null. */
export function slotQuestion(message: string, lang: Lang = pickLang(message)): string | null {
  const s = paymentSlots(message);
  if (!s.isPay) return null;
  // « paie l'équipe », « pay the team » : la paie a ses montants et ses salariés fixés en code.
  if (KEYWORDS.payroll.test(keywordText(message)) && !s.amount) return null;
  const t = T[lang];
  if (!s.amount && !s.recipient) return t.slotBoth;
  if (!s.recipient) return t.slotTo;
  if (!s.amount) return t.slotAmount;
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
  const ours = [...allLangs("slotBoth"), ...allLangs("slotTo"), ...allLangs("slotAmount")];
  // + questions du planificateur (« Combien pour l'outil de design ? »).
  const isSlotQ = (t?: Turn) => t?.role === "assistant" && (ours.includes(t.text.trim()) || isLiquidityQuestion(t.text));
  const parts: string[] = [];
  // Remonte : [user, NOTRE question]* juste avant le message courant.
  let i = recent.length - 1;
  while (i >= 1 && isSlotQ(recent[i]) && recent[i - 1].role === "user") {
    parts.unshift(recent[i - 1].text.trim());
    i -= 2;
  }
  return parts.length ? `${parts.join(" ")} ${message.trim()}` : message;
}
