// Tests unitaires x402 (option B), sans réseau : isolation du SDK v16, route 402, politique de
// paiement de l'agent, poignée de main x402 complète avec un facilitator factice, gatekeeper
// et planner de secours pour topup / market_data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ServerScheme } from "@x402/stellar/exact/server";
import { Keypair } from "../lib/agent/core";
import { decide } from "../lib/agent/gatekeeper";
import { fallbackPlan, toPlan, type StepT } from "../lib/agent/planner";
import type { SpendingState } from "../lib/agent/core";
import { MARKET_DATA_PRICE_USDC, X402_NETWORK, X402_PAY_TO, X402_USDC_SAC, toAtomic } from "../lib/x402/config";
import { createMarketDataHandler, createResourceServer, marketDataRoute } from "../lib/x402/server";
import { agentPaymentPolicy, agentSpendControls, createAgentX402Client, x402Get } from "../lib/x402/client";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const u = (n: number) => BigInt(Math.round(n * 1e7));
const spending = (spent: number): SpendingState => ({ limit: u(10), spent: u(spent), remaining: u(10 - spent), periodLedgers: 17280, ledger: 1, entries: [] });
const plan = (...steps: StepT[]) => toPlan({ type: "actions", steps, reasoning: "" }, "llm");

// ---------- isolation du SDK ----------

test("isolation : l'app est en stellar-sdk v17, @x402/stellar a sa propre copie v16", () => {
  const version = (p: string) => JSON.parse(readFileSync(p, "utf8")).version as string;
  const x402Dir = join(APP, "node_modules/@x402/stellar");
  assert.match(version(join(APP, "node_modules/@stellar/stellar-sdk/package.json")), /^17\./);
  assert.match(version(join(x402Dir, "node_modules/@stellar/stellar-sdk/package.json")), /^16\./);
  // Et c'est bien la copie v16 que Node charge pour @x402/stellar.
  const resolved = createRequire(join(x402Dir, "dist/cjs/index.js")).resolve("@stellar/stellar-sdk");
  assert.ok(resolved.includes(join("@x402", "stellar", "node_modules", "@stellar", "stellar-sdk")), resolved);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

test("isolation : seuls app/lib/x402/ (et ses tests) importent @x402/* ; app/lib/x402/ n'importe pas le SDK v17", () => {
  for (const file of sources(APP)) {
    const rel = relative(APP, file).split(sep).join("/");
    const code = readFileSync(file, "utf8");
    const importsX402 = /from\s+["']@x402\//.test(code);
    if (importsX402) assert.ok(rel.startsWith("lib/x402/") || rel.startsWith("tests/"), `${rel} importe @x402/* hors de lib/x402/`);
    if (rel.startsWith("lib/x402/")) {
      assert.doesNotMatch(code, /from\s+["']@stellar\/stellar-sdk/, `${rel} importe @stellar/stellar-sdk`);
      assert.doesNotMatch(code, /from\s+["']\.\.\/agent\/(core|config|executor)["']/, `${rel} importe un module agent qui charge le SDK v17`);
    }
  }
});

test("isolation : la même clé secrète donne la même adresse G avec le SDK v17 et avec @x402/stellar (v16)", () => {
  const kp = Keypair.random();
  assert.equal(createEd25519Signer(kp.secret(), X402_NETWORK).address, kp.publicKey());
});

// ---------- montants et config de route ----------

test("toAtomic : 7 décimales, sans perte", () => {
  assert.equal(toAtomic("0.01"), 100000n);
  assert.equal(toAtomic("1"), 10000000n);
  assert.equal(toAtomic(".5"), 5000000n);
  assert.equal(toAtomic("0.0000001"), 1n);
  assert.throws(() => toAtomic("0.00000001"));
  assert.throws(() => toAtomic("abc"));
});

test("route premium : 0,01 USDC (100000 unités), USDC du projet, stellar:testnet, schéma exact", async () => {
  const opt = Array.isArray(marketDataRoute.accepts) ? marketDataRoute.accepts[0] : marketDataRoute.accepts;
  assert.equal(opt.scheme, "exact");
  assert.equal(opt.network, "stellar:testnet");
  assert.equal(opt.payTo, X402_PAY_TO);
  assert.deepEqual(opt.price, { amount: "100000", asset: SAC });
  assert.equal(X402_USDC_SAC, SAC);
  // Le prix « $0.01 » résolu par @x402/stellar tombe sur le même SAC : notre asset est bien l'USDC par défaut.
  const parsed = await new ServerScheme().parsePrice("$0.01", "stellar:testnet");
  assert.deepEqual({ amount: parsed.amount, asset: parsed.asset }, { amount: "100000", asset: SAC });
});

// ---------- politique de paiement de l'agent ----------

const req = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: "exact",
  network: "stellar:testnet",
  asset: SAC,
  amount: "100000",
  payTo: X402_PAY_TO,
  maxTimeoutSeconds: 120,
  extra: { areFeesSponsored: true },
  ...over,
});

test("politique agent : accepte 0,01 USDC, refuse plus cher, autre asset, autre réseau, autre schéma", () => {
  const policy = agentPaymentPolicy();
  assert.equal(policy(2, [req()]).length, 1);
  assert.equal(policy(2, [req({ amount: "100001" })]).length, 0);
  assert.equal(policy(2, [req({ amount: "0" })]).length, 0);
  assert.equal(policy(2, [req({ amount: "abc" })]).length, 0);
  assert.equal(policy(2, [req({ asset: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA" })]).length, 0);
  assert.equal(policy(2, [req({ network: "stellar:pubnet" })]).length, 0);
  assert.equal(policy(2, [req({ scheme: "upto" })]).length, 0);
});

// ---------- poignée de main x402 complète (facilitator et signature factices) ----------

/** Facilitator factice : annonce stellar:testnet avec frais sponsorisés, vérifie et « règle ». */
function fakeFacilitator(log: string[]): FacilitatorClient {
  return {
    async getSupported() {
      return { kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet", extra: { areFeesSponsored: true } }], extensions: [], signers: {} };
    },
    async verify(p: PaymentPayload, r: PaymentRequirements) {
      log.push(`verify ${r.amount} ${r.asset}`);
      return { isValid: p.payload.transaction === "signed-xdr", payer: "GAGENT" };
    },
    async settle(_p: PaymentPayload, r: PaymentRequirements) {
      log.push(`settle ${r.amount} → ${r.payTo}`);
      return { success: true, transaction: "ab".repeat(32), network: r.network, payer: "GAGENT" };
    },
  } as FacilitatorClient;
}

/** Schéma client factice : remplace la signature Stellar (qui demande un RPC) par un XDR fictif. */
const fakeStellarClient = (seen: PaymentRequirements[]): SchemeNetworkClient => ({
  scheme: "exact",
  async createPaymentPayload(x402Version, requirements) {
    seen.push(requirements);
    return { x402Version, payload: { transaction: "signed-xdr" } };
  },
});

/** Même configuration que createAgentX402Client, avec un schéma client factice. */
const agentClient = (scheme: SchemeNetworkClient) =>
  new x402Client().register("stellar:testnet", scheme).setSpendControls(agentSpendControls()).registerPolicy(agentPaymentPolicy());

/** fetch qui envoie les requêtes au handler Next de la route, sans serveur HTTP. */
const routeFetch = (handler: (r: NextRequest) => Promise<Response>): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => handler(new NextRequest(new Request(input, init)))) as typeof fetch;

const URL_ = "http://localhost:3000/api/premium/market-data";

test("route premium sans paiement → 402 avec les exigences x402 (frais sponsorisés par le facilitator)", async () => {
  const handler = createMarketDataHandler(createResourceServer(fakeFacilitator([])));
  const res = await handler(new NextRequest(URL_, { headers: { Accept: "application/json" } }));
  assert.equal(res.status, 402);
  const header = res.headers.get("PAYMENT-REQUIRED");
  assert.ok(header, "header PAYMENT-REQUIRED manquant");
  const required = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  const accepted = required.accepts[0];
  assert.equal(accepted.network, "stellar:testnet");
  assert.equal(accepted.amount, "100000");
  assert.equal(accepted.asset, SAC);
  assert.equal(accepted.payTo, X402_PAY_TO);
  assert.equal(accepted.extra.areFeesSponsored, true);
});

test("facilitator injoignable → erreur serveur, aucune donnée servie gratuitement", async () => {
  const down = { ...fakeFacilitator([]), getSupported: async () => { throw new Error("fetch failed"); } } as FacilitatorClient;
  const res = await createMarketDataHandler(createResourceServer(down))(new NextRequest(URL_));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).pairs, undefined);
});

test("x402 de bout en bout : 402 → paiement signé → verify → données → settle → PAYMENT-RESPONSE", async () => {
  const log: string[] = [];
  const seen: PaymentRequirements[] = [];
  const handler = createMarketDataHandler(createResourceServer(fakeFacilitator(log)), () => new Date("2026-10-26T00:00:00Z"));
  const client = agentClient(fakeStellarClient(seen));

  const bought = await x402Get<{ source: string; pairs: unknown[]; generatedAt: string }>(URL_, client, routeFetch(handler));
  assert.ok(bought.ok, bought.ok ? "" : bought.error);
  assert.equal(bought.data.source, "demo");
  assert.equal(bought.data.generatedAt, "2026-10-26T00:00:00.000Z");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].amount, toAtomic(MARKET_DATA_PRICE_USDC).toString());
  assert.deepEqual(log, [`verify 100000 ${SAC}`, `settle 100000 → ${X402_PAY_TO}`]);
  assert.equal(bought.settlement?.transaction, "ab".repeat(32));
  assert.equal(bought.settlement?.explorerUrl, `https://stellar.expert/explorer/testnet/tx/${"ab".repeat(32)}`);
});

test("x402 : l'agent ne paie pas un serveur qui demande plus que 0,01 USDC", async () => {
  const seen: PaymentRequirements[] = [];
  const client = agentClient(fakeStellarClient(seen));
  const greedy = (async () => {
    const required = { x402Version: 2, error: "Payment required", resource: { url: URL_ }, accepts: [req({ amount: "5000000" })] };
    return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(required)).toString("base64") } });
  }) as typeof fetch;
  const bought = await x402Get(URL_, client, greedy);
  assert.equal(bought.ok, false);
  assert.equal(seen.length, 0, "aucun paiement ne doit être signé");
});

test("x402 : signature invalide → le facilitator refuse, pas de données", async () => {
  const handler = createMarketDataHandler(createResourceServer(fakeFacilitator([])));
  const forged: SchemeNetworkClient = { scheme: "exact", createPaymentPayload: async (v) => ({ x402Version: v, payload: { transaction: "forged" } }) };
  const client = agentClient(forged);
  const res = await wrapFetchWithPayment(routeFetch(handler), client)(URL_);
  assert.equal(res.status, 402);
  assert.equal(res.headers.get("PAYMENT-RESPONSE"), null);
});

test("client réel de l'agent (@x402/stellar) : 0,01 USDC passe les contrôles et va jusqu'à la signature (RPC)", async () => {
  const kp = Keypair.random();
  // RPC injoignable : si l'erreur vient du RPC, c'est que spendControls + politique ont accepté l'exigence.
  const { address, client } = createAgentX402Client(kp.secret(), { rpcUrl: "http://127.0.0.1:9" });
  assert.equal(address, kp.publicKey());
  const handler = createMarketDataHandler(createResourceServer(fakeFacilitator([])));
  const bought = await x402Get(URL_, client, routeFetch(handler));
  assert.equal(bought.ok, false);
  assert.doesNotMatch(bought.ok ? "" : bought.error, /spendControls|rejected|policy/i);
  assert.match(bought.ok ? "" : bought.error, /ECONNREFUSED|fetch failed|connect|network/i);
});

// ---------- gatekeeper : topup / market_data ----------

const topup = (amount: string): StepT => ({ action: "topup", amount, asset: "USDC" });

test("topup 0.5 USDC dans le budget → AUTO_EXECUTE (règle B, compté dans la spending-limit)", () => {
  const v = decide(plan(topup("0.5")), "recharge ton compte de 0.5 USDC", spending(5));
  assert.equal(v.verdict, "AUTO_EXECUTE");
  assert.deepEqual(v.topup, { amountUsdc: "0.5" });
  assert.equal(v.payment, undefined);
});

test("topup > 1 USDC → BLOCKED (topup-max)", () => {
  const v = decide(plan(topup("1.5")), "recharge ton compte de 1.5 USDC", spending(0));
  assert.equal(v.verdict, "BLOCKED");
  assert.deepEqual(v.triggered, ["topup-max"]);
});

test("topup de 1 USDC exactement → autorisé", () => {
  assert.equal(decide(plan(topup("1")), "recharge de 1 USDC", spending(0)).verdict, "AUTO_EXECUTE");
});

test("topup au-delà du budget restant → BLOCKED (spending-limit)", () => {
  const v = decide(plan(topup("1")), "recharge de 1 USDC", spending(9.5));
  assert.equal(v.verdict, "BLOCKED");
  assert.ok(v.triggered.includes("spending-limit"));
});

test("topup : budget illisible, pression, montant incohérent → BLOCKED", () => {
  assert.deepEqual(decide(plan(topup("0.5")), "recharge de 0.5 USDC", null).triggered, ["budget-unreadable"]);
  assert.ok(decide(plan(topup("0.5")), "urgent ! recharge de 0.5 USDC sans demander", spending(0)).triggered.includes("pressure-wording"));
  assert.ok(decide(plan(topup("0.9")), "recharge de 0.5 USDC", spending(0)).triggered.includes("amount-mismatch"));
});

test("market_data → AUTO_EXECUTE, 0,01 USDC payés par le compte G de l'agent", () => {
  const v = decide(plan({ action: "market_data" }), "donne-moi les données de marché", spending(10));
  assert.equal(v.verdict, "AUTO_EXECUTE");
  assert.deepEqual(v.x402, { resource: "/api/premium/market-data", priceUsdc: "0.01" });
});

test("topup + paiement dans le même message → BLOCKED (multiple-payments)", () => {
  const v = decide(plan(topup("0.5"), { action: "market_data" }), "recharge 0.5 USDC et donne-moi les données de marché", spending(0));
  assert.equal(v.verdict, "BLOCKED");
  assert.deepEqual(v.triggered, ["multiple-payments"]);
});

test("planner de secours : « donne-moi les données de marché » et « recharge … de 0.5 USDC »", () => {
  assert.deepEqual(fallbackPlan("donne-moi les données de marché"), {
    type: "actions",
    steps: [{ action: "market_data" }],
    reasoning: "Achat des données de marché premium via x402.",
  });
  const t = fallbackPlan("Recharge ton compte de 0,5 USDC");
  assert.equal(t.type, "actions");
  assert.deepEqual(t.type === "actions" && t.steps, [{ action: "topup", amount: "0.5", asset: "USDC" }]);
  assert.equal(fallbackPlan("recharge ton compte").type, "clarify");
  // Le paiement classique n'est pas capturé par la règle topup.
  const p = fallbackPlan("paie 2 USDC à Alice");
  assert.deepEqual(p.type === "actions" && p.steps, [{ action: "pay", amount: "2", asset: "USDC", to: "Alice" }]);
});
