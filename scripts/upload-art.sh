#!/usr/bin/env bash
# Uploads every layer in art/ to the CTOad contract, one add_layer call per file. Run it as the
# contract's owner, before anything is minted. deploy.sh runs it for you.
#
#   OWNER=you.testnet NFT=ctoads.you.testnet ./scripts/upload-art.sh
#
# Each folder in art/ is a category, and each .svg file in it is one layer, uploaded in
# alphabetical order. The file name becomes the layer's name.
set -euo pipefail

NETWORK=${NETWORK:-testnet}
OWNER=${OWNER:?Set OWNER to the CTOad contract owner, e.g. OWNER=you.testnet}
NFT=${NFT:?Set NFT to the CTOad contract, e.g. NFT=ctoads.you.testnet}

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ART=${ART:-$ROOT/art}

# Folder name and the contract's category name. Upload order doesn't matter: the contract stacks
# the layers in its own draw order (see art/README.md).
CATEGORIES="background:Background body:Body outfit:Outfit eyes:Eyes mouth:Mouth headwear:Headwear item:Item"

for pair in $CATEGORIES; do
  folder=${pair%%:*}
  category=${pair##*:}
  for file in "$ART/$folder"/*.svg; do
    [[ -e "$file" ]] || continue
    echo "Uploading $folder/$(basename "$file")"
    # 0.1 NEAR covers the largest layer (8 KB). The contract refunds what it doesn't use.
    near contract call-function as-transaction "$NFT" add_layer \
      json-args "$(python3 -I "$ROOT/scripts/layer-args.py" "$category" "$file")" \
      prepaid-gas '30.0 Tgas' attached-deposit '0.1 NEAR' \
      sign-as "$OWNER" network-config "$NETWORK" sign-with-keychain send
  done
done
