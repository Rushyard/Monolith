// Freighter → the SDK's Signer interface, plus SEP-53 message signing.
// Adapted from brozorec/stellar-confidential-token-demo (MIT).
import {
  isConnected,
  requestAccess,
  signMessage as freighterSignMessage,
  signTransaction,
} from "@stellar/freighter-api";
import type { Signer } from "stellar-confidential-token-sdk";

import { CT } from "./deployment";
import { tr } from "../i18n";

export interface MessageSigner extends Signer {
  /** Sign a message (SEP-53) and return the raw ed25519 signature. */
  signMessage(message: string): Promise<Uint8Array>;
}

const msg = (e: unknown) => (typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e));

export async function connectFreighter(): Promise<MessageSigner> {
  const conn = await isConnected();
  if (!conn.isConnected) {
    throw new Error(tr("lib.noFreighter"));
  }
  const access = await requestAccess();
  if (access.error) throw new Error(msg(access.error));
  const address = access.address;

  return {
    publicKey: address,
    async sign(txXdrBase64: string): Promise<string> {
      const res = await signTransaction(txXdrBase64, { networkPassphrase: CT.networkPassphrase, address });
      if (res.error) throw new Error(msg(res.error));
      return res.signedTxXdr;
    },
    async signMessage(message: string): Promise<Uint8Array> {
      const res = await freighterSignMessage(message, { networkPassphrase: CT.networkPassphrase, address });
      if (res.error) throw new Error(msg(res.error));
      if (res.signerAddress !== address) {
        throw new Error(tr("lib.wrongSigner", { got: res.signerAddress, want: address }));
      }
      return normalizeSignature(res.signedMessage);
    },
  };
}

/** Freighter API v4 returns base64; v3 a (structured-cloned) Buffer. */
function normalizeSignature(signed: unknown): Uint8Array {
  if (typeof signed === "string") return Uint8Array.from(atob(signed), (c) => c.charCodeAt(0));
  if (signed instanceof Uint8Array) return new Uint8Array(signed);
  if (signed && typeof signed === "object" && Array.isArray((signed as { data?: unknown }).data)) {
    return Uint8Array.from((signed as { data: number[] }).data);
  }
  throw new Error(tr("lib.noSig"));
}
