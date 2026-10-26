// Planificateur de liquidité (L4) : retrait du COFFRE DE SARAH vers la petite caisse (smart account), depuis la CLI.
// (scripts/withdraw-to-contract.ts de P2 prouve la même chose avec un compte neuf ; ici c'est le coffre de l'owner.)
// La clé du coffre est dérivée exactement comme dans le navigateur (app/lib/ct/derive-key.ts) : signature SEP-53 de
// skSigningMessage(token, owner), ed25519 déterministe → même clé que Freighter. La clé owner vient du keystore
// Stellar CLI (`owner`), n'est jamais écrite ni affichée. Le solde privé du coffre n'est JAMAIS affiché :
// seulement « suffisant / insuffisant » pour le montant demandé.
//   npm run vault-withdraw -- --check [--amount 10]   lecture seule : suffisant ? + frais d'un withdraw passé
//   npm run vault-withdraw -- --amount 10 --yes       la vraie tx : withdraw public de 10 USDC vers la petite caisse
import {
  ChainClient,
  CircuitProver,
  MemoryStore,
  StateDivergedError,
  StateEngine,
  addressToField,
  buildWithdrawWitness,
  deriveKeys,
  deriveSk,
  fetchEvents,
  keypairSigner,
  sep53Payload,
  skSigningMessage,
  submitWithdraw,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/proving/artifacts";
import { CT } from "../../app/lib/ct/deployment.ts";
import deployment from "../../app/lib/agent/deployment.json" with { type: "json" };
import { formatUsdcExact, parseUsdcExact } from "../../app/lib/agent/liquidity.ts";
import { keypairFromCli, readTokenBalance, server, txLink } from "./lib.ts";

// Même owner que la config de l'agent (app/lib/agent/config.ts).
const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B";
const SA = deployment.smartAccount;

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
const amount = parseUsdcExact(opt("--amount") ?? "10");
const check = flag("--check") || !flag("--yes");

const owner = keypairFromCli("owner");
if (owner.publicKey() !== OWNER) throw new Error(`l'identité CLI « owner » n'est pas Sarah (${OWNER.slice(0, 4)}…${OWNER.slice(-4)})`);

// Clé du coffre, comme dans le navigateur.
const message = skSigningMessage(CT.token, OWNER);
const root = owner.sign(Buffer.from(sep53Payload(message)));
if (!owner.verify(Buffer.from(sep53Payload(message)), root)) throw new Error("signature SEP-53 invalide");
const keys = deriveKeys(deriveSk(new Uint8Array(root), CT.token, OWNER).sk, addressToField(CT.token));

const client = new ChainClient({
  rpcUrl: CT.rpcUrl,
  networkPassphrase: CT.networkPassphrase,
  contracts: { token: CT.token, verifier: CT.verifier, auditor: CT.auditor },
});
const onchain = await client.confidentialBalance(OWNER);
if (!onchain) throw new Error("Sarah n'a pas de compte confidentiel");
if (!onchain.spendingKey.equals(keys.Y)) throw new Error("la clé dérivée ne correspond pas au compte confidentiel de Sarah");

const engine = new StateEngine({ client, store: new MemoryStore(), keys, address: OWNER, fromLedger: CT.deployedAtLedger });
try {
  await engine.sync();
} catch (e) {
  if (!(e instanceof StateDivergedError && e.report.spendableOk)) throw e;
}
const { v, r } = await engine.spendableForProof();
const enough = v >= amount;
console.log(`coffre de Sarah ${OWNER.slice(0, 4)}…${OWNER.slice(-4)} : solde disponible suffisant pour ${formatUsdcExact(amount)} USDC : ${enough ? "oui" : "NON"}`);

const before = await readTokenBalance(OWNER, CT.underlying, SA);
console.log(`petite caisse ${SA.slice(0, 4)}…${SA.slice(-4)} (USDC public) : ${formatUsdcExact(before)}`);

if (check) {
  // Coût d'un withdraw déjà fait (n'importe quel compte) : frais réellement payés on-chain.
  const health = await server.getHealth();
  const { events } = await fetchEvents(client, { startLedger: Math.max(CT.deployedAtLedger, health.oldestLedger) });
  const last = [...events].reverse().find((e) => e.type === "withdraw");
  if (last) {
    const h = await fetch(`https://horizon-testnet.stellar.org/transactions/${last.txHash}`).then((x) => (x.ok ? x.json() : null), () => null);
    const fee = h?.fee_charged ? Number(h.fee_charged) / 1e7 : null;
    console.log(`dernier withdraw on-chain : ${txLink(last.txHash)} · frais payés : ${fee ?? "?"} XLM`);
  }
  console.log("lecture seule : rien n'a été envoyé (ajoute --yes pour la vraie tx)");
  process.exit(0);
}

if (!enough) {
  console.error("❌ solde disponible insuffisant : dépose puis fusionne d'abord (rien n'a été envoyé)");
  process.exit(1);
}

const kAud = await client.auditorKey(CT.auditorId);
const w = buildWithdrawWitness({ keys, v, r, amount, kAudS: kAud });
const prover = new CircuitProver(loadCircuit("withdraw"));
try {
  console.log("preuve withdraw…");
  const { proof } = await prover.prove(w.inputs);
  const res = await submitWithdraw(client, keypairSigner(owner.secret(), CT.networkPassphrase), OWNER, SA, amount, w, proof);
  const after = await readTokenBalance(OWNER, CT.underlying, SA);
  console.log(`✅ withdraw ${formatUsdcExact(amount)} USDC coffre → petite caisse : ${txLink(res.hash)}`);
  console.log(`petite caisse (USDC public) : ${formatUsdcExact(before)} → ${formatUsdcExact(after)}`);
} finally {
  await prover.destroy();
}
