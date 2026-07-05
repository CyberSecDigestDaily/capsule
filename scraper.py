#!/usr/bin/env python3
"""Daily stock/price checker for the capsule watch list.
Runs in GitHub Actions. Checks Shopify stores via the /products/<handle>.js
endpoint (price + per-size availability), writes docs/data.json for the site.
'manual' items (Uniqlo, M&S, John Lewis block bots) keep their last known price
and get flagged for a human check.
"""
import json, re, urllib.request, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
cfg = json.loads((ROOT / "items.json").read_text())
UA = {"User-Agent": "Mozilla/5.0 (capsule-tracker; personal use)"}

def shopify_check(url, size):
    js_url = re.sub(r"(\?.*)?$", "", url) + ".js"
    req = urllib.request.Request(js_url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode())
    price = d["price"] / 100
    tokens = [t for t in size.replace("/", " ").split() if t]
    in_stock = False
    for v in d.get("variants", []):
        title = v.get("title", "")
        if all(t.lower() in title.lower() for t in tokens) or title.strip().lower() == size.strip().lower():
            in_stock = in_stock or bool(v.get("available"))
    compare = (d.get("compare_at_price") or 0) / 100
    return {"price": price, "in_stock": in_stock,
            "discount_pct": round(100 * (1 - price / compare)) if compare > price else 0}

results, errors = [], 0
for item in cfg["items"]:
    rec = dict(item)
    rec["checked"] = datetime.date.today().isoformat()
    try:
        if item["check"] == "shopify":
            rec.update(shopify_check(item["url"], item["size"]))
        else:
            rec["price"] = item.get("last_price")
            rec["in_stock"] = None  # unknown — needs human eyes
        price = rec.get("price")
        if rec.get("in_stock") and price is not None and price <= item["target"]:
            rec["signal"] = "BUY"
        elif rec.get("in_stock") is False:
            rec["signal"] = "SOLD OUT"
        elif rec.get("in_stock") is None:
            rec["signal"] = "CHECK MANUALLY"
        elif rec.get("discount_pct", 0) >= 10:
            rec["signal"] = "SALE"
        else:
            rec["signal"] = "WATCHING"
    except Exception as e:
        rec["signal"] = "LINK ERROR"; rec["error"] = str(e)[:120]; errors += 1
    results.append(rec)

out = {"generated": datetime.datetime.utcnow().isoformat() + "Z",
       "sizes": cfg["sizes"], "errors": errors, "items": results}
docs = ROOT / "docs"; docs.mkdir(exist_ok=True)
(docs / "data.json").write_text(json.dumps(out, indent=1))
print(f"{len(results)} items checked, {errors} errors")
