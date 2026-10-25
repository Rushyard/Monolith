"use client";

// The agent's state, derived from the page's turns, and the small status line that shows it.
// Visual only: it reads the same turns the page already has.
import type { IntentResponse } from "@/components/agent/types";
import { useI18n } from "@/lib/i18n/react";

export type Mood = "idle" | "listen" | "think" | "paid" | "refused" | "pending" | "blocked" | "approved" | "error" | "reply" | "simulated" | "paused";

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
    case "needs_vault_signature": return approved ? "approved" : "pending";
    case "simulated": return "simulated";
    case "paused": return "paused";
    case "expired": return "paused";
    case "mandate_simulated": return "simulated";
    case "needs_mandate_signature": return approved ? "approved" : "pending";
    case "blocked": return "blocked";
    case "error": return "error";
    default: return "reply";
  }
}

export function AgentStatus({ mood }: { mood: Mood }) {
  const { t } = useI18n();
  return (
    <div className={`agent-status ${mood}`} role="status" aria-live="polite">
      <span className="lens" aria-hidden />
      <span>{t(`status.${mood}`)}</span>
    </div>
  );
}
