# Capsule Tracker — deployed website kit

A tiny site that checks your watch-list stock/prices **every morning automatically**
(even with your laptop off) and shows buy signals at a public URL.

## How it works
- `scraper.py` checks each item daily. Shopify retailers (Jeanstore, Universal Works,
  Community Clothing, French Connection, CDLP, Oliver Spencer, Finisterre) expose exact
  per-size stock via their `/products/<handle>.js` endpoint — rock solid.
  Uniqlo / M&S / John Lewis block bots, so those items show last-known price + "check manually".
- GitHub Actions runs it daily at 07:35 UK (`.github/workflows/update.yml`) and commits `docs/data.json`.
- GitHub Pages serves `docs/index.html`, which reads that JSON. Total cost: £0.

## Setup (10 minutes, one-time)
1. Create a free account at github.com (if you don't have one).
2. New repository → name it `capsule` → Private is fine → Create.
3. Upload everything in THIS folder to the repo (drag-and-drop works:
   `Add file → Upload files`). Keep the folder structure — `.github/workflows/update.yml`
   must stay at that path.
4. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch `main`, folder `/docs` → Save.
5. Repo → Actions tab → enable workflows → open "Daily capsule price check" → "Run workflow"
   to do the first check.

Your site appears at `https://<your-username>.github.io/capsule/` a minute later.

## Maintaining it
- Add/remove items: edit `items.json` (or ask Claude to). `"check": "shopify"` items are
  auto-verified to your exact size; `"check": "manual"` items just display.
- Bought something? Delete its entry from `items.json` (or ask Claude).
- The "auto-discover similar clothes" part stays with Claude's daily scrub — taste-matching
  needs judgement, not just a script. New finds land in the tracker/dashboard; promote the
  keepers into `items.json` so the site watches them too.

## Notes
- Private repo still gives you a public Pages URL (fine — it's just clothes).
- If a product handle changes (retailers do this), the item shows LINK ERROR — tell Claude
  and it'll re-source it.
