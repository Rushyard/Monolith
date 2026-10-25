// Public (non-confidential) USDC side of the vault: balance read, and a
// "get test USDC" helper (trustline + XLM→USDC path payment on the testnet DEX),
// both signed with Freighter.
import { Asset, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { CT } from "./deployment";
import type { MessageSigner } from "./freighter";

export const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

export interface PublicBalances {
  funded: boolean;
  xlm: string;
  usdc: string | null; // null = no trustline
}

export async function publicBalances(address: string): Promise<PublicBalances> {
  try {
    const acc = await horizon.loadAccount(address);
    const xlm = acc.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
    const usdc = acc.balances.find(
      (b) => "asset_code" in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer,
    );
    return { funded: true, xlm, usdc: usdc ? usdc.balance : null };
  } catch {
    return { funded: false, xlm: "0", usdc: null };
  }
}

export async function friendbot(address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok && res.status !== 400) throw new Error(`friendbot : ${res.status}`);
}

/** Trustline (if missing) + buy `amount` USDC with XLM on the testnet DEX. */
export async function buyTestUsdc(signer: MessageSigner, amount: string): Promise<string> {
  const acc = await horizon.loadAccount(signer.publicKey);
  const hasTrustline = acc.balances.some(
    (b) => "asset_code" in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer,
  );
  const b = new TransactionBuilder(acc, { fee: "1000", networkPassphrase: CT.networkPassphrase });
  if (!hasTrustline) b.addOperation(Operation.changeTrust({ asset: USDC }));
  b.addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: "2000",
      destination: signer.publicKey,
      destAsset: USDC,
      destAmount: amount,
    }),
  );
  const signed = await signer.sign(b.setTimeout(120).build().toXDR());
  const res = await horizon.submitTransaction(TransactionBuilder.fromXDR(signed, CT.networkPassphrase));
  return res.hash;
}
