/* What Claude's daily review reads and writes. It authenticates with a bearer key whose SHA-256 ("rv:" + key) is in
   REVIEW_HASHES; the raw key lives only in the review's scheduled-task prompt. It sees the owner's account only. */

import {HttpError, now, randomToken, sha256hex} from "./util.js";
import {json, readJSON} from "./http.js";
import {rateLimit} from "./db.js";
import {noteBody} from "./validate.js";
import * as E from "../docs/engine.js";

async function reviewer(env, request) {
  const h = request.headers.get("Authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const hashes = String(env.REVIEW_HASHES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!key || key.length < 32 || !hashes.length || !hashes.includes(await sha256hex("rv:" + key))) {
    throw new HttpError(401, "bad_key", "Review key missing or wrong.");
  }
  await rateLimit(env, "review", 120, 3600);
  const owner = await env.DB.prepare("SELECT id, handle, cfg, brief FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1").first();
  if (!owner) throw new HttpError(404, "no_owner", "Nobody has signed up with the owner invite yet.");
  return owner;
}

async function asset(env, request, path) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}

export async function getReview(env, request) {
  const owner = await reviewer(env, request);
  const [rows, notes, data, finds, pool] = await Promise.all([
    env.DB.prepare("SELECT item, t, v FROM entries WHERE user_id = ?").bind(owner.id).all(),
    env.DB.prepare("SELECT kind, created_at, body FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 6").bind(owner.id).all(),
    asset(env, request, "/data.json"), asset(env, request, "/finds.json"), asset(env, request, "/pool.json")
  ]);
  const entries = {};
  for (const r of rows.results) { try { entries[r.item] = Object.assign(JSON.parse(r.v), {t: r.t}); } catch (e) { /* skip */ } }
  const brief = owner.brief ? JSON.parse(owner.brief) : {};
  const cfg = owner.cfg ? JSON.parse(owner.cfg) : {};
  const today = new Date().toISOString().slice(0, 10);
  const items = E.allItems(data, finds, pool);
  const brands = E.brandNames(items);
  const m = E.makeModel({brief, entries, cfg, now: Date.now()});
  const ownedPieces = [
    ...items.filter(i => i.kind === "watch" && i.bought).map(i => ({role: i.role})),
    ...((data && data.wardrobe && data.wardrobe.staples) || []).filter(s => s.owned).map(s => ({role: s.role})),
    ...Object.values(entries).filter(e => e.bought && e.f && e.f.r).map(e => ({role: e.f.r}))
  ];
  const og = E.outfitGaps(data && data.wardrobe && data.wardrobe.formulas, ownedPieces);
  const picks = new Set(((finds && finds.picks) || []).map(p => E.itemKey(p.url, p.variant)));
  const {list, hidden} = E.rank(m, items, {today, gapRoles: og.gapRoles, owned: og.owned, picks, brands});
  const card = x => ({key: x.it.key, url: x.it.url, brand: x.it.brand, name: x.it.name, store: x.it.store, role: x.it.role,
    kind: x.it.kind, price: x.it.price, was: x.it.was, disc: x.it.disc, image: x.it.image, firstSeen: x.it.firstSeen,
    pct: x.sc.pct, why: E.why(m, x.it, x.sc, {brands}), wildcard: x.wildcard || undefined, note: x.note || undefined,
    seen: entries[x.it.key] ? entries[x.it.key].shownTotal || 0 : 0});
  const fresh = list.filter(x => x.it.firstSeen && E.daysBetween(x.it.firstSeen, today) <= 1);
  const day = 864e5, nowMs = Date.now();
  const recent = Object.entries(entries).filter(([, e]) => E.reacted(e) && nowMs - Date.parse(e.t) < 8 * day)
    .sort((a, b) => Date.parse(b[1].t) - Date.parse(a[1].t)).slice(0, 60)
    .map(([k, e]) => ({key: k, t: e.t, s: e.s || null, more: e.more || 0, save: e.save || 0, bought: e.bought || 0, pricey: e.pricey || 0,
      own: e.own || 0, why: e.why || [], wins: e.wins || 0, losses: e.losses || 0, name: e.f && e.f.n, brand: e.f && e.f.b, url: e.f && e.f.u}));
  const counts = {};
  for (const e of Object.values(entries)) {
    for (const k of ["s", "more", "save", "bought", "pricey", "own"]) {
      const v = k === "s" ? e.s : (e[k] ? k : null);
      if (v && nowMs - Date.parse(e.t) < day) counts[v] = (counts[v] || 0) + 1;
    }
  }
  const hiddenWhy = {};
  for (const h of hidden) { const k = h.why.split(":")[0]; hiddenWhy[k] = (hiddenWhy[k] || 0) + 1; }
  return json({
    owner: owner.handle, generated: new Date().toISOString(), pool_generated: pool && pool.generated,
    brief, settings: cfg, profile: E.summary(m, brands, 15),
    taps_last_24h: counts, reactions_total: Object.values(entries).filter(E.reacted).length, recent,
    outfits: {ready: og.ready, total: og.total, gaps: og.gaps},
    strong: fresh.some(x => x.sc.pct >= 85 && !x.wildcard),
    new_today: fresh.slice(0, 15).map(card),
    ranked: list.slice(0, 40).map(card),
    hidden: hiddenWhy,
    notes: notes.results.map(n => ({kind: n.kind, created: new Date(n.created_at * 1000).toISOString(), body: n.body}))
  });
}

export async function postNote(env, request) {
  const owner = await reviewer(env, request);
  const body = await readJSON(request, 16 * 1024);
  const kind = ["weekly", "daily", "rule"].includes(body.kind) ? body.kind : "daily";
  const text = noteBody(body.body);
  await env.DB.prepare("INSERT INTO notes (id, user_id, kind, created_at, body) VALUES (?, ?, ?, ?, ?)")
    .bind(randomToken(12), owner.id, kind, now(), text).run();
  return json({ok: true});
}
