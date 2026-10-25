import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // x402 : @x402/stellar dépend de @stellar/stellar-sdk ^16 (copie imbriquée dans
  // node_modules/@x402/stellar/node_modules), l'app est en v17. On laisse Node résoudre ces
  // paquets au runtime au lieu de les bundler : chaque paquet garde sa propre copie du SDK.
  serverExternalPackages: ["@x402/stellar", "@x402/core", "@x402/fetch"],
};

export default nextConfig;
