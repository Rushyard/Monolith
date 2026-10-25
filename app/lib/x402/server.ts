// Côté serveur de ressource x402 : config de la route premium /api/premium/market-data.
// Utilisé par app/app/api/premium/market-data/route.ts via withX402 (@x402/next).
// Aucune dépendance au SDK Stellar v17 : voir l'en-tête de ./config.ts.
import "server-only";
import { HTTPFacilitatorClient, x402ResourceServer, type FacilitatorClient, type RouteConfig } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import {
  MARKET_DATA_PATH,
  MARKET_DATA_PRICE_USDC,
  X402_FACILITATOR_URL,
  X402_NETWORK,
  X402_PAY_TO,
  X402_USDC_SAC,
  toAtomic,
} from "./config";

/** Serveur x402 : facilitator (par défaut https://x402.org/facilitator) + schéma exact Stellar. */
export function createResourceServer(facilitator: FacilitatorClient = new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL })) {
  return new x402ResourceServer(facilitator).register(X402_NETWORK, new ExactStellarScheme());
}

/**
 * 0,01 USDC sur stellar:testnet, payé au compte X402_PAY_TO. Le prix est donné en unités
 * atomiques du SAC USDC du projet (et non "$0.01") pour être sûr que l'asset demandé est
 * exactement celui que l'agent détient.
 */
export const marketDataRoute: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: X402_NETWORK,
    payTo: X402_PAY_TO,
    price: { amount: toAtomic(MARKET_DATA_PRICE_USDC).toString(), asset: X402_USDC_SAC },
    maxTimeoutSeconds: 120,
  },
  description: "Monolith — données de marché premium (démo testnet)",
  mimeType: "application/json",
  resource: MARKET_DATA_PATH,
};

/**
 * Contenu vendu derrière le paywall. Données de démonstration, marquées comme telles : on
 * ne présente pas de faux cours comme réels (règle d'or de MONOLITH.md).
 */
export function marketDataPayload(now = new Date()) {
  return {
    source: "demo",
    disclaimer: "Données fictives de démonstration (testnet), pas un cours réel.",
    generatedAt: now.toISOString(),
    pairs: [
      { pair: "XLM/USDC", price: 0.1234, change24hPct: 2.1, volume24hUsdc: 1_250_000 },
      { pair: "BTC/USDC", price: 67_850, change24hPct: -0.8, volume24hUsdc: 98_400_000 },
      { pair: "ETH/USDC", price: 3_420.5, change24hPct: 1.4, volume24hUsdc: 41_700_000 },
    ],
    pricePaidUsdc: MARKET_DATA_PRICE_USDC,
  };
}

export type MarketData = ReturnType<typeof marketDataPayload>;
