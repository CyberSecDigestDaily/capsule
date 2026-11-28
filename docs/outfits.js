/* Capsule outfits: complete looks for each occasion, put together from what you own and the best pieces in your size.
   Pure functions, no DOM (the page and the tests use it). A look is scored on the pieces (what you own counts for a lot:
   it's free and it's yours), on how the colours sit together (classic menswear pairings, one accent at most, no brown
   with black, tonal looks welcome), on texture and pattern (one pattern, two textures at most, no double denim) and on
   what each occasion asks of a slot (dark denim for a date, waterproof for the hills). */

import {traitsOf, colourOf, outOfSummer} from "./engine.js";

/* ------------------------------------------------------------------ occasions */
// Used when the published data has no formulas of its own. Same shape as wardrobe.json "formulas".
export const DEFAULT_FORMULAS = [
  {id: "office", name: "Office", when: "Smart casual", slots: [
    {label: "Trousers", roles: ["chino", "trouser"]}, {label: "Knit or cardigan", roles: ["knit", "cardigan"]},
    {label: "Tee or shirt", roles: ["tee", "shirt"]}, {label: "Shoes", roles: ["boot", "shoe", "wallabee"]},
    {label: "Coat", roles: ["jacket"], optional: true, season: "winter"}]},
  {id: "everyday", name: "Everyday", when: "Weekends and errands", slots: [
    {label: "Tee", roles: ["tee"]}, {label: "Overshirt or sweat", roles: ["overshirt", "sweat", "hoodie", "fleece"]},
    {label: "Jeans or chinos", roles: ["jeans", "chino"]}, {label: "Trainers", roles: ["trainer", "wallabee"]},
    {label: "Jacket", roles: ["jacket"], optional: true, season: "winter"}]},
  {id: "date", name: "Date night", when: "Dinner and drinks", slots: [
    {label: "Dark jeans or trousers", roles: ["jeans", "chino", "trouser"], prefer: ["indigo", "navy", "charcoal", "black"]},
    {label: "Knit or cardigan", roles: ["knit", "cardigan"]}, {label: "Boots or shoes", roles: ["boot", "shoe", "wallabee"]},
    {label: "Jacket", roles: ["jacket", "overshirt"], optional: true}]},
  {id: "outdoor", name: "Outdoors", when: "Walks, days out, camera in hand", slots: [
    {label: "Jacket", roles: ["jacket"]}, {label: "Mid-layer", roles: ["fleece", "sweat", "knit"]},
    {label: "Jeans or chinos", roles: ["jeans", "chino"]}, {label: "Trainers or boots", roles: ["trainer", "boot"]}]},
  {id: "hiking", name: "Hiking", when: "Hills and coast paths", slots: [
    {label: "Waterproof jacket", roles: ["jacket"], want: ["det:waterproof", "f:waxed", "st:outdoor"]}, {label: "Fleece", roles: ["fleece", "sweat"]},
    {label: "Trousers", roles: ["chino", "jogger"]}, {label: "Boots", roles: ["boot"]}]},
  {id: "travel", name: "Travel", when: "Packs small, layers well", slots: [
    {label: "Layer", roles: ["overshirt", "knit", "sweat"]}, {label: "Tee", roles: ["tee"]},
    {label: "Jeans or chinos", roles: ["jeans", "chino"]}, {label: "Trainers", roles: ["trainer"]}]},
  {id: "lounge", name: "Lounging", when: "At home", slots: [
    {label: "Hoodie, sweat or fleece", roles: ["hoodie", "sweat", "fleece"]}, {label: "Joggers or soft trousers", roles: ["jogger", "chino"]},
    {label: "Slippers or clogs", roles: ["clog"]}]},
  {id: "gym", name: "Gym", when: "Function first", slots: [
    {label: "Tee", roles: ["tee"]}, {label: "Shorts or joggers", roles: ["shorts", "jogger"]}, {label: "Trainers", roles: ["trainer"]}]},
  {id: "beach", name: "Summer", when: "Holidays and warm days", season: "summer", slots: [
    {label: "Tee or shirt", roles: ["tee", "shirt"]}, {label: "Shorts", roles: ["shorts"]}, {label: "Sandals or clogs", roles: ["clog"]},
    {label: "Cap", roles: ["cap"], optional: true}]}
];

/* ------------------------------------------------------------------ colour */
// How light each colour reads (0 black .. 5 white), for contrast.
const LIGHT = {black: 0, navy: 1, charcoal: 1, indigo: 1, "bottle-green": 1, burgundy: 1, brown: 1, olive: 2, rust: 2, teal: 2, purple: 1,
  khaki: 3, tan: 3, "washed-blue": 3, grey: 3, taupe: 3, mustard: 3, red: 2, orange: 3, "bright-blue": 2, pink: 4, "light-blue": 4,
  stone: 4, oatmeal: 4, cream: 5, white: 5, multi: 3};
// Deep colours that behave almost like neutrals, and the brighter ones: one of either per outfit.
const DEEP = new Set(["burgundy", "bottle-green"]);
const BRIGHT = new Set(["rust", "mustard", "red", "orange", "pink", "purple", "teal", "bright-blue", "multi"]);
// Tonal families: shades that read as one colour story.
const TONE = {olive: "green", khaki: "green", "bottle-green": "green", navy: "blue", indigo: "blue", "washed-blue": "blue",
  "light-blue": "blue", stone: "sand", taupe: "sand", oatmeal: "sand", cream: "sand", tan: "brown", brown: "brown",
  charcoal: "grey", grey: "grey", black: "grey", burgundy: "red", rust: "red"};
// Classic pairings (either way round).
const GOOD = new Map();
const pair = (list, v) => { for (const p of list.split(" ")) { const [a, b] = p.split("+"); GOOD.set(a + "|" + b, v); GOOD.set(b + "|" + a, v); } };
pair("navy+stone navy+grey navy+white navy+cream navy+oatmeal navy+olive navy+tan navy+brown navy+light-blue navy+washed-blue navy+khaki " +
  "navy+burgundy navy+bottle-green navy+rust navy+mustard navy+taupe olive+stone olive+cream olive+oatmeal olive+white olive+indigo " +
  "olive+brown olive+tan olive+grey olive+charcoal olive+washed-blue olive+taupe olive+navy charcoal+white charcoal+grey charcoal+oatmeal " +
  "charcoal+cream charcoal+light-blue charcoal+burgundy charcoal+stone charcoal+indigo charcoal+mustard charcoal+taupe indigo+white " +
  "indigo+grey indigo+stone indigo+cream indigo+oatmeal indigo+tan indigo+brown indigo+burgundy indigo+bottle-green indigo+rust indigo+khaki " +
  "indigo+light-blue stone+brown stone+tan stone+white stone+washed-blue stone+bottle-green stone+burgundy stone+light-blue stone+grey " +
  "taupe+white taupe+brown taupe+cream taupe+indigo cream+brown cream+bottle-green cream+burgundy cream+washed-blue cream+tan cream+rust " +
  "grey+burgundy grey+white grey+bottle-green grey+washed-blue grey+light-blue washed-blue+white washed-blue+brown washed-blue+tan " +
  "washed-blue+oatmeal khaki+white khaki+brown khaki+cream khaki+grey khaki+indigo brown+light-blue tan+light-blue tan+white tan+grey " +
  "oatmeal+brown oatmeal+bottle-green oatmeal+burgundy black+white black+grey black+charcoal black+burgundy black+stone black+olive", 0.5);
pair("brown+black tan+black", -1.0);
pair("navy+black", -0.4);
pair("cream+white stone+khaki", -0.2);
pair("burgundy+rust burgundy+red rust+red red+pink orange+pink purple+red teal+red mustard+pink orange+red", -0.9);
const pairScore = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 0.25; // the same colour twice: tonal, which the brief likes (contrast is checked separately)
  const v = GOOD.get(a + "|" + b);
  if (v != null) return v;
  if (BRIGHT.has(a) && BRIGHT.has(b)) return -1;
  return 0.05;
};
const NICE_COLOUR = {"washed-blue": "washed blue", "light-blue": "light blue", "bottle-green": "bottle green", "bright-blue": "bright blue"};
const cname = c => NICE_COLOUR[c] || c;
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ pieces */
const FOOT = new Set(["trainer", "boot", "wallabee", "clog", "shoe"]);
const ACC = new Set(["cap", "beanie", "scarf", "gloves", "belt", "bag", "watch", "socks", "underwear"]);
const PATTERNS = new Set(["x:stripe", "x:check", "x:camo", "x:fairisle", "x:graphic", "x:pinstripe"]);
const TEXTURES = new Set(["x:waffle", "x:rib", "x:cable", "x:honeycomb", "x:herringbone", "x:donegal", "x:slub", "x:textured",
  "f:cord", "f:waxed", "f:fleece", "f:moleskin", "f:suede"]);
const TEXTURE_NAME = {"x:waffle": "waffle knit", "x:rib": "rib", "x:cable": "cable knit", "x:honeycomb": "honeycomb knit",
  "x:herringbone": "herringbone", "x:donegal": "donegal fleck", "x:slub": "slub jersey", "x:textured": "textured knit", "f:cord": "cord",
  "f:waxed": "waxed cotton", "f:fleece": "fleece", "f:moleskin": "moleskin", "f:suede": "suede"};
const ROLE_WORD = {tee: "tee", shirt: "shirt", overshirt: "overshirt", jacket: "jacket", fleece: "fleece", knit: "knit", cardigan: "cardigan",
  sweat: "sweat", hoodie: "hoodie", jeans: "jeans", chino: "chinos", trouser: "trousers", jogger: "joggers", shorts: "shorts",
  trainer: "trainers", boot: "boots", wallabee: "Wallabees", clog: "clogs", shoe: "shoes", cap: "cap", beanie: "beanie"};

/* Something you own, as a candidate. o: {id, role, name, colour?, image?, traits?, key?, brand?, similar?} */
export function ownedPiece(o) {
  const traits = o.traits && o.traits.length ? o.traits : traitsOf({name: o.name || "", role: o.role, brand: o.brand || "", store: "", text: "", colourHint: o.colour || ""});
  const col = o.colour || ((traits.find(t => t.startsWith("c:")) || "").slice(2)) || colourOf({name: o.name || "", colourHint: "", text: ""}) || null;
  return {id: "own:" + o.id, owned: true, role: o.role, name: o.name || ROLE_WORD[o.role] || "", brand: o.brand || "", image: o.image || null,
    colour: col, traits, key: o.key || null, similar: !!o.similar, value: 1.25};
}
/* A piece from the shops, as a candidate. x: a ranked row {it, sc}. */
export function shopPiece(x) {
  const it = x.it;
  const col = (it.traits.find(t => t.startsWith("c:")) || "").slice(2) || null;
  // The engine's score runs roughly -2..3; a great match is worth about as much as something you already own.
  const value = Math.max(-1, Math.min(1.6, x.sc.s * 0.55));
  return {id: it.key, owned: false, role: it.role, name: it.name, brand: it.brand, image: it.image, colour: col, traits: it.traits,
    key: it.key, price: it.price, was: it.was, disc: it.disc, pct: x.sc.pct, value, it};
}

/* ------------------------------------------------------------------ judging a look */
export function judge(pieces, formula) {
  let s = 0;
  const notes = [];
  for (const p of pieces) s += p.c.value + (p.slot.prefer && p.c.colour && p.slot.prefer.includes(p.c.colour) ? 0.4 : 0)
    + (p.slot.want && p.slot.want.some(t => p.c.traits.includes(t)) ? 0.4 : 0);
  const clothes = pieces.filter(p => !FOOT.has(p.c.role) && !ACC.has(p.c.role));
  const shoes = pieces.filter(p => FOOT.has(p.c.role));
  // Colours: every pair, shoes counting a little less.
  let best = null;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = pieces[i].c, b = pieces[j].c;
    const w = FOOT.has(a.role) || FOOT.has(b.role) ? 0.7 : 1;
    const v = pairScore(a.colour, b.colour) * w;
    s += v;
    if (v > 0.3 && a.colour !== b.colour && !FOOT.has(a.role) && !FOOT.has(b.role) && (!best || v > best.v)) best = {v, a: a.colour, b: b.colour};
  }
  const cols = clothes.map(p => p.c.colour).filter(Boolean);
  const accents = cols.filter(c => DEEP.has(c)).length + cols.filter(c => BRIGHT.has(c)).length * 1.5;
  if (accents > 1.5) s -= (accents - 1) * 1.1;
  const accent = cols.find(c => DEEP.has(c) || BRIGHT.has(c));
  // Tonal: two or more garments in one colour story, with something else to break it up.
  const tones = {};
  for (const c of cols) if (TONE[c]) tones[TONE[c]] = (tones[TONE[c]] || 0) + 1;
  const tonal = Object.entries(tones).find(([, n]) => n >= 2);
  if (tonal) s += 0.35;
  // Contrast: all dark or all light falls flat.
  const ls = cols.map(c => LIGHT[c] ?? 3);
  if (ls.length >= 2 && Math.max(...ls) <= 1) s -= 0.35;
  if (ls.length >= 2 && Math.min(...ls) >= 4) s -= 0.35;
  // Pattern and texture: one pattern, two textures at most, never two denims.
  const pats = new Set(), texs = new Set();
  let denim = 0;
  for (const p of pieces) {
    for (const t of p.c.traits) { if (PATTERNS.has(t)) pats.add(t); if (TEXTURES.has(t) && !FOOT.has(p.c.role)) texs.add(t); }
    if (!FOOT.has(p.c.role) && (p.c.role === "jeans" || p.c.traits.includes("f:denim"))) denim++;
  }
  if (pats.size > 1) s -= 1.5 * (pats.size - 1);
  if (texs.size > 2) s -= 0.6 * (texs.size - 2);
  if (denim > 1) s -= 0.9;
  // Sporty with smart doesn't sit well.
  const st = new Set(pieces.flatMap(p => p.c.traits.filter(t => t.startsWith("st:"))));
  if (st.has("st:smart") && (st.has("st:skate") || st.has("st:90s"))) s -= 0.3;
  // Notes: what makes it work, in a few words.
  if (tonal) {
    const fam = tonal[0], shades = [...new Set(cols.filter(c => TONE[c] === fam))];
    notes.push(shades.length > 1 ? `Tonal ${shades.slice(0, 2).map(cname).join(" and ")}` : `Tonal ${cname(shades[0])}`);
  } else if (best) notes.push(`${cap1(cname(best.a))} with ${cname(best.b)}`);
  if (accent && accents <= 1.5) notes.push(`${cap1(cname(accent))} as the one accent`);
  const shoe = shoes[0] && shoes[0].c;
  if (shoe && shoe.colour) {
    if (["brown", "tan"].includes(shoe.colour)) notes.push(`${cap1(cname(shoe.colour))} ${ROLE_WORD[shoe.role] || "shoes"} ground it`);
    else if (["white", "cream"].includes(shoe.colour)) notes.push(`${cap1(cname(shoe.colour))} ${ROLE_WORD[shoe.role] || "trainers"} keep it light`);
  }
  if (texs.size && texs.size <= 2) notes.push(cap1([...texs].map(t => TEXTURE_NAME[t]).join(" and ")) + " for texture");
  return {s, notes: notes.slice(0, 3)};
}

/* ------------------------------------------------------------------ building looks */
function rngFrom(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}
/* The slots that count now: summer-only slots wait for summer, winter layers for winter. */
function slotsNow(f, now) {
  const winter = outOfSummer({now});
  return (f.slots || []).filter(sl => !sl.season || (sl.season === "winter" ? winter : !winter));
}
/* Best look for one occasion. mode: "own" (only what you own), "few" (the fewest new pieces it takes, at least one),
   "fresh" (mostly new). A slot nothing in stock can fill is left out and named in "missing". */
function search(f, cands, mode, o) {
  const slots = slotsNow(f, o.now);
  const rnd = o.rnd, jitter = o.jitter || 0;
  const per = sl => {
    let list = cands.filter(c => (sl.roles || []).includes(c.role));
    if (mode === "own") list = list.filter(c => c.owned);
    return list;
  };
  const missing = slots.filter(sl => !sl.optional && !cands.some(c => (sl.roles || []).includes(c.role))).map(sl => sl.label);
  const req = slots.filter(sl => !sl.optional && !missing.includes(sl.label)), opt = slots.filter(sl => sl.optional);
  if (!req.length || req.length < 2) return null;
  const need = req.filter(sl => !cands.some(c => c.owned && (sl.roles || []).includes(c.role))).length;
  if (mode === "few" && need === req.length) return null; // nothing of yours fits: that's a fresh look
  // Each candidate's worth for this search, worked out once (with the shuffle's jitter, if any).
  const vals = new Map();
  const val = c => {
    if (vals.has(c.id)) return vals.get(c.id);
    let v = c.value;
    if (mode === "fresh" && c.owned) v = 0.15;
    if (!c.owned && o.used && o.used.get(c.id)) v -= 0.35 * o.used.get(c.id); // the same buy in look after look gets dull
    if (o.avoid && o.avoid.has(c.id)) v -= 2;
    v += jitter ? (rnd() - 0.5) * jitter : 0;
    vals.set(c.id, v);
    return v;
  };
  const piece = (sl, c) => ({slot: sl, c: Object.assign({}, c, {value: val(c)})});
  // Beam search, keeping the best partial looks for each number of new pieces, so "exactly one new piece" isn't
  // crowded out by all-owned looks.
  const fewest = Math.max(1, need);
  const BEAM = 24, maxBuys = mode === "own" ? 0 : mode === "few" ? fewest : 9;
  let beam = [{pieces: [], buys: 0, s: 0}];
  for (const sl of req) {
    const list = per(sl);
    if (!list.length) return null;
    const groups = new Map();
    for (const b of beam) {
      for (const c of list) {
        if (b.pieces.some(p => p.c.id === c.id)) continue;
        const buys = b.buys + (c.owned ? 0 : 1);
        if (buys > maxBuys) continue;
        const pieces = b.pieces.concat([piece(sl, c)]);
        const g = mode === "fresh" ? 0 : buys;
        (groups.get(g) || groups.set(g, []).get(g)).push({pieces, buys, s: judge(pieces, f).s});
      }
    }
    beam = [];
    for (const list2 of groups.values()) beam.push(...list2.sort((a, b) => b.s - a.s).slice(0, BEAM));
    if (!beam.length) return null;
  }
  if (mode === "few") beam = beam.filter(b => b.buys === fewest);
  if (!beam.length) return null;
  beam.sort((a, b) => b.s - a.s);
  let top = beam[0];
  // Optional layers join only when they make the look better.
  for (const sl of opt) {
    let best = null;
    for (const c of per(sl)) {
      if (top.pieces.some(p => p.c.id === c.id)) continue;
      if (!c.owned && top.buys + 1 > maxBuys) continue;
      const pieces = top.pieces.concat([piece(sl, c)]);
      const s = judge(pieces, f).s;
      if (s > top.s + 0.3 && (!best || s > best.s)) best = {pieces, buys: top.buys + (c.owned ? 0 : 1), s};
    }
    if (best) top = best;
  }
  const j = judge(top.pieces, f);
  const buy = top.pieces.filter(p => !p.c.owned);
  return {formula: f.id, mode, pieces: top.pieces.map(p => ({label: p.slot.label, c: p.c})), s: j.s, notes: j.notes,
    toBuy: Math.round(buy.reduce((n, p) => n + (p.c.price || 0), 0) * 100) / 100, buys: buy.length, missing};
}

/* Looks for every occasion.
   ranked: [{it, sc}] in your size (the engine's rank().all), owned: [ownedPiece], formulas: the occasions to dress for.
   o: {now, seed, perRole (shop pieces per kind, default 10), shuffle: {formulaId: n}, avoid: {formulaId: [piece ids]}} */
export function buildLooks(ranked, owned, formulas, o = {}) {
  const now = o.now || Date.now();
  const perRole = o.perRole || 10;
  // The best few in-stock pieces of each kind, plus everything you own.
  const byRole = new Map();
  for (const x of ranked) {
    if (!x || !x.it || x.it.inStock === false || !x.it.image || x.sc.pct < 35) continue;
    const l = byRole.get(x.it.role) || [];
    if (l.length < perRole) l.push(shopPiece(x));
    byRole.set(x.it.role, l);
  }
  const cands = [...owned, ...[...byRole.values()].flat()];
  const used = new Map(), out = [];
  for (const f of formulas || []) {
    if (f.season === "summer" && outOfSummer({now})) continue;
    const n = (o.shuffle && o.shuffle[f.id]) || 0;
    const rnd = rngFrom((o.seed || "") + f.id + n);
    // A shuffle steps away from the new pieces it showed last time.
    const looks = [], avoid = new Set((o.avoid && o.avoid[f.id]) || []);
    for (const mode of ["own", "few", "fresh"]) {
      const look = search(f, cands, mode, {now, rnd, jitter: n ? 0.9 : 0, used, avoid});
      if (!look) continue;
      // Not the same outfit twice; a fresh look has to change at least two pieces.
      const ids = new Set(look.pieces.map(p => p.c.id));
      const shared = l => l.pieces.filter(p => ids.has(p.c.id)).length;
      if (looks.some(l => shared(l) === look.pieces.length && l.pieces.length === look.pieces.length)) continue;
      if (mode === "fresh" && looks.some(l => shared(l) >= look.pieces.length - 1)) continue;
      looks.push(look);
      for (const p of look.pieces) if (!p.c.owned) { avoid.add(p.c.id); used.set(p.c.id, (used.get(p.c.id) || 0) + 1); }
    }
    out.push({formula: f, looks});
  }
  return out;
}

/* Which occasions to dress for: from the brief's answers, or all of them. */
const CONTEXT_ID = [[/office|work/, "office"], [/everyday|weekend|casual/, "everyday"], [/date|dinner|evening/, "date"], [/outdoor|photo|walk/, "outdoor"],
  [/hik|hill|trail/, "hiking"], [/travel|trip/, "travel"], [/loung|home/, "lounge"], [/gym|train|sport/, "gym"], [/beach|summer|holiday/, "beach"]];
export function occasionsFor(brief, formulas) {
  const all = formulas || DEFAULT_FORMULAS;
  const want = new Set();
  for (const c of (brief && brief.contexts) || []) for (const [rx, id] of CONTEXT_ID) if (rx.test(String(c).toLowerCase())) want.add(id);
  if (!want.size) return all;
  if (want.has("everyday")) want.add("date"); // a date night goes with an everyday wardrobe
  return all.filter(f => want.has(f.id));
}

/* The single new pieces that would do most for your outfits: in the most looks, in the best ones, going with the most of
   what you own. */
export function nextBuys(result, owned, n = 3) {
  const score = new Map();
  for (const occ of result) for (const l of occ.looks) {
    const buys = l.pieces.filter(p => !p.c.owned);
    for (const p of buys) {
      const e = score.get(p.c.id) || {c: p.c, looks: 0, occasions: new Set(), s: 0};
      e.looks++;
      // A piece that completes a look with what you already own counts for most; inspiration looks count a little.
      if (l.mode === "few") { e.occasions.add(occ.formula.name); e.s += 3 / l.buys + l.s * 0.2; }
      else e.s += 0.5 + l.s * 0.05;
      score.set(p.c.id, e);
    }
  }
  const ownCols = owned.map(p => p.colour).filter(Boolean);
  const rows = [...score.values()].map(e => {
    const fit = ownCols.length ? ownCols.reduce((t, c) => t + pairScore(e.c.colour, c), 0) / ownCols.length : 0;
    return Object.assign(e, {total: e.s + e.occasions.size * 1.5 + fit * 2 + e.c.value});
  }).sort((a, b) => b.total - a.total);
  const out = [], roles = new Set();
  for (const r of rows) { if (roles.has(r.c.role)) continue; roles.add(r.c.role); out.push(r); if (out.length >= n) break; }
  return out.map(r => ({c: r.c, occasions: [...r.occasions], looks: r.looks}));
}

/* Today's look: the best one you can wear right now (weekday: office if you dress for it, else everyday). */
export function todayLook(result, now) {
  const d = new Date(now || Date.now()).getDay(), weekend = d === 0 || d === 6;
  const order = weekend ? ["everyday", "outdoor", "travel", "date"] : ["office", "everyday", "outdoor", "travel"];
  for (const want of ["own", "few"]) {
    for (const id of order) {
      const occ = result.find(r => r.formula.id === id);
      const l = occ && occ.looks.find(x => x.mode === want);
      if (l) return {occasion: occ.formula, look: l};
    }
  }
  const any = result.find(r => r.looks.length);
  return any ? {occasion: any.formula, look: any.looks[0]} : null;
}
