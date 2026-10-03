#!/usr/bin/env python3
"""Capsule tracker: watch-list price/stock checker + automatic deal finder.

Runs in GitHub Actions (.github/workflows/update.yml). Standard library only.

Inputs (repo root)
  items.json   the watch list. Add/remove pieces, set targets, mark "bought": true.
  finder.json  rules for the deal finder (stores to scan, palette, size, price caps).
  picks.json   optional hand-curated picks (Claude's weekly review writes this).
  wardrobe.json outfit formulas + staples for the site's Outfits tab (embedded in data.json).
Outputs (docs/, served by GitHub Pages)
  data.json    watch list with live price, stock in YOUR size, signal, low, trend.
  history.json daily price/stock per item (lows + sparklines on the site).
  finds.json   auto-found deals + verified curated picks.
Optional env DISCORD_WEBHOOK: posts new BUY signals, restocks, price drops, new deals.
Optional env SKIP_IF_FRESH_HOURS: exit early when data is newer than this (used for GitHub's
fallback schedule once the Cloudflare cron is dispatching on time).
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
UA = {
    "User-Agent": "Mozilla/5.0 (capsule-tracker; personal use; +https://cybersecdigestdaily.github.io/capsule/)",
    "Accept": "application/json",
}
NOW = dt.datetime.now(dt.timezone.utc)
TODAY = NOW.date().isoformat()
HISTORY_DAYS = 180
SITE = "https://cybersecdigestdaily.github.io/capsule/"


# ---------------------------------------------------------------- utilities
def load(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8").rstrip("\x00"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        if path in (ROOT / "items.json", ROOT / "finder.json"):
            raise  # config errors must fail loudly
        return default


def save(path, obj, compact=False):
    text = json.dumps(obj, separators=(",", ":")) if compact else json.dumps(obj, indent=1, ensure_ascii=False)
    Path(path).write_text(text + "\n", encoding="utf-8")


_last_hit = {}


def fetch_json(url, tries=3, gap=0.8):
    """GET JSON politely: >=gap seconds between hits per host, backoff on 429/5xx."""
    host = urllib.parse.urlsplit(url).netloc
    err = None
    for attempt in range(tries):
        wait = gap - (time.monotonic() - _last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.monotonic()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            err = e
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
            err = e
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    raise err


def money(x):
    return f"£{x:.0f}" if x is not None and float(x).is_integer() else (f"£{x:.2f}" if x is not None else "—")


# ------------------------------------------------------------ size matching
LETTER = {
    "XXS": "XXS", "XS": "XS", "S": "S", "M": "M", "L": "L", "XL": "XL", "XXL": "XXL", "2XL": "XXL",
    "XXXL": "XXXL", "3XL": "XXXL", "4XL": "4XL", "XXXXL": "4XL",
    "XSMALL": "XS", "X-SMALL": "XS", "SMALL": "S", "MEDIUM": "M", "LARGE": "L", "XLARGE": "XL",
    "X-LARGE": "XL", "XXLARGE": "XXL", "XX-LARGE": "XXL",
}


def canon(value):
    """Every canonical size token an option value can mean.

    'L' -> {L}; 'Large' -> {L}; 'XL' -> {XL} (never L); '34W 32L' / 'W34 L32' / '34/32' -> {W34L32};
    '34' -> {W34}; 'UK 10' / '10' / 'UK10 (EU45)' / 'EU44.5/UK10' -> {UK10}; 'M/L (UK 8-13)' -> {M/L}.
    """
    s = re.sub(r"\(.*?\)", " ", str(value or "")).upper()
    s = s.replace("EXTRA LARGE", "XLARGE").replace("EXTRA-LARGE", "XLARGE")
    parts = s.split("/") if ("/" in s and re.search(r"\b(UK|EU|US)\s*\d", s)) else [s]
    out = set()
    for p in parts:
        c = re.sub(r"\s+", "", p)
        if not c:
            continue
        if c in LETTER:
            out.add(LETTER[c])
            continue
        if re.fullmatch(r"(XXS|XS|S|M|L|XL|XXL)/(XS|S|M|L|XL|XXL|XXXL)", c):
            out.add(c)
            continue
        m = (re.fullmatch(r"W(\d{2})L(\d{2})", c) or re.fullmatch(r"(\d{2})W(\d{2})L", c)
             or re.fullmatch(r"W(\d{2})/L(\d{2})", c) or re.fullmatch(r"W?(\d{2})[/X](\d{2})L?", c))
        if m:
            out.add(f"W{m.group(1)}L{m.group(2)}")
            continue
        m = re.fullmatch(r"(UK|EU|US)(\d{1,2}(?:\.5)?)", c)
        if m:
            out.add(f"{m.group(1)}{float(m.group(2)):g}")
            continue
        m = re.fullmatch(r"(\d{1,2}(?:\.5)?)(UK|EU|US)", c)
        if m:
            out.add(f"{m.group(2)}{float(m.group(1)):g}")
            continue
        m = re.fullmatch(r"W?(\d{2})W?", c)
        if m and 24 <= int(m.group(1)) <= 50:
            out.add(f"W{m.group(1)}")
            continue
        m = re.fullmatch(r"(\d{1,2}(?:\.5)?)", c)
        if m and float(m.group(1)) <= 16:
            out.add(f"UK{float(m.group(1)):g}")
            continue
        out.add(c)  # unknown label: exact comparison only
    return out


def want_set(size):
    """'L|XL' -> {L, XL}. Alternatives separated by |."""
    out = set()
    for alt in str(size or "").split("|"):
        out |= canon(alt)
    return out


def variant_options(v):
    opts = [v.get(k) for k in ("option1", "option2", "option3") if v.get(k)]
    return opts or [x.strip() for x in str(v.get("title", "")).split(" / ")]


def size_label(v):
    """The option value that holds the size (for 'also in stock: XL' hints)."""
    for o in variant_options(v):
        c = canon(o)
        if any(re.fullmatch(r"(XXS|XS|S|M|L|XL|XXL|XXXL|4XL|W\d+(L\d+)?|UK[\d.]+|EU[\d.]+|US[\d.]+|[SMLX]+/[SMLX]+)", t) for t in c):
            return o
    return v.get("title", "")


def passes_filter(v, variant_filter):
    """Colour/width filter for products that hold several colours in one listing."""
    if not variant_filter:
        return True
    vf = variant_filter.strip().lower()
    return any(o.strip().lower() == vf for o in variant_options(v)) or vf in str(v.get("title", "")).lower()


def matches(v, wanted, variant_filter=None):
    return passes_filter(v, variant_filter) and any(canon(o) & wanted for o in variant_options(v))


def evaluate_variants(variants, size, variant_filter=None, cents=True):
    """Price/stock for YOUR size. Returns dict or None if the size isn't offered at all."""
    wanted = want_set(size)
    div = 100 if cents else 1
    mine = [v for v in variants if matches(v, wanted, variant_filter)]
    if not mine:
        return None
    live = [v for v in mine if v.get("available")]
    pool = live or mine

    def num(x):
        try:
            return float(x) / div if x not in (None, "") else None
        except (TypeError, ValueError):
            return None

    best = min(pool, key=lambda v: num(v.get("price")) or 1e9)
    price = num(best.get("price"))
    was = num(best.get("compare_at_price"))
    disc = round(100 * (1 - price / was)) if (was and price and was > price) else 0
    alt = []
    for v in variants:
        if not passes_filter(v, variant_filter):
            continue
        if v.get("available") and v not in mine:
            lab = size_label(v)
            if lab not in alt:
                alt.append(lab)
    return {"price": price, "was": was if disc else None, "discount_pct": disc,
            "in_stock": bool(live), "alt_sizes": alt[:6]}


# --------------------------------------------------------------- images etc
STORES = {
    "jeanstore.co.uk": "Jeanstore", "universalworks.com": "Universal Works", "communityclothing.co.uk": "Community Clothing",
    "parasolstore.co.uk": "Parasol Store", "finisterre.com": "Finisterre", "oliverspencer.co.uk": "Oliver Spencer",
    "frenchconnection.com": "French Connection", "cdlp.com": "CDLP", "routeone.co.uk": "Route One", "slamcity.com": "Slam City",
    "footpatrol.com": "Footpatrol", "urbanindustry.co.uk": "Urban Industry", "stuartslondon.com": "Stuarts London",
    "goodhoodstore.com": "Goodhood", "johnwhiteshoes.com": "John White", "oipolloi.com": "Oi Polloi", "uniqlo.com": "Uniqlo",
    "marksandspencer.com": "M&S", "johnlewis.com": "John Lewis", "folkclothing.com": "Folk", "albamclothing.com": "Albam",
    "uskees.co.uk": "Uskees", "walklondonshoes.co.uk": "Walk London",
}


def store_label(url):
    host = urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.")
    return STORES.get(host, host)


def https(src):
    if not src:
        return None
    src = src if isinstance(src, str) else (src.get("src") or "")
    return ("https:" + src) if src.startswith("//") else (src or None)


def pick_image(d, variant_filter=None):
    """Product image, preferring the tracked colour's own photo."""
    if variant_filter:
        for v in d.get("variants", []):
            if passes_filter(v, variant_filter) and v.get("featured_image"):
                return https(v["featured_image"])
    return https(d.get("featured_image") or (d.get("images") or [None])[0])


# ------------------------------------------------------------- watch list
def check_item(item):
    if item.get("check") != "shopify":
        return {}
    js = re.sub(r"(\?.*)?$", "", item["url"]).rstrip("/") + ".js"
    d = fetch_json(js)
    res = evaluate_variants(d.get("variants", []), item["size"], item.get("variant"), cents=True)
    if res is None:
        offered = sorted({size_label(v) for v in d.get("variants", [])})[:12]
        raise ValueError(f"size '{item['size']}' not offered (has: {', '.join(offered)})")
    res["image"] = pick_image(d, item.get("variant"))
    return res


def signal_for(item, rec):
    if item.get("bought"):
        return "BOUGHT"
    if item.get("check") != "shopify":
        return "CHECK MANUALLY"
    if rec.get("in_stock") and rec.get("price") is not None and rec["price"] <= item["target"]:
        return "BUY"
    if rec.get("in_stock") and rec.get("discount_pct", 0) >= 10:
        return "SALE"
    if rec.get("in_stock"):
        return "WATCHING"
    return "SOLD OUT"


def update_history(hist, key, price, in_stock):
    series = hist.get(key, [])
    entry = [TODAY, price, None if in_stock is None else (1 if in_stock else 0)]
    if series and series[-1][0] == TODAY:
        series[-1] = entry
    else:
        series.append(entry)
    hist[key] = series[-HISTORY_DAYS:]
    return hist[key]


def trend(series):
    prices = [(d, p) for d, p, s in series if p is not None]
    out = {}
    if prices:
        low_d, low_p = min(prices, key=lambda x: (x[1], x[0]))
        out["low"], out["low_date"] = low_p, low_d
    prev = [p for d, p, s in series if d < TODAY and p is not None]
    if prev and series and series[-1][1] is not None:
        out["change"] = round(series[-1][1] - prev[-1], 2)
    return out


# -------------------------------------------------------------- deal finder
ROLE_RULES = [
    ("boot", r"chelsea|boot"), ("wallabee", r"wallabee"),
    ("overshirt", r"overshirt|shirt jacket|shacket"), ("cardigan", r"cardigan"), ("fleece", r"fleece"),
    ("jacket", r"jacket|coat|parka|blouson|harrington|bomber|m-?65"),
    ("tee", r"t-shirt|\btee\b|henley"),
    ("knit", r"jumper|sweater|knit|lambswool|merino|roll ?neck"), ("sweat", r"sweat|hoodie|hooded"),
    ("jeans", r"\bjeans?\b|denim"),
    ("trouser", r"pleat|trouser"), ("chino", r"chino|pant|cord|fatigue"),
]


def infer_role(title, category):
    t = (title or "").lower()
    if category == "Footwear":
        for role, rx in ROLE_RULES[:2]:
            if re.search(rx, t):
                return role
        return "trainer"
    for role, rx in ROLE_RULES[2:]:
        if re.search(rx, t):
            return role
    return None


def clean_title(title, brand):
    """'Levi's® Polk Jacket - Vintage Khaki' -> 'Polk Jacket, Vintage Khaki'."""
    t = re.sub(r"^(men's|mens)\s+", "", (title or "").strip(), flags=re.I)
    for b in {brand, brand.replace("®", "").strip()}:
        if b and t.lower().startswith(b.lower() + " "):
            t = t[len(b):].strip()
    t = re.sub(r"\s+[-–]\s+", ", ", t)
    return t[:1].upper() + t[1:] if t else t


def words_in(text, words):
    return [w for w in words if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", text)]


def run_finder(cfg, watched_handles, prev_finds):
    first_seen = {f.get("key"): f.get("first_seen", TODAY) for f in prev_finds.get("finds", [])}
    cands, errors = {}, []
    palette = [p.lower() for p in cfg.get("palette", [])]
    blocked = {re.sub(r"^https?://(www\.)?", "", u).split("?")[0].rstrip("/") for u in cfg.get("block", [])}
    excl = [w.lower() for w in cfg.get("exclude", [])]
    gender_excl = [w.lower() for w in cfg.get("exclude_gender", [])]
    for src in cfg.get("sources", []):
        store, coll = src["store"], src["collection"]
        for page in range(1, int(src.get("pages", 1)) + 1):
            try:
                d = fetch_json(f"https://{store}/collections/{coll}/products.json?limit=250&page={page}", tries=2, gap=1.0)
            except Exception as e:  # one bad store never sinks the run
                errors.append(f"{store}/{coll}: {str(e)[:80]}")
                break
            prods = d.get("products", [])
            if not prods:
                break
            for p in prods:
                if p.get("handle") in watched_handles:
                    continue
                title = (p.get("title") or "").lower()
                ptype = (p.get("product_type") or "").lower()
                tags = " ".join(p.get("tags") or []).lower() if isinstance(p.get("tags"), list) else str(p.get("tags", "")).lower()
                colours = " ".join(o for v in p.get("variants", []) for o in variant_options(v)).lower()
                if words_in(f"{title} {ptype}", gender_excl) or words_in(title, excl):
                    continue
                brand = (p.get("vendor") or "").lower()
                cat = None
                for c in cfg["categories"]:
                    if not words_in(f"{title} {ptype}", c["keywords"]):
                        continue
                    req = c.get("require_any")
                    if req and not words_in(f"{title} {ptype} {tags}", req):
                        continue
                    cat = c
                    break
                if not cat:
                    continue
                if words_in(f"{title} {ptype}", [w.lower() for w in cat.get("exclude", [])]):
                    continue
                if f"{store}/products/{p.get('handle')}" in blocked:
                    continue
                brand_block = cat.get("exclude_brands", []) if cat.get("allow_brands_any") else cfg.get("exclude_brands", [])
                if words_in(f"{brand} {title}", [b.lower() for b in brand_block]):
                    continue
                pal = words_in(f"{title} {colours}", palette + [x.lower() for x in cat.get("extra_palette", [])])
                if not pal:
                    continue
                res = evaluate_variants(p.get("variants", []), cat["size"], cents=False)
                if not res or not res["in_stock"] or not res["price"]:
                    continue
                disc, price = res["discount_pct"], res["price"]
                tier = None
                if disc >= cfg.get("min_discount", 25) and price <= cat["cap"]:
                    tier = "deal"
                elif disc >= cfg.get("premium_min_discount", 40) and price <= cat.get("premium_cap", cat["cap"]):
                    tier = "premium −40%+"
                if not tier:
                    continue
                key = f"{store}/{p['handle']}"
                score = disc + (8 if words_in(title, palette) else 0) - 10 * price / cat.get("premium_cap", cat["cap"])
                label = src.get("label", store)
                vendor = (p.get("vendor") or "").strip()
                if not vendor or vendor.lower() in ("men's", "mens", "men", "women's", "unisex"):
                    vendor = label
                if vendor.isupper() and len(vendor) > 4:
                    vendor = vendor.title()
                imgs = p.get("images") or []
                rec = {
                    "key": key, "first_seen": first_seen.get(key, TODAY), "store": label,
                    "brand": vendor, "name": clean_title(p.get("title"), vendor),
                    "image": https(imgs[0].get("src")) if imgs else None,
                    "url": f"https://{store}/products/{p['handle']}", "category": cat["name"],
                    "price": price, "was": res["was"], "discount_pct": disc,
                    "size": cat["size"].split("|")[0], "colour": pal[0], "tier": tier, "score": round(score, 1),
                    "role": infer_role(p.get("title"), cat["name"]),
                    "why": f"{disc}% off at {label} · {cat['size'].split('|')[0]} in stock · {pal[0]} · {cat['name'].lower()}",
                }
                # one entry per product line: same model in another colour (same store) or same title elsewhere
                base = re.split(r"\s+-\s+|,\s+", (rec["name"] or "").lower())[0]
                for dupe in (f"{label}|{base}", (rec["name"] or "").lower()):
                    if dupe in cands and cands[dupe]["score"] >= rec["score"]:
                        break
                else:
                    for dupe in (f"{label}|{base}", (rec["name"] or "").lower()):
                        cands[dupe] = rec
    uniq = {r["key"]: r for r in cands.values()}
    ranked = sorted(uniq.values(), key=lambda r: (-r["score"], r["price"]))
    out, per_cat, per_store = [], {}, {}
    for r in ranked:
        if per_cat.get(r["category"], 0) >= cfg.get("max_per_category", 4):
            continue
        if per_store.get(r["store"], 0) >= cfg.get("max_per_store", 5):
            continue
        out.append(r)
        per_cat[r["category"]] = per_cat.get(r["category"], 0) + 1
        per_store[r["store"]] = per_store.get(r["store"], 0) + 1
        if len(out) >= cfg.get("max_finds", 16):
            break
    return out, errors


def verify_picks(picks):
    out = []
    for pk in picks.get("picks", []):
        rec = dict(pk)
        url = pk.get("url", "")
        if "/products/" in url and pk.get("size"):
            try:
                d = fetch_json(re.sub(r"(\?.*)?$", "", url).rstrip("/") + ".js")
                res = evaluate_variants(d.get("variants", []), pk["size"], pk.get("variant"), cents=True)
                rec["image"] = pick_image(d, pk.get("variant"))
                rec["store"] = store_label(url)
                rec.setdefault("brand", d.get("vendor") if (d.get("vendor") or "").lower() not in ("men's", "mens", "") else rec["store"])
                if res:
                    rec.update({"price_now": res["price"], "in_stock": res["in_stock"],
                                "discount_pct": res["discount_pct"], "was": res["was"], "verified": TODAY})
                else:
                    rec.update({"in_stock": False, "verified": TODAY})
            except Exception as e:
                rec.update({"verify_error": str(e)[:80]})
        out.append(rec)
    return out


# ------------------------------------------------------------ notifications
def notify(lines):
    hook = os.environ.get("DISCORD_WEBHOOK", "").strip()
    for ln in lines:
        print("alert:", ln)
    if not hook or not lines:
        return
    msg, chunks = "", []
    for ln in ["**Capsule update** — " + SITE] + lines:
        if len(msg) + len(ln) + 1 > 1900:
            chunks.append(msg)
            msg = ""
        msg += ln + "\n"
    chunks.append(msg)
    for c in chunks:
        try:
            req = urllib.request.Request(hook, data=json.dumps({"content": c}).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": UA["User-Agent"]})
            urllib.request.urlopen(req, timeout=20).read()
        except Exception as e:
            print(f"discord notify failed: {e}", file=sys.stderr)


# --------------------------------------------------------------------- main
def main():
    cfg = load(ROOT / "items.json", None)
    finder = load(ROOT / "finder.json", {})
    picks = load(ROOT / "picks.json", {"picks": []})
    prev = load(DOCS / "data.json", {"items": []})
    prev_by_id = {str(i.get("id")): i for i in prev.get("items", [])}
    prev_finds = load(DOCS / "finds.json", {"finds": []})
    hist = load(DOCS / "history.json", {})
    wardrobe = load(ROOT / "wardrobe.json", {})

    skip_h = os.environ.get("SKIP_IF_FRESH_HOURS", "").strip()
    if skip_h and prev.get("generated"):
        age = (NOW - dt.datetime.fromisoformat(prev["generated"].replace("Z", "+00:00"))).total_seconds() / 3600
        if age < float(skip_h):
            print(f"Data is {age:.1f}h old (< {skip_h}h): skipping this fallback run.")
            return

    results, errors, checked = [], 0, 0
    for item in cfg["items"]:
        rec = dict(item)
        rec["checked"] = TODAY
        rec["store"] = store_label(item["url"])
        if prev_by_id.get(str(item["id"]), {}).get("image"):
            rec["image"] = prev_by_id[str(item["id"])]["image"]
        key = str(item["id"])
        try:
            if not item.get("bought"):
                if item.get("check") == "shopify":
                    checked += 1
                rec.update(check_item(item))
            if item.get("check") != "shopify" and not item.get("bought"):
                rec["price"] = item.get("last_price")
                rec["in_stock"] = None
                if item.get("checked_on"):
                    rec["stale_days"] = (NOW.date() - dt.date.fromisoformat(item["checked_on"])).days
            rec["signal"] = signal_for(item, rec)
        except Exception as e:
            errors += 1
            rec["signal"] = "LINK ERROR"
            rec["error"] = str(e)[:140]
            last = prev_by_id.get(key, {})
            if last.get("price") is not None:
                rec["last_seen_price"] = last["price"]
        if item.get("check") == "shopify" and not item.get("bought") and rec["signal"] != "LINK ERROR":
            series = update_history(hist, key, rec.get("price"), rec.get("in_stock"))
            rec.update(trend(series))
        elif key in hist:
            rec.update(trend(hist[key]))
        results.append(rec)

    if checked and errors > max(4, checked // 2):
        print(f"ABORT: {errors}/{checked} checks failed — looks like a network block; keeping yesterday's data.")
        notify([f"🔴 Capsule checker: {errors}/{checked} item checks failed this run — data not updated."])
        sys.exit(2)

    watched = {urllib.parse.urlsplit(i["url"]).path.rstrip("/").split("/")[-1] for i in cfg["items"]}
    finds, finder_errors = run_finder(finder, watched, prev_finds) if finder else ([], [])
    picked = verify_picks(picks)

    # ---- alerts: only changes since the previous run
    lines = []

    def full(r):
        return f"{r.get('brand', '')} {r['name']}".strip()

    for r in results:
        p = prev_by_id.get(str(r["id"]))
        if r["signal"] in ("BOUGHT", "LINK ERROR", "CHECK MANUALLY"):
            continue
        if r["signal"] == "BUY" and (not p or p.get("signal") != "BUY"):
            lines.append(f"🟢 **BUY** {full(r)} — {money(r.get('price'))} (target {money(r['target'])}) {r['url']}")
        elif p and r.get("in_stock") and p.get("in_stock") is False:
            lines.append(f"🔁 Back in your size: {full(r)} — {money(r.get('price'))} {r['url']}")
        elif p and r.get("in_stock") and p.get("price") and r.get("price") and p["price"] - r["price"] >= 5:
            lines.append(f"⬇️ Price drop: {full(r)} {money(p['price'])} → {money(r['price'])} {r['url']}")
    prev_keys = {f.get("key") for f in prev_finds.get("finds", [])}
    fresh = [f for f in finds if f["key"] not in prev_keys][:5]
    for f in fresh:
        lines.append(f"🆕 Deal: {f['brand']} {f['name']} — {money(f['price'])} (−{f['discount_pct']}%, {f['store']}) {f['url']}")

    DOCS.mkdir(exist_ok=True)
    counts = {}
    for r in results:
        counts[r["signal"]] = counts.get(r["signal"], 0) + 1
    save(DOCS / "data.json", {"generated": NOW.isoformat().replace("+00:00", "Z"), "sizes": cfg.get("sizes", {}),
                              "errors": errors, "counts": counts, "items": results, "wardrobe": wardrobe})
    save(DOCS / "history.json", hist, compact=True)
    save(DOCS / "finds.json", {"generated": NOW.isoformat().replace("+00:00", "Z"), "finds": finds,
                               "picks": picked, "picks_updated": picks.get("updated"), "errors": finder_errors})
    notify(lines)
    print(f"{len(results)} items, {checked} checked, {errors} errors | {len(finds)} finds "
          f"({len(fresh)} new), {len(picked)} picks | {len(lines)} alerts")
    for e in finder_errors:
        print("finder:", e)


if __name__ == "__main__":
    main()
