// Déploie et configure le smart account Monolith sur testnet (P1).
//   npm run deploy            (depuis contracts/)
// Idempotent : les IDs déjà présents dans deployments.testnet.json sont réutilisés.
//
// Règle A (id 0, créée par le constructeur) : Default, signer = owner (Delegated), sans policy.
// Règle B : CallContract(USDC SAC), signer = agent (External Ed25519), policy = spending_limit.
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  DEPLOYMENTS_FILE,
  USDC_ISSUER,
  callContractRule,
  contractLink,
  externalSigner,
  invokeAsSmartAccount,
  keypairFromCli,
  saveDeployments,
  spendingLimitParams,
  stellar,
  txLink,
  usdc,
  type Deployments,
} from "./lib.ts";
import { readFileSync } from "node:fs";

const OZ_COMMIT = "ddc327eb92d63709436da3a8455f641c2d5476c5"; // OpenZeppelin/stellar-contracts v0.8.0
const WASM_DIR = join(import.meta.dirname, "..", "wasm");
const SPENDING_LIMIT = usdc(10); // 10 USDC (7 décimales)
const PERIOD_LEDGERS = 17_280; // ~24 h à ~5 s par ledger

const owner = keypairFromCli("owner");
const agent = keypairFromCli("agent");

const d: Deployments = existsSync(DEPLOYMENTS_FILE)
  ? JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf8"))
  : {
      ozCommit: OZ_COMMIT,
      usdcSac: stellar(["contract", "id", "asset", "--asset", `USDC:${USDC_ISSUER}`, "--network", "testnet"]),
    };

function deploy(wasm: string, alias: string, ctorArgs: string[] = []): string {
  const path = join(WASM_DIR, wasm);
  const args = ["contract", "deploy", "--wasm", path, "--source-account", "owner", "--network", "testnet", "--alias", alias];
  const out = stellar(ctorArgs.length ? [...args, "--", ...ctorArgs] : args);
  const id = out.split(/\s+/).find((t) => /^C[A-Z2-7]{55}$/.test(t));
  if (!id) throw new Error(`ID introuvable dans la sortie du deploy :\n${out}`);
  console.log(`✔ ${alias} → ${id}\n  ${contractLink(id)}`);
  return id;
}

if (!d.ed25519Verifier) d.ed25519Verifier = deploy("multisig_ed25519_verifier_example.wasm", "monolith_ed25519_verifier");
saveDeployments(d);
if (!d.spendingLimitPolicy) d.spendingLimitPolicy = deploy("multisig_spending_limit_policy_example.wasm", "monolith_spending_limit");
saveDeployments(d);
if (!d.smartAccount) {
  d.smartAccount = deploy("multisig_account_example.wasm", "monolith_smart_account", [
    "--signers",
    JSON.stringify([{ Delegated: owner.publicKey() }]),
    "--policies",
    "{}",
  ]);
  d.ruleOwner = 0;
}
saveDeployments(d);

if (d.ruleAgent === undefined) {
  const policies = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: new Address(d.spendingLimitPolicy).toScVal(),
      val: spendingLimitParams(SPENDING_LIMIT, PERIOD_LEDGERS),
    }),
  ]);
  const res = await invokeAsSmartAccount(
    {
    contract: d.smartAccount,
    fn: "add_context_rule",
    args: [
      callContractRule(d.usdcSac),
      nativeToScVal("agent-usdc-10-24h", { type: "string" }),
      xdr.ScVal.scvVoid(), // valid_until: None
      xdr.ScVal.scvVec([externalSigner(d.ed25519Verifier, agent.rawPublicKey())]),
      policies,
    ],
    smartAccount: d.smartAccount,
    ruleId: d.ruleOwner ?? 0,
    signer: { kind: "delegated", keypair: owner },
    source: owner.publicKey(),
    },
    owner,
  );
  if (!res.ok) throw new Error(`add_context_rule a échoué (${res.stage}) : ${res.error}`);
  const rule = scValToNative(res.returnValue!);
  d.ruleAgent = Number(rule.id);
  d.addRuleTx = res.hash;
  console.log(`✔ règle B (agent) id=${d.ruleAgent}\n  ${txLink(res.hash)}`);
  saveDeployments(d);
}

console.log("\nDéploiement :", JSON.stringify(d, null, 2));
