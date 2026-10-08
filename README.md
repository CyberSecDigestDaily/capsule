# The Capsule — wardrobe watch

Live site: https://cybersecdigestdaily.github.io/capsule/

A zero-cost tracker for Don's capsule wardrobe. It checks every watched piece for **price and stock in his exact size**, scans trusted sale rails for **new on-brief deals**, keeps **price history**, and can **ping Discord** when something is worth buying.

## How it works

| Layer | What | Where | When |
|---|---|---|---|
| Price/stock checker | `scraper.py` checks each item's price, was-price and stock **in your size only**: Shopify `/products/<handle>.js`, Uniqlo's UK product API, M&S product data and barbour.com's size endpoint | GitHub Actions | when triggered (below) and on every edit to the config files |
| Deal finder | Scans the sale collections in `finder.json` with strict brief rules (main colour in palette, wanted footwear silhouettes only, logo/fit checks, stretch trousers) and nominates **candidates** in L / W34 L32 / UK 10 at 25%+ off (premium 40%+). Only URLs in `finder.json` `approve` reach the site and email | same run | same |
| History | `docs/history.json` — one price/stock point per item per day (backfilled from Jul 2026) | same run | same |
| On-time trigger | `cloudflare/` Worker calls the workflow's `workflow_dispatch` at exact times (GitHub's own cron is a fallback that skips if data is <4h old) | Cloudflare (free) | 07:15, 13:15, 19:15 UK |
| Judgement | Claude's daily review reads Don's feedback, looks at every candidate's photo and approves or blocks it against `taste.json`, fixes broken links, re-sources dead and off-brief items, writes `picks.json` (the shortlist) | Claude scheduled task | daily ~09:00 UK |
| Daily Drop email | `scraper.py` writes `docs/drop.html` every run and, once a day after the review, emails it over Gmail SMTP with the photos embedded (needs two secrets, below). Fallback: the review sends it via its Gmail connector, which strips photos | GitHub Actions / Claude | daily ~09:10 UK |
| Site | `docs/index.html` (static): Watch list, Outfits, Deals tabs | GitHub Pages | always |

Uniqlo (`"check": "uniqlo"`), M&S (`"mands"`) and Barbour (`"barbour"`, barbour.com URLs) are checked live like Shopify. If one of them refuses a run, its items show the last good price as "Price not live" for that run instead of a broken link. John Lewis still blocks bots: link to the brand's own site instead, or use `"check": "manual"` with `last_price` + `checked_on`.

## Daily Drop email

Every run writes `docs/drop.html` (also at the site's `/drop.html`): today's edit, what changed since yesterday, what's at or under target, and newly approved deals. Each piece has a **Not for me** link (opens a pre-filled email to yourself) and you can reply to the Drop with anything ("no suede", "more cords"); the next morning's review reads both and updates `taste.json` and the rules.

**Photos in the email (one-off, 2 minutes).** Claude's Gmail connector strips every image, so the Action sends the Drop itself over Gmail SMTP with the photos embedded:
1. Google Account → turn on 2-Step Verification if it isn't → [App passwords](https://myaccount.google.com/apppasswords) → name it `capsule` → copy the 16-character password.
2. Repo → Settings → Secrets and variables → Actions → [New repository secret](https://github.com/CyberSecDigestDaily/capsule/settings/secrets/actions/new): `GMAIL_APP_PASSWORD` = that password. Add a second one: `GMAIL_USER` = your Gmail address. Optional `DROP_TO` sends it to a different address (useful if `GMAIL_USER` is a spare sending account).
3. Optional test: Actions → Daily capsule price check → Run workflow. The Drop lands within ~2 minutes.

It sends at most once per UK day: right after the morning review's commit, or from 12:00 as a fallback. `docs/data.json` → `drop` records what happened; the review only falls back to its connector when the Action didn't send.

## Fit notes

Every item in `items.json` has `fit.verdict` (`good` / `check` / `avoid`) and a `fit.note` (cut, stretch, rise, sizing quirks). Tops with published measurements also carry `fit.reach`: centre-back-to-cuff in cm per size (half the across-shoulder width plus the sleeve). Enter your own reach on the Outfits tab (or set `sizes.reach_cm`) and the watch list flags anything short in the sleeve at your size. `avoid` pieces are never suggested and the weekly review replaces them.

## Outfits tab

`wardrobe.json` holds the outfit formulas from the STYLE brief (Office, Date night, Outdoor & photography, Everyday, Lounging) and staples you may already own. Tick what you own on the site (watch-list pieces you tick count as bought). Each formula shows what's covered and the best in-stock piece for each gap; "Best next buys" ranks pieces by how many outfits they complete. Ticks live in the browser: **Copy wardrobe link** carries them to another device.

## On-time runs (one-off, ~3 minutes)

GitHub's own scheduler often runs hours late. A tiny Cloudflare Worker (`cloudflare/`) starts the price check at 07:15, 13:15 and 19:15 UK time instead. It needs a GitHub token that is only allowed to start this repo's workflow.

1. **Create the token:** open this [pre-filled token page](https://github.com/settings/personal-access-tokens/new?name=capsule-cron&description=Lets+the+capsule-cron+Cloudflare+Worker+start+the+price-check+workflow&target_name=CyberSecDigestDaily&expires_in=366&actions=write). Under **Repository access** choose **Only select repositories** and tick **capsule**. Check **Permissions → Repository permissions → Actions** says **Read and write**. Click **Generate token** and copy it. Don't paste it anywhere except the setup window.
2. **Run the setup:** double-click `cloudflare\setup.cmd` (a copy lives in `Documents\Claude\Projects\STYLE\site-github\cloudflare`). Or open **Windows PowerShell** from the Start menu and paste:
   `irm https://raw.githubusercontent.com/CyberSecDigestDaily/capsule/main/cloudflare/setup.ps1 | iex`
3. **Follow the prompts:** paste the token (it stays hidden); the script proves it works by starting one price check. If a browser tab opens, log in to Cloudflare and click **Allow**. It then deploys the Worker and stores the token in Cloudflare (encrypted). Optional: a Discord webhook for failure alerts.

Re-run the same setup when the token expires (366 days). GitHub's own schedule stays as a fallback and skips itself when the data is less than 4 hours old. Uses 1 of the 5 cron triggers on Cloudflare's free plan.

## Common edits (all in GitHub's web editor, phone works)

- **Bought something:** set `"bought": true` on the item in `items.json` → it stops being tracked on every device. (The tick box on the site only remembers on that device.)
- **Add an item:** copy an entry in `items.json`, give it the next `id`, paste the product URL, set `size` exactly as the shop labels it (`"L"`, `"W34 L32"`, `"UK 10"`; use `"L|XL"` to accept either) and a `target` buy price. If one listing holds several colours, add `"variant": "Colour Name"`.
- **Tune the deal finder:** edit `finder.json` (stores, palette, exclusions, price caps, minimum discount). `approve` / `block` are the review's decisions per product URL. **Taste:** `taste.json` holds the likes, hard nos and every rejection the review judges against.
- **Outfits:** edit formulas or staples in `wardrobe.json`; give new items a `role` so they slot into outfits.
- Saving any of those files re-runs the checker within a minute or two.

## Alerts (optional, 1 minute)

Repo → Settings → Secrets and variables → Actions → New repository secret → name `DISCORD_WEBHOOK`, value = a Discord channel webhook URL (Channel settings → Integrations → Webhooks). You'll then get: new BUY signals, back-in-your-size restocks, price drops of £5+, new deals, and a red alert if a run fails.

## Signals

- **Buy now** — in stock in your size at or under target
- **On sale** — in stock, 10%+ off, still above target
- **Watching** — in stock, above target
- **Sold out** — not available in your size (the row lists sizes that are)
- **Not live** — manual-check retailer, or a live shop that refused this one run (shows the last good price)
- **Link broken** — product URL changed or vanished; the weekly review re-sources it

## Don't

- Don't upload old copies of `items.json` or `docs/index.html` from the local `STYLE/site-github` folder — the repo is now the single source of truth.
- Don't hand-edit `docs/data.json`, `docs/history.json` or `docs/finds.json` — the checker rewrites them.
