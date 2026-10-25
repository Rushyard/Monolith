/**
 * Open a confidential-vault account for an existing testnet key (a payroll
 * member: Alice, Bob…), with our auditor (#1) so Marc can read their transfers.
 *
 *   USDC trustline (if missing) → register (proof verified on-chain) → read back
 *
 * The confidential key is derived exactly like the app does with Freighter:
 * an Ed25519 signature over the SEP-53 payload of `skSigningMessage(token,
 * account)`, then `deriveSk`. Ed25519 is deterministic, so the same account
 * imported into Freighter gets the same confidential key in /vault. Nothing is
 * written to disk. Idempotent: an already registered account is left as is.
 *
 * Usage: MEMBER_SECRET=$(stellar keys show bob) npm run ct:register-member
 */
import { Operation, TransactionBuilder, Keypair } from "@stellar/stellar-sdk";
import {
  ChainClient,
  CircuitProver,
  addressToField,
  buildRegisterWitness,
  deriveKeys,
  deriveSk,
  keypairSigner,
  sep53Payload,
  skSigningMessage,
  submitRegister,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/proving/artifacts";

import { PASSPHRASE, RPC_URL, USDC, explorerTx, horizon, loadDeployment } from "./_shared.js";

async function ensureTrustline(kp: Keypair): Promise<string | null> {
  const account = await horizon.loadAccount(kp.publicKey());
  const has = account.balances.some(
    (b) => "asset_code" in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer,
  );
  if (has) return null;
  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  return (await horizon.submitTransaction(tx)).hash;
}

async function main(): Promise<void> {
  const secret = process.env.MEMBER_SECRET?.trim();
  if (!secret) throw new Error("set MEMBER_SECRET (e.g. MEMBER_SECRET=$(stellar keys show bob))");
  const kp = Keypair.fromSecret(secret);
  const addr = kp.publicKey();

  const dep = loadDeployment();
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: dep.contracts.token, verifier: dep.contracts.verifier, auditor: dep.contracts.auditor },
  });
  console.log(`member = ${addr}`);
  console.log(`token  = ${dep.contracts.token} (confidential USDC), auditor #${dep.auditorId}`);

  const trust = await ensureTrustline(kp);
  console.log(trust ? `  USDC trustline: ${explorerTx(trust)}` : "  USDC trustline: already there");

  if (await client.isRegistered(addr)) {
    const acc = await client.confidentialBalance(addr);
    console.log(`  already registered (auditor #${acc?.auditorId}), nothing to do`);
    return;
  }

  const root = kp.sign(Buffer.from(sep53Payload(skSigningMessage(dep.contracts.token, addr))));
  const keys = deriveKeys(deriveSk(root, dep.contracts.token, addr).sk, addressToField(dep.contracts.token));

  const prover = new CircuitProver(loadCircuit("register"));
  try {
    const w = buildRegisterWitness(keys, addr);
    const { proof } = await prover.prove(w.inputs);
    const r = await submitRegister(client, keypairSigner(secret, PASSPHRASE), addr, dep.auditorId, w, proof);
    console.log(`  register: ${explorerTx(r.hash)}`);
  } finally {
    await prover.destroy();
  }

  const acc = await client.confidentialBalance(addr);
  if (!acc || acc.auditorId !== dep.auditorId) throw new Error(`read-back failed: ${JSON.stringify(acc?.auditorId)}`);
  console.log(`✅ ${addr} registered with auditor #${acc.auditorId}`);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
