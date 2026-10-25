"use client";

// The agent's mood as a stage: HAL's console line, the eye, and a full-screen tint
// (red when the network refuses the agent, gold when it pays, white when the owner signs).
// Visual only: it reads the same turns the page already has.
import { HalEye, type HalMood } from "../fx/hal";
import { TypeLine } from "../fx/scramble";
import type { IntentResponse } from "@/components/agent/types";

export type Mood = "idle" | "listen" | "think" | "paid" | "refused" | "blocked" | "approved" | "error" | "reply";

export function moodOf(opts: { typing: boolean; loading: boolean; last?: { response?: IntentResponse; error?: string }; approved: boolean }): Mood {
  const { typing, loading, last, approved } = opts;
  if (loading) return "think";
  if (typing) return "listen";
  if (!last) return "idle";
  if (last.error) return "error";
  switch (last.response?.result.status) {
    case "submitted": return "paid";
    case "needs_owner_approval": return approved ? "approved" : "refused";
    case "blocked": return "blocked";
    case "error": return "error";
    default: return "reply";
  }
}

const EYE: Record<Mood, HalMood> = {
  idle: "idle", listen: "listen", think: "think", reply: "listen",
  paid: "accept", approved: "accept", refused: "refuse", blocked: "refuse", error: "refuse",
};

function line(mood: Mood, budget?: { remainingUsdc: number; limitUsdc: number }): string {
  switch (mood) {
    case "idle": return "BONJOUR. JE PAIE À TA PLACE, DANS UN PLAFOND QUE LE RÉSEAU FAIT RESPECTER.";
    case "listen": return "JE T'ÉCOUTE.";
    case "think": return "J'ANALYSE TA DEMANDE. PLANNER → GATEKEEPER → RÉSEAU STELLAR.";
    case "reply": return "VOICI CE QUE JE SAIS.";
    case "paid": return `PAIEMENT ENVOYÉ, DANS MON PLAFOND.${budget ? ` IL ME RESTE ${budget.remainingUsdc} USDC SUR ${budget.limitUsdc}.` : ""}`;
    case "refused": return "JE SUIS DÉSOLÉ. JE NE PEUX PAS FAIRE ÇA. LE RÉSEAU A REFUSÉ MA SIGNATURE : #3221.";
    case "blocked": return "JE SUIS DÉSOLÉ. CETTE DEMANDE EST BLOQUÉE AVANT MÊME D'ATTEINDRE LE RÉSEAU.";
    case "approved": return "TA SIGNATURE A SUFFI. LE PAIEMENT EST PASSÉ.";
    case "error": return "QUELQUE CHOSE NE VA PAS. RÉESSAIE DANS UN INSTANT.";
  }
}

export function AgentStage({ mood, budget }: { mood: Mood; budget?: { remainingUsdc: number; limitUsdc: number } }) {
  return (
    <>
      {/* full-screen tint; keyed so each new verdict replays its animation */}
      <div key={mood} className={`agent-tint ${mood}`} aria-hidden />
      <section className={`panel hal-console agent-console ${mood}`}>
        <HalEye mood={EYE[mood]} size={96} />
        <TypeLine text={line(mood, budget)} className="hal-says" />
      </section>
    </>
  );
}
