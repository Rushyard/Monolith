/**
 * Shared helpers for the testnet scripts (P2 — confidential vault).
 *
 * Secrets for script identities live in `.keys/testnet.json` (git-ignored).
 * Public deployment data lives in `deployments/testnet.json` (committed).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const PASSPHRASE = Networks.TESTNET;
export const FRIENDBOT = "https://friendbot.stellar.org";

/** Circle's testnet USDC. */
export const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
export const USDC_SAC = USDC.contractId(PASSPHRASE);
/** USDC has 7 decimals on Stellar: 1 USDC = 10_000_000 base units. */
export const USDC_UNIT = 10_000_000n;

/**
 * Shared confidential-token stack on testnet (`stellar-confidential` 0.8.0),
 * deployed by brozorec/stellar-confidential-token-demo. Its auditor id 0 has a
 * publicly known secret key — demo only, see docs/architecture.md.
 */
export const SHARED_STACK = {
  verifier: "CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ",
  auditor: "CBQZRK72Y6KJ5DR4CUHKLHMHIKBMOZNSYTWHRUQPEXA35PRCBMSPBZTW",
  factory: "CAWPCXMW47UET5Z4N5T44PRDGAY6CZVP2O2JDEBL7YWEUHJGQ2BR4L6R",
  auditorId: 0,
} as const;

export const PROTOCOL = "stellar-confidential 0.8.0";

const KEYS_FILE = join(REPO_ROOT, ".keys", "testnet.json");
const DEPLOYMENT_FILE = join(REPO_ROOT, "deployments", "testnet.json");

export const horizon = new Horizon.Server(HORIZON_URL);

export interface CtDeployment {
  network: "testnet";
  protocol: string;
  rpcUrl: string;
  passphrase: string;
  kind: "vanilla";
  deployedAtLedger: number;
  deployTx: string;
  deployer: string;
  auditorId: number;
  contracts: {
    token: string;
    verifier: string;
    auditor: string;
    factory: string;
    underlying: string;
  };
}

export async function friendbotFund(pubkey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(pubkey)}`);
  // 400 = already funded.
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot failed for ${pubkey}: ${res.status}`);
  }
}

/** Load a named script identity, creating and funding it on first use. */
export async function identity(name: string): Promise<Keypair> {
  const keys: Record<string, string> = existsSync(KEYS_FILE)
    ? JSON.parse(readFileSync(KEYS_FILE, "utf8"))
    : {};
  if (keys[name]) return Keypair.fromSecret(keys[name]);

  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  keys[name] = kp.secret();
  mkdirSync(dirname(KEYS_FILE), { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  return kp;
}

/** A fresh friendbot-funded keypair, not persisted. */
export async function freshKeypair(): Promise<Keypair> {
  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  return kp;
}

/**
 * Give `kp` a USDC trustline and buy `amount` base units of USDC with XLM on
 * the testnet DEX (path payment to self). Idempotent on the trustline.
 */
export async function acquireUsdc(kp: Keypair, amount: bigint): Promise<string> {
  const account = await horizon.loadAccount(kp.publicKey());
  const hasTrustline = account.balances.some(
    (b) => "asset_code" in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer,
  );
  const builder = new TransactionBuilder(account, { fee: "1000", networkPassphrase: PASSPHRASE });
  if (!hasTrustline) builder.addOperation(Operation.changeTrust({ asset: USDC }));
  builder.addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: "2000", // XLM; friendbot gives 10k, the book is ~1.15 XLM/USDC
      destination: kp.publicKey(),
      destAsset: USDC,
      destAmount: toDecimal(amount),
    }),
  );
  const tx = builder.setTimeout(60).build();
  tx.sign(kp);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

export function toDecimal(units: bigint, decimals = 7): string {
  const s = units.toString().padStart(decimals + 1, "0");
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

export function loadDeployment(): CtDeployment {
  if (!existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`no deployment at ${DEPLOYMENT_FILE}; run \`npm run ct:deploy\` first`);
  }
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8")) as CtDeployment;
}

export function saveDeployment(d: CtDeployment): void {
  mkdirSync(dirname(DEPLOYMENT_FILE), { recursive: true });
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(d, null, 2) + "\n");
}

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
