"use client";

// The agent's state, derived from the page's turns, and the small status line that shows it.
// Visual only: it reads the same turns the page already has.
import type { IntentResponse } from "@/components/agent/types";

export type Mood = "idle" | "listen" | "think" | "paid" | "refused" | "pending" | "blocked" | "approved" | "error" | "reply";

export function moodOf(opts: { typing: boolean; loading: boolean; last?: { response?: IntentResponse; error?: string }; approved: boolean }): Mood {
  const { typing, loading, last, approved } = opts;
  if (loading) return "think";
  if (typing) return "listen";
  if (!last) return "idle";
  return outcomeOf(last, approved);
}

/** What happened to one request, independent of what the user is doing now. */
export function outcomeOf(turn: { response?: IntentResponse; error?: string }, approved: boolean): Mood {
  if (turn.error) return "error";
  const r = turn.response?.result;
  switch (r?.status) {
    case "submitted": return "paid";
    case "needs_owner_approval": return approved ? "approved" : r.agentAttempt?.simulationCode === 3221 ? "refused" : "pending";
    case "blocked": return "blocked";
    case "error": return "error";
    default: return "reply";
  }
}

const STATUS: Record<Mood, string> = {
  idle: "En veille",
  listen: "À l'écoute",
  think: "Analyse de la demande",
  reply: "Réponse",
  paid: "Paiement envoyé",
  refused: "Refusé par le réseau · #3221",
  pending: "En attente de ta signature",
  blocked: "Demande bloquée",
  approved: "Approuvé par le propriétaire",
  error: "Erreur",
};

export function AgentStatus({ mood }: { mood: Mood }) {
  return (
    <div className={`agent-status ${mood}`} role="status" aria-live="polite">
      <span className="lens" aria-hidden />
      <span>{STATUS[mood]}</span>
    </div>
  );
}
