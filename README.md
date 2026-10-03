# The Capsule — wardrobe watch

Live site: https://cybersecdigestdaily.github.io/capsule/

A zero-cost tracker for Don's capsule wardrobe. It checks every watched piece for **price and stock in his exact size**, scans trusted sale rails for **new on-brief deals**, keeps **price history**, and can **ping Discord** when something is worth buying.

## How it works

| Layer | What | Where | When |
|---|---|---|---|
| Price/stock checker | `scraper.py` reads Shopify `/products/<handle>.js` for each item: price, was-price, stock **in your size only** | GitHub Actions | when triggered (below) and on every edit to the config files |
| Deal finder | Scans the sale collections in `finder.json`; keeps logo-free, on-palette pieces in L / W34 L32 / UK 10 at 25%+ off (premium brands 40%+) | same run | same |
| History | `docs/history.json` — one price/stock point per item per day (backfilled from Jul 2026) | same run | same |
| On-time trigger | `cloudflare/` Worker calls the workflow's `workflow_dispatch` at exact times (GitHub's own cron is a fallback that skips if data is <4h old) | Cloudflare (free) | 07:15, 13:15, 19:15 UK |
| Judgement | Claude's weekly review fixes broken links, re-sources dead and off-brief items, adds fit notes, writes `picks.json` (the shortlist) | Claude scheduled task | Sundays ~08:55 UK |
| Site | `docs/index.html` (static): Watch list, Outfits, Deals tabs | GitHub Pages | always |

Uniqlo, M&S and John Lewis block bots, so their items are `"check": "manual"`: they show the last checked price and are excluded from totals.

## Fit notes

Every item in `items.json` has `fit.verdict` (`good` / `check` / `avoid`) and a `fit.note` (cut, stretch, rise, sizing quirks). Tops with published measurements also carry `fit.reach`: centre-back-to-cuff in cm per size (half the across-shoulder width plus the sleeve). Enter your own reach on the Outfits tab (or set `sizes.reach_cm`) and the watch list flags anything short in the sleeve at your size. `avoid` pieces are never suggested and the weekly review replaces them.

## Outfits tab

`wardrobe.json` holds the outfit formulas from the STYLE brief (Office, Date night, Outdoor & photography, Everyday, Lounging) and staples you may already own. Tick what you own on the site (watch-list pieces you tick count as bought). Each formula shows what's covered and the best in-stock piece for each gap; "Best next buys" ranks pieces by how many outfits they complete. Ticks live in the browser: **Copy wardrobe link** carries them to another device.

## On-time runs (one-off, ~3 minutes)

1. Create the token (fields pre-filled): [new fine-grained token](https://github.com/settings/personal-access-tokens/new?name=capsule-cron&description=Lets+the+capsule-cron+Cloudflare+Worker+start+the+price-check+workflow&target_name=CyberSecDigestDaily&expires_in=366&actions=write). Under **Repository access** choose **Only select repositories → capsule**, check **Actions: Read and write** is set, then **Generate token** and copy it.
2. Download this repo (Code → Download ZIP), open the `cloudflare` folder, right-click `setup.ps1` → **Run with PowerShell** (or `powershell -ExecutionPolicy Bypass -File .\setup.ps1`). It deploys the Worker (logs you into Cloudflare if needed), asks for the token, and optionally a Discord webhook for failure alerts.
3. Done. Uses 1 of the 5 cron triggers on Cloudflare's free plan. When the token expires in a year, the Worker posts a Discord alert (if set) and GitHub's fallback schedule keeps things running; re-run step 1–2.

## Common edits (all in GitHub's web editor, phone works)

- **Bought something:** set `"bought": true` on the item in `items.json` → it stops being tracked on every device. (The tick box on the site only remembers on that device.)
- **Add an item:** copy an entry in `items.json`, give it the next `id`, paste the product URL, set `size` exactly as the shop labels it (`"L"`, `"W34 L32"`, `"UK 10"`; use `"L|XL"` to accept either) and a `target` buy price. If one listing holds several colours, add `"variant": "Colour Name"`.
- **Tune the deal finder:** edit `finder.json` (stores, palette words, exclusions, price caps, minimum discount).
- **Outfits:** edit formulas or staples in `wardrobe.json`; give new items a `role` so they slot into outfits.
- Saving any of those files re-runs the checker within a minute or two.

## Alerts (optional, 1 minute)

Repo → Settings → Secrets and variables → Actions → New repository secret → name `DISCORD_WEBHOOK`, value = a Discord channel webhook URL (Channel settings → Integrations → Webhooks). You'll then get: new BUY signals, back-in-your-size restocks, price drops of £5+, new deals, and a red alert if a run fails.

## Signals

- **Buy now** — in stock in your size at or under target
- **On sale** — in stock, 10%+ off, still above target
- **Watching** — in stock, above target
- **Sold out** — not available in your size (the row lists sizes that are)
- **Check** — manual-check retailer
- **Link broken** — product URL changed or vanished; the weekly review re-sources it

## Don't

- Don't upload old copies of `items.json` or `docs/index.html` from the local `STYLE/site-github` folder — the repo is now the single source of truth.
- Don't hand-edit `docs/data.json`, `docs/history.json` or `docs/finds.json` — the checker rewrites them.
