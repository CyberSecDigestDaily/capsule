/* Capsule v5: the page. Everything in your size from the watch list, Claude's picks, approved deals and the wider
   pool of shops, ranked by a taste model that learns from every tap (docs/engine.js). Reactions are kept on this
   device and, once you're signed in, synced to your private account (docs/account.js). */

import * as E from "./engine.js";
import * as A from "./account.js";

/* ------------------------------------------------------------------ basics */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const safeUrl = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "#";
const gbp = n => n == null || isNaN(n) ? "" : "£" + (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2));
const round2 = n => Math.round(Number(n) * 100) / 100;
const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = iso => new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", {day: "numeric", month: "short"});
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
};
function imgUrl(u, w) {
  if (!u) return "";
  return /cdn\.shopify\.com|\/cdn\/shop\//.test(u) ? u + (u.includes("?") ? "&" : "?") + "width=" + w : u;
}
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const HEART = "M12 20s-7.2-4.4-7.2-10.1A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.2 2.5C19.2 15.6 12 20 12 20z";
const I = {
  heart: svg(`<path d="${HEART}"/>`),
  heartOn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART}" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  x: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor"/></svg>',
  more: svg('<path d="M12 3.5l1.9 5 5.1 1.9-5.1 1.9-1.9 5.2-1.9-5.2-5.1-1.9 5.1-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  save: svg('<path d="M7 4h10v16l-5-3.6L7 20z"/>'),
  pricey: svg('<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z"/><circle cx="8" cy="9" r="1.3"/>'),
  own: svg('<path d="M12 7.2a2 2 0 1 1 2 2c-1.1.4-2 1.1-2 2.2v.6l8.5 5H3.5l8.5-5"/>'),
  bought: svg('<path d="M5.5 8h13l-1 12h-11zM9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  ext: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  similar: svg('<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><path d="M13.5 4.5h7M3.5 19.5h7"/>'),
  ask: svg('<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  forYou: svg('<path d="M12 3l2.1 5.6L20 11l-5.9 2.3L12 19l-2.1-5.7L4 11l5.9-2.4z"/>'),
  train: svg('<rect x="4.5" y="3.5" width="11" height="15" rx="2"/><path d="M18.5 7v11.5a2 2 0 0 1-2 2H9"/>'),
  watch: svg('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  outfits: svg('<path d="M12 6.5a2 2 0 1 1 2 2c-1.1.4-2 1.1-2 2.2v.8l8.5 5.2H3.5l8.5-5.2"/>'),
  deals: svg('<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z"/><circle cx="8" cy="9" r="1.3"/>'),
  you: svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.4-3.7 4.2-5.6 7.5-5.6s6.1 1.9 7.5 5.6"/>')
};

/* ------------------------------------------------------------------ state */
const KEY = "capsule.v5";
const VIEWS = [["for-you", "For you", "forYou"], ["train", "Train", "train"], ["shop", "Watch list", "watch"], ["outfits", "Outfits", "outfits"],
  ["deals", "Deals", "deals"], ["you", "You", "you"]];
const HASH_OF = {"for-you": "for-you", train: "train", shop: "watch", outfits: "outfits", deals: "deals", you: "you"};
const VIEW_OF = {"for-you": "for-you", train: "train", watch: "shop", shop: "shop", outfits: "outfits", deals: "deals", you: "you"};
const S = {
  data: null, finds: null, pool: null, history: {}, items: [], byKey: new Map(), brands: {}, picks: [], picksKeys: new Set(),
  entries: {}, cfg: null, brief: null,
  view: "for-you", model: null, version: 0, modelAt: -1, R: null, Rat: -1, Rday: "", og: null,
  fy: {filter: "all", keys: null, meta: {}, extra: [], at: 0}, shop: {cat: "all", status: "all", q: "", sort: "match", hideOwned: false},
  train: null, taps: 0, prevVisit: null, drawer: null, drawerPushed: false, lastFocus: null, lingerT: 0,
  linkCode: null, notes: null, where: null, rendered: {}, toastT: 0, seenSession: new Set()
};
const defaultCfg = () => ({counts: {}, caps: {}, pins: {}, owned: {}, resetAt: null, explore: 0.2, theme: "auto", reach: null, rules: null});
// Per-device bits that never sync: when you last visited (for "new since your last visit") and the one-off v4 import.
const KEY_DEVICE = "capsule.v5.device";
const device = store.get(KEY_DEVICE, null) || {lastVisit: null, migrated: 0};
const saveDevice = () => store.set(KEY_DEVICE, device);

function loadLocal() {
  const v = store.get(KEY, null) || {};
  S.entries = v.entries && typeof v.entries === "object" ? v.entries : {};
  S.cfg = Object.assign(defaultCfg(), v.cfg || {});
  S.brief = v.brief || null;
}
let saveT = 0;
function saveLocal(now) {
  clearTimeout(saveT);
  const go = () => {
    if (!store.set(KEY, {v: 1, entries: S.entries, cfg: S.cfg, brief: S.brief})) {
      prune(true);
      store.set(KEY, {v: 1, entries: S.entries, cfg: S.cfg, brief: S.brief});
    }
  };
  if (now) go(); else saveT = setTimeout(go, 250);
}
/* Pieces you only scrolled past stop mattering after a while; drop them so the device store stays small. */
function prune(hard) {
  const cut = addDays(localDay(), hard ? -21 : -75);
  for (const [k, e] of Object.entries(S.entries)) {
    if (!E.reacted(e) && !e.open && !e.view && !e.linger && (!e.sd || e.sd < cut) && (!e.cool || e.cool < localDay())) delete S.entries[k];
  }
}
const bump = () => { S.version++; S.og = null; };
const stamp = prev => {
  const n = new Date().toISOString();
  return prev && Date.parse(n) <= Date.parse(prev) ? new Date(Date.parse(prev) + 1).toISOString() : n;
};

/* ------------------------------------------------------------------ reactions */
const REASON_OK = new Set(["colour", "fit", "fabric", "price", "brand", "logo", "dressy", "young", "have", "texture", "cut", "versatile"]);
const clampInt = (v, hi) => Math.max(0, Math.min(hi, Math.round(v || 0)));
/* Keep an entry to exactly what the server stores, so the two copies always agree. */
function tidy(e) {
  const out = {t: e.t};
  if (e.et) out.et = e.et;
  if (["love", "like", "no", "nope"].includes(e.s)) out.s = e.s;
  for (const k of ["more", "save", "pricey", "own", "bought", "linger"]) if (e[k]) out[k] = 1;
  if (Array.isArray(e.why)) { const w = [...new Set(e.why.filter(r => REASON_OK.has(r)))].slice(0, 6); if (w.length) out.why = w; }
  for (const [k, hi] of [["wins", 99], ["losses", 99], ["open", 999], ["view", 999], ["shownTotal", 9999], ["shown", 99]]) { const v = clampInt(e[k], hi); if (v) out[k] = v; }
  for (const k of ["sd", "cool"]) if (/^\d{4}-\d{2}-\d{2}$/.test(e[k] || "")) out[k] = e[k];
  if (e.lp != null && isFinite(e.lp) && e.lp >= 0) out.lp = round2(e.lp);
  if (e.f && e.f.tr && e.f.tr.length) out.f = e.f;
  return out;
}
/* Change one piece's entry. explicit: a deliberate tap (wins merges by when it was made). snap: keep a copy of the piece. */
function touch(it, fn, o = {}) {
  const k = it.key, before = S.entries[k] ? structuredClone(S.entries[k]) : null;
  const e = Object.assign({}, S.entries[k] || {});
  fn(e);
  e.t = stamp(e.t);
  if (o.explicit) e.et = e.t;
  if ((o.explicit || o.snap) && it.traits) e.f = E.snapshot(it);
  if (e.f && e.f.p != null) e.f.p = round2(e.f.p);
  S.entries[k] = tidy(e);
  if (!o.quiet) { bump(); S.taps++; }
  else if (o.snap) bump();
  saveLocal();
  A.markDirty([k]);
  return before;
}
/* Put back the explicit part of an entry as it was (undo). */
function restore(it, before) {
  touch(it, e => {
    for (const f of ["s", "more", "save", "pricey", "own", "bought", "why"]) { if (before && before[f] !== undefined) e[f] = before[f]; else delete e[f]; }
  }, {explicit: true});
}
const ent = k => S.entries[k] || null;
function setState(it, s, toggle) {
  let after = s;
  const before = touch(it, e => {
    const was = e.s;
    if (toggle && e.s === s) { delete e.s; after = null; } else e.s = s;
    if (e.s !== was) delete e.why; // reasons belong to the reaction they were given for
  }, {explicit: true});
  return {before, after};
}
function toggleFlag(it, f) {
  let on = false;
  const before = touch(it, e => {
    on = !e[f];
    if (on) e[f] = 1; else delete e[f];
    if (f === "pricey" && on) { e.lp = it.price; e.cool = addDays(localDay(), 30); }
    if (f === "pricey" && !on) delete e.cool;
  }, {explicit: true});
  return {before, on};
}
function setWhy(it, r) {
  let on = false;
  touch(it, e => {
    const w = new Set(e.why || []);
    on = !w.has(r);
    if (on) w.add(r); else w.delete(r);
    e.why = [...w];
  }, {explicit: true});
  return on;
}
/* Implicit signals: opening a piece, clicking through to the shop, lingering on it, scrolling past it. */
const noteOpen = it => touch(it, e => { e.open = (e.open || 0) + 1; }, {snap: true, quiet: true});
const noteVisit = it => touch(it, e => { e.view = (e.view || 0) + 1; }, {snap: true, quiet: true});
const noteLinger = it => { if (!(ent(it.key) || {}).linger) touch(it, e => { e.linger = 1; }, {snap: true, quiet: true}); };
function noteShown(it) {
  const day = localDay(), e0 = ent(it.key);
  if (e0 && e0.sd === day) return;
  if (S.brief && S.brief.implicit === false) return;
  touch(it, e => {
    e.sd = day;
    e.shownTotal = (e.shownTotal || 0) + 1;
    if (it.price != null) e.lp = it.price;
    if (!E.reacted(e)) {
      e.shown = (e.shown || 0) + 1;
      if (e.shown >= 3) { e.cool = addDays(day, (S.brief && S.brief.repeat_days) || 14); e.shown = 0; }
    }
  }, {quiet: true});
}

/* ------------------------------------------------------------------ settings */
/* Change settings; only what actually changed travels to the account, as a patch. */
function setCfg(fn) {
  const before = JSON.parse(JSON.stringify(S.cfg));
  fn(S.cfg);
  const patch = E.cfgDiff(before, S.cfg);
  if (!Object.keys(patch).length) return;
  bump();
  saveLocal();
  A.markCfg(patch);
}

/* ------------------------------------------------------------------ the model */
function model() {
  if (!S.model || S.modelAt !== S.version) {
    S.model = E.makeModel({brief: S.brief || {}, entries: S.entries, cfg: S.cfg, now: Date.now(),
      traitsFor: k => { const it = S.byKey.get(k); return it && it.traits; }});
    S.modelAt = S.version;
  }
  return S.model;
}
const formulas = () => (S.data && S.data.wardrobe && S.data.wardrobe.formulas) || [];
const staples = () => (S.data && S.data.wardrobe && S.data.wardrobe.staples) || [];
const isOwned = it => !!(it.bought || (it.kind === "watch" && S.cfg.owned[String(it.id)] === 1) || (ent(it.key) || {}).bought);
const stapleOwned = s => { const v = S.cfg.owned[s.id]; return v === undefined ? !!s.owned : v === 1; };
function ownedPieces() {
  const out = [];
  for (const it of S.items) if (it.kind === "watch" && isOwned(it)) out.push({role: it.role, brand: it.brand, name: it.name, image: it.image, key: it.key});
  for (const s of staples()) if (stapleOwned(s)) out.push({role: s.role, name: s.name, id: s.id});
  const own = new Set();
  for (const [k, e] of Object.entries(S.entries)) {
    if (!e.f || !e.f.r || out.some(p => p.key === k)) continue;
    if (e.bought) out.push({role: e.f.r, brand: e.f.b, name: e.f.n, image: e.f.i, key: k, bought: true});
    else if (e.own && !own.has(e.f.r)) { own.add(e.f.r); out.push({role: e.f.r, brand: e.f.b, name: e.f.n, image: e.f.i, key: k, similar: true}); }
  }
  return out;
}
function gaps() {
  if (!S.og) S.og = E.outfitGaps(E.formulasNow(formulas(), Date.now()), ownedPieces());
  return S.og;
}
const ctx = () => ({today: localDay(), gapRoles: gaps().gapRoles, owned: gaps().owned, picks: S.picksKeys, brands: S.brands});
/* Everything visible, ranked. Cached until something changes. */
function ranked() {
  const day = localDay();
  if (!S.R || S.Rat !== S.version || S.Rday !== day) {
    const m = model();
    S.R = E.rank(m, S.items, ctx());
    S.R.by = new Map(S.R.list.map(x => [x.it.key, x]));
    S.Rat = S.version;
    S.Rday = day;
  }
  return S.R;
}
const scoreOf = it => E.score(model(), it, ctx());
function whyLine(x) {
  const m = model();
  return x.wildcard ? x.note : E.why(m, x.it, x.sc, {brands: S.brands, gapLabel: gapLabel(x.it.role)});
}
function gapLabel(role) {
  const g = gaps().gaps.filter(x => (x.roles || []).includes(role)).map(x => x.outfit);
  return g.length ? (g.length === 1 ? `your ${g[0].toLowerCase()} outfit` : `${g.length} outfits`) : "";
}

/* ------------------------------------------------------------------ cards */
const GROUP_OF = {tee: "tops", shirt: "tops", knit: "layers", cardigan: "layers", sweat: "layers", hoodie: "layers", fleece: "layers",
  overshirt: "outer", jacket: "outer", jeans: "bottoms", chino: "bottoms", trouser: "bottoms", jogger: "bottoms", shorts: "bottoms",
  trainer: "shoes", boot: "shoes", wallabee: "shoes", clog: "shoes"};
const FILTERS = [["all", "All"], ["new", "New in"], ["sale", "On sale"], ["tops", "Tees & shirts"], ["layers", "Knits & sweats"],
  ["outer", "Jackets"], ["bottoms", "Trousers & jeans"], ["shoes", "Shoes"], ["extras", "Extras"]];
const isNew = it => it.firstSeen && E.daysBetween(it.firstSeen, localDay()) <= 3;
function inFilter(it, f) {
  if (f === "all") return true;
  if (f === "new") return isNew(it);
  if (f === "sale") return (it.disc || 0) >= 10;
  return (GROUP_OF[it.role] || "extras") === f;
}
function tile(it, w, sizes) {
  const alt = esc(`${it.brand || ""} ${it.name || ""}`.trim());
  if (!it.image) return `<span class="ph">${esc(it.brand || it.store || "")}</span>`;
  const shop = /cdn\.shopify\.com|\/cdn\/shop\//.test(it.image);
  const set = shop ? ` srcset="${esc(imgUrl(it.image, 400))} 400w, ${esc(imgUrl(it.image, 700))} 700w, ${esc(imgUrl(it.image, 1000))} 1000w" sizes="${sizes || "(max-width:760px) 50vw, 25vw"}"` : "";
  return `<img src="${esc(imgUrl(it.image, w))}"${set} alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}
function priceHTML(it, cls = "price") {
  if (it.price == null) return "";
  const red = it.was && it.disc > 0;
  return `<p class="${cls} num"><span class="${red ? "red" : ""}">${gbp(it.price)}</span>${red ? `<s>${gbp(it.was)}</s>` : ""}</p>`;
}
function brandLine(it) {
  const b = it.brand || it.store || "";
  const s = it.store && E.brandSlug(it.store) !== E.brandSlug(b) ? ` · ${it.store}` : "";
  return esc(b + s);
}
function badges(it, x) {
  const out = [];
  if (x && x.wildcard) out.push(`<span class="badge wild">Wildcard</span>`);
  if (isOwned(it)) out.push(`<span class="badge muted">Owned</span>`);
  else if (it.signal === "BUY") out.push(`<span class="badge buy">Buy now</span>`);
  else if (it.inStock === false) out.push(`<span class="badge muted">${it.restock_watch ? "Restock watch" : "Sold out"}</span>`);
  if (it.disc >= 10 && !isOwned(it)) out.push(`<span class="badge sale">−${it.disc}%</span>`);
  if (isNew(it) && !(x && x.wildcard) && out.length < 2) out.push(`<span class="badge new">New in</span>`);
  return out.length ? `<div class="badges">${out.join("")}</div>` : "";
}
function actsHTML(it) {
  const e = ent(it.key) || {};
  const love = e.s === "love";
  return `<div class="acts">
    <button class="act love" data-act="love" aria-pressed="${love}" aria-label="${love ? "Loved" : "Love it"}" title="Love it">${love ? I.heartOn : I.heart}</button>
    <button class="act nope" data-act="nope" aria-pressed="false" aria-label="Not for me" title="Not for me">${I.x}</button>
    <button class="act" data-act="menu" aria-label="More options" title="More">${I.dots}</button></div>`;
}
/* One product card. x: a ranked row {it, sc, wildcard, note} or just {it}. */
function cardHTML(x, o = {}) {
  const it = x.it, sc = x.sc || (it.traits ? scoreOf(it) : null);
  const meta = o.meta != null ? o.meta : "";
  const why = o.why != null ? o.why : (sc ? `${sc.pct}% match${(x.wildcard ? x.note : whyLine({it, sc})) ? " · " + esc(x.wildcard ? x.note : whyLine({it, sc})) : ""}` : "");
  const dim = isOwned(it) || it.inStock === false;
  const href = "#item=" + encodeURIComponent(it.key);
  return `<article class="card${dim ? " dim" : ""}" data-key="${esc(it.key)}">
    <a class="card-hit" href="${href}" data-open aria-label="${esc((it.brand || "") + " " + it.name)}, details"><div class="tile">${tile(it, o.w || 700, o.sizes)}${badges(it, x)}</div></a>
    <div class="info"><a class="txt card-hit" href="${href}" data-open tabindex="-1">
      <p class="brand">${brandLine(it)}</p><h3 class="name">${esc(it.name)}</h3>${priceHTML(it)}
      ${why ? `<p class="why${x.wildcard ? " wild" : ""}">${why}</p>` : ""}${meta}</a>${o.noActs ? "" : actsHTML(it)}</div></article>`;
}
function goneHTML(it) {
  const e = ent(it.key) || {}, why = new Set(e.why || []);
  return `<article class="card" data-key="${esc(it.key)}"><div class="gone"><p><b>Hidden.</b> What's off about it? <span class="faint">Optional, it learns either way.</span></p>
    <div class="chips">${E.REASONS_NOPE.map(([k, l]) => `<button class="chip" data-act="why" data-r="${k}" aria-pressed="${why.has(k)}">${esc(l)}</button>`).join("")}</div>
    <p><button class="linkish" data-act="undo-nope">Undo</button></p></div></article>`;
}
/* Swap one card in place (after a tap) without re-ranking the page under your finger. */
function refreshCard(key) {
  const it = S.byKey.get(key) || pseudo(key);
  if (!it) return;
  document.querySelectorAll(`.card[data-key="${CSS.escape(key)}"]`).forEach(el => {
    if (el.closest(".minis, .sim")) return;
    const e = ent(key) || {};
    if (e.s === "nope" && el.closest("#fyGrid, #grid, #dealsGrid, #newStrip, #editGrid, #nextGrid")) { el.outerHTML = goneHTML(it); return; }
    const acts = el.querySelector(".acts");
    if (acts) acts.outerHTML = actsHTML(it);
  });
}
/* A piece that has left the shops, rebuilt from the copy kept with your reaction. */
function pseudo(key) {
  const e = ent(key);
  if (!e || !e.f) return null;
  const f = e.f;
  return {kind: "gone", key, brand: f.b, name: f.n, url: f.u, image: f.i, price: f.p, role: f.r, traits: f.tr || [], inStock: false, store: ""};
}

/* ------------------------------------------------------------------ impressions */
const seen = "IntersectionObserver" in window ? new IntersectionObserver(list => {
  for (const en of list) {
    if (!en.isIntersecting) continue;
    const k = en.target.dataset.key;
    seen.unobserve(en.target);
    if (!k || S.seenSession.has(k)) continue;
    S.seenSession.add(k);
    const it = S.byKey.get(k);
    if (it) noteShown(it);
  }
}, {threshold: 0.6}) : null;
function observe(root) {
  if (!seen || !root) return;
  root.querySelectorAll(".card[data-key]").forEach(el => { if (!S.seenSession.has(el.dataset.key)) seen.observe(el); });
}

/* ------------------------------------------------------------------ toast + sheet */
function toast(msg, o = {}) {
  const t = $("toast");
  t.innerHTML = `<div class="row"><span>${esc(msg)}</span>${o.undo ? `<button type="button" data-t="undo">Undo</button>` : ""}</div>` +
    (o.chips ? `<div class="chips">${o.chips.map(([k, l]) => `<button type="button" class="chip" data-t="chip" data-k="${k}" aria-pressed="${!!(o.pressed && o.pressed.includes(k))}">${esc(l)}</button>`).join("")}</div>` : "");
  t.classList.add("on");
  t.onclick = ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.t === "undo") { hideToast(); o.undo(); }
    else if (b.dataset.t === "chip" && o.onChip) { const on = o.onChip(b.dataset.k); b.setAttribute("aria-pressed", String(!!on)); arm(9000); }
  };
  const arm = ms => { clearTimeout(S.toastT); S.toastT = setTimeout(hideToast, ms); };
  t.onpointerenter = () => clearTimeout(S.toastT);
  t.onpointerleave = () => arm(2500);
  arm(o.ms || (o.chips ? 7000 : o.undo ? 5000 : 2800));
}
function hideToast() { $("toast").classList.remove("on"); }

function openSheet(html, from) {
  const sh = $("sheet");
  S.sheetFrom = from || document.activeElement;
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
  sh.hidden = false;
  $("scrim").hidden = false;
  const first = sh.querySelector("button, a, input");
  if (first) first.focus();
}
function closeSheet() {
  const sh = $("sheet");
  if (sh.hidden) return;
  sh.hidden = true;
  if ($("drawer").hidden) $("scrim").hidden = true;
  if (S.sheetFrom && document.contains(S.sheetFrom)) S.sheetFrom.focus();
}
function menuSheet(it, from) {
  const e = ent(it.key) || {};
  const row = (act, icon, label, on, sub) => `<button type="button" data-act="${act}" class="${on ? "on" : ""}" aria-pressed="${!!on}">${icon}<span>${esc(label)}${sub ? `<br><small class="faint">${esc(sub)}</small>` : ""}</span></button>`;
  openSheet(`<h3>${esc(it.brand || "")} ${esc(it.name)}</h3><p class="sub">${it.price != null ? gbp(it.price) : ""}${it.store ? " at " + esc(it.store) : ""}</p>
    <div class="menu" data-key="${esc(it.key)}">
      ${row("more", I.more, "More like this", e.more, "Shows you similar pieces and leans the feed this way")}
      ${row("save", I.save, e.save ? "Saved for later" : "Save for later", e.save)}
      ${row("pricey", I.pricey, "Too pricey, watch it", e.pricey, "Steps aside until the price drops")}
      ${row("own", I.own, "I already own something like it", e.own)}
      ${row("bought", I.bought, "I bought this", e.bought, "Counts it in your outfits")}
      ${row("similar", I.similar, "Show similar pieces")}
      <a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" data-act="visit">${I.ext}<span>Open at ${esc(it.store || "the shop")}</span></a>
      ${askLink(it)}
    </div>`, from);
}
function askLink(it) {
  if (S.brief && S.brief.ask_claude === false) return "";
  const q = `Is this a good buy for my capsule wardrobe? ${it.brand || ""} ${it.name}${it.price != null ? ", " + gbp(it.price) : ""}${it.store ? " at " + it.store : ""}: ${it.url}`;
  return `<a href="https://claude.ai/new?q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${I.ask}<span>Ask Claude about it</span></a>`;
}

/* ------------------------------------------------------------------ actions */
function itemFrom(el) {
  const host = el.closest("[data-key]");
  if (!host) return null;
  const k = host.dataset.key;
  return S.byKey.get(k) || pseudo(k);
}
const FLAG_MSG = {
  more: ["More like this, coming up.", "Okay, not more like this."],
  save: ["Saved. It's on the You tab.", "Removed from saved."],
  pricey: ["Watching it: it steps aside until the price drops.", "Back to normal."],
  own: ["Noted. It won't push this kind of piece as hard.", "Okay, you don't own one like it."],
  bought: ["Nice. It now counts in your outfits.", "Unmarked as bought."]
};
function doAct(act, it, el) {
  switch (act) {
    case "love": {
      const r = setState(it, "love", true);
      refreshCard(it.key); refreshDrawer();
      if (r.after === "love") {
        toast("Loved. What do you like about it?", {chips: E.REASONS_LOVE, pressed: [], onChip: k => setWhy(it, k)});
      } else toast("Removed from loved.");
      break;
    }
    case "nope": {
      const r = setState(it, "nope", true);
      if (r.after !== "nope") { refreshAll(); toast("Back in your feed."); break; }
      const inGrid = el && el.closest("#fyGrid, #grid, #dealsGrid, #newStrip, #editGrid, #nextGrid");
      if (inGrid) refreshCard(it.key);
      else {
        if (S.drawer) closeDrawer();
        toast("Hidden. What's off about it?", {chips: E.REASONS_NOPE, pressed: [], onChip: k => setWhy(it, k),
          undo: () => { restore(it, r.before); refreshAll(); }});
        refreshAll(true);
      }
      break;
    }
    case "undo-nope": {
      touch(it, e => { delete e.s; delete e.why; }, {explicit: true});
      const card = el.closest(".card");
      if (card) { const x = ranked().by.get(it.key) || {it}; card.outerHTML = cardHTML(x); }
      break;
    }
    case "why": {
      const on = setWhy(it, el.dataset.r);
      el.setAttribute("aria-pressed", String(on));
      break;
    }
    case "like": case "no": { setState(it, act, true); refreshCard(it.key); refreshDrawer(); break; }
    case "more": case "save": case "pricey": case "own": case "bought": {
      const r = toggleFlag(it, act);
      closeSheet();
      toast(FLAG_MSG[act][r.on ? 0 : 1], {undo: () => { restore(it, r.before); refreshAll(true); refreshDrawer(); }});
      if (act === "more" && r.on) moreLikeThis(it);
      if (act === "own" || act === "bought" || act === "pricey") refreshAll(true);
      refreshCard(it.key); refreshDrawer();
      break;
    }
    case "menu": menuSheet(it, el); break;
    case "similar": closeSheet(); openDrawer(it.key, {push: true, focus: "similar"}); break;
    case "visit": noteVisit(it); closeSheet(); break;
  }
}
/* "More like this" in the feed: drop up to four similar pieces in right after it. */
function moreLikeThis(it) {
  if (S.view !== "for-you" || !S.fy.keys) return;
  const R = ranked(), shown = new Set(S.fy.keys);
  const pool = R.list.filter(x => !shown.has(x.it.key) && inFilter(x.it, S.fy.filter)).map(x => x.it);
  const sims = E.similar(it, pool, 4);
  if (!sims.length) return;
  const at = S.fy.keys.indexOf(it.key);
  if (at < 0) return;
  S.fy.keys.splice(at + 1, 0, ...sims.map(s => s.key));
  const card = document.querySelector(`#fyGrid .card[data-key="${CSS.escape(it.key)}"]`);
  if (card) {
    card.insertAdjacentHTML("afterend", sims.map(s => cardHTML(R.by.get(s.key) || {it: s})).join(""));
    observe($("fyGrid"));
  }
}

/* ------------------------------------------------------------------ For you */
function renderForYou(reset) {
  const R = ranked();
  const f = S.fy.filter;
  // Filter chips with counts.
  const counts = {};
  for (const x of R.list) for (const [k] of FILTERS) if (inFilter(x.it, k)) counts[k] = (counts[k] || 0) + 1;
  $("fyFilters").innerHTML = FILTERS.filter(([k]) => k === "all" || counts[k] || k === f)
    .map(([k, l]) => `<button class="chip" data-fy="${k}" aria-pressed="${f === k}">${esc(l)}<span class="n">${counts[k] || 0}</span></button>`).join("");
  const exclude = new Set();
  // This week's edit (Claude's picks).
  const picks = f === "all" ? S.picks.filter(p => !E.hiddenWhy(model(), p) && p.inStock !== false) : [];
  $("editBlock").hidden = !picks.length;
  if (picks.length) {
    picks.forEach(p => exclude.add(p.key));
    const upd = S.finds && S.finds.picks_updated;
    $("editWhen").textContent = upd ? `Chosen ${dayName(upd)}` : "";
    $("editGrid").innerHTML = picks.map(p => cardHTML({it: p, sc: scoreOf(p)}, {why: p.why ? esc(p.why) : "", w: 1000, sizes: "(max-width:760px) 78vw, 33vw"})).join("");
  }
  // New since your last visit.
  let fresh = [];
  if (f === "all" && S.prevVisit) {
    const since = S.prevVisit.slice(0, 10);
    fresh = R.list.filter(x => x.it.firstSeen && x.it.firstSeen >= since && !exclude.has(x.it.key) && x.sc.pct >= 50 &&
      !((ent(x.it.key) || {}).shownTotal > 0 && !S.seenSession.has(x.it.key))).sort((a, b) => b.sc.s - a.sc.s).slice(0, 12);
  }
  $("newBlock").hidden = !fresh.length;
  if (fresh.length) {
    fresh.forEach(x => exclude.add(x.it.key));
    $("newCount").textContent = plural(fresh.length, "piece");
    $("newStrip").innerHTML = fresh.map(x => cardHTML(x, {sizes: "(max-width:760px) 42vw, 21vw"})).join("");
  }
  // The ranked grid. Keeps its order while you browse; re-ranks on a new filter, a new day, or a fresh visit.
  const vis = R.list.filter(x => inFilter(x.it, f) && !exclude.has(x.it.key));
  if (reset || !S.fy.keys) {
    S.fy.keys = vis.slice(0, 24).map(x => x.it.key);
    S.fy.meta = {};
    for (const x of vis.slice(0, 24)) S.fy.meta[x.it.key] = {wildcard: x.wildcard, note: x.note};
    S.fy.at = S.taps;
  }
  const rows = [];
  for (const k of S.fy.keys) {
    const it = S.byKey.get(k);
    if (!it) continue;
    const e = ent(k) || {};
    if (e.s === "nope") continue;
    const x = R.by.get(k);
    if (!x && !(e.s || e.more)) continue; // hidden since (bought, owned, ...)
    const meta = S.fy.meta[k] || {};
    rows.push(cardHTML({it, sc: x ? x.sc : scoreOf(it), wildcard: meta.wildcard, note: meta.note}));
  }
  $("fyGrid").innerHTML = rows.join("") || `<p class="empty">Nothing here right now. Try another filter.</p>`;
  $("fyCount").textContent = `${vis.length} in your size`;
  $("fyMore").hidden = vis.filter(x => !S.fy.keys.includes(x.it.key)).length === 0;
  const lede = S.brief ? "Everything in your size, ranked by what you like. Tap ♡ or ✕ on anything and it learns."
    : "Everything in your size, ranked. Tap ♡ or ✕ on anything and it learns your taste, on this device.";
  $("fyLede").textContent = lede;
  const every = Math.round(1 / (model().explore || 0.2));
  $("fyHow").textContent = model().explore > 0
    ? `Best match first, mixed so you don't get three knits in a row. One in ${every} is a labelled wildcard: it's testing something it doesn't know about you yet.`
    : "Best match first, mixed so you don't get three knits in a row. Wildcards are off.";
  observe($("view-for-you"));
}
function moreForYou() {
  const R = ranked(), shown = new Set(S.fy.keys);
  const exclude = new Set([...document.querySelectorAll("#newStrip .card, #editGrid .card")].map(el => el.dataset.key));
  const next = R.list.filter(x => inFilter(x.it, S.fy.filter) && !shown.has(x.it.key) && !exclude.has(x.it.key)).slice(0, 24);
  for (const x of next) { S.fy.keys.push(x.it.key); S.fy.meta[x.it.key] = {wildcard: x.wildcard, note: x.note}; }
  $("fyGrid").insertAdjacentHTML("beforeend", next.map(x => cardHTML(x)).join(""));
  $("fyMore").hidden = R.list.filter(x => inFilter(x.it, S.fy.filter) && !S.fy.keys.includes(x.it.key) && !exclude.has(x.it.key)).length === 0;
  observe($("fyGrid"));
}

/* ------------------------------------------------------------------ Train */
function newDeck() {
  const m = model(), b = S.brief || {};
  const n = (b.train && b.train.cards) || 20, duels = b.train && b.train.duels === "never" ? 0 : 6;
  S.train = {deck: E.trainDeck(m, S.items, Object.assign(ctx(), {seed: String(Date.now())}), n, duels), i: 0, before: Object.assign({}, m.aff), done: 0};
}
function renderTrain() {
  if (!S.train || (S.train.i >= S.train.deck.length && S.train.closed)) newDeck();
  const T = S.train, box = $("train");
  if (!T.deck.length) {
    box.innerHTML = `<div class="tdone"><h2>Nothing to train on</h2><p class="lede">You've reacted to everything in stock right now. New pieces land about three times a day.</p></div>`;
    return;
  }
  if (T.i >= T.deck.length) return trainDone();
  const step = T.deck[T.i];
  const top = `<div class="train-top"><span>${T.i + 1} of ${T.deck.length}</span><span>Quick reactions teach it fastest</span><button class="linkish" data-train="finish">Finish</button></div><div class="progress"><i></i></div>`;
  if (step.duel) {
    const [a, b] = step.duel;
    box.innerHTML = top + `<div class="duel"><h3>Which would you rather wear?</h3><div class="pair">
      ${[a, b].map((x, j) => `<button class="pick" data-train="pick" data-j="${j}"><div class="tile">${tile(x.it, 700, "(max-width:760px) 50vw, 280px")}</div>
        <div class="body"><p class="brand">${brandLine(x.it)}</p><p class="name">${esc(x.it.name)}</p>${priceHTML(x.it)}</div></button>`).join("")}</div>
      <button class="btn ghost small neither" data-train="neither">Neither</button></div>
      <p class="tkeys">← or → to pick, ↓ for neither</p>`;
  } else {
    const x = step.card;
    box.innerHTML = top + `<div class="deck"><div class="tcard" id="tcard">
      <span class="stamp no">NOPE</span><span class="stamp yes">LIKE</span><span class="stamp love">LOVE</span>
      <div class="tile">${tile(x.it, 1000, "(max-width:760px) 100vw, 560px")}${badges(x.it)}</div>
      <div class="body"><p class="brand">${brandLine(x.it)}</p><p class="name">${esc(x.it.name)}</p>${priceHTML(x.it)}
        <p class="why">${x.sc.certainty < 0.35 ? "New to it: " : ""}${esc(E.wildcardNote(model(), x.it, S.brands).replace(/^Testing /, "teaches it about "))}</p></div></div></div>
      <div class="tbtns"><button class="tbtn no" data-train="no" aria-label="Not for me">${I.x}</button>
        <button class="tbtn love" data-train="love" aria-label="Love it">${I.heartOn}</button>
        <button class="tbtn yes" data-train="like" aria-label="I like it">${I.check}</button></div>
      <p class="tkeys">Swipe, or use ← no · → like · ↑ love · ↓ skip</p>`;
    swipe($("tcard"));
  }
  box.querySelector(".progress i").style.width = `${(T.i / T.deck.length) * 100}%`;
}
function trainAnswer(kind, j) {
  const T = S.train;
  if (!T || T.i >= T.deck.length) return;
  const step = T.deck[T.i];
  if (step.duel) {
    const [a, b] = step.duel;
    if (kind === "pick") {
      const win = j === 0 ? a : b, lose = j === 0 ? b : a;
      touch(win.it, e => { e.wins = (e.wins || 0) + 1; }, {snap: true});
      touch(lose.it, e => { e.losses = (e.losses || 0) + 1; }, {snap: true});
    } else if (kind === "neither") {
      for (const x of [a, b]) touch(x.it, e => { e.losses = (e.losses || 0) + 1; }, {snap: true});
    }
  } else if (kind !== "skip") {
    setState(step.card.it, kind, false);
  }
  T.done++;
  T.i++;
  renderTrain();
}
function trainDone() {
  const T = S.train;
  T.closed = true;
  const m = model();
  const moved = Object.keys(m.aff).filter(t => !/^(s|d|p|sea):/.test(t)).map(t => [t, (m.aff[t] || 0) - (T.before[t] || 0)])
    .filter(([, d]) => Math.abs(d) >= 0.08).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
  $("train").innerHTML = `<div class="tdone"><h2>${T.done ? "Nice. That helps." : "Done"}</h2>
    <p class="lede">${T.done ? `${plural(T.done, "reaction")}. Here's what moved:` : "Nothing new learned this round."}</p>
    <div class="chips">${moved.map(([t, d]) => `<span class="chip">${d > 0 ? "▲" : "▼"} ${esc(E.label(t, S.brands))}</span>`).join("")}</div>
    <div class="d-row center"><button class="btn" data-train="again">Another ${(S.brief && S.brief.train && S.brief.train.cards) || 20}</button>
    <a class="btn ghost" href="#for-you">See your feed</a></div></div>`;
}
function swipe(card) {
  if (!card) return;
  let x0 = 0, y0 = 0, dx = 0, dy = 0, on = false;
  const stamps = {no: card.querySelector(".stamp.no"), yes: card.querySelector(".stamp.yes"), love: card.querySelector(".stamp.love")};
  const paint = () => {
    card.style.transform = `translate(${dx}px, ${Math.min(0, dy)}px) rotate(${dx / 22}deg)`;
    stamps.no.style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
    stamps.yes.style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
    stamps.love.style.opacity = String(Math.max(0, Math.min(1, -dy / 90 - Math.abs(dx) / 120)));
  };
  card.addEventListener("pointerdown", e => { on = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; card.setPointerCapture(e.pointerId); card.style.transition = "none"; });
  card.addEventListener("pointermove", e => { if (!on) return; dx = e.clientX - x0; dy = e.clientY - y0; paint(); });
  const end = () => {
    if (!on) return;
    on = false;
    card.style.transition = "";
    if (dx > 90) fling("like", 1); else if (dx < -90) fling("no", -1); else if (dy < -90 && Math.abs(dx) < 80) fling("love", 0);
    else { dx = dy = 0; paint(); }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
  const fling = (kind, dir) => {
    card.style.transform = dir ? `translate(${dir * 600}px, 40px) rotate(${dir * 24}deg)` : "translate(0, -700px)";
    card.style.opacity = "0";
    setTimeout(() => trainAnswer(kind), 180);
  };
}

/* ------------------------------------------------------------------ Watch list */
const SIG_ORDER = {BUY: 0, SALE: 1, WATCHING: 2, "CHECK MANUALLY": 3, "SOLD OUT": 4, "LINK ERROR": 5, BOUGHT: 6};
const STATUS = [["all", "Everything"], ["BUY", "Buy now"], ["SALE", "On sale"], ["WATCHING", "Watching"], ["SOLD OUT", "Sold out"], ["CHECK MANUALLY", "Not live"]];
const CAT_LABEL = {"Jackets & Overshirts": "Jackets", "Mid-layers & Knits": "Knitwear", "Tees": "Tees", "Jeans": "Jeans", "Chinos & Trousers": "Trousers",
  "Footwear": "Footwear", "Socks & Boxers": "Basics", "Joggers & Shorts": "Joggers", "Accessories": "Extras", "Shirts": "Shirts"};
const watchItems = () => S.items.filter(i => i.kind === "watch");
const myReach = () => S.cfg.reach ?? (S.brief && S.brief.reach_cm) ?? null;
function fitInfo(it) {
  const f = it.fit;
  if (!f) return null;
  let v = f.verdict || "check", reach = "";
  const sz = String(it.size || "").split("|")[0], r = f.reach, me = myReach();
  if (r && r[sz] != null) {
    if (me) {
      const short = me - r[sz];
      if (short > 1) { reach = `About ${Math.round(short)}cm short in the sleeve in ${sz}` + (r.XL && sz !== "XL" ? `; the XL reaches ${r.XL}cm.` : "."); if (v === "good") v = "check"; }
      else reach = `Sleeves should reach your wrist in ${sz} (about ${r[sz]}cm from the back of the neck).`;
    } else reach = `Sleeve, back of neck to cuff: about ${r[sz]}cm in ${sz}` + (r.XL && sz !== "XL" ? `, ${r.XL}cm in XL.` : ".");
  }
  return {v, reach, note: f.note || ""};
}
function watchMeta(it) {
  const sz = String(it.size || "").split("|")[0];
  const fi = fitInfo(it);
  let flag = "";
  if (fi && !isOwned(it)) { if (fi.v === "avoid") flag = `<p class="flag bad">Off-brief cut</p>`; else if (fi.v === "check") flag = `<p class="flag">Check the fit</p>`; }
  if (isOwned(it)) return `<p class="meta">In your wardrobe</p>`;
  switch (it.signal) {
    case "BUY": return `<p class="meta go">Below your ${gbp(it.target)} target, in stock in ${esc(sz)}</p>` + flag;
    case "SOLD OUT": return `<p class="meta">Sold out in ${esc(sz)}${it.alt && it.alt.length ? `. ${esc(it.alt.slice(0, 3).join(", "))} in stock` : ""}</p>`;
    case "CHECK MANUALLY": return `<p class="meta">Price checked by hand</p>` + flag;
    case "LINK ERROR": return `<p class="meta">Being re-sourced</p>`;
  }
  return (it.target ? `<p class="meta">Target ${gbp(it.target)}</p>` : "") + flag;
}
function renderShop() {
  const all = watchItems(), sh = S.shop;
  const cats = ["all", ...new Set(all.map(i => i.category))];
  $("cats").innerHTML = cats.map(c => `<button data-cat="${esc(c)}" aria-pressed="${sh.cat === c}">${esc(c === "all" ? "All" : (CAT_LABEL[c] || c))}</button>`).join("");
  const base = all.filter(it => (sh.cat === "all" || it.category === sh.cat) && !isOwned(it));
  $("status").innerHTML = STATUS.map(([k, l]) => {
    const n = k === "all" ? null : base.filter(i => i.signal === k).length;
    if (n === 0 && k !== sh.status) return "";
    return `<button class="chip" data-st="${esc(k)}" aria-pressed="${sh.status === k}">${l}${n != null ? `<span class="n">${n}</span>` : ""}</button>`;
  }).join("");
  const q = sh.q.toLowerCase();
  let list = all.filter(it => {
    if (sh.cat !== "all" && it.category !== sh.cat) return false;
    if (sh.hideOwned && isOwned(it)) return false;
    if ((ent(it.key) || {}).s === "nope" && !isOwned(it)) return false;
    if (sh.status !== "all" && (isOwned(it) || it.signal !== sh.status)) return false;
    if (q && !`${it.brand} ${it.name} ${it.category} ${it.store}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const pr = i => i.price ?? 1e9, sc = new Map(list.map(i => [i.key, scoreOf(i)]));
  const rank = i => isOwned(i) ? 9 : (SIG_ORDER[i.signal] ?? 5);
  if (sh.sort === "low") list.sort((a, b) => pr(a) - pr(b));
  else if (sh.sort === "high") list.sort((a, b) => pr(b) - pr(a));
  else if (sh.sort === "rec") list.sort((a, b) => rank(a) - rank(b) || (pr(a) - (a.target ?? 0)) - (pr(b) - (b.target ?? 0)));
  else list.sort((a, b) => (isOwned(a) - isOwned(b)) || ((a.inStock === false) - (b.inStock === false)) || sc.get(b.key).s - sc.get(a.key).s);
  $("grid").innerHTML = list.length ? list.map(it => cardHTML({it, sc: sc.get(it.key)}, {meta: watchMeta(it)})).join("")
    : `<p class="empty">Nothing matches these filters. <button class="linkish" data-shop="clear">Clear filters</button></p>`;
  const s = (S.data && S.data.sizes) || {};
  $("sizesLine").textContent = `Stock shown for your sizes: ${s.top || "L"} tops, ${s.waist || "W34"} ${s.leg || "L32"} trousers, ${s.shoe || "UK 10"} shoes.`;
  renderProgress();
}

/* ------------------------------------------------------------------ Outfits */
function analyse() {
  const own = ownedPieces(), R = ranked();
  const cands = R.list.filter(x => x.it.inStock !== false && x.it.image && x.sc.pct >= 40).sort((a, b) => b.sc.s - a.sc.s);
  const forms = formulas().map(f => {
    const slots = (f.slots || []).map(s => {
      const mine = own.filter(p => (s.roles || []).includes(p.role));
      return Object.assign({}, s, {mine, pick: mine.length ? null : (cands.find(c => (s.roles || []).includes(c.it.role)) || null)});
    });
    return Object.assign({}, f, {slots, missing: slots.filter(s => !s.mine.length)});
  });
  const scored = [];
  for (const c of cands.slice(0, 400)) {
    const completes = [], helps = [];
    for (const f of forms) {
      if (!f.missing.some(s => (s.roles || []).includes(c.it.role))) continue;
      (f.missing.length === 1 ? completes : helps).push(f.name);
    }
    if (!completes.length && !helps.length) continue;
    scored.push(Object.assign({}, c, {completes, helps, val: completes.length * 100 + (completes.length + helps.length) * 10 + c.sc.s * 8}));
  }
  scored.sort((a, b) => b.val - a.val);
  const best = [], roles = new Set();
  for (const c of scored) { if (roles.has(c.it.role)) continue; roles.add(c.it.role); best.push(c); if (best.length === 3) break; }
  return {forms, done: forms.filter(f => !f.missing.length).length, best};
}
const listJoin = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
function renderProgress() {
  const {forms, done} = analyse();
  $("progress").hidden = !forms.length;
  $("pgBar").innerHTML = forms.map((f, i) => `<span class="${i < done ? "on" : ""}"></span>`).join("");
  const labels = (S.data && S.data.wardrobe && S.data.wardrobe.role_labels) || {}, g = {};
  forms.forEach(f => f.missing.forEach(s => { const k = [...s.roles].sort().join("|"); (g[k] = g[k] || {label: s.roles.map(r => (labels[r] || r).toLowerCase()).join(" or "), n: 0}).n++; }));
  const gl = Object.values(g).sort((a, b) => b.n - a.n);
  $("pgLine").innerHTML = `<b>${done} of ${forms.length} outfits</b> ready to wear with what you own.` +
    (gl.length ? ` Missing: ${esc(gl.slice(0, 3).map(x => `${x.label} (${x.n})`).join(", "))}. ` : " ") + `<a href="#outfits">See outfits</a>`;
}
function renderOutfits() {
  const {forms, done, best} = analyse();
  $("outfitLede").textContent = `${done} of ${forms.length} ready to wear with what you own.`;
  $("reach").value = myReach() ?? "";
  $("nextBlock").hidden = !best.length;
  $("nextGrid").innerHTML = best.map(c => cardHTML(c, {meta: `<p class="reason">${esc(c.completes.length ? `Completes ${listJoin(c.completes)}` : `Fills a gap in ${listJoin(c.helps)}`)}</p>`})).join("");
  $("outfits").innerHTML = forms.map(f => `<div class="outfit">
    <div class="outfit-head"><h3>${esc(f.name)}</h3><span class="when">${esc(f.when || "")}</span>
      <span class="state${f.missing.length ? "" : " ready"}">${f.missing.length ? `${f.missing.length} missing` : "Ready to wear"}</span></div>
    <div class="slots">${f.slots.map(s => {
      if (s.mine.length) {
        const p = s.mine.find(x => x.image) || s.mine[0];
        return `<div class="slot"><p class="lab">${esc(s.label)}</p><div class="tile">${p.image ? tile(p, 500, "(max-width:760px) 45vw, 240px") : `<span class="ph">${esc(p.name)}</span>`}</div>
          <p class="cap">${esc(s.mine.map(x => x.brand ? `${x.brand} ${x.name}` : x.name).join(" or "))}</p></div>`;
      }
      const k = s.pick;
      return `<div class="slot missing"><p class="lab">${esc(s.label)}</p>${k ? `<a href="#item=${encodeURIComponent(k.it.key)}" data-open class="card-hit">` : ""}<div class="tile">${k ? tile(k.it, 500, "(max-width:760px) 45vw, 240px") : `<span class="ph">Nothing in stock yet</span>`}</div>${k ? "</a>" : ""}
        <p class="cap"><span class="miss">Missing.</span> ${k ? `Best match: ${esc((k.it.brand ? k.it.brand + " " : "") + k.it.name)}, ${gbp(k.it.price)} (${k.sc.pct}%)` : "New pieces land three times a day."}</p></div>`;
    }).join("")}</div></div>`).join("");
  renderOwnGrid();
}
function renderOwnGrid() {
  const labels = (S.data && S.data.wardrobe && S.data.wardrobe.role_labels) || {};
  const used = new Set(formulas().flatMap(f => (f.slots || []).flatMap(s => s.roles || [])));
  const fromTaps = Object.entries(S.entries).filter(([, e]) => (e.bought || e.own) && e.f && e.f.r);
  const roles = [...new Set([...Object.keys(labels).filter(r => used.has(r) || r === "cap"), ...fromTaps.map(([, e]) => e.f.r)])];
  $("owngrid").innerHTML = roles.map(r => {
    const rows = [
      ...staples().filter(s => s.role === r).map(s => ({kind: "staple", id: s.id, label: s.name, own: stapleOwned(s)})),
      ...watchItems().filter(i => i.role === r).map(i => ({kind: "watch", id: String(i.id), label: `${i.brand} ${i.name}`, own: isOwned(i), src: "on watch list", lock: !!i.bought})),
      ...fromTaps.filter(([, e]) => e.f.r === r).map(([k, e]) => ({kind: "entry", id: k, label: `${e.f.b || ""} ${e.f.n || ""}`.trim(), own: true, src: e.bought ? "you bought it" : "you own one like it"}))
    ];
    if (!rows.length) return "";
    rows.sort((a, b) => (b.own - a.own) || ((a.src ? 1 : 0) - (b.src ? 1 : 0)));
    return `<div class="owngroup"><h4>${esc(labels[r] || E.label("r:" + r))}</h4>${rows.map(x => `<label><input type="checkbox" data-own="${x.kind}" data-id="${esc(x.id)}" ${x.own ? "checked" : ""} ${x.lock ? "disabled" : ""}><span>${esc(x.label)}${x.src ? ` <span class="src">${esc(x.src)}</span>` : ""}</span></label>`).join("")}</div>`;
  }).join("");
}
function setOwnedTick(kind, id, on) {
  if (kind === "entry") {
    const it = S.byKey.get(id) || pseudo(id);
    if (it) touch(it, e => { if (!on) { delete e.bought; delete e.own; } }, {explicit: true});
  } else {
    setCfg(c => {
      if (kind === "staple") c.owned[id] = on ? 1 : 0;
      else if (on) c.owned[id] = 1; else delete c.owned[id];
    });
  }
  refreshAll(true);
}

/* ------------------------------------------------------------------ Deals */
/* The better the match, the smaller the discount it needs (the brief's "depends on the match"). */
const needs = pct => pct >= 80 ? 10 : pct >= 65 ? 20 : pct >= 50 ? 30 : 45;
function renderDeals() {
  const R = ranked();
  const list = R.list.filter(x => x.it.disc >= 10 && (x.it.disc >= needs(x.sc.pct) || x.it.kind === "find")).sort((a, b) => b.sc.s - a.sc.s);
  $("dealsLede").textContent = list.length
    ? `${plural(list.length, "reduction")} in your size. The better the match, the smaller the discount it needs to show here.`
    : "No reductions good enough right now. The better the match, the smaller the discount a piece needs to show here.";
  $("dealsGrid").innerHTML = list.slice(0, 120).map(x => cardHTML(x, {meta: x.it.kind === "find" ? `<p class="meta go">Checked against your brief</p>` : ""})).join("") ||
    `<p class="empty">Nothing yet. Sale rails are checked three times a day.</p>`;
  observe($("dealsGrid"));
}

/* ------------------------------------------------------------------ the drawer */
function itemOrPseudo(key) { return S.byKey.get(key) || pseudo(key); }
function openDrawer(key, o = {}) {
  const it = itemOrPseudo(key);
  if (!it) { toast("That piece has left the shops."); return; }
  if (!S.drawer) S.lastFocus = o.from || document.activeElement;
  S.drawer = key;
  if (o.push) {
    history.pushState({drawer: key}, "", "#item=" + encodeURIComponent(key));
    S.drawerPushed = true;
  }
  renderDrawer(it, o.focus);
  const d = $("drawer");
  d.hidden = false;
  $("scrim").hidden = false;
  document.body.classList.add("locked");
  requestAnimationFrame(() => { d.classList.remove("closed"); if (o.focus !== "similar") $("dClose").focus(); });
  if (it.kind !== "gone") {
    noteOpen(it);
    clearTimeout(S.lingerT);
    S.lingerT = setTimeout(() => { if (S.drawer === key) noteLinger(it); }, 8000);
  }
}
function refreshDrawer() { if (S.drawer) { const it = itemOrPseudo(S.drawer); if (it) renderDrawer(it); } }
function renderDrawer(it, focus) {
  const e = ent(it.key) || {}, m = model();
  const hid = it.kind === "gone" ? "gone" : E.hiddenWhy(m, it);
  const sc = it.traits && it.traits.length ? E.score(m, it, ctx()) : null;
  const x = ranked().by.get(it.key);
  const red = it.was && it.disc > 0;
  const chip = (act, label, on) => `<button class="chip${on ? "" : " ghost"}" data-act="${act}" aria-pressed="${!!on}">${label}</button>`;
  let avail = "", money = "";
  if (it.kind === "watch") {
    const sz = String(it.size || "").split("|")[0];
    if (it.signal === "CHECK MANUALLY") avail = `${esc(it.store)} blocks automatic checks, so this price was last confirmed by hand.`;
    else if (it.signal === "LINK ERROR") avail = "The shop's link stopped working. The daily review will find it again or swap in an equivalent.";
    else if (it.inStock) avail = `In stock in ${esc(sz)} at ${esc(it.store)}.`;
    else avail = `Sold out in ${esc(sz)} at ${esc(it.store)}.` + (it.alt && it.alt.length ? ` In stock: ${esc(it.alt.join(", "))}.` : "");
    money = it.target ? `Your target is ${gbp(it.target)}.` : "";
  } else if (it.kind === "gone") {
    avail = "No longer in stock in your size, or gone from the shop.";
  } else {
    avail = `In stock in your size at ${esc(it.store || "the shop")}${it.size ? ` (${esc(String(it.size).split("|")[0])})` : ""}.` + (it.firstSeen ? ` First seen ${dayName(it.firstSeen)}.` : "");
  }
  const hist = it.kind === "watch" ? ((S.history || {})[String(it.id)] || []).filter(h => h[1] != null) : [];
  const fi = it.kind === "watch" ? fitInfo(it) : null;
  const verdict = fi ? ({good: "Should suit your build.", check: "Worth checking before you buy.", avoid: "Doesn't fit your brief."}[fi.v] || "") : "";
  const sims = it.traits && it.traits.length ? E.similar(it, ranked().list.map(r => r.it), 8) : [];
  const HIDE = {nope: "You said not for me.", owned: "You own this.", "own-similar": "You own something like it.", category: "Not a category you shop.", "sold-out": "Sold out.", cooldown: "Resting: shown a few times with no reaction."};
  const hidLine = hid ? (HIDE[hid] || HIDE[hid.split(":")[0]] || `Hidden by your rules (${esc(hid.replace(":", ": "))}).`) : "";
  $("dBody").innerHTML = `<div class="tile">${tile(it, 1000, "(max-width:760px) 100vw, 500px")}</div>
    <p class="brand">${brandLine(it)}</p><h2 id="dTitle">${esc(it.name)}</h2>
    ${it.price != null ? `<p class="d-price num"><span class="${red ? "red" : ""}">${gbp(it.price)}</span>${red ? `<s>${gbp(it.was)}</s><span class="off">${it.disc}% off</span>` : ""}</p>` : ""}
    ${sc ? `<p class="d-match"><b>${sc.pct}% match</b>${x && x.wildcard ? ` · ${esc(x.note)}` : (whyLine({it, sc}) ? " · " + esc(whyLine({it, sc})) : "")}</p>` : ""}
    ${hid && hid !== "gone" ? `<p class="d-match soft">${esc(hidLine)}</p>` : ""}
    <div class="d-actions">
      ${it.url ? `<a class="btn" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" data-act="visit">View at ${esc(it.store || "the shop")}</a>` : ""}
      <div class="d-row">${chip("love", `${e.s === "love" ? "♥" : "♡"} Love`, e.s === "love")}${chip("nope", "✕ Not for me", e.s === "nope")}${chip("more", "More like this", e.more)}
        ${chip("save", e.save ? "Saved" : "Save", e.save)}${chip("pricey", "Too pricey", e.pricey)}${chip("own", "Own similar", e.own)}${chip("bought", "Bought it", e.bought || it.bought)}</div>
    </div>
    <div class="d-sec"><h3>Availability</h3><p>${avail}</p>${money ? `<p class="soft">${money}</p>` : ""}${sparkHTML(it, hist)}</div>
    ${fi ? `<div class="d-sec"><h3>Fit</h3><p>${verdict} ${esc(fi.note)}</p>${fi.reach ? `<p class="soft">${esc(fi.reach)}</p>` : ""}</div>` : ""}
    ${it.why && it.kind === "pick" ? `<div class="d-sec"><h3>Why Claude picked it</h3><p>${esc(it.why)}</p></div>` : ""}
    ${it.note ? `<div class="d-sec"><h3>Why it's on the list</h3><p>${esc(it.note)}</p></div>` : ""}
    ${sc ? `<div class="d-sec"><h3>What it's reading</h3><p class="soft">${traitList(it)}</p></div>` : ""}
    ${sims.length ? `<div class="d-sec" id="dSim"><h3>Similar pieces</h3><div class="sim">${sims.map(s => `<a class="card-hit" href="#item=${encodeURIComponent(s.key)}" data-open data-swap>
      <div class="tile">${tile(s, 400, "120px")}</div><p class="name">${esc(s.brand || "")}</p><p class="price num">${gbp(s.price)}</p></a>`).join("")}</div></div>` : ""}
    <div class="d-sec menu">${askLink(it)}</div>`;
  $("dBody").dataset.key = it.key;
  if (focus === "similar") { const sim = $("dSim"); if (sim) setTimeout(() => sim.scrollIntoView({block: "start"}), 60); }
}
function traitList(it) {
  const m = model();
  return it.traits.filter(t => !/^(s|d):/.test(t)).map(t => {
    const a = E.affinity(m, t);
    return `${esc(E.label(t, S.brands))}${Math.abs(a) >= 0.25 ? (a > 0 ? " ▲" : " ▼") : ""}`;
  }).join(" · ");
}
function sparkHTML(it, hist) {
  if (hist.length < 3) return "";
  const ps = hist.map(h => h[1]), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const pts = hist.map((h, i) => `${((i / (hist.length - 1)) * 100).toFixed(2)},${(28 - ((h[1] - lo) / span) * 24).toFixed(2)}`).join(" ");
  const low = hist.find(h => h[1] === lo);
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
    <p class="soft">Lowest ${gbp(lo)} on ${dayName(low[0])}, tracked since ${dayName(hist[0][0])}.</p>`;
}
function closeDrawer(fromPop) {
  const d = $("drawer");
  if (d.hidden) return;
  if (!fromPop && S.drawerPushed) { S.drawerPushed = false; history.back(); return; }
  S.drawer = null;
  S.drawerPushed = false;
  clearTimeout(S.lingerT);
  d.classList.add("closed");
  if ($("sheet").hidden) $("scrim").hidden = true;
  document.body.classList.remove("locked");
  setTimeout(() => { if (!S.drawer) d.hidden = true; }, 280);
  if (/^#item=/.test(location.hash)) history.replaceState(null, "", "#" + HASH_OF[S.view]);
  if (S.lastFocus && document.contains(S.lastFocus)) S.lastFocus.focus();
}

/* ------------------------------------------------------------------ You */
function renderYou() {
  const box = $("you"), u = A.acct.user, server = A.acct.server;
  const P = (id, title, body) => `<section class="panel" id="${id}"><h2>${title}</h2>${body}</section>`;
  const parts = [];
  // Account
  let acc = "";
  if (!server) {
    acc = `<p>Your taps are saved in this browser${S.brief ? ", with your style brief" : ""}.${S.where ? ` Capsule's synced home is <a href="${esc(S.where)}">here</a>; open it to sign in and keep every device in step.` : " Accounts and syncing arrive with Capsule's new home."}</p>`;
  } else if (!u) {
    const invite = A.pendingInvite();
    acc = invite ? `<p>Your invite is ready${S.brief ? " and your style brief is unlocked" : ""}. Pick a name and create a passkey: your phone's Face ID, fingerprint or screen lock. No password, no email.</p>
      <div class="row"><input class="textin" id="handle" value="don" autocomplete="username" aria-label="Your name on Capsule" maxlength="20"><button class="btn" data-you="signup">Create passkey</button></div>`
      : `<p>Sign in to keep your taps, saved pieces and settings in step on every device.</p>`;
    acc += `<div class="row"><button class="btn ${invite ? "ghost" : ""}" data-you="signin">Sign in with a passkey</button></div>
      <p class="mt">Signing in on a new device? On a signed-in one, go to You › Link another device, then enter the code here.</p>
      <div class="row"><input class="textin code-in" id="linkIn" placeholder="ABCD-EFGH" autocomplete="one-time-code" autocapitalize="characters" maxlength="12" aria-label="Code from another device" value="${esc(S.linkCode || "")}"><button class="btn ghost" data-you="redeem">Use code</button></div>
      <details class="mt"><summary>Lost your passkeys?</summary><div class="row"><input class="textin" id="recName" placeholder="Your name" aria-label="Your name"><input class="textin" id="recCode" placeholder="Recovery code" aria-label="Recovery code"><button class="btn ghost" data-you="recover">Recover</button></div></details>
      <p class="err" id="accErr" hidden></p>`;
  } else {
    const me = A.acct.me || {};
    acc = `<p>Signed in as <b>@${esc(u.handle)}</b>. <span id="syncWords">${syncWords()}</span></p>
      <div class="row"><button class="btn" data-you="link">Link another device</button><button class="btn ghost" data-you="signout">Sign out</button></div>
      <div id="linkBox"></div><p class="err" id="accErr" hidden></p>`;
    parts.push(P("pDevices", "Devices and security", `<p>${plural(me.passkeys || 0, "passkey")} · ${plural(me.recoveryLeft ?? 0, "recovery code")} left.</p>
      <div class="list" id="sessList"><p class="soft">Loading devices…</p></div>
      <div class="row"><button class="btn ghost small" data-you="addkey">Add a passkey here</button><button class="btn ghost small" data-you="codes">New recovery codes</button>
      <a class="btn ghost small" href="/api/me/export" download>Export everything</a><button class="btn ghost small danger" data-you="delete">Delete account</button></div>`));
  }
  parts.unshift(P("pAcct", "Account", acc));
  // This week: the Sunday email links here. Worked out on this device from your own taps.
  const wk = weekly();
  if (wk) parts.splice(1, 0, P("pWeek", "This week", `<p>${plural(wk.taps, "reaction")} in the last seven days: ${plural(wk.loves, "love")}, ${wk.nopes} not for me${wk.trained ? `, ${wk.trained} in Train` : ""}.</p>
    ${wk.up.length ? `<h3 class="sub3">Moving up</h3><div class="chips wrap">${wk.up.map(t => `<span class="chip">▲ ${esc(E.label(t, S.brands))}</span>`).join("")}</div>` : ""}
    ${wk.down.length ? `<h3 class="sub3">Moving down</h3><div class="chips wrap">${wk.down.map(t => `<span class="chip">▼ ${esc(E.label(t, S.brands))}</span>`).join("")}</div>` : ""}
    <p class="mt">${esc(gaps().ready + " of " + gaps().total)} outfits ready to wear.</p>`));
  // Claude's notes
  if (u && S.notes && S.notes.length) {
    const n = S.notes[0];
    parts.push(P("pNotes", "From Claude", `<div class="note">${esc(n.body)}</div><p class="soft mt">${dayName(new Date(n.created * 1000).toISOString())}</p>`));
  }
  // Saved and loved
  const saved = Object.entries(S.entries).filter(([, e]) => (e.save || e.s === "love") && e.f).sort((a, b) => Date.parse(b[1].et || b[1].t) - Date.parse(a[1].et || a[1].t)).slice(0, 24);
  parts.push(P("pSaved", "Saved and loved", saved.length ? `<div class="minis">${saved.map(([k, e]) => {
    const it = S.byKey.get(k) || pseudo(k);
    return `<a class="card-hit" href="#item=${encodeURIComponent(k)}" data-open><div class="tile">${tile(it, 400, "120px")}${e.s === "love" ? `<div class="badges"><span class="badge">♥</span></div>` : ""}</div>
      <p class="name">${esc(it.brand || "")}</p><p class="price num">${it.kind === "gone" ? "Gone" : gbp(it.price)}</p></a>`;
  }).join("")}</div>` : `<p>Tap ♡ on anything, or Save from the ⋯ menu, and it lands here.</p>`));
  // What it has learned
  const m = model(), sum = E.summary(m, S.brands, 10);
  const row = r => `<div class="trait${r.v < 0 ? " neg" : ""}" data-t="${esc(r.t)}"><span class="lbl">${esc(r.label)}${r.pinned ? ` <span class="pin">pinned</span>` : ""}</span><span class="bar"><i data-w="${Math.min(100, Math.abs(r.v) / 2.5 * 100).toFixed(0)}"></i></span>
    <span class="tools">${r.pinned ? `<button data-pin="clear" title="Let it learn this again" aria-label="Unpin ${esc(r.label)}">↺</button>` : `<button data-pin="up" title="Always boost" aria-label="Always boost ${esc(r.label)}">▲</button><button data-pin="down" title="Never show" aria-label="Never show ${esc(r.label)}">▼</button>`}</span></div>`;
  const total = Object.values(S.entries).filter(E.reacted).length;
  parts.push(P("pLearn", "What it's learned", `<p>${total ? `From ${plural(total, "reaction")}${S.brief ? " and your style brief" : ""}.` : S.brief ? "From your style brief so far. Every tap adds to it." : "Nothing yet. Every tap teaches it."} Bars show how hard each thing pulls a piece up or down. ▲ always boosts it, ▼ never shows it.</p>
    <h3 class="sub3">Pulls up</h3><div class="traits">${sum.likes.map(row).join("") || `<p class="soft">Nothing yet.</p>`}</div>
    <h3 class="sub3">Pushes down</h3><div class="traits">${sum.dislikes.map(row).join("") || `<p class="soft">Nothing yet.</p>`}</div>
    ${sum.hard.length ? `<h3 class="sub3">Never shown</h3><div class="chips wrap">${sum.hard.map(h => `<span class="chip ghost">${esc(h.label)}</span>`).join("")}</div>` : ""}
    <div class="row"><span class="soft">Your no's are</span><div class="seg" role="group" aria-label="How strict your no's are">
      <button data-rules="soft" aria-pressed="${m.softRules}">Soft: sink to the bottom</button><button data-rules="hard" aria-pressed="${!m.softRules}">Hard: never shown</button></div></div>
    <div class="row"><button class="btn ghost small" data-you="reset">Start learning afresh</button></div>`));
  // Targets and price ceilings
  const og = gaps();
  const CNT = [["tees", "Tees", ["tee"]], ["knits", "Knits", ["knit", "cardigan"]], ["sweats", "Sweats & fleece", ["sweat", "hoodie", "fleece"]], ["overshirts", "Overshirts", ["overshirt"]],
    ["jackets", "Jackets", ["jacket"]], ["jeans", "Jeans", ["jeans"]], ["trousers", "Trousers", ["chino", "trouser"]], ["trainers", "Trainers", ["trainer"]], ["boots", "Boots", ["boot", "wallabee"]]];
  const CAP = [["tee", "Tees"], ["knit", "Knits"], ["overshirt", "Overshirts"], ["jacket", "Jackets"], ["jeans", "Jeans"], ["chinos", "Chinos"], ["trainers", "Trainers"], ["boots", "Boots"]];
  parts.push(P("pTargets", "Targets and price ceilings", `<p>How many of each you want. Once you own that many, it only suggests upgrades on sale.</p>
    <div class="fields">${CNT.map(([k, l, roles]) => { const own = roles.reduce((n, r) => n + (og.owned[r] || 0), 0); return `<div class="field"><label for="c_${k}">${l} <span class="faint">· own ${own}</span></label><div class="in"><input id="c_${k}" type="number" min="0" max="30" inputmode="numeric" data-count="${k}" value="${m.counts[k] ?? ""}"></div></div>`; }).join("")}</div>
    <p class="mt">The most you'd pay at full price. Pieces over it sink unless they're reduced.</p>
    <div class="fields">${CAP.map(([k, l]) => `<div class="field"><label for="p_${k}">${l}</label><div class="in"><b>£</b><input id="p_${k}" type="number" min="0" max="5000" inputmode="numeric" data-cap="${k}" value="${m.caps[k] ?? ""}"></div></div>`).join("")}</div>`));
  // Feed and look
  const ex = m.explore || 0;
  const segBtn = (attr, v, label, on) => `<button ${attr}="${v}" aria-pressed="${on}">${label}</button>`;
  parts.push(P("pFeed", "Feed and look", `<p>Wildcards are pieces it knows little about, to keep finding new things you like.</p>
    <div class="row"><div class="seg" role="group" aria-label="Wildcards">${[[0, "Off"], [0.1, "1 in 10"], [0.2, "1 in 5"], [0.33, "1 in 3"]].map(([v, l]) => segBtn("data-explore", v, l, Math.abs(ex - v) < 0.02)).join("")}</div></div>
    <p class="mt">Look</p><div class="row"><div class="seg" role="group" aria-label="Theme">${[["auto", "Follow phone"], ["dark", "Dark"], ["light", "Light"]].map(([v, l]) => segBtn("data-theme", v, l, (S.cfg.theme || "auto") === v)).join("")}</div></div>`));
  box.innerHTML = parts.join("");
  box.querySelectorAll(".trait .bar i").forEach(i => { i.style.width = i.dataset.w + "%"; });
  if (u) loadDevices();
}
/* What the last seven days of taps changed: affinities now vs. learned from everything before the week began. */
function weekly() {
  const now = Date.now(), cut = now - 7 * 864e5, older = {};
  let taps = 0, loves = 0, nopes = 0, trained = 0;
  for (const [k, e] of Object.entries(S.entries)) {
    const when = Date.parse(e.et || e.t) || 0;
    if (when < cut) { older[k] = e; continue; }
    if (!E.reacted(e)) continue;
    taps++;
    if (e.s === "love") loves++;
    if (e.s === "nope") nopes++;
    if (e.s === "like" || e.s === "no" || e.wins || e.losses) trained++;
  }
  if (!taps) return null;
  const m = model();
  const before = E.learn(older, {now: cut, fadeDays: (S.brief && S.brief.fade_days) || 90, resetAt: S.cfg.resetAt,
    traitsFor: k => { const it = S.byKey.get(k); return it && it.traits; }}).aff;
  const moves = [...new Set([...Object.keys(before), ...Object.keys(m.aff)])].filter(t => !/^(s|d|p|sea):/.test(t))
    .map(t => [t, (m.aff[t] || 0) - (before[t] || 0)]).filter(([, d]) => Math.abs(d) >= 0.12);
  const up = moves.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  const down = moves.filter(x => x[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 6).map(x => x[0]);
  return {taps, loves, nopes, trained, up, down};
}
function syncWords() {
  return {synced: "Everything is synced.", syncing: "Syncing…", offline: "Offline: changes will sync when you're back.", error: "Sync paused: " + (A.acct.error || "it'll retry shortly."), local: ""}[A.acct.status] || "";
}
async function loadDevices() {
  const el = $("sessList");
  if (!el) return;
  try {
    if (!S.devices || Date.now() - S.devices.at > 20000) S.devices = {at: Date.now(), list: Promise.all([A.listSessions(), A.listPasskeys()])};
    const [s, k] = await S.devices.list;
    if (!document.contains(el)) return;
    const when = t => new Date(t * 1000).toLocaleDateString("en-GB", {day: "numeric", month: "short"});
    el.innerHTML = s.sessions.map(x => `<div class="li"><span>${esc(x.device || "A device")}${x.current ? " · this one" : ""}<br><small class="faint">Signed in ${when(x.created)} by ${esc(x.method)}, last seen ${when(x.lastSeen)}</small></span>${x.current ? "" : `<button class="btn ghost small" data-revoke="${esc(x.id)}">Sign out</button>`}</div>`).join("") +
      k.passkeys.map(p => `<div class="li"><span>Passkey: ${esc(p.name || "Passkey")}${p.synced ? " · synced" : ""}<br><small class="faint">Added ${when(p.created)}</small></span></div>`).join("");
  } catch (e) { S.devices = null; el.innerHTML = `<p class="soft">${esc(e.message)}</p>`; }
}
function accErr(msg) { const el = $("accErr"); if (el) { el.textContent = msg; el.hidden = !msg; } else if (msg) toast(msg); }
async function youAction(what, btn) {
  accErr("");
  if (btn) btn.disabled = true;
  try {
    switch (what) {
      case "signup": {
        const handle = ($("handle").value || "").trim();
        const res = await A.signUp(handle, A.pendingInvite(), S.brief);
        showCodes(res.recoveryCodes, true);
        afterAuth("Account created. Every tap now syncs.");
        break;
      }
      case "signin": await A.signIn(); afterAuth("Signed in."); break;
      case "redeem": await A.redeemCode(($("linkIn").value || "").trim()); S.linkCode = null; afterAuth("This device is linked."); break;
      case "recover": {
        const res = await A.recoverWith(($("recName").value || "").trim(), ($("recCode").value || "").trim());
        afterAuth(`Signed in. ${plural(res.recoveryLeft, "recovery code")} left: add a passkey on this device.`);
        break;
      }
      case "link": {
        const r = await A.linkCode();
        const url = `${location.origin}/#link=${encodeURIComponent(r.code)}`;
        let qr = "";
        try { if (window.qrcode) { const q = window.qrcode(0, "M"); q.addData(url); q.make(); qr = `<img class="qr" alt="QR code to sign in another device" src="${q.createDataURL(5, 2)}">`; } } catch (e) { qr = ""; }
        $("linkBox").innerHTML = `<div class="linkbox">${qr}<div><p class="code num">${esc(r.code)}</p><p class="soft">On the other device, open Capsule › You and enter this code, or scan the QR code. It works once, for ten minutes.</p></div></div>`;
        break;
      }
      case "signout": await A.signOut(); S.notes = null; refreshAll(true); renderYou(); toast("Signed out. Your taps stay on this device."); break;
      case "addkey": await A.addPasskey(); toast("Passkey added."); renderYou(); break;
      case "codes": { const r = await A.newRecoveryCodes(); showCodes(r.recoveryCodes, false); break; }
      case "delete": {
        if (!confirmTwice(btn)) return;
        await A.deleteAccount();
        toast("Account deleted. Your taps are still on this device.");
        renderYou();
        break;
      }
      case "reset": {
        const prev = S.cfg.resetAt;
        setCfg(c => { c.resetAt = new Date().toISOString(); });
        refreshAll(true);
        toast("Starting afresh from your style brief.", {undo: () => { setCfg(c => { c.resetAt = prev; }); refreshAll(true); }});
        break;
      }
    }
  } catch (e) {
    accErr(A.passkeyError(e));
  } finally {
    if (btn && document.contains(btn)) btn.disabled = false;
  }
}
function confirmTwice(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1";
  btn.textContent = "Tap again to delete everything";
  setTimeout(() => { if (document.contains(btn)) { delete btn.dataset.armed; btn.textContent = "Delete account"; } }, 5000);
  return false;
}
function showCodes(codes, first) {
  openSheet(`<h3>${first ? "Save your recovery codes" : "Your new recovery codes"}</h3>
    <p class="sub">If you ever lose every passkey, one of these gets you back in. Each works once. ${first ? "" : "Your old codes no longer work."} Keep them in your password manager.</p>
    <div class="codes">${codes.map(c => `<div>${esc(c)}</div>`).join("")}</div>
    <div class="row"><button class="btn" data-copy="${esc(codes.join("\n"))}">Copy codes</button><button class="btn ghost" data-close-sheet>Done</button></div>`);
}
async function afterAuth(msg) {
  toast(msg);
  refreshAll(true);
  renderYou();
  try { S.notes = (await A.notes()).notes; if (S.view === "you") renderYou(); } catch (e) { /* no notes yet */ }
}

/* ------------------------------------------------------------------ chrome */
function renderWho() {
  const st = A.acct.status, u = A.acct.user;
  const dot = $("syncDot");
  dot.className = "sync-dot" + (u && st === "synced" ? " on" : st === "error" || st === "offline" ? " err" : "");
  $("whoText").textContent = u ? (st === "syncing" ? "Syncing" : st === "offline" ? "Offline" : st === "error" ? "Sync paused" : "@" + u.handle) : "This device";
}
function banner(html) {
  $("banner").hidden = !html;
  $("bannerIn").innerHTML = html || "";
}
function renderBanner() {
  if (A.acct.server && !A.acct.user && A.pendingInvite()) return banner(`<span>${S.brief ? "Your style brief is unlocked." : "Your invite is ready."} Create a passkey to keep it synced.</span><button data-go="you">Set up</button>`);
  const gen = S.data && S.data.generated;
  if (gen) {
    const hrs = (Date.now() - Date.parse(gen)) / 36e5;
    if (hrs > 30) return banner(`<span>Prices were last checked ${Math.round(hrs)} hours ago, so the updater may have stopped.</span><a href="https://github.com/CyberSecDigestDaily/capsule/actions" target="_blank" rel="noopener">Updater status</a>`);
  }
  banner("");
}
function renderFoot() {
  const w = watchItems(), live = w.filter(i => !i.bought);
  const shops = new Set(S.items.map(i => i.store).filter(Boolean)).size;
  const gen = S.data && S.data.generated ? new Date(S.data.generated).toLocaleString("en-GB", {weekday: "short", hour: "2-digit", minute: "2-digit"}) : "";
  $("footNote").textContent = `${S.items.length} pieces in your size from ${shops} shops, ${live.length} on your watch list. Prices and stock checked about three times a day${gen ? `, last ${gen}` : ""}.`;
}
function applyTheme() {
  const t = S.cfg.theme || "auto";
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
function renderView(v, reset) {
  S.rendered[v] = S.version;
  if (v === "for-you") renderForYou(reset);
  else if (v === "train") renderTrain();
  else if (v === "shop") renderShop();
  else if (v === "outfits") renderOutfits();
  else if (v === "deals") renderDeals();
  else if (v === "you") renderYou();
}
/* Re-render what's on screen. For you keeps its order unless asked (reset) or nothing has been tapped yet. */
function refreshAll(soft) {
  if (!S.data) return;
  renderBanner();
  renderFoot();
  if (S.view === "for-you") {
    if (soft) {
      // Only cards changed: hide what's hidden now, refresh buttons.
      document.querySelectorAll("#fyGrid .card[data-key]").forEach(el => {
        const k = el.dataset.key, e = ent(k) || {};
        if (el.querySelector(".gone")) return;
        if (!ranked().by.get(k) && !(e.s === "love" || e.more || e.save)) el.remove(); else refreshCard(k);
      });
    } else renderView("for-you", S.taps === 0);
  } else if (S.view === "you" && youBusy()) {
    // Don't wipe a code you're reading or a field you're typing in; the tab catches up next time it opens.
    S.rendered = {};
    return;
  } else if (S.view !== "train") renderView(S.view);
  S.rendered = {[S.view]: S.version};
}
function youBusy() {
  const a = document.activeElement;
  return !!(($("linkBox") && $("linkBox").childElementCount) || (a && a.closest && a.closest("#you") && /INPUT|SELECT|TEXTAREA/.test(a.tagName)));
}
function show(v, o = {}) {
  if (!VIEW_OF[v]) v = "for-you";
  v = VIEW_OF[v];
  const changed = S.view !== v;
  if (changed) hideToast();
  S.view = v;
  for (const [id] of VIEWS) $("view-" + id).hidden = id !== v;
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
  const want = "#" + HASH_OF[v];
  if (!o.keepHash && location.hash !== want && !/^#item=/.test(location.hash)) history.replaceState(null, "", want);
  if (S.data) {
    // Coming back to For you after a burst of taps re-ranks it, so the feed feels alive.
    const reset = v === "for-you" && changed && S.taps - S.fy.at >= 5;
    if (changed || S.rendered[v] !== S.version || reset) renderView(v, reset);
  }
  if (changed && !o.noScroll) window.scrollTo({top: 0});
}
function buildNav() {
  $("dock").innerHTML = VIEWS.map(([id, label, icon]) => `<button data-view="${id}" aria-selected="${S.view === id}">${I[icon]}<span>${esc(label === "Watch list" ? "Watch" : label)}</span></button>`).join("");
}

/* ------------------------------------------------------------------ hash links */
function parseHash() {
  const raw = location.hash.slice(1), parts = raw.split("&").filter(Boolean), kv = {};
  let view = null;
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i < 0) view = p;
    else { try { kv[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (e) { kv[p.slice(0, i)] = p.slice(i + 1); } }
  }
  return {view, kv};
}
/* Things a link can carry: an invite, a sign-in code, a piece to open, ticks carried over from the old address. */
async function handleHash(first) {
  const {view, kv} = parseHash();
  let go = view, clean = false;
  if (kv.join) {
    A.rememberInvite(kv.join);
    clean = true;
    go = (await A.hasServer()) ? "you" : "for-you"; // sign-up needs Capsule's server; the static copy just personalises
    try {
      const brief = await A.readSeed(kv.join);
      if (brief && typeof brief === "object") { S.brief = brief; saveLocal(true); bump(); toast("Your style brief is unlocked on this device."); }
    } catch (e) { /* no seed for this invite */ }
  }
  if (kv.link) { S.linkCode = kv.link; clean = true; go = "you"; }
  if (kv.carry) { carryIn(kv.carry); clean = true; }
  if (kv.own !== undefined) { legacyOwn(kv.own, kv.reach); clean = true; go = go || "outfits"; }
  if (kv.item) {
    if (clean) history.replaceState(null, "", "#item=" + encodeURIComponent(kv.item));
    if (S.data) openDrawer(kv.item, {});
    return;
  }
  if (clean) history.replaceState(null, "", "#" + HASH_OF[VIEW_OF[go] || S.view]);
  if (go && VIEW_OF[go]) show(go, {noScroll: first});
}

/* ------------------------------------------------------------------ carrying old data over */
/* v4 kept ticks in this browser (capsule-bought, capsule-nope, capsule-reach). Bring them in once. */
function migrateOld() {
  if (device.migrated) return;
  const bought = store.get("capsule-bought", null), nope = store.get("capsule-nope", null), reach = parseFloat(store.raw("capsule-reach"));
  setCfg(c => {
    if (bought && typeof bought === "object") for (const [k, v] of Object.entries(bought)) if (/^(s\d{1,3}|\d{1,5})$/.test(k) && c.owned[k] === undefined) c.owned[k] = v ? 1 : 0;
    if (!isNaN(reach) && reach >= 60 && reach <= 130 && c.reach == null) c.reach = round2(reach);
  });
  if (nope && typeof nope === "object") {
    for (const url of Object.keys(nope)) {
      const it = S.items.find(i => i.url === url) || {key: E.itemKey(url), url};
      if (!it.key || (ent(it.key) || {}).s) continue;
      touch(it, e => { e.s = "nope"; }, {explicit: true, quiet: true});
    }
    bump();
  }
  device.migrated = 1;
  saveDevice();
}
/* The GitHub Pages copy hands your local taps to the new address in the link (the part after # never leaves the browser). */
function carryOut() {
  const owned = S.cfg.owned, entries = {};
  const keep = Object.entries(S.entries).filter(([, e]) => E.reacted(e)).sort((a, b) => Date.parse(b[1].t) - Date.parse(a[1].t)).slice(0, 300);
  for (const [k, e] of keep) entries[k] = e;
  const payload = JSON.stringify({v: 1, owned, reach: S.cfg.reach, entries});
  return A.b64u.enc(new TextEncoder().encode(payload));
}
function carryIn(b64) {
  try {
    const p = JSON.parse(new TextDecoder().decode(A.b64u.dec(b64)));
    setCfg(c => {
      for (const [k, v] of Object.entries(p.owned || {})) if (/^(s\d{1,3}|\d{1,5})$/.test(k) && c.owned[k] === undefined) c.owned[k] = v ? 1 : 0;
      if (p.reach && c.reach == null && p.reach >= 60 && p.reach <= 130) c.reach = round2(p.reach);
    });
    const keys = [];
    for (const [k, e] of Object.entries(p.entries || {})) {
      if (!/^[a-z0-9][a-z0-9.\-\/_~%+]{2,179}$/.test(k) || !e || typeof e.t !== "string") continue;
      S.entries[k] = tidy(E.mergeEntry(S.entries[k], tidy(e)));
      keys.push(k);
    }
    bump();
    saveLocal(true);
    A.markDirty(keys);
    device.migrated = 1;
    saveDevice();
    toast("Brought your taps over from the old address.");
  } catch (e) { /* ignore a damaged link */ }
}
function legacyOwn(own, reach) {
  const ids = new Set(own === "none" ? [] : String(own).split(",").map(s => s.trim()).filter(Boolean));
  setCfg(c => {
    for (const it of watchItems()) if (ids.has(String(it.id))) c.owned[String(it.id)] = 1;
    for (const s of staples()) { const want = ids.has(s.id); if (want !== !!s.owned) c.owned[s.id] = want ? 1 : 0; }
    if (reach && !isNaN(parseFloat(reach))) c.reach = parseFloat(reach);
  });
  toast("Wardrobe loaded from your link.");
}
/* When Capsule has moved (where.json on the old GitHub Pages address), go there and take your taps along. */
async function checkMoved() {
  try {
    const r = await fetch("where.json", {cache: "no-cache"});
    if (!r.ok) return false;
    const w = await r.json();
    if (!w || !/^https:\/\//.test(w.url || "")) return false;
    S.where = w.url;
    if (new URL(w.url).host === location.host) return false;
    const {kv, view} = parseHash();
    const bits = [];
    if (kv.item) bits.push("item=" + encodeURIComponent(kv.item));
    else if (view && VIEW_OF[view]) bits.push(HASH_OF[VIEW_OF[view]]);
    const invite = kv.join || A.pendingInvite();
    if (invite) bits.push("join=" + encodeURIComponent(invite));
    if (Object.values(S.entries).some(E.reacted) || Object.keys(S.cfg.owned).length || S.cfg.reach) bits.push("carry=" + carryOut());
    $("loading").textContent = "Capsule has moved. Taking you there…";
    location.replace(w.url.replace(/#.*$/, "") + (bits.length ? "#" + bits.join("&") : ""));
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------ events */
const host = {
  state: () => S,
  onStatus: () => { renderWho(); const w = $("syncWords"); if (w) w.textContent = syncWords(); },
  onRemote: () => {
    bump();
    saveLocal();
    applyTheme();
    if (!S.data) return;
    if (S.taps === 0 && S.view === "for-you") renderView("for-you", true);
    else refreshAll(true);
    renderWho();
  }
};
function wire() {
  document.addEventListener("click", ev => {
    const t = ev.target;
    const nav = t.closest("[data-view]");
    if (nav) { ev.preventDefault(); show(nav.dataset.view); return; }
    const go = t.closest("[data-go]");
    if (go) { show(go.dataset.go); return; }
    const act = t.closest("[data-act]");
    if (act) {
      const it = itemFrom(act);
      if (it) {
        if (act.tagName !== "A") ev.preventDefault();
        doAct(act.dataset.act, it, act);
      }
      return;
    }
    const open = t.closest("[data-open]");
    if (open && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
      ev.preventDefault();
      const k = decodeURIComponent((open.getAttribute("href") || "").replace(/^#item=/, ""));
      if (open.hasAttribute("data-swap") && S.drawer) { S.drawer = k; const it = itemOrPseudo(k); if (it) { history.replaceState({drawer: k}, "", "#item=" + encodeURIComponent(k)); renderDrawer(it); $("drawer").scrollTop = 0; noteOpen(it); } return; }
      openDrawer(k, {push: true, from: open});
      return;
    }
    const fy = t.closest("[data-fy]");
    if (fy) { S.fy.filter = fy.dataset.fy; renderForYou(true); return; }
    const cat = t.closest("[data-cat]");
    if (cat) { S.shop.cat = cat.dataset.cat; renderShop(); return; }
    const st = t.closest("[data-st]");
    if (st) { S.shop.status = st.dataset.st; renderShop(); return; }
    if (t.closest("[data-shop=clear]")) { Object.assign(S.shop, {cat: "all", status: "all", q: "", hideOwned: false}); $("q").value = ""; $("hideOwned").checked = false; renderShop(); return; }
    const tr = t.closest("[data-train]");
    if (tr) {
      const k = tr.dataset.train;
      if (k === "finish") { S.train.i = S.train.deck.length; trainDone(); }
      else if (k === "again") { newDeck(); renderTrain(); }
      else trainAnswer(k, Number(tr.dataset.j));
      return;
    }
    const you = t.closest("[data-you]");
    if (you) { youAction(you.dataset.you, you); return; }
    const pin = t.closest("[data-pin]");
    if (pin) {
      const tr2 = pin.closest("[data-t]").dataset.t, how = pin.dataset.pin;
      setCfg(c => { if (how === "clear") delete c.pins[tr2]; else c.pins[tr2] = how === "up" ? 1.5 : -3; });
      renderYou();
      toast(how === "down" ? `${E.label(tr2, S.brands)} won't be shown.` : how === "up" ? `${E.label(tr2, S.brands)} always gets a boost.` : "Back to learning it.");
      return;
    }
    const rules = t.closest("[data-rules]");
    if (rules) {
      setCfg(c => { c.rules = rules.dataset.rules === "hard" ? "hard" : "soft"; });
      renderYou();
      toast(S.cfg.rules === "hard" ? "Your no's are now hard rules: those pieces never show." : "Your no's are soft again: those pieces sink instead.");
      return;
    }
    const exp = t.closest("[data-explore]");
    if (exp) { setCfg(c => { c.explore = Number(exp.dataset.explore); }); renderYou(); return; }
    const th = t.closest("[data-theme]");
    if (th) { setCfg(c => { c.theme = th.dataset.theme; }); applyTheme(); renderYou(); return; }
    const rv = t.closest("[data-revoke]");
    if (rv) { A.revokeSession(rv.dataset.revoke).then(() => { S.devices = null; loadDevices(); }, e => toast(e.message)); return; }
    const cp = t.closest("[data-copy]");
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => toast("Copied.")).catch(() => toast("Couldn't copy: select and copy them instead.")); return; }
    if (t.closest("[data-close-sheet]")) { closeSheet(); return; }
    if (t.closest("#fyMore")) { moreForYou(); return; }
    if (t.closest("#howBtn")) { const h = $("howto"); h.hidden = !h.hidden; $("howBtn").setAttribute("aria-expanded", String(!h.hidden)); }
  });
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset.own) { setOwnedTick(t.dataset.own, t.dataset.id, t.checked); return; }
    if (t.dataset.count) { const v = parseInt(t.value, 10); setCfg(c => { if (isNaN(v)) delete c.counts[t.dataset.count]; else c.counts[t.dataset.count] = Math.max(0, Math.min(30, v)); }); toast("Target saved."); return; }
    if (t.dataset.cap) { const v = parseInt(t.value, 10); setCfg(c => { if (isNaN(v)) delete c.caps[t.dataset.cap]; else c.caps[t.dataset.cap] = Math.max(0, Math.min(5000, v)); }); toast("Ceiling saved."); return; }
    if (t.id === "reach") {
      const v = parseFloat(t.value);
      setCfg(c => { c.reach = !isNaN(v) && v >= 70 && v <= 120 ? round2(v) : null; });
      renderOutfits();
      toast(S.cfg.reach ? `Sleeve length set to ${S.cfg.reach}cm, saved to your account only` : "Sleeve length cleared");
      return;
    }
    if (t.id === "sort") { S.shop.sort = t.value; renderShop(); return; }
    if (t.id === "hideOwned") { S.shop.hideOwned = t.checked; renderShop(); }
  });
  $("q").addEventListener("input", e => { S.shop.q = e.target.value.trim(); renderShop(); });
  $("dClose").onclick = () => closeDrawer();
  $("scrim").onclick = () => { if (!$("sheet").hidden) closeSheet(); else closeDrawer(); };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (!$("sheet").hidden) closeSheet(); else closeDrawer(); return; }
    if (S.view !== "train" || S.drawer || !$("sheet").hidden || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    const step = S.train && S.train.deck[S.train.i];
    if (!step) return;
    const map = step.duel ? {ArrowLeft: ["pick", 0], ArrowRight: ["pick", 1], ArrowDown: ["neither"], "1": ["pick", 0], "2": ["pick", 1]}
      : {ArrowLeft: ["no"], ArrowRight: ["like"], ArrowUp: ["love"], ArrowDown: ["skip"], " ": ["skip"]};
    const a = map[e.key];
    if (a) { e.preventDefault(); trainAnswer(a[0], a[1]); }
  });
  window.addEventListener("popstate", () => {
    if (/^#item=/.test(location.hash)) {
      const k = parseHash().kv.item;
      if (k && k !== S.drawer) openDrawer(k, {});
    } else {
      if (S.drawer) closeDrawer(true);
      const v = parseHash().view;
      if (v && VIEW_OF[v] && VIEW_OF[v] !== S.view) show(v, {keepHash: true});
    }
  });
  window.addEventListener("hashchange", () => { const {kv} = parseHash(); if (kv.join || kv.link || kv.carry || kv.own !== undefined) handleHash(false); });
  // Portrait product photos fill the tile; packshots on white sit inside it.
  document.addEventListener("load", e => {
    const i = e.target;
    if (i.tagName === "IMG" && i.closest(".tile") && i.naturalHeight > i.naturalWidth * 1.08) i.classList.add("fill");
  }, true);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { saveLocal(true); if (A.acct.user && A.hasPending()) A.sync(); } });
  const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  const tc = () => {
    const dark = S.cfg.theme === "dark" || (S.cfg.theme !== "light" && mq && mq.matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", dark ? "#0F0F0E" : "#E8E5DE"));
  };
  if (mq && mq.addEventListener) mq.addEventListener("change", tc);
  tc();
}

/* ------------------------------------------------------------------ start */
async function getJSON(path, fallback) {
  try {
    const r = await fetch(path, {cache: "no-cache"});
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
async function init() {
  loadLocal();
  applyTheme();
  buildNav();
  wire();
  const first = parseHash();
  S.view = VIEW_OF[first.view] || "for-you";
  const acctReady = A.initAccount(host).then(async () => {
    renderWho();
    if (A.acct.user) { try { S.notes = (await A.notes()).notes; } catch (e) { /* none yet */ } }
    if (S.data) { renderBanner(); if (S.view === "you") renderYou(); }
  });
  let data, finds, pool;
  try {
    [data, finds, pool] = await Promise.all([getJSON("data.json"), getJSON("finds.json", null), getJSON("pool.json", null)]);
  } catch (e) {
    $("loading").textContent = "Today's pieces didn't load. Refresh the page; if it keeps happening, check the updater status link below.";
    return;
  }
  S.data = data; S.finds = finds; S.pool = pool;
  S.items = E.allItems(data, finds, pool);
  for (const it of S.items) if (!S.byKey.has(it.key)) S.byKey.set(it.key, it);
  S.brands = E.brandNames(S.items);
  S.picks = ((finds && finds.picks) || []).map(p => E.normItem(p, "pick")).filter(p => p.key);
  S.picksKeys = new Set(S.picks.map(p => p.key));
  getJSON("history.json", {}).then(h => { S.history = h || {}; refreshDrawer(); });
  migrateOld();
  if (/\.github\.io$/.test(location.hostname) && await checkMoved()) return;
  prune(false);
  S.prevVisit = device.lastVisit;
  if (!device.lastVisit || Date.now() - Date.parse(device.lastVisit) > 3600e3) { device.lastVisit = new Date().toISOString(); saveDevice(); }
  $("loading").hidden = true;
  await handleHash(true);
  show(S.view, {noScroll: true});
  renderBanner();
  renderFoot();
  renderWho();
  const {kv} = parseHash();
  if (kv.item && !S.drawer) openDrawer(kv.item, {});
  acctReady.catch(() => {});
}
init();
