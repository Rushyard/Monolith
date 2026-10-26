// Planificateur de liquidité (pur, sans réseau) : « Receiving $10,000 should not mean exposing $10,000. »
// On ne sort du coffre que ce dont la petite caisse (smart account) a besoin pour les dépenses annoncées.
//   besoin   = somme des dépenses + réserve
//   à sortir = besoin − petite caisse, arrondi au palier SUPÉRIEUR (10 USDC) : un withdraw est public,
//              le palier évite de révéler le montant exact des dépenses ;
//   ≤ 0      → "enough" (aucun retrait) ; > max → "over_max" (on propose le max et on le dit).
// L'IA comprend les besoins ; ce code fixe calcule le montant ; le navigateur de Sarah vérifie le coffre ; Sarah signe.
// BigInt sur 7 décimales (unité USDC on-chain), jamais de flottants.

export const USDC_SCALE = 10_000_000n; // 7 décimales
export const LIQUIDITY = { reserveUsdc: "2", step: "10", maxWithdrawUsdc: "50", maxItems: 5, maxLabel: 40 } as const;

export type LiquidityItem = { label: string; amountUsdc: string; due?: string };
export type LiquidityReason = "withdraw" | "enough" | "over_max";
export type LiquidityPlan = {
  items: LiquidityItem[];
  spendUsdc: string;
  reserveUsdc: string;
  needUsdc: string;
  pettyCashUsdc: string;
  withdrawUsdc: string;
  /** Ce qui manquerait encore après le retrait maximal ("over_max"), sinon "0". */
  shortfallUsdc: string;
  reason: LiquidityReason;
};

export class LiquidityError extends Error {
  constructor(readonly code: "no_items" | "too_many" | "bad_amount" | "bad_label", message: string) {
    super(message);
  }
}

/** "4", "4.5", "0.0000001" → unités de 10⁻⁷ USDC, exact. Refuse négatif, > 7 décimales, notation non décimale. */
export function parseUsdcExact(s: string | number | bigint): bigint {
  if (typeof s === "bigint") return s;
  const str = String(s).trim().replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(str);
  if (!m) throw new LiquidityError("bad_amount", `invalid USDC amount: ${JSON.stringify(String(s))}`);
  return BigInt(m[1]) * USDC_SCALE + BigInt((m[2] ?? "").padEnd(7, "0"));
}

/** Unités → "12", "4.5", "0.0000001" (sans zéros inutiles). */
export function formatUsdcExact(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const frac = (a % USDC_SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / USDC_SCALE}${frac ? `.${frac}` : ""}`;
}

const ceilTo = (v: bigint, step: bigint) => ((v + step - 1n) / step) * step;

export function planLiquidity({
  items,
  pettyCashUsdc,
  reserveUsdc = LIQUIDITY.reserveUsdc,
  step = LIQUIDITY.step,
  maxWithdrawUsdc = LIQUIDITY.maxWithdrawUsdc,
}: {
  items: { label: string; amountUsdc: string | number | bigint; due?: string }[];
  pettyCashUsdc: string | number | bigint;
  reserveUsdc?: string | number | bigint;
  step?: string | number | bigint;
  maxWithdrawUsdc?: string | number | bigint;
}): LiquidityPlan {
  if (items.length === 0) throw new LiquidityError("no_items", "at least one expense is required");
  if (items.length > LIQUIDITY.maxItems) throw new LiquidityError("too_many", `at most ${LIQUIDITY.maxItems} expenses`);

  const clean = items.map((it) => {
    const label = it.label.trim().slice(0, LIQUIDITY.maxLabel);
    if (!label) throw new LiquidityError("bad_label", "every expense needs a label");
    const amount = parseUsdcExact(it.amountUsdc);
    if (amount <= 0n) throw new LiquidityError("bad_amount", `amount for ${label} must be > 0`);
    return { label, amount, ...(it.due?.trim() ? { due: it.due.trim().slice(0, LIQUIDITY.maxLabel) } : {}) };
  });

  const reserve = parseUsdcExact(reserveUsdc);
  const petty = parseUsdcExact(pettyCashUsdc);
  const stepU = parseUsdcExact(step);
  const max = parseUsdcExact(maxWithdrawUsdc);
  if (stepU <= 0n) throw new LiquidityError("bad_amount", "step must be > 0");

  const spend = clean.reduce((s, it) => s + it.amount, 0n);
  const need = spend + reserve;
  const missing = need - petty;

  let withdraw = 0n;
  let reason: LiquidityReason = "enough";
  let shortfall = 0n;
  if (missing > 0n) {
    if (missing > max) {
      reason = "over_max";
      withdraw = max;
      shortfall = missing - max;
    } else {
      reason = "withdraw";
      withdraw = ceilTo(missing, stepU);
      if (withdraw > max) withdraw = max; // le max couvre encore le besoin, même s'il n'est pas un multiple du palier
    }
  }

  return {
    items: clean.map(({ label, amount, due }) => ({ label, amountUsdc: formatUsdcExact(amount), ...(due ? { due } : {}) })),
    spendUsdc: formatUsdcExact(spend),
    reserveUsdc: formatUsdcExact(reserve),
    needUsdc: formatUsdcExact(need),
    pettyCashUsdc: formatUsdcExact(petty),
    withdrawUsdc: formatUsdcExact(withdraw),
    shortfallUsdc: formatUsdcExact(shortfall),
    reason,
  };
}
