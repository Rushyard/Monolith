// Monolith's confidential USDC deployment (mirror of deployments/testnet.json).
import { Networks } from "@stellar/stellar-sdk";

export const CT = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  token: process.env.NEXT_PUBLIC_CT_CONTRACT_ID || "CAYYT5UWB22VLV4Z7DU7DN7V6XFPGIDP5ZD3HV4S6HVQMCGLI5CFLERJ",
  verifier: "CAN45PFA5CVUCU3JB77IE2JNWNTRCDWMRNG55U452L3N2IOCAGOLTUVQ",
  /** Monolith's own auditor registry (OZ registry wasm, our admin). See scripts/deploy-auditor.ts. */
  auditor: "CB5YIDSUCNESNOJK2UFFJA6E3O5BGAPYEQ6F353WGNM4UBGGX3H45IGQ",
  underlying: process.env.NEXT_PUBLIC_USDC_SAC || "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  deployedAtLedger: 5382322,
  /** Our auditor's id in our registry. Its secret never ships with the app. */
  auditorId: 1,
  /**
   * Secret of the SHARED registry's auditor id 0, published on purpose by
   * brozorec/stellar-confidential-token-demo. Kept only so the auditor page
   * can show that this public key opens nothing on our token.
   */
  sharedPublicAuditorSecretHex: "0x1165798bd0efb257cca0ac3d1d88bb549267d30a23fcb3c4e69eea4b7f872bc7",
} as const;
