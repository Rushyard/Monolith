"use client";

// Auditor view (P2): Monolith's audit key reveals the amounts of confidential transfers.
// The key is never shipped in the app nor stored: it only lives in the page state.
import { useState } from "react";

import { CT, auditToken, explorerTx, formatUsdc, short, type AuditRow, type KeyStatus } from "@/lib/confidential";
import { HalEye, type HalMood } from "../fx/hal";
import { Cipher, Decrypt, TypeLine } from "../fx/scramble";
import { AmbientFilm } from "../fx/ambient-film";
import { useI18n } from "@/lib/i18n/react";
import { nameOf } from "@/lib/names";

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
  const mood: HalMood = status.key === "valid" ? "accept" : status.key === "invalid" ? "refuse" : "idle";
  const id = CT.auditorId;
  const halSays =
    status.key === "valid"
      ? t("aud.hal.valid", { id })
      : status.key === "invalid"
        ? t(status.attempt === "shared" ? "aud.hal.shared" : "aud.hal.unknown")
        : rows
          ? t("aud.hal.waiting", { n: rows.filter((r) => r.kind === "transfer").length, id })
          : t("aud.hal.hello");

  return (
    <>
      <header className="page-head has-film">
        <AmbientFilm name="auditor" />
        <div>
          <span className="chapter">{t("chapter.n", { n: "III" })}</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>{t("ch.auditor")}</h1>
          <p className="lede">{t("aud.lede")}</p>
        </div>
      </header>

      <section className="panel hal-console">
        <HalEye mood={mood} />
        <TypeLine text={halSays} className="hal-says" />
      </section>

      <section className="panel stack" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn" onClick={() => load()} disabled={loading}>
            {loading ? <span className="progress-dots">{t("aud.reading")}</span> : rows ? t("aud.reread") : t("aud.read")}
          </button>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {t("aud.meta", { t: short(CT.token, 6), r: short(CT.auditor, 6), id })}
          </span>
        </div>

        <div className="field">
          <label htmlFor="audit-key">{t("aud.keyLabel")}</label>
          <div className="row">
            <input
              id="audit-key"
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              style={{ flex: "1 1 220px", minWidth: 0 }}
            />
            <button className="btn primary" onClick={() => load(key, "ours")} disabled={loading || !key.trim()}>
              {t("aud.apply")}
            </button>
          </div>
        </div>

        <div className="row">
          <button
            className="btn"
            onClick={() => load(CT.sharedPublicAuditorSecretHex, "shared")}
            disabled={loading}
          >
            {t("aud.tryShared")}
          </button>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {t("aud.tryNote")}
          </span>
        </div>

        {status.key === "valid" && (
          <p className="callout info" style={{ margin: 0, fontSize: 14 }}>
            <span className="tag ok">{t("aud.validTag")}</span> {t("aud.validText", { id })}
          </p>
        )}
        {status.key === "invalid" && (
          <p className="callout" style={{ margin: 0, fontSize: 14 }}>
            <span className="tag hal">{t("aud.refusedTag")}</span>{" "}
            {t(status.attempt === "shared" ? "aud.refusedShared" : "aud.refusedOther")}
          </p>
        )}
        <p className="callout info" style={{ margin: 0, fontSize: 14 }}>
          {t("aud.info", { id })}
        </p>
        {error && <p className="callout" style={{ margin: 0 }}>{error}</p>}
      </section>

      {rows && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>{t("aud.th.op")}</th><th>{t("aud.th.onchain")}</th><th>{t("aud.th.audited")}</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--muted)" }}>{t("aud.empty")}</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={`${r.txHash}-${r.kind}`}>
                    <td>
                      {t(`kind.${r.kind}`)}
                      <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        {short(r.from)}{nameOf(r.from) ? ` (${nameOf(r.from)})` : null}
                        {" → "}
                        {short(r.to)}{nameOf(r.to) ? ` (${nameOf(r.to)})` : null} ·{" "}
                        <a className="link" href={explorerTx(r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash, 4)}</a>
                      </div>
                    </td>
                    <td>{r.publicAmount === null ? <span className="tag hidden">{t("tag.encrypted")}</span> : <span className="num">{formatUsdc(r.publicAmount)}</span>}</td>
                    <td className="num" style={{ color: r.kind === "transfer" && revealed ? "var(--hal)" : undefined }}>
                      {r.kind !== "transfer"
                        ? formatUsdc(r.auditedAmount ?? 0n)
                        : r.auditedAmount === null
                          ? status.key === "invalid"
                            ? <span className="illegible">{t("aud.illegible")} <Cipher width={6} live={false} /></span>
                            : <Cipher width={6} />
                          : <Decrypt text={formatUsdc(r.auditedAmount)} />}
                      {r.senderBalance !== null && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, whiteSpace: "normal" }}>
                          {t("aud.balanceAfter")} <Decrypt text={formatUsdc(r.senderBalance)} delay={350} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
