/* Input validation. Everything a client sends is reduced to known keys, types and sizes before it reaches D1. */

import {HttpError, isoOk} from "./util.js";

export const bad = (msg, code = "invalid") => { throw new HttpError(400, code, msg); };

const RESERVED = new Set(["admin", "administrator", "api", "root", "support", "help", "about", "privacy", "terms", "security",
  "capsule", "www", "mail", "u", "user", "users", "me", "you", "account", "settings", "login", "logout", "signin", "signup",
  "register", "system", "null", "undefined", "anonymous", "guest", "staff", "mod", "moderator", "official", "claude",
  "anthropic", "cloudflare", "github", "owner", "test", "review"]);
export function normHandle(h) { return String(h == null ? "" : h).trim().toLowerCase().replace(/^@/, ""); }
export function checkHandle(raw) {
  const h = normHandle(raw);
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,18})[a-z0-9]$/.test(h)) bad("Pick a name of 3–20 letters, numbers, dashes or underscores, starting and ending with a letter or number.", "bad_handle");
  if (/[-_]{2}/.test(h)) bad("No double dashes or underscores in names.", "bad_handle");
  if (RESERVED.has(h)) bad("That name is reserved. Pick another.", "handle_reserved");
  return h;
}

/* Piece keys: host + path (+ ~colour), as itemKey() in docs/engine.js makes them. */
export const ITEM_KEY = /^[a-z0-9][a-z0-9.\-\/_~%+]{2,179}$/;

const str = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max) : undefined;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : undefined;
const flag = v => v === 1 || v === true ? 1 : undefined;
const day = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
const httpsUrl = (v, max) => typeof v === "string" && v.length <= max && /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s<>"]*$/i.test(v) ? v : undefined;
const TRAIT = /^[a-z]{1,4}:[a-z0-9-]{1,40}$/;
const ROLES = new Set(["tee", "shirt", "overshirt", "jacket", "fleece", "knit", "cardigan", "sweat", "hoodie", "jeans", "chino", "trouser",
  "jogger", "shorts", "trainer", "boot", "wallabee", "clog", "socks", "underwear", "cap", "beanie", "scarf", "gloves", "belt", "bag", "watch"]);
const REASONS = new Set(["colour", "fit", "fabric", "price", "brand", "logo", "dressy", "young", "have", "texture", "cut", "versatile"]);
const STATES = new Set(["love", "like", "nope", "no"]);

/* The compact copy of a piece that travels with a reaction (snapshot() in docs/engine.js). */
export function cleanSnap(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return undefined;
  const out = {b: str(f.b, 60), n: str(f.n, 120), r: ROLES.has(f.r) ? f.r : undefined, u: httpsUrl(f.u, 400), i: httpsUrl(f.i, 700),
    p: num(f.p, 0, 100000), tr: Array.isArray(f.tr) ? f.tr.filter(t => typeof t === "string" && TRAIT.test(t)).slice(0, 40) : undefined};
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out.tr && out.tr.length ? out : undefined;
}

/* One reaction row. Timestamps more than a day ahead of the server are pulled back, so a device with a wrong clock
   can't win every merge forever. */
export function cleanEntry(e, serverNowMs) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  let t = isoOk(e.t) ? e.t : null;
  if (!t) return null;
  if (Date.parse(t) > serverNowMs + 864e5) t = new Date(serverNowMs).toISOString();
  const out = {t, et: isoOk(e.et) ? e.et : undefined, s: STATES.has(e.s) ? e.s : undefined, more: flag(e.more), save: flag(e.save), pricey: flag(e.pricey), own: flag(e.own),
    bought: flag(e.bought), why: Array.isArray(e.why) ? [...new Set(e.why.filter(r => REASONS.has(r)))].slice(0, 6) : undefined,
    wins: int(e.wins, 0, 99), losses: int(e.losses, 0, 99), open: int(e.open, 0, 999), view: int(e.view, 0, 999), linger: flag(e.linger),
    shownTotal: int(e.shownTotal, 0, 9999), shown: int(e.shown, 0, 99), sd: day(e.sd), cool: day(e.cool), lp: num(e.lp, 0, 100000),
    f: cleanSnap(e.f)};
  if (out.why && !out.why.length) delete out.why;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const COUNT_KEYS = ["tees", "knits", "sweats", "overshirts", "jackets", "jeans", "trousers", "trainers", "boots"];
const CAP_KEYS = ["tee", "knit", "overshirt", "jacket", "jeans", "chinos", "trainers", "boots"];
export function cleanCfg(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const counts = {}, caps = {}, pins = {};
  for (const k of COUNT_KEYS) { const v = int(c.counts && c.counts[k], 0, 30); if (v !== undefined) counts[k] = v; }
  for (const k of CAP_KEYS) { const v = int(c.caps && c.caps[k], 0, 5000); if (v !== undefined) caps[k] = v; }
  if (c.pins && typeof c.pins === "object") {
    for (const [k, v] of Object.entries(c.pins).slice(0, 300)) { const n = num(v, -3, 3); if (TRAIT.test(k) && n !== undefined) pins[k] = n; }
  }
  const owned = {};
  if (c.owned && typeof c.owned === "object") {
    for (const [k, v] of Object.entries(c.owned).slice(0, 300)) if (/^(s\d{1,3}|\d{1,5})$/.test(k) && (v === 0 || v === 1)) owned[k] = v;
  }
  return {counts, caps, pins, owned, resetAt: isoOk(c.resetAt) ? c.resetAt : null, explore: num(c.explore, 0, 0.5) ?? 0.2,
    theme: ["auto", "dark", "light"].includes(c.theme) ? c.theme : "auto", reach: num(c.reach, 60, 130) ?? null,
    rules: ["soft", "hard"].includes(c.rules) ? c.rules : null,
    t: isoOk(c.t) ? c.t : new Date().toISOString()};
}

/* A settings patch: {"owned.s3": 1, "pins.c:olive": null, "explore": 0.33}. Paths are checked here; values are
   checked by cleanCfg() once the patch is applied. */
const PATCH_PATH = /^(?:(?:owned|pins|counts|caps)\.[a-z0-9:_-]{1,48}|explore|theme|reach|resetAt|rules)$/;
export function cleanPatch(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const out = {};
  for (const [k, v] of Object.entries(p).slice(0, 400)) {
    if (!PATCH_PATH.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "string") out[k] = typeof v === "string" ? v.slice(0, 40) : v;
  }
  return Object.keys(out).length ? out : null;
}

/* The style brief: known keys only, small values. */
const LEVELS = new Set(["love", "ok", "no"]);
const levels = (o, max) => {
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, max)) if (/^[a-z0-9-]{1,24}$/.test(k) && LEVELS.has(v)) out[k] = v;
  return out;
};
const words = (a, max, len = 40) => Array.isArray(a) ? a.filter(x => typeof x === "string").map(x => str(x, len).trim()).filter(Boolean).slice(0, max) : [];
const choice = (v, max = 40) => typeof v === "string" && /^[A-Za-z0-9 :;,.+&'’()\/|–-]{0,80}$/.test(v) ? v.slice(0, max) : undefined;
export function cleanBrief(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const caps = {}, counts = {};
  for (const k of CAP_KEYS) { const v = int(b.caps && b.caps[k], 0, 5000); if (v !== undefined) caps[k] = v; }
  for (const k of COUNT_KEYS) { const v = int(b.counts && b.counts[k], 0, 30); if (v !== undefined) counts[k] = v; }
  const out = {
    v: 1, updated: day(b.updated) || new Date().toISOString().slice(0, 10),
    colours: levels(b.colours, 40), patterns: levels(b.patterns, 30), fabrics: levels(b.fabrics, 30),
    washed_only: words(b.washed_only, 20, 20), styles: words(b.styles, 12, 20), style_note: str(b.style_note, 300), inspo: str(b.inspo, 600),
    brands_love: words(b.brands_love, 40), brands_never: words(b.brands_never, 40),
    logos: choice(b.logos), topfit: choice(b.topfit), leg: choice(b.leg), rise: choice(b.rise), hem: choice(b.hem),
    denim: words(b.denim, 8, 12), shoes: words(b.shoes, 12, 20), categories: words(b.categories, 30, 20), nontoxic: words(b.nontoxic, 8, 12),
    ethics: choice(b.ethics), fitprob: words(b.fitprob, 10, 20), xl_ok: b.xl_ok === true,
    sizes: b.sizes && typeof b.sizes === "object" ? {top: choice(b.sizes.top, 10), outer: choice(b.sizes.outer, 10), waist: choice(b.sizes.waist, 10),
      leg: choice(b.sizes.leg, 10), shoe: choice(b.sizes.shoe, 10)} : undefined,
    size_change: choice(b.size_change), size_note: str(b.size_note, 300), returns: choice(b.returns), caps, counts,
    explore: num(b.explore, 0, 0.5), fade_days: int(b.fade_days, 14, 730), rules: choice(b.rules), nope_hides: choice(b.nope_hides),
    reasons: choice(b.reasons), love_chips: b.love_chips === true, implicit: b.implicit !== false,
    train: b.train && typeof b.train === "object" ? {where: choice(b.train.where), cards: int(b.train.cards, 5, 100), duels: choice(b.train.duels)} : undefined,
    claude: choice(b.claude), enough: choice(b.enough), upgrades: choice(b.upgrades), fullprice: choice(b.fullprice), discount: choice(b.discount),
    perday: Array.isArray(b.perday) ? b.perday.map(x => int(x, 1, 100)).filter(x => x !== undefined).slice(0, 2) : undefined,
    repeat_days: int(b.repeat_days, 1, 365), eu: choice(b.eu), secondhand: choice(b.secondhand), summer: choice(b.summer), tiers: choice(b.tiers),
    budget_month: choice(b.budget_month), value: choice(b.value), bf: choice(b.bf), bf_list: words(b.bf_list, 30, 80), spend: choice(b.spend),
    drop: choice(b.drop), drop_time: choice(b.drop_time), instant: words(b.instant, 8, 20), channel: choice(b.channel),
    email_buttons: choice(b.email_buttons), learned_note: choice(b.learned_note), device: choice(b.device), home: choice(b.home),
    look: choice(b.look), theme: choice(b.theme), layout: choice(b.layout), ask_claude: b.ask_claude === true, wore_log: choice(b.wore_log),
    contexts: words(b.contexts, 15, 20), office_days: choice(b.office_days), smart_max: choice(b.smart_max), daily_outfit: choice(b.daily_outfit),
    wardrobe_import: choice(b.wardrobe_import), capsule_size: choice(b.capsule_size), measure_store: choice(b.measure_store),
    reach_cm: num(b.reach_cm, 60, 130),
    // The judgement rubric Claude's review applies (likes, hard nos), kept private with the rest of the brief.
    rubric: b.rubric && typeof b.rubric === "object" ? {look: str(b.rubric.look, 400), yes: words(b.rubric.yes, 24, 400), no: words(b.rubric.no, 24, 400),
      rejected: words(b.rubric.rejected, 30, 200)} : undefined
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  const text = JSON.stringify(out);
  if (text.length > 16000) bad("That brief is too large.");
  return out;
}

export const passkeyName = n => {
  const s = str(n, 40);
  return s && s.trim() ? s.trim() : null;
};
export const noteBody = n => {
  const s = str(n, 4000);
  if (!s || !s.trim()) bad("Empty note.");
  return s.trim();
};
