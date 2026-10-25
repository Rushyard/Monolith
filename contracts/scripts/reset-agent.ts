// Rend son budget à l'agent : remplace la règle B par une règle B neuve (historique vierge).
// La règle remplacée est retrouvée on-chain (findAgentRule) ; l'app suit la nouvelle sans redéploiement.
//   npm run reset-agent              → envoie les 2 tx (signées par l'owner via la règle A)
//   npm run reset-agent -- --dry-run → simule seulement, n'envoie rien
// Ordre choisi pour que l'agent n'ait jamais de pouvoir sans plafond :
//   1. remove_context_rule(ancienne règle B) : la policy est désinstallée, l'agent n'a plus aucune règle
//   2. add_context_rule(...)                 : nouvelle règle B, mêmes paramètres, nouvel id
// Vérifié dans OZ v0.8.0 (storage.rs) : remove_context_rule appelle try_uninstall sur chaque policy.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_RULE,
  addAgentRuleArgs,
  findAgentRule,
  invokeAsSmartAccount,
  keypairFromCli,
  loadDeployments,
  nativeToScVal,
  prepareSmartAccountCall,
  readSpendingState,
  rpc,
  saveDeployments,
  scValToNative,
  txLink,
  xdr,
  type SmartAccountCall,
} from "./lib.ts";

const DRY = process.argv.includes("--dry-run");
// Mêmes paramètres que la réactivation après pause (core.ts AGENT_RULE) : 10 USDC / 17 280 ledgers (~24 h).
const SPENDING_LIMIT = AGENT_RULE.limit;
const PERIOD_LEDGERS = AGENT_RULE.periodLedgers;
const RULE_NAME = AGENT_RULE.name;

const d = loadDeployments();
const owner = keypairFromCli("owner");
const agent = keypairFromCli("agent");
const SA = d.smartAccount!;
// La règle à remplacer est celle qu'on trouve on-chain (signer agent + spending-limit), pas celle du fichier.
const found = await findAgentRule(owner.publicKey(), SA, d.ed25519Verifier!, agent.rawPublicKey(), d.spendingLimitPolicy!);
if (found === null) throw new Error("aucune règle agent trouvée on-chain : rien à remplacer");
if (found !== d.ruleAgent) console.warn(`⚠ deployments.testnet.json dit règle ${d.ruleAgent}, la chaîne dit ${found} : on suit la chaîne`);
const oldRule = found;

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
const addCall = asOwner("add_context_rule", addAgentRuleArgs(d.usdcSac, d.ed25519Verifier!, agent.rawPublicKey(), d.spendingLimitPolicy!));

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
console.log(`\n→ l'app retrouve la règle ${newRule} on-chain d'elle-même (cache 60 s) : pas de redéploiement.`);
console.log("  Commiter contracts/deployments.testnet.json et app/lib/agent/deployment.json (valeur de repli). Si RULE_AGENT_ID est défini sur Vercel, le supprimer.");
