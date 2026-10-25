// Confidential key `sk` from a Freighter SEP-53 signature (OZ SDK spec,
// docs/sdk/key-derivation.md). Same Freighter account + same token → same sk,
// on any device. Signer-side obligations handled here: verify the signature
// against the account key, sign twice and compare (determinism), never persist
// the root. Adapted from brozorec/stellar-confidential-token-demo (MIT).
import { Keypair } from "@stellar/stellar-sdk";
import { deriveSk, sep53Payload, skSigningMessage } from "stellar-confidential-token-sdk";

import type { MessageSigner } from "./freighter";
import { tr } from "../i18n";

export async function deriveSignerRootSk(
  signer: MessageSigner,
  token: string,
  log: (m: string) => void,
): Promise<bigint> {
  const account = signer.publicKey;
  const message = skSigningMessage(token, account);
  const text = new TextDecoder().decode(message);
  const payload = sep53Payload(message);
  const key = Keypair.fromPublicKey(account);

  const roots: Uint8Array[] = [];
  for (const attempt of ["1/2", "2/2"]) {
    log(tr("lib.signDerive", { n: attempt }));
    const root = await signer.signMessage(text);
    if (!key.verify(payload as Buffer, root as Buffer)) {
      throw new Error(tr("lib.sigMismatch", { acc: account }));
    }
    roots.push(root);
  }
  const [a, b] = roots as [Uint8Array, Uint8Array];
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
    throw new Error(tr("lib.twoSigs"));
  }
  return deriveSk(a, token, account).sk;
}
