"use client";

// Onglet Coffre (P2) : register / deposit / merge / confidential transfer / withdraw.
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

type Busy = null | { op: string; phase?: TxPhase };
// Whether the last tx shows its amount on-chain; undefined = no amount (register, merge).
type Visibility = "public" | "hidden";

interface HistoryRow {
  ev: ConfidentialEvent;
  amount: bigint | null; // what *I* can see
  hidden: boolean; // hidden on-chain?
}

export default function VaultPage() {
  const { lines, log } = useLog();
  const vaultRef = useRef<ConfidentialVault | null>(null);
  const [view, setView] = useState<VaultView | null>(null);
  const [pub, setPub] = useState<{ funded: boolean; xlm: string; usdc: string | null } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [lastTx, setLastTx] = useState<{ label: string; hash: string; amount?: Visibility } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [isolated, setIsolated] = useState(true);

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
    async (op: string, f: (onPhase: (p: TxPhase) => void) => Promise<{ hash: string } | void>, amount?: Visibility) => {
      setBusy({ op });
      try {
        const r = await f((phase) => setBusy({ op, phase }));
        if (r) setLastTx({ label: op, hash: r.hash, amount });
        await reload();
      } catch (e) {
        log(`${op} : ${e instanceof Error ? e.message : String(e)}`, true);
      } finally {
        setBusy(null);
      }
    },
    [log, reload],
  );

  const connect = () =>
    run("Connexion", async () => {
      vaultRef.current = await ConfidentialVault.connect(log);
    });

  const v = vaultRef.current;
  const connected = !!v && !!view;
  const usdcPublic = pub?.usdc ?? null;
  const label = (op: string) =>
    busy?.op === op ? (busy.phase === "proving" ? "Preuve" : busy.phase === "submitting" ? "Envoi" : "…") : null;

  return (
    <>
      <StarGate
        active={busy?.phase === "proving"}
        title={busy ? `${busy.op} · traversée` : ""}
        detail={busy?.op === "Transfert confidentiel" ? "le montant se chiffre dans ton navigateur" : undefined}
      />
      <header className="page-head has-film">
        <AmbientFilm name="vault" />
        <div>
          <span className="chapter">Chapitre I</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>Le coffre</h1>
          <p className="lede">
            Tes USDC passent du compte public au coffre confidentiel. Dans le coffre, les soldes et les montants
            transférés sont des engagements cryptographiques : illisibles on-chain, prouvés dans ton navigateur.
          </p>
        </div>
        <div className="monolith sm" aria-hidden />
      </header>

      {!isolated && (
        <p className="callout" style={{ marginBottom: 16 }}>
          Cette page n'est pas « cross-origin isolated » : la génération de preuves ne fonctionnera pas.
        </p>
      )}

      {!connected ? (
        <section className="panel stack">
          <h2 className="section">Ouvrir le sas</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Connecte Freighter (réseau <b>Testnet</b>). Ta clé confidentielle est dérivée d'une signature : tu
            signeras deux fois le même message, rien n'est envoyé au réseau.
          </p>
          <div className="row">
            <button className="btn primary" onClick={connect} disabled={!!busy}>
              {busy ? <span className="progress-dots">Connexion</span> : "Connecter Freighter"}
            </button>
            <a className="btn" href="https://www.freighter.app/" target="_blank" rel="noreferrer">
              Installer Freighter
            </a>
          </div>
        </section>
      ) : (
        <>
          <section className="grid cols-3">
            <div className="panel stat">
              <div className="label">Compte public <span className="tag public">visible</span></div>
              <div className="value">{usdcPublic ?? "—"}<small>USDC</small></div>
              <div className="note num">
                {pub?.funded ? `${Number(pub.xlm).toFixed(2)} XLM` : "compte non financé"} ·{" "}
                <a className="link" href={explorerAccount(v.address)} target="_blank" rel="noreferrer">{short(v.address)}</a>
              </div>
            </div>
            <div className="panel stat curve-card">
              <CurvePoint seed={1} />
              <div className="label">Coffre · disponible <span className="tag hidden">caché</span></div>
              <div className="value"><Decrypt text={formatUsdc(view.spendable)} /><small>USDC</small></div>
              <div className="note">Déchiffré dans ton navigateur. On-chain : ce point sur Grumpkin, y² = x³ − 17.</div>
            </div>
            <div className="panel stat curve-card">
              <CurvePoint seed={2} />
              <div className="label">Coffre · en réception <span className="tag hidden">caché</span></div>
              <div className="value"><Decrypt text={formatUsdc(view.receiving)} /><small>USDC</small></div>
              <div className="note">À fusionner pour le rendre dépensable.</div>
            </div>
          </section>

          {view.health !== "ok" && (
            <p className="callout" style={{ marginTop: 16 }}>
              État local {view.health === "diverged" ? "divergent de la chaîne" : "non vérifié"} — rafraîchis.
            </p>
          )}

          {lastTx && (
            <div className="panel row" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <span>
                {lastTx.amount && (
                  <>
                    <span className={`tag ${lastTx.amount}`}>
                      {lastTx.amount === "hidden" ? "montant caché" : "montant public"}
                    </span>{" "}
                  </>
                )}
                {lastTx.label} · transaction confirmée
              </span>
              <a className="link mono" href={explorerTx(lastTx.hash)} target="_blank" rel="noreferrer">
                {short(lastTx.hash, 8)} ↗ stellar.expert
              </a>
            </div>
          )}

          <div className="spacer" />

          {!pub?.funded || usdcPublic === null || Number(usdcPublic) < 1 ? (
            <section className="panel stack">
              <h2 className="section">0 · Préparer le compte public</h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Il faut des XLM (frais) et des USDC testnet. On achète des USDC au DEX testnet avec des XLM.
              </p>
              <div className="row">
                {!pub?.funded && (
                  <button className="btn" disabled={!!busy} onClick={() => run("Friendbot", async () => {
                    await friendbot(v.address); log("10 000 XLM testnet reçus");
                  })}>Recevoir des XLM</button>
                )}
                <button className="btn primary" disabled={!!busy || !pub?.funded} onClick={() => run("Achat USDC", async () => {
                  const hash = await buyTestUsdc(v.signer, "50");
                  log("50 USDC testnet achetés au DEX");
                  return { hash };
                }, "public")}>Obtenir 50 USDC testnet</button>
              </div>
            </section>
          ) : null}

          {!view.registered ? (
            <section className="panel stack" style={{ marginTop: 16 }}>
              <h2 className="section">1 · Ouvrir le compte confidentiel</h2>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Enregistre ta clé de visualisation sur le contrat, avec une preuve à divulgation nulle générée ici.
              </p>
              <div className="row">
                <button className="btn primary" disabled={!!busy} onClick={() => run("Ouverture", (p) => v.register(p))}>
                  {label("Ouverture") ? <span className="progress-dots">{label("Ouverture")}</span> : "Ouvrir le coffre"}
                </button>
              </div>
            </section>
          ) : (
            <>
            <section className="grid cols-2">
              <div className="panel stack">
                <h2 className="section">Déposer <span className="tag public">public</span></h2>
                <div className="op">
                  <div className="field">
                    <label htmlFor="dep">Montant (USDC)</label>
                    <input id="dep" className="input" inputMode="decimal" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
                  </div>
                  <button className="btn" disabled={!!busy} onClick={() => run("Dépôt", () => v.deposit(parseUsdc(depositAmt)), "public")}>
                    {label("Dépôt") ? <span className="progress-dots">Envoi</span> : "Déposer"}
                  </button>
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)", fontSize: 14 }}>En réception → disponible</span>
                  <button className="btn" disabled={!!busy || view.receiving === 0n} onClick={() => run("Fusion", () => v.merge())}>
                    {label("Fusion") ? <span className="progress-dots">Envoi</span> : "Fusionner"}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">Transfert confidentiel <span className="tag hidden">caché</span></h2>
                <div className="field">
                  <label htmlFor="to">Destinataire (compte confidentiel)</label>
                  <input id="to" className="input" list="recips" placeholder="G…" value={sendTo} onChange={(e) => setSendTo(e.target.value.trim())} />
                  <datalist id="recips">{recipients.map((r) => <option key={r} value={r} />)}</datalist>
                </div>
                <div className="op">
                  <div className="field">
                    <label htmlFor="amt">Montant (USDC)</label>
                    <input id="amt" className="input" inputMode="decimal" value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} />
                  </div>
                  <button className="btn primary" disabled={!!busy || !sendTo} onClick={() => run("Transfert confidentiel", (p) => v.transfer(sendTo, parseUsdc(sendAmt), p), "hidden")}>
                    {label("Transfert confidentiel") ? <span className="progress-dots">{label("Transfert confidentiel")}</span> : "Envoyer"}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">Retirer <span className="tag public">public</span></h2>
                <div className="op">
                  <div className="field">
                    <label htmlFor="wd">Montant (USDC)</label>
                    <input id="wd" className="input" inputMode="decimal" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
                  </div>
                  <button className="btn" disabled={!!busy} onClick={() => run("Retrait", (p) => v.withdraw(parseUsdc(withdrawAmt), p), "public")}>
                    {label("Retrait") ? <span className="progress-dots">{label("Retrait")}</span> : "Retirer"}
                  </button>
                </div>
              </div>

              <div className="panel stack">
                <h2 className="section">Contrat</h2>
                <p className="mono" style={{ margin: 0, fontSize: 13, overflowWrap: "anywhere" }}>
                  <a className="link" href={explorerAccount(CT.token)} target="_blank" rel="noreferrer">{CT.token}</a>
                </p>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                  Confidential Token OpenZeppelin (0.8.0) sur USDC. Sans admin : personne ne peut geler ni reprendre les fonds.
                </p>
                <button className="btn" disabled={!!busy} onClick={() => run("Rafraîchir", async () => { await reload(); })}>Rafraîchir</button>
              </div>
            </section>

            <FundAgentPanel
              disabled={!!busy}
              busyLabel={label("Approvisionnement de l'agent")}
              refreshKey={agentRefresh}
              onFund={(amt) =>
                run("Approvisionnement de l'agent", async (p) => {
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
              <h2 className="section">Journal de bord</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Opération</th><th>Ce que la chaîne montre</th><th>Ce que tu vois</th><th>Tx</th></tr>
                  </thead>
                  <tbody>
                    {history.map(({ ev, amount, hidden }) => (
                      <tr key={`${ev.txHash}-${ev.type}`}>
                        <td>{describe(ev, v.address)}</td>
                        <td>{hidden ? <span className="tag hidden">montant chiffré</span> : amount !== null ? <span className="num">{formatUsdc(amount)} USDC</span> : "—"}</td>
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
      <h2 className="section">Console</h2>
      <Terminal lines={lines} empty="En attente. Connecte Freighter pour commencer." />
    </>
  );
}

function describe(ev: ConfidentialEvent, me: string): string {
  switch (ev.type) {
    case "register": return "Ouverture du coffre";
    case "merge": return "Fusion";
    case "deposit": return "Dépôt public → coffre";
    case "withdraw": return ev.to === AGENT_SMART_ACCOUNT ? "Approvisionnement de l'agent (public)" : "Retrait coffre → public";
    case "transfer": return ev.from === me ? `Envoyé à ${short(ev.to)}` : `Reçu de ${short(ev.from)}`;
    default: return ev.type;
  }
}
