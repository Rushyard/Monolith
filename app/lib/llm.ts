// Parsing du message utilisateur en intention structurée (server-only).
import "server-only";
import { z } from "zod";

export const IntentSchema = z.object({
  action: z.enum(["pay", "balance", "history"]),
  amount: z.number().positive().optional(),
  to: z.string().optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

// Carnet de contacts de la démo : nom → adresse Stellar.
export const CONTACTS: Record<string, string> = {
  alice: "",
};

export async function parseIntent(message: string): Promise<Intent> {
  if (!process.env.LLM_API_KEY) throw new Error("LLM_API_KEY manquant");
  // TODO (P1) : appel LLM (groq-sdk ou @anthropic-ai/sdk) avec sortie structurée validée par IntentSchema,
  // puis résolution de `to` via CONTACTS.
  void message;
  return IntentSchema.parse({ action: "balance" });
}
