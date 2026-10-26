// E1 : évaluation du parsing de l'agent sur eval/parsing.jsonl, à travers le vrai pipeline
// POST /api/intent (planner LLM + garde-fous en code + gatekeeper).
// Toujours en mode VISITEUR (SESSION_SECRET retiré) : les paiements publics ne sont que simulés,
// aucune transaction ne peut partir. Une IP distincte par phrase pour la limite par IP.
//   npm run eval            (lit LLM_API_KEY / GROQ_MODEL / AGENT_SECRET_KEY dans app/.env.local)
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
for (const l of readFileSync(join(root, "app", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}
delete process.env.SESSION_SECRET; // fail-closed : personne n'est owner → simulation

type Expect = {
  status?: string;
  /** Texte attendu = phrase du dictionnaire (app/lib/agent/i18n.ts) dans la langue de la ligne. */
  textKey?: string;
  /** Texte attendu = phrase du bloc « mandate » (MT) dans la langue de la ligne. */
  mandateKey?: string;
  textArgs?: unknown[];
  statusIn?: string[];
  text?: string;
  textStartsWith?: string;
  textEndsWith?: string;
  payments?: [string, string][];
  totalUsdc?: string;
  code?: number;
  triggered?: string;
  channel?: "private" | "public";
};
type Row = { id: number; category: string; lang: Lang; message: string; expect: Expect; history?: { role: "user" | "assistant"; text: string }[] };

const rows: Row[] = readFileSync(join(root, "eval", "parsing.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const { POST } = await import("../../app/app/api/intent/route.ts");
const { T, MT } = await import("../../app/lib/agent/i18n.ts");
type Lang = "en" | "fr" | "pt";

function check(e: Expect, b: any, lang: Lang): string[] {
  const r = b.result ?? {};
  const text: string = r.text ?? b.reasoning ?? "";
  const fails: string[] = [];
  if (e.status && r.status !== e.status) fails.push(`status ${r.status} ≠ ${e.status}`);
  if (e.statusIn && !e.statusIn.includes(r.status)) fails.push(`status ${r.status} ∉ ${e.statusIn}`);
  if (e.text && text !== e.text) fails.push(`text « ${text} »`);
  if (e.textKey) {
    const v = (T[lang] as Record<string, unknown>)[e.textKey];
    const want = typeof v === "function" ? (v as (...a: unknown[]) => string)(...(e.textArgs ?? [])) : String(v);
    if (text !== want) fails.push(`text « ${text} » ≠ « ${want} »`);
  }
  if (e.mandateKey) {
    const want = String((MT[lang] as Record<string, unknown>)[e.mandateKey]);
    if (text !== want) fails.push(`text « ${text} » ≠ « ${want} »`);
  }
  // Les phrases du serveur sont dans la langue du message (détectée sur le texte complété par la mémoire).
  if (b.lang !== lang) fails.push(`lang ${b.lang} ≠ ${lang}`);
  if (e.textStartsWith && !text.startsWith(e.textStartsWith)) fails.push(`text « ${text.slice(0, 60)} »`);
  if (e.textEndsWith && !text.endsWith(e.textEndsWith)) fails.push(`text « …${text.slice(-60)} »`);
  if (e.payments) {
    const got = (r.payments ?? []).map((p: any) => [p.label, p.amountUsdc]);
    if (JSON.stringify(got) !== JSON.stringify(e.payments)) fails.push(`payments ${JSON.stringify(got)}`);
  }
  if (e.totalUsdc && r.totalUsdc !== e.totalUsdc) fails.push(`total ${r.totalUsdc}`);
  if (e.code !== undefined && r.code !== e.code) fails.push(`code ${r.code}`);
  if (e.triggered && !(b.verdict?.triggered ?? []).includes(e.triggered)) fails.push(`triggered ${JSON.stringify(b.verdict?.triggered)}`);
  if (e.channel && b.verdict?.channel !== e.channel) fails.push(`channel ${b.verdict?.channel}`);
  return fails;
}

const score = new Map<string, { ok: number; n: number }>();
const bump = (k: string, ok: boolean) => {
  const s = score.get(k) ?? { ok: 0, n: 0 };
  s.n++;
  if (ok) s.ok++;
  score.set(k, s);
};
let llm = 0;
const PACE_MS = Number(process.env.EVAL_PACE_MS ?? 2500); // limite de débit Groq (offre gratuite)
for (const row of rows) {
  await new Promise((r) => setTimeout(r, PACE_MS));
  const res = await POST(
    new Request("http://eval/api/intent", {
      method: "POST",
      headers: { "x-forwarded-for": `10.0.0.${row.id}` },
      body: JSON.stringify({ message: row.message, history: row.history }),
    }),
  );
  const b = await res.json();
  if ((b.plan?.source ?? b.planner) === "llm") llm++;
  if (b.mode !== "simulation") throw new Error("l'éval doit tourner en mode simulation");
  const fails = check(row.expect, b, row.lang);
  bump(row.category, !fails.length);
  bump(`lang:${row.lang}`, !fails.length);
  console.log(`${fails.length ? "✗" : "✓"} #${row.id} [${row.category}/${row.lang}] ${row.message.slice(0, 60)}${fails.length ? `\n    ${fails.join(" ; ")}` : ""}`);
}

const pct = (s: { ok: number; n: number }) => `${s.ok}/${s.n} (${Math.round((100 * s.ok) / s.n)} %)`;
console.log("\n| Catégorie | Score |\n|---|---|");
for (const [k, s] of [...score].filter(([k]) => !k.startsWith("lang:"))) console.log(`| ${k} | ${pct(s)} |`);
console.log("\n| Langue | Score |\n|---|---|");
for (const [k, s] of [...score].filter(([k]) => k.startsWith("lang:"))) console.log(`| ${k.slice(5)} | ${pct(s)} |`);
const all = [...score].filter(([k]) => !k.startsWith("lang:")).reduce((a, [, s]) => ({ ok: a.ok + s.ok, n: a.n + s.n }), { ok: 0, n: 0 });
console.log(`\nTotal : ${pct(all)} — planner LLM sur ${llm}/${rows.length} phrases (le reste : planner de secours ou garde-fou avant le LLM).`);
