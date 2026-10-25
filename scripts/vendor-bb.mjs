/**
 * Copy @aztec/bb.js's browser build into app/public/vendor/bb/ (git-ignored).
 *
 * bb.js spawns its wasm Web Worker relative to `import.meta.url`; once webpack
 * bundles it into a hashed `_next` chunk that sibling file is missing and
 * proving hangs. Serving the intact `dest/browser/` at a stable path and
 * importing it as native ESM (app/lib/ct/bb-loader.ts) avoids that.
 *
 * Adapted from brozorec/stellar-confidential-token-demo scripts/vendor-bb.mjs (MIT).
 */
import { cp, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdkDir = realpathSync(resolve(here, "..", "packages", "ct-sdk"));
const { VERSIONS } = await import(join(sdkDir, "dist", "index.js"));

const readPkg = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

// Resolve bb.js through the SDK, which pins the version the verifier expects.
let dir = dirname(createRequire(join(sdkDir, "package.json")).resolve("@aztec/bb.js"));
while (!existsSync(join(dir, "package.json")) || readPkg(dir).name !== "@aztec/bb.js") {
  const parent = dirname(dir);
  if (parent === dir) throw new Error(`could not find @aztec/bb.js from ${sdkDir}`);
  dir = parent;
}
const { version } = readPkg(dir);
if (version !== VERSIONS.toolchain.bbJs) {
  throw new Error(`@aztec/bb.js ${version} resolved, but the SDK pins ${VERSIONS.toolchain.bbJs}`);
}

const src = join(dir, "dest", "browser");
const dest = resolve(here, "..", "app", "public", "vendor", "bb");
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`vendored @aztec/bb.js ${version} browser build → app/public/vendor/bb`);
