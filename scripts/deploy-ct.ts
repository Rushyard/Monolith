/**
 * Deploy Monolith's confidential token: a vanilla (NoHooks) confidential
 * wrapper around testnet USDC, created through the shared 0.8.0 factory.
 *
 *   factory.deploy_vanilla_token(underlying = USDC SAC, verifier, auditor, salt)
 *
 * Writes deployments/testnet.json. Usage: npm run ct:deploy
 */
import { Address, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { ChainClient, keypairSigner } from "stellar-confidential-token-sdk";

import {
  PASSPHRASE,
  PROTOCOL,
  RPC_URL,
  SHARED_STACK,
  USDC_SAC,
  explorerTx,
  identity,
  saveDeployment,
} from "./_shared.js";

async function main(): Promise<void> {
  const deployer = await identity("deployer");
  console.log(`deployer   = ${deployer.publicKey()}`);
  console.log(`underlying = ${USDC_SAC} (USDC SAC)`);

  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    contracts: { token: "", verifier: SHARED_STACK.verifier, auditor: SHARED_STACK.auditor },
  });

  const salt = Math.floor(Math.random() * 2 ** 31);
  const r = await client.invoke(
    SHARED_STACK.factory,
    "deploy_vanilla_token",
    [
      new Address(USDC_SAC).toScVal(),
      new Address(SHARED_STACK.verifier).toScVal(),
      new Address(SHARED_STACK.auditor).toScVal(),
      nativeToScVal(salt, { type: "u32" }),
    ],
    keypairSigner(deployer.secret(), PASSPHRASE),
  );
  if (!r.returnValue) throw new Error("deploy_vanilla_token returned nothing");
  const token = scValToNative(r.returnValue) as string;

  const tx = await fetch(`${RPC_URL}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash: r.hash } }),
  }).then((res) => res.json() as Promise<{ result: { ledger: number } }>);

  saveDeployment({
    network: "testnet",
    protocol: PROTOCOL,
    rpcUrl: RPC_URL,
    passphrase: PASSPHRASE,
    kind: "vanilla",
    deployedAtLedger: tx.result.ledger,
    deployTx: r.hash,
    deployer: deployer.publicKey(),
    auditorId: SHARED_STACK.auditorId,
    contracts: {
      token,
      verifier: SHARED_STACK.verifier,
      auditor: SHARED_STACK.auditor,
      factory: SHARED_STACK.factory,
      underlying: USDC_SAC,
    },
  });

  console.log(`\n✅ confidential USDC token = ${token}`);
  console.log(`   ledger ${tx.result.ledger} · ${explorerTx(r.hash)}`);
  console.log("   wrote deployments/testnet.json");
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
