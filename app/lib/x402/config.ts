// Configuration x402 (option B, cf. MONOLITH.md §6) : le smart account vire un petit budget
// vers le compte G de l'agent (action « topup », règle B), et c'est ce compte G qui paie en x402.
// Raison : issue x402 #3764, le schéma Stellar « exact » rejette les paiements signés par un
// smart account avec spending-limit.
//
// ISOLATION DU SDK : @x402/stellar dépend de @stellar/stellar-sdk ^16 (copie imbriquée dans
// node_modules/@x402/stellar/node_modules), l'app est en v17. Règles :
//   - seuls les fichiers de app/lib/x402/ importent @x402/* ;
//   - app/lib/x402/ n'importe jamais @stellar/stellar-sdk (ni ../agent/core) ;
//   - seules des valeurs primitives (strings) traversent la frontière : clé secrète, adresses,
//     montants. Aucun objet Keypair / xdr / Transaction v17 n'est passé à @x402/stellar.
// Vérifié par contracts/tests/x402.test.ts.
import D from "../agent/deployment.json";

export const X402_NETWORK = "stellar:testnet" as const;
export const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

export const USDC_DECIMALS = 7;
/** SAC USDC (Circle testnet) : le même que celui du smart account. */
export const X402_USDC_SAC = process.env.NEXT_PUBLIC_USDC_SAC || D.usdcSac;

/** Route premium protégée par x402. */
export const MARKET_DATA_PATH = "/api/premium/market-data";
export const MARKET_DATA_PRICE_USDC = "0.01";

/**
 * Compte G qui encaisse les paiements x402 (le « vendeur » de l'API). Il lui faut une trustline
 * USDC. Par défaut : alice, le compte de démo (trustline 04615991…, cf. docs/architecture.md).
 */
export const X402_PAY_TO = process.env.X402_PAY_TO || "GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6";

/** Plafond côté client : l'agent refuse de payer plus que ça pour une requête x402. */
export const X402_MAX_PRICE_USDC = MARKET_DATA_PRICE_USDC;

/** Montant maximal d'un topup smart account → compte G de l'agent. */
export const TOPUP_MAX_USDC = 1;

/** "0.01" → 100000n (7 décimales). Sans Number pour ne pas perdre de précision. */
export function toAtomic(amount: string, decimals = USDC_DECIMALS): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim());
  if (!m || (!m[1] && !m[2])) throw new Error(`montant invalide : ${amount}`);
  const frac = (m[2] ?? "").padEnd(decimals, "0");
  if (frac.length > decimals) throw new Error(`plus de ${decimals} décimales : ${amount}`);
  return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export const fromAtomic = (v: bigint | string, decimals = USDC_DECIMALS) => Number(BigInt(v)) / 10 ** decimals;
