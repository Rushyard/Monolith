// POST /api/intent : message → planner (LLM) → gatekeeper (déterministe, budget lu on-chain)
// → executor (agent règle B, ou XDR à faire signer par l'owner, règle A).
// Réponse : { plan, verdict, result, reasoning }. Le pré-check sert à l'affichage ;
// la vraie barrière est la spending-limit policy on-chain.
import { NextResponse } from "next/server";
import { z } from "zod";
import { planIntent, toPlan } from "@/lib/agent/planner";
import { decide, screenMessage } from "@/lib/agent/gatekeeper";
import { execute, readAgentSpending } from "@/lib/agent/executor";
import { recipientClarification, resolveRecipient } from "@/lib/agent/contacts";
import { slotQuestion, withMemory } from "@/lib/agent/slots";
import { payrollLines } from "@/lib/agent/payroll";
import { vaultChannel } from "@/lib/agent/vault";
import { paidAddresses, recordActivity } from "@/lib/agent/activity";
import { AGENT_CONFIG, agentRuleStatus } from "@/lib/agent/config";
import { clientIp, isOwnerRequest, rateLimit } from "@/lib/agent/session";
import { T, pickLang, requestLang } from "@/lib/agent/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().trim().min(1).max(1000),
  /** Derniers tours (optionnel) : sert seulement à compléter la réponse à nos propres questions. */
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(12).optional(),
  /** Langue du site côté client (optionnel) : utilisée si le message ne suffit pas à la détecter. */
  lang: z.enum(["en", "fr", "pt"]).optional(),
});

export async function POST(req: Request) {
  // Owner = cookie de session signé (Freighter). Sinon : mode démo, rien n'est envoyé (fail-closed).
  const owner = isOwnerRequest(req, AGENT_CONFIG.ownerAddress);
  const mode = owner ? "owner" : "simulation";
  const clientLang = requestLang(req);
  if (!owner) {
    const rl = rateLimit(clientIp(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: T[clientLang].errRateLimit(Math.ceil(rl.retryAfterS / 60)) },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
      );
    }
  }
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: T[clientLang].errMessageRequired }, { status: 400 });
  // A3 : « paie alice » → « Combien ? » → « 5 » devient « paie alice 5 », puis tout le pipeline.
  const message = withMemory(body.data.message, body.data.history);
  // Langue des textes du serveur : celle du message, sinon celle du client, sinon anglais.
  const lang = pickLang(message, body.data.lang ?? clientLang);

  const spendingP = readAgentSpending(); // en parallèle de l'appel LLM
  const planned = await planIntent(message);
  const out = planned.output;

  // Safety net sur le message brut, quel que soit ce que le planner a compris (même un « clarify »).
  const screened = screenMessage(message, lang);
  if (screened) {
    const plan = out.type === "actions" ? toPlan(out, planned.source) : null;
    return NextResponse.json({ plan, planner: planned.source, verdict: screened, result: { status: "blocked" }, reasoning: screened.reasons.join(" "), mode, lang });
  }

  // A2 : montant ou destinataire manquant, vérifié en code sur le message brut (même si le LLM a deviné).
  const missing = slotQuestion(message, lang);
  if (missing && (out.type === "clarify" || (out.type === "actions" && out.steps.some((s) => s.action === "pay")))) {
    return NextResponse.json({ plan: null, verdict: null, result: { status: "needs_clarification", text: missing }, reasoning: missing, planner: planned.source, mode, lang });
  }

  if (out.type !== "actions") {
    const text = out.type === "clarify" ? out.question : out.type === "reply" ? out.text : out.reason;
    const status = out.type === "clarify" ? "needs_clarification" : out.type === "reply" ? "reply" : "unsupported";
    return NextResponse.json({ plan: null, verdict: null, result: { status, text }, reasoning: text, planner: planned.source, mode, lang });
  }

  const plan = toPlan(out, planned.source);

  // Routage : destinataire inscrit dans le coffre → Sarah signe (montant caché). Fail-closed : si
  // l'appartenance est illisible, on ne paie pas en public (ça révélerait le montant).
  // A1 : destinataire écrit par le planner résolu côté serveur. Faute de frappe → clarification, jamais de paiement.
  const pays = plan.steps.filter((s) => s.action === "pay");
  for (const p of pays) {
    const text = recipientClarification(p.to, message, lang);
    if (text) return NextResponse.json({ plan, verdict: null, result: { status: "needs_clarification", text }, reasoning: text, mode, lang });
  }

  // Paie : tous les salariés doivent être dans le coffre.
  const isPayroll = plan.steps.some((s) => s.action === "payroll");
  const single = pays.length === 1 ? resolveRecipient(pays[0].to) : null;
  const toCheck = isPayroll ? payrollLines().map((l) => l.recipient.address) : single ? [single.address] : [];
  let inVault = false;
  if (toCheck.length) {
    const checks = await Promise.all(toCheck.map((a) => vaultChannel(a, undefined, lang)));
    const failed = checks.find((c) => !c.ok);
    if (failed && !failed.ok) return NextResponse.json({ plan, verdict: null, result: { status: "error", error: failed.error }, reasoning: failed.error, mode, lang }, { status: 503 });
    inVault = checks.every((c) => c.ok && c.inVault);
  }

  // B1 : une adresse hors carnet jamais payée par le smart account → accord de l'owner.
  let paidBefore: boolean | null | undefined;
  if (single && !single.known && !inVault) {
    paidBefore = await paidAddresses()
      .then((s) => s.has(single.address))
      .catch((err) => (console.error("[intent] historique illisible", err instanceof Error ? err.message : err), null));
  }

  // B4 : petite caisse en pause (règle de l'agent retirée on-chain par l'owner).
  const paused = single && !inVault ? (await agentRuleStatus()).state === "paused" : false;

  const spending = await spendingP;
  const decision = decide(plan, message, spending, inVault, { paidBefore, paused, lang });
  logVerdict(decision);
  try {
    const result = await execute(plan, decision, spending, owner ? "live" : "simulation");
    return NextResponse.json({
      plan,
      verdict: decision,
      result,
      reasoning: [plan.reasoning, ...decision.reasons].filter(Boolean).join(" "),
      mode,
      lang,
    });
  } catch (err) {
    console.error("[intent] executor", err);
    return NextResponse.json(
      { plan, verdict: decision, result: { status: "error", error: T[lang].errServer(err instanceof Error ? err.message : String(err)) }, reasoning: decision.reasons.join(" "), mode, lang },
      { status: 500 },
    );
  }
}

/** Garde en mémoire (best effort) les verdicts qui ne laissent pas de trace on-chain. Jamais de montant privé. */
function logVerdict(d: ReturnType<typeof decide>) {
  if (d.verdict !== "BLOCKED" && d.verdict !== "NEEDS_VAULT_SIGNATURE") return;
  const channel = d.channel ?? "public";
  for (const p of d.payments ?? (d.payment ? [d.payment] : [])) {
    recordActivity({
      at: new Date().toISOString(),
      kind: d.verdict === "BLOCKED" ? "blocked" : "waiting",
      channel,
      to: p.recipient.address,
      label: p.recipient.label,
      amountUsdc: channel === "public" ? p.amountUsdc : undefined,
      reason: d.verdict === "BLOCKED" ? (t) => t.actBlocked : (t) => t.actWaiting,
    });
  }
}
