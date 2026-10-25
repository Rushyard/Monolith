// A2/A3 : champs manquants vérifiés en code + mémoire des 6 derniers tours, sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentSlots, slotQuestion, withMemory } from "../../app/lib/agent/slots.ts";
import { T } from "../../app/lib/agent/i18n.ts";

const SLOT_QUESTIONS = { both: T.fr.slotBoth, to: T.fr.slotTo, amount: T.fr.slotAmount };

test("« paie » → « Payer combien, et à qui ? »", () => {
  assert.equal(slotQuestion("paie"), SLOT_QUESTIONS.both);
  assert.equal(slotQuestion("pay"), T.en.slotBoth);
});

test("« paie 5 usdc » → « À qui ? »", () => {
  assert.equal(slotQuestion("paie 5 usdc"), SLOT_QUESTIONS.to);
  assert.equal(slotQuestion("send 2.5 USDC"), T.en.slotTo);
});

test("« paie alice » → « Combien ? » (même si le LLM avait inventé un montant)", () => {
  assert.equal(slotQuestion("paie alice"), SLOT_QUESTIONS.amount);
  assert.equal(slotQuestion("pague a Carol"), T.pt.slotAmount);
  assert.equal(slotQuestion("paie à Charlie"), SLOT_QUESTIONS.amount);
});

test("demande complète ou pas un paiement → null", () => {
  for (const m of ["paie 5 USDC à Alice", "pay 2 to bob", "envoie 3 usdc à GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B", "quel est mon solde ?", "verse les salaires"])
    assert.equal(slotQuestion(m), null, m);
});

test("une adresse G ne compte pas comme un montant", () => {
  assert.deepEqual(paymentSlots("paie GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B"), { isPay: true, amount: false, recipient: true });
});

test("mémoire : « paie alice » → « Combien ? » → « 5 » devient « paie alice 5 »", () => {
  const h = [{ role: "user" as const, text: "paie alice" }, { role: "assistant" as const, text: SLOT_QUESTIONS.amount }];
  assert.equal(withMemory("5 USDC", h), "paie alice 5 USDC");
  assert.equal(slotQuestion(withMemory("5 USDC", h)), null);
});

test("mémoire : chaîne de questions « paie » → … → « alice »", () => {
  const h = [
    { role: "user" as const, text: "paie" },
    { role: "assistant" as const, text: SLOT_QUESTIONS.both },
    { role: "user" as const, text: "5 usdc" },
    { role: "assistant" as const, text: SLOT_QUESTIONS.to },
  ];
  assert.equal(withMemory("alice", h), "paie 5 usdc alice");
});

test("mémoire : ignorée si le dernier message de l'agent n'est pas une de nos questions", () => {
  assert.equal(withMemory("5", [{ role: "user", text: "paie alice" }, { role: "assistant", text: "Combien veux-tu ?" }]), "5");
  assert.equal(withMemory("5", []), "5");
});

test("mémoire : limitée aux 6 derniers tours", () => {
  const old = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: i % 2 ? SLOT_QUESTIONS.both : `m${i}` }));
  const merged = withMemory("x", old);
  assert.equal(merged.split(" ").length, 4); // 3 messages utilisateur max dans 6 tours + le courant
});

test("la paie n'est pas un paiement à compléter (« pay the team », « paie l'équipe »)", () => {
  for (const m of ["pay the team", "paie l'équipe", "pagar salários", "run payroll"]) assert.equal(slotQuestion(m), null, m);
});
