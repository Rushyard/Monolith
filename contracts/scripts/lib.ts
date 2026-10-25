// Couche Node des scripts contracts/ : keystore du Stellar CLI et fichier de déploiement.
// Toute la logique Stellar (auth du smart account, envoi, lectures) vit dans
// app/lib/agent/core.ts, partagé avec l'API Next.js. Prérequis : `npm install` dans app/.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Keypair } from "../../app/lib/agent/core.ts";

export * from "../../app/lib/agent/core.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const DEPLOYMENTS_FILE = join(here, "..", "deployments.testnet.json");

export type Deployments = {
  ozCommit: string;
  usdcSac: string;
  ed25519Verifier?: string;
  spendingLimitPolicy?: string;
  smartAccount?: string;
  ruleOwner?: number;
  ruleAgent?: number;
  [k: string]: unknown;
};

export function loadDeployments(): Deployments {
  if (!existsSync(DEPLOYMENTS_FILE)) throw new Error(`${DEPLOYMENTS_FILE} introuvable : lancer npm run deploy`);
  return JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf8"));
}

export function saveDeployments(d: Deployments) {
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(d, null, 2) + "\n");
}

/** Lance le Stellar CLI (doit être dans le PATH). */
export function stellar(args: string[]): string {
  return execFileSync("stellar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Lit une clé depuis le keystore du Stellar CLI. Le secret reste en mémoire, jamais sur disque. */
export function keypairFromCli(alias: string): Keypair {
  const envKey = process.env[`${alias.toUpperCase()}_SECRET_KEY`];
  return Keypair.fromSecret(envKey ?? stellar(["keys", "show", alias]));
}
