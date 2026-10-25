// A1 : alias et fautes de frappe (Damerau-Levenshtein), sans réseau. Règle d'or : un nom corrigé
// ne déclenche jamais un paiement sans confirmation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { damerauLevenshtein, matchName, recipientClarification } from "../../app/lib/agent/contacts.ts";
import { T } from "../../app/lib/agent/i18n.ts";

test("distance : 0, substitution, insertion, suppression", () => {
  assert.equal(damerauLevenshtein("alice", "alice"), 0);
  assert.equal(damerauLevenshtein("alise", "alice"), 1);
  assert.equal(damerauLevenshtein("allice", "alice"), 1);
  assert.equal(damerauLevenshtein("alce", "alice"), 1);
});

test("distance : transposition adjacente = 1 (Damerau), pas 2", () => {
  assert.equal(damerauLevenshtein("ailce", "alice"), 1);
  assert.equal(damerauLevenshtein("obb", "bob"), 1);
});

test("distance : cas limites (vide, symétrie)", () => {
  assert.equal(damerauLevenshtein("", "bob"), 3);
  assert.equal(damerauLevenshtein("carol", "karol"), damerauLevenshtein("karol", "carol"));
});

test("nom exact, alias, casse et accents → résolu, pas de clarification", () => {
  for (const n of ["Alice", "ALICE", "Àlice", "bob", "Robert", "bobby", "Carol", "caroline"]) assert.equal(recipientClarification(n), null, n);
});

test("adresse G valide → pas de clarification", () => {
  assert.equal(recipientClarification("GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B"), null);
});

test("faute à distance 1 → « Tu veux dire Alice ? », pas d'exécution", () => {
  assert.match(recipientClarification("Alise", undefined, "fr")!, /^Tu veux dire Alice \?/);
  assert.match(recipientClarification("Ailce")!, /^Did you mean Alice\?/); // sans message ni client : anglais
});

test("faute à distance 2 → suggestion aussi (Bobb y, Karoll)", () => {
  assert.deepEqual(matchName("Boob"), { kind: "close", names: ["Bob"], distance: 1 });
  assert.equal(matchName("Karoll").kind, "close");
  assert.match(recipientClarification("Karoll")!, /Carol/);
});

test("distance > 2 → « Je ne connais pas … : donne-moi son adresse G… »", () => {
  assert.equal(recipientClarification("Charlie", undefined, "fr"), T.fr.unknownName("Charlie"));
  assert.equal(recipientClarification("Charlie"), T.en.unknownName("Charlie"));
  assert.equal(matchName("Zébulon").kind, "unknown");
});

test("égalité entre deux contacts → les deux sont proposés", () => {
  const m = matchName("Bol"); // bob (1) ; aucun autre à 1
  assert.ok(m.kind === "close" && m.names.includes("Bob"));
  const tie = matchName("Aob"); // bob à 1, aucun autre → un seul
  assert.ok(tie.kind === "close");
});

test("adresse G tronquée ou invalide → demande de vérifier, jamais de suggestion de nom", () => {
  assert.match(recipientClarification("GCIFXLBRK2CHODLILPTZ", undefined, "fr")!, /n'est pas une adresse Stellar valide/);
  assert.match(recipientClarification("GCIFXLBRK2CHODLILPTZ")!, /is not a valid Stellar address/);
});

test("règle d'or : une correction n'est jamais un nom résolu", () => {
  for (const typo of ["Alise", "Bobb", "Carl", "Robret"]) assert.notEqual(recipientClarification(typo), null, typo);
});

test("LLM qui corrige tout seul (« Alise » → plan « Alice ») → clarification, pas de paiement", () => {
  assert.match(recipientClarification("Alice", "paie 2 USDC à Alise")!, /^Tu veux dire Alice \? \(tu as écrit « alise »\)/);
  assert.equal(recipientClarification("Alice", "paie 2 USDC à Alice"), null);
  assert.equal(recipientClarification("Bob", "pay robert 2 usdc"), null);
  assert.equal(recipientClarification("Bob", "Paie 2 USDC à Bob."), null);
});

test("planner de secours : un nom hors carnet est recopié tel quel, puis vérifié par A1 (jamais payé)", async () => {
  const { fallbackPlan } = await import("../../app/lib/agent/planner.ts");
  const p = fallbackPlan("pay 1 USDC to Zorglub");
  assert.ok(p.type === "actions" && p.steps[0].action === "pay" && p.steps[0].to === "Zorglub");
  assert.equal(recipientClarification("Zorglub", "pay 1 USDC to Zorglub"), T.en.unknownName("Zorglub"));
  assert.equal(fallbackPlan("pay 2 USDC to me").type, "clarify");
});
