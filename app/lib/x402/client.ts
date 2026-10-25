// Côté client x402 : l'agent achète une ressource premium en payant depuis son compte G
// (pas depuis le smart account, cf. issue x402 #3764). Le SDK Stellar v16 de @x402/stellar
// reste derrière cette frontière : on ne lui passe que la clé secrète (string) et des URLs.
import "server-only";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client, type PaymentPolicy } from "@x402/fetch";
import type { SpendControls } from "@x402/core/client";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { X402_MAX_PRICE_USDC, X402_NETWORK, X402_USDC_SAC, toAtomic } from "./config";

/**
 * Politique de paiement de l'agent : il ne paie qu'en USDC (notre SAC), sur stellar:testnet,
 * schéma exact, et jamais plus que `maxUsdc` par requête. Un serveur qui demande plus, ou un
 * autre asset, n'est pas payé.
 */
export function agentPaymentPolicy(maxUsdc: string = X402_MAX_PRICE_USDC, asset: string = X402_USDC_SAC): PaymentPolicy {
  const cap = toAtomic(maxUsdc);
  return (_version, reqs) =>
    reqs.filter((r) => {
      if (r.scheme !== "exact" || r.network !== X402_NETWORK || r.asset !== asset) return false;
      try {
        return BigInt(r.amount) > 0n && BigInt(r.amount) <= cap;
      } catch {
        return false;
      }
    });
}

/**
 * Spend controls du SDK x402 (appliqués avant la politique) : notre SAC USDC est déclaré
 * explicitement avec un plafond atomique, sans dépendre de la table d'assets par défaut.
 */
export function agentSpendControls(maxUsdc: string = X402_MAX_PRICE_USDC, asset: string = X402_USDC_SAC): SpendControls {
  return { allowedAssets: [{ network: X402_NETWORK, asset, maxAmountPerPayment: toAtomic(maxUsdc).toString() }] };
}

/** Client x402 signé par la clé du compte G de l'agent (Ed25519, string `S…`). */
export function createAgentX402Client(agentSecret: string, opts: { rpcUrl?: string; maxUsdc?: string } = {}) {
  const signer = createEd25519Signer(agentSecret.trim(), X402_NETWORK);
  return {
    address: signer.address,
    client: new x402Client()
      .register(X402_NETWORK, new ExactStellarScheme(signer, opts.rpcUrl ? { url: opts.rpcUrl } : undefined))
      .setSpendControls(agentSpendControls(opts.maxUsdc))
      .registerPolicy(agentPaymentPolicy(opts.maxUsdc)),
  };
}

export type X402Purchase<T = unknown> =
  | {
      ok: true;
      data: T;
      /** Réponse de règlement du facilitator (header PAYMENT-RESPONSE), si présente. */
      settlement: { transaction: string; network: string; payer?: string; explorerUrl?: string } | null;
    }
  | { ok: false; httpStatus: number; error: string };

/**
 * GET payant : 1re requête → 402 + exigences de paiement ; @x402/fetch signe l'auth entry du
 * transfert USDC avec la clé de l'agent, rejoue la requête avec le header de paiement ; le
 * serveur fait vérifier et régler par le facilitator, qui soumet la tx (et paie les frais).
 */
export async function x402Get<T = unknown>(
  url: string,
  client: x402Client,
  fetchImpl: typeof fetch = fetch,
): Promise<X402Purchase<T>> {
  let res: Response;
  try {
    res = await wrapFetchWithPayment(fetchImpl, client)(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch (err) {
    // ex. aucune exigence acceptée par la politique, solde insuffisant à la simulation, RPC injoignable
    return { ok: false, httpStatus: 0, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, httpStatus: res.status, error: `HTTP ${res.status}${body && body !== "{}" ? ` : ${body.slice(0, 300)}` : ""}` };
  }
  const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  let settlement: Extract<X402Purchase, { ok: true }>["settlement"] = null;
  if (header) {
    try {
      const s = decodePaymentResponseHeader(header);
      settlement = {
        transaction: s.transaction,
        network: s.network,
        payer: s.payer,
        explorerUrl: s.transaction && s.network === X402_NETWORK ? `https://stellar.expert/explorer/testnet/tx/${s.transaction}` : undefined,
      };
    } catch {
      settlement = null;
    }
  }
  return { ok: true, data: (await res.json()) as T, settlement };
}
