// Mandat de l'agent (droits qui expirent on-chain, valid_until OZ), sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, assertMandateTarget, isAgentRule, pickAgentRule, type RawContextRule } from "../../app/lib/agent/core.ts";
import { decide } from "../../app/lib/agent/gatekeeper.ts";
import { execute } from "../../app/lib/agent/executor.ts";
import { toPlan, type StepT } from "../../app/lib/agent/planner.ts";
import { LANGS, MT, mandateLine } from "../../app/lib/agent/i18n.ts";
import type { SpendingState } from "../../app/lib/agent/core.ts";

const VERIFIER = "CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB";
const POLICY = "CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ";
const OWNER = "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B";
const agent = Keypair.random();
const agentRule = (id: number, valid_until: number | null = null): RawContextRule => ({
  id, signers: [["External", VERIFIER, Buffer.from(agent.rawPublicKey())]], policies: [POLICY], valid_until,
});
const ownerRule: RawContextRule = { id: 0, signers: [["Delegated", OWNER]], policies: [] };
const isAgent = (r: RawContextRule) => isAgentRule(r, VERIFIER, agent.rawPublicKey(), POLICY);
const LEDGER = 1000;

test("règle : valide → renvoyée avec son expiration", () => {
  assert.deepEqual(pickAgentRule([ownerRule, agentRule(2, 1500)], LEDGER, isAgent), { id: 2, validUntil: 1500, expired: false });
});

test("règle : sans expiration → validUntil null", () => {
  assert.deepEqual(pickAgentRule([ownerRule, agentRule(2)], LEDGER, isAgent), { id: 2, validUntil: null, expired: false });
});

test("règle : seule une règle expirée → renvoyée avec expired: true (renouvelable, pas PAUSED)", () => {
  assert.deepEqual(pickAgentRule([ownerRule, agentRule(2, 999)], LEDGER, isAgent), { id: 2, validUntil: 999, expired: true });
  // borne incluse comme OZ (valid_until < ledger) : au ledger 1000, valid_until 1000 est encore valable
  assert.equal(pickAgentRule([agentRule(2, 1000)], LEDGER, isAgent)?.expired, false);
});

test("règle : plusieurs dont une expirée plus récente → la plus récente des VALIDES ; aucune → null (PAUSED)", () => {
  assert.deepEqual(pickAgentRule([ownerRule, agentRule(2, 1500), agentRule(3, 10)], LEDGER, isAgent), { id: 2, validUntil: 1500, expired: false });
  assert.deepEqual(pickAgentRule([agentRule(2, 10), agentRule(5, 20)], LEDGER, isAgent), { id: 5, validUntil: 20, expired: true });
  assert.equal(pickAgentRule([ownerRule], LEDGER, isAgent), null);
});

test("sécurité : jamais de valid_until sur une autre règle que celle de l'agent (avertissement OZ mod.rs l.344-349)", () => {
  assert.throws(() => assertMandateTarget(ownerRule, VERIFIER, agent.rawPublicKey(), POLICY), /mod\.rs l\.344-349/);
  const noPolicy = { ...agentRule(4), policies: [] };
  assert.throws(() => assertMandateTarget(noPolicy, VERIFIER, agent.rawPublicKey(), POLICY), /n'est pas celle de l'agent/);
  assert.doesNotThrow(() => assertMandateTarget(agentRule(2), VERIFIER, agent.rawPublicKey(), POLICY));
});

const u = (n: number) => BigInt(Math.round(n * 1e7));
const spending: SpendingState = { limit: u(10), spent: u(5), remaining: u(5), periodLedgers: 17280, ledger: 1, entries: [] };
const pay = (amount: string, to: string): StepT => ({ action: "pay", amount, asset: "USDC", to });
const plan = (...steps: StepT[]) => toPlan({ type: "actions", steps, reasoning: "" }, "llm");

for (const l of LANGS) {
  const msg = { en: "pay 1 USDC to Alice", fr: "paie 1 USDC à Alice", pt: "pague 1 USDC para a Alice" }[l];
  test(`[${l}] mandat expiré → EXPIRED, aucune tx, propose de remettre la petite caisse au coffre`, async () => {
    const p = plan(pay("1", "Alice"));
    const v = decide(p, msg, spending, false, { expired: true, leftoverUsdc: "74" });
    assert.equal(v.verdict, "EXPIRED");
    assert.deepEqual(await execute(p, v, spending), { status: "expired", text: `${MT[l].expired} ${MT[l].leftover("74")}` });
  });
}

test("EXPIRED ≠ PAUSED, et le coffre n'est pas concerné (Bob → NEEDS_VAULT_SIGNATURE)", () => {
  assert.equal(decide(plan(pay("1", "Alice")), "pay 1 USDC to Alice", spending, false, { paused: true }).verdict, "PAUSED");
  assert.equal(decide(plan(pay("2", "Bob")), "pay 2 USDC to Bob", spending, true, { expired: true }).verdict, "NEEDS_VAULT_SIGNATURE");
  assert.equal(decide(plan(pay("1", "Alice")), "pay 1 USDC to Alice", spending, false, {}).verdict, "AUTO_EXECUTE");
});

test("ligne « Mandate » : sans expiration / expiré / environ N jours h (durée réelle d'un ledger)", () => {
  assert.equal(mandateLine({ validUntil: null, ledger: 1000, secondsPerLedger: 5 }, "en"), "Mandate: no expiry.");
  assert.equal(mandateLine({ validUntil: 999, ledger: 1000, secondsPerLedger: 5 }, "fr"), "Mandat : expiré.");
  // 7 jours − 1 h ≈ 6 jours 23 h à 5 s/ledger
  const left = (7 * 86400 - 3600) / 5;
  assert.equal(mandateLine({ validUntil: 1000 + left - 1, ledger: 1000, secondsPerLedger: 5 }, "en"), "Mandate: expires in about 6 days 23 h.");
  assert.equal(mandateLine({ validUntil: 1000 + left - 1, ledger: 1000, secondsPerLedger: 5 }, "pt"), "Mandato: expira em cerca de 6 dias 23 h.");
  assert.equal(mandateLine({ validUntil: 1029, ledger: 1000, secondsPerLedger: 5 }, "en"), "Mandate: expires in about 2 min.");
});

test("lecture budget (A7) : la ligne du mandat est ajoutée par le serveur", async () => {
  const p = plan({ action: "budget" } as StepT);
  const mandate = { validUntil: null, ledger: 1000, secondsPerLedger: 5 };
  const r = await execute(p, decide(p, "what's my budget?", spending, false, { mandate }), spending);
  assert.ok(r.status === "info" && r.text.endsWith("Mandate: no expiry."), r.status === "info" ? r.text : "");
});

test("bloc i18n « mandate » complet dans les 3 langues", () => {
  for (const k of Object.keys(MT.en) as (keyof typeof MT.en)[]) for (const l of LANGS) assert.equal(typeof MT[l][k], typeof MT.en[k], `${l}.${k}`);
});
