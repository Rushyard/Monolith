# Monolith

Ta trésorerie reste confidentielle. Ton agent ne peut dépenser que ce que le contrat lui autorise.

## Problem
## Solution
## What is public vs hidden on-chain
## Demo
## Architecture

Voir [`docs/architecture.md`](docs/architecture.md).

## How Stellar is used

## Setup / Install / Env vars / Run

```bash
cd app
cp ../.env.example .env.local   # puis remplir les valeurs
npm install
npm run dev
```

Variables : voir [`.env.example`](.env.example). `AGENT_SECRET_KEY` et `LLM_API_KEY` sont server-only.

Le wallet kit (`@creit-tech/stellar-wallets-kit`) est publié sur JSR, pas sur npm :
`npx jsr add @creit-tech/stellar-wallets-kit`.

Le pré-check côté serveur sert à l'affichage. La vraie barrière est la policy on-chain.

## Limitations (honest)
## Prior work & what we built during HackMeridian
## Team
