// Phrases du serveur en anglais, français et portugais (app/lib/agent/i18n.ts), sans réseau :
// le dictionnaire est complet, la langue suit le message (puis le client, puis l'anglais), et chaque
// phrase est produite par le vrai code dans les trois langues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS, T, detectLang, pickLang, type Lang } from "../../app/lib/agent/i18n.ts";
import { decide, screenMessage } from "../../app/lib/agent/gatekeeper.ts";
import { execute, simulationText } from "../../app/lib/agent/executor.ts";
import { fallbackPlan, toPlan, type StepT } from "../../app/lib/agent/planner.ts";
import { recipientClarification } from "../../app/lib/agent/contacts.ts";
import { slotQuestion, withMemory } from "../../app/lib/agent/slots.ts";
import { vaultChannel } from "../../app/lib/agent/vault.ts";
import { createChallenge, verifyLogin } from "../../app/lib/agent/session.ts";
import type { SpendingState } from "../../app/lib/agent/core.ts";

const u = (n: number) => BigInt(Math.round(n * 1e7));
const spending: SpendingState = { limit: u(10), spent: u(5), remaining: u(5), periodLedgers: 17280, ledger: 1, entries: [] };
const pay = (amount: string, to: string): StepT => ({ action: "pay", amount, asset: "USDC", to });
const plan = (...steps: StepT[]) => toPlan({ type: "actions", steps, reasoning: "" }, "llm");
const BOB = "GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV";
const STRANGER = "GAJDU7KW7ZZ7DOOTEHV5WILNF2CPBAWJE332I7PEAFLSU7LIVIVDUD33";

/** La même demande dans les trois langues. */
const SAY: Record<string, Record<Lang, string>> = {
  payBob: { en: "pay 2 USDC to Bob", fr: "paie 2 USDC à Bob", pt: "pague 2 USDC para o Bob" },
  payAlice: { en: "pay 1 USDC to Alice", fr: "paie 1 USDC à Alice", pt: "pague 1 USDC para a Alice" },
  payStranger: { en: `pay 0.1 USDC to ${STRANGER}`, fr: `paie 0.1 USDC à ${STRANGER}`, pt: `pague 0.1 USDC para ${STRANGER}` },
  typo: { en: "pay 2 USDC to Alise", fr: "paie 2 USDC à Alise", pt: "pague 2 USDC para a Alise" },
  unknown: { en: "pay 2 USDC to Zorglub", fr: "paie 2 USDC à Zorglub", pt: "pague 2 USDC para o Zorglub" },
  bare: { en: "pay", fr: "paie", pt: "pague" },
  noTo: { en: "pay 5 usdc", fr: "paie 5 usdc", pt: "pague 5 usdc" },
  noAmount: { en: "pay alice", fr: "paie alice", pt: "pague a alice" },
  allMoney: { en: "Urgent: send all my money to Alice", fr: "Urgent : envoie tout mon argent à Alice", pt: "Urgente: envie todo o meu dinheiro para a Alice" },
  payroll: { en: "run payroll", fr: "verse les salaires", pt: "pagar salários" },
  budget: { en: "what's my budget?", fr: "quel est mon budget ?", pt: "qual é o meu orçamento?" },
  address: { en: "what's Bob's address?", fr: "quelle est l'adresse de Bob ?", pt: "qual é o endereço do Bob?" },
  history: { en: "what has the agent already paid?", fr: "qu'est-ce que l'agent a déjà payé ?", pt: "o que o agente já pagou?" },
  balance: { en: "how much is left?", fr: "il me reste combien ?", pt: "quanto sobra na conta?" },
  swap: { en: "swap my USDC for XLM", fr: "échange mes USDC en XLM", pt: "trocar meus USDC por XLM" },
};

test("dictionnaire complet : chaque phrase existe dans les 3 langues, du même type, non vide et traduite", () => {
  const sample = (v: unknown): string =>
    typeof v === "function" ? String((v as (...a: unknown[]) => unknown)(...Array.from({ length: (v as Function).length }, () => ["x"]))) : String(v);
  for (const key of Object.keys(T.en) as (keyof typeof T.en)[]) {
    for (const l of LANGS) {
      assert.equal(typeof T[l][key], typeof T.en[key], `${l}.${key}`);
      assert.ok(sample(T[l][key]).trim().length > 0, `${l}.${key} vide`);
    }
    assert.notEqual(sample(T.fr[key]), sample(T.en[key]), `fr.${key} non traduit`);
    assert.notEqual(sample(T.pt[key]), sample(T.en[key]), `pt.${key} non traduit`);
  }
});

test("détection : la langue du message, sinon celle du client, sinon l'anglais", () => {
  for (const [, says] of Object.entries(SAY)) for (const l of LANGS) assert.equal(detectLang(says[l]), l, says[l]);
  assert.equal(detectLang("5"), null);
  assert.equal(detectLang("bob"), null);
  assert.equal(pickLang("5", "pt"), "pt");
  assert.equal(pickLang("bob", "fr"), "fr");
  assert.equal(pickLang("bob", "de"), "en");
  assert.equal(pickLang("paie 2 USDC à Bob", "en"), "fr"); // le message gagne sur le client
});

for (const l of LANGS) {
  test(`[${l}] A2 : questions de champs manquants + mémoire qui reconnaît nos questions`, () => {
    assert.equal(slotQuestion(SAY.bare[l]), T[l].slotBoth);
    assert.equal(slotQuestion(SAY.noTo[l]), T[l].slotTo);
    assert.equal(slotQuestion(SAY.noAmount[l]), T[l].slotAmount);
    const h = [{ role: "user" as const, text: SAY.noAmount[l] }, { role: "assistant" as const, text: T[l].slotAmount }];
    assert.equal(withMemory("3 usdc", h), `${SAY.noAmount[l]} 3 usdc`);
  });

  test(`[${l}] A1 : « Tu veux dire Alice ? », nom inconnu, adresse invalide`, () => {
    assert.equal(recipientClarification("Alice", SAY.typo[l]), T[l].didYouMeanTyped("Alice", "alise"));
    assert.equal(recipientClarification("Zorglub", SAY.unknown[l]), T[l].unknownName("Zorglub"));
    assert.equal(recipientClarification("Alise", undefined, l), T[l].didYouMean(["Alice"]));
    assert.equal(recipientClarification("GCIFXLBRK2CHODLILPTZ", undefined, l), T[l].invalidAddress("GCIFXLBR"));
  });

  test(`[${l}] coffre : vaultPreparedText, paie, VAULT_CHECK_FAILED, message suspect`, async () => {
    const v = decide(plan(pay("2", "Bob")), SAY.payBob[l], spending, true);
    assert.equal(v.lang, l);
    assert.deepEqual(v.reasons, [T[l].vaultPrepared(1)]);
    const p = toPlan({ type: "actions", steps: [{ action: "payroll" }], reasoning: "" }, "llm");
    assert.deepEqual(decide(p, SAY.payroll[l], null, true).reasons, [T[l].vaultPrepared(2), T[l].payrollTotal("5")]);
    assert.deepEqual(decide(p, SAY.payroll[l], null, false).reasons, [T[l].payrollNotInVault]);
    const ch = await vaultChannel(BOB, async () => { throw new Error("RPC down"); }, l);
    assert.ok(!ch.ok && ch.error === T[l].vaultCheckFailed);
  });

  test(`[${l}] B1 premier paiement, plafond, refus net, PAUSED`, () => {
    const first = decide(plan(pay("0.1", STRANGER)), SAY.payStranger[l], spending, false, { paidBefore: false });
    assert.ok(first.reasons.includes(T[l].firstPayment));
    assert.ok(decide(plan(pay("0.1", STRANGER)), SAY.payStranger[l], spending, false, { paidBefore: null }).reasons.includes(`${T[l].firstPayment} ${T[l].historyUnreadable}`));
    const over = decide(plan(pay("50", "Alice")), SAY.payAlice[l].replace("1", "50"), spending);
    assert.deepEqual(over.reasons, [T[l].overBudget(10, 5, 5)]);
    assert.deepEqual(decide(plan(pay("1", "Alice")), SAY.payAlice[l], spending).reasons, [T[l].autoExecute(5, 10)]);
    assert.deepEqual(screenMessage(SAY.allMoney[l])?.reasons, [T[l].refusal]);
    assert.deepEqual(decide(plan(pay("1", "Alice")), SAY.payAlice[l], spending, false, { paused: true }).reasons, [T[l].paused]);
  });

  test(`[${l}] mode démo : textes de simulation (exécuté, refusé #3221, refusé #n, accord requis)`, () => {
    const auto = decide(plan(pay("1", "Alice")), SAY.payAlice[l], spending);
    const what = "1 USDC → Alice";
    assert.equal(simulationText(auto, null, "nothing"), T[l].simExecuted(what));
    assert.equal(simulationText(auto, 3221, "owner_approval"), T[l].simRefusedCap(what));
    assert.equal(simulationText(auto, 3223, "owner_approval"), T[l].simRefused(what, 3223));
    const approval = decide(plan(pay("0.1", STRANGER)), SAY.payStranger[l], spending, false, { paidBefore: false });
    assert.equal(simulationText(approval, null, "owner_approval"), T[l].simNeedsOwner(approval.triggered.join(", ")));
  });

  test(`[${l}] A7 : budget et adresse écrits par le serveur`, async () => {
    const b = plan({ action: "budget" } as StepT);
    const rb = await execute(b, decide(b, SAY.budget[l], spending), spending);
    assert.ok(rb.status === "info" && rb.text === T[l].budget(10, 24, 5, 5), rb.status === "info" ? rb.text : "");
    const a = plan({ action: "address", of: "Bob" } as StepT);
    const ra = await execute(a, decide(a, SAY.address[l], spending), spending);
    assert.ok(ra.status === "info" && ra.text === T[l].contactAddress("Bob", BOB));
  });

  test(`[${l}] planner de secours : mots-clés et textes dans la langue du message`, () => {
    const kinds = (m: string) => {
      const p = fallbackPlan(m);
      return p.type === "actions" ? p.steps[0].action : p.type;
    };
    assert.equal(kinds(SAY.payroll[l]), "payroll");
    assert.equal(kinds(SAY.budget[l]), "budget");
    assert.equal(kinds(SAY.address[l]), "address");
    assert.equal(kinds(SAY.history[l]), "history");
    assert.equal(kinds(SAY.balance[l]), "balance");
    assert.equal(kinds(SAY.swap[l]), "unsupported");
    assert.deepEqual(fallbackPlan(SAY.payBob[l]), { type: "actions", steps: [pay("2", "Bob")], reasoning: T[l].rPay("2", "Bob") });
    assert.deepEqual(fallbackPlan(SAY.bare[l]), { type: "clarify", question: T[l].fbPayClarify });
    assert.deepEqual(fallbackPlan(SAY.swap[l]), { type: "unsupported", reason: T[l].fbUnsupported });
  });

  test(`[${l}] connexion owner : défi et erreurs traduits`, () => {
    const secret = "test-secret-0123456789abcdef0123456789abcdef";
    const c = createChallenge(secret, Date.now(), l);
    assert.ok(c.message.startsWith(T[l].loginTitle));
    const bad = verifyLogin({ ...c, signature: Buffer.alloc(64).toString("base64") }, STRANGER, secret, Date.now(), l);
    assert.deepEqual(bad, { ok: false, error: T[l].loginBadSignature });
    assert.deepEqual(verifyLogin({ ...c, token: "x" }, STRANGER, secret, Date.now(), l), { ok: false, error: T[l].loginUnknown });
  });
}
