/**
 * P2 go/no-go — the confidential vault, end to end on testnet, in USDC:
 *
 *   alice: buy USDC on the DEX → register → deposit 20 (public) → merge
 *   alice → bob: confidential_transfer 7.5 USDC (amount hidden on-chain)
 *   auditor: decrypt that transfer's amount from the event
 *   bob: register → merge → withdraw 7.5 (public)
 *
 * Every proof is verified on-chain by the UltraHonk verifier, and every
 * StateEngine.sync() fails unless the local openings match the on-chain
 * commitments. Fresh friendbot accounts each run.
 *
 * Writes deployments/testnet-e2e.json (tx hashes). Usage: npm run ct:e2e
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Keypair } from "@stellar/stellar-sdk";
import {
  ChainClient,
  CircuitProver,
  MemoryStore,
  StateEngine,
  addressToField,
  auditTransfer,
  buildRegisterWitness,
  buildTransferWitness,
  buildWithdrawWitness,
  deriveKeys,
  fetchEvents,
  keypairSigner,
  randomScalar,
  submitDeposit,
  submitMerge,
  submitRegister,
  submitTransfer,
  submitWithdraw,
  type KeyPair,
  type Signer,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/proving/artifacts";

import {
  PASSPHRASE,
  REPO_ROOT,
  RPC_URL,
  USDC_UNIT,
  acquireUsdc,
  explorerTx,
  freshKeypair,
  loadDeployment,
  toDecimal,
} from "./_shared.js";

/**
 * Secret key of the shared stack's auditor id 0, published on purpose by
 * brozorec/stellar-confidential-token-demo so anyone can play the auditor.
 * Demo only: a real auditor key never leaves the auditor's machine.
 */
const SHARED_AUDITOR_SECRET = "0x1165798bd0efb257cca0ac3d1d88bb549267d30a23fcb3c4e69eea4b7f872bc7";

const DEPOSIT = 20n * USDC_UNIT;
const TRANSFER = 75n * (USDC_UNIT / 10n); // 7.5 USDC

const usdc = (v: bigint) => `${toDecimal(v)} USDC`;

async function timed<T>(label: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await f();
  console.log(`  ${label}: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  return out;
}

async function main(): Promise<void> {
  const dep = loadDeployment();
  console.log(`token = ${dep.contracts.token} (confidential USDC)`);
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: dep.contracts.token, verifier: dep.contracts.verifier, auditor: dep.contracts.auditor },
  });
  const addrF = addressToField(dep.contracts.token);
  const kAud = await client.auditorKey(dep.auditorId);
  const hashes: Record<string, string> = {};

  const registerProver = new CircuitProver(loadCircuit("register"));
  const transferProver = new CircuitProver(loadCircuit("transfer"));
  const withdrawProver = new CircuitProver(loadCircuit("withdraw"));

  const party = async (label: string) => {
    const kp: Keypair = await freshKeypair();
    const signer: Signer = keypairSigner(kp.secret(), PASSPHRASE);
    const keys: KeyPair = deriveKeys(randomScalar(), addrF);
    const engine = new StateEngine({
      client, store: new MemoryStore(), keys, address: kp.publicKey(), fromLedger: dep.deployedAtLedger,
    });
    console.log(`  ${label} = ${kp.publicKey()}`);
    return { kp, signer, keys, engine, addr: kp.publicKey() };
  };

  try {
    console.log("\n[accounts]");
    const alice = await party("alice");
    const bob = await party("bob");
    hashes.aliceBuyUsdc = await acquireUsdc(alice.kp, 30n * USDC_UNIT);
    // Bob only needs a trustline to receive his withdrawal; buy a dust amount.
    await acquireUsdc(bob.kp, USDC_UNIT / 100n);
    console.log("  alice bought 30 USDC on the testnet DEX");

    console.log("\n[register] (proof timings)");
    for (const [name, p] of [["alice", alice], ["bob", bob]] as const) {
      const w = buildRegisterWitness(p.keys, p.addr);
      const { proof } = await timed(`${name} register proof`, () => registerProver.prove(w.inputs));
      const r = await submitRegister(client, p.signer, p.addr, dep.auditorId, w, proof);
      hashes[`${name}Register`] = r.hash;
    }

    console.log(`\n[deposit + merge] alice deposits ${usdc(DEPOSIT)} (public)`);
    hashes.aliceDeposit = (await submitDeposit(client, alice.signer, alice.addr, alice.addr, DEPOSIT)).hash;
    hashes.aliceMerge = (await submitMerge(client, alice.signer, alice.addr)).hash;
    {
      const s = await alice.engine.sync();
      assert(s.spendable.v === DEPOSIT, `alice spendable ${s.spendable.v}, want ${DEPOSIT}`);
      console.log(`  alice spendable = ${usdc(s.spendable.v)} (matches chain ✓)`);
    }

    console.log(`\n[confidential transfer] alice → bob ${usdc(TRANSFER)}`);
    {
      const { v, r: blinding } = await alice.engine.spendableForProof();
      const w = buildTransferWitness({
        keys: alice.keys, v, r: blinding, amount: TRANSFER, pvkB: bob.keys.PVK, kAudR: kAud, kAudS: kAud,
      });
      const { proof } = await timed("transfer proof", () => transferProver.prove(w.inputs));
      const r = await submitTransfer(client, alice.signer, alice.addr, bob.addr, w, proof);
      hashes.confidentialTransfer = r.hash;
      console.log(`  ${explorerTx(r.hash)}`);
    }
    {
      const a = await alice.engine.sync();
      assert(a.spendable.v === DEPOSIT - TRANSFER, `alice spendable ${a.spendable.v}`);
      const b = await bob.engine.sync();
      assert(b.receiving.v === TRANSFER, `bob receiving ${b.receiving.v}`);
      console.log(`  alice spendable = ${usdc(a.spendable.v)} · bob receiving = ${usdc(b.receiving.v)} (✓)`);
    }

    console.log("\n[auditor] decrypt the transfer from its on-chain event");
    {
      const { events } = await fetchEvents(client, { startLedger: dep.deployedAtLedger });
      const ev = events.find((e) => e.type === "transfer" && e.txHash === hashes.confidentialTransfer);
      if (!ev || ev.type !== "transfer") throw new Error("transfer event not found");
      const d = auditTransfer(BigInt(SHARED_AUDITOR_SECRET), ev);
      assert(d.channelsAgree && d.amount === TRANSFER, `auditor decrypted ${d.amount}`);
      console.log(`  auditor sees amount = ${usdc(d.amount)}, sender balance after = ${usdc(d.senderBalance)} (✓)`);
    }

    console.log(`\n[merge + withdraw] bob withdraws ${usdc(TRANSFER)} (public)`);
    hashes.bobMerge = (await submitMerge(client, bob.signer, bob.addr)).hash;
    {
      await bob.engine.sync();
      const { v, r: blinding } = await bob.engine.spendableForProof();
      const w = buildWithdrawWitness({ keys: bob.keys, v, r: blinding, amount: TRANSFER, kAudS: kAud });
      const { proof } = await timed("withdraw proof", () => withdrawProver.prove(w.inputs));
      hashes.bobWithdraw = (await submitWithdraw(client, bob.signer, bob.addr, bob.addr, TRANSFER, w, proof)).hash;
      const b = await bob.engine.sync();
      assert(b.spendable.v === 0n, `bob spendable ${b.spendable.v}`);
    }

    const out = join(REPO_ROOT, "deployments", "testnet-e2e.json");
    writeFileSync(
      out,
      JSON.stringify({ ranAt: new Date().toISOString(), token: dep.contracts.token, alice: alice.addr, bob: bob.addr, hashes }, null, 2) + "\n",
    );
    console.log("\n✅ confidential USDC flow verified on testnet. Hashes → deployments/testnet-e2e.json");
  } finally {
    await Promise.all([registerProver.destroy(), transferProver.destroy(), withdrawProver.destroy()]);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
