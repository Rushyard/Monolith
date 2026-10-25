import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_CONFIG } from "@/lib/agent/config";
import { NETWORK_PASSPHRASE, TransactionBuilder, fromUsdc, readTokenBalance, sendAndWait, txLink } from "@/lib/agent/core";
import { readAgentSpending } from "@/lib/agent/executor";
import { readActivity, verifyVaultReceipt } from "@/lib/agent/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/balance · GET /api/agent/history · GET /api/agent/activity
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");
  if (route === "activity") {
    try {
      return NextResponse.json({ items: await readActivity() });
    } catch (err) {
      console.error("[activity]", err);
      return NextResponse.json({ error: "activité on-chain illisible" }, { status: 502 });
    }
  }
  if (route !== "balance" && route !== "history") return NextResponse.json({ error: "not found" }, { status: 404 });

  const spending = await readAgentSpending();
  if (!spending) return NextResponse.json({ error: "budget on-chain illisible" }, { status: 502 });

  if (route === "balance") {
    const balance = await readTokenBalance(AGENT_CONFIG.ownerAddress, AGENT_CONFIG.usdcSac, AGENT_CONFIG.smartAccount);
    return NextResponse.json({
      smartAccount: AGENT_CONFIG.smartAccount,
      smartAccountUsdc: fromUsdc(balance),
      budget: {
        limitUsdc: fromUsdc(spending.limit),
        spentUsdc: fromUsdc(spending.spent),
        remainingUsdc: fromUsdc(spending.remaining),
        periodLedgers: spending.periodLedgers,
      },
      ledger: spending.ledger,
    });
  }
  return NextResponse.json({
    payments: spending.entries.map((e) => ({ amountUsdc: fromUsdc(e.amount), ledger: e.ledger, freedAtLedger: e.freedAtLedger })),
    ledger: spending.ledger,
  });
}

// POST /api/agent/submit { signedXdr } : soumet la tx d'approbation signée par Freighter.
// POST /api/agent/vault-receipt { to, hash } : reçu d'un transfert confidentiel (sans montant).
const SubmitBody = z.object({ signedXdr: z.string().min(1).max(20_000) });
const ReceiptBody = z.object({ to: z.string().regex(/^G[A-Z2-7]{55}$/), hash: z.string().regex(/^[0-9a-f]{64}$/i) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") === "vault-receipt") {
    const body = ReceiptBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "{ to: G…, hash } requis, sans montant" }, { status: 400 });
    const res = await verifyVaultReceipt(body.data.to, body.data.hash.toLowerCase());
    return res.ok ? NextResponse.json({ item: res.item }) : NextResponse.json({ error: res.error }, { status: res.status });
  }
  if (path.join("/") !== "submit") return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = SubmitBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "signedXdr requis" }, { status: 400 });

  let tx;
  try {
    tx = TransactionBuilder.fromXDR(body.data.signedXdr, NETWORK_PASSPHRASE);
  } catch {
    return NextResponse.json({ error: "XDR invalide" }, { status: 400 });
  }
  // On ne relaie que des tx d'approbation : source = owner, déjà signée.
  if (!("source" in tx) || tx.source !== AGENT_CONFIG.ownerAddress || tx.signatures.length === 0) {
    return NextResponse.json({ error: "tx non signée par l'owner" }, { status: 400 });
  }
  const res = await sendAndWait(tx as Parameters<typeof sendAndWait>[0]);
  return res.ok
    ? NextResponse.json({ status: "submitted", hash: res.hash, explorerUrl: txLink(res.hash) })
    : NextResponse.json({ status: "failed", error: res.error, hash: res.hash, explorerUrl: res.hash ? txLink(res.hash) : undefined }, { status: 502 });
}
