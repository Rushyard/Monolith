// Auditor view: decrypt every confidential transfer on the token with the
// auditor's Grumpkin secret. Pure key + events work: no wallet, no proving.
import { auditTransfer, auditWithdraw, fetchEvents } from "stellar-confidential-token-sdk";

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

export async function auditToken(secretHex: string = CT.auditorSecretHex): Promise<AuditRow[]> {
  const k = BigInt(secretHex);
  const { events } = await fetchEvents(makeClient(), { startLedger: CT.deployedAtLedger });
  const rows: AuditRow[] = [];
  for (const ev of events) {
    const base = { txHash: ev.txHash, ledger: ev.ledger };
    if (ev.type === "deposit") {
      rows.push({ ...base, kind: "deposit", from: ev.from, to: ev.to, publicAmount: ev.amount, auditedAmount: ev.amount, senderBalance: null });
    } else if (ev.type === "transfer") {
      const d = auditTransfer(k, ev);
      rows.push({
        ...base, kind: "transfer", from: ev.from, to: ev.to, publicAmount: null,
        auditedAmount: d.channelsAgree ? d.amount : null,
        senderBalance: d.channelsAgree ? d.senderBalance : null,
      });
    } else if (ev.type === "withdraw") {
      const { senderBalance } = auditWithdraw(k, ev);
      rows.push({ ...base, kind: "withdraw", from: ev.from, to: ev.to, publicAmount: ev.amount, auditedAmount: ev.amount, senderBalance });
    }
  }
  return rows.reverse();
}
