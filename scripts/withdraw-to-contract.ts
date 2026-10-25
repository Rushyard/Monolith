/**
 * Check that the vault can pay a CONTRACT address (e.g. the agent's smart
 * account): withdraw(from, to = C…, amount) — the withdraw proof doesn't bind
 * the destination, `from` authorizes it by signing.
 *
 *   fresh account: buy USDC → register → deposit 2 → merge → withdraw 1 to <C…>
 *   then read the USDC SAC balance of <C…> before/after.
 *
 * Usage: npm run ct:withdraw-to-contract -- <C… destination>
 */
import {
  ChainClient,
  CircuitProver,
  MemoryStore,
  StateEngine,
  addressToField,
  buildRegisterWitness,
  buildWithdrawWitness,
  deriveKeys,
  keypairSigner,
  randomScalar,
  submitDeposit,
  submitMerge,
  submitRegister,
  submitWithdraw,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/proving/artifacts";
import { Address, rpc, scValToNative, TransactionBuilder, Contract, Keypair } from "@stellar/stellar-sdk";

import { PASSPHRASE, RPC_URL, USDC_SAC, USDC_UNIT, acquireUsdc, explorerTx, freshKeypair, loadDeployment, toDecimal } from "./_shared.js";

async function sacBalance(of: string): Promise<bigint> {
  const server = new rpc.Server(RPC_URL);
  const src = Keypair.random().publicKey();
  const tx = new TransactionBuilder(
    await server.getAccount(src).catch(() => ({ accountId: () => src, sequenceNumber: () => "0", incrementSequenceNumber() {} }) as never),
    { fee: "100", networkPassphrase: PASSPHRASE },
  )
    .addOperation(new Contract(USDC_SAC).call("balance", new Address(of).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw new Error("balance simulation failed");
  return BigInt(scValToNative(sim.result.retval));
}

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to?.startsWith("C")) throw new Error("usage: npm run ct:withdraw-to-contract -- <C… destination>");
  const dep = loadDeployment();
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: dep.contracts.token, verifier: dep.contracts.verifier, auditor: dep.contracts.auditor },
  });
  const kAud = await client.auditorKey(dep.auditorId);
  const kp = await freshKeypair();
  const signer = keypairSigner(kp.secret(), PASSPHRASE);
  const keys = deriveKeys(randomScalar(), addressToField(dep.contracts.token));
  const engine = new StateEngine({ client, store: new MemoryStore(), keys, address: kp.publicKey(), fromLedger: dep.deployedAtLedger });
  const register = new CircuitProver(loadCircuit("register"));
  const withdraw = new CircuitProver(loadCircuit("withdraw"));
  try {
    console.log(`owner = ${kp.publicKey()} · destination = ${to}`);
    await acquireUsdc(kp, 3n * USDC_UNIT);
    const w0 = buildRegisterWitness(keys, kp.publicKey());
    await submitRegister(client, signer, kp.publicKey(), dep.auditorId, w0, (await register.prove(w0.inputs)).proof);
    await submitDeposit(client, signer, kp.publicKey(), kp.publicKey(), 2n * USDC_UNIT);
    await submitMerge(client, signer, kp.publicKey());
    await engine.sync();

    const before = await sacBalance(to);
    const { v, r } = await engine.spendableForProof();
    const w = buildWithdrawWitness({ keys, v, r, amount: USDC_UNIT, kAudS: kAud });
    const res = await submitWithdraw(client, signer, kp.publicKey(), to, USDC_UNIT, w, (await withdraw.prove(w.inputs)).proof);
    const after = await sacBalance(to);
    console.log(`withdraw 1 USDC → ${to}: ${explorerTx(res.hash)}`);
    console.log(`USDC balance of ${to}: ${toDecimal(before)} → ${toDecimal(after)}`);
    if (after - before !== USDC_UNIT) throw new Error("destination balance did not increase by 1 USDC");
    console.log("✅ the vault can fund a contract address");
  } finally {
    await Promise.all([register.destroy(), withdraw.destroy()]);
  }
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
