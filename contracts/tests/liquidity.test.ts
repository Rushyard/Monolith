// Planificateur de liquidité (L1) : moteur pur, BigInt sur 7 décimales, sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LiquidityError, formatUsdcExact, parseUsdcExact, planLiquidity } from "../../app/lib/agent/liquidity.ts";

const week = [
  { label: "Alice", amountUsdc: "4" },
  { label: "Alice", amountUsdc: "5" },
  { label: "design tool", amountUsdc: "3", due: "Friday" },
];

test("exemple produit : 4 + 5 + 3 + réserve 2 = 14, petite caisse 6 → manque 8 → sortir 10 (palier)", () => {
  const p = planLiquidity({ items: week, pettyCashUsdc: "6" });
  assert.equal(p.spendUsdc, "12");
  assert.equal(p.reserveUsdc, "2");
  assert.equal(p.needUsdc, "14");
  assert.equal(p.pettyCashUsdc, "6");
  assert.equal(p.withdrawUsdc, "10");
  assert.equal(p.reason, "withdraw");
  assert.equal(p.shortfallUsdc, "0");
  assert.deepEqual(p.items[2], { label: "design tool", amountUsdc: "3", due: "Friday" });
});

test("besoin couvert par la petite caisse → enough, aucun retrait", () => {
  const p = planLiquidity({ items: week, pettyCashUsdc: "74" });
  assert.equal(p.reason, "enough");
  assert.equal(p.withdrawUsdc, "0");
});

test("besoin exactement égal à la petite caisse → enough (≤ 0)", () => {
  assert.equal(planLiquidity({ items: week, pettyCashUsdc: "14" }).reason, "enough");
});

test("le besoin baisse plus tard → « aucun retrait nécessaire »", () => {
  const before = planLiquidity({ items: week, pettyCashUsdc: "6" });
  const after = planLiquidity({ items: [{ label: "Alice", amountUsdc: "3" }], pettyCashUsdc: "6" });
  assert.equal(before.reason, "withdraw");
  assert.equal(after.reason, "enough");
});

test("arrondi au palier supérieur : manque 0.0000001 → 10 ; manque 10 → 10 ; manque 10.0000001 → 20", () => {
  assert.equal(planLiquidity({ items: [{ label: "x", amountUsdc: "0.0000001" }], pettyCashUsdc: "2" }).withdrawUsdc, "10");
  assert.equal(planLiquidity({ items: [{ label: "x", amountUsdc: "10" }], pettyCashUsdc: "2" }).withdrawUsdc, "10");
  assert.equal(planLiquidity({ items: [{ label: "x", amountUsdc: "10.0000001" }], pettyCashUsdc: "2" }).withdrawUsdc, "20");
});

test("palier et réserve paramétrables", () => {
  const p = planLiquidity({ items: [{ label: "x", amountUsdc: "7" }], pettyCashUsdc: "0", reserveUsdc: "0", step: "5" });
  assert.equal(p.needUsdc, "7");
  assert.equal(p.withdrawUsdc, "10");
});

test("au-delà du max → over_max : on propose le max (50) et on dit ce qui manque", () => {
  const p = planLiquidity({ items: [{ label: "rent", amountUsdc: "80" }], pettyCashUsdc: "6" });
  assert.equal(p.reason, "over_max");
  assert.equal(p.withdrawUsdc, "50");
  assert.equal(p.needUsdc, "82");
  assert.equal(p.shortfallUsdc, "26");
});

test("manque ≤ max mais palier > max → on plafonne au max (qui couvre encore le besoin)", () => {
  const p = planLiquidity({ items: [{ label: "x", amountUsdc: "42" }], pettyCashUsdc: "0", maxWithdrawUsdc: "45" });
  assert.equal(p.reason, "withdraw");
  assert.equal(p.withdrawUsdc, "45");
});

test("0 dépense → erreur no_items ; plus de 5 → too_many", () => {
  assert.throws(() => planLiquidity({ items: [], pettyCashUsdc: "6" }), (e: unknown) => e instanceof LiquidityError && e.code === "no_items");
  const six = Array.from({ length: 6 }, (_, i) => ({ label: `p${i}`, amountUsdc: "1" }));
  assert.throws(() => planLiquidity({ items: six, pettyCashUsdc: "6" }), (e: unknown) => e instanceof LiquidityError && e.code === "too_many");
  assert.doesNotThrow(() => planLiquidity({ items: six.slice(0, 5), pettyCashUsdc: "6" }));
});

test("chaque montant > 0, libellé non vide", () => {
  for (const amountUsdc of ["0", "-3", "abc", "1e3", "1.12345678"]) {
    assert.throws(() => planLiquidity({ items: [{ label: "x", amountUsdc }], pettyCashUsdc: "6" }), LiquidityError, amountUsdc);
  }
  assert.throws(() => planLiquidity({ items: [{ label: "  ", amountUsdc: "1" }], pettyCashUsdc: "6" }), /label/);
});

test("décimales exactes, sans flottants : 0.1 + 0.2 = 0.3 ; 4,5 accepté ; 7 décimales", () => {
  const p = planLiquidity({ items: [{ label: "a", amountUsdc: "0.1" }, { label: "b", amountUsdc: "0.2" }], pettyCashUsdc: "100", reserveUsdc: "0" });
  assert.equal(p.spendUsdc, "0.3");
  assert.equal(planLiquidity({ items: [{ label: "a", amountUsdc: "4,5" }], pettyCashUsdc: "0" }).spendUsdc, "4.5");
  const q = planLiquidity({ items: [{ label: "a", amountUsdc: "1.2345678" }], pettyCashUsdc: "0.0000002" });
  assert.equal(q.needUsdc, "3.2345678");
  assert.equal(q.withdrawUsdc, "10");
});

test("parse / format exacts (aller-retour)", () => {
  assert.equal(parseUsdcExact("12"), 120_000_000n);
  assert.equal(parseUsdcExact("0.0000001"), 1n);
  for (const s of ["0", "12", "4.5", "0.0000001", "123456789.1234567"]) assert.equal(formatUsdcExact(parseUsdcExact(s)), s);
  assert.equal(formatUsdcExact(-25n), "-0.0000025");
});
