// État du smart account Monolith (lecture seule, aucune tx envoyée).
//   npm run status            (depuis contracts/)
import { Address, contractLink, keypairFromCli, loadDeployments, nativeToScVal, readContract, scValToNative, server } from "./lib.ts";

const d = loadDeployments();
const reader = keypairFromCli("owner").publicKey(); // simple compte source pour simuler
const alice = keypairFromCli("alice").publicKey();
const SA = d.smartAccount!;
const fmt = (v: bigint) => `${(Number(v) / 1e7).toFixed(2)} USDC`;

const balance = async (addr: string) =>
  BigInt(scValToNative((await readContract(reader, d.usdcSac, "balance", [new Address(addr).toScVal()]))!));

const data = scValToNative(
  (await readContract(reader, d.spendingLimitPolicy!, "get_spending_limit_data", [
    nativeToScVal(d.ruleAgent!, { type: "u32" }),
    new Address(SA).toScVal(),
  ]))!,
) as { spending_limit: bigint; period_ledgers: number; cached_total_spent: bigint; spending_history: { amount: bigint; ledger_sequence: number }[] };

// cached_total_spent n'est nettoyé qu'au prochain transfert : on recalcule la fenêtre glissante
// comme la policy (entrées avec ledger_sequence <= ledger - period sorties du cumul).
const ledger = (await server.getLatestLedger()).sequence;
const cutoff = ledger - data.period_ledgers;
const live = data.spending_history.filter((e) => e.ledger_sequence > cutoff);
const spent = live.reduce((s, e) => s + BigInt(e.amount), 0n);
const limit = BigInt(data.spending_limit);
const remaining = limit > spent ? limit - spent : 0n;

console.log(`Smart account      ${SA}\n                   ${contractLink(SA)}`);
console.log(`Solde smart account ${fmt(await balance(SA))}`);
console.log(`Solde alice         ${fmt(await balance(alice))}`);
console.log(`Solde agent (G)     ${fmt(await balance(keypairFromCli("agent").publicKey()))}   ← rechargé par topup, paie en x402`);
console.log(`\nAgent (règle ${d.ruleAgent}, fenêtre glissante de ${data.period_ledgers} ledgers ≈ ${((data.period_ledgers * 5) / 3600).toFixed(1)} h)`);
console.log(`  plafond           ${fmt(limit)}`);
console.log(`  dépensé (fenêtre) ${fmt(spent)}`);
console.log(`  budget restant    ${fmt(remaining)}`);
for (const e of live) {
  const freeAt = e.ledger_sequence + data.period_ledgers;
  const hours = ((freeAt - ledger) * 5) / 3600;
  console.log(`    · ${fmt(BigInt(e.amount))} au ledger ${e.ledger_sequence}, libéré au ledger ${freeAt} (~${hours.toFixed(1)} h)`);
}
console.log(`\nLedger actuel ${ledger}`);
