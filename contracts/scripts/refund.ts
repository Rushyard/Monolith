// Remise à zéro de la démo : alice renvoie tous ses USDC au smart account.
//   npm run refund            (depuis contracts/)
import { Address, invokeAsClassic, keypairFromCli, loadDeployments, nativeToScVal, readTokenBalance, txLink } from "./lib.ts";

const d = loadDeployments();
const alice = keypairFromCli("alice");
const bal = await readTokenBalance(alice.publicKey(), d.usdcSac, alice.publicKey());
if (bal === 0n) {
  console.log("alice n'a aucun USDC à renvoyer.");
} else {
  const res = await invokeAsClassic(alice, d.usdcSac, "transfer", [
    new Address(alice.publicKey()).toScVal(),
    new Address(d.smartAccount!).toScVal(),
    nativeToScVal(bal, { type: "i128" }),
  ]);
  console.log(res.ok ? `↩ alice renvoie ${Number(bal) / 1e7} USDC  ${txLink(res.hash)}` : `❌ ${res.error}`);
}
