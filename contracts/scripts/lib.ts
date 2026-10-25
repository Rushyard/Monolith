// Helpers partagés pour piloter le smart account OpenZeppelin (stellar-accounts v0.8.0).
// Formats vérifiés dans packages/accounts/src/smart_account/storage.rs @ ddc327eb :
//   AuthPayload        { signers: Map<Signer, Bytes>, context_rule_ids: Vec<u32> }
//   AuthDigestPreimage { account: Address, signature_payload: BytesN<32>, context_rule_ids: Vec<u32> }
//   External signer  → signe sha256(XDR(AuthDigestPreimage))
//   Delegated signer → auth entry supplémentaire : __check_auth(preimage) sur le smart account
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  xdr,
  authorizeEntry,
} from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
export const server = new rpc.Server(RPC_URL);

export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_DECIMALS = 7;

const here = dirname(fileURLToPath(import.meta.url));
export const DEPLOYMENTS_FILE = join(here, "..", "deployments.testnet.json");

export type Deployments = {
  ozCommit: string;
  usdcSac: string;
  ed25519Verifier?: string;
  spendingLimitPolicy?: string;
  smartAccount?: string;
  ruleOwner?: number;
  ruleAgent?: number;
  [k: string]: unknown;
};

export function loadDeployments(): Deployments {
  if (!existsSync(DEPLOYMENTS_FILE)) throw new Error(`${DEPLOYMENTS_FILE} introuvable : lancer npm run deploy`);
  return JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf8"));
}

export function saveDeployments(d: Deployments) {
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(d, null, 2) + "\n");
}

/** Lance le Stellar CLI (doit être dans le PATH). */
export function stellar(args: string[]): string {
  return execFileSync("stellar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Lit une clé depuis le keystore du Stellar CLI. Le secret reste en mémoire, jamais sur disque. */
export function keypairFromCli(alias: string): Keypair {
  const envKey = process.env[`${alias.toUpperCase()}_SECRET_KEY`];
  return Keypair.fromSecret(envKey ?? stellar(["keys", "show", alias]));
}

export const usdc = (n: number | string) => BigInt(Math.round(Number(n) * 10 ** USDC_DECIMALS));
export const txLink = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const contractLink = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`;

// ---------- encodage ScVal des types OZ ----------

const sym = (s: string) => xdr.ScVal.scvSymbol(s);

/** ScMap avec clés Symbol triées (exigé par l'host Soroban pour les #[contracttype] struct). */
export function structVal(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })),
  );
}

export const u32Vec = (ids: number[]) => xdr.ScVal.scvVec(ids.map((i) => xdr.ScVal.scvU32(i)));

/** Signer::Delegated(Address) */
export const delegatedSigner = (addr: string) =>
  xdr.ScVal.scvVec([sym("Delegated"), new Address(addr).toScVal()]);

/** Signer::External(verifier, key_data) */
export const externalSigner = (verifier: string, pubkey: Uint8Array) =>
  xdr.ScVal.scvVec([sym("External"), new Address(verifier).toScVal(), xdr.ScVal.scvBytes(pubkey)]);

/** ContextRuleType::CallContract(Address) */
export const callContractRule = (contract: string) =>
  xdr.ScVal.scvVec([sym("CallContract"), new Address(contract).toScVal()]);

/** SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 } */
export const spendingLimitParams = (limit: bigint, periodLedgers: number) =>
  structVal({
    period_ledgers: xdr.ScVal.scvU32(periodLedgers),
    spending_limit: nativeToScVal(limit, { type: "i128" }),
  });

export function authDigestPreimage(account: string, signaturePayload: Uint8Array, ruleIds: number[]) {
  return structVal({
    account: new Address(account).toScVal(),
    context_rule_ids: u32Vec(ruleIds),
    signature_payload: xdr.ScVal.scvBytes(signaturePayload),
  });
}

// ---------- signature des auth entries du smart account ----------

export type SmartAccountSigner =
  | { kind: "external"; verifier: string; keypair: Keypair }
  | { kind: "delegated"; keypair: Keypair };

/** Adresse portée par une auth entry à credentials d'adresse (sinon null). */
export function entryAddress(entry: xdr.SorobanAuthorizationEntry): string | null {
  const c = entry.credentials;
  if (c.type === "sorobanCredentialsAddress") return Address.fromScAddress(c.address.address).toString();
  if (c.type === "sorobanCredentialsAddressV2") return Address.fromScAddress(c.addressV2.address).toString();
  return null;
}

/** Copie de l'entry avec un autre nonce (les objets XDR v17 sont immuables). */
export function withNonce(entry: xdr.SorobanAuthorizationEntry, nonce: bigint): xdr.SorobanAuthorizationEntry {
  const c = entry.credentials;
  const base = c.type === "sorobanCredentialsAddress" ? c.address : c.type === "sorobanCredentialsAddressV2" ? c.addressV2 : null;
  if (!base) throw new Error("entry sans credentials d'adresse");
  const creds = new xdr.SorobanAddressCredentials({ ...base, nonce });
  return new xdr.SorobanAuthorizationEntry({
    credentials:
      c.type === "sorobanCredentialsAddress"
        ? xdr.SorobanCredentials.sorobanCredentialsAddress(creds)
        : xdr.SorobanCredentials.sorobanCredentialsAddressV2(creds),
    rootInvocation: entry.rootInvocation,
  });
}

export const entryNonce = (entry: xdr.SorobanAuthorizationEntry): bigint => {
  const c = entry.credentials;
  if (c.type === "sorobanCredentialsAddress") return c.address.nonce;
  if (c.type === "sorobanCredentialsAddressV2") return c.addressV2.nonce;
  throw new Error("entry sans credentials d'adresse");
};

/**
 * Signe l'auth entry du smart account pour la règle `ruleId`.
 * `authorizeEntry` fixe l'expiration et nous donne le `payload` (le hash que l'host
 * passera à __check_auth) ; on y écrit notre AuthPayload via `signatureScVal`.
 * Retourne les entries à mettre dans l'opération (2 pour un Delegated signer).
 */
export async function signSmartAccountEntry(
  entry: xdr.SorobanAuthorizationEntry,
  smartAccount: string,
  ruleId: number,
  signer: SmartAccountSigner,
  validUntilLedger: number,
): Promise<xdr.SorobanAuthorizationEntry[]> {
  let preimage: xdr.ScVal | undefined;

  const signed = await authorizeEntry(
    entry,
    async (_hostPreimage, payload) => {
      preimage = authDigestPreimage(smartAccount, payload, [ruleId]);
      let signerVal: xdr.ScVal;
      let sigBytes: Uint8Array;
      if (signer.kind === "external") {
        signerVal = externalSigner(signer.verifier, signer.keypair.rawPublicKey());
        sigBytes = signer.keypair.sign(Buffer.from(hash(Buffer.from(preimage.toXdr())))); // ed25519 brut sur le digest
      } else {
        signerVal = delegatedSigner(signer.keypair.publicKey());
        sigBytes = new Uint8Array(0);
      }
      return {
        signatureScVal: structVal({
          context_rule_ids: u32Vec([ruleId]),
          signers: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signerVal, val: xdr.ScVal.scvBytes(sigBytes) })]),
        }),
      };
    },
    validUntilLedger,
    NETWORK_PASSPHRASE,
  );

  if (signer.kind === "external") return [signed];

  // Delegated : entry supplémentaire où l'owner autorise __check_auth(preimage) sur le smart account.
  const nested = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(signer.keypair.publicKey()).toScAddress(),
        nonce: randomNonce(),
        signatureExpirationLedger: validUntilLedger,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(smartAccount).toScAddress(),
          functionName: "__check_auth",
          args: [preimage!],
        }),
      ),
      subInvocations: [],
    }),
  });
  return [signed, await authorizeEntry(nested, signer.keypair, validUntilLedger, NETWORK_PASSPHRASE)];
}

function randomNonce(): bigint {
  const b = randomBytes(8);
  b[0] &= 0x7f; // i64 positif
  return BigInt("0x" + b.toString("hex"));
}

// ---------- construction / envoi ----------

export type InvokeResult =
  | { ok: true; hash: string; returnValue?: xdr.ScVal }
  | { ok: false; stage: "simulation" | "onchain"; error: string; hash?: string };

export type SmartAccountCall = {
  contract: string;
  fn: string;
  args: xdr.ScVal[];
  smartAccount: string;
  ruleId: number;
  signer: SmartAccountSigner;
  feePayer: Keypair;
  /** Force le nonce de l'auth entry du smart account (sert à reproduire un footprint identique). */
  forceNonce?: bigint;
};

async function buildTx(feePayer: Keypair, op: xdr.Operation) {
  const account = await server.getAccount(feePayer.publicKey());
  return new TransactionBuilder(account, { fee: "1000000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();
}

/** Simule (mode recording), signe les auth entries du smart account, re-simule (mode enforcing). */
export async function prepareSmartAccountCall(call: SmartAccountCall) {
  const op = Operation.invokeContractFunction({ contract: call.contract, function: call.fn, args: call.args });
  const sim = await server.simulateTransaction(await buildTx(call.feePayer, op));
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation (recording) : ${sim.error}`);

  const latest = (await server.getLatestLedger()).sequence;
  const validUntil = latest + 100;
  const auth: xdr.SorobanAuthorizationEntry[] = [];
  let nonce: bigint | undefined;
  for (let entry of sim.result?.auth ?? []) {
    if (entryAddress(entry) === call.smartAccount) {
      if (call.forceNonce !== undefined) entry = withNonce(entry, call.forceNonce);
      nonce = entryNonce(entry);
      auth.push(...(await signSmartAccountEntry(entry, call.smartAccount, call.ruleId, call.signer, validUntil)));
    } else auth.push(entry);
  }

  const signedOp = Operation.invokeContractFunction({
    contract: call.contract,
    function: call.fn,
    args: call.args,
    auth,
  });
  const tx = await buildTx(call.feePayer, signedOp);
  const enforced = await server.simulateTransaction(tx);
  return { tx, enforced, nonce };
}

/** Lecture seule : simule un appel et renvoie la valeur de retour décodée. */
export async function readContract(feePayer: Keypair, contract: string, fn: string, args: xdr.ScVal[]) {
  const sim = await server.simulateTransaction(
    await buildTx(feePayer, Operation.invokeContractFunction({ contract, function: fn, args })),
  );
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn} : ${sim.error}`);
  return sim.result?.retval;
}

export async function sendAndWait(tx: ReturnType<typeof TransactionBuilder.prototype.build>, signer: Keypair): Promise<InvokeResult> {
  tx.sign(signer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    return { ok: false, stage: "onchain", hash: sent.hash, error: sent.errorResult?.toXdr("base64") ?? "send error" };
  }
  const res = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { ok: true, hash: sent.hash, returnValue: res.returnValue };
  }
  const diag = "diagnosticEventsXdr" in res && res.diagnosticEventsXdr ? res.diagnosticEventsXdr : [];
  const codes = contractErrorCodes(diag);
  return { ok: false, stage: "onchain", hash: sent.hash, error: `${res.status}${codes.length ? ` Error(Contract, #${codes[0]})` : ""}` };
}

/** Extrait les codes Error(Contract, #n) des événements de diagnostic. */
export function contractErrorCodes(events: xdr.DiagnosticEvent[]): number[] {
  const codes = new Set<number>();
  const visit = (v: xdr.ScVal) => {
    if (v.type === "scvError" && v.error.type === "sceContract") codes.add(v.error.contractCode);
    if (v.type === "scvVec") (v.vec ?? []).forEach(visit);
  };
  for (const ev of events) {
    const body = ev.event.body.v0;
    body.topics.forEach(visit);
    visit(body.data);
  }
  return [...codes];
}

/** Appel complet : prépare, et si la simulation enforcing passe, envoie. */
export async function invokeAsSmartAccount(call: SmartAccountCall): Promise<InvokeResult> {
  const { tx, enforced } = await prepareSmartAccountCall(call);
  if (rpc.Api.isSimulationError(enforced)) return { ok: false, stage: "simulation", error: enforced.error };
  return sendAndWait(rpc.assembleTransaction(tx, enforced).build(), call.feePayer);
}

/** Appel signé par un compte classique (auth « source account », pas de smart account). */
export async function invokeAsClassic(kp: Keypair, contract: string, fn: string, args: xdr.ScVal[]): Promise<InvokeResult> {
  const tx = await buildTx(kp, Operation.invokeContractFunction({ contract, function: fn, args }));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, stage: "simulation", error: sim.error };
  return sendAndWait(rpc.assembleTransaction(tx, sim).build(), kp);
}
