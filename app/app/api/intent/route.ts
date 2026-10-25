// POST /api/intent : message → planner (LLM) → gatekeeper (déterministe, budget lu on-chain)
// → executor (agent règle B, ou XDR à faire signer par l'owner, règle A).
// Réponse : { plan, verdict, result, reasoning }. Le pré-check sert à l'affichage ;
// la vraie barrière est la spending-limit policy on-chain.
import { NextResponse } from "next/server";
import { z } from "zod";
import { planIntent, toPlan } from "@/lib/agent/planner";
import { decide, screenMessage } from "@/lib/agent/gatekeeper";
import { execute, readAgentSpending } from "@/lib/agent/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().trim().min(1).max(1000) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "message requis (1 à 1000 caractères)" }, { status: 400 });
  const message = body.data.message;

  const spendingP = readAgentSpending(); // en parallèle de l'appel LLM
  const planned = await planIntent(message);
  const out = planned.output;

  // Safety net sur le message brut, quel que soit ce que le planner a compris (même un « clarify »).
  const screened = screenMessage(message);
  if (screened) {
    const plan = out.type === "actions" ? toPlan(out, planned.source) : null;
    return NextResponse.json({ plan, planner: planned.source, verdict: screened, result: { status: "blocked" }, reasoning: screened.reasons.join(" ") });
  }

  if (out.type !== "actions") {
    const text = out.type === "clarify" ? out.question : out.type === "reply" ? out.text : out.reason;
    const status = out.type === "clarify" ? "needs_clarification" : out.type === "reply" ? "reply" : "unsupported";
    return NextResponse.json({ plan: null, verdict: null, result: { status, text }, reasoning: text, planner: planned.source });
  }

  const plan = toPlan(out, planned.source);
  const spending = await spendingP;
  const decision = decide(plan, message, spending);
  try {
    const result = await execute(plan, decision, spending, { origin: new URL(req.url).origin });
    return NextResponse.json({
      plan,
      verdict: decision,
      result,
      reasoning: [plan.reasoning, ...decision.reasons].filter(Boolean).join(" "),
    });
  } catch (err) {
    console.error("[intent] executor", err);
    return NextResponse.json(
      { plan, verdict: decision, result: { status: "error", error: err instanceof Error ? err.message : String(err) }, reasoning: decision.reasons.join(" ") },
      { status: 500 },
    );
  }
}
