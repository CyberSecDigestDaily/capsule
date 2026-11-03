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
const defaultCfg = () => ({counts: {}, caps: {}, pins: {}, owned: {}, profile: {}, resetAt: null, explore: 0.2, theme: "auto", reach: null, rules: null});
// Per-device bits that never sync: when you last visited (for "new since your last visit"), the one-off v4 import, and
// small conveniences (the Train how-to seen, the deals sort, the reactions tab, where you like to keep passkeys).
const KEY_DEVICE = "capsule.v5.device";
const device = store.get(KEY_DEVICE, null) || {lastVisit: null, migrated: 0};
const saveDevice = () => store.set(KEY_DEVICE, device);
S.deals = {sort: device.dealSort || "match", cat: device.dealCat || "all"};
S.reactTab = device.reactTab || "love";
S.pkWhere = device.pkWhere || "manager";

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
const isPass = s => s === "nope" || s === "no";
/* Other colours of the same piece (see familyOf in engine.js). */
const siblings = it => it && it.fam ? S.items.filter(o => o.fam === it.fam && o.key !== it.key) : [];
const famHidden = it => { const m = model(); return siblings(it).filter(o => E.hiddenWhy(m, o) === "family").length; };
const shortName = it => { const n = `${it.brand ? it.brand + " " : ""}${it.name || ""}`.trim(); return n.length > 60 ? n.slice(0, 58).trim() + "…" : n; };
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
  const out = [], e = ent(it.key) || {};
  if (e.s === "love") out.push(`<span class="badge loved">♥ Loved</span>`);
  else if (e.s === "like") out.push(`<span class="badge liked">✓ Liked</span>`);
  if (x && x.wildcard) out.push(`<span class="badge wild">Wildcard</span>`);
  if (isOwned(it)) out.push(`<span class="badge muted">Owned</span>`);
  else if (it.signal === "BUY") out.push(`<span class="badge buy">Buy now</span>`);
  else if (it.inStock === false) out.push(`<span class="badge muted">${it.restock_watch ? "Restock watch" : "Sold out"}</span>`);
  if (it.disc >= 10 && !isOwned(it)) out.push(`<span class="badge sale">−${it.disc}%</span>`);
  if (isNew(it) && !(x && x.wildcard) && out.length < 2) out.push(`<span class="badge new">New in</span>`);
  if (out.length > 3) out.length = 3;
  return out.length ? `<div class="badges">${out.join("")}</div>` : "";
}
function actsHTML(it, o = {}) {
  const e = ent(it.key) || {};
  const love = e.s === "love";
  return `<div class="acts">
    <button class="act love${o.pop ? " pop" : ""}" data-act="love" aria-pressed="${love}" aria-label="${love ? "Loved. Tap to undo" : "Love it"}" title="${love ? "Loved. Tap to undo" : "Love it"}">${love ? I.heartOn : I.heart}</button>
    <button class="act nope" data-act="nope" aria-pressed="${isPass(e.s)}" aria-label="Not for me: hide it" title="Not for me: hide it">${I.x}</button>
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
/* What hiding a piece did, in words: it, and its other colours unless the colour was the problem. */
function goneLine(it) {
  const n = famHidden(it), e = ent(it.key) || {};
  if (n) return `<b>Hidden.</b> You won't see it, or its ${n === 1 ? "other colour" : n + " other colours"}, again.`;
  return `<b>Hidden.</b> You won't see it again.${(e.why || []).includes("colour") && siblings(it).length ? " Its other colours still show." : ""}`;
}
function goneHTML(it) {
  const e = ent(it.key) || {}, why = new Set(e.why || []);
  return `<article class="card" data-key="${esc(it.key)}"><div class="gone" role="status"><p class="gone-h">${I.x}<span class="gl">${goneLine(it)}</span></p>
    <p class="gq">What's off about it? <span class="faint">Optional, it learns either way.</span></p>
    <div class="chips">${E.REASONS_NOPE.map(([k, l]) => `<button class="chip" data-act="why" data-r="${k}" aria-pressed="${why.has(k)}">${esc(l)}</button>`).join("")}</div>
    <p><button class="linkish" data-act="undo-nope">Undo</button></p></div></article>`;
}
/* Swap one card in place (after a tap) without re-ranking the page under your finger. */
const GRIDS = "#fyGrid, #grid, #dealsGrid, #newStrip, #editGrid, #nextGrid";
function refreshCard(key, o = {}) {
  const it = S.byKey.get(key) || pseudo(key);
  if (!it) return;
  document.querySelectorAll(`.card[data-key="${CSS.escape(key)}"]`).forEach(el => {
    if (el.closest(".minis, .sim")) return;
    const e = ent(key) || {};
    const gone = el.querySelector(".gone");
    if (isPass(e.s) && el.closest(GRIDS)) {
      if (!gone) el.outerHTML = goneHTML(it); else gone.querySelector(".gl").innerHTML = goneLine(it);
      return;
    }
    if (gone) { el.outerHTML = cardHTML(ranked().by.get(key) || {it}); return; }
    const acts = el.querySelector(".acts");
    if (acts) acts.outerHTML = actsHTML(it, o);
    const t = el.querySelector(".tile"), meta = (S.fy.meta || {})[key] || {};
    if (t) { const b = t.querySelector(".badges"), nb = badges(it, {wildcard: meta.wildcard}); if (b) b.outerHTML = nb; else if (nb) t.insertAdjacentHTML("beforeend", nb); }
  });
}
/* Other colours on screen: dim the ones hidden along with a piece you passed on, and undim them when they're back. */
function syncSiblings(it) {
  const m = model();
  for (const o of siblings(it)) {
    const hid = E.hiddenWhy(m, o) === "family";
    document.querySelectorAll(`.card[data-key="${CSS.escape(o.key)}"]`).forEach(el => {
      if (!el.querySelector(".gone") && !el.closest(".minis, .sim")) el.classList.toggle("fam-hidden", hid);
    });
  }
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
  const inYou = !!(el && el.closest && el.closest("#pReact"));
  switch (act) {
    case "love": {
      const r = setState(it, "love", true);
      refreshCard(it.key, {pop: r.after === "love"}); refreshDrawer(); syncSiblings(it);
      if (r.after === "love") {
        toast("♥ Loved. It'll show you more like it. What do you like about it?", {chips: E.REASONS_LOVE, pressed: [], onChip: k => setWhy(it, k)});
      } else toast("Removed from loved.");
      break;
    }
    case "nope": {
      const r = setState(it, "nope", true);
      if (r.after !== "nope") { refreshAll(); syncSiblings(it); toast("Back in your feed."); break; }
      const inGrid = el && el.closest(GRIDS);
      syncSiblings(it);
      if (inGrid) refreshCard(it.key);
      else {
        if (S.drawer) closeDrawer();
        const n = famHidden(it);
        toast(`✕ Hidden${n ? ` with its ${plural(n, "other colour")}` : ""}. You won't see it again. What's off about it?`, {chips: E.REASONS_NOPE, pressed: [], onChip: k => { const on = setWhy(it, k); syncSiblings(it); return on; },
          undo: () => { restore(it, r.before); syncSiblings(it); refreshAll(); }});
        refreshAll(true);
      }
      break;
    }
    case "undo-nope": {
      touch(it, e => { delete e.s; delete e.why; }, {explicit: true});
      const card = el.closest(".card");
      if (card) { const x = ranked().by.get(it.key) || {it}; card.outerHTML = cardHTML(x); }
      syncSiblings(it);
      toast("Back in your feed.");
      break;
    }
    case "unhide": {
      touch(it, e => { delete e.s; delete e.why; }, {explicit: true});
      syncSiblings(it); refreshCard(it.key); refreshDrawer();
      toast("Back in your feed.");
      break;
    }
    case "why": {
      const on = setWhy(it, el.dataset.r);
      el.setAttribute("aria-pressed", String(on));
      const gl = el.closest(".gone") && el.closest(".gone").querySelector(".gl");
      if (gl) gl.innerHTML = goneLine(it);
      syncSiblings(it);
      break;
    }
    case "like": case "no": {
      const r = setState(it, act, true);
      refreshCard(it.key); refreshDrawer(); syncSiblings(it);
      if (act === "like") toast(r.after === "like" ? "✓ Liked. You'll see more like it." : "Removed from liked.");
      break;
    }
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
  renderTally();
  if (inYou && S.view === "you") renderYou();
}
/* The running count of your reactions, under For you's title. */
function tallyHTML() {
  let love = 0, like = 0, hid = 0;
  for (const e of Object.values(S.entries)) { if (e.s === "love") love++; else if (e.s === "like") like++; else if (isPass(e.s)) hid++; }
  if (!love && !like && !hid) return "";
  return `<span class="t-love">♥ ${love} loved</span><span class="t-like">✓ ${like} liked</span><span class="t-no">✕ ${hid} hidden</span>` +
    `<button class="linkish" data-go="you" data-anchor="pReact">See them</button>`;
}
function renderTally() {
  const el = $("fyTally");
  if (!el) return;
  const h = tallyHTML();
  el.hidden = !h;
  if (el.innerHTML !== h) el.innerHTML = h;
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
    if (isPass(e.s)) continue;
    const x = R.by.get(k);
    if (!x && !(e.s === "love" || e.s === "like" || e.more || e.save)) continue; // hidden since (bought, owned, another colour passed on...)
    const meta = S.fy.meta[k] || {};
    rows.push(cardHTML({it, sc: x ? x.sc : scoreOf(it), wildcard: meta.wildcard, note: meta.note}));
  }
  $("fyGrid").innerHTML = rows.join("") || `<p class="empty">Nothing here right now. Try another filter.</p>`;
  $("fyCount").textContent = `${vis.length} in your size`;
  $("fyMore").hidden = vis.filter(x => !S.fy.keys.includes(x.it.key)).length === 0;
  const lede = S.brief ? "Everything in your size, ranked by what you like. Tap ♡ or ✕ on anything and it learns."
    : "Everything in your size, ranked. Tap ♡ or ✕ on anything and it learns your taste, on this device.";
  $("fyLede").textContent = lede;
  renderTally();
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
  S.train = {deck: E.trainDeck(m, S.items, Object.assign(ctx(), {seed: String(Date.now())}), n, duels), i: 0, before: Object.assign({}, m.aff), done: 0,
    tally: {love: 0, like: 0, no: 0, skip: 0}, last: null, undo: null};
}
// What each answer does, said back to you after every card.
const TRAIN_SAID = {
  no: ["✕", "Passed on", "it's hidden from your feed"],
  like: ["✓", "Liked", "you'll see more like it"],
  love: ["♥", "Loved", "the strongest yes; it's in You › Your reactions"],
  skip: ["↓", "Skipped", "nothing learned"]
};
function lastHTML(T) {
  const l = T.last;
  if (!l) return `<p class="tlast empty" id="tlast">Each answer shows here, with an undo.</p>`;
  if (l.kind === "pick") return `<p class="tlast pick" id="tlast" role="status"><span class="ic">✓</span><span>Picked <b>${esc(l.name)}</b> over ${esc(l.other)}.</span></p>`;
  if (l.kind === "neither") return `<p class="tlast no" id="tlast" role="status"><span class="ic">✕</span><span>Neither. Both noted as less your thing.</span></p>`;
  const [ic, verb, tail] = TRAIN_SAID[l.kind];
  const fam = l.kind === "no" && l.fam ? `, along with its ${l.fam === 1 ? "other colour" : l.fam + " other colours"}` : "";
  return `<p class="tlast ${l.kind}" id="tlast" role="status"><span class="ic">${ic}</span><span>${verb} <b>${esc(l.name)}</b>: ${tail}${fam}.</span>` +
    `${T.undo ? `<button class="linkish" data-train="undo">Undo</button>` : ""}</p>`;
}
function renderTrain() {
  if (!S.train || (S.train.i >= S.train.deck.length && S.train.closed)) newDeck();
  const T = S.train, box = $("train");
  if (!T.deck.length) {
    box.innerHTML = `<div class="tdone"><h2>Nothing to train on</h2><p class="lede">You've reacted to everything in stock right now. New pieces land about three times a day.</p></div>`;
    return;
  }
  if (T.i >= T.deck.length) return trainDone();
  const step = T.deck[T.i], t = T.tally;
  const top = `<div class="train-top"><span class="num">${T.i + 1} of ${T.deck.length}</span>
    <span class="ttally num" title="This round so far"><span class="t-love">♥ ${t.love}</span><span class="t-like">✓ ${t.like}</span><span class="t-no">✕ ${t.no}</span></span>
    <button class="linkish" data-train="finish">Finish</button></div><div class="progress"><i></i></div>`;
  const coach = device.coach ? "" : `<div class="coach" role="note"><p><b>Swipe to teach it.</b> <span class="c-no">← Pass</span> hides a piece from your feed.
    <span class="c-yes">Like →</span> shows you more like it. <span class="c-love">↑ Love</span> is the strongest yes. Or tap the buttons.</p>
    <button class="linkish" data-train="coach-ok">Got it</button></div>`;
  if (step.duel) {
    const [a, b] = step.duel;
    box.innerHTML = top + `<div class="duel"><h3>Which would you rather wear?</h3><p class="dsub">Tap one. Pick the one you'd actually put on.</p><div class="pair">
      ${[a, b].map((x, j) => `<button class="pick" data-train="pick" data-j="${j}"><div class="tile">${tile(x.it, 700, "(max-width:760px) 50vw, 280px")}</div>
        <div class="body"><p class="brand">${brandLine(x.it)}</p><p class="name">${esc(x.it.name)}</p>${priceHTML(x.it)}</div></button>`).join("")}</div>
      <button class="btn ghost small neither" data-train="neither">Neither</button></div>
      ${lastHTML(T)}<p class="tkeys">Keys: ← or → to pick, ↓ for neither</p>`;
  } else {
    const x = step.card;
    box.innerHTML = top + coach + `<div class="tlegend" aria-hidden="true"><span class="lg no"><b>←</b> Pass</span><span class="lg love"><b>↑</b> Love</span><span class="lg yes">Like <b>→</b></span></div>
      <div class="deck"><div class="tcard" id="tcard" data-key="${esc(x.it.key)}">
      <div class="tint no"></div><div class="tint yes"></div><div class="tint love"></div>
      <span class="stamp no">✕ Pass<small>Hidden from your feed</small></span><span class="stamp yes">✓ Like<small>More like this</small></span><span class="stamp love">♥ Love<small>Strongest yes</small></span>
      <div class="tile">${tile(x.it, 1000, "(max-width:760px) 100vw, 560px")}${badges(x.it)}</div>
      <div class="body"><p class="brand">${brandLine(x.it)}</p><p class="name">${esc(x.it.name)}</p>${priceHTML(x.it)}
        <p class="why">${x.sc.certainty < 0.35 ? "New to it: " : ""}${esc(E.wildcardNote(model(), x.it, S.brands).replace(/^Testing /, "teaches it about "))}</p></div></div></div>
      <div class="tbtns">
        <button class="tbtn no" data-train="no" aria-label="Pass: hide it from your feed"><span class="ic">${I.x}</span><span class="tlab">Pass</span></button>
        <button class="tbtn love" data-train="love" aria-label="Love it"><span class="ic">${I.heartOn}</span><span class="tlab">Love</span></button>
        <button class="tbtn yes" data-train="like" aria-label="Like it"><span class="ic">${I.check}</span><span class="tlab">Like</span></button></div>
      <div class="tsub"><button class="linkish" data-train="skip">Not sure? Skip it</button></div>
      ${lastHTML(T)}<p class="tkeys">Keys: ← pass · → like · ↑ love · ↓ skip · U undo</p>`;
    swipe($("tcard"));
    if (!device.coach) demo($("tcard"));
  }
  box.querySelector(".progress i").style.width = `${(T.i / T.deck.length) * 100}%`;
}
function trainAnswer(kind, j) {
  const T = S.train;
  if (!T || T.i >= T.deck.length) return;
  const step = T.deck[T.i];
  T.undo = null;
  if (step.duel) {
    const [a, b] = step.duel;
    if (kind === "pick") {
      const win = j === 0 ? a : b, lose = j === 0 ? b : a;
      touch(win.it, e => { e.wins = (e.wins || 0) + 1; }, {snap: true});
      touch(lose.it, e => { e.losses = (e.losses || 0) + 1; }, {snap: true});
      T.last = {kind: "pick", name: shortName(win.it), other: shortName(lose.it)};
    } else if (kind === "neither") {
      for (const x of [a, b]) touch(x.it, e => { e.losses = (e.losses || 0) + 1; }, {snap: true});
      T.last = {kind: "neither"};
    } else return;
  } else {
    const it = step.card.it;
    if (kind === "skip") { T.tally.skip++; T.undo = {kind}; }
    else {
      const r = setState(it, kind, false);
      T.tally[kind]++;
      T.undo = {kind, it, before: r.before};
    }
    T.last = {kind, name: shortName(it), fam: kind === "no" ? famHidden(it) : 0};
  }
  if (!device.coach) { device.coach = 1; saveDevice(); }
  T.done++;
  T.i++;
  renderTrain();
}
/* One step back: the last card's answer is undone and it comes up again. */
function trainUndo() {
  const T = S.train, u = T && T.undo;
  if (!u || T.i === 0) return;
  if (u.it) restore(u.it, u.before);
  T.tally[u.kind] = Math.max(0, (T.tally[u.kind] || 0) - 1);
  T.undo = null; T.last = null;
  T.i--; T.done = Math.max(0, T.done - 1);
  renderTrain();
}
/* Buttons and keys fling the card the same way a swipe does, so you see what each one means. */
function trainGo(kind, j) {
  const c = $("tcard");
  if (c && c.dataset.gone) return;
  if (c && c._fling && (kind === "no" || kind === "like" || kind === "love")) { c._fling(kind); return; }
  trainAnswer(kind, j);
}
function trainDone() {
  const T = S.train;
  T.closed = true;
  const m = model(), t = T.tally;
  const moved = Object.keys(m.aff).filter(x => !/^(s|d|p|sea):/.test(x)).map(x => [x, (m.aff[x] || 0) - (T.before[x] || 0)])
    .filter(([, d]) => Math.abs(d) >= 0.08).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
  $("train").innerHTML = `<div class="tdone"><h2>${T.done ? "Nice. That helps." : "Done"}</h2>
    ${T.done ? `<p class="ttally big num"><span class="t-love">♥ ${t.love} loved</span><span class="t-like">✓ ${t.like} liked</span><span class="t-no">✕ ${t.no} passed</span></p>` : ""}
    <p class="lede">${T.done ? (t.no ? `The ${plural(t.no, "piece")} you passed on ${t.no === 1 ? "is" : "are"} hidden from your feed. ` : "") + "Here's what moved:" : "Nothing new learned this round."}</p>
    <div class="chips">${moved.map(([x, d]) => `<span class="chip">${d > 0 ? "▲" : "▼"} ${esc(E.label(x, S.brands))}</span>`).join("")}</div>
    <div class="d-row center"><button class="btn" data-train="again">Another ${(S.brief && S.brief.train && S.brief.train.cards) || 20}</button>
    <a class="btn ghost" href="#for-you">See your feed</a><button class="btn ghost" data-go="you" data-anchor="pReact">Your reactions</button></div></div>`;
}
const clamp01 = v => Math.max(0, Math.min(1, v));
function swipe(card) {
  if (!card) return;
  let x0 = 0, y0 = 0, dx = 0, dy = 0, on = false, pid = null;
  const q = sel => card.querySelector(sel), box = $("train");
  const parts = {no: [q(".stamp.no"), q(".tint.no")], yes: [q(".stamp.yes"), q(".tint.yes")], love: [q(".stamp.love"), q(".tint.love")]};
  const hot = {no: [box.querySelector(".tbtn.no"), box.querySelector(".lg.no")], yes: [box.querySelector(".tbtn.yes"), box.querySelector(".lg.yes")],
    love: [box.querySelector(".tbtn.love"), box.querySelector(".lg.love")]};
  const LIMIT = 100; // how far to drag before letting go counts
  const paint = (x, y, anim) => {
    dx = x; dy = y;
    card.style.transition = anim ? "transform .45s cubic-bezier(.2,.7,.2,1)" : "none";
    card.style.transform = `translate(${x}px, ${Math.min(0, y)}px) rotate(${x / 22}deg)`;
    const p = {no: clamp01(-x / LIMIT), yes: clamp01(x / LIMIT), love: clamp01(-y / LIMIT - Math.abs(x) / 140)};
    for (const k of ["no", "yes", "love"]) {
      parts[k][0].style.opacity = String(p[k]);
      parts[k][1].style.opacity = String(p[k] * 0.9);
      parts[k][0].classList.toggle("armed", p[k] >= 1);
      for (const h of hot[k]) if (h) h.classList.toggle("hot", p[k] >= 0.3);
    }
  };
  const fling = kind => {
    if (card.dataset.gone) return;
    card.dataset.gone = "1";
    const dir = kind === "like" ? 1 : kind === "no" ? -1 : 0;
    paint(dir * 110, dir ? 0 : -110);
    card.style.transition = "transform .24s ease-in, opacity .24s ease-in";
    card.style.transform = dir ? `translate(${dir * 640}px, 40px) rotate(${dir * 24}deg)` : "translate(0, -760px)";
    card.style.opacity = "0";
    setTimeout(() => trainAnswer(kind), 200);
  };
  card._paint = paint;
  card._fling = fling;
  card.addEventListener("pointerdown", e => {
    if (e.button > 0 || card.dataset.gone || e.target.closest("button, a")) return;
    on = true; pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    card.dataset.touched = "1";
    try { card.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    paint(0, 0);
  });
  card.addEventListener("pointermove", e => { if (on && e.pointerId === pid) paint(e.clientX - x0, e.clientY - y0); });
  const end = () => {
    if (!on) return;
    on = false;
    if (dx > LIMIT) fling("like"); else if (dx < -LIMIT) fling("no"); else if (dy < -LIMIT && Math.abs(dx) < 90) fling("love");
    else paint(0, 0, true);
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}
/* The first time: the card leans left, right and up on its own, so you can see what each direction says. */
function demo(card) {
  if (!card || S.train.demoed || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  S.train.demoed = true;
  const steps = [[-80, 0], [0, 0], [80, 0], [0, 0], [0, -80], [0, 0]];
  let i = 0;
  const tick = () => {
    if (!document.contains(card) || card.dataset.touched || card.dataset.gone) return;
    const [x, y] = steps[i++];
    card._paint(x, y, true);
    if (i < steps.length) setTimeout(tick, 700);
  };
  setTimeout(tick, 600);
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
    if (!isOwned(it) && /^(nope|passed|family)$/.test(E.hiddenWhy(model(), it) || "")) return false;
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
const DEAL_SORTS = [["match", "Best match for you"], ["gap", "Fills an outfit gap"], ["disc", "Biggest discount"], ["save", "Biggest saving (£)"],
  ["low", "Price: low to high"], ["high", "Price: high to low"], ["new", "Newest first"]];
const saving = it => it.was && it.price != null && it.was > it.price ? it.was - it.price : 0;
function dealMeta(x) {
  const it = x.it, sv = saving(it), bits = [];
  if (sv >= 1) bits.push(`Save ${gbp(Math.round(sv))}`);
  if (gaps().gapRoles.has(it.role)) bits.push("fills an outfit gap");
  if (it.kind === "find") bits.push("checked against your brief");
  return bits.length ? `<p class="meta go">${esc(bits.join(" · "))}</p>` : "";
}
function renderDeals() {
  const R = ranked(), D = S.deals;
  const all = R.list.filter(x => x.it.disc >= 10 && (x.it.disc >= needs(x.sc.pct) || x.it.kind === "find"));
  const counts = {};
  for (const x of all) { const g = GROUP_OF[x.it.role] || "extras"; counts[g] = (counts[g] || 0) + 1; }
  if (D.cat !== "all" && !counts[D.cat]) D.cat = "all";
  $("dealCats").innerHTML = FILTERS.filter(([k]) => k === "all" || (k !== "new" && k !== "sale" && counts[k]))
    .map(([k, l]) => `<button class="chip" data-dcat="${k}" aria-pressed="${D.cat === k}">${esc(l)}<span class="n">${k === "all" ? all.length : counts[k]}</span></button>`).join("");
  if (!DEAL_SORTS.some(([k]) => k === D.sort)) D.sort = "match";
  $("dealSort").value = D.sort;
  const gapR = gaps().gapRoles, best = (a, b) => b.sc.s - a.sc.s;
  const by = {
    match: best,
    gap: (a, b) => (gapR.has(b.it.role) - gapR.has(a.it.role)) || best(a, b),
    disc: (a, b) => (b.it.disc - a.it.disc) || best(a, b),
    save: (a, b) => (saving(b.it) - saving(a.it)) || best(a, b),
    low: (a, b) => (a.it.price ?? 1e9) - (b.it.price ?? 1e9) || best(a, b),
    high: (a, b) => (b.it.price ?? -1) - (a.it.price ?? -1) || best(a, b),
    new: (a, b) => String(b.it.firstSeen || "").localeCompare(String(a.it.firstSeen || "")) || best(a, b)
  }[D.sort];
  const list = all.filter(x => D.cat === "all" || (GROUP_OF[x.it.role] || "extras") === D.cat).sort(by);
  $("dealsLede").textContent = all.length
    ? `${plural(all.length, "reduction")} in your size. The better the match, the smaller the discount it needs to show here.`
    : "No reductions good enough right now. The better the match, the smaller the discount a piece needs to show here.";
  $("dealsGrid").innerHTML = list.slice(0, 120).map(x => cardHTML(x, {meta: dealMeta(x)})).join("") ||
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
  const fam = hid === "family" && m.fams[it.fam];
  const HIDE = {nope: "Hidden: you said not for me. Bring it back below.", passed: "Hidden: you passed on it in Train. Bring it back below.",
    family: `Hidden: you passed on another colour of it${fam && fam.name ? ` (${fam.name})` : ""}. Love or like this colour to bring it back.`,
    owned: "You own this.", "own-similar": "You own something like it.", category: "Not a category you shop.", "sold-out": "Sold out.", cooldown: "Resting: shown a few times with no reaction."};
  const hidLine = hid ? (HIDE[hid] || HIDE[hid.split(":")[0]] || `Hidden by your rules (${hid.replace(":", ": ")}).`) : "";
  $("dBody").innerHTML = `<div class="tile">${tile(it, 1000, "(max-width:760px) 100vw, 500px")}</div>
    <p class="brand">${brandLine(it)}</p><h2 id="dTitle">${esc(it.name)}</h2>
    ${it.price != null ? `<p class="d-price num"><span class="${red ? "red" : ""}">${gbp(it.price)}</span>${red ? `<s>${gbp(it.was)}</s><span class="off">${it.disc}% off</span>` : ""}</p>` : ""}
    ${sc ? `<p class="d-match"><b>${sc.pct}% match</b>${x && x.wildcard ? ` · ${esc(x.note)}` : (whyLine({it, sc}) ? " · " + esc(whyLine({it, sc})) : "")}</p>` : ""}
    ${hid && hid !== "gone" ? `<p class="d-match soft">${esc(hidLine)}</p>` : ""}
    <div class="d-actions">
      ${it.url ? `<a class="btn" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" data-act="visit">View at ${esc(it.store || "the shop")}</a>` : ""}
      <div class="d-row">${chip("love", `${e.s === "love" ? "♥" : "♡"} Love`, e.s === "love")}${chip("like", "✓ Like", e.s === "like")}${isPass(e.s) ? chip("unhide", "↺ Bring back", false) : chip("nope", "✕ Not for me", false)}${chip("more", "More like this", e.more)}
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
    acc = invite ? `<p>Your invite is ready${S.brief ? " and your style brief is unlocked" : ""}. Pick a name, choose where to keep your passkey, and you're in. No password, no email.</p>
      <div class="row"><input class="textin" id="handle" value="don" autocomplete="username" aria-label="Your name on Capsule" maxlength="20"></div>
      <h3 class="sub3">Keep the passkey in</h3>${wherePicker()}
      <div class="row"><button class="btn" data-you="signup">Create passkey</button></div>${pmTips()}
      <p class="soft mt">Next, a few optional questions about your size and build, so it can pick sizes and cuts that fit.</p>`
      : `<p>Sign in to keep your taps, saved pieces and settings in step on every device.</p>`;
    acc += `<div class="row"><button class="btn ${invite ? "ghost" : ""}" data-you="signin">Sign in with a passkey</button><button class="linkish" data-you="signin-phone">Passkey on your phone?</button></div>
      <p class="mt">Signing in on a new device? On a signed-in one, go to You › Link another device, then enter the code here. No other device? Use a recovery code under "Lost your passkeys?", then add a passkey on this phone.</p>
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
      <div class="row"><button class="btn ghost small" data-you="addkey">Add a passkey</button><button class="btn ghost small" data-you="codes">New recovery codes</button>
      <a class="btn ghost small" href="/api/me/export" download>Export everything</a><button class="btn ghost small danger" data-you="delete">Delete account</button></div>`));
  }
  parts.unshift(P("pAcct", "Account", acc));
  // This week: the Sunday email links here. Worked out on this device from your own taps.
  const wk = weekly();
  if (wk) parts.splice(1, 0, P("pWeek", "This week", `<p>${plural(wk.taps, "reaction")} in the last seven days: ${plural(wk.loves, "love")}, ${wk.nopes} not for me${wk.trained ? `, ${wk.trained} in Train` : ""}.</p>
    ${wk.up.length ? `<h3 class="sub3">Moving up</h3><div class="chips wrap">${wk.up.map(t => `<span class="chip">▲ ${esc(E.label(t, S.brands))}</span>`).join("")}</div>` : ""}
    ${wk.down.length ? `<h3 class="sub3">Moving down</h3><div class="chips wrap">${wk.down.map(t => `<span class="chip">▼ ${esc(E.label(t, S.brands))}</span>`).join("")}</div>` : ""}
    <p class="mt">${esc(gaps().ready + " of " + gaps().total)} outfits ready to wear.</p>`));
  // About you: measurements and preferences that steer sizes and cuts.
  parts.push(P("pAbout", "About you", `<p>All optional. It uses these to pick sizes, cuts, lengths and fabrics, and to nudge colours. ${u ? "Private to your account and your devices." : "Saved on this device; they move to your account when you sign in."}</p>
    <div id="profForm">${profileForm()}</div>`));
  // Claude's notes
  if (u && S.notes && S.notes.length) {
    const n = S.notes[0];
    parts.push(P("pNotes", "From Claude", `<div class="note">${esc(n.body)}</div><p class="soft mt">${dayName(new Date(n.created * 1000).toISOString())}</p>`));
  }
  // Everything you've reacted to, with a way back for anything hidden.
  parts.push(P("pReact", "Your reactions", reactionsBody()));
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
/* ------------------------------------------------------------------ passkeys: where to keep one */
const WHERE = [["manager", "Password manager", "1Password, Dashlane, Proton Pass, Bitwarden: its own prompt appears"],
  ["device", "This device", "Windows Hello, Face ID, Touch ID or your screen lock"],
  ["phone", "Phone or security key", "Shows a QR code: save it on your phone, or tap a key"]];
function wherePicker() {
  return `<div class="pkwhere" role="radiogroup" aria-label="Where to keep the passkey">${WHERE.map(([k, l, sub]) =>
    `<button type="button" role="radio" data-where="${k}" aria-checked="${S.pkWhere === k}"><b>${esc(l)}</b><small>${esc(sub)}</small></button>`).join("")}</div>`;
}
function pmTips() {
  return `<details class="mt tips"><summary>Password manager not popping up?</summary><ul>
    <li>On iPhone: turn on your password manager under Settings › General › AutoFill & Passwords, then on the "Save a passkey" sheet switch it from iCloud Passwords to your manager.</li>
    <li>Turn on passkey saving in your password manager's browser extension, and unlock it before you start.</li>
    <li>Firefox on Windows can hand the request to Windows Security before the extension sees it. If a Windows Hello box appears, close it, then try again in Chrome or Edge, or pick <b>Phone or security key</b> and save it in the password manager's app on your phone.</li>
    <li>On Windows 11, 1Password and Bitwarden can also look after passkeys for every browser: Settings › Accounts › Passkeys › Advanced options.</li>
    <li>Already signed up with Windows Hello? Add your password manager as a second passkey under You › Devices and security.</li></ul></details>`;
}
function addKeySheet(from) {
  openSheet(`<h3>Add a passkey</h3><p class="sub">A second passkey somewhere else, like your password manager, means you're never locked out.</p>
    ${wherePicker()}
    <div class="row"><button class="btn" data-you="addkey-go">Create passkey</button><button class="btn ghost" data-close-sheet>Cancel</button></div>
    <p class="err" id="sheetErr" hidden></p>${pmTips()}`, from);
}

/* ------------------------------------------------------------------ About you */
const BUILD = [["slim", "Slim"], ["athletic", "Athletic"], ["broad", "Broad shoulders"], ["middle", "Carry weight at the middle"], ["solid", "Solid build"], ["tall", "Long arms and legs"]];
const FITPREF = [["slim", "Slim"], ["regular", "Regular"], ["relaxed", "Relaxed"]];
const CLIMATE = [["cold", "Cold"], ["cool-wet", "Cool and wet"], ["mild", "Mild"], ["warm", "Warm"]];
const SKIN = [["fair", "Fair"], ["light", "Light"], ["medium", "Medium"], ["olive", "Olive"], ["brown", "Brown"], ["deep", "Deep"]];
const HAIR = [["blonde", "Blonde"], ["red", "Red or ginger"], ["brown", "Brown"], ["black", "Black"], ["grey", "Grey"]];
const AVOIDF = [["wool", "Itchy wool"], ["synthetic", "Synthetics"], ["acrylic", "Acrylic"], ["linen", "Linen"], ["fleece", "Fleece"], ["cord", "Corduroy"], ["waxed", "Waxed cotton"]];
const LENGTHS = new Set(["chest", "waist", "seat", "inseam", "reach"]);
const prof = () => S.cfg.profile || {};
const imperial = () => prof().units === "imperial";
/* A profile value as shown: metric as stored, or inches and pounds. Sleeve length is the existing reach setting. */
function profShown(k) {
  const v = k === "reach" ? myReach() : prof()[k];
  if (v == null) return "";
  if (!imperial()) return v;
  if (LENGTHS.has(k)) return Math.round(v / 2.54 * 2) / 2;
  if (k === "weight") return Math.round(v * 2.20462);
  return v;
}
function profileForm() {
  const p = prof(), imp = imperial();
  const num = (k, label, unitM, unitI, ph, pre) => {
    const u = imp && unitI ? unitI : unitM, input = `<input id="pf_${k}" type="number" inputmode="decimal" step="any" data-prof="${k}" value="${profShown(k)}" placeholder="${ph || ""}">`;
    return `<div class="field"><label for="pf_${k}">${label}</label><div class="in">${pre ? `<b>${u}</b>${input}` : `${input}<b class="unit">${u}</b>`}</div></div>`;
  };
  const sel = (k, label) => `<div class="field"><label for="pf_${k}">${label}</label><div class="in"><select id="pf_${k}" data-prof="${k}"><option value="">–</option>${E.SIZES.map(z => `<option${p[k] === z ? " selected" : ""}>${z}</option>`).join("")}</select></div></div>`;
  const chips = (k, list, multi) => {
    const on = new Set(String(p[k] || "").split("|"));
    return `<div class="chips wrap" role="group">${list.map(([v, l]) => `<button type="button" class="chip" data-pchip="${k}" data-v="${v}"${multi ? " data-multi" : ""} aria-pressed="${on.has(v)}">${esc(l)}</button>`).join("")}</div>`;
  };
  let height;
  if (imp) {
    const tin = p.height ? Math.round(p.height / 2.54) : null;
    height = `<div class="field"><label for="pf_height_ft">Height</label><div class="in two"><input id="pf_height_ft" type="number" inputmode="numeric" data-prof="height" data-part="ft" value="${tin ? Math.floor(tin / 12) : ""}"><b class="unit">ft</b>
      <input type="number" inputmode="numeric" data-prof="height" data-part="in" value="${tin ? tin % 12 : ""}" aria-label="Height, inches"><b class="unit">in</b></div></div>`;
  } else height = num("height", "Height", "cm", "");
  return `<div class="prof">
    <div class="row"><span class="soft">Units</span><div class="seg" role="group" aria-label="Units"><button type="button" data-units="metric" aria-pressed="${!imp}">cm and kg</button><button type="button" data-units="imperial" aria-pressed="${imp}">inches and lb</button></div></div>
    <h3 class="sub3">Body</h3>
    <div class="fields">${height}${num("weight", "Weight", "kg", "lb")}</div>
    <p class="plabel">Build <span class="faint">pick any that fit</span></p>${chips("build", BUILD, true)}
    <p class="plabel">The fit you like</p>${chips("fit", FITPREF)}
    <h3 class="sub3">Measurements</h3>
    <div class="fields">${num("chest", "Chest", "cm", "in")}${num("waist", "Waist", "cm", "in")}${num("seat", "Hips / seat", "cm", "in")}${num("inseam", "Inside leg", "cm", "in")}${num("reach", "Sleeve", "cm", "in")}</div>
    <details class="howto2"><summary>How to measure</summary><ul>
      <li><b>Chest:</b> round the fullest part, under your arms, tape level.</li><li><b>Waist:</b> round your middle at the belly button, relaxed.</li>
      <li><b>Hips / seat:</b> round the fullest part of your seat.</li><li><b>Inside leg:</b> from the crotch to the floor, standing straight in socks.</li>
      <li><b>Sleeve:</b> from the bone at the base of the back of your neck, over your shoulder, down to your wrist bone. Pieces with published measurements get checked against it.</li></ul></details>
    <div class="sizeadv-box">${sizeAdviceHTML()}</div>
    <h3 class="sub3">Sizes you buy</h3>
    <div class="fields">${sel("top", "Tops")}${sel("outer", "Jackets")}${num("trw", "Trouser waist", "W", "W", "", true)}${num("trl", "Leg", "L", "L", "", true)}${num("shoe", "Shoes", "UK", "UK", "", true)}</div>
    <h3 class="sub3">Colouring <span class="faint">nudges colours gently</span></h3>
    <p class="plabel">Skin</p>${chips("skin", SKIN)}<p class="plabel">Hair</p>${chips("hair", HAIR)}
    <h3 class="sub3">Weather where you live</h3>${chips("climate", CLIMATE)}
    <h3 class="sub3">Fabrics to avoid <span class="faint">they sink to the bottom</span></h3>${chips("avoid", AVOIDF, true)}
  </div>`;
}
function sizeAdviceHTML() {
  const p = prof(), a = E.sizeAdvice(p), sz = (S.data && S.data.sizes) || {};
  const bits = [];
  if (a.top) bits.push(`${a.top} in tops (from your ${a.topFrom})`);
  if (a.trw) bits.push(`about W${a.trw}${a.trl ? " L" + a.trl : ""} in trousers`);
  else if (a.trl) bits.push(`about L${a.trl} leg`);
  let out = bits.length ? `<p class="sizeadv">Rough size guide: ${esc(listJoin(bits))}. Brands vary, so check their size charts.</p>` : "";
  const diff = [];
  if (p.top && sz.top && p.top !== sz.top) diff.push(`${p.top} tops (checked in ${sz.top})`);
  if (p.trw && sz.waist && "W" + p.trw !== sz.waist) diff.push(`W${p.trw} trousers (checked in ${sz.waist})`);
  if (p.trl && sz.leg && "L" + p.trl !== sz.leg) diff.push(`L${p.trl} leg (checked in ${sz.leg})`);
  if (p.shoe && sz.shoe && "UK " + p.shoe !== sz.shoe) diff.push(`UK ${p.shoe} shoes (checked in ${sz.shoe})`);
  if (diff.length) out += `<p class="sizeadv warn">Stock is still checked in your old sizes: ${esc(listJoin(diff))}. Ask Claude to switch the stock checks over.</p>`;
  return out;
}
/* The number typed into a profile field, in metric. undefined: not a number. */
function profInput(el) {
  const k = el.dataset.prof;
  if (el.tagName === "SELECT") return el.value || null;
  if (k === "height" && imperial()) {
    const w = el.closest(".in"), ft = parseFloat(w.querySelector("[data-part=ft]").value), inch = parseFloat(w.querySelector("[data-part=in]").value) || 0;
    if (isNaN(ft) && !w.querySelector("[data-part=in]").value) return null;
    return isNaN(ft) ? undefined : Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
  }
  const raw = el.value.trim();
  if (!raw) return null;
  let v = parseFloat(raw);
  if (isNaN(v)) return undefined;
  if (imperial() && LENGTHS.has(k)) v *= 2.54;
  if (imperial() && k === "weight") v /= 2.20462;
  return Math.round(v * 10) / 10;
}
/* Save one profile value. Returns false when it was out of range (and so not saved). */
function setProfile(k, v) {
  if (v === undefined) return false;
  if (k === "reach") {
    const ok = v == null || (v >= 60 && v <= 130);
    if (ok) setCfg(c => { c.reach = v == null ? null : round2(v); });
    return ok;
  }
  let kept = true;
  setCfg(c => {
    const p = Object.assign({}, c.profile || {});
    if (v == null || v === "") delete p[k]; else p[k] = v;
    const clean = E.cleanProfile(p);
    kept = v == null || v === "" || clean[k] != null;
    c.profile = clean;
  });
  return kept;
}
let profToastAt = 0;
function profSaved(ok, el) {
  document.querySelectorAll(".sizeadv-box").forEach(b => { b.innerHTML = sizeAdviceHTML(); });
  if (!ok) {
    toast("That doesn't look right, so it wasn't saved.");
    if (el && el.dataset.prof) el.value = profShown(el.dataset.prof);
    return;
  }
  if (Date.now() - profToastAt > 2500) { profToastAt = Date.now(); toast(A.acct.user ? "Saved to your account. Your feed now uses it." : "Saved on this device. Your feed now uses it."); }
}
function rerenderProfile() { document.querySelectorAll(".prof").forEach(f => { f.outerHTML = profileForm(); }); }
function profileSheet() {
  openSheet(`<h3>About you</h3><p class="sub">All optional, and you can change it any time under You › About you. It picks sizes, cuts and fabrics with it. Private to your account.</p>
    ${profileForm()}<div class="row"><button class="btn" data-close-sheet>Done</button></div>`);
}

/* ------------------------------------------------------------------ Your reactions */
const RTABS = [["love", "Loved"], ["like", "Liked"], ["save", "Saved"], ["hidden", "Hidden"]];
const REACT_EMPTY = {love: "Tap ♡ on anything you'd wear tomorrow, or swipe up in Train.", like: "Swipe right in Train, or tap ✓ Like on a piece.",
  save: "Save pieces from the ⋯ menu to come back to them.", hidden: "Nothing hidden. Tap ✕ on a piece, or swipe left in Train, and it's gone for good."};
function reactionsBody() {
  const rows = {love: [], like: [], save: [], hidden: []};
  for (const [k, e] of Object.entries(S.entries)) {
    if (!e.f && !S.byKey.has(k)) continue;
    if (e.s === "love") rows.love.push([k, e]); else if (e.s === "like") rows.like.push([k, e]); else if (isPass(e.s)) rows.hidden.push([k, e]);
    if (e.save) rows.save.push([k, e]);
  }
  for (const r of Object.values(rows)) r.sort((a, b) => Date.parse(b[1].et || b[1].t) - Date.parse(a[1].et || a[1].t));
  if (!rows[S.reactTab]) S.reactTab = "love";
  const tab = S.reactTab, list = rows[tab];
  let famN = 0;
  if (tab === "hidden") { const m = model(); famN = S.items.filter(it => E.hiddenWhy(m, it) === "family").length; }
  const undo = {love: ["love", "Unlove"], like: ["like", "Unlike"], save: ["save", "Unsave"], hidden: ["unhide", "Bring back"]}[tab];
  return `<p>Everything you've reacted to. Hidden pieces stay out of your feed, deals, outfits and Train until you bring them back.</p>
    <div class="seg rtabs" role="group" aria-label="Show">${RTABS.map(([k, l]) => `<button type="button" data-rtab="${k}" aria-pressed="${tab === k}">${l} <span class="n">${rows[k].length}</span></button>`).join("")}</div>
    ${list.length ? `<div class="minis">${list.slice(0, 60).map(([k]) => {
      const it = S.byKey.get(k) || pseudo(k);
      if (!it) return "";
      return `<div class="mini" data-key="${esc(k)}"><a class="card-hit" href="#item=${encodeURIComponent(k)}" data-open><div class="tile">${tile(it, 400, "120px")}</div>
        <p class="name">${esc(it.brand || "")}</p><p class="price num">${it.kind === "gone" ? "Gone" : gbp(it.price)}</p></a>
        <button type="button" class="linkish" data-act="${undo[0]}">${undo[1]}</button></div>`;
    }).join("")}</div>${list.length > 60 ? `<p class="soft mt">Showing the latest 60 of ${list.length}.</p>` : ""}` : `<p class="soft mt">${REACT_EMPTY[tab]}</p>`}
    ${famN ? `<p class="soft mt">Plus ${plural(famN, "other colour")} hidden along with them. Choose “Colour” as the reason on a hidden piece and its other colours come back.</p>` : ""}`;
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
      k.passkeys.map(p => `<div class="li pk"><span>${p.provider ? `Passkey in <b>${esc(p.provider)}</b>` : `Passkey made on <b>${esc(p.name || "a device")}</b>`}${p.synced ? " · synced" : ""}<br><small class="faint">${p.provider && p.name ? `Made on ${esc(p.name)}, ` : ""}added ${when(p.created)}${p.lastUsed ? `, last used ${when(p.lastUsed)}` : ""}</small></span>${k.passkeys.length > 1 ? `<button class="btn ghost small" data-rmkey="${esc(p.id)}">Remove</button>` : ""}</div>`).join("");
  } catch (e) { S.devices = null; el.innerHTML = `<p class="soft">${esc(e.message)}</p>`; }
}
function accErr(msg) {
  const el = (!$("sheet").hidden && $("sheetErr")) || $("accErr");
  if (el) { el.textContent = msg; el.hidden = !msg; } else if (msg) toast(msg);
}
async function youAction(what, btn) {
  accErr("");
  if (btn) btn.disabled = true;
  try {
    switch (what) {
      case "signup": {
        const handle = ($("handle").value || "").trim();
        const res = await A.signUp(handle, A.pendingInvite(), S.brief, S.pkWhere);
        showCodes(res.recoveryCodes, true, res.provider);
        afterAuth(res.provider ? `Account created. Your passkey is in ${res.provider}.` : "Account created. Every tap now syncs.");
        break;
      }
      case "signin": await A.signIn(); afterAuth("Signed in."); break;
      case "signin-phone": await A.signIn("phone"); afterAuth("Signed in."); break;
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
      case "addkey": addKeySheet(btn); break;
      case "addkey-go": {
        const r = await A.addPasskey(S.pkWhere);
        closeSheet();
        toast(r.provider ? `Passkey added in ${r.provider}.` : "Passkey added.");
        S.devices = null;
        renderYou();
        break;
      }
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
function showCodes(codes, first, provider) {
  openSheet(`<h3>${first ? "Save your recovery codes" : "Your new recovery codes"}</h3>
    ${provider ? `<p class="sub ok">✓ Your passkey is saved in <b>${esc(provider)}</b>.</p>` : ""}
    <p class="sub">If you ever lose every passkey, one of these gets you back in. Each works once. ${first ? "" : "Your old codes no longer work."} Keep them in your password manager.</p>
    <div class="codes">${codes.map(c => `<div>${esc(c)}</div>`).join("")}</div>
    <div class="row"><button class="btn${first ? " ghost" : ""}" data-copy="${esc(codes.join("\n"))}">Copy codes</button>${first ? `<button class="btn" data-next="profile">Next: about you</button><button class="linkish" data-close-sheet>Skip</button>` : `<button class="btn ghost" data-close-sheet>Done</button>`}</div>`);
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
    if (go) {
      show(go.dataset.go);
      const to = go.dataset.anchor && $(go.dataset.anchor);
      if (to) setTimeout(() => to.scrollIntoView({block: "start", behavior: "smooth"}), 30);
      return;
    }
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
    const dcat = t.closest("[data-dcat]");
    if (dcat) { S.deals.cat = device.dealCat = dcat.dataset.dcat; saveDevice(); renderDeals(); return; }
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
      else if (k === "undo") trainUndo();
      else if (k === "coach-ok") { device.coach = 1; saveDevice(); const c = tr.closest(".coach"); if (c) c.remove(); }
      else trainGo(k, Number(tr.dataset.j));
      return;
    }
    const wh = t.closest("[data-where]");
    if (wh) {
      S.pkWhere = device.pkWhere = wh.dataset.where;
      saveDevice();
      wh.parentElement.querySelectorAll("[data-where]").forEach(b => b.setAttribute("aria-checked", String(b === wh)));
      return;
    }
    if (t.closest("[data-next=profile]")) { profileSheet(); return; }
    const rk = t.closest("[data-rmkey]");
    if (rk) {
      if (!rk.dataset.armed) { rk.dataset.armed = "1"; rk.textContent = "Tap again to remove"; setTimeout(() => { if (document.contains(rk)) { delete rk.dataset.armed; rk.textContent = "Remove"; } }, 5000); return; }
      rk.disabled = true;
      A.removePasskey(rk.dataset.rmkey).then(() => { toast("Passkey removed."); S.devices = null; renderYou(); }, e => { rk.disabled = false; toast(A.passkeyError(e)); });
      return;
    }
    const rt = t.closest("[data-rtab]");
    if (rt) { S.reactTab = device.reactTab = rt.dataset.rtab; saveDevice(); const b = $("pReact"); if (b) b.innerHTML = `<h2>Your reactions</h2>${reactionsBody()}`; return; }
    const pc = t.closest("[data-pchip]");
    if (pc) {
      const k = pc.dataset.pchip, v = pc.dataset.v, cur = new Set(String(prof()[k] || "").split("|").filter(Boolean));
      let next;
      if (pc.hasAttribute("data-multi")) { if (cur.has(v)) cur.delete(v); else cur.add(v); next = [...cur].join("|") || null; }
      else next = cur.has(v) ? null : v;
      const ok = setProfile(k, next);
      pc.parentElement.querySelectorAll("[data-pchip]").forEach(b => b.setAttribute("aria-pressed", String(new Set(String(prof()[k] || "").split("|")).has(b.dataset.v))));
      profSaved(ok);
      return;
    }
    const un = t.closest("[data-units]");
    if (un) { setProfile("units", un.dataset.units); rerenderProfile(); return; }
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
    if (t.dataset.prof) {
      const k = t.dataset.prof, v = profInput(t);
      if (k === "height" && imperial() && v === null) { setProfile("height", null); profSaved(true); return; }
      const ok = setProfile(k, v);
      profSaved(ok, t);
      if (k === "reach" && $("reach")) $("reach").value = myReach() ?? "";
      return;
    }
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
    if (t.id === "dealSort") { S.deals.sort = device.dealSort = t.value; saveDevice(); renderDeals(); window.scrollTo({top: 0, behavior: "smooth"}); return; }
    if (t.id === "hideOwned") { S.shop.hideOwned = t.checked; renderShop(); }
  });
  $("q").addEventListener("input", e => { S.shop.q = e.target.value.trim(); renderShop(); });
  $("dClose").onclick = () => closeDrawer();
  $("scrim").onclick = () => { if (!$("sheet").hidden) closeSheet(); else closeDrawer(); };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (!$("sheet").hidden) closeSheet(); else closeDrawer(); return; }
    if (S.view !== "train" || S.drawer || !$("sheet").hidden || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === "u" || e.key === "U" || ((e.metaKey || e.ctrlKey) && e.key === "z")) { if (S.train && S.train.undo) { e.preventDefault(); trainUndo(); } return; }
    const step = S.train && S.train.deck[S.train.i];
    if (!step) return;
    const map = step.duel ? {ArrowLeft: ["pick", 0], ArrowRight: ["pick", 1], ArrowDown: ["neither"], "1": ["pick", 0], "2": ["pick", 1]}
      : {ArrowLeft: ["no"], ArrowRight: ["like"], ArrowUp: ["love"], ArrowDown: ["skip"], " ": ["skip"]};
    const a = map[e.key];
    if (a) { e.preventDefault(); trainGo(a[0], a[1]); }
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
