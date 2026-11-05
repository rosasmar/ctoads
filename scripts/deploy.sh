#!/usr/bin/env bash
# Deploys $CTO, CTOads and the CTOad account wallet. See DEPLOY.md for the full guide.
#
#   DEPLOYER=you.testnet ./scripts/deploy.sh             # production settings (500 CTOads, 1 NEAR loss)
#   DEPLOYER=you.testnet DEMO=1 ./scripts/deploy.sh      # small demo: 3 CTOads, 0.1 NEAR loss
#
# Every setting below can be overridden with an environment variable.
set -euo pipefail

NETWORK=${NETWORK:-testnet}
DEPLOYER=${DEPLOYER:?Set DEPLOYER to your account, e.g. DEPLOYER=you.testnet}
TOKEN=${TOKEN:-cto.$DEPLOYER}
NFT=${NFT:-ctoads.$DEPLOYER}

YOCTO_PER_NEAR=1000000000000000000000000
if [[ "${DEMO:-0}" == "1" ]]; then
  # Small enough to run the whole lifecycle (mint every CTOad, takeover, claim) with a few
  # testnet NEAR from a single wallet.
  : "${MAX_CTOADS:=3}" "${LOSS_THRESHOLD:=100000000000000000000000}" "${ONE_PER_WALLET:=false}"
  : "${TOKEN_FUNDING:=3.5}" "${NFT_FUNDING:=3}"
fi
MAX_CTOADS=${MAX_CTOADS:-500}
FEE_BPS=${FEE_BPS:-100}                                  # 1% per buy and per sell
LOSS_THRESHOLD=${LOSS_THRESHOLD:-$YOCTO_PER_NEAR}        # 1 NEAR
ONE_PER_WALLET=${ONE_PER_WALLET:-true}
MIN_HOLD_SECS=${MIN_HOLD_SECS:-0}
ACCOUNT_DEPOSIT=${ACCOUNT_DEPOSIT:-5000000000000000000000}           # 0.005 NEAR per CTOad account
TOTAL_SUPPLY=${TOTAL_SUPPLY:-1000000000000000000000000000}            # 1B $CTO (18 decimals)
VIRTUAL_NEAR=${VIRTUAL_NEAR:-30000000000000000000000000}              # 30 NEAR virtual reserve
TOKEN_FUNDING=${TOKEN_FUNDING:-4}                                     # NEAR: code storage + holders
NFT_FUNDING=${NFT_FUNDING:-8}                                         # NEAR: code storage + 500 mints
BASE_URI=${BASE_URI:-}

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WASM="$ROOT/target/near"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if (( ${#TOKEN} > 54 )); then
  echo "TOKEN account ID is ${#TOKEN} characters; it must be at most 54 so ctoad-500.$TOKEN fits." >&2
  exit 1
fi

say "Building contracts"
for c in cto-token ctoad-nft ctoad-account; do
  (cd "$ROOT/contracts/$c" && cargo near build non-reproducible-wasm --no-abi)
done

CODE_HASH=$(python3 -I "$ROOT/scripts/code-hash.py" "$WASM/ctoad_account/ctoad_account.wasm")
say "CTOad account code hash: $CODE_HASH"

say "Deploying the CTOad account wallet as a global contract (signed by $DEPLOYER)"
near contract deploy-as-global use-file "$WASM/ctoad_account/ctoad_account.wasm" \
  as-global-hash "$DEPLOYER" \
  network-config "$NETWORK" sign-with-keychain send

say "Creating $TOKEN and $NFT"
near account create-account fund-myself "$TOKEN" "$TOKEN_FUNDING NEAR" \
  autogenerate-new-keypair save-to-keychain sign-as "$DEPLOYER" \
  network-config "$NETWORK" sign-with-keychain send
near account create-account fund-myself "$NFT" "$NFT_FUNDING NEAR" \
  autogenerate-new-keypair save-to-keychain sign-as "$DEPLOYER" \
  network-config "$NETWORK" sign-with-keychain send

TOKEN_ARGS=$(cat <<EOF
{
  "config": {
    "owner_id": "$DEPLOYER",
    "ctoad_contract_id": "$NFT",
    "fee_bps": $FEE_BPS,
    "loss_threshold": "$LOSS_THRESHOLD",
    "max_ctoads": $MAX_CTOADS,
    "one_per_wallet": $ONE_PER_WALLET,
    "min_hold_secs": $MIN_HOLD_SECS,
    "ctoad_account_code_hash": "$CODE_HASH",
    "ctoad_account_deposit": "$ACCOUNT_DEPOSIT"
  },
  "metadata": {
    "spec": "ft-1.0.0", "name": "CTO", "symbol": "CTO", "decimals": 18,
    "icon": null, "reference": null, "reference_hash": null
  },
  "total_supply": "$TOTAL_SUPPLY",
  "virtual_near_reserve": "$VIRTUAL_NEAR"
}
EOF
)

BASE_URI_JSON=null
[[ -n "$BASE_URI" ]] && BASE_URI_JSON="\"$BASE_URI\""
NFT_ARGS=$(cat <<EOF
{
  "owner_id": "$DEPLOYER",
  "cto_token_id": "$TOKEN",
  "max_supply": $MAX_CTOADS,
  "metadata": {
    "spec": "nft-1.0.0", "name": "CTOads", "symbol": "CTOAD",
    "icon": null, "base_uri": $BASE_URI_JSON, "reference": null, "reference_hash": null
  }
}
EOF
)

say "Deploying and initializing the \$CTO token contract on $TOKEN"
near contract deploy "$TOKEN" use-file "$WASM/cto_token/cto_token.wasm" \
  with-init-call new json-args "$TOKEN_ARGS" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
  network-config "$NETWORK" sign-with-keychain send

say "Deploying and initializing the CTOad contract on $NFT"
near contract deploy "$NFT" use-file "$WASM/ctoad_nft/ctoad_nft.wasm" \
  with-init-call new json-args "$NFT_ARGS" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
  network-config "$NETWORK" sign-with-keychain send

say "Checking the deploy"
near contract call-function as-read-only "$TOKEN" get_market json-args '{}' \
  network-config "$NETWORK" now
near contract call-function as-read-only "$NFT" ctoad_status json-args '{}' \
  network-config "$NETWORK" now

cat <<EOF

Deployed.
  \$CTO token:  $TOKEN
  CTOads:      $NFT
  CTOad accounts will be ctoad-<id>.$TOKEN

Next: try the lifecycle (DEPLOY.md, "Try it"). Before mainnet launch, lock both contracts by
deleting their full-access keys (DEPLOY.md, "Lock the contracts").
EOF
