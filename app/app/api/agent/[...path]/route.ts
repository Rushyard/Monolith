import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_CONFIG } from "@/lib/agent/config";
import { NETWORK_PASSPHRASE, TransactionBuilder, fromUsdc, readTokenBalance, sendAndWait, txLink } from "@/lib/agent/core";
import { readAgentSpending } from "@/lib/agent/executor";
import { readActivity, verifyVaultReceipt } from "@/lib/agent/activity";
import {
  clearSessionCookieHeader,
  createChallenge,
  isOwnerRequest,
  makeSessionToken,
  sessionCookieHeader,
  sessionSecret,
  verifyLogin,
} from "@/lib/agent/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agent/balance · GET /api/agent/history · GET /api/agent/activity
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");
  // GET /api/agent/session → { enabled, owner, ownerAddress } · GET /api/agent/challenge → { message, token }
  if (route === "session") {
    return NextResponse.json({ enabled: !!sessionSecret(), owner: isOwnerRequest(req, AGENT_CONFIG.ownerAddress), ownerAddress: AGENT_CONFIG.ownerAddress });
  }
  if (route === "challenge") {
    const secret = sessionSecret();
    if (!secret) return NextResponse.json({ error: "connexion owner désactivée (SESSION_SECRET absent) : tout le monde est en simulation" }, { status: 503 });
    return NextResponse.json({ ...createChallenge(secret), ownerAddress: AGENT_CONFIG.ownerAddress }, { headers: { "Cache-Control": "no-store" } });
  }
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

// POST /api/agent/session { message, token, signature } : connexion owner (signature SEP-53 Freighter).
const LoginBody = z.object({ message: z.string().min(1).max(500), token: z.string().min(1).max(200), signature: z.string().min(1).max(200) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") === "session") {
    const secret = sessionSecret();
    if (!secret) return NextResponse.json({ error: "connexion owner désactivée (SESSION_SECRET absent)" }, { status: 503 });
    const body = LoginBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "{ message, token, signature } requis" }, { status: 400 });
    const check = verifyLogin(body.data, AGENT_CONFIG.ownerAddress, secret);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 401 });
    return NextResponse.json(
      { enabled: true, owner: true, ownerAddress: AGENT_CONFIG.ownerAddress },
      { headers: { "Set-Cookie": sessionCookieHeader(makeSessionToken(AGENT_CONFIG.ownerAddress, secret)) } },
    );
  }
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

// DELETE /api/agent/session : déconnexion.
export async function DELETE(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== "session") return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ owner: false }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
