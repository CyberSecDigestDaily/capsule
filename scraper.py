#!/usr/bin/env python3
"""Capsule tracker: watch-list price/stock checker + automatic deal finder.

Runs in GitHub Actions (.github/workflows/update.yml). Standard library only.

Live checks ("check" in items.json): shopify (/products/<handle>.js), uniqlo (Uniqlo UK commerce
API), mands (M&S product page data), barbour (barbour.com variation endpoint). "manual" = a shop
that blocks automated checks (shows last confirmed price). A live shop that refuses one run falls
back to its last good price for that run instead of showing a broken link.

Inputs (repo root)
  items.json   the watch list. Add/remove pieces, set targets, mark "bought": true.
  finder.json  rules for the deal finder (stores to scan, palette, size, price caps).
  picks.json   optional hand-curated picks (Claude's weekly review writes this).
  wardrobe.json outfit formulas + staples for the site's Outfits tab (embedded in data.json).
Outputs (docs/, served by GitHub Pages)
  data.json    watch list with live price, stock in YOUR size, signal, low, trend.
  history.json daily price/stock per item (lows + sparklines on the site).
  finds.json   deals Claude's review has approved ("finds"), candidates awaiting review ("candidates"),
               verified curated picks.
  drop.html    the Daily Drop email.
Optional env DISCORD_WEBHOOK: posts new BUY signals, restocks, price drops, new deals.
Optional env GMAIL_USER + GMAIL_APP_PASSWORD (+ DROP_TO): email the Drop over Gmail SMTP with the photos
embedded, once a day after the morning review. Without them Claude's review sends it via its Gmail
connector, which strips images.
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
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"


class Blocked(Exception):
    """The shop refused or timed out (bot wall, rate limit). Not a dead link."""


def fetch_raw(url, tries=3, gap=0.8, headers=None):
    """GET politely: >=gap seconds between hits per host, backoff on 429/5xx."""
    host = urllib.parse.urlsplit(url).netloc
    hdrs = dict(UA, **(headers or {}))
    err = None
    for attempt in range(tries):
        wait = gap - (time.monotonic() - _last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.monotonic()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            err = e
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = e
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    raise err


def fetch_json(url, tries=3, gap=0.8, headers=None):
    for attempt in range(tries):
        try:
            return json.loads(fetch_raw(url, tries=tries, gap=gap, headers=headers))
        except json.JSONDecodeError:
            if attempt < tries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise


def guarded(fn):
    """Run a non-Shopify check; turn refusals/timeouts into Blocked, keep 404/410 as real errors."""
    def wrap(*a, **k):
        try:
            return fn(*a, **k)
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                raise ValueError(f"product gone (HTTP {e.code})")
            raise Blocked(f"HTTP {e.code}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
            raise Blocked(str(e)[:80] or e.__class__.__name__)
    return wrap


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
    "uskees.co.uk": "Uskees", "walklondonshoes.co.uk": "Walk London", "barbour.com": "Barbour",
    "blundstone.co.uk": "Blundstone", "solovair.co.uk": "Solovair", "oipolloi.com": "Oi Polloi",
    "couvertureandthegarbstore.com": "Couverture & The Garbstore",
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
LIVE = ("shopify", "uniqlo", "mands", "barbour")
BROWSER = {"User-Agent": BROWSER_UA, "Accept-Language": "en-GB,en;q=0.9"}


def kind_for(url, declared=None):
    """Which live check a URL gets. declared "manual" always wins."""
    if declared:
        return declared
    host = urllib.parse.urlsplit(url).netloc.lower()
    if host.endswith("uniqlo.com"):
        return "uniqlo"
    if host.endswith("marksandspencer.com"):
        return "mands"
    if host.endswith("barbour.com"):
        return "barbour"
    return "shopify" if "/products/" in url else "manual"


def check_shopify(url, size, variant):
    d = fetch_json(re.sub(r"(\?.*)?$", "", url).rstrip("/") + ".js")
    res = evaluate_variants(d.get("variants", []), size, variant, cents=True)
    if res is None:
        offered = sorted({size_label(v) for v in d.get("variants", [])})[:12]
        raise ValueError(f"size '{size}' not offered (has: {', '.join(offered)})")
    res["image"] = pick_image(d, variant)
    return res


@guarded
def check_uniqlo(url, size, variant):
    """Uniqlo UK commerce API (the same JSON their own site loads)."""
    m = re.search(r"/products/([A-Z]?\d{6}-\d{3})(?:/(\d{2}))?", url)
    if not m:
        raise ValueError("not a Uniqlo product URL (expected /products/E123456-000/00)")
    base = f"https://www.uniqlo.com/uk/api/commerce/v5/en/products/{m.group(1)}/price-groups/{m.group(2) or '00'}"
    hdrs = dict(BROWSER, **{"Accept": "application/json", "x-fr-clientid": "uq.gb.web-spa"})
    det = fetch_json(base + "/details?httpFailure=true", headers=hdrs, gap=1.0)["result"]
    l2 = fetch_json(base + "/l2s?withPrices=true&withStocks=true&httpFailure=true", headers=hdrs, gap=1.0)["result"]
    cols = {c["displayCode"]: c["name"].title() for c in det.get("colors", [])}
    sizes = {z["displayCode"]: z["name"] for z in det.get("sizes", [])}
    plds = {z["displayCode"]: z["name"] for z in det.get("plds", [])}
    variants = []
    for x in l2.get("l2s", []):
        pr, st = l2.get("prices", {}).get(x["l2Id"], {}), l2.get("stocks", {}).get(x["l2Id"], {})
        base_p = (pr.get("base") or {}).get("value")
        promo = (pr.get("promo") or {}).get("value")
        price = promo if promo is not None else base_p
        opts = {"option1": sizes.get(x["size"]["displayCode"], x["size"]["displayCode"]),
                "option2": cols.get(x["color"]["displayCode"], x["color"]["displayCode"])}
        if len(plds) > 1:
            opts["option3"] = plds.get(x.get("pld", {}).get("displayCode"), "")
        variants.append(dict(opts, title=" / ".join(opts.values()), price=price,
                             compare_at_price=base_p if (promo is not None and base_p and promo < base_p) else None,
                             available=st.get("statusCode") in ("IN_STOCK", "LOW_STOCK"), _col=x["color"]["displayCode"]))
    res = evaluate_variants(variants, size, variant, cents=False)
    if res is None:
        raise ValueError(f"size '{size}' not offered (has: {', '.join(sorted(set(sizes.values())))})")
    col = next((v["_col"] for v in variants if passes_filter(v, variant)), None)
    main = (det.get("images") or {}).get("main") or {}
    res["image"] = (main.get(col) or next(iter(main.values()), {})).get("image")
    return res


@guarded
def check_mands(url, size, variant):
    """M&S product page: the __NEXT_DATA__ block holds every colour/size with live stock."""
    page = fetch_raw(re.sub(r"[?#].*$", "", url), headers=dict(BROWSER, Accept="text/html"), gap=1.5)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        raise Blocked("no product data in page (bot wall?)")
    pdp = (json.loads(m.group(1)).get("props", {}).get("pageProps") or {}).get("productDetails")
    if not pdp:
        raise ValueError("product not found")
    variants = []
    for col in pdp.get("variants", []):
        assets = {a.get("type"): a.get("assetId") for a in col.get("assets", [])}
        for sku in col.get("skus", []):
            z = sku.get("size") or {}
            prim, sec = str(z.get("primarySize") or "").strip(), str(z.get("secondarySize") or "").strip()
            if re.fullmatch(r"\d{2}", prim) and re.match(r"\d{2}", sec):
                label = f"W{prim} L{sec[:2]}"          # trousers: 34 / 31in -> W34 L31
            else:
                label = prim if not sec or sec.lower() == "regular" else f"{prim} {sec}"
            p = sku.get("price") or {}
            now, prev = p.get("currentPrice"), p.get("previousPrice") or None
            variants.append({"option1": label, "option2": col.get("colour", "").title(),
                             "title": f"{label} / {col.get('colour', '').title()}", "price": now,
                             "compare_at_price": prev if (prev and now and prev > now) else None,
                             "available": (sku.get("inventory") or {}).get("quantity", 0) > 0,
                             "_img": assets.get("CUT_OUT") or assets.get("MAIN")})
    res = evaluate_variants(variants, size, variant, cents=False)
    if res is None:
        raise ValueError(f"size '{size}' not offered")
    img = next((v["_img"] for v in variants if passes_filter(v, variant) and v["_img"]), None)
    res["image"] = f"https://assets.digitalcontent.marksandspencer.app/images/w_900,q_auto,f_auto/{img}/image" if img else None
    return res


@guarded
def check_barbour(url, size, variant):
    """barbour.com (Salesforce) variation endpoint: price + which sizes are orderable in this colour."""
    m = re.search(r"([A-Z]{3}\d{4}[A-Z]{2}\d{2})\.html", url)
    if not m:
        raise ValueError("not a barbour.com product URL (expected ...-MWX0339OL71.html)")
    pid = m.group(1)
    first = str(size).split("|")[0].strip()
    q = urllib.parse.urlencode({"pid": pid, f"dwvar_{pid}_color": pid[-4:], f"dwvar_{pid}_size": first, "quantity": 1})
    d = fetch_json("https://www.barbour.com/on/demandware.store/Sites-barbour-gb-Site/en_GB/Product-Variation?" + q,
                   headers=dict(BROWSER, **{"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"}), gap=1.5)
    p = d.get("product") or {}
    if not p.get("productName"):
        raise ValueError("product not found")
    pr = p.get("price") or {}
    now = (pr.get("sales") or {}).get("value")
    was = (pr.get("list") or {}).get("value")
    variants = []
    for att in p.get("variationAttributes", []):
        if att.get("attributeId") == "size":
            for v in att.get("values", []):
                lab = v.get("displayValue") or v.get("value") or v.get("id")
                variants.append({"option1": lab, "title": lab, "price": now, "available": bool(v.get("selectable")),
                                 "compare_at_price": was if (was and now and was > now) else None})
    res = evaluate_variants(variants, size, None, cents=False)
    if res is None:
        raise ValueError(f"size '{size}' not offered")
    imgs = (p.get("images") or {}).get("large") or []
    res["image"] = re.sub(r"sw=\d+", "sw=900", imgs[0].get("url", "")) if imgs else None
    return res


CHECKS = {"shopify": check_shopify, "uniqlo": check_uniqlo, "mands": check_mands, "barbour": check_barbour}


def check_item(item):
    kind = kind_for(item["url"], item.get("check"))
    if kind not in CHECKS:
        return {}
    return CHECKS[kind](item["url"], item["size"], item.get("variant"))


def signal_for(item, rec):
    if item.get("bought"):
        return "BOUGHT"
    if kind_for(item["url"], item.get("check")) not in LIVE or rec.get("blocked"):
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
# Two stages. 1) Rules in finder.json throw out anything off-brief that text can catch: off-palette
# main colour, logos/fit words in the description, non-stretch trousers, footwear that isn't a
# silhouette Don wants, streetwear brands on multi-brand shops. 2) Whatever survives is only a
# CANDIDATE: it reaches the site and the Drop email after Claude's daily review has looked at the
# photo and added the URL to finder.json "approve" (or "block" to bin it for good).
ROLE_RULES = [
    ("wallabee", r"wallabee"), ("boot", r"chelsea|boot|desert|chukka"),
    ("overshirt", r"overshirt|over shirt|shirt jacket|shacket|cpo"), ("cardigan", r"cardigan"), ("fleece", r"fleece"),
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


def _rx(w):
    """Whole-word pattern; numeric ends only need a non-digit neighbour (so '990' matches 'M990v6')."""
    left = r"(?<![0-9])" if w[:1].isdigit() else r"(?<![a-z0-9])"
    right = r"(?![0-9])" if w[-1:].isdigit() else r"(?![a-z0-9])"
    return left + re.escape(w) + right


def words_in(text, words):
    return [w for w in words if re.search(_rx(w), text)]


NEGATED = re.compile(r"(?:\b(?:no|not|non|without|zero|never|free of|minus|rather than|instead of|avoids?)\b[^.;:!?]{0,24}|\bnon-)$")


def said(text, words):
    """Words the text actually claims: 'no logos', 'logo-free', 'not boxy' don't count."""
    found = []
    for w in words:
        for m in re.finditer(_rx(w), text):
            if NEGATED.search(text[max(0, m.start() - 32):m.start()]) or re.match(r"\s?-?\s?free\b", text[m.end():m.end() + 8]):
                continue
            found.append(w)
            break
    return found


def page_text(html_text):
    from html import unescape
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html_text or "", flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>", ". ", t, flags=re.I)
    t = unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t).strip()


def colour_of(text, vocab):
    """The colour named first in text (earliest; the longest name wins a tie): 'Black / Grey Four' -> black."""
    best = None
    for w in vocab:
        m = re.search(_rx(w), text)
        if m and (best is None or (m.start(), -len(w)) < best[0]):
            best = ((m.start(), -len(w)), w)
    return best[1] if best else None


def variant_colour(v, vocab):
    """Colour of one variant from its non-size options ('Navy / L' -> navy)."""
    opts = [o for o in variant_options(v) if not (canon(o) & {"L", "M", "S", "XL", "XS", "XXL"})
            and not re.fullmatch(r"(?i)\s*(w?\d{2}(\s*[wl/x]\s*\d{2})?|uk\s*\d+(\.5)?|eu\s*\d+(\.5)?|us\s*\d+(\.5)?|\d+(\.5)?)\s*l?\s*", o)]
    return colour_of(" / ".join(opts).lower(), vocab) if opts else None


WINTER_MONTHS = (10, 11, 12, 1, 2, 3)
WINTER_WORDS = ["wool", "waxed", "wax", "fleece", "lined", "thermal", "cord", "corduroy", "shearling", "quilted",
                "moleskin", "flannel", "brushed", "knit", "jumper", "cardigan", "boot", "boots", "lambswool", "merino"]


def norm_url(u):
    return re.sub(r"^https?://(www\.)?", "", (u or "").strip()).split("?")[0].split("#")[0].rstrip("/").lower()


def run_finder(cfg, watched_handles, prev_finds):
    """Returns (approved finds, candidates awaiting review, errors)."""
    prev_seen = {f.get("key"): f.get("first_seen", TODAY) for f in prev_finds.get("finds", [])}
    cand_seen = {f.get("key"): f.get("first_seen", TODAY) for f in prev_finds.get("candidates", [])}
    cands, errors = {}, []
    low = lambda xs: [x.lower() for x in xs or []]
    palette = low(cfg.get("palette"))
    off = low(cfg.get("off_palette"))
    blocked = {norm_url(u) for u in cfg.get("block", [])}
    approved = {norm_url(u) for u in cfg.get("approve", [])}
    gate = cfg.get("require_approval", True)
    excl = low(cfg.get("exclude"))
    excl_desc = low(cfg.get("exclude_desc"))
    gender_excl = low(cfg.get("exclude_gender"))
    multi_brands = low(cfg.get("apparel_brands"))
    trusted = {s["store"] for s in cfg.get("sources", []) if s.get("trusted")}
    core = set(low(cfg.get("core_palette")))
    for src in cfg.get("sources", []):
        store, coll = src["store"], src["collection"]
        only = set(src.get("only", []))
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
                url = f"https://{store}/products/{p['handle']}"
                if norm_url(url) in blocked:
                    continue
                title = (p.get("title") or "").lower()
                ptype = (p.get("product_type") or "").lower()
                tags = " ".join(p.get("tags") or []).lower() if isinstance(p.get("tags"), list) else str(p.get("tags", "")).lower()
                if words_in(f"{title} {ptype}", gender_excl) or words_in(title, excl):
                    continue
                brand = (p.get("vendor") or "").lower()
                cat = next((c for c in cfg["categories"] if c["name"] == src.get("category")), None)
                for c in ([] if cat else cfg["categories"]):
                    if only and c["name"] not in only:
                        continue
                    if not words_in(f"{title} {ptype}", low(c["keywords"])):
                        continue
                    req = c.get("require_any")
                    if req and not words_in(f"{title} {ptype} {tags}", low(req)):
                        continue
                    cat = c
                    break
                if not cat:
                    continue
                footwear = cat["name"] == "Footwear"
                if words_in(f"{title} {ptype}", low(cat.get("exclude"))):
                    continue
                style = low(cat.get("require_style"))
                if style and not src.get("skip_style") and not words_in(title, style):
                    continue  # not a silhouette/style the brief asks for
                brand_block = cat.get("exclude_brands", []) if cat.get("allow_brands_any") else cfg.get("exclude_brands", [])
                if words_in(f"{brand} {title}", low(brand_block)):
                    continue
                if src.get("brand_filter") and not footwear and not words_in(brand, multi_brands):
                    continue  # multi-brand shop: apparel only from brands that fit the brief
                desc = page_text(p.get("body_html")).lower()
                if said(desc, excl_desc + low(cat.get("exclude_desc"))):
                    continue
                need = low(cat.get("require_desc_any"))
                if need and (not said(desc, need) or words_in(desc, ["non-stretch", "non stretch", "rigid denim", "no stretch"])):
                    continue  # trousers must have some give
                role = src.get("role") or infer_role(p.get("title"), cat["name"])
                ok = set(palette) | set(low(cat.get("palette_extra") or cat.get("extra_palette")))
                ok |= set(low((cat.get("role_palette") or {}).get(role or "", [])))
                if footwear and cat.get("role_palette"):
                    ok = set(low(cat["role_palette"].get(role or "trainer", []))) | set(low(cat.get("palette_extra")))
                vocab = sorted(ok | set(off), key=len, reverse=True)
                variants = p.get("variants", [])
                vcols = {id(v): variant_colour(v, vocab) for v in variants}
                if any(vcols.values()):
                    variants = [v for v in variants if vcols[id(v)] in ok]
                    colour = next((vcols[id(v)] for v in variants), None)
                    if not variants:
                        continue
                else:
                    colour = colour_of(title, vocab) or colour_of(tags, vocab)
                    if colour not in ok and not (colour is None and cat.get("colour_optional")):
                        continue  # main colour off-palette, or unknown
                res = evaluate_variants(variants, cat["size"], cents=False)
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
                # rank on brief-fit, not just depth of discount (the deepest cuts are often the oddest pieces)
                score = (min(disc, 50) + (10 if colour in core else 0) + (6 if store in trusted else 0)
                         + (6 if NOW.month in WINTER_MONTHS and words_in(f"{title} {desc[:200]}", WINTER_WORDS) else 0)
                         - 10 * price / cat.get("premium_cap", cat["cap"]))
                label = src.get("label", store)
                vendor = (p.get("vendor") or "").strip()
                if not vendor or vendor.lower() in ("men's", "mens", "men", "women's", "unisex"):
                    vendor = label
                if vendor.isupper() and len(vendor) > 4:
                    vendor = vendor.title()
                imgs = p.get("images") or []
                img = None
                for v in variants:
                    if v.get("featured_image"):
                        img = https(v["featured_image"])
                        break
                comp = re.findall(r"\d{1,3}\s?%\s?(?:organic |recycled |bci |supima )?[a-z]+", desc)
                rec = {
                    "key": key, "first_seen": prev_seen.get(key) or cand_seen.get(key, TODAY), "store": label,
                    "brand": vendor, "name": clean_title(p.get("title"), vendor),
                    "image": img or (https(imgs[0].get("src")) if imgs else None),
                    "url": url, "category": cat["name"],
                    "price": price, "was": res["was"], "discount_pct": disc,
                    "size": cat["size"].split("|")[0], "colour": colour, "tier": tier, "score": round(score, 1),
                    "role": role,
                    "why": f"{disc}% off at {label} · {cat['size'].split('|')[0]} in stock · {colour or 'colour per photo'} · {cat['name'].lower()}",
                    "fit_words": said(desc, ["regular fit", "classic fit", "straight leg", "straight fit", "tapered", "taper",
                                             "slim fit", "true to size", "size up", "size down", "raglan", "mid rise", "mid-rise",
                                             "high rise", "high-rise", "stretch", "brushed", "waffle", "corduroy", "waxed"]),
                    "composition": ", ".join(dict.fromkeys(comp))[:80] or None,
                    "desc": desc[:300],
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
    yes = [r for r in ranked if not gate or norm_url(r["url"]) in approved]
    waiting = [dict(r, first_seen=cand_seen.get(r["key"], TODAY)) for r in ranked
               if gate and norm_url(r["url"]) not in approved][:cfg.get("max_candidates", 24)]
    out, per_cat, per_store = [], {}, {}
    for r in yes:
        if per_cat.get(r["category"], 0) >= cfg.get("max_per_category", 4):
            continue
        if per_store.get(r["store"], 0) >= cfg.get("max_per_store", 5):
            continue
        r = dict(r, first_seen=prev_seen.get(r["key"], TODAY))  # first day it was live on the site
        for k in ("desc", "fit_words", "composition"):
            r.pop(k, None)
        out.append(r)
        per_cat[r["category"]] = per_cat.get(r["category"], 0) + 1
        per_store[r["store"]] = per_store.get(r["store"], 0) + 1
        if len(out) >= cfg.get("max_finds", 16):
            break
    return out, waiting, errors


def verify_picks(picks, prev_picks=()):
    """Live price/stock for each pick, plus since/start_price: how long it has run (the review rotates stale picks)."""
    prev = {p.get("url"): p for p in prev_picks if p.get("url")}
    out = []
    for pk in picks.get("picks", []):
        rec = dict(pk)
        url = pk.get("url", "")
        kind = kind_for(url)
        if kind in CHECKS and pk.get("size"):
            rec["store"] = store_label(url)
            try:
                res = CHECKS[kind](url, pk["size"], pk.get("variant"))
                rec["image"] = res.pop("image", None) or rec.get("image")
                rec.update({"price_now": res["price"], "in_stock": res["in_stock"],
                            "discount_pct": res["discount_pct"], "was": res["was"], "verified": TODAY})
            except ValueError as e:  # size not offered / product gone
                rec.update({"in_stock": False, "verified": TODAY, "verify_error": str(e)[:80]})
            except Exception as e:
                rec.update({"verify_error": str(e)[:80]})
        old = prev.get(pk.get("url")) or {}
        rec["since"] = old.get("since") or TODAY
        rec["start_price"] = old["start_price"] if old.get("start_price") is not None else rec.get("price_now", pk.get("price"))
        out.append(rec)
    return out


# ------------------------------------------------------------- daily drop
def uk_now():
    try:
        from zoneinfo import ZoneInfo
        return NOW.astimezone(ZoneInfo("Europe/London"))
    except Exception:
        return NOW


def email_img(url, w, h):
    """Uniform w x h (2x) thumbnails where the image CDN can crop/pad; email clients can't object-fit."""
    if not url:
        return None
    W, H = 2 * w, 2 * h
    if "/cdn/shop/" in url or "cdn.shopify.com" in url:
        u = re.sub(r"([?&])(width|height|crop)=[^&]*", r"\1", url).rstrip("?&")
        return u + ("&" if "?" in u else "?") + f"width={W}&height={H}&crop=center"
    if "marksandspencer.app" in url:
        return re.sub(r"/images/[^/]+/", f"/images/w_{W},h_{H},c_pad,b_white,q_auto,f_auto/", url)
    if "barbour.com/dw/image" in url:
        return url.split("?")[0] + f"?sw={W}&sh={H}&sm=fit&bgcolor=FFFFFF&q=75"
    if "image.uniqlo.com" in url:  # 3:4 originals are 1500x2000 (~350KB); the CDN resizes on ?width
        return url.split("?")[0] + f"?width={W}"
    return url


def capsule_progress(results, wardrobe):
    """Outfits Don can wear with what he owns, and the gaps (slot roles) ranked by how many outfits they hold up."""
    labels = wardrobe.get("role_labels", {})
    owned = {r.get("role") for r in results if r.get("bought") and r.get("role")}
    owned |= {s.get("role") for s in wardrobe.get("staples", []) if s.get("owned") and s.get("role")}
    forms = wardrobe.get("formulas", [])
    ready, gaps = 0, {}
    for f in forms:
        missing = [sl for sl in f.get("slots", []) if not set(sl.get("roles", [])) & owned]
        ready += not missing
        for sl in missing:
            key = tuple(sorted(sl.get("roles", [])))
            g = gaps.setdefault(key, {"roles": set(key), "outfits": [],
                                      "label": " or ".join(labels.get(r, r).lower() for r in sl.get("roles", []))})
            g["outfits"].append(f.get("name", ""))
    return {"ready": ready, "total": len(forms), "gaps": sorted(gaps.values(), key=lambda g: -len(g["outfits"])),
            "owned_roles": owned}


def build_drop(results, finds, picked, hist, counts, wardrobe=None):
    """docs/drop.html: the Daily Drop email. Table layout + one <style> block (Gmail-safe), ~20KB."""
    from html import escape as e
    now_uk = uk_now()
    day = now_uk.strftime("%a %-d %b")
    yday = (NOW.date() - dt.timedelta(days=1)).isoformat()
    font = "'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif"
    pg = capsule_progress(results, wardrobe or {})

    def gbp(x):
        return "" if x is None else (f"&pound;{x:.0f}" if float(x).is_integer() else f"&pound;{x:.2f}")

    def plain_gbp(x):
        return gbp(x).replace("&pound;", "£")

    def full(r):
        return f"{r.get('brand', '')} {r.get('name', '')}".replace("®", "").strip()

    def fb_link(kind, label, r, hint):
        """One-tap feedback: a pre-filled email the next morning's review reads (recipient added at send)."""
        subj = urllib.parse.quote(f"Capsule {kind}: {full(r)}"[:140])
        body = urllib.parse.quote(f"{r.get('url', '')}\n\n{hint}")
        return (f'<a href="mailto:?subject={subj}&amp;body={body}" '
                f'style="color:#6B6A65;text-decoration:underline;white-space:nowrap">{label}</a>')

    def feedback(r):
        return " &nbsp;&middot;&nbsp; ".join([
            fb_link("bought", "Bought it", r, "Size or colour, if different (optional): "),
            fb_link("more", "More like this", r, "What you like about it (optional): "),
            fb_link("nope", "Not for me", r, "What's off about it (optional): ")])

    # ---- what goes in
    picks = [p for p in picked if p.get("in_stock") is not False and not p.get("verify_error")][:3]
    pick_urls = {p.get("url") for p in picks}
    new_picks = [p for p in picks if p.get("since", TODAY) == TODAY]
    gap_roles = set().union(*[g["roles"] for g in pg["gaps"]]) if pg["gaps"] else set()
    buys = sorted([r for r in results if r.get("signal") == "BUY" and not r.get("bought") and r["url"] not in pick_urls
                   and (not gap_roles or r.get("role") in gap_roles)],
                  key=lambda r: -(r.get("discount_pct") or 0))[:4]
    moves = []
    for r in results:
        if r.get("bought") or r.get("signal") in ("LINK ERROR", "CHECK MANUALLY"):
            continue
        series = hist.get(str(r["id"]), [])
        if not series or series[-1][0] != TODAY:
            continue
        before = [h for h in series if h[0] < TODAY]
        if not before:
            continue
        (_, p0, s0), (_, p1, s1) = before[-1], series[-1]
        if s0 == 0 and s1 == 1:
            moves.append((0, "Back in", f"{e(full(r))} is back in {e(r['size'].split('|')[0])} at {gbp(p1)}", r["url"]))
        elif s1 == 1 and p0 and p1 and p0 - p1 >= 1:
            moves.append((1, "Price drop", f"{e(full(r))} {gbp(p0)} &rarr; <b>{gbp(p1)}</b>", r["url"]))
        elif s0 == 1 and s1 == 0:
            moves.append((2, "Sold out", f"{e(full(r))} sold out in {e(r['size'].split('|')[0])}", r["url"]))
    moves.sort(key=lambda m: m[0])
    fresh = [f for f in finds if f.get("first_seen", "") >= yday and f["url"] not in pick_urls]
    deals_title = "New on the rail" if fresh else "Best deals right now"
    deals = (fresh or [f for f in finds if f["url"] not in pick_urls])[:4]
    quiet = not moves and not fresh and not new_picks

    # ---- subject: lead with the best thing today, not counts
    drops = sum(1 for m in moves if m[1] == "Price drop")
    backs = sum(1 for m in moves if m[1] == "Back in")

    def short(p):
        return p.get("short") or (p.get("name", "").split(",")[0]).strip()

    def price_bit(p):
        disc = p.get("discount_pct") or 0
        return plain_gbp(p.get("price_now", p.get("price"))) + (f" (−{disc}%)" if disc >= 20 else "")

    if quiet:
        subject = f"The Drop · {day}: nothing new today"
    else:
        bits = []
        lead = (new_picks or picks or [None])[0]
        if lead:
            more = len(picks) - 1
            bits.append(f"{short(lead)} {price_bit(lead)}" + (f" + {more} more pick{'s' * (more != 1)}" if more > 0 else ""))
        if backs:
            bits.append(f"{backs} back in your size")
        if drops:
            bits.append(f"{drops} price drop{'s' * (drops != 1)}")
        if fresh:
            bits.append(f"{len(fresh)} new deal{'s' * (len(fresh) != 1)}")
        subject = f"The Drop · {day}: " + (", ".join(bits) if bits else "today's edit")
    pre = ("Today's edit: " + " · ".join(f"{p.get('brand', '')} {short(p)} {plain_gbp(p.get('price_now', p.get('price')))}" for p in picks)
           if picks else "Your capsule, checked this morning.")

    # ---- building blocks
    def price_html(now, was, disc, size=14):
        red = disc and disc >= 10
        h = f'<span style="font-weight:700;font-size:{size}px;color:{"#B3261E" if red else "#000"}">{gbp(now)}</span>'
        if was and disc:
            h += f' <s style="color:#6B6A65;font-size:{size - 1}px">{gbp(was)}</s> <span style="color:#B3261E;font-size:{size - 2}px">&minus;{disc}%</span>'
        return h

    def tile(url, img, w, h):
        src = email_img(img, w, h)
        inner = (f'<img src="{e(src)}" width="{w}" alt="" style="display:block;width:100%;max-width:{w}px;height:auto;border:0">'
                 if src else f'<div style="height:{h}px"></div>')
        return f'<a href="{e(url)}" style="display:block;background:#F2F1ED;text-decoration:none">{inner}</a>'

    def card(r, price, meta, meta_color="#6B6A65"):
        url, brand = r["url"], r.get("brand", "")
        return (f'{tile(url, r.get("image"), 270, 338)}'
                f'<p style="margin:12px 0 0;font-size:12px;color:#6B6A65">{e(brand.replace("®", ""))}</p>'
                f'<p style="margin:2px 0 0;font-size:14px;line-height:1.35"><a href="{e(url)}" style="color:#000;text-decoration:none">{e(r.get("name", ""))}</a></p>'
                f'<p style="margin:6px 0 0">{price}</p>'
                f'<p style="margin:3px 0 0;font-size:12.5px;color:{meta_color}">{meta}</p>'
                f'<p style="margin:7px 0 0;font-size:12px;line-height:1.7">{feedback(r)}</p>')

    def grid(cells):
        rows = ""
        for i in range(0, len(cells), 2):
            a = cells[i]
            b = cells[i + 1] if i + 1 < len(cells) else ""
            rows += (f'<tr><td class="col" width="270" valign="top" style="padding:0 0 32px">{a}</td>'
                     f'<td class="gap" width="20" style="font-size:0">&nbsp;</td>'
                     f'<td class="col" width="270" valign="top" style="padding:0 0 32px">{b}</td></tr>')
        return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>'

    def section(title, body, note=""):
        n = f'<span style="float:right;font-size:13px;color:#6B6A65;font-weight:400">{note}</span>' if note else ""
        return (f'<tr><td class="px" style="padding:40px 30px 0"><h2 class="wide" style="margin:0 0 20px;font-size:21px;'
                f'font-weight:700;letter-spacing:-.005em;border-top:1px solid #E4E2DC;padding-top:18px">{n}{title}</h2>{body}</td></tr>')

    def progress():
        if not pg["total"]:
            return ""
        cells = "".join(
            f'<td width="{100 // pg["total"]}%" style="height:6px;font-size:0;line-height:0;background:'
            f'{"#3E4A23" if i < pg["ready"] else "#E4E2DC"}">&nbsp;</td>'
            + ('<td width="4" style="font-size:0;line-height:0">&nbsp;</td>' if i < pg["total"] - 1 else "")
            for i in range(pg["total"]))
        gaps = ", ".join(f'{g["label"]} ({len(g["outfits"])} outfit{"s" * (len(g["outfits"]) != 1)})' for g in pg["gaps"][:3])
        line = (f'<b style="color:#000">{pg["ready"]} of {pg["total"]} outfits</b> ready to wear with what you own'
                + (f'. Missing: {e(gaps)}.' if gaps else '. The capsule is complete.'))
        return (f'<tr><td class="px" style="padding:20px 30px 0"><table role="presentation" width="100%" cellpadding="0" '
                f'cellspacing="0"><tr>{cells}</tr></table><p style="margin:10px 0 0;font-size:13px;line-height:1.5;'
                f'color:#4A4945">{line} <a href="{SITE}#outfits" style="color:#4A4945">Outfits</a></p></td></tr>')

    # ---- sections
    out = [progress()]
    if quiet:
        rows = "".join(
            f'<tr><td width="64" valign="top" style="padding:0 14px 14px 0">{tile(p["url"], p.get("image"), 64, 80)}</td>'
            f'<td valign="middle" style="padding:0 0 14px;font-size:14px;line-height:1.45">'
            f'<a href="{e(p["url"])}" style="color:#000;text-decoration:none">{e(full(p))}</a><br>'
            f'<span style="color:#6B6A65;font-size:13px">{gbp(p.get("price_now", p.get("price")))} &middot; '
            f'{e(p.get("size", "").split("|")[0])} in stock</span></td></tr>' for p in picks)
        out.append(f'<tr><td class="px" style="padding:30px 30px 0"><h1 class="wide" style="margin:0;font-size:30px;line-height:1.05;'
                   f'font-weight:800;letter-spacing:-.015em">Nothing new today</h1>'
                   f'<p style="margin:10px 0 22px;font-size:15px;line-height:1.5;color:#6B6A65">No new deals, price drops or restocks '
                   f'since yesterday. Your picks are still in stock:</p>'
                   f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table></td></tr>')
    else:
        if picks:
            rows = ""
            for p in picks:
                pr = p.get("price_now", p.get("price"))
                meta = f'{e(p.get("size", "").split("|")[0])} in stock' if p.get("in_stock") else e(p.get("size", ""))
                if p.get("since", TODAY) == TODAY:
                    meta = "New today &middot; " + meta
                rows += (f'<tr><td class="pimg" width="200" valign="top" style="padding:0 22px 30px 0">{tile(p["url"], p.get("image"), 200, 250)}</td>'
                         f'<td valign="top" style="padding:0 0 30px">'
                         f'<p style="margin:0;font-size:12px;color:#6B6A65">{e(p.get("brand", "").replace("®", ""))}</p>'
                         f'<p style="margin:2px 0 0;font-size:18px;line-height:1.3"><a href="{e(p["url"])}" style="color:#000;text-decoration:none">{e(p.get("name", ""))}</a></p>'
                         f'<p style="margin:8px 0 0">{price_html(pr, p.get("was"), p.get("discount_pct"), 16)}</p>'
                         f'<p style="margin:3px 0 0;font-size:12.5px;color:#3E4A23;font-weight:600">{meta}</p>'
                         f'<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:#4A4945">{e(p.get("why", ""))}</p>'
                         f'<p style="margin:12px 0 0;font-size:13px;font-weight:600"><a href="{e(p["url"])}" style="color:#000">Shop at {e(p.get("store") or store_label(p["url"]))}</a></p>'
                         f'<p style="margin:6px 0 0;font-size:12px;line-height:1.7">{feedback(p)}</p>'
                         f'</td></tr>')
            out.append(f'<tr><td class="px" style="padding:30px 30px 0"><h1 class="wide h1" style="margin:0;font-size:44px;line-height:.95;'
                       f'font-weight:800;letter-spacing:-.02em">Today&rsquo;s edit</h1>'
                       f'<p style="margin:10px 0 26px;font-size:15px;color:#6B6A65">Picked for the brief and your gaps, in stock in your size this morning.</p>'
                       f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table></td></tr>')
        if moves:
            li = "".join(
                f'<tr><td style="padding:11px 0;border-bottom:1px solid #E4E2DC;font-size:14px;line-height:1.45">'
                f'<span style="display:inline-block;min-width:84px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;'
                f'color:{"#3E4A23" if k < 2 else "#6B6A65"}">{lab}</span> <a href="{e(u)}" style="color:#000;text-decoration:none">{txt}</a></td></tr>'
                for k, lab, txt, u in moves[:8])
            out.append(section("Since yesterday", f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{li}</table>'))
        if buys:
            cells = [card(r, price_html(r.get("price"), r.get("was"), r.get("discount_pct")),
                          f'At or under your {gbp(r.get("target"))} target', "#3E4A23") for r in buys]
            out.append(section("Ready to buy", grid(cells), "fills a gap" if gap_roles else f'{len(buys)} on the list'))
        if deals:
            cells = [card(f, price_html(f.get("price"), f.get("was"), f.get("discount_pct")),
                          f'{e(f.get("size", ""))} in stock &middot; {e(f.get("store", ""))}') for f in deals]
            out.append(section(deals_title, grid(cells), f'<a href="{SITE}#deals" style="color:#6B6A65">All deals</a>'))

    watching = sum(1 for r in results if not r.get("bought"))
    instock = sum(1 for r in results if r.get("in_stock") and not r.get("bought"))
    body = "".join(out)
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{e(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&display=swap" rel="stylesheet">
<style>
body{{margin:0;padding:0;background:#FFFFFF}} table{{border-collapse:collapse}} img{{border:0}}
body,td,p,a,h1,h2{{font-family:{font}}} .wide{{font-stretch:125%}}
@media (max-width:620px){{.w{{width:100%!important}} .px{{padding-left:18px!important;padding-right:18px!important}}
.h1{{font-size:36px!important}} .pimg{{width:132px!important;padding-right:16px!important}} .col{{width:48%!important}} .gap{{width:4%!important}}}}
</style></head>
<body style="margin:0;padding:0;background:#FFFFFF;color:#000">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{e(pre)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF"><tr><td align="center">
<table role="presentation" class="w" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
<tr><td class="px" style="padding:22px 30px 18px;border-bottom:1px solid #E4E2DC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="{SITE}" class="wide" style="font-size:19px;font-weight:800;letter-spacing:.06em;color:#000;text-decoration:none">CAPSULE</a></td>
<td align="right" style="font-size:13px;color:#6B6A65">The Drop &middot; {day}</td></tr></table></td></tr>
{body}
<tr><td class="px" style="padding:36px 30px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#000"><a href="{SITE}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none">Open the capsule</a></td>
<td style="padding-left:18px;font-size:14px"><a href="{SITE}#outfits" style="color:#000">Outfits</a> &nbsp;&middot;&nbsp; <a href="{SITE}#deals" style="color:#000">Deals</a></td>
</tr></table></td></tr>
<tr><td class="px" style="padding:30px 30px 0;font-size:14px;line-height:1.55;color:#4A4945">
<b style="color:#000">Steer it.</b> Under each piece: <i>Bought it</i> marks it as yours, <i>More like this</i> and <i>Not for me</i> tune the picks. Or reply with what you want more or less of. Tomorrow&rsquo;s review acts on it.</td></tr>
<tr><td class="px" style="padding:28px 30px 40px;font-size:12px;line-height:1.6;color:#6B6A65">
Watching {watching} pieces &middot; {instock} in stock in your size &middot; prices checked {now_uk.strftime('%H:%M')} UK.<br>
Sizes: tops L, trousers W34 L32, shoes UK 10. <a href="{SITE}drop.html" style="color:#6B6A65">View in browser</a></td></tr>
</table></td></tr></table></body></html>
"""
    (DOCS / "drop.html").write_text(html, encoding="utf-8")

    def plain(r, price):
        return f"- {full(r)}, {plain_gbp(price)}: {r.get('url', '')}"
    text = [subject, ""]
    if pg["total"]:
        gaps = ", ".join(g["label"] for g in pg["gaps"][:3])
        text += [f"{pg['ready']} of {pg['total']} outfits ready to wear" + (f". Missing: {gaps}." if gaps else "."), ""]
    if quiet:
        text += ["Nothing new since yesterday. Your picks are still in stock:"] + [plain(p, p.get("price_now", p.get("price"))) for p in picks] + [""]
    else:
        if picks:
            text += ["TODAY'S EDIT"] + [plain(p, p.get("price_now", p.get("price"))) for p in picks] + [""]
        if buys:
            text += ["READY TO BUY"] + [plain(r, r.get("price")) for r in buys] + [""]
        if deals:
            text += [deals_title.upper()] + [plain(f, f.get("price")) for f in deals] + [""]
    text += [f"With photos: {SITE}drop.html"]
    return subject, "\n".join(text)


def send_drop(subject, text, picks_updated, prev_state):
    """Email docs/drop.html over Gmail SMTP with the product photos embedded (inline CID parts).

    Needs repo secrets GMAIL_USER + GMAIL_APP_PASSWORD (optional DROP_TO). Sends at most once per UK
    day: after the morning review has written picks.json (its push triggers this run), or from 12:00 UK
    as a fallback if the review didn't run. Returns the drop state kept in data.json; the review checks
    drop.date and only sends through its Gmail connector (no photos) when this didn't.
    """
    state = {k: prev_state.get(k) for k in ("date", "at", "subject", "via", "images") if prev_state.get(k)}
    user = os.environ.get("GMAIL_USER", "").strip()
    pw = re.sub(r"\s+", "", os.environ.get("GMAIL_APP_PASSWORD", ""))
    to = os.environ.get("DROP_TO", "").strip() or user
    today = uk_now().date().isoformat()
    if not (user and pw):
        return dict(state, status="smtp not set up (GMAIL_USER / GMAIL_APP_PASSWORD secrets)")
    if state.get("date") == today:
        return dict(state, status="already sent today")
    if picks_updated != today and uk_now().hour < 11:
        return dict(state, status="waiting for today's review")
    import smtplib
    import ssl
    from email.message import EmailMessage
    from email.utils import formatdate, make_msgid
    from html import unescape
    html = (DOCS / "drop.html").read_text(encoding="utf-8").replace('href="mailto:?', f'href="mailto:{to}?')
    parts, n = {}, 0

    def inline(m):
        url = unescape(m.group(1))
        if url not in parts:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "image/jpeg,image/png;q=0.9,image/*;q=0.5"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    ctype, data = r.headers.get_content_type(), r.read(3_000_000)
                if not ctype.startswith("image/") or len(data) < 200:
                    raise ValueError(ctype)
                parts[url] = (make_msgid(domain="capsule.drop")[1:-1], ctype, data)
            except Exception as ex:
                print(f"drop image kept remote ({str(ex)[:60]}): {url[:90]}")
                return m.group(0)
        return f'<img src="cid:{parts[url][0]}"'

    html = re.sub(r'<img src="(https://[^"]+)"', inline, html)
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, f"Capsule <{user}>", to
    msg["Date"], msg["Message-ID"] = formatdate(localtime=True), make_msgid(domain="capsule.drop")
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    body = msg.get_payload()[1]
    for cid, ctype, data in parts.values():
        main, sub = ctype.split("/", 1)
        body.add_related(data, maintype=main, subtype=sub, cid=f"<{cid}>", disposition="inline")
        n += 1
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as s:
            s.login(user, pw)
            s.send_message(msg)
    except Exception as ex:
        print(f"drop email FAILED: {ex}", file=sys.stderr)
        return dict(state, status=f"send failed: {str(ex)[:120]}")
    print(f"drop emailed with {n} photos embedded")
    return {"date": today, "at": NOW.isoformat().replace("+00:00", "Z"), "subject": subject, "via": "smtp",
            "images": n, "status": "sent"}


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

    results, errors, checked, blocked = [], 0, 0, 0
    for item in cfg["items"]:
        rec = dict(item)
        rec["checked"] = TODAY
        rec["store"] = store_label(item["url"])
        kind = kind_for(item["url"], item.get("check"))
        live = kind in LIVE
        if prev_by_id.get(str(item["id"]), {}).get("image"):
            rec["image"] = prev_by_id[str(item["id"])]["image"]
        key = str(item["id"])
        try:
            if not item.get("bought"):
                if live:
                    checked += 1
                try:
                    rec.update({k: v for k, v in check_item(item).items() if v is not None or k != "image"})
                except Blocked as e:
                    # shop refused this run: show the last good reading instead of a broken link
                    blocked += 1
                    last = prev_by_id.get(key, {})
                    seen = [h for h in hist.get(key, []) if h[1] is not None]
                    rec.update({"blocked": True, "block_reason": str(e)[:80],
                                "last_price": last.get("price") if last.get("price") is not None else item.get("last_price"),
                                "checked_on": seen[-1][0] if seen else item.get("checked_on")})
            if (not live or rec.get("blocked")) and not item.get("bought"):
                rec["price"] = rec.get("last_price", item.get("last_price"))
                rec["in_stock"] = None
                if rec.get("checked_on"):
                    rec["stale_days"] = (NOW.date() - dt.date.fromisoformat(rec["checked_on"])).days
            rec["signal"] = signal_for(item, rec)
        except Exception as e:
            errors += 1
            rec["signal"] = "LINK ERROR"
            rec["error"] = str(e)[:140]
            last = prev_by_id.get(key, {})
            if last.get("price") is not None:
                rec["last_seen_price"] = last["price"]
        if live and not item.get("bought") and rec["signal"] not in ("LINK ERROR", "CHECK MANUALLY"):
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
    finds, candidates, finder_errors = run_finder(finder, watched, prev_finds) if finder else ([], [], [])
    picked = verify_picks(picks, prev_finds.get("picks", []))

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
    save(DOCS / "history.json", hist, compact=True)
    save(DOCS / "finds.json", {"generated": NOW.isoformat().replace("+00:00", "Z"), "finds": finds,
                               "picks": picked, "picks_updated": picks.get("updated"), "errors": finder_errors,
                               "candidates": candidates})
    subject, text = build_drop(results, finds, picked, hist, counts, wardrobe)
    print("drop:", subject)
    drop = send_drop(subject, text, picks.get("updated"), prev.get("drop") or {})
    print("drop email:", drop.get("status"))
    save(DOCS / "data.json", {"generated": NOW.isoformat().replace("+00:00", "Z"), "sizes": cfg.get("sizes", {}),
                              "errors": errors, "counts": counts, "items": results, "wardrobe": wardrobe, "drop": drop})
    notify(lines)
    print(f"{len(results)} items, {checked} checked, {errors} errors, {blocked} blocked | {len(finds)} finds "
          f"({len(fresh)} new), {len(candidates)} candidates awaiting review, {len(picked)} picks | {len(lines)} alerts")
    for e in finder_errors:
        print("finder:", e)


if __name__ == "__main__":
    main()
