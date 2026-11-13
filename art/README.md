# CTOad art layers

Every CTOad's image is built on-chain from these layers. At mint, the CTOad contract picks one
layer per category, and when the CTOad is read, it stacks them into one SVG.

The layers here are the CTOads art: 64 layers, about 211 KB, so uploading them costs about
2.2 NEAR.

## Categories

One folder per category, stacked in this order (each one is drawn over the ones before it):

| Folder | Category |
|---|---|
| `background/` | Background |
| `body/` | Body: the toad itself |
| `mouth/` | Mouth |
| `eyes/` | Eyes |
| `outfit/` | Outfit: drawn over the face, so a collar or hood can cover it |
| `headwear/` | Headwear |
| `item/` | Held item |

A folder can hold any number of layers. An empty folder means CTOads get nothing from that
category. For an option like "no hat", add a layer with an empty drawing, such as
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g/></svg>`.

## Format

- One `.svg` file per layer. The file name, without `.svg`, is the trait's name (`crown.svg` is
  "crown"). Up to 32 characters.
- A 1000×1000 canvas (`viewBox="0 0 1000 1000"`), with every layer aligned to the same body.
- Flat shapes only: no embedded images, no fonts other than generic ones like `sans-serif`.
- At most 8 KB per file. Smaller is cheaper: storage costs about 0.01 NEAR per KB.

Files exported from design tools work as they are. The upload drops the XML declaration,
comments and the outer `<svg>` tag.

## Previewing

```sh
node scripts/preview-art.mjs
open art/preview.html
```

This builds `art/preview.html`, which needs no chain or server, only Node. It stacks the layers
the same way the contract does, so a preview looks the same as a minted CTOad. The page has:

- **Checks**: layer counts, and any file that breaks the format above.
- **Compositor**: pick a layer per category, or randomize. Lock a category to keep it while
  randomizing the rest. The URL keeps the pick, so it can be bookmarked or shared. Download
  saves the stacked SVG.
- **Random combinations**: a grid of 12 random CTOads. Each category is dealt like a shuffled
  deck, so every layer shows up once before any repeats. Click one to open it in the
  compositor.
- **Layer browser**: every layer on its own. Click one to put it in the compositor.
- **Try hats under the eyes**: a toggle that draws headwear below the eyes, to test art for an
  order the contract doesn't use. The page marks it clearly while it's on.

Run the script again after changing any layer, or add `--watch` to rebuild on every change.
`preview.html` is generated, so git ignores it. Randomizing picks every layer equally often;
it doesn't apply weights.

To preview art before it's final, point the script at another folder laid out like `art/`. It
can hold SVGs or 1000×1000 PNGs with transparency, and the page is written into that folder:

```sh
node scripts/preview-art.mjs drafts --watch
open drafts/preview.html
```## Uploading

`scripts/deploy.sh` uploads every layer before the token contract exists, so no CTOad is minted
without art. To upload to a contract that's already deployed, as its owner:

```sh
OWNER=<you>.testnet NFT=ctoads.<you>.testnet ./scripts/upload-art.sh
```

This adds every file as a new layer. To change one layer in place, call `replace_layer` with
its category and index (see `get_art`). Every CTOad that has that layer shows the new one.

Layers have a weight, 1 by default: a layer with weight 1 next to one with weight 9 is picked
1 time in 10. Set it with the optional `weight` argument of `add_layer` or `replace_layer`.

When the art is final, the owner calls `freeze_art`. After that, no layer can be added or
changed.
