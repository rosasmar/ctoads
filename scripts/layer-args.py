"""Prints the JSON arguments for the CTOad contract's add_layer from one SVG file.

    python3 scripts/layer-args.py Eyes art/eyes/smug.svg [weight]

The contract stores layers without the outer <svg> tag, so this keeps only what's inside it,
and drops comments and the XML declaration that design tools add. The file name, without
.svg, becomes the layer's name. Without a weight, the contract uses 1.
"""
import json
import os
import re
import sys

category, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    svg = f.read()

svg = re.sub(r"<\?xml.*?\?>|<!--.*?-->|<!DOCTYPE.*?>", "", svg, flags=re.S)
match = re.search(r"<svg\b[^>]*>(.*)</svg>", svg, flags=re.S)
if not match:
    sys.exit(f"{path}: no <svg> element found")
inner = re.sub(r">\s+<", "><", match.group(1).strip())

name = os.path.splitext(os.path.basename(path))[0]
args = {"category": category, "name": name, "svg": inner}
if len(sys.argv) > 3:
    args["weight"] = int(sys.argv[3])
print(json.dumps(args))
