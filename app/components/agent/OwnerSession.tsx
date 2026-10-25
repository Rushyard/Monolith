"use client";

// Session owner : « Se connecter en tant que Sarah avec Freighter » + badge de mode.
// Flux : GET /api/agent/challenge → Freighter signMessage (SEP-53) → POST /api/agent/session
// (cookie httpOnly 8 h). Sans session : mode démo, l'agent ne fait que simuler.
// À brancher par P2 dans la page agent : <OwnerSession onChange={(owner) => …} />.
import { useCallback, useEffect, useState } from "react";
import { getNetworkDetails, isConnected, requestAccess, signMessage } from "@stellar/freighter-api";
import { TESTNET_PASSPHRASE, short, type SessionStatus } from "./types";

const errMsg = (e: unknown) => (typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e));

/** Signature Freighter → base64 (v4 : déjà une chaîne base64 ; v3 : Buffer). */
function toBase64(sig: unknown): string | null {
  if (!sig) return null;
  if (typeof sig === "string") return sig;
  const bytes = sig instanceof Uint8Array ? sig : (sig as { data?: number[] }).data ? Uint8Array.from((sig as { data: number[] }).data) : null;
  return bytes ? btoa(String.fromCharCode(...bytes)) : null;
}

export function useOwnerSession() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/session", { cache: "no-store" });
      setStatus((await r.json()) as SessionStatus);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login() {
    setError(null);
    try {
      setBusy("Connexion à Freighter");
      const conn = await isConnected();
      if (conn.error || !conn.isConnected) return setError("Freighter n'est pas installé ou pas déverrouillé.");
      const access = await requestAccess();
      if (access.error) return setError(`Accès refusé : ${errMsg(access.error)}`);
      const challenge = await fetch("/api/agent/challenge", { cache: "no-store" });
      const c = (await challenge.json()) as { message?: string; token?: string; ownerAddress?: string; error?: string };
      if (!challenge.ok || !c.message || !c.token) return setError(c.error ?? `HTTP ${challenge.status}`);
      if (access.address !== c.ownerAddress) {
        return setError(`Compte actif ${short(access.address)} : seul l'owner ${short(c.ownerAddress!)} peut se connecter.`);
      }
      const net = await getNetworkDetails();
      if (net.error || net.networkPassphrase !== TESTNET_PASSPHRASE) return setError(`Passe Freighter sur Testnet (réseau actuel : ${net.network || "?"}).`);

      setBusy("Signature du défi");
      const signed = await signMessage(c.message, { networkPassphrase: TESTNET_PASSPHRASE, address: c.ownerAddress });
      const signature = toBase64(signed.signedMessage);
      if (signed.error || !signature) return setError(`Message non signé : ${errMsg(signed.error ?? "—")}`);

      setBusy("Vérification");
      const res = await fetch("/api/agent/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: c.message, token: c.token, signature }),
      });
      const body = (await res.json()) as SessionStatus & { error?: string };
      if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`);
      setStatus(body);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/agent/session", { method: "DELETE" });
    await refresh();
  }

  return { status, busy, error, login, logout };
}

export function OwnerSession({ onChange }: { onChange?: (owner: boolean) => void }) {
  const { status, busy, error, login, logout } = useOwnerSession();
  const owner = !!status?.owner;

  useEffect(() => {
    if (status) onChange?.(owner);
  }, [status, owner, onChange]);

  return (
    <div className="owner-session" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span className={`tag ${owner ? "ok" : "public"}`} title={owner ? "Les paiements de l'agent sont réels." : "L'agent simule : rien n'est envoyé sur le réseau."}>
        {owner ? `Owner connecté (${short(status!.ownerAddress)})` : "Mode démo (simulation)"}
      </span>
      {owner ? (
        <button className="btn" type="button" onClick={logout}>Se déconnecter</button>
      ) : status && !status.enabled ? (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Connexion owner désactivée sur ce déploiement.</span>
      ) : (
        <button className="btn" type="button" disabled={!!busy || !status} onClick={login}>
          {busy ? <span className="progress-dots">{busy}</span> : "Se connecter en tant que Sarah avec Freighter"}
        </button>
      )}
      {error && <span style={{ fontSize: 13, color: "var(--hal, #d0443e)" }}>{error}</span>}
    </div>
  );
}

export default OwnerSession;
