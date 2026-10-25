// Point the SDK's prover at bb.js loaded as native ESM from /vendor/bb
// (copied there by scripts/vendor-bb.mjs). See next.config.ts for why bb.js is
// never bundled. Adapted from brozorec/stellar-confidential-token-demo (MIT).
import { setUltraHonkBackendLoader } from "stellar-confidential-token-sdk";

const BB_URL = "/vendor/bb/index.js";
let registered = false;

export function ensureBrowserBackend(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;
  setUltraHonkBackendLoader(async () => {
    // `new Function` keeps webpack from seeing (and rewriting) this import().
    const nativeImport = new Function("url", "return import(url)") as (
      url: string,
    ) => Promise<Record<string, unknown>>;
    const mod = await nativeImport(BB_URL);
    return mod.UltraHonkBackend as never;
  });
}
