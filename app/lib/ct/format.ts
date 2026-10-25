import { tr } from "../i18n";
// USDC has 7 decimals on Stellar.
const DECIMALS = 7;
const UNIT = 10n ** BigInt(DECIMALS);

export function formatUsdc(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  const s = frac ? `${whole}.${frac.slice(0, 2).padEnd(2, "0")}${frac.slice(2)}` : `${whole}.00`;
  return neg ? `-${s}` : s;
}

/** "7.5" → 75_000_000n. Throws on more than 7 decimals or junk. */
export function parseUsdc(input: string): bigint {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,7})?$/.test(s)) throw new Error(tr("lib.badAmount", { v: input }));
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole!) * UNIT + BigInt(frac.padEnd(DECIMALS, "0"));
}

export const short = (s: string, n = 4) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccount = (a: string) =>
  `https://stellar.expert/explorer/testnet/${a.startsWith("C") ? "contract" : "account"}/${a}`;
