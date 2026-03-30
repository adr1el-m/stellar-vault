# PasadaFund Route Resilience Contract

## Project Title
PasadaFund - Stellar Route Resilience Protocol Contract

## Description
This Soroban smart contract powers PasadaFund's on-chain reserve governance. It allows contributors to fund a real XLM reserve pool, become governance members, vote on route support proposals, and execute approved disbursements directly to recipient wallets.

## Vision
Enable accountable and transparent route continuity support for transport workers using programmable public infrastructure on Stellar.

## Features
- Real native token transfers through `soroban_sdk::token::Client`
- Contribution tracking and member enrollment
- Route support proposal creation
- Member voting with on-chain threshold approval (2 votes)
- Authorized execution flow (admin or member)
- On-chain event emission for contribution, request, vote, and execution

## Public Methods
- `init(admin, native_token)`
- `contribute(from, amount_stroops)`
- `submit_request(proposer, recipient, amount_stroops, title, details)`
- `vote(voter, proposal_id)`
- `execute(caller, proposal_id)`
- `treasury_balance()` (serves as current reserve pool balance getter)
- `get_members()`
- `get_member_contribution(member)`
- `get_proposal(proposal_id)`
- `proposal_count()`
- `vote_threshold()`

## Tests
The suite includes 3 functional tests:
1. Contribution updates reserve pool and adds member
2. Two-member voting reaches approval threshold
3. Execution transfers funds and marks proposal executed

Run tests:
~~~bash
cd contracts/pasadafund
cargo test
~~~

## Build
~~~bash
cd contracts/pasadafund
stellar contract build
~~~

## Deployed Contract Details (Testnet)
- Contract ID: `CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ`
- Explorer URL: https://stellar.expert/explorer/testnet/contract/CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ
- Native XLM SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

## Contract Explorer Screenshot
Add your screenshot file under `../../docs/screenshots/contract-testnet.png` and reference it in the root README before final submission.
