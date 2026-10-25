#!/usr/bin/env bash
# Déploiement du smart account OZ + règles + spending-limit policy sur testnet (P1).
# Voir MONOLITH.md §4. Chaque contract ID obtenu va immédiatement dans docs/architecture.md.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"

# 0. Pré-requis : stellar CLI >= 25.2, identités owner / agent / alice financées.
stellar --version
stellar network use "$NETWORK"

# 1. SAC USDC (émetteur Circle testnet)
: "${USDC_ISSUER:?USDC_ISSUER requis}"
USDC_SAC="$(stellar contract id asset --asset "USDC:${USDC_ISSUER}" --network "$NETWORK")"
echo "USDC_SAC=${USDC_SAC}"

# 2. TODO: déployer le smart account depuis les WASM audités d'OpenZeppelin/stellar-contracts
#    (owner = Delegated signer = compte Freighter).
# 3. TODO: déployer le vérificateur Ed25519 et ajouter l'agent comme signer externe.
# 4. TODO: déployer la spending-limit policy.
# 5. TODO: règles — A : owner, sans policy · B : CallContract(USDC SAC), signer agent, policy spending_limit.
# 6. TODO: approvisionner le smart account en USDC.

echo "TODO: compléter les étapes 2 à 6" >&2
exit 1
