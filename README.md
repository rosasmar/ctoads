# CTOads

$CTO, a memecoin on NEAR. Built for NEAR Hackathon 2026.

Sell $CTO at a big enough loss and you mint a CTOad NFT. Once the last
CTOad is minted, every trading fee is split between CTOad holders and the
deployer's cut ends.

## Contracts

| Contract | Path | What it does |
|---|---|---|
| $CTO token | [`contracts/cto-token`](contracts/cto-token) | NEP-141 token that trades on its own bonding curve, tracks each wallet's cost basis, and mints CTOads for losing sells. |
| CTOad NFT | [`contracts/ctoad-nft`](contracts/ctoad-nft) | Capped NEP-171 collection. Only the token contract can mint. Holders claim fees here. |

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
  After that, every fee is split equally across all CTOads.
- **Claiming.** Fees belong to the CTOad, not the wallet, so unclaimed fees
  move with the NFT when it's sold.

## Methods

| Contract | Method | Notes |
|---|---|---|
| token | `buy({ min_tokens_out? })` | Attach the NEAR to spend. A first buy also pays for your storage. |
| token | `sell({ amount, min_near_out? })` | Attach exactly 1 yoctoNEAR and 100 Tgas. |
| token | `quote_buy` / `quote_sell` | Free previews, including whether a sell would earn a CTOad. |
| token | `retry_mint({ account_id })` | Finishes a failed mint. The CTOad still goes to the seller. |
| token | `withdraw_deployer_fees()` | Anyone can call it. It always pays the deployer. |
| NFT | `claim({ token_ids })` | Up to 50 CTOads you own. Attach about 100 Tgas. |

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

The NFT contract's only owner action is `set_base_uri`, which points the
images at hosted art.

## Build and test

Requires Rust with the `wasm32-unknown-unknown` target.

```sh
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
```

## Team

Marco and Jarren.
