// Rend son budget à l'agent : remplace la règle B par une règle B neuve (historique vierge).
//   npm run reset-agent              → envoie les 2 tx (signées par l'owner via la règle A)
//   npm run reset-agent -- --dry-run → simule seulement, n'envoie rien
// Ordre choisi pour que l'agent n'ait jamais de pouvoir sans plafond :
//   1. remove_context_rule(ancienne règle B) : la policy est désinstallée, l'agent n'a plus aucune règle
//   2. add_context_rule(...)                 : nouvelle règle B, mêmes paramètres, nouvel id
// Vérifié dans OZ v0.8.0 (storage.rs) : remove_context_rule appelle try_uninstall sur chaque policy.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Address,
  callContractRule,
  externalSigner,
  invokeAsSmartAccount,
  keypairFromCli,
  loadDeployments,
  nativeToScVal,
  prepareSmartAccountCall,
  readSpendingState,
  rpc,
  saveDeployments,
  scValToNative,
  spendingLimitParams,
  txLink,
  usdc,
  xdr,
  type SmartAccountCall,
} from "./lib.ts";

const DRY = process.argv.includes("--dry-run");
const SPENDING_LIMIT = usdc(10);
const PERIOD_LEDGERS = 17_280; // ~24 h
const RULE_NAME = "agent-usdc-10-24h";

const d = loadDeployments();
const owner = keypairFromCli("owner");
const agent = keypairFromCli("agent");
const SA = d.smartAccount!;
const oldRule = d.ruleAgent!;

const asOwner = (fn: string, args: xdr.ScVal[]): SmartAccountCall => ({
  contract: SA,
  fn,
  args,
  smartAccount: SA,
  ruleId: d.ruleOwner ?? 0,
  signer: { kind: "delegated", keypair: owner },
  source: owner.publicKey(),
});

const removeCall = asOwner("remove_context_rule", [nativeToScVal(oldRule, { type: "u32" })]);
const addCall = asOwner("add_context_rule", [
  callContractRule(d.usdcSac),
  nativeToScVal(RULE_NAME, { type: "string" }),
  xdr.ScVal.scvVoid(),
  xdr.ScVal.scvVec([externalSigner(d.ed25519Verifier!, agent.rawPublicKey())]),
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: new Address(d.spendingLimitPolicy!).toScVal(), val: spendingLimitParams(SPENDING_LIMIT, PERIOD_LEDGERS) }),
  ]),
]);

const before = await readSpendingState(owner.publicKey(), d.spendingLimitPolicy!, SA, oldRule);
console.log(`Smart account ${SA}`);
console.log(`Règle B actuelle : id ${oldRule}, ${Number(before.spent) / 1e7} / ${Number(before.limit) / 1e7} USDC dépensés dans la fenêtre`);
console.log(`\n1. remove_context_rule(${oldRule})  — signée par l'owner (règle ${d.ruleOwner ?? 0})`);
console.log(`2. add_context_rule(CallContract(USDC SAC), "${RULE_NAME}", agent ${agent.publicKey().slice(0, 6)}…, spending_limit 10 USDC / ${PERIOD_LEDGERS} ledgers)`);

if (DRY) {
  for (const [label, call] of [["1. remove", removeCall], ["2. add", addCall]] as const) {
    const { enforced } = await prepareSmartAccountCall(call);
    if (rpc.Api.isSimulationError(enforced)) console.log(`  ✗ ${label} : simulation échouée : ${enforced.error.split("\n")[0]}`);
    else {
      const ret = enforced.result?.retval ? scValToNative(enforced.result.retval) : null;
      console.log(`  ✓ ${label} : simulation OK${ret && typeof ret === "object" && "id" in ret ? ` (nouvel id prévu : ${ret.id})` : ""}, frais ressources ~${Number(enforced.minResourceFee) / 1e7} XLM`);
    }
  }
  console.log("\nDry-run : rien n'a été envoyé.");
  process.exit(0);
}

const removed = await invokeAsSmartAccount(removeCall, owner);
if (!removed.ok) throw new Error(`remove_context_rule : ${removed.error}`);
console.log(`  ✓ règle ${oldRule} supprimée  ${txLink(removed.hash)}`);

const added = await invokeAsSmartAccount(addCall, owner);
if (!added.ok) throw new Error(`add_context_rule : ${added.error} — l'agent n'a plus de règle : relancer le script`);
const newRule = Number(scValToNative(added.returnValue!).id);
console.log(`  ✓ nouvelle règle B id ${newRule}  ${txLink(added.hash)}`);

d.ruleAgent = newRule;
d.resets = [...((d.resets as unknown[]) ?? []), { at: new Date().toISOString(), removed: oldRule, removeTx: removed.hash, added: newRule, addTx: added.hash }];
saveDeployments(d);
writeFileSync(
  join(import.meta.dirname, "..", "..", "app", "lib", "agent", "deployment.json"),
  JSON.stringify({ smartAccount: SA, usdcSac: d.usdcSac, ed25519Verifier: d.ed25519Verifier, spendingLimitPolicy: d.spendingLimitPolicy, ruleOwner: d.ruleOwner ?? 0, ruleAgent: newRule }, null, 2) + "\n",
);
console.log(`\n→ commiter contracts/deployments.testnet.json et app/lib/agent/deployment.json, puis redéployer (ou RULE_AGENT_ID=${newRule} sur Vercel).`);
