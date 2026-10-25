// Mandat de l'agent (server-only) : droits qui expirent on-chain (valid_until des context rules OZ).
// Une tx signée par Sarah dans Freighter (même mécanique que la pause B4, ./pause.ts) :
//   règle de l'agent présente (valide ou expirée) → update_context_rule_valid_until(id, ledger + N), même id,
//                                                     budget déjà dépensé conservé ;
//   agent en pause (aucune règle)                  → add_context_rule(…, valid_until) avec les paramètres de reset-agent.
// Garde-fou : on ne pose jamais de valid_until ailleurs que sur la règle de l'agent (assertMandateTarget,
// OZ smart_account/mod.rs l.344-349).
import "server-only";
import { AGENT_CONFIG, agentKeypair, agentRuleStatus } from "./config";
import {
  Keypair,
  addAgentRuleArgs,
  assertMandateTarget,
  nativeToScVal,
  readContract,
  scValToNative,
  secondsPerLedger,
  server,
  validUntilArg,
  type RawContextRule,
} from "./core";
import { T, type Lang } from "./i18n";
import { asOwner, prepare, type PausePrep } from "./pause";

const C = AGENT_CONFIG;
export const MANDATE_MIN_HOURS = 1;
export const MANDATE_MAX_HOURS = 30 * 24;

export const validMandateHours = (h: number | undefined): h is number =>
  typeof h === "number" && Number.isFinite(h) && h >= MANDATE_MIN_HOURS && h <= MANDATE_MAX_HOURS;

/** Ledger d'expiration et date approximative (durée moyenne réelle des derniers ledgers). */
export async function mandateExpiry(hours: number) {
  const [ledger, spl] = await Promise.all([server.getLatestLedger().then((l) => l.sequence), secondsPerLedger()]);
  const mandateUntilLedger = ledger + Math.round((hours * 3600) / spl);
  return { mandateUntilLedger, expiresAt: new Date(Date.now() + (mandateUntilLedger - ledger) * spl * 1000).toISOString() };
}

export type MandatePrep = (Extract<PausePrep, { ok: true }> & { mandateUntilLedger: number; expiresAt: string }) | { ok: false; error: string };

export async function prepareMandate(hours: number, lang: Lang = "en"): Promise<MandatePrep> {
  const t = T[lang];
  const at = await mandateExpiry(hours);
  const agentKey = process.env.AGENT_SECRET_KEY ? agentKeypair() : Keypair.fromPublicKey(C.agentAddress);
  const s = await agentRuleStatus();
  if (s.state === "unknown") return { ok: false, error: t.ruleUnreadable(s.error) };
  if (s.state === "paused") {
    const prep = await prepare("mandate", asOwner("add_context_rule", addAgentRuleArgs(C.usdcSac, C.ed25519Verifier, agentKey.rawPublicKey(), C.spendingLimitPolicy, at.mandateUntilLedger)), lang);
    return prep.ok ? { ...prep, ...at } : prep;
  }
  // Relire la règle et vérifier que c'est bien celle de l'agent avant d'y poser une expiration.
  const raw = scValToNative((await readContract(C.ownerAddress, C.smartAccount, "get_context_rule", [nativeToScVal(s.id, { type: "u32" })]))!) as RawContextRule;
  assertMandateTarget(raw, C.ed25519Verifier, agentKey.rawPublicKey(), C.spendingLimitPolicy);
  const prep = await prepare("mandate", asOwner("update_context_rule_valid_until", [nativeToScVal(s.id, { type: "u32" }), validUntilArg(at.mandateUntilLedger)]), lang, s.id);
  return prep.ok ? { ...prep, ...at } : prep;
}
