# PasadaFund - Stellar Route Resilience Protocol

PasadaFund is a custom-built Soroban protocol focused on transparent route continuity support for Jeepney and Tricycle transport groups. It combines a real XLM on-chain reserve pool with member governance and a production-grade frontend integration.

## Vision
Build a trustworthy public-good reserve protocol where transport support decisions are transparent, auditable, and community-governed directly on Stellar.

## Full-Stack Scope (One Repository)
- `contracts/pasadafund`: Soroban smart contract (Rust)
- `frontend`: React + Vite dashboard with Freighter + Stellar SDK integration

## Core Features
- Real reserve-pool transfers using `soroban_sdk::token::Client` against native XLM SAC
- Contributor-to-member governance model
- Route support proposal submission and on-chain voting
- Approval threshold at 2 votes
- On-chain execution that transfers reserve-pool funds to recipient wallets
- Frontend stroop-safe math with `BigInt` and 7-decimal precision
- Static simulation account for stability in `simulateTransaction`
- Dual RPC fallback for high-availability interaction
- Premium dashboard UX with glassmorphism, transaction log, and confetti success feedback
- On-chain event feed merged with local transaction activity

## Deployed Contract Details (Testnet)
- Contract ID: `CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ`
- Admin Address: `GCOLFCAVXCQ6PEVYVFI64WKVDBELGPDROK76L5QQCA3AWHTNPRDSKEWB`
- Native XLM SAC (testnet): `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- Explorer: https://stellar.expert/explorer/testnet/contract/CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ
- Lab link: https://lab.stellar.org/r/testnet/contract/CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ

## Transaction Proofs (Deployment + Init)
- Upload WASM tx: https://stellar.expert/explorer/testnet/tx/8fbe62156798d88d13854f1f57ed5e70a7a53cc6ce3658a2e7c907d8a24c07a0
- Deploy contract tx: https://stellar.expert/explorer/testnet/tx/968f1e158eb81166ceef51091f44badf60c2998dcec306e9bbfbf570ed7c44dd
- Init contract tx: https://stellar.expert/explorer/testnet/tx/71461bfdbd6d8bda5fb7b6c2b8aaef8951869253b0f037aff98a4f379c5fcd91

## Local Development
### 1. Smart Contract
~~~bash
cd contracts/pasadafund
cargo check
cargo test
stellar contract build
~~~

### 2. Frontend
~~~bash
cd frontend
cp .env.example .env
npm install
npm run dev
~~~

## Frontend Environment
Use these values in `frontend/.env`:
- `VITE_PASADAFUND_CONTRACT_ID`
- `VITE_NATIVE_XLM_CONTRACT_ID`
- `VITE_STELLAR_NETWORK_PASSPHRASE`
- `VITE_STELLAR_RPC_PRIMARY`
- `VITE_STELLAR_RPC_SECONDARY`

## Vercel Deployment
This repository is configured for root-level Vercel deployment via `vercel.json`:
- Install command: `npm --prefix frontend install`
- Build command: `npm --prefix frontend run build`
- Output directory: `frontend/dist`

Set the following environment variables in your Vercel project settings:
- `VITE_PASADAFUND_CONTRACT_ID`
- `VITE_NATIVE_XLM_CONTRACT_ID`
- `VITE_STELLAR_NETWORK_PASSPHRASE`
- `VITE_STELLAR_RPC_PRIMARY`
- `VITE_STELLAR_RPC_SECONDARY`

## Build Validation
~~~bash
cd contracts/pasadafund && cargo test
cd ../../frontend && npm run build
~~~

## RiseIn Submission Fields
- GitHub Repository: this repository URL
- Contract ID: `CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ`
- Stellar Expert Link: https://stellar.expert/explorer/testnet/contract/CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ
- Short Description: PasadaFund is a route resilience protocol on Stellar where contributors fund a reserve pool, governance members vote on transport operations support requests, and approved disbursements execute transparently on-chain.

## Screenshots
- UI and explorer screenshots should be stored in `docs/screenshots/` for final submission.
