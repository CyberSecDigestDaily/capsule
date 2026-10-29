# Capsule

A wardrobe site that learns. It checks ~1,000 pieces in Don's sizes across ~27 vetted UK shops three times a day, ranks them with a taste engine that learns from every tap, plans outfits around what he owns, and emails the Drop on the days worth an email.

Live: https://capsule.makingmylifeeasierthroughnonsense.workers.dev/ (Cloudflare Worker `capsule`, D1 `capsule` in the EU jurisdiction). The old https://cybersecdigestdaily.github.io/capsule/ forwards there (`docs/where.json`), carrying any taps saved in that browser.

## How it works

| Layer | What | Where | When |
|---|---|---|---|
| Price/stock checker | `scraper.py` checks every watched piece (`items.json`) for price and stock **in his size only**: Shopify `/products/<handle>.js`, Uniqlo's UK product API, M&S product data, barbour.com's size endpoint | GitHub Actions | ~07:15, 13:15, 19:15 UK (Cloudflare cron in `cloudflare/` starts it) and on edits |
| Pool | The new-in and sale rails of every source in `finder.json` `pool`: men's pieces in his size, priced in GBP, colour by colour. Round-robin per shop so the big sale rails can't crowd out small shops. First sighting uses the shop's publish date. → `docs/pool.json` | same run | same |
| Deal finder | Strict rules nominate candidates; only URLs the daily review approves (`finder.json` `approve`) show as checked deals → `docs/finds.json` | same run | same |
| Taste engine | `docs/engine.js`: each piece becomes traits (colour, washed finish, texture, fabric, cut, details, brand, style, season, price band). Taps teach trait affinities on top of a prior from the private style brief; old signals fade (~3 month half-life). One slot in five is a labelled wildcard; nothing three-of-a-kind in a row; pieces shown three times with no reaction rest for two weeks unless the price drops | the browser | every visit |
| Accounts + sync | `worker/`: passkeys (no passwords, no email), one-time recovery codes, short codes to link another device. Reactions sync piece by piece (newest deliberate tap wins); settings sync as small patches so devices never overwrite each other. Data in D1, never in this repo | Cloudflare Worker (free plan) | always |
| Private brief | The style brief is in `docs/seed.enc`, AES-256-GCM encrypted with a key derived (PBKDF2-SHA256) from the owner's invite code. The join link unlocks it in the browser and saves it to the private account | browser + D1 | at sign-up |
| Curator | Claude's daily review vetoes clear misses in the pool (`finder.json` `block`), approves deals, keeps the watch list healthy, writes this week's edit (`picks.json`) and decides whether today is a strong day | Claude scheduled task | daily ~09:00 UK |
| The Drop | `docs/drop.html`, emailed over Gmail SMTP with photos only on strong days (`picks.json` `strong`) plus a Sunday roundup. "Rate it in Capsule" opens the piece on the site | GitHub Actions | after the review |
| Deploy | The workflow publishes `worker/`, `docs/`, `wrangler.jsonc` and `package*.json` to the `deploy` branch after every run and every code change; Cloudflare Workers Builds deploys that branch. No deploy tokens | GitHub Actions → Cloudflare | after each run |

## The site

- **For you**: everything in his size, best match first, with the reason on each card ("94% match · Olive · Waffle knit · fills 2 outfits"). This week's edit, new since your last visit, filters.
- **Every piece**: ♡ love, ✕ not for me (hides that piece only, then asks what's off), ⋯ more like this, save, too pricey (rests until the price drops), own something like it, bought it, similar pieces, ask Claude. Undo on everything.
- **Train**: 20 quick swipes (← no, → like, ↑ love) with a duel now and then; it picks what the model knows least about.
- **Watch list**, **Outfits** (formulas for each occasion in `wardrobe.json`, ticks for what he owns, best next buys), **Deals** (the better the match, the smaller the discount it needs).
- **You**: account and devices, this week's report (what moved up and down), saved and loved, what it's learned with pins (▲ always boost, ▼ never show), soft or hard no's, target counts and price ceilings, wildcards, theme.

## Privacy

Taps, the brief, settings and measurements live only in the private account (D1) and on his devices. This repo is public: it holds code, product data, sizes needed for stock checks, and the encrypted brief. Security headers and a strict CSP on every page (`docs/_headers`, `worker/http.js`); same-origin checks on every write; invite-only sign-up (hashes in `wrangler.jsonc`, never the codes).

## Common edits

- **Watch list**: `items.json` (read its `_about`). **Pool sources and rules**: `finder.json`. **Outfits**: `wardrobe.json`. Saving any of them re-runs the checker.
- **Site or Worker**: edit `docs/` or `worker/`; the push republishes in a few minutes without re-checking prices.
- **Tests**: `node tests/engine.test.mjs` · `tests/run-api.sh` (Worker API, local D1) · `tests/run-ui.sh` (headless Chromium, virtual passkeys). `npm install` first.
- **New brief seed**: `CAPSULE_INVITE=<code> node tools/seed.mjs brief.json docs/seed.enc` (keep the brief and code out of the repo).

## On-time runs

GitHub's own scheduler often runs hours late. `cloudflare/` is a tiny separate Worker (`capsule-cron`) that starts the price check at 07:15, 13:15 and 19:15 UK time with a token that can only start this repo's workflow. Re-run `cloudflare/setup.cmd` when the token expires. GitHub's schedule stays as a fallback and skips itself when the data is under 4 hours old.

## Alerts (optional)

Repo secret `DISCORD_WEBHOOK` → BUY signals, restocks in his size, price drops of £5+, new deals, and a red alert if a run fails.

## Don't

- Don't hand-edit `docs/data.json`, `docs/history.json`, `docs/finds.json` or `docs/pool.json`: the checker rewrites them.
- Don't edit the `deploy` branch: change `main` and let the workflow republish.
- Never commit the brief, invite codes, review keys or anything personal.
