// Coffre confidentiel (P2) : register / deposit / merge / confidential_transfer / withdraw.
// Preuves UltraHonk générées dans le navigateur. Implémentation dans lib/ct/.
export { ConfidentialVault, type VaultView, type TxPhase, type TxResult } from "./ct/wallet";
export { auditToken, type AuditRow, type KeyStatus } from "./ct/auditor";
export { publicBalances, buyTestUsdc, friendbot } from "./ct/public";
export { CT } from "./ct/deployment";
export * from "./ct/format";
