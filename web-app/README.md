# $CTO web app

The Next.js frontend for $CTO and CTOads. See the [main README](../README.md) for how the contracts work.

| Page | What it does |
|---|---|
| `/` Trade | Buy and sell $CTO with live quotes, and see how many CTOads are minted. Before you sell, it shows whether the sell earns a CTOad, or why it won't. After a sell that earns one, it shows the "you got rekt, here's your CTOad" moment, with its image and traits. |
| `/ctoads` | Gallery of every minted CTOad, newest first, 20 at a time: its image and traits, the loss that earned it, who holds it, and a link to its account. With a wallet connected, "Mine" shows only yours. |
| `/claim` | Your CTOads, what each one can claim, and a button to claim it all |
| `/vote` | The treasury and every proposal with its votes, status and time left. Once every CTOad is minted, holders can propose a payout, vote with their CTOads, and execute a passed proposal. |

## Run it

You need deployed contracts first (see [DEPLOY.md](../DEPLOY.md)). Then:

```sh
cd web-app
cp .env.example .env.local   # set NEXT_PUBLIC_TOKEN_CONTRACT and NEXT_PUBLIC_NFT_CONTRACT
npm install
npm run dev                  # http://localhost:3000
```

| Variable | Example | Meaning |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_TOKEN_CONTRACT` | `cto.you.testnet` | The $CTO token contract |
| `NEXT_PUBLIC_NFT_CONTRACT` | `ctoads.you.testnet` | The CTOad NFT contract |
| `NEXT_PUBLIC_RPC_URL` | optional | Defaults to FastNEAR's free RPC for the network |

These values are baked in at build time, so restart `npm run dev` or rebuild after changing them.

## How it's built

- **Wallets:** [NEAR Wallet Selector](https://github.com/near/wallet-selector) v10, supporting Meteor, Intear, HERE and MyNearWallet. `src/lib/polyfills.ts` provides `Buffer`, which some wallet packages expect.
- **Reading the chain:** `src/lib/near.ts` is a small fetch-based JSON-RPC client. `src/lib/cto.ts` has typed wrappers for every contract view. SWR polls them (`src/hooks/useCto.ts`).
- **The mint moment:** after a sell, the app reads the contract's `sell` and `ctoad_minted` events from the transaction. For wallets that redirect, it looks the transaction up by its hash.
- **Images:** `src/components/CtoadImage.tsx` shows the image the NFT contract returns in each CTOad's `media`, and its traits from `extra`. The app draws no art of its own. A CTOad that isn't minted yet shows a "?".

```sh
npm run build   # production build: all routes prerender
npm run lint
```
