# $CTO web app

The Next.js frontend for $CTO and CTOads. See the [main README](../README.md) for how the contracts work.

| Page | What it does |
|---|---|
| `/` Trade | Buy and sell $CTO with live quotes, and see how many CTOads are minted. Before you sell, it shows whether the sell earns a CTOad, or why it won't. After a sell that earns one, it shows the "you got rekt, here's your CTOad" moment, with its image and traits. |
| `/ctoads` | Gallery of every minted CTOad, newest first, 20 at a time: its image and traits, the loss that earned it, who holds it, and a link to its account. With a wallet connected, "Mine" shows only yours. |
| `/ctoads/[id]` | One CTOad: its image, traits, holder, and its backpack, the NEAR and $CTO its own account holds. Its holder can make the account buy $CTO with that NEAR, or sell its whole bag. |
| `/claim` | Your CTOads, what each one can claim, and a button to claim it all |
| `/vote` | The treasury and every proposal with its votes, status and time left. Once every CTOad is minted, holders can propose a payout, vote with their CTOads, and execute a passed proposal. |
| `/alerts` | CTOad holders sign up with a phone number and/or an email (verified with a code) for alerts from fellow holders, choose text, email or both, change them, or stop alerts and delete them. Each change is signed by the wallet. |
| `/send-alerts` | A CTOad holder writes an alert, optionally with an image, and sends it to every other signed-up holder, by text from the app's number or by email, up to 3 a day |
| `/alerts/remove` | Anyone removes their phone number from alerts, without a wallet |
| `/profile`, `/@handle` | A CTOad holder makes a public profile: a handle, a short bio and up to 6 links, shown with their CTOads at `/@handle`, like a link-in-bio page. Each change is signed by the wallet. A CTOad's page links to its holder's profile. |
| `/privacy`, `/terms` | What the app stores and how to delete it, and the rules for alerts and profiles |

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
| `SUPABASE_URL` | `https://your-project.supabase.co` | For alerts and profiles: the Supabase project that stores sign-ups and profiles. Server only. |
| `SUPABASE_SERVICE_ROLE_KEY` | | For alerts and profiles: that project's service role key. Server only, keep it secret. |
| `NEXT_PUBLIC_MSGBUBBLES_NUMBER` | `+12025550123` | For text alerts: the msgbubbles number they come from, shown on the Alerts page |
| `MSGBUBBLES_API_KEY` | | For text alerts: a msgbubbles API key. Server only. Without it, alerts go by email only. |
| `OPENAI_API_KEY` | | For sending alerts and saving profiles: checks them with OpenAI's free moderation endpoint. Server only. |
| `ALERTS_S3_BUCKET`, `AWS_REGION` | | For images in alerts: the S3 bucket they're uploaded to, and its region. Server only. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | | For images in alerts: credentials that can put and get objects in that bucket. Server only. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | | For email alerts and codes: a Resend API key, and the address they come from, on a domain verified in Resend. Server only. |

The `NEXT_PUBLIC_` values are baked in at build time, so restart `npm run dev` or rebuild after changing them.

### Alerts setup

Alerts and profiles are optional. Without the two Supabase variables every other page works, and Alerts says it isn't available.

1. Create a project at [supabase.com](https://supabase.com). Keep "Enable Data API" and "Automatically expose new tables" on: the tables turn on row level security themselves, so only the server's secret key can read them.
2. In its SQL Editor, run each file in [`supabase/migrations`](supabase/migrations), in order.
3. From the project's API settings, copy the project URL and the service role (secret) key into `.env.local`, then restart `npm run dev`.
4. To send alerts, set `NEXT_PUBLIC_MSGBUBBLES_NUMBER` and `MSGBUBBLES_API_KEY` from your [msgbubbles](https://docs.msgbubbles.com) account, and `OPENAI_API_KEY` from [OpenAI](https://platform.openai.com) for moderation.
5. For images, create an S3 bucket with a CORS rule that allows `PUT` from the site's address, and credentials that can put and get objects in it, then set the four AWS variables.
6. For email, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from your [Resend](https://resend.com) account, with the from address on a domain you've verified there.

## How it's built

- **Wallets:** [NEAR Wallet Selector](https://github.com/near/wallet-selector) v10, supporting Meteor, Intear and HERE. `src/lib/polyfills.ts` provides `Buffer`, which some wallet packages expect.
- **Reading the chain:** `src/lib/near.ts` is a small fetch-based JSON-RPC client. `src/lib/cto.ts` has typed wrappers for every contract view. SWR polls them (`src/hooks/useCto.ts`).
- **The mint moment:** after a sell, the app reads the contract's `sell` and `ctoad_minted` events from the transaction. For wallets that redirect, it looks the transaction up by its hash.
- **Backpack:** the buy and sell on a CTOad's page are `ctoad_call` transactions on the NFT contract, which pass the call on to the CTOad's account. A buy that needs fees not yet swept into the account sends a `sweep` first, in the same wallet request, so a popup wallet opens only once.
- **Alerts:** the wallet signs a message naming the action and phone number ([NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)), and `src/app/api/alerts/route.ts` checks it on the server (`src/lib/walletProof.ts`): the signature, that the key is a full access key of the account, and for sign-ups that the account holds a CTOad. Signatures expire after 5 minutes. Sign-ups are stored in Supabase (`src/lib/supabase.ts`) with row level security on and no policies, so only the server, with the service role key, can read them.
- **Sending alerts:** the holder signs the exact text. `src/app/api/alerts/send/route.ts` checks the limit of 3 alerts in 24 hours (from the `alert_messages` log), checks the text with OpenAI's moderation endpoint (`src/lib/moderation.ts`) and refuses a flagged one, finds every subscriber who still holds a CTOad, other than the sender, and texts them through msgbubbles (`src/lib/msgbubbles.ts`), 5 at a time, each with an idempotency key so a retry never texts twice. Each text ends with the sender's account and a link to `/alerts/remove`, since the number is outbound only and replies never reach us.
- **Email:** `src/app/api/alerts/email/route.ts` emails a 6-digit code through Resend (`src/lib/resend.ts`) after a signed request, keeps only its hash for 10 minutes and 5 tries, and saves the address once the code comes back. Each subscriber picks text, email or both (`PATCH /api/alerts`), and the send route delivers by that choice. Without `MSGBUBBLES_API_KEY`, every alert goes by email to everyone with a verified address, and `/alerts` hides the phone field and the choice. The alerts pages then describe email only. Emails end with a link to the Alerts page, where the address can be deleted, and are spaced out to stay under Resend's rate limit.
- **Images:** the holder signs the text and the image's SHA-256 together, once. `src/app/api/alerts/upload/route.ts` checks that signature and returns a 5-minute S3 upload URL for exactly that file (`src/lib/s3.ts`), named by its hash. The send route reads the file back, checks its hash, moderates text and image together, and stages a msgbubbles attachment for each recipient, since attachment ids work for one message only. JPEG, PNG, GIF or WebP, up to 5 MB.
- **Profiles:** `src/lib/profile.ts` cleans up a profile the same way in the browser and on the server (a lowercase handle of 3 to 20 letters, numbers or underscores, a bio up to 160 characters, up to 6 https links) and builds the text the wallet signs, which names every field. `src/app/api/profile/route.ts` checks that the signer holds a CTOad, checks the handle, bio and link names with OpenAI's moderation, and saves it in the `profiles` table, where each handle is unique. `/@handle` is a rewrite to `/profiles/[handle]` in `next.config.ts`, since a folder starting with `@` would be a parallel route.
- **Removing a number:** `/alerts/remove` and `src/app/api/alerts/remove/route.ts` let anyone delete their number without a wallet, for numbers signed up by someone else. The answer is the same whether or not the number was signed up.
- **Images:** `src/components/CtoadImage.tsx` shows the image the NFT contract returns in each CTOad's `media`, and its traits from `extra`. The app draws no art of its own. A CTOad that isn't minted yet shows a "?".

```sh
npm run build   # production build: every page prerenders, /ctoads/[id] partly (its id is only known per request); the /api/alerts routes run per request
npm run lint
```
