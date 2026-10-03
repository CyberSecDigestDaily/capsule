# The Capsule — wardrobe watch

Live site: https://cybersecdigestdaily.github.io/capsule/

A zero-cost tracker for Don's capsule wardrobe. It checks every watched piece for **price and stock in his exact size**, scans trusted sale rails for **new on-brief deals**, keeps **price history**, and can **ping Discord** when something is worth buying.

## How it works

| Layer | What | Where | When |
|---|---|---|---|
| Price/stock checker | `scraper.py` reads Shopify `/products/<handle>.js` for each item: price, was-price, stock **in your size only** | GitHub Actions | ~05:23, 11:23, 17:23 UTC, plus on every edit to the config files |
| Deal finder | Scans the sale collections in `finder.json`; keeps logo-free, on-palette pieces in L / W34 L32 / UK 10 at 25%+ off (premium brands 40%+) | same run | same |
| History | `docs/history.json` — one price/stock point per item per day (backfilled from Jul 2026) | same run | same |
| Judgement | Claude's weekly review fixes broken links, re-sources dead items, writes `picks.json` (the shortlist) | Claude scheduled task | Sundays ~08:55 UK |
| Site | `docs/index.html` (static) reads the JSON files | GitHub Pages | always |

Uniqlo, M&S and John Lewis block bots, so their items are `"check": "manual"`: they show the last checked price and are excluded from totals.

## Common edits (all in GitHub's web editor, phone works)

- **Bought something:** set `"bought": true` on the item in `items.json` → it stops being tracked on every device. (The tick box on the site only remembers on that device.)
- **Add an item:** copy an entry in `items.json`, give it the next `id`, paste the product URL, set `size` exactly as the shop labels it (`"L"`, `"W34 L32"`, `"UK 10"`; use `"L|XL"` to accept either) and a `target` buy price. If one listing holds several colours, add `"variant": "Colour Name"`.
- **Tune the deal finder:** edit `finder.json` (stores, palette words, exclusions, price caps, minimum discount).
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
