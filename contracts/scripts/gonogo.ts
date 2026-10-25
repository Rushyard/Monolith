// Go/no-go P1 : le plafond de l'agent est appliqué par le réseau, pas par notre serveur.
//   npm run gonogo            (depuis contracts/)
//   a) agent → 5 USDC vers alice   : doit RÉUSSIR
//   b) agent → 50 USDC vers alice  : doit ÉCHOUER avec SpendingLimitExceeded (#3221)
//   c) owner → 50 USDC vers alice  : doit RÉUSSIR
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Address, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import {
  invokeAsClassic,
  invokeAsSmartAccount,
  keypairFromCli,
  loadDeployments,
  prepareSmartAccountCall,
  readContract,
  sendAndWait,
  txLink,
  usdc,
  type SmartAccountCall,
} from "./lib.ts";

const d = loadDeployments();
const owner = keypairFromCli("owner");
const agent = keypairFromCli("agent");
const aliceKp = keypairFromCli("alice");
const alice = aliceKp.publicKey();
const SA = d.smartAccount!;

const agentSigner = { kind: "external" as const, verifier: d.ed25519Verifier!, keypair: agent };
const ownerSigner = { kind: "delegated" as const, keypair: owner };

const transferArgs = (amount: bigint) => [
  new Address(SA).toScVal(),
  new Address(alice).toScVal(),
  nativeToScVal(amount, { type: "i128" }),
];
const transfer = (amount: bigint, who: "agent" | "owner"): SmartAccountCall => ({
  contract: d.usdcSac,
  fn: "transfer",
  args: transferArgs(amount),
  smartAccount: SA,
  ruleId: who === "agent" ? d.ruleAgent! : d.ruleOwner!,
  signer: who === "agent" ? agentSigner : ownerSigner,
  feePayer: who === "agent" ? agent : owner,
});

const fmt = (v: bigint) => `${Number(v) / 1e7} USDC`;
async function balance(addr: string) {
  return BigInt(scValToNative((await readContract(owner, d.usdcSac, "balance", [new Address(addr).toScVal()]))!));
}
async function spent() {
  const data = scValToNative(
    (await readContract(owner, d.spendingLimitPolicy!, "get_spending_limit_data", [
      nativeToScVal(d.ruleAgent!, { type: "u32" }),
      new Address(SA).toScVal(),
    ]))!,
  );
  return `${fmt(BigInt(data.cached_total_spent))} dépensés / plafond ${fmt(BigInt(data.spending_limit))} sur ${data.period_ledgers} ledgers`;
}
async function state(label: string) {
  console.log(`  [${label}] smart account ${fmt(await balance(SA))} · alice ${fmt(await balance(alice))} · agent : ${await spent()}`);
}

const results: Record<string, unknown> = { date: new Date().toISOString(), smartAccount: SA };
let pass = true;

console.log(`Smart account ${SA}`);
await state("avant");

// a) agent → 5 USDC
console.log("\na) agent → 5 USDC vers alice (attendu : SUCCÈS)");
const a = await invokeAsSmartAccount(transfer(usdc(5), "agent"));
if (a.ok) console.log(`  ✅ succès  ${txLink(a.hash)}`);
else console.log(`  ❌ échec inattendu (${a.stage}) : ${a.error}`);
pass &&= a.ok;
results.a = { ...a, returnValue: undefined };
await state("après a");

// b) agent → 50 USDC
console.log("\nb) agent → 50 USDC vers alice (attendu : ÉCHEC #3221)");
const b50 = await prepareSmartAccountCall(transfer(usdc(50), "agent"));
const simError = rpc.Api.isSimulationError(b50.enforced) ? b50.enforced.error : null;
const simHas3221 = !!simError && simError.includes("#3221");
console.log(simHas3221 ? "  ✅ simulation rejetée : Error(Contract, #3221) SpendingLimitExceeded" : `  ❌ simulation : ${simError ?? "a réussi !"}`);
// Preuve on-chain : on soumet quand même la tx. Le footprint vient d'une simulation à 1 USDC
// avec le même nonce (même clés de stockage), seul le montant signé diffère.
const probe = await prepareSmartAccountCall({ ...transfer(usdc(1), "agent"), forceNonce: b50.nonce });
let bOnchain: Awaited<ReturnType<typeof sendAndWait>> | null = null;
if (!rpc.Api.isSimulationError(probe.enforced)) {
  probe.enforced.minResourceFee = (BigInt(probe.enforced.minResourceFee) * 2n).toString();
  bOnchain = await sendAndWait(rpc.assembleTransaction(b50.tx, probe.enforced).build(), agent);
  if (!bOnchain.ok) console.log(`  ✅ rejetée par le réseau : ${bOnchain.error}  ${txLink(bOnchain.hash!)}`);
  else console.log(`  ❌ la tx de 50 USDC est PASSÉE : ${txLink(bOnchain.hash)}`);
} else console.log(`  ⚠️ probe 1 USDC impossible : ${probe.enforced.error}`);
const bOk = simHas3221 && (!bOnchain || (!bOnchain.ok && bOnchain.error.includes("#3221")));
pass &&= bOk;
results.b = { simulationError: simError?.split("\n").slice(0, 3).join(" | "), onchain: bOnchain };
await state("après b");

// c) owner → 50 USDC
console.log("\nc) owner → 50 USDC vers alice (attendu : SUCCÈS)");
const c = await invokeAsSmartAccount(transfer(usdc(50), "owner"));
if (c.ok) console.log(`  ✅ succès  ${txLink(c.hash)}`);
else console.log(`  ❌ échec inattendu (${c.stage}) : ${c.error}`);
pass &&= c.ok;
results.c = { ...c, returnValue: undefined };
await state("après c");

// Remise à zéro : alice renvoie au smart account tout ce qu'elle a reçu, pour rejouer la démo.
const aliceBal = await balance(alice);
if (aliceBal > 0n) {
  const back = await invokeAsClassic(aliceKp, d.usdcSac, "transfer", [
    new Address(alice).toScVal(),
    new Address(SA).toScVal(),
    nativeToScVal(aliceBal, { type: "i128" }),
  ]);
  console.log(back.ok ? `
↩ alice renvoie ${fmt(aliceBal)} au smart account  ${txLink(back.hash)}` : `
⚠️ renvoi alice échoué : ${back.error}`);
  results.refund = { ...back, returnValue: undefined };
  await state("après remise à zéro");
}

results.pass = pass;
writeFileSync(join(import.meta.dirname, "..", "gonogo.testnet.json"), JSON.stringify(results, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
console.log(`\n${pass ? "🟢 GO" : "🔴 NO-GO"} — résultats dans contracts/gonogo.testnet.json`);
process.exit(pass ? 0 : 1);
