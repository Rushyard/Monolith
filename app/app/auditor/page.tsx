"use client";

// Auditor view (P2): Monolith's audit key reveals the amounts of confidential transfers.
// The key is never shipped in the app nor stored: it only lives in the page state.
import { useState } from "react";
import Image from "next/image";

import { CT, auditToken, explorerTx, formatUsdc, short, type AuditRow, type KeyStatus } from "@/lib/confidential";
import { Cipher, Decrypt, TypeLine } from "../fx/scramble";
import { AmbientFilm } from "../fx/ambient-film";
import { useI18n } from "@/lib/i18n/react";
import { nameOf } from "@/lib/names";

import "./auditor.css";

type Attempt = "ours" | "shared";

export default function AuditorPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ key: KeyStatus; attempt?: Attempt }>({ key: "none" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(secretHex = "", attempt?: Attempt) {
    setLoading(true);
    setError(null);
    try {
      const r = await auditToken(secretHex);
      setRows(r.rows);
      setStatus({ key: r.key, attempt });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const revealed = status.key === "valid";
  const id = CT.auditorId;
  const auditSays =
    status.key === "valid"
      ? t("aud.hal.valid", { id })
      : status.key === "invalid"
        ? t(status.attempt === "shared" ? "aud.hal.shared" : "aud.hal.unknown")
        : rows
          ? t("aud.hal.waiting", { n: rows.filter((r) => r.kind === "transfer").length, id })
          : t("aud.hal.hello");

  const transfers = rows ? rows.filter((r) => r.kind === "transfer").length : 0;

  return (
    <div className="auditor-page">
      <div className="aud-stage">
        <aside className="aud-artifact" data-state={status.key}>
          <div className="aud-artwork" aria-hidden="true">
            <Image src="/artwork/auditor-prism.webp" alt="" width={1200} height={900} sizes="(min-width: 960px) 42vw, 90vw" className="aud-prism" />
          </div>
          <TypeLine text={auditSays} className="aud-status" />
        </aside>

        <header className="page-head has-film aud-head">
          <AmbientFilm name="auditor" />
          <div>
            <span className="chapter">{t("chapter.n", { n: "III" })}</span>
            <h1 className="intertitle">{t("ch.auditor")}</h1>
            <p className="lede">{t("aud.lede")}</p>
            <p className="aud-scope">{t("aud.p2.scope")}</p>
          </div>
        </header>

        <section className="aud-steps">
          <ol className="aud-seq">
            <li className="aud-step">
              <button className={`btn ${rows ? "" : "primary"}`} onClick={() => load()} disabled={loading}>
                {loading ? <span className="progress-dots">{t("aud.reading")}</span> : rows ? t("aud.reread") : t("aud.read")}
              </button>
              <p className="aud-hint">{t("aud.p2.readHint")}</p>
            </li>

            <li className="aud-step">
              <div className="field">
                <label htmlFor="audit-key">{t("aud.keyLabel")}</label>
                <div className="aud-keyrow">
                  <input
                    id="audit-key"
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0x…"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                  <button className="btn primary" onClick={() => load(key, "ours")} disabled={loading || !key.trim()}>
                    {t("aud.apply")}
                  </button>
                </div>
              </div>
              <p className="aud-hint">{t("aud.p2.keyHint")}</p>
            </li>

            <li className="aud-step">
              <button
                className="btn quiet"
                onClick={() => load(CT.sharedPublicAuditorSecretHex, "shared")}
                disabled={loading}
              >
                {t("aud.tryShared")}
              </button>
              <p className="aud-hint">{t("aud.tryNote")}</p>
            </li>
          </ol>

          <div className="aud-notes" aria-live="polite">
            {status.key === "valid" && (
              <p className="aud-note ok">
                <span className="tag ok">{t("aud.validTag")}</span> {t("aud.validText", { id })}
              </p>
            )}
            {status.key === "invalid" && (
              <p className="aud-note refused">
                <span className="tag hal">{t("aud.refusedTag")}</span>{" "}
                {t(status.attempt === "shared" ? "aud.refusedShared" : "aud.refusedOther")}
              </p>
            )}
            {error && <p className="aud-note refused" role="alert">{error}</p>}
          </div>

          <p className="aud-info">{t("aud.info", { id })}</p>
          <dl className="aud-refs">
            <div><dt>{t("aud.p2.token")}</dt><dd className="mono">{short(CT.token, 6)}</dd></div>
            <div><dt>{t("aud.p2.registry")}</dt><dd className="mono">{short(CT.auditor, 6)}</dd></div>
            <div><dt>{t("aud.p2.auditor")}</dt><dd className="mono">#{id}</dd></div>
          </dl>
        </section>
      </div>

      {rows && (
        <section className={`aud-ledger${revealed ? " is-revealed" : ""}${status.key === "invalid" ? " is-refused" : ""}`}>
          <div className="aud-ledger-head">
            <h2>{t("aud.p2.ledger")}</h2>
            <p>{t("aud.p2.ledgerCount", { n: rows.length, k: transfers })}</p>
          </div>
          <div className="aud-cols">
            <div><strong>{t("aud.th.onchain")}</strong><span>{t("aud.p2.colPublic")}</span></div>
            <div><strong>{t("aud.th.audited")}</strong><span>{t("aud.p2.colKey")}</span></div>
          </div>
          {rows.length === 0 && <p className="aud-empty">{t("aud.empty")}</p>}
          <ol className="aud-ops">
            {rows.map((r) => (
              <li className="aud-op" key={`${r.txHash}-${r.kind}`}>
                <div className="aud-pub">
                  <p className="aud-kind">{t(`kind.${r.kind}`)}</p>
                  <p className="aud-route">
                    <span className="aud-party">
                      <span className="mono">{short(r.from)}</span>
                      {nameOf(r.from) ? <b>{nameOf(r.from)}</b> : null}
                    </span>
                    <span className="aud-to" role="img" aria-label={t("aud.p2.to")}>{"→"}</span>
                    <span className="aud-party">
                      <span className="mono">{short(r.to)}</span>
                      {nameOf(r.to) ? <b>{nameOf(r.to)}</b> : null}
                    </span>
                  </p>
                  <p className="aud-meta">
                    {r.publicAmount === null
                      ? <span className="tag hidden">{t("tag.encrypted")}</span>
                      : <span className="num">{formatUsdc(r.publicAmount)}</span>}
                    <a className="link mono" href={explorerTx(r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash, 4)}</a>
                  </p>
                </div>
                <div className="aud-key">
                  <p className="aud-cell-label">{t("aud.th.audited")}</p>
                  <p className="aud-amount num">
                    {r.kind !== "transfer"
                      ? formatUsdc(r.auditedAmount ?? 0n)
                      : r.auditedAmount === null
                        ? status.key === "invalid"
                          ? <span className="illegible">{t("aud.illegible")} <Cipher width={6} live={false} /></span>
                          : <Cipher width={6} />
                        : <Decrypt text={formatUsdc(r.auditedAmount)} />}
                  </p>
                  {r.senderBalance !== null && (
                    <p className="aud-balance">
                      {t("aud.balanceAfter")} <span className="num"><Decrypt text={formatUsdc(r.senderBalance)} delay={350} /></span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
