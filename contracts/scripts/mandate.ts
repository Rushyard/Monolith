// Mandat de l'agent : pose / change / retire l'expiration (valid_until) de la règle de l'agent, en UNE tx
// update_context_rule_valid_until signée par l'owner (règle A). Même id : le budget n'est pas touché.
//   npm run mandate -- --days 7 | --ledgers 30 | --none    [--dry-run]
//   npm run mandate -- --status                              état du mandat (lecture seule)
//   npm run mandate -- --check                               simule un paiement agent de 0,01 USDC (aucune tx)
//   npm run mandate -- --prepare-attempt                     prépare ET signe (sans envoyer) un paiement agent de 0,01 USDC
//   npm run mandate -- --submit-attempt                      envoie la tentative préparée (après expiration : refus on-chain #3002)
// Garde-fou : jamais de valid_until sur une autre règle que celle de l'agent (OZ mod.rs l.344-349 : une
// expiration sur la dernière règle d'administration verrouille le compte définitivement).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Address,
  NETWORK_PASSPHRASE,
  TransactionBuilder,
  assertMandateTarget,
  findAgentRule,
  invokeAsSmartAccount,
  keypairFromCli,
  loadDeployments,
  nativeToScVal,
  prepareSmartAccountCall,
  readContract,
  rpc,
  scValToNative,
  secondsPerLedger,
  sendAndWait,
  server,
  simulationErrorCode,
  txLink,
  usdc,
  validUntilArg,
  type RawContextRule,
  type SmartAccountCall,
} from "./lib.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (k: string) => process.argv.includes(k);
const DRY = has("--dry-run");
const ATTEMPT_FILE = join(tmpdir(), "monolith-mandate-attempt.xdr"); // tx signée, sans secret

const d = loadDeployments();
const owner = keypairFromCli("owner");
const agent = keypairFromCli("agent");
const SA = d.smartAccount!;
const alice = keypairFromCli("alice").publicKey();

const rule = await findAgentRule(owner.publicKey(), SA, d.ed25519Verifier!, agent.rawPublicKey(), d.spendingLimitPolicy!);
if (!rule) throw new Error("aucune règle de l'agent on-chain (agent en pause) : npm run reset-agent pour la recréer");
const ledger = (await server.getLatestLedger()).sequence;
const spl = await secondsPerLedger();
const human = (validUntil: number | null) =>
  validUntil === null ? "sans expiration" : validUntil < ledger ? `expirée (ledger ${validUntil} < ${ledger})` : `jusqu'au ledger ${validUntil} (≈ ${(((validUntil - ledger + 1) * spl) / 3600).toFixed(2)} h, ${spl.toFixed(2)} s/ledger mesurés)`;
console.log(`Règle de l'agent : id ${rule.id}, ${human(rule.validUntil)} — ledger courant ${ledger}`);

const agentPay = (validForLedgers = 720): SmartAccountCall => ({
  contract: d.usdcSac,
  fn: "transfer",
  args: [new Address(SA).toScVal(), new Address(alice).toScVal(), nativeToScVal(usdc(0.01), { type: "i128" })],
  smartAccount: SA,
  ruleId: rule.id,
  signer: { kind: "external", verifier: d.ed25519Verifier!, keypair: agent },
  source: agent.publicKey(),
  validForLedgers,
  timeoutSeconds: 3600,
});

if (has("--status")) process.exit(0);

if (has("--check")) {
  const { enforced } = await prepareSmartAccountCall(agentPay());
  console.log(rpc.Api.isSimulationError(enforced) ? `✗ simulation refusée : #${simulationErrorCode(enforced.error)}` : "✓ simulation OK : l'agent peut encore signer");
  process.exit(0);
}

if (has("--prepare-attempt")) {
  const { tx, enforced } = await prepareSmartAccountCall(agentPay(720));
  if (rpc.Api.isSimulationError(enforced)) throw new Error(`simulation déjà refusée (#${simulationErrorCode(enforced.error)}) : préparer AVANT l'expiration`);
  const signed = rpc.assembleTransaction(tx, enforced).build();
  signed.sign(agent);
  writeFileSync(ATTEMPT_FILE, signed.toXDR());
  console.log(`✓ tentative 0,01 USDC préparée et signée par l'agent (non envoyée) → ${ATTEMPT_FILE}\n  frais max ${Number(signed.fee) / 1e7} XLM ; à envoyer après l'expiration : --submit-attempt`);
  process.exit(0);
}

if (has("--submit-attempt")) {
  if (!existsSync(ATTEMPT_FILE)) throw new Error("aucune tentative préparée (--prepare-attempt)");
  const tx = TransactionBuilder.fromXDR(readFileSync(ATTEMPT_FILE, "utf8"), NETWORK_PASSPHRASE);
  const res = await sendAndWait(tx as Parameters<typeof sendAndWait>[0]);
  console.log(res.ok ? `⚠ acceptée (la règle n'avait pas expiré) ${txLink(res.hash)}` : `✓ refusée par le réseau : ${res.error} ${res.hash ? txLink(res.hash) : ""}`);
  process.exit(0);
}

// ---------- pose / change / retire l'expiration ----------
const days = arg("--days");
const ledgers = arg("--ledgers");
if (!has("--none") && !days && !ledgers) throw new Error("préciser --days N, --ledgers N ou --none");
const target = has("--none") ? null : ledger + (ledgers ? Number(ledgers) : Math.round((Number(days) * 86400) / spl));
if (target !== null && !(target > ledger)) throw new Error("durée invalide");

// Garde-fou : relire la règle et vérifier que c'est bien celle de l'agent avant d'y poser une expiration.
const raw = scValToNative((await readContract(owner.publicKey(), SA, "get_context_rule", [nativeToScVal(rule.id, { type: "u32" })]))!) as RawContextRule;
assertMandateTarget(raw, d.ed25519Verifier!, agent.rawPublicKey(), d.spendingLimitPolicy!);

const call: SmartAccountCall = {
  contract: SA,
  fn: "update_context_rule_valid_until",
  args: [nativeToScVal(rule.id, { type: "u32" }), validUntilArg(target)],
  smartAccount: SA,
  ruleId: d.ruleOwner ?? 0,
  signer: { kind: "delegated", keypair: owner },
  source: owner.publicKey(),
};
console.log(`update_context_rule_valid_until(${rule.id}, ${target === null ? "None" : target}) → ${human(target)} ; budget inchangé (même règle)`);
if (DRY) {
  const { enforced } = await prepareSmartAccountCall(call);
  console.log(rpc.Api.isSimulationError(enforced) ? `✗ simulation : ${enforced.error.split("\n")[0]}` : `✓ simulation OK, frais ressources ~${Number(enforced.minResourceFee) / 1e7} XLM\nDry-run : rien n'a été envoyé.`);
  process.exit(0);
}
const res = await invokeAsSmartAccount(call, owner);
console.log(res.ok ? `✓ mandat posé ${txLink(res.hash)}` : `✗ ${res.error}`);
