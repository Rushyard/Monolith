// Monolith's confidential USDC deployment (mirror of deployments/testnet.json).
import { Networks } from "@stellar/stellar-sdk";

export const CT = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  token: process.env.NEXT_PUBLIC_CT_CONTRACT_ID || "CB4T3MNGCLUNVM7A4LCMXSOFRCWA6OODNDLFNDHRUHSDAOLRLAUYJMDD",
  verifier: "CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ",
  auditor: "CBQZRK72Y6KJ5DR4CUHKLHMHIKBMOZNSYTWHRUQPEXA35PRCBMSPBZTW",
  underlying: process.env.NEXT_PUBLIC_USDC_SAC || "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  deployedAtLedger: 5380562,
  auditorId: 0,
  /**
   * ⚠️ Demo only: secret key of the SHARED auditor id 0, published on purpose by
   * brozorec/stellar-confidential-token-demo. Anyone can therefore decrypt
   * amounts on this token. A real auditor key never reaches a browser.
   */
  auditorSecretHex: "0x1165798bd0efb257cca0ac3d1d88bb549267d30a23fcb3c4e69eea4b7f872bc7",
} as const;
