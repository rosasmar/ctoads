# Deployment guide

This guide deploys $CTO, the CTOad NFT contract and the CTOad account wallet to NEAR testnet, then walks through the full lifecycle: buy, sell at a loss, mint a CTOad with its on-chain image, take over, claim, vote on the treasury, and make a CTOad's account buy $CTO. Mainnet uses the same steps (see [Mainnet](#mainnet)).

## What gets deployed

| Account | What it is | Example on testnet |
|---|---|---|
| `<you>` | Deployer. Pays for setup, and receives every fee until all CTOads are minted (`owner_id`). | `alice.testnet` |
| `cto.<you>` | $CTO token contract. Also the parent of every CTOad account. | `cto.alice.testnet` |
| `ctoads.<you>` | CTOad NFT contract | `ctoads.alice.testnet` |
| `ctoad-<id>.cto.<you>` | One account per CTOad, created automatically when it's minted | `ctoad-42.cto.alice.testnet` |
| Global contract | The CTOad account wallet code, deployed once and referenced by its hash | |

## 1. Install the tools

| Tool | Why | Install |
|---|---|---|
| Rust + `wasm32-unknown-unknown` | Builds the contracts | [rustup.rs](https://rustup.rs), then `rustup target add wasm32-unknown-unknown` |
| [`cargo-near`](https://github.com/near/cargo-near) | Builds deployable wasm | `cargo install cargo-near --locked` |
| [`near-cli-rs`](https://github.com/near/near-cli-rs) | Deploys and calls contracts | `cargo install near-cli-rs --locked` |
| Python 3 | Computes the wallet contract's code hash and prepares the art layers | Preinstalled on macOS and most Linux |

## 2. Get a funded testnet account

Create an account funded by the testnet faucet. The key is saved to your system keychain:

```sh
near account create-account sponsor-by-faucet-service <you>.testnet \
  autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain network-config testnet create
```

If you already have a testnet account, import it with `near account import-account`.

**How much NEAR you need:**

| Deploy | Deployer NEAR |
|---|---|
| Demo (`DEMO=1`, 3 CTOads) | ~10 to deploy, ~16.5 to also run [Try it](#4-try-it) |
| Full (500 CTOads) | ~15.5 |

That covers code storage (~2.9 NEAR for the token contract, ~3.3 NEAR for the NFT contract), storage for 500 mints (~4.3 NEAR), the art layers (about 0.01 NEAR per KB, ~0.8 NEAR for the ones in `art/`), the global contract deploy (~2.4 NEAR), and gas. Deploying again from the same deployer costs ~2.4 NEAR less, as long as the CTOad account code hasn't changed since, because it's already on-chain. Each round of Try it needs 6 NEAR free for the buy, and gets all but ~0.12 NEAR back on the sell. If you run short, get more from the [testnet faucet](https://docs.near.org/getting-started/faucet).

## 3. Deploy

Run the script from the repo root:

```sh
DEPLOYER=<you>.testnet DEMO=1 ./scripts/deploy.sh   # demo: 3 CTOads, 0.1 NEAR loss threshold
DEPLOYER=<you>.testnet ./scripts/deploy.sh          # real settings: 500 CTOads, 1 NEAR
```

Use `DEMO=1` to try the whole lifecycle with a few testnet NEAR. The demo only changes the numbers (3 CTOads, a 0.1 NEAR loss threshold, more than one CTOad per wallet). The code is identical.

### What the script does

1. **Builds** all three contracts with `cargo near build`.
2. **Computes the wallet contract's code hash** with `scripts/code-hash.py`, which prints the base58 SHA-256 of `ctoad_account.wasm`.
3. **Deploys the wallet contract as a global contract by hash**, signed by `<you>`. Because it's referenced by hash, it can never change.
4. **Creates `cto.<you>` and `ctoads.<you>`**, funded by `<you>`. Their keys go into your keychain.
5. **Deploys the NFT contract and calls `new`** with `cto_token_id = cto.<you>` and `max_supply = MAX_CTOADS`.
6. **Uploads the art** in `art/` with `scripts/upload-art.sh`, one `add_layer` call per layer, signed by `<you>`. See [art/README.md](art/README.md). A slow RPC can make an upload fail ("Transaction has expired") even though it landed, so before retrying, the script checks the contract and skips layers that are already there. If it still stops, run the same deploy command again with `RESUME=art` in front: it skips steps 3–5 and finishes the upload and step 7.
7. **Deploys the token contract and calls `new`** with the settings below and the code hash. It comes after the art, so no CTOad can be minted without it.
8. **Prints `get_market` and `ctoad_status`** so you can check that both contracts are live.

### Settings

Override any of these with environment variables:

| Variable | Default | `DEMO=1` | Meaning |
|---|---|---|---|
| `NETWORK` | `testnet` | | `testnet` or `mainnet` |
| `DEPLOYER` | required | | Your account: the `owner_id` |
| `TOKEN` / `NFT` | `cto.$DEPLOYER` / `ctoads.$DEPLOYER` | | Contract accounts. `TOKEN` can be at most 54 characters. |
| `MAX_CTOADS` | `500` | `3` | Number of CTOads. Minting the last one triggers the takeover. |
| `LOSS_THRESHOLD` | 1 NEAR | 0.1 NEAR | Smallest loss, in yoctoNEAR, that earns a CTOad |
| `ONE_PER_WALLET` | `true` | `false` | At most one CTOad per wallet |
| `MIN_HOLD_SECS` | `0` | | How long after your last buy a loss can count |
| `VOTING_PERIOD_SECS` | 30 days | 5 minutes | How long each proposal stays open |
| `FEE_BPS` | `100` | | Fee per curve trade (100 = 1%) |
| `VIRTUAL_NEAR` | 30 NEAR | | Virtual reserve. Sets the starting price. |
| `TOTAL_SUPPLY` | 1B $CTO | | Minted to the curve at init (18 decimals) |
| `ACCOUNT_DEPOSIT` | 0.005 NEAR | | Given to each new CTOad account for its storage |
| `TOKEN_FUNDING` / `NFT_FUNDING` | `4` / `8` NEAR | `3.5` / `3.5` NEAR | Initial balance of each contract account |

All of these are permanent once deployed. Neither contract has a function to change them. The only exception is the NFT owner's art: layers can be added or replaced until `freeze_art` locks them.

## 4. Try it

These commands use `DEMO=1` settings. Set the shell variables first:

```sh
TOKEN=cto.<you>.testnet
NFT=ctoads.<you>.testnet
ME=<you>.testnet        # or a separate player account created with the faucet command above
```

**1. Buy $CTO with 6 NEAR.** On a first buy, a small storage fee comes out of the deposit.

```sh
near contract call-function as-transaction $TOKEN buy json-args '{}' \
  prepaid-gas '30.0 Tgas' attached-deposit '6 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

**2. Check your position.** Note the `balance`.

```sh
near contract call-function as-read-only $TOKEN get_holder \
  json-args "{\"account_id\":\"$ME\"}" network-config testnet now
```

**3. Preview selling everything.** Expect `"earns_ctoad": true`. In the demo, fees alone (~0.12 NEAR) are more than the 0.1 NEAR threshold.

```sh
near contract call-function as-read-only $TOKEN quote_sell \
  json-args "{\"account_id\":\"$ME\",\"amount\":\"<balance>\"}" network-config testnet now
```

**4. Sell at a loss.** A sell needs exactly 1 yoctoNEAR and enough gas to mint.

```sh
near contract call-function as-transaction $TOKEN sell \
  json-args '{"amount":"<balance>"}' \
  prepaid-gas '150.0 Tgas' attached-deposit '1 yoctoNEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

**5. See your CTOad and its account.**

```sh
near contract call-function as-read-only $NFT nft_tokens_for_owner \
  json-args "{\"account_id\":\"$ME\"}" network-config testnet now
near contract call-function as-read-only $TOKEN get_ctoad_account \
  json-args '{"token_id":"1"}' network-config testnet now
```

The `state` is `"Ready"` once `ctoad-1.$TOKEN` exists. You can also look the account up in a [testnet explorer](https://testnet.nearblocks.io).

The token's `media` is its image as a `data:` URI. To see its traits, and the image as plain SVG:

```sh
near contract call-function as-read-only $NFT ctoad_traits \
  json-args '{"token_id":"1"}' network-config testnet now
near contract call-function as-read-only $NFT ctoad_svg \
  json-args '{"token_id":"1"}' network-config testnet now
```

Save the SVG output to a `.svg` file to open it in a browser.

**6. Mint the rest.** Repeat steps 1 to 4 twice more. After CTOad #3, `get_market` shows `"takeover": true`:

```sh
near contract call-function as-read-only $TOKEN get_market json-args '{}' network-config testnet now
```

**7. Create fees for the holders.** Any trade after the takeover works, for example step 1 again. Then check what CTOad #1 has earned:

```sh
near contract call-function as-read-only $TOKEN ctoad_unclaimed \
  json-args '{"token_ids":["1","2","3"]}' network-config testnet now
```

**8. Claim.** Each CTOad's account sends its whole balance to you:

```sh
near contract call-function as-transaction $NFT claim \
  json-args '{"token_ids":["1","2","3"]}' \
  prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

If a trade happened before the takeover, the deployer has fees to collect. Anyone can trigger the payout, and it always goes to `owner_id`:

```sh
near contract call-function as-transaction $TOKEN withdraw_deployer_fees json-args '{}' \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

**9. Propose a treasury payout.** After the takeover, 10% of every fee goes to the treasury. Check its balance:

```sh
near contract call-function as-read-only $TOKEN get_market json-args '{}' network-config testnet now
```

`treasury_balance` is about 0.006 NEAR after step 7. Propose sending 0.005 NEAR of it to yourself, and attach 0.01 NEAR for the proposal's storage (the rest is refunded):

```sh
near contract call-function as-transaction $NFT propose \
  json-args "{\"description\":\"Test payout\",\"receiver_id\":\"$ME\",\"amount\":\"5000000000000000000000\"}" \
  prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

**10. Vote.** Vote yes with two of your three CTOads. That's 51% of all CTOads, so the proposal passes right away:

```sh
near contract call-function as-transaction $NFT vote \
  json-args '{"proposal_id":1,"token_ids":["1","2"],"approve":true}' \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

To see the end of the voting period instead, vote with one CTOad and wait 5 minutes. One vote is enough turnout with 3 CTOads, so the proposal passes when the period ends.

**11. Check the result.** Expect `"status": "Passed"`:

```sh
near contract call-function as-read-only $NFT get_proposal \
  json-args '{"proposal_id":1}' network-config testnet now
```

**12. Execute.** Anyone can do this. The treasury sends the amount, and the status becomes `"Executed"`:

```sh
near contract call-function as-transaction $NFT execute \
  json-args '{"proposal_id":1}' \
  prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

**13. Make CTOad #1's account buy $CTO.** Its account can call other contracts, paying from its own balance, and only its holder can make it. First give it fees to spend: trade once more (step 1 again), then move the fees into the CTOad accounts. Anyone can do this:

```sh
near contract call-function as-transaction $TOKEN sweep \
  json-args '{"token_ids":["1","2","3"]}' \
  prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

Then, as CTOad #1's holder, make its account spend 0.01 NEAR on `buy`. `args` is the call's own JSON arguments, as a string:

```sh
near contract call-function as-transaction $NFT ctoad_call \
  json-args "{\"token_id\":\"1\",\"receiver_id\":\"$TOKEN\",\"method_name\":\"buy\",\"args\":\"{}\",\"deposit\":\"10000000000000000000000\",\"gas\":\"30000000000000\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' \
  sign-as $ME network-config testnet sign-with-keychain send
```

The CTOad's account now holds $CTO. Selling CTOad #1 hands that bag to the new holder:

```sh
near contract call-function as-read-only $TOKEN get_holder \
  json-args "{\"account_id\":\"ctoad-1.$TOKEN\"}" network-config testnet now
```

Signing the same `ctoad_call` from an account that doesn't hold CTOad #1 fails with "You don't own CTOad #1".

## 5. Run the frontend

The web app does everything in step 4 in the browser.

```sh
cd web-app
cp .env.example .env.local
# set NEXT_PUBLIC_TOKEN_CONTRACT=cto.<you>.testnet and NEXT_PUBLIC_NFT_CONTRACT=ctoads.<you>.testnet
npm install
npm run dev   # http://localhost:3000
```

Connect a testnet wallet, such as Meteor. Then:

1. Buy on the Trade page.
2. Switch to Sell. It shows whether the sell earns a CTOad.
3. Sell. The mint moment pops up.
4. See your CTOad on the CTOads and Claim pages.
5. Once every CTOad is minted, propose, vote and execute on the Vote page.
6. Open a CTOad's page from the gallery. As its holder, make its backpack buy $CTO, or sell its bag.
7. Optional: with Supabase set up (see [Alerts setup](web-app/README.md#alerts-setup)), sign up a phone number on the Alerts page. The wallet asks you to sign a message, which costs nothing. With msgbubbles set up too, send an alert on /send-alerts from a second holder's wallet.

See [web-app/README.md](web-app/README.md) for details.

## 6. Lock the contracts

The contracts have no admin functions, but whoever holds a contract account's full-access key can still deploy new code over it. To make the takeover credible, delete those keys. **This can't be undone.** The code can never be upgraded again, so do it only after testing.

```sh
near account list-keys $TOKEN network-config testnet now
near account delete-keys $TOKEN public-keys <ed25519:...> network-config testnet sign-with-keychain send
# then the same two commands for $NFT
```

The CTOad accounts never have keys, and the wallet contract is a global contract referenced by hash. Neither needs locking.

## Mainnet

Use the same script with `NETWORK=mainnet DEPLOYER=<you>.near`, and the defaults: 500 CTOads, 1 NEAR, one per wallet. Before launch:

- Set `MIN_HOLD_SECS`, e.g. `600` (10 minutes), so a wallet can't buy and sell in the same minute just to earn a CTOad.
- Run the testnet demo end to end with the same commit.
- Freeze the art with `freeze_art` once it's final.
- Lock both contracts (step 6), with `network-config mainnet`.

### Mainnet and testnet sites

Each site builds for one network, so run two from the same repo: the main domain on mainnet, and a
`testnet.` subdomain where anyone can try everything with free testnet NEAR.

Give each its own Supabase project. Profiles, alert sign-ups and linked phone numbers then stay apart:
nobody can claim a mainnet `@handle` from a testnet wallet, and an alert on testnet never texts mainnet
holders.

1. **Mainnet Supabase.** Create a second Supabase project and run every file in
   [`web-app/supabase/migrations`](web-app/supabase/migrations) in order, as in
   [Alerts setup](web-app/README.md#alerts-setup).
2. **Mainnet site.** In the hosting project of the main domain, set `NEXT_PUBLIC_NETWORK=mainnet`, the
   mainnet `NEXT_PUBLIC_TOKEN_CONTRACT` and `NEXT_PUBLIC_NFT_CONTRACT`, and the new project's
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the other variables. Redeploy, since
   `NEXT_PUBLIC_` values are baked in at build time.
3. **Testnet site.** Create a second hosting project from the same repository, with `web-app` as its
   root directory, the testnet contracts and the testnet Supabase project. Leave out
   `NEXT_PUBLIC_MSGBUBBLES_NUMBER`, `MSGBUBBLES_API_KEY` and `MSGBUBBLES_WEBHOOK_SECRET`, so texting
   only runs on mainnet: a msgbubbles number sends received texts to one webhook, the mainnet site's.
   Alerts on testnet then go by email only.
4. **Domain.** Add `testnet.<your domain>` to the testnet project, with the DNS record the host asks
   for.

## If something goes wrong

| Symptom | Fix |
|---|---|
| `This sell earns a CTOad. Attach at least 100 Tgas` | Resend the sell with `prepaid-gas '150.0 Tgas'` |
| `Requires attached deposit of exactly 1 yoctoNEAR` | `sell` needs `attached-deposit '1 yoctoNEAR'` |
| A CTOad mint failed, so `get_holder` shows `failed_mints > 0` | Anyone can call `retry_mint({"account_id": ...})` with 150 Tgas |
| `get_ctoad_account` shows `state: null` | The deployer's fees didn't cover the account. Call `create_ctoad_account({"token_id": ...})` with `ACCOUNT_DEPOSIT` attached. Claims still work in the meantime and pay the holder directly. |
| `Account ID too long for ctoad-<id> sub-accounts` | Pick a shorter `TOKEN` account (54 characters at most) |
| `Proposals open once every CTOad is minted` | Voting starts at the takeover. Mint the rest first (step 6). |
| `execute` logs `wasn't paid out` | The treasury doesn't hold the amount yet. The proposal stays `Passed`. Execute again after more trades. |
