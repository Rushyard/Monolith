// GET /api/premium/market-data : ressource premium protégée par x402 (@x402/next).
// Sans paiement → 402 + exigences (0,01 USDC, stellar:testnet, schéma exact). Avec un header
// de paiement valide → le facilitator vérifie, le handler répond, puis le facilitator règle
// (tx on-chain) et la réponse porte le header PAYMENT-RESPONSE (hash de la tx).
import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { createResourceServer, marketDataPayload, marketDataRoute } from "@/lib/x402/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(_req: NextRequest) {
  return NextResponse.json(marketDataPayload());
}

export const GET = withX402(handler, marketDataRoute, createResourceServer());
