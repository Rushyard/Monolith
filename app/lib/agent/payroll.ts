// Paie de la démo : salariés inscrits dans le coffre et montants fixés ICI, jamais par le LLM.
// « Verse les salaires » → needs_vault_signature avec ces paiements : Sarah signe chaque transfert
// confidentiel dans son navigateur. Un salarié hors coffre → refus (un salaire ne part pas en public).
import { resolveRecipient, type Recipient } from "./contacts";

export const PAYROLL: { name: string; amountUsdc: string }[] = [
  { name: "Carol", amountUsdc: "3" },
  { name: "Bob", amountUsdc: "2" },
];

export type PayrollLine = { amountUsdc: string; recipient: Recipient };

export function payrollLines(): PayrollLine[] {
  return PAYROLL.map((p) => ({ amountUsdc: p.amountUsdc, recipient: resolveRecipient(p.name)! }));
}

/** Somme décimale exacte (7 décimales USDC), sans flottants. */
export function sumUsdc(amounts: string[]): string {
  const total = amounts.reduce((s, a) => s + BigInt(Math.round(Number(a) * 1e7)), 0n);
  const whole = total / 10_000_000n;
  const frac = (total % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
