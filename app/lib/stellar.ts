// RPC, réseau, helpers tx.
import { Networks, rpc } from "@stellar/stellar-sdk";

export const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

export const USDC_SAC = process.env.NEXT_PUBLIC_USDC_SAC ?? "";
export const SMART_ACCOUNT_ID = process.env.NEXT_PUBLIC_SMART_ACCOUNT_ID ?? "";
export const CT_CONTRACT_ID = process.env.NEXT_PUBLIC_CT_CONTRACT_ID ?? "";

export function getRpc() {
  return new rpc.Server(RPC_URL);
}

export function explorerTxUrl(hash: string) {
  return `https://stellar.expert/explorer/${NETWORK}/tx/${hash}`;
}
