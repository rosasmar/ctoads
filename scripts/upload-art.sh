#!/usr/bin/env bash
# Uploads every layer in art/ to the CTOad contract, one add_layer call per file. Run it as the
# contract's owner, before anything is minted. deploy.sh runs it for you.
#
#   OWNER=you.testnet NFT=ctoads.you.testnet ./scripts/upload-art.sh
#
# Each folder in art/ is a category, and each .svg file in it is one layer, uploaded in
# alphabetical order. The file name becomes the layer's name. Layers already on the contract are
# skipped, and a failed upload is retried, so it's safe to run again.
set -euo pipefail

NETWORK=${NETWORK:-testnet}
OWNER=${OWNER:?Set OWNER to the CTOad contract owner, e.g. OWNER=you.testnet}
NFT=${NFT:?Set NFT to the CTOad contract, e.g. NFT=ctoads.you.testnet}

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ART=${ART:-$ROOT/art}

# Folder name and the contract's category name. Upload order doesn't matter: the contract stacks
# the layers in its own draw order (see art/README.md).
CATEGORIES="background:Background body:Body outfit:Outfit eyes:Eyes mouth:Mouth headwear:Headwear item:Item"

# Layers already on the contract, one "Category/name" per line.
uploaded() {
  near contract call-function as-read-only "$NFT" get_art json-args '{}' network-config "$NETWORK" now 2>/dev/null |
    python3 -I -c 'import json, sys
text = sys.stdin.read()
art = json.loads(text[text.index("{"):])
print("\n".join(c["category"] + "/" + l["name"] for c in art["categories"] for l in c["layers"]))'
}

# Layers that are already up are skipped, so running this again finishes an upload that stopped.
DONE=$(uploaded)

for pair in $CATEGORIES; do
  folder=${pair%%:*}
  category=${pair##*:}
  for file in "$ART/$folder"/*.svg; do
    [[ -e "$file" ]] || continue
    name=$(basename "$file" .svg)
    if grep -qxF "$category/$name" <<<"$DONE"; then
      echo "Already uploaded: $folder/$name"
      continue
    fi
    for attempt in 1 2 3; do
      echo "Uploading $folder/$name"
      # 0.1 NEAR covers the largest layer (8 KB). The contract refunds what it doesn't use.
      if near contract call-function as-transaction "$NFT" add_layer \
        json-args "$(python3 -I "$ROOT/scripts/layer-args.py" "$category" "$file")" \
        prepaid-gas '30.0 Tgas' attached-deposit '0.1 NEAR' \
        sign-as "$OWNER" network-config "$NETWORK" sign-with-keychain send; then
        break
      fi
      # A call can fail on a slow RPC (e.g. "Transaction has expired") yet still land. The
      # contract would add the same layer twice, and layers can't be removed, so check first.
      sleep 5
      if ! now=$(uploaded); then
        echo "Couldn't check whether $folder/$name landed. Run this script again: it skips the layers already uploaded." >&2
        exit 1
      fi
      if grep -qxF "$category/$name" <<<"$now"; then
        echo "It landed after all."
        break
      fi
      if (( attempt == 3 )); then
        echo "Couldn't upload $folder/$name. Run this script again: it skips the layers already uploaded." >&2
        exit 1
      fi
    done
  done
done
