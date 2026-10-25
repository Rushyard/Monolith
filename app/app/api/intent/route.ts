import { NextResponse } from "next/server";
import { z } from "zod";
import { parseIntent } from "@/lib/llm";
import { executeIntent } from "@/lib/smartAccount";

const Body = z.object({ message: z.string().min(1) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const intent = await parseIntent(body.data.message);
  const result = await executeIntent(intent);
  return NextResponse.json({ intent, ...result });
}
