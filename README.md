# Capsule

A wardrobe site that learns. It ranks ~3,500 pieces (menswear and womenswear) from ~48 vetted UK shops for each person's own taste and sizes, builds complete outfits around what they already own, finds the reductions worth having, and (for the owner) checks a watch list three times a day and emails the Drop on the days worth an email.

Live: https://capsule.makingmylifeeasierthroughnonsense.workers.dev/ (Cloudflare Worker `capsule`, D1 `capsule` in the EU jurisdiction). The old https://cybersecdigestdaily.github.io/capsule/ forwards there (`docs/where.json`), carrying any taps saved in that browser.

## How it works

| Layer | What | Where | When |
|---|---|---|---|
| Price/stock checker | `scraper.py` checks every watched piece (`items.json`) for price and stock **in his size only**: Shopify `/products/<handle>.js`, Uniqlo's UK product API, M&S product data, barbour.com's size endpoint | GitHub Actions | ~07:15, 13:15, 19:15 UK (Cloudflare cron in `cloudflare/` starts it) and on edits |
| Pool | The new-in and sale rails of every source in `finder.json` `pool`, menswear and womenswear, in stock in any common size, priced in GBP, colour by colour. Each piece lists every size in stock (`zs`: letters, waist/leg, UK/EU/US shoes, UK dress sizes as `D10`), its department (`g`: womenswear or unisex; menswear otherwise) and the owner's size when it's in stock (`z`). Only kids', homeware, jewellery, lingerie and swimwear are left out: the owner's house rules (white, loud colours, logo brands, blazers, the daily review's vetoes) are written on pieces as `h` flags that only his view hides. Round-robin per shop so the big sale rails can't crowd out small shops; a shop from the other department lends only a few unisex pieces. First sighting uses the shop's publish date. → `docs/pool.json` (menswear + unisex) and `docs/pool-w.json` (womenswear + unisex) | same run | same |
| Deal finder | Strict rules nominate candidates; only URLs the daily review approves (`finder.json` `approve`) show as checked deals → `docs/finds.json` | same run | same |
| Taste engine | `docs/engine.js`: each piece becomes traits (colour, washed finish, texture, fabric, cut, details, brand, style, season, price band). Taps teach trait affinities on top of a prior from the style brief (the owner's private one, or the questions anyone answers: a v2 brief starts neutral, nothing of the owner's taste); menswear, womenswear or both; UK dress sizes and petite/tall from height; 19 styles from minimal and workwear to going out, alternative and Y2K; old signals fade (~3 month half-life). A "no" hides a piece everywhere (soft "sink to the bottom" is a setting). Passing on a piece also hides the same piece under another listing, at another shop or with the same photo, and its other colours unless colour was the reason. Colourways show as one card. One slot in five is a labelled wildcard; nothing three-of-a-kind in a row; pieces shown three times with no reaction rest for two weeks unless the price drops | the browser | every visit |
| Outfits | `docs/outfits.js`: complete looks for each occasion from what you own plus the best pieces in your size: "wear it now", "complete it" (the fewest new pieces) and a fresh look. Womenswear occasions (`W_FORMULAS`) add going out and can be dressed two ways (separates or a dress), whichever is better. Judged on colour (classic pairings, one accent, no brown with black, tonal looks), texture and pattern (one pattern, two textures, no double denim) and what each occasion asks for. Shuffle, today's look, best next buys | the browser | every visit |
| Accounts + sync | `worker/`: passkeys (no passwords, no email; a password manager's extension can answer, or ask for this device or a phone), one-time recovery codes, short codes to link another device. Invite-only: invites in `wrangler.jsonc` (hashes) or made by the owner on the site (D1, single use, 14 days). Reactions sync piece by piece and the server merges them the same way (newest deliberate tap wins; a quiet update can't undo a tap); settings sync as small patches so devices never overwrite each other. Data in D1, never in this repo | Cloudflare Worker (free plan) | always |
| Private brief | The style brief is in `docs/seed.enc`, AES-256-GCM encrypted with a key derived (PBKDF2-SHA256) from the owner's invite code. The join link unlocks it in the browser and saves it to the private account | browser + D1 | at sign-up |
| Curator | Claude's daily review vetoes clear misses for the owner (`finder.json` `block`: flags them for his view only), approves deals, keeps the watch list healthy, writes this week's edit (`picks.json`) and decides whether today is a strong day | Claude scheduled task | daily ~09:00 UK |
| The Drop | `docs/drop.html`, emailed over Gmail SMTP with photos only on strong days (`picks.json` `strong`) plus a Sunday roundup. "Rate it in Capsule" opens the piece on the site | GitHub Actions | after the review |
| Deploy | The workflow publishes `worker/`, `docs/`, `wrangler.jsonc` and `package*.json` to the `deploy` branch after every run and every code change; Cloudflare Workers Builds deploys that branch. No deploy tokens | GitHub Actions → Cloudflare | after each run |

## The site

Five places (a dock on phones, a top bar on desktop), plus the account button at the top right.

- **For you**: everything in your size, best match first, with the reason on each card. Search, sort (best match, newest, price, discount) and kind filters. The owner also gets Claude's weekly edit; everyone gets "new since your last visit". First visit without a style: who you shop for, then seven quick questions (height, sizes, brands, styles, colours, fit, budget and occasions) and a 30-piece taste test across styles, kinds of piece and brands; or just browse.
- **Every piece**: ♡ love, ✕ not for me (hides it everywhere, with its other versions; a reason like "colour" offers "hide everything in black"), ⋯ more like this, save, too pricey, own something like it, bought it, similar pieces, ask Claude. Undo on everything.
- **Swipe**: 20 quick swipes (← pass hides it for good, → like, ↑ love, ↓ skip), one colour per piece per deck, and cards hidden since the deck was dealt are skipped. New people start with the taste test (30 cards, two thirds from the styles they picked), then see what it learned.
- **Outfits**: today's look, complete looks per occasion with why they work and shuffle, best next buys, and your wardrobe (tick the owner's staples, or add anything you own by kind and colour).
- **Deals**: reductions in your size on pieces that match you (nothing you've ruled out), one card per piece, the better the match the smaller the discount it needs; seven sorts.
- **Saved**: loved, liked, saved and hidden (with bring back); the owner's watch list lives here too.
- **You**: account and devices, invites (owner), your style, sizes and fit (they decide what's in stock for you), what it's learned with pins, targets and price ceilings, feed and look, privacy and your data (export, delete, clear this device).

The owner's own layer (watch list, Claude's edit and approved deals, wardrobe staples, updater status) shows only to the owner account or a device holding his unlocked brief. Members and visitors get their own Capsule.

## Privacy

Taps, briefs, settings, sizes, measurements and wardrobes live only in each person's private account (D1, EU) and on their devices; signed out, nothing leaves the browser. `docs/privacy.html` is the notice. This repo is public: it holds code, product data, the owner's sizes needed for stock checks, and his encrypted brief. Security headers and a strict CSP on every page (`docs/_headers`, `worker/http.js`); same-origin checks on every write; invite-only sign-up (hashes in `wrangler.jsonc`, never the codes).

## Common edits

- **Watch list**: `items.json` (read its `_about`). **Pool sources and rules**: `finder.json` (`g`, `w_new`/`w_sale`, `m_new`/`m_sale`, `own_brand`: see its `_about`). **Occasions**: `docs/outfits.js` `DEFAULT_FORMULAS` (menswear, copied to `wardrobe.json` for the Drop: keep them in step) and `W_FORMULAS`; the owner's staples are in `wardrobe.json`. Saving a JSON file re-runs the checker.
- **Site or Worker**: edit `docs/` or `worker/`; the push republishes in a few minutes without re-checking prices.
- **Tests**: `npm test` (engine + outfits; CI runs these before every publish) · `tests/run-api.sh` (Worker API, local D1) · `tests/run-ui.sh` (headless Chromium, virtual passkeys, a menswear member and a womenswear member invited by the owner, a visitor). `npm install` first.
- **Invite someone**: You › Invite people (owner), or add `sha256("inv:" + code)` to `INVITE_HASHES`.
- **New brief seed**: `CAPSULE_INVITE=<code> node tools/seed.mjs brief.json docs/seed.enc` (keep the brief and code out of the repo).

## On-time runs

GitHub's own scheduler often runs hours late. `cloudflare/` is a tiny separate Worker (`capsule-cron`) that starts the price check at 07:15, 13:15 and 19:15 UK time with a token that can only start this repo's workflow. Re-run `cloudflare/setup.cmd` when the token expires. GitHub's schedule stays as a fallback and skips itself when the data is under 4 hours old.

## Alerts (optional)

Repo secret `DISCORD_WEBHOOK` → BUY signals, restocks in his size, price drops of £5+, new deals, and a red alert if a run fails.

## Don't

- Don't hand-edit `docs/data.json`, `docs/history.json`, `docs/finds.json`, `docs/pool.json` or `docs/pool-w.json`: the checker rewrites them.
- Don't edit the `deploy` branch: change `main` and let the workflow republish.
- Never commit the brief, invite codes, review keys or anything personal.
