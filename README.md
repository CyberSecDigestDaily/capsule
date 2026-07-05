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

## Maintaining it (mostly hands-off)
- **Bought something?** Tick the checkbox on the site — it greys out and drops off buy
  signals (saved in your browser). Also tell Claude so the item comes off the watch
  permanently (repo-side).
- **Add/remove items:** ask Claude — with the GitHub connector authorised in Claude's
  settings, Claude commits `items.json` changes straight to this repo. Without it, Claude
  edits the local copy in your STYLE folder and you drag-and-drop the file to GitHub.
- **New finds:** the daily Claude scrub curates taste-matched alternatives; they publish to
  the site's "New finds" section via `docs/finds.json` (auto-committed once the GitHub
  connector is authorised; until then Claude hands you the updated file to upload).

## Notes
- Private repo still gives you a public Pages URL (fine — it's just clothes).
- If a product handle changes (retailers do this), the item shows LINK ERROR — tell Claude
  and it'll re-source it.
