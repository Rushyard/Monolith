// Achat x402 en ligne de commande, sans passer par l'agent ni le LLM : utile pour isoler un
// problème de facilitator / trustline / solde. Paie depuis le compte G de AGENT_SECRET_KEY.
//   AGENT_SECRET_KEY=$(stellar keys show agent) npm run x402:buy -- http://localhost:3000/api/premium/market-data
import { createAgentX402Client, x402Get } from "../lib/x402/client";

const url = process.argv[2] ?? "http://localhost:3000/api/premium/market-data";
const secret = process.env.AGENT_SECRET_KEY;
if (!secret) {
  console.error("AGENT_SECRET_KEY manquant (ex. AGENT_SECRET_KEY=$(stellar keys show agent))");
  process.exit(1);
}

async function main() {
  const { address, client } = createAgentX402Client(secret!, { rpcUrl: process.env.NEXT_PUBLIC_RPC_URL });
  console.log(`payeur : ${address}\nressource : ${url}`);
  const bought = await x402Get(url, client);
  console.log(JSON.stringify(bought, null, 2));
  process.exit(bought.ok ? 0 : 1);
}

main();
