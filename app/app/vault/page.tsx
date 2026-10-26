"use client";

// Vault tab (P2): register / deposit / merge / confidential transfer / withdraw.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfidentialEvent } from "stellar-confidential-token-sdk";

import {
  CT,
  ConfidentialVault,
  buyTestUsdc,
  explorerAccount,
  explorerTx,
  formatUsdc,
  friendbot,
  parseUsdc,
  publicBalances,
  short,
  type TxPhase,
  type VaultView,
} from "@/lib/confidential";
import { Terminal, useLog } from "../terminal";
import { StarGate } from "../fx/stargate";
import { CurvePoint } from "../fx/curve-point";
import { Decrypt } from "../fx/scramble";
import { AmbientFilm } from "../fx/ambient-film";
import { AGENT_SMART_ACCOUNT, FundAgentPanel } from "@/components/agent/FundAgentPanel";
import { useI18n } from "@/lib/i18n/react";
import type { Key } from "@/lib/i18n";
import { nameOf } from "@/lib/names";

type Op = "connect" | "friendbot" | "buy" | "register" | "deposit" | "merge" | "transfer" | "withdraw" | "refresh" | "fund";
type Busy = null | { op: Op; phase?: TxPhase };
// Whether the last tx shows its amount on-chain; undefined = no amount (register, merge).
type Visibility = "public" | "hidden";

interface HistoryRow {
  ev: ConfidentialEvent;
  amount: bigint | null; // what *I* can see
  hidden: boolean; // hidden on-chain?
}

export default function VaultPage() {
  const { t } = useI18n();
  const opName = (op: Op) => t(`op.${op}` as Key);
  const { lines, log } = useLog();
  const vaultRef = useRef<ConfidentialVault | null>(null);
  const [view, setView] = useState<VaultView | null>(null);
  const [pub, setPub] = useState<{ funded: boolean; xlm: string; usdc: string | null } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [lastTx, setLastTx] = useState<{ op: Op; hash: string; amount?: Visibility } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [isolated, setIsolated] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [depositAmt, setDepositAmt] = useState("10");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("2.5");
  const [withdrawAmt, setWithdrawAmt] = useState("1");
  const [agentRefresh, setAgentRefresh] = useState(0);

  useEffect(() => setIsolated(window.crossOriginIsolated), []);

  const reload = useCallback(async () => {
    const v = vaultRef.current;
    if (!v) return;
    const [vv, pb, events, recips] = await Promise.all([
      v.refresh(),
      publicBalances(v.address),
      v.events(),
      v.recipients(),
    ]);
    setView(vv);
    setPub(pb);
    setRecipients(recips);
    const mine = events.filter((e) =>
      e.type === "deposit" || e.type === "withdraw" || e.type === "transfer"
        ? e.from === v.address || e.to === v.address
        : e.type === "register" || e.type === "merge"
          ? e.account === v.address
          : false,
    );
    const rows: HistoryRow[] = [];
    for (const ev of mine.reverse()) {
      if (ev.type === "transfer") rows.push({ ev, amount: await v.transferAmount(ev), hidden: true });
      else if (ev.type === "deposit" || ev.type === "withdraw") rows.push({ ev, amount: ev.amount, hidden: false });
      else rows.push({ ev, amount: null, hidden: false });
    }
    setHistory(rows);
  }, []);

  const run = useCallback(
    async (op: Op, f: (onPhase: (p: TxPhase) => void) => Promise<{ hash: string } | void>, amount?: Visibility) => {
      setBusy({ op });
      setError(null);
      try {
        const r = await f((phase) => setBusy({ op, phase }));
        if (r) setLastTx({ op, hash: r.hash, amount });
        await reload();
      } catch (e) {
        const message = `${opName(op)}: ${e instanceof Error ? e.message : String(e)}`;
        setError(message);
        log(message, true);
      } finally {
        setBusy(null);
      }
    },
    [log, reload, t], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const connect = () =>
    run("connect", async () => {
      vaultRef.current = await ConfidentialVault.connect(log);
    });

  const v = vaultRef.current;
  const connected = !!v && !!view;
  const usdcPublic = pub?.usdc ?? null;
  const label = (op: Op) =>
    busy?.op === op ? (busy.phase === "proving" ? t("busy.proof") : busy.phase === "submitting" ? t("busy.sending") : "…") : null;

  return (
    <>
      <StarGate
        active={busy?.phase === "proving"}
        title={busy ? t("sg.crossing", { op: opName(busy.op) }) : ""}
        detail={busy?.op === "transfer" ? t("sg.encrypting") : undefined}
      />
      <header className="page-head has-film">
        <AmbientFilm name="vault" />
        <div>
          <span className="chapter">{t("chapter.n", { n: "I" })}</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>{t("ch.vault")}</h1>
          <p className="lede">{t("vault.lede")}</p>
        </div>
        <div className="monolith sm" aria-hidden />
      </header>

      {error && <p className="callout" role="alert">{error}</p>}

      {!isolated && (
        <p className="callout" style={{ marginBottom: 16 }}>
          {t("vault.notIsolated")}
        </p>
      )}

      {!connected ? (
        <section className="panel stack">
          <h2 className="section">{t("vault.airlock")}</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>{t("vault.connectHelp")}</p>
          <div className="row">
            <button className="btn primary" onClick={connect} disabled={!!busy}>
              {busy ? <span className="progress-dots">{t("vault.connecting")}</span> : t("vault.connectBtn")}
            </button>
            <a className="btn" href="https://www.freighter.app/" target="_blank" rel="noreferrer">
              {t("vault.install")}
            </a>
          </div>
        </section>
      ) : (
        <>
          <section className="grid cols-3">
            <div className="panel stat">
              <div className="label">{t("vault.public")} <span className="tag public">{t("tag.visible")}</span></div>
              <div className="value">{usdcPublic ?? "—"}<small>USDC</small></div>
              <div className="note num">
                {pub?.funded ? `${Number(pub.xlm).toFixed(2)} XLM` : t("vault.unfunded")} ·{" "}
                <a className="link" href={explorerAccount(v.address)} target="_blank" rel="noreferrer">{short(v.address)}</a>
                {nameOf(v.address) ? ` (${nameOf(v.address)})` : null}
              </div>
            </div>
            <div className="panel stat curve-card">
              <CurvePoint seed={1} />
              <div className="label">{t("vault.spendable")} <span className="tag hidden">{t("tag.hidden")}</span></div>
              <div className="value"><Decrypt text={formatUsdc(view.spendable)} /><small>USDC</small></div>
              <div className="note">{t("vault.spendableNote")}</div>
            </div>
            <div className="panel stat curve-card">
              <CurvePoint seed={2} />
              <div className="label">{t("vault.receiving")} <span className="tag hidden">{t("tag.hidden")}</span></div>
              <div className="value"><Decrypt text={formatUsdc(view.receiving)} /><small>USDC</small></div>
              <div className="note">{t("vault.receivingNote")}</div>
            </div>
          </section>

          {view.health !== "ok" && (
            <p className="callout" style={{ marginTop: 16 }}>
              {t(view.health === "diverged" ? "vault.diverged" : "vault.unverified")}
            </p>
          )}

          {lastTx && (
            <div className="panel row" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <span>
                {lastTx.amount && (
                  <>
                    <span className={`tag ${lastTx.amount}`}>
                      {lastTx.amount === "hidden" ? t("vault.amountHidden") : t("vault.amountPublic")}
                    </span>{" "}
                  </>
                )}
                {t("vault.confirmed", { op: opName(lastTx.op) })}
              </span>
              <a className="link mono" href={explorerTx(lastTx.hash)} target="_blank" rel="noreferrer">
                {short(lastTx.hash, 8)} ↗ stellar.expert
              </a>
            </div>
          )}

          <div className="spacer" />

          {!pub?.funded || usdcPublic === null || Number(usdcPublic) < 1 ? (
            <section className="panel stack">
              <h2 className="section">{t("vault.step0")}</h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>{t("vault.step0Help")}</p>
              <div className="row">
                {!pub?.funded && (
                  <button className="btn" disabled={!!busy} onClick={() => run("friendbot", async () => {
                    await friendbot(v.address); log(t("log.xlm"));
                  })}>{t("vault.getXlm")}</button>
                )}
                <button className="btn primary" disabled={!!busy || !pub?.funded} onClick={() => run("buy", async () => {
                  const hash = await buyTestUsdc(v.signer, "50");
                  log(t("log.bought"));
                  return { hash };
                }, "public")}>{t("vault.get50")}</button>
              </div>
            </section>
          ) : null}

          {!view.registered ? (
            <section className="panel stack" style={{ marginTop: 16 }}>
              <h2 className="section">{t("vault.step1")}</h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>{t("vault.step1Help")}</p>
              <div className="row">
                <button className="btn primary" disabled={!!busy} onClick={() => run("register", (p) => v.register(p))}>
                  {label("register") ? <span className="progress-dots">{label("register")}</span> : t("vault.openBtn")}
                </button>
              </div>
            </section>
          ) : (
            <>
            <section className="grid cols-2">
              <div className="panel stack">
                <h2 className="section">{t("vault.deposit")} <span className="tag public">{t("tag.public")}</span></h2>
                <div className="op">
                  <div className="field">
                    <label htmlFor="dep">{t("vault.amount")}</label>
                    <input id="dep" className="input" inputMode="decimal" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
                  </div>
                  <button className="btn" disabled={!!busy} onClick={() => run("deposit", () => v.deposit(parseUsdc(depositAmt)), "public")}>
                    {label("deposit") ? <span className="progress-dots">{t("busy.sending")}</span> : t("vault.deposit")}
                  </button>
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)", fontSize: 14 }}>{t("vault.incomingToSpendable")}</span>
                  <button className="btn" disabled={!!busy || view.receiving === 0n} onClick={() => run("merge", () => v.merge())}>
                    {label("merge") ? <span className="progress-dots">{t("busy.sending")}</span> : t("vault.mergeBtn")}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">{t("op.transfer")} <span className="tag hidden">{t("tag.hidden")}</span></h2>
                <div className="field">
                  <label htmlFor="to">{t("vault.recipient")}{nameOf(sendTo) ? ` · ${nameOf(sendTo)}` : null}</label>
                  <input id="to" className="input" list="recips" placeholder="G…" value={sendTo} onChange={(e) => setSendTo(e.target.value.trim())} />
                  <datalist id="recips">{recipients.map((r) => <option key={r} value={r} label={nameOf(r)} />)}</datalist>
                </div>
                <div className="op">
                  <div className="field">
                    <label htmlFor="amt">{t("vault.amount")}</label>
                    <input id="amt" className="input" inputMode="decimal" value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} />
                  </div>
                  <button className="btn primary" disabled={!!busy || !sendTo} onClick={() => run("transfer", (p) => v.transfer(sendTo, parseUsdc(sendAmt), p), "hidden")}>
                    {label("transfer") ? <span className="progress-dots">{label("transfer")}</span> : t("vault.send")}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">{t("vault.withdraw")} <span className="tag public">{t("tag.public")}</span></h2>
                <div className="op">
                  <div className="field">
                    <label htmlFor="wd">{t("vault.amount")}</label>
                    <input id="wd" className="input" inputMode="decimal" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
                  </div>
                  <button className="btn" disabled={!!busy} onClick={() => run("withdraw", (p) => v.withdraw(parseUsdc(withdrawAmt), p), "public")}>
                    {label("withdraw") ? <span className="progress-dots">{label("withdraw")}</span> : t("vault.withdraw")}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">{t("vault.contract")}</h2>
                <p className="mono" style={{ margin: 0, fontSize: 13, overflowWrap: "anywhere" }}>
                  <a className="link" href={explorerAccount(CT.token)} target="_blank" rel="noreferrer">{CT.token}</a>
                </p>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("vault.contractNote")}</p>
                <button className="btn" disabled={!!busy} onClick={() => run("refresh", async () => { await reload(); })}>{t("vault.refresh")}</button>
              </div>
            </section>

            <FundAgentPanel
              disabled={!!busy}
              busyLabel={label("fund")}
              refreshKey={agentRefresh}
              onFund={(amt) =>
                run("fund", async (p) => {
                  const r = await v.withdraw(parseUsdc(amt), p, AGENT_SMART_ACCOUNT);
                  setAgentRefresh((k) => k + 1);
                  return r;
                }, "public")
              }
            />
            </>
          )}

          {history.length > 0 && (
            <section className="panel" style={{ marginTop: 16 }}>
              <h2 className="section">{t("vault.logbook")}</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>{t("vault.th.op")}</th><th>{t("vault.th.chain")}</th><th>{t("vault.th.you")}</th><th>Tx</th></tr>
                  </thead>
                  <tbody>
                    {history.map(({ ev, amount, hidden }) => (
                      <tr key={`${ev.txHash}-${ev.type}`}>
                        <td>{describe(ev, v.address, t)}</td>
                        <td>{hidden ? <span className="tag hidden">{t("tag.encryptedAmount")}</span> : amount !== null ? <span className="num">{formatUsdc(amount)} USDC</span> : "—"}</td>
                        <td className="num">{amount !== null ? `${formatUsdc(amount)} USDC` : "—"}</td>
                        <td><a className="link mono" href={explorerTx(ev.txHash)} target="_blank" rel="noreferrer">{short(ev.txHash, 5)}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <div className="spacer" />
      <h2 className="section">{t("vault.console")}</h2>
      <Terminal lines={lines} empty={t("vault.consoleEmpty")} />
    </>
  );
}

function describe(ev: ConfidentialEvent, me: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (ev.type) {
    case "register": return t("ev.register");
    case "merge": return t("ev.merge");
    case "deposit": return t("ev.deposit");
    case "withdraw": return t(ev.to === AGENT_SMART_ACCOUNT ? "ev.fund" : "ev.withdraw");
    case "transfer": {
      const addr = ev.from === me ? ev.to : ev.from;
      const name = nameOf(addr);
      const who = `${short(addr)}${name ? ` (${name})` : ""}`;
      return t(ev.from === me ? "ev.sent" : "ev.received", { who });
    }
    default: return ev.type;
  }
}
