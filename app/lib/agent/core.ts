// Cœur Stellar partagé entre l'API Next.js (server-only) et les scripts contracts/ (Node).
// Aucune dépendance Next ni Node-only ici : pas de "server-only", pas de fs / child_process.
//
// Pilote le smart account OpenZeppelin (stellar-accounts v0.8.0, commit ddc327eb).
// Formats vérifiés dans packages/accounts/src/smart_account/storage.rs :
//   AuthPayload        { signers: Map<Signer, Bytes>, context_rule_ids: Vec<u32> }
//   AuthDigestPreimage { account: Address, signature_payload: BytesN<32>, context_rule_ids: Vec<u32> }
//   External signer  → signe sha256(XDR(AuthDigestPreimage))
//   Delegated signer → auth entry supplémentaire : __check_auth(preimage) sur le smart account
import {
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  authorizeEntry,
  hash,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// Les scripts contracts/ importent le SDK via ce module : une seule copie de @stellar/stellar-sdk.
export { Address, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr };

export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const RPC_URL = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const server = new rpc.Server(RPC_URL);

export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_DECIMALS = 7;

/** Codes d'erreur OZ v0.8.0 (packages/accounts/src/policies/spending_limit.rs). */
export const SPENDING_LIMIT_EXCEEDED = 3221;
export const SPENDING_LIMIT_NOT_ALLOWED = 3223;

export const usdc = (n: number | string) => BigInt(Math.round(Number(n) * 10 ** USDC_DECIMALS));
export const fromUsdc = (v: bigint) => Number(v) / 10 ** USDC_DECIMALS;
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
  /** Clé Ed25519 externe vérifiée par le vérificateur OZ (l'agent). */
  | { kind: "external"; verifier: string; keypair: Keypair }
  /** Compte G délégué qui signe son auth entry imbriquée (scripts, clé owner disponible). */
  | { kind: "delegated"; keypair: Keypair }
  /**
   * Compte G délégué qui est aussi la source de la tx : son entry imbriquée utilise des
   * credentials « source account », couverts par la signature de l'enveloppe (Freighter
   * n'a qu'à signer la transaction).
   */
  | { kind: "delegated-source"; address: string };

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
  const delegatedAddress =
    signer.kind === "delegated" ? signer.keypair.publicKey() : signer.kind === "delegated-source" ? signer.address : null;

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
        signerVal = delegatedSigner(delegatedAddress!);
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
  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(smartAccount).toScAddress(),
        functionName: "__check_auth",
        args: [preimage!],
      }),
    ),
    subInvocations: [],
  });

  if (signer.kind === "delegated-source") {
    return [signed, new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation })];
  }

  const nested = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(signer.keypair.publicKey()).toScAddress(),
        nonce: randomNonce(),
        signatureExpirationLedger: validUntilLedger,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation,
  });
  return [signed, await authorizeEntry(nested, signer.keypair, validUntilLedger, NETWORK_PASSPHRASE)];
}

function randomNonce(): bigint {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  b[0] &= 0x7f; // i64 positif
  return BigInt("0x" + Buffer.from(b).toString("hex"));
}

// ---------- construction / envoi ----------

export type InvokeResult =
  | { ok: true; hash: string; returnValue?: xdr.ScVal }
  | { ok: false; stage: "simulation" | "onchain"; error: string; hash?: string; codes?: number[] };

export type SmartAccountCall = {
  contract: string;
  fn: string;
  args: xdr.ScVal[];
  smartAccount: string;
  ruleId: number;
  signer: SmartAccountSigner;
  /** Compte G source de la tx (paie les frais). */
  source: string;
  /** Force le nonce de l'auth entry du smart account (sert à reproduire un footprint identique). */
  forceNonce?: bigint;
  /** Durée de validité de l'auth et de la tx (ledgers / secondes). */
  validForLedgers?: number;
  timeoutSeconds?: number;
};

async function buildTx(source: string, op: xdr.Operation, timeoutSeconds = 120) {
  const account = await server.getAccount(source);
  return new TransactionBuilder(account, { fee: "1000000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(timeoutSeconds)
    .build();
}

/** Simule (mode recording), signe les auth entries du smart account, re-simule (mode enforcing). */
export async function prepareSmartAccountCall(call: SmartAccountCall) {
  const op = Operation.invokeContractFunction({ contract: call.contract, function: call.fn, args: call.args });
  const sim = await server.simulateTransaction(await buildTx(call.source, op));
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation (recording) : ${sim.error}`);

  const latest = (await server.getLatestLedger()).sequence;
  const validUntil = latest + (call.validForLedgers ?? 100);
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
  const tx = await buildTx(call.source, signedOp, call.timeoutSeconds);
  const enforced = await server.simulateTransaction(tx);
  return { tx, enforced, nonce };
}

/** Lecture seule : simule un appel et renvoie la valeur de retour. */
export async function readContract(source: string, contract: string, fn: string, args: xdr.ScVal[]) {
  const sim = await server.simulateTransaction(
    await buildTx(source, Operation.invokeContractFunction({ contract, function: fn, args })),
  );
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${fn} : ${sim.error}`);
  return sim.result?.retval;
}

type BuiltTx = ReturnType<TransactionBuilder["build"]>;

/** Envoie une tx déjà signée (ou la signe avec `signer`) et attend son résultat. */
export async function sendAndWait(tx: BuiltTx, signer?: Keypair): Promise<InvokeResult> {
  if (signer) tx.sign(signer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    // ex. txTooLate (XDR expiré), txBadSeq (le compte source a envoyé une autre tx entre-temps)
    return { ok: false, stage: "onchain", hash: sent.hash, error: sent.errorResult?.result.type ?? "send error" };
  }
  const res = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { ok: true, hash: sent.hash, returnValue: res.returnValue };
  }
  const diag = "diagnosticEventsXdr" in res && res.diagnosticEventsXdr ? res.diagnosticEventsXdr : [];
  const codes = contractErrorCodes(diag);
  return { ok: false, stage: "onchain", hash: sent.hash, codes, error: `${res.status}${codes.length ? ` Error(Contract, #${codes[0]})` : ""}` };
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

/** Code d'erreur contrat cité dans un message d'erreur de simulation (« Error(Contract, #3221) »). */
export function simulationErrorCode(error: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(error);
  return m ? Number(m[1]) : null;
}

/** Appel complet : prépare, et si la simulation enforcing passe, signe l'enveloppe avec `sourceKp` et envoie. */
export async function invokeAsSmartAccount(call: SmartAccountCall, sourceKp: Keypair): Promise<InvokeResult> {
  const { tx, enforced } = await prepareSmartAccountCall(call);
  if (rpc.Api.isSimulationError(enforced)) {
    const code = simulationErrorCode(enforced.error);
    return { ok: false, stage: "simulation", error: enforced.error, codes: code ? [code] : [] };
  }
  return sendAndWait(rpc.assembleTransaction(tx, enforced).build(), sourceKp);
}

export type UnsignedResult =
  | { ok: true; unsignedXdr: string; validUntilLedger: number }
  | { ok: false; error: string; codes: number[] };

/**
 * Prépare un appel du smart account dont seule l'enveloppe reste à signer (signer
 * « delegated-source » : l'owner est la source de la tx). L'XDR est assemblé (footprint,
 * ressources, frais) et valable `validForLedgers` ledgers / `timeoutSeconds` secondes.
 */
export async function invokeAsSmartAccountUnsigned(call: SmartAccountCall): Promise<UnsignedResult> {
  const validForLedgers = call.validForLedgers ?? 720; // ~1 h pour laisser l'owner approuver
  const { tx, enforced } = await prepareSmartAccountCall({ ...call, validForLedgers, timeoutSeconds: call.timeoutSeconds ?? 3600 });
  if (rpc.Api.isSimulationError(enforced)) {
    const code = simulationErrorCode(enforced.error);
    return { ok: false, error: enforced.error, codes: code ? [code] : [] };
  }
  const latest = (await server.getLatestLedger()).sequence;
  return { ok: true, unsignedXdr: rpc.assembleTransaction(tx, enforced).build().toXDR(), validUntilLedger: latest + validForLedgers };
}

/**
 * Soumet quand même un appel dont la simulation échoue, pour obtenir un rejet *on-chain*
 * (tx incluse dans un ledger, statut FAILED, lien explorer). Une simulation qui échoue ne
 * fournit pas de footprint : on le prend d'une simulation identique avec le même nonce et
 * un montant minimal (`probeArgs`), seul le montant signé diffère.
 */
export async function submitForOnchainRejection(
  call: SmartAccountCall,
  probeArgs: xdr.ScVal[],
  sourceKp: Keypair,
): Promise<InvokeResult & { simulationCode: number | null }> {
  const real = await prepareSmartAccountCall(call);
  const simulationCode = rpc.Api.isSimulationError(real.enforced) ? simulationErrorCode(real.enforced.error) : null;
  if (!rpc.Api.isSimulationError(real.enforced)) {
    return { ok: false, stage: "simulation", error: "la simulation a réussi : rien à prouver", simulationCode };
  }
  const probe = await prepareSmartAccountCall({ ...call, args: probeArgs, forceNonce: real.nonce });
  if (rpc.Api.isSimulationError(probe.enforced)) {
    return { ok: false, stage: "simulation", error: `probe : ${probe.enforced.error}`, simulationCode };
  }
  probe.enforced.minResourceFee = (BigInt(probe.enforced.minResourceFee) * 2n).toString();
  return { ...(await sendAndWait(rpc.assembleTransaction(real.tx, probe.enforced).build(), sourceKp)), simulationCode };
}

/** Appel signé par un compte classique (auth « source account », pas de smart account). */
export async function invokeAsClassic(kp: Keypair, contract: string, fn: string, args: xdr.ScVal[]): Promise<InvokeResult> {
  const tx = await buildTx(kp.publicKey(), Operation.invokeContractFunction({ contract, function: fn, args }));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, stage: "simulation", error: sim.error };
  return sendAndWait(rpc.assembleTransaction(tx, sim).build(), kp);
}

// ---------- lectures métier ----------

export type SpendingState = {
  limit: bigint;
  spent: bigint;
  remaining: bigint;
  periodLedgers: number;
  ledger: number;
  entries: { amount: bigint; ledger: number; freedAtLedger: number }[];
};

/**
 * État de la spending-limit pour (smart account, règle). `cached_total_spent` n'est nettoyé
 * qu'au prochain transfert : on recalcule la fenêtre comme la policy (spending_limit.rs,
 * cleanup_old_entries : une entrée sort quand ledger_sequence <= ledger - period_ledgers).
 */
export async function readSpendingState(source: string, policy: string, smartAccount: string, ruleId: number): Promise<SpendingState> {
  const data = scValToNative(
    (await readContract(source, policy, "get_spending_limit_data", [
      nativeToScVal(ruleId, { type: "u32" }),
      new Address(smartAccount).toScVal(),
    ]))!,
  ) as { spending_limit: bigint; period_ledgers: number; spending_history: { amount: bigint; ledger_sequence: number }[] };
  const ledger = (await server.getLatestLedger()).sequence;
  const cutoff = ledger - data.period_ledgers;
  const entries = data.spending_history
    .filter((e) => e.ledger_sequence > cutoff)
    .map((e) => ({ amount: BigInt(e.amount), ledger: e.ledger_sequence, freedAtLedger: e.ledger_sequence + data.period_ledgers }));
  const spent = entries.reduce((s, e) => s + e.amount, 0n);
  const limit = BigInt(data.spending_limit);
  return { limit, spent, remaining: limit > spent ? limit - spent : 0n, periodLedgers: data.period_ledgers, ledger, entries };
}

export async function readTokenBalance(source: string, token: string, holder: string): Promise<bigint> {
  return BigInt(scValToNative((await readContract(source, token, "balance", [new Address(holder).toScVal()]))!));
}

/**
 * Retrouve on-chain la règle de l'agent : signer External(verifier, clé agent) + la spending-limit
 * policy. Les ids ne sont jamais réutilisés (une règle supprimée → ContextRuleNotFound #3000), donc
 * on parcourt les ids jusqu'à avoir vu get_context_rules_count() règles. Si plusieurs règles
 * correspondent, la plus récente (id le plus haut) gagne. null si aucune.
 */
export async function findAgentRule(
  source: string,
  smartAccount: string,
  verifier: string,
  agentRawPublicKey: Uint8Array,
  policy: string,
  maxScan = 64,
): Promise<number | null> {
  const count = Number(scValToNative((await readContract(source, smartAccount, "get_context_rules_count", []))!));
  const agentHex = Buffer.from(agentRawPublicKey).toString("hex");
  let seen = 0;
  let found: number | null = null;
  for (let next = 0; seen < count && next < count + maxScan; ) {
    // On lit d'un coup autant d'ids qu'il reste de règles à voir (cas courant : un seul aller-retour).
    const ids = Array.from({ length: Math.min(8, count - seen) }, (_, i) => next + i);
    next += ids.length;
    const rules = await Promise.all(
      ids.map((id) =>
        readContract(source, smartAccount, "get_context_rule", [nativeToScVal(id, { type: "u32" })])
          .then((v) => scValToNative(v!) as { id: number; signers: unknown[][]; policies: string[] })
          .catch(() => null), // #3000 : id supprimé ou pas encore attribué
      ),
    );
    for (const r of rules) {
      if (!r) continue;
      seen++;
      const hasAgent = r.signers.some(
        (s) => s[0] === "External" && s[1] === verifier && Buffer.from(s[2] as Uint8Array).toString("hex") === agentHex,
      );
      if (hasAgent && r.policies.includes(policy)) found = Math.max(found ?? -1, Number(r.id));
    }
  }
  return found;
}

/** Paramètres de la règle B (agent), partagés par reset-agent.ts et la réactivation après pause. */
export const AGENT_RULE = { name: "agent-usdc-10-24h", limit: usdc(10), periodLedgers: 17_280 } as const;

/** Arguments de add_context_rule pour la règle B : CallContract(USDC SAC), signer External(verifier, agent), spending_limit. */
export function addAgentRuleArgs(usdcSac: string, verifier: string, agentRawPublicKey: Uint8Array, policy: string): xdr.ScVal[] {
  return [
    callContractRule(usdcSac),
    nativeToScVal(AGENT_RULE.name, { type: "string" }),
    xdr.ScVal.scvVoid(),
    xdr.ScVal.scvVec([externalSigner(verifier, agentRawPublicKey)]),
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: new Address(policy).toScVal(), val: spendingLimitParams(AGENT_RULE.limit, AGENT_RULE.periodLedgers) }),
    ]),
  ];
}
