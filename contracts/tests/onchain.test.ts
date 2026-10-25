// Tests P1 contre le testnet, en SIMULATION uniquement : aucune tx n'est envoyée, aucun
// USDC ni budget consommé. Chaque appel est signé pour de vrai (auth du smart account en mode
// enforcing), donc la simulation exécute __check_auth et la spending-limit policy on-chain.
// Codes OZ v0.8.0 : 3002 UnvalidatedContext, 3221 SpendingLimitExceeded, 3223 NotAllowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentRuleId } from "../../app/lib/agent/config.ts";
import { isInVault } from "../../app/lib/agent/vault.ts";
import {
  Address,
  findAgentRule,
  keypairFromCli,
  loadDeployments,
  nativeToScVal,
  prepareSmartAccountCall,
  readSpendingState,
  rpc,
  stellar,
  usdc,
  type SmartAccountCall,
} from "../scripts/lib.ts";

const d = loadDeployments();
const agent = keypairFromCli("agent");
const owner = keypairFromCli("owner");
const alice = keypairFromCli("alice").publicKey();
const SA = d.smartAccount!;
const XLM_SAC = stellar(["contract", "id", "asset", "--asset", "native", "--network", "testnet"]);

const asAgent = (over: Partial<SmartAccountCall>): SmartAccountCall => ({
  contract: d.usdcSac,
  fn: "transfer",
  args: [],
  smartAccount: SA,
  ruleId: d.ruleAgent!,
  signer: { kind: "external", verifier: d.ed25519Verifier!, keypair: agent },
  source: agent.publicKey(),
  ...over,
});
const usdcTransfer = (amount: bigint) => [new Address(SA).toScVal(), new Address(alice).toScVal(), nativeToScVal(amount, { type: "i128" })];

/** Simule l'appel signé ; renvoie "ok" ou la liste des codes Error(Contract, #n). */
async function simulate(call: SmartAccountCall): Promise<"ok" | number[]> {
  const { enforced } = await prepareSmartAccountCall(call);
  if (!rpc.Api.isSimulationError(enforced)) return "ok";
  return [...enforced.error.matchAll(/Error\(Contract, #(\d+)\)/g)].map((m) => Number(m[1]));
}

const budget = await readSpendingState(owner.publicKey(), d.spendingLimitPolicy!, SA, d.ruleAgent!);

test("règle de l'agent retrouvée on-chain = deployments.testnet.json (et l'app suit)", async () => {
  const onchain = await findAgentRule(owner.publicKey(), SA, d.ed25519Verifier!, agent.rawPublicKey(), d.spendingLimitPolicy!);
  assert.equal(onchain, d.ruleAgent);
  delete process.env.RULE_AGENT_ID;
  assert.equal(await agentRuleId(), d.ruleAgent);
});

test("agent sous le plafond (règle B) : simulation OK", { skip: budget.remaining === 0n && "budget de l'agent épuisé (npm run reset-agent)" }, async () => {
  const amount = budget.remaining < usdc(0.01) ? budget.remaining : usdc(0.01);
  assert.equal(await simulate(asAgent({ args: usdcTransfer(amount) })), "ok");
});

test("agent au-dessus du plafond : #3221 SpendingLimitExceeded", async () => {
  const res = await simulate(asAgent({ args: usdcTransfer(budget.remaining + usdc(1)) }));
  assert.notEqual(res, "ok");
  assert.ok((res as number[]).includes(3221), `codes : ${res}`);
});

test("agent qui cite la règle A (owner) : rejeté #3002 UnvalidatedContext", async () => {
  const res = await simulate(asAgent({ ruleId: d.ruleOwner ?? 0, args: usdcTransfer(usdc(0.01)) }));
  assert.notEqual(res, "ok");
  assert.ok((res as number[]).includes(3002), `codes : ${res}`);
});

test("agent qui appelle le smart account lui-même (changer ses règles) : rejeté #3002", async () => {
  const res = await simulate(
    asAgent({ contract: SA, fn: "update_context_rule_name", args: [nativeToScVal(d.ruleAgent!, { type: "u32" }), nativeToScVal("pwned", { type: "string" })] }),
  );
  assert.notEqual(res, "ok");
  assert.ok((res as number[]).includes(3002), `codes : ${res}`);
});

test("agent qui transfère un autre token (XLM natif) : rejeté #3002", async () => {
  const args = [new Address(SA).toScVal(), new Address(alice).toScVal(), nativeToScVal(0n, { type: "i128" })];
  const res = await simulate(asAgent({ contract: XLM_SAC, args }));
  assert.notEqual(res, "ok");
  assert.ok((res as number[]).includes(3002), `codes : ${res}`);
});

test("agent qui appelle approve sur l'USDC (pas un transfer) : rejeté #3223 NotAllowed", async () => {
  const args = [new Address(SA).toScVal(), new Address(agent.publicKey()).toScVal(), nativeToScVal(usdc(1), { type: "i128" }), nativeToScVal(budget.ledger + 1000, { type: "u32" })];
  const res = await simulate(asAgent({ fn: "approve", args }));
  assert.notEqual(res, "ok");
  assert.ok((res as number[]).includes(3223), `codes : ${res}`);
});

test("owner via la règle A : 50 USDC, simulation OK", async () => {
  const res = await simulate({
    contract: d.usdcSac,
    fn: "transfer",
    args: usdcTransfer(usdc(50)),
    smartAccount: SA,
    ruleId: d.ruleOwner ?? 0,
    signer: { kind: "delegated", keypair: owner },
    source: owner.publicKey(),
  });
  assert.equal(res, "ok");
});

test("owner en mode Freighter (source = owner, credentials source-account) : simulation OK", async () => {
  const res = await simulate({
    contract: d.usdcSac,
    fn: "transfer",
    args: usdcTransfer(usdc(50)),
    smartAccount: SA,
    ruleId: d.ruleOwner ?? 0,
    signer: { kind: "delegated-source", address: owner.publicKey() },
    source: owner.publicKey(),
  });
  assert.equal(res, "ok");
});

test("coffre (simulation) : Bob inscrit, Alice non → routage privé / public", async () => {
  assert.equal(await isInVault("GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV"), true);
  assert.equal(await isInVault(alice), false);
});
