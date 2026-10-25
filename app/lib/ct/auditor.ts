// Auditor view: decrypt every confidential transfer on the token with the
// auditor's Grumpkin secret. Pure key + events work: no wallet, no proving.
import { H, auditTransfer, auditWithdraw, fetchEvents, scalarMul } from "stellar-confidential-token-sdk";

import { CT } from "./deployment";
import { makeClient } from "./wallet";

export interface AuditRow {
  txHash: string;
  ledger: number;
  kind: "deposit" | "transfer" | "withdraw";
  from: string;
  to: string;
  /** What anyone sees on-chain: null = hidden. */
  publicAmount: bigint | null;
  /** What the auditor recovers. */
  auditedAmount: bigint | null;
  /** Sender's balance after the op, as the auditor sees it. */
  senderBalance: bigint | null;
}

/** "none": no key given · "valid": k·H is our registered auditor key · "invalid": anything else. */
export type KeyStatus = "none" | "valid" | "invalid";

function parseKey(secretHex: string): bigint | null {
  const t = secretHex.trim();
  if (!/^(0x)?[0-9a-fA-F]{1,64}$/.test(t)) return null;
  return BigInt(t.startsWith("0x") ? t : `0x${t}`);
}

/**
 * Read every operation on the token. With the auditor secret, decrypt hidden
 * amounts. The key is checked against the registry (k·H == get_key(auditorId))
 * so a wrong key is reported, not silently turned into garbage numbers.
 */
export async function auditToken(secretHex = ""): Promise<{ rows: AuditRow[]; key: KeyStatus }> {
  const client = makeClient();
  let k: bigint | null = null;
  let key: KeyStatus = "none";
  if (secretHex.trim()) {
    k = parseKey(secretHex);
    const registered = await client.auditorKey(CT.auditorId);
    key = k !== null && k > 0n && scalarMul(k, H).equals(registered) ? "valid" : "invalid";
  }
  const { events } = await fetchEvents(client, { startLedger: CT.deployedAtLedger });
  const rows: AuditRow[] = [];
  for (const ev of events) {
    const base = { txHash: ev.txHash, ledger: ev.ledger };
    if (ev.type === "deposit") {
      rows.push({ ...base, kind: "deposit", from: ev.from, to: ev.to, publicAmount: ev.amount, auditedAmount: ev.amount, senderBalance: null });
    } else if (ev.type === "transfer") {
      const d = k !== null && k > 0n ? auditTransfer(k, ev) : null;
      const ok = !!d && d.channelsAgree;
      rows.push({
        ...base, kind: "transfer", from: ev.from, to: ev.to, publicAmount: null,
        auditedAmount: ok ? d.amount : null,
        senderBalance: ok ? d.senderBalance : null,
      });
    } else if (ev.type === "withdraw") {
      // A wrong key still "decrypts" to a number here: only trust a verified key.
      const senderBalance = key === "valid" && k !== null ? auditWithdraw(k, ev).senderBalance : null;
      rows.push({ ...base, kind: "withdraw", from: ev.from, to: ev.to, publicAmount: ev.amount, auditedAmount: ev.amount, senderBalance });
    }
  }
  return { rows: rows.reverse(), key };
}
