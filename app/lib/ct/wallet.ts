/**
 * ConfidentialVault — the browser-side orchestration of the confidential USDC
 * token: Freighter signer, confidential keys, local state engine, provers.
 * All proving happens in the browser; `sk` never leaves the device (it is
 * derived from a Freighter signature and cached in localStorage).
 *
 * Adapted (trimmed, USDC-denominated) from brozorec/stellar-confidential-token-demo
 * packages/app/lib/wallet.ts (MIT).
 */
import {
  ChainClient,
  LocalStorageStore,
  StateDivergedError,
  StateEngine,
  StateUnverifiedError,
  addressToField,
  buildRegisterWitness,
  buildTransferWitness,
  buildWithdrawWitness,
  decryptWithDomain,
  deriveKeys,
  DOMAIN,
  disclosureNonce,
  disclosureOriginator,
  ecdh,
  fetchEvents,
  fromHex,
  proverFromArtifact,
  senderEphemeralScalar,
  submitDeposit,
  submitMerge,
  submitRegister,
  submitTransfer,
  submitWithdraw,
  toHex32,
  type AccountState,
  type CircuitProver,
  type ConfidentialEvent,
  type DisclosableEvent,
  type KeyPair,
  type Opening,
} from "stellar-confidential-token-sdk";
import registerCircuit from "stellar-confidential-token-sdk/circuits/register.json";
import transferCircuit from "stellar-confidential-token-sdk/circuits/transfer.json";
import withdrawCircuit from "stellar-confidential-token-sdk/circuits/withdraw.json";

import { ensureBrowserBackend } from "./bb-loader";
import { CT } from "./deployment";
import { deriveSignerRootSk } from "./derive-key";
import { connectFreighter, type MessageSigner } from "./freighter";
import { formatUsdc, short } from "./format";
import { tr } from "../i18n";

type Log = (m: string) => void;
type CircuitName = "register" | "transfer" | "withdraw";
export type TxPhase = "proving" | "submitting";

const CIRCUITS: Record<CircuitName, { bytecode: string }> = {
  register: registerCircuit as never,
  transfer: transferCircuit as never,
  withdraw: withdrawCircuit as never,
};

export type StateHealth = "ok" | "diverged" | "unverified";

export interface VaultView {
  address: string;
  registered: boolean;
  spendable: bigint;
  receiving: bigint;
  syncedLedger: number;
  health: StateHealth;
}

export interface TxResult {
  hash: string;
  proofMs?: number;
}

export function makeClient(): ChainClient {
  return new ChainClient({
    rpcUrl: CT.rpcUrl,
    networkPassphrase: CT.networkPassphrase,
    contracts: { token: CT.token, verifier: CT.verifier, auditor: CT.auditor },
  });
}

export class ConfidentialVault {
  private provers = new Map<CircuitName, CircuitProver>();

  private constructor(
    readonly address: string,
    readonly signer: MessageSigner,
    private keys: KeyPair,
    private client: ChainClient,
    private engine: StateEngine,
    private log: Log,
  ) {}

  static async connect(log: Log): Promise<ConfidentialVault> {
    ensureBrowserBackend();
    const signer = await connectFreighter();
    log(tr("lib.connected", { who: signer.publicKey }));

    const client = makeClient();
    const addrF = addressToField(CT.token);
    const skKey = `monolith:sk:${CT.token}:${signer.publicKey}`;
    const onchain = await client.confidentialBalance(signer.publicKey);
    const matches = (k: KeyPair) => !onchain || onchain.spendingKey.equals(k.Y);

    const cached = localStorage.getItem(skKey);
    let keys = cached ? deriveKeys(fromHex(cached), addrF) : null;
    if (keys && !matches(keys)) {
      localStorage.removeItem(skKey);
      keys = null;
    }
    if (!keys) {
      keys = deriveKeys(await deriveSignerRootSk(signer, CT.token, log), addrF);
      if (!matches(keys)) {
        throw new Error(tr("lib.keyMismatch"));
      }
      localStorage.setItem(skKey, toHex32(keys.sk));
      log(tr("lib.keyDerived"));
    }

    const engine = new StateEngine({
      client,
      store: new LocalStorageStore(`monolith:state:${CT.token}:`),
      keys,
      address: signer.publicKey,
      fromLedger: CT.deployedAtLedger,
    });
    return new ConfidentialVault(signer.publicKey, signer, keys, client, engine, log);
  }

  private prover(name: CircuitName): CircuitProver {
    let p = this.provers.get(name);
    if (!p) {
      p = proverFromArtifact(CIRCUITS[name]);
      this.provers.set(name, p);
    }
    return p;
  }

  private async prove(name: CircuitName, inputs: Parameters<CircuitProver["prove"]>[0]) {
    this.log(tr("lib.proving", { name }));
    const t0 = performance.now();
    const { proof } = await this.prover(name).prove(inputs);
    const proofMs = Math.round(performance.now() - t0);
    this.log(tr("lib.proofReady", { name, s: (proofMs / 1000).toFixed(1) }));
    return { proof, proofMs };
  }

  async register(onPhase?: (p: TxPhase) => void): Promise<TxResult> {
    const w = buildRegisterWitness(this.keys, this.address);
    onPhase?.("proving");
    const { proof, proofMs } = await this.prove("register", w.inputs);
    onPhase?.("submitting");
    const r = await submitRegister(this.client, this.signer, this.address, CT.auditorId, w, proof);
    this.log(tr("lib.opened", { tx: short(r.hash, 6) }));
    return { hash: r.hash, proofMs };
  }

  /** Public USDC → receiving balance. The amount is visible on-chain. */
  async deposit(amount: bigint): Promise<TxResult> {
    this.log(tr("lib.depositing", { amt: formatUsdc(amount) }));
    const r = await submitDeposit(this.client, this.signer, this.address, this.address, amount);
    this.log(tr("lib.deposited", { tx: short(r.hash, 6) }));
    return { hash: r.hash };
  }

  /** receiving → spendable. */
  async merge(): Promise<TxResult> {
    const r = await submitMerge(this.client, this.signer, this.address);
    this.log(tr("lib.merged", { tx: short(r.hash, 6) }));
    return { hash: r.hash };
  }

  /** Confidential transfer: the amount is hidden on-chain. */
  async transfer(to: string, amount: bigint, onPhase?: (p: TxPhase) => void): Promise<TxResult> {
    const recipient = await this.client.confidentialBalance(to);
    if (!recipient) throw new Error(tr("lib.noRecipient"));
    const kAudR = await this.client.auditorKey(recipient.auditorId);
    const kAudS = await this.client.auditorKey(CT.auditorId);
    const { v, r: blinding } = await this.spendableForProof();
    if (v < amount) throw new Error(tr("lib.insufficient", { amt: formatUsdc(v) }));

    const w = buildTransferWitness({
      keys: this.keys, v, r: blinding, amount, pvkB: recipient.viewingPublicKey, kAudR, kAudS,
    });
    onPhase?.("proving");
    const { proof, proofMs } = await this.prove("transfer", w.inputs);
    onPhase?.("submitting");
    const r = await submitTransfer(this.client, this.signer, this.address, to, w, proof);
    await this.engine.setSpendable(w.next);
    this.log(tr("lib.sent", { to: short(to), tx: short(r.hash, 6) }));
    return { hash: r.hash, proofMs };
  }

  /**
   * spendable → public USDC. The amount is visible on-chain.
   * `to` defaults to the owner's own account; it can be a contract (C…), e.g. the agent's
   * smart account (withdraw proofs don't bind the destination; see scripts/withdraw-to-contract.ts).
   */
  async withdraw(amount: bigint, onPhase?: (p: TxPhase) => void, to: string = this.address): Promise<TxResult> {
    const kAudS = await this.client.auditorKey(CT.auditorId);
    const { v, r: blinding } = await this.spendableForProof();
    if (v < amount) throw new Error(tr("lib.insufficient", { amt: formatUsdc(v) }));
    const w = buildWithdrawWitness({ keys: this.keys, v, r: blinding, amount, kAudS });
    onPhase?.("proving");
    const { proof, proofMs } = await this.prove("withdraw", w.inputs);
    onPhase?.("submitting");
    const r = await submitWithdraw(this.client, this.signer, this.address, to, amount, w, proof);
    await this.engine.setSpendable(w.next);
    this.log(tr("lib.withdrawn", { amt: formatUsdc(amount), to: to === this.address ? tr("lib.publicAccount") : short(to), tx: short(r.hash, 6) }));
    return { hash: r.hash, proofMs };
  }

  private async spendableForProof(): Promise<Opening> {
    try {
      await this.engine.sync();
    } catch (e) {
      if (!(e instanceof StateDivergedError && e.report.spendableOk)) throw e;
    }
    return this.engine.spendableForProof();
  }

  async refresh(): Promise<VaultView> {
    let state: AccountState;
    let health: StateHealth = "ok";
    try {
      state = await this.engine.sync();
    } catch (e) {
      if (e instanceof StateDivergedError) health = "diverged";
      else if (e instanceof StateUnverifiedError) health = "unverified";
      else throw e;
      state = await this.engine.current();
    }
    const onchain = await this.client.confidentialBalance(this.address);
    return {
      address: this.address,
      registered: onchain !== null,
      spendable: state.spendable.v,
      receiving: state.receiving.v,
      syncedLedger: state.syncedLedger,
      health,
    };
  }

  /** All token events (RPC window, ~7 days). */
  async events(): Promise<ConfidentialEvent[]> {
    return (await fetchEvents(this.client, { startLedger: CT.deployedAtLedger })).events;
  }

  /** Other registered accounts: possible transfer recipients. */
  async recipients(): Promise<string[]> {
    const seen = new Set<string>();
    for (const ev of await this.events()) {
      if (ev.type === "register" && ev.account !== this.address) seen.add(ev.account);
    }
    return [...seen];
  }

  /**
   * Decrypt a transfer amount for local display, from whichever side this
   * wallet is on (inbound: viewing key; outbound: re-derived ephemeral). null
   * if this wallet can't see it. Stays hidden on-chain regardless.
   */
  async transferAmount(event: DisclosableEvent): Promise<bigint | null> {
    const sigma = disclosureNonce(event);
    if (event.to === this.address) {
      return this.engine.decryptIncoming(event.rE, event.vTilde, sigma).vTransfer;
    }
    if (disclosureOriginator(event).account !== this.address) return null;
    const rE = senderEphemeralScalar(this.keys, { rE: event.rE, sigma });
    if (rE === null) return null;
    const recipient = await this.client.confidentialBalance(event.to);
    if (!recipient) return null;
    const v = decryptWithDomain(event.vTilde, DOMAIN.TRANSFER_AMOUNT, ecdh(rE, recipient.viewingPublicKey), sigma);
    return v >= 1n << 127n ? null : v;
  }

  async destroy(): Promise<void> {
    await Promise.all([...this.provers.values()].map((p) => p.destroy()));
    this.provers.clear();
  }
}
