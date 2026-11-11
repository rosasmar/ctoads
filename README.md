# CTOads

$CTO, a memecoin on NEAR. Built for NEAR Hackathon 2026.

Sell $CTO at a big enough loss and you mint a CTOad NFT. Once the last
CTOad is minted, the deployer's cut ends: trading fees go to CTOad holders
and to a treasury they vote on.

Every CTOad has its own NEAR account, and whoever holds the NFT controls it:
it collects the CTOad's fees, and it can call other contracts, such as buying
$CTO with those fees. Selling the CTOad hands over everything in its account.
Its image lives on-chain too, drawn from SVG layers stored in the NFT contract.

## Contracts

| Contract | Path | What it does |
|---|---|---|
| $CTO token | [`contracts/cto-token`](contracts/cto-token) | NEP-141 token that trades on its own bonding curve, tracks each wallet's cost basis, and mints CTOads for losing sells. |
| CTOad NFT | [`contracts/ctoad-nft`](contracts/ctoad-nft) | Capped NEP-171 collection. Only the token contract can mint. Holders claim fees and vote on the treasury here. Stores the art and builds each CTOad's image. |
| CTOad account | [`contracts/ctoad-account`](contracts/ctoad-account) | Small wallet contract every CTOad's account runs. It has no keys. Only the token contract can use it: to pay out fees, or to make a call for the CTOad's holder. |

## How it works

- **Trading.** $CTO is bought from and sold to the token contract on a
  constant-product curve (`x · y = k`). Every trade pays a fee in NEAR.
  Trades elsewhere (transfers, outside DEXes) pay no fee and can't mint.
- **Losses.** Each wallet's cost basis is the NEAR it spent on the $CTO
  it holds. On a sell, `loss = cost basis of the tokens sold − NEAR received`.
  Tokens received by transfer carry no cost basis, so they can't create a loss.
- **Minting.** A single sell that loses at least `loss_threshold` mints a
  CTOad, if any are left, the wallet has held for `min_hold_secs`, and
  `one_per_wallet` allows it. Losses from separate sells don't add up.
- **Takeover.** Until the last CTOad is confirmed, fees go to the deployer.
  After that, 10% of every fee goes to the treasury, and the rest is split
  equally across all CTOads.
- **Accounts.** When a CTOad is minted, the token creates its account,
  `ctoad-<id>.<token contract>`, running the account contract. The deposit
  comes out of the deployer's fees. If those are short, anyone can pay it
  with `create_ctoad_account`.
- **Claiming.** Holders call `claim` on the NFT contract. The CTOad's fees
  go into its account, and the account sends its whole balance to the
  holder. A CTOad without an account is paid directly. Fees belong to the
  CTOad, not the wallet, so unclaimed fees move with the NFT when it's sold.
- **Account calls.** The holder can make their CTOad's account call any
  contract with `ctoad_call` on the NFT contract, attaching NEAR from the
  account's balance. The NFT contract checks the holder at the moment of the
  call, so a past holder or an approved marketplace can't. The call passes
  through the token contract to the account, which can only make function
  calls: it can never get keys or new code. Fees reach the account through
  `sweep`.
- **Treasury.** The token contract holds the treasury's NEAR. Only the NFT
  contract can pay it out, and only for a proposal that passed.
- **Proposals.** Once every CTOad is minted, any holder can propose sending
  an amount from the treasury to an account. The proposer pays the
  proposal's storage (under 0.01 NEAR).
- **Voting.** Each CTOad has one vote per proposal, recorded by token ID, so
  a CTOad sold after voting can't vote again. A proposal passes as soon as
  yes votes reach 51% of all CTOads, and fails as soon as no votes do.
  Otherwise it's decided when the voting period ends: it passes if at least
  51% of the votes cast are yes and at least 10% of all CTOads voted.
- **Executing.** Anyone can call `execute` on a passed proposal, and the
  treasury sends the amount. If the treasury doesn't hold enough yet, the
  proposal stays passed and can be executed again later.
- **Art.** The NFT contract stores SVG layers in seven categories, from
  background to held item (see [`art/`](art)). The owner uploads them and can
  replace them until `freeze_art` locks the art for good.
- **Traits.** At mint, each CTOad gets one layer per category, picked at
  random. Each layer has a weight, 1 by default, so some traits can be made
  rarer. A category with no layers is skipped, so a mint never fails because
  of the art.
- **Images.** When a CTOad is read, the contract stacks its layers into one
  SVG and returns it in `media` as a `data:` URI, with the traits in
  `extra`. Nothing is hosted anywhere else. Meteor shows it in its NFT tab.
- **Randomness.** Traits use NEAR's block random seed, mixed with the token
  ID. That's enough for cartoon traits, but a validator could in theory
  influence it, so it isn't strong enough for rare traits worth real money.

## Methods

| Contract | Method | Notes |
|---|---|---|
| token | `buy({ min_tokens_out? })` | Attach the NEAR to spend. A first buy also pays for your storage. |
| token | `sell({ amount, min_near_out? })` | Attach exactly 1 yoctoNEAR and at least 100 Tgas. |
| token | `quote_buy` / `quote_sell` | Free previews, including whether a sell would earn a CTOad. |
| token | `retry_mint({ account_id })` | Finishes a failed mint. The CTOad still goes to the seller. |
| token | `withdraw_deployer_fees()` | Anyone can call it. It always pays the deployer. |
| token | `create_ctoad_account({ token_id })` | Opens a CTOad's account if the deployer's fees couldn't. Attach `ctoad_account_deposit`. |
| token | `sweep({ token_ids })` | Moves earned fees into up to 50 CTOad accounts. Anyone can call it. |
| token | `get_ctoad_account({ token_id })` | A CTOad's account name, state and fees not yet swept. |
| token | `ctoad_execute({ token_id, receiver_id, method_name, args, deposit, gas })` | Only the NFT contract can call it, from `ctoad_call`. |
| token | `treasury_payout({ receiver_id, amount })` | Only the NFT contract can call it, from `execute`. |
| NFT | `claim({ token_ids })` | Up to 20 CTOads you own. Attach 300 Tgas. |
| NFT | `ctoad_call({ token_id, receiver_id, method_name, args, deposit, gas })` | Holder only. Makes the CTOad's account call `method_name` on `receiver_id`. `args` is a string, usually JSON. `deposit` comes from the account. Attach 1 yoctoNEAR and `gas` plus about 15 Tgas. |
| NFT | `propose({ description, receiver_id, amount })` | Description up to 280 bytes. Attach 0.01 NEAR for storage; the rest is refunded. |
| NFT | `vote({ proposal_id, token_ids, approve })` | Up to 100 CTOads you own. Votes are final. |
| NFT | `execute({ proposal_id })` | Pays out a passed proposal. Anyone can call it. Attach 50 Tgas. |
| NFT | `get_proposal` / `get_proposals` / `has_voted` | Free views: votes, status (`Open`, `Passed`, `Failed`, `Executed`) and when voting ends. |
| NFT | `add_layer({ category, name, svg, weight? })` | Owner only, until the art is frozen. Attach NEAR for storage; the rest is refunded. |
| NFT | `replace_layer({ category, index, name, svg, weight? })` | Owner only, until the art is frozen. Every CTOad with that layer shows the new one. |
| NFT | `freeze_art()` | Owner only. Locks the art for good. Attach 1 yoctoNEAR. |
| NFT | `get_art` / `get_layer` / `ctoad_traits` / `ctoad_svg` | Free views: every layer's name and weight, one layer's SVG, a CTOad's traits and image. |

## Settings

Fixed when the token contract is initialized. There are no admin functions.

| Setting | Meaning |
|---|---|
| `owner_id` | Receives fees before the takeover |
| `ctoad_contract_id` | The CTOad NFT contract |
| `fee_bps` | Fee per trade, in basis points (100 = 1%, max 10%) |
| `loss_threshold` | Smallest loss, in yoctoNEAR, that earns a CTOad |
| `max_ctoads` | Number of CTOads. Must match `max_supply` on the NFT contract |
| `one_per_wallet` | If true, a wallet can earn at most one CTOad |
| `min_hold_secs` | How long after a wallet's last buy a loss can count |
| `ctoad_account_code_hash` | Code hash of the account contract, deployed as a global contract |
| `ctoad_account_deposit` | NEAR given to each new CTOad account for its storage |

The NFT contract's only setting is `voting_period_secs`, how long proposals
stay open (30 days by default). Its only owner actions are uploading and
replacing art layers, until `freeze_art` locks them. The 10% treasury
share and the voting rules are fixed in the code.

## Build and test

Requires Rust with the `wasm32-unknown-unknown` target.

```sh
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
```

## Deploy

[`scripts/deploy.sh`](scripts/deploy.sh) builds and deploys all three contracts
to testnet or mainnet, and uploads the art. `DEMO=1` deploys 3 CTOads with a 0.1 NEAR loss
threshold and 5-minute votes, so the whole lifecycle can be tried with a few
testnet NEAR. See
[DEPLOY.md](DEPLOY.md) for the tools, the settings and a step-by-step walkthrough.

## Web app

[`web-app`](web-app) is a Next.js frontend for the deployed contracts:
trade $CTO, see whether a sell earns a CTOad, the mint moment, a gallery
of every CTOad with its on-chain image and traits, each CTOad's page with
its backpack, claiming, and voting on the treasury. CTOad holders can also
sign up a phone number or a verified email for alerts and reach every other
signed-up holder by text from the app's number, through msgbubbles, or by
email, through Resend, without sharing their own contact details.
Alerts can carry an image, stored in S3, and OpenAI's moderation checks
each alert first. A
wallet signature proves they hold a CTOad, and anyone can remove their number
from a page linked in every alert.
Holders can also make a public profile at `ctoads.xyz/@handle`, with
their CTOads, a short bio and links, like a link-in-bio page.
They can link their phone and text the app's number to change it
(`SET X name`), or get a link that opens a buy or sell in their wallet
(`BUY 1`).
No NEAR yet? The trade page tops up from USDC, ETH, SOL or BTC on
other chains with NEAR Intents, then buys $CTO with it (mainnet only).
Sign-ups and profiles are stored in Supabase. See
[web-app/README.md](web-app/README.md).

## Team

Marco and Jarren.
