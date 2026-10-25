/**
 * Give Monolith its own auditor, using only components already on testnet:
 *
 *   1. a fresh Grumpkin auditor key (secret kept in .keys/testnet.json, git-ignored)
 *   2. our own instance of OpenZeppelin's auditor registry, created from the
 *      registry wasm already installed on testnet (no compilation)
 *   3. register_key(auditor_id, K_aud = sk · H) in that registry
 *   4. a new confidential USDC via the shared factory, bound to our registry
 *
 * The previous deployment (shared registry, public auditor id 0) is kept in
 * deployments/testnet-v1-shared-auditor.json. Usage: npm run ct:auditor
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Address, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { ChainClient, H, pointToBytes, randomScalar, scalarMul, toHex32 } from "stellar-confidential-token-sdk";

import {
  PASSPHRASE,
  PROTOCOL,
  REPO_ROOT,
  RPC_URL,
  SHARED_STACK,
  USDC_SAC,
  explorerTx,
  identity,
  saveDeployment,
} from "./_shared.js";

/** OpenZeppelin `confidential_auditor_example` wasm, installed on testnet by the shared stack. */
const REGISTRY_WASM_HASH = "b8b247677b7d8148a4f82fabebf787eb0a43f995373adb6cc6e9d3564952c137";
/** Id of our key in our registry (1, so it can't be mistaken for the shared, public id 0). */
const AUDITOR_ID = 1;
/** Published secret of the shared registry's id 0, only used to check the K = sk · H convention. */
const SHARED_ID0_SECRET = 0x1165798bd0efb257cca0ac3d1d88bb549267d30a23fcb3c4e69eea4b7f872bc7n;

const KEYS_FILE = join(REPO_ROOT, ".keys", "testnet.json");
const server = new rpc.Server(RPC_URL);

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Auditor secret: created once, then reused (re-running must not rotate it silently). */
function auditorSecret(): bigint {
  const keys: Record<string, string> = existsSync(KEYS_FILE) ? JSON.parse(readFileSync(KEYS_FILE, "utf8")) : {};
  if (!keys.auditorGrumpkinSk) {
    keys.auditorGrumpkinSk = toHex32(randomScalar());
    writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  }
  return BigInt(keys.auditorGrumpkinSk);
}

async function submit(kp: Keypair, op: xdr.Operation): Promise<rpc.Api.GetSuccessfulTransactionResponse & { hash: string }> {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: "1000000", networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  const res = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status !== "SUCCESS") throw new Error(`tx ${sent.hash} ${res.status}`);
  return { ...(res as rpc.Api.GetSuccessfulTransactionResponse), hash: sent.hash };
}

async function main(): Promise<void> {
  const admin = await identity("auditor-admin");
  console.log(`registry admin = ${admin.publicKey()}`);

  // Convention check against the shared registry before touching anything.
  const shared = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: "", verifier: SHARED_STACK.verifier, auditor: SHARED_STACK.auditor },
  });
  const sharedK0 = await shared.auditorKey(SHARED_STACK.auditorId);
  if (!sharedK0.equals(scalarMul(SHARED_ID0_SECRET, H))) throw new Error("auditor key is not sk · H — stop");
  console.log("✓ auditor public key convention: K_aud = sk · H");

  const sk = auditorSecret();
  const point = pointToBytes(scalarMul(sk, H));
  console.log(`auditor public key = ${hex(point)}`);

  console.log("\n[1] create our auditor registry instance from the installed OZ wasm");
  const created = await submit(
    admin,
    Operation.createCustomContract({
      address: new Address(admin.publicKey()),
      wasmHash: Buffer.from(REGISTRY_WASM_HASH, "hex"),
      salt: Buffer.from(randomScalar().toString(16).padStart(64, "0").slice(0, 64), "hex"),
      constructorArgs: [new Address(admin.publicKey()).toScVal(), new Address(admin.publicKey()).toScVal()],
    }),
  );
  const registry = Address.fromScVal(created.returnValue!).toString();
  console.log(`  registry = ${registry} · ${explorerTx(created.hash)}`);

  console.log(`\n[2] register_key(${AUDITOR_ID}, K_aud)`);
  const reg = await submit(
    admin,
    Operation.invokeContractFunction({
      contract: registry,
      function: "register_key",
      args: [
        nativeToScVal(AUDITOR_ID, { type: "u32" }),
        xdr.ScVal.scvBytes(Buffer.from(point)),
        new Address(admin.publicKey()).toScVal(),
      ],
    }),
  );
  const ours = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: "", verifier: SHARED_STACK.verifier, auditor: registry },
  });
  if (!(await ours.auditorKey(AUDITOR_ID)).equals(scalarMul(sk, H))) throw new Error("registered key mismatch");
  console.log(`  ✓ get_key(${AUDITOR_ID}) matches · ${explorerTx(reg.hash)}`);

  console.log("\n[3] deploy_vanilla_token(USDC SAC, shared verifier, OUR registry)");
  const dep = await submit(
    admin,
    Operation.invokeContractFunction({
      contract: SHARED_STACK.factory,
      function: "deploy_vanilla_token",
      args: [
        new Address(USDC_SAC).toScVal(),
        new Address(SHARED_STACK.verifier).toScVal(),
        new Address(registry).toScVal(),
        nativeToScVal(Math.floor(Math.random() * 2 ** 31), { type: "u32" }),
      ],
    }),
  );
  const token = scValToNative(dep.returnValue!) as string;
  console.log(`  token = ${token} · ledger ${dep.ledger} · ${explorerTx(dep.hash)}`);

  const v1 = join(REPO_ROOT, "deployments", "testnet.json");
  const v1Backup = join(REPO_ROOT, "deployments", "testnet-v1-shared-auditor.json");
  if (!existsSync(v1Backup)) copyFileSync(v1, v1Backup);
  saveDeployment({
    network: "testnet",
    protocol: PROTOCOL,
    rpcUrl: RPC_URL,
    passphrase: PASSPHRASE,
    kind: "vanilla",
    deployedAtLedger: dep.ledger,
    deployTx: dep.hash,
    deployer: admin.publicKey(),
    auditorId: AUDITOR_ID,
    contracts: { token, verifier: SHARED_STACK.verifier, auditor: registry, factory: SHARED_STACK.factory, underlying: USDC_SAC },
  });
  writeFileSync(
    join(REPO_ROOT, "deployments", "auditor.json"),
    JSON.stringify(
      {
        registry,
        registryWasmHash: REGISTRY_WASM_HASH,
        admin: admin.publicKey(),
        auditorId: AUDITOR_ID,
        auditorPublicKey: hex(point),
        txs: { createRegistry: created.hash, registerKey: reg.hash, deployToken: dep.hash },
      },
      null,
      2,
    ) + "\n",
  );
  console.log("\n✅ wrote deployments/testnet.json (+ v1 backup) and deployments/auditor.json");
  console.log("   auditor secret: .keys/testnet.json → auditorGrumpkinSk (never commit, never ship to the app)");
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
