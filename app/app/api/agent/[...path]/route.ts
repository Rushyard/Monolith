import { NextResponse } from "next/server";

// /api/agent/balance, /api/agent/history, ... (P1)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  switch (path.join("/")) {
    case "balance":
      return NextResponse.json({ todo: "balance du smart account" }, { status: 501 });
    case "history":
      return NextResponse.json({ todo: "historique des paiements de l'agent" }, { status: 501 });
    default:
      return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
