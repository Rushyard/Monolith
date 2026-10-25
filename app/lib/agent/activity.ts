// Journal d'activité (server-only), reconstruit depuis la blockchain à chaque lecture (Vercel n'a
// pas de stockage persistant). Trois sources :
//   - public  : txs Horizon des comptes agent et owner, décodées (USDC SAC `transfer` depuis le
//               smart account). Agent + FAILED = refus du réseau (code lu via getTransaction).
//   - private : événements `transfer` du contrat confidentiel dont l'émetteur est l'owner
//               (getEvents, ~7 jours de rétention sur le RPC testnet). Adresses et hash seulement :
//               le montant est chiffré on-chain et n'est JAMAIS mis dans l'activité.
//   - mémoire : reçus de coffre (POST /api/agent/vault-receipt) et verdicts récents (blocked,
//               waiting) de /api/intent. Best effort : perdu quand l'instance serverless redémarre.
import "server-only";
import { ChainClient, fetchEvents } from "stellar-confidential-token-sdk";
import type { ActivityItem } from "../../components/agent/types";
import { CT } from "../ct/deployment";
import { AGENT_CONFIG } from "./config";
import { BOOK } from "./contacts";
import { Address, NETWORK_PASSPHRASE, TransactionBuilder, contractErrorCodes, fromUsdc, rpc, scValToNative, server } from "./core";

const C = AGENT_CONFIG;
const HORIZON = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
const CACHE_MS = 30_000;
const MEMORY_MAX = 50;

export const ctClient = () =>
  new ChainClient({
    rpcUrl: CT.rpcUrl,
    networkPassphrase: CT.networkPassphrase,
    contracts: { token: CT.token, verifier: CT.verifier, auditor: CT.auditor },
  });

export function labelFor(address: string): string {
  return BOOK.find((c) => c.address === address)?.name ?? `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// ---------- mémoire (best effort) ----------

const memory: ActivityItem[] = [];

/** Ajoute un élément en mémoire. Un élément privé ne garde jamais de montant. */
export function recordActivity(item: ActivityItem) {
  const clean = item.channel === "private" ? { ...item, amountUsdc: undefined } : item;
  if (clean.hash && memory.some((m) => m.hash === clean.hash)) return;
  memory.unshift(clean);
  memory.length = Math.min(memory.length, MEMORY_MAX);
  cache = null;
}

// ---------- décodage ----------

export type DecodedInvoke = { contract: string; fn: string; args: unknown[] };

/** Premier appel de contrat d'une enveloppe (base64), ou null si ce n'est pas un invokeContract. */
export function decodeInvoke(envelopeXdr: string): DecodedInvoke | null {
  const tx = TransactionBuilder.fromXDR(envelopeXdr, NETWORK_PASSPHRASE);
  const op = ("operations" in tx ? tx.operations[0] : undefined) as
    | { type: string; func?: { type: string; invokeContract?: { contractAddress: never; functionName: unknown; args: never[] } } }
    | undefined;
  const ic = op?.type === "invokeHostFunction" && op.func?.type === "hostFunctionTypeInvokeContract" ? op.func.invokeContract : undefined;
  if (!ic) return null;
  return { contract: Address.fromScAddress(ic.contractAddress).toString(), fn: String(ic.functionName), args: ic.args.map((a) => scValToNative(a)) };
}

type HorizonTx = { hash: string; created_at: string; successful: boolean; source_account: string; envelope_xdr: string };

async function horizonTxs(account: string, limit = 50): Promise<HorizonTx[]> {
  const res = await fetch(`${HORIZON}/accounts/${account}/transactions?order=desc&limit=${limit}&include_failed=true`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Horizon HTTP ${res.status}`);
  return ((await res.json()) as { _embedded: { records: HorizonTx[] } })._embedded.records;
}

const refusalCodes = new Map<string, number[]>();

async function refusalCode(hash: string): Promise<number[]> {
  if (refusalCodes.has(hash)) return refusalCodes.get(hash)!;
  const r = await server.getTransaction(hash);
  const diag = "diagnosticEventsXdr" in r && r.diagnosticEventsXdr ? r.diagnosticEventsXdr : [];
  const codes = r.status === rpc.Api.GetTransactionStatus.FAILED ? contractErrorCodes(diag) : [];
  refusalCodes.set(hash, codes);
  return codes;
}

function refusalReason(codes: number[]): string {
  if (codes.includes(3221)) return "Refusé par le réseau : plafond de l'agent dépassé (#3221).";
  if (codes.length) return `Refusé par le réseau (#${codes[0]}).`;
  return "Refusé par le réseau.";
}

// ---------- reconstruction ----------

async function publicItems(owner: HorizonTx[]): Promise<ActivityItem[]> {
  const agent = await horizonTxs(C.agentAddress);
  const out: ActivityItem[] = [];
  for (const t of [...agent, ...owner]) {
    const call = decodeInvoke(t.envelope_xdr);
    if (!call || call.contract !== C.usdcSac || call.fn !== "transfer" || call.args[0] !== C.smartAccount) continue;
    const fromAgent = t.source_account === C.agentAddress;
    if (!t.successful && !fromAgent) continue; // échec côté owner : pas un refus de la policy
    const to = String(call.args[1]);
    out.push({
      at: t.created_at,
      kind: t.successful ? "paid" : "refused",
      channel: "public",
      to,
      label: labelFor(to),
      amountUsdc: String(fromUsdc(BigInt(call.args[2] as bigint))),
      hash: t.hash,
      reason: t.successful ? (fromAgent ? "Payé par l'agent, sous son plafond." : "Approuvé par l'owner (Freighter).") : refusalReason(await refusalCode(t.hash)),
    });
  }
  return out;
}

async function privateItems(owner: HorizonTx[]): Promise<ActivityItem[]> {
  const health = await server.getHealth();
  const startLedger = Math.max(CT.deployedAtLedger, health.oldestLedger);
  const { events } = await fetchEvents(ctClient(), { startLedger });
  const times = new Map(owner.map((t) => [t.hash, t.created_at]));
  const out: ActivityItem[] = [];
  for (const ev of events) {
    if (ev.type !== "transfer" || ev.from !== C.ownerAddress) continue;
    let at = times.get(ev.txHash);
    if (!at) {
      const r = await fetch(`${HORIZON}/transactions/${ev.txHash}`, { signal: AbortSignal.timeout(10_000) });
      at = r.ok ? ((await r.json()) as HorizonTx).created_at : new Date().toISOString();
    }
    out.push({ at, kind: "paid", channel: "private", to: ev.to, label: labelFor(ev.to), hash: ev.txHash, reason: "Signé par l'owner dans le coffre : montant caché." });
  }
  return out;
}

let cache: { at: number; items: ActivityItem[] } | null = null;

export async function readActivity(): Promise<ActivityItem[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const owner = await horizonTxs(C.ownerAddress);
  const [pub, priv] = await Promise.all([publicItems(owner), privateItems(owner)]);
  const byHash = new Map<string, ActivityItem>();
  for (const it of [...pub, ...priv]) byHash.set(it.hash!, it);
  const items = [...byHash.values(), ...memory.filter((m) => !m.hash || !byHash.has(m.hash))].sort((a, b) => b.at.localeCompare(a.at));
  cache = { at: Date.now(), items };
  return items;
}

// ---------- reçu de coffre ----------

export type ReceiptCheck = { ok: true; item: ActivityItem } | { ok: false; status: number; error: string };

/**
 * Vérifie qu'un hash est une tx réussie `confidential_transfer` du contrat confidentiel, envoyée
 * par l'owner vers `to`, puis l'ajoute en mémoire. Attend jusqu'à ~10 s que le RPC la voie.
 */
export async function verifyVaultReceipt(to: string, hash: string): Promise<ReceiptCheck> {
  let r = await server.getTransaction(hash);
  for (let i = 0; i < 5 && r.status === rpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((s) => setTimeout(s, 2000));
    r = await server.getTransaction(hash);
  }
  if (r.status === rpc.Api.GetTransactionStatus.NOT_FOUND) return { ok: false, status: 404, error: "tx introuvable on-chain (encore en attente ?)" };
  if (r.status !== rpc.Api.GetTransactionStatus.SUCCESS) return { ok: false, status: 422, error: "tx échouée on-chain" };
  const call = decodeInvoke(r.envelopeXdr.toXDR("base64"));
  if (!call || call.contract !== CT.token || call.fn !== "confidential_transfer") {
    return { ok: false, status: 422, error: "cette tx n'est pas un transfert du contrat confidentiel" };
  }
  if (call.args[0] !== C.ownerAddress || call.args[1] !== to) {
    return { ok: false, status: 422, error: "émetteur ou destinataire différent de ce reçu" };
  }
  const item: ActivityItem = {
    at: new Date((r.createdAt ?? Date.now() / 1000) * 1000).toISOString(),
    kind: "paid",
    channel: "private",
    to,
    label: labelFor(to),
    hash,
    reason: "Signé par l'owner dans le coffre : montant caché.",
  };
  recordActivity(item);
  return { ok: true, item };
}
