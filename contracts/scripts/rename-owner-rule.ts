// Renomme la règle A (« multisig », nom codé en dur par l'exemple OZ) en « owner ».
//   npx tsx scripts/rename-owner-rule.ts      (depuis contracts/)
// Sert aussi de test du flux d'approbation owner utilisé par /api/intent : l'owner est la
// source de la tx et son auth imbriquée __check_auth utilise des credentials « source account »,
// donc une seule signature d'enveloppe suffit (ce que fera Freighter avec signTransaction).
import {
  TransactionBuilder,
  invokeAsSmartAccountUnsigned,
  keypairFromCli,
  loadDeployments,
  nativeToScVal,
  NETWORK_PASSPHRASE,
  sendAndWait,
  txLink,
} from "./lib.ts";

const d = loadDeployments();
const owner = keypairFromCli("owner");

const prepared = await invokeAsSmartAccountUnsigned({
  contract: d.smartAccount!,
  fn: "update_context_rule_name",
  args: [nativeToScVal(d.ruleOwner ?? 0, { type: "u32" }), nativeToScVal("owner", { type: "string" })],
  smartAccount: d.smartAccount!,
  ruleId: d.ruleOwner ?? 0,
  signer: { kind: "delegated-source", address: owner.publicKey() },
  source: owner.publicKey(),
});
if (!prepared.ok) throw new Error(`simulation : ${prepared.error}`);

// Ce que ferait le navigateur : Freighter signe l'XDR non signé, puis on soumet.
const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, NETWORK_PASSPHRASE);
const res = await sendAndWait(tx as Parameters<typeof sendAndWait>[0], owner);
console.log(res.ok ? `✅ règle A renommée « owner »  ${txLink(res.hash)}` : `❌ ${res.error}`);
