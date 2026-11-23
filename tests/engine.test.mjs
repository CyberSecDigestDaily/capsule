// Unit tests for the taste engine (docs/engine.js). Run: node tests/engine.test.mjs
import assert from "node:assert/strict";
import * as E from "../docs/engine.js";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n    " + (e && e.message)); }
}
const pool = (o) => {
  const u = (o && o.u) || "https://shop.example/products/x";
  // Each test piece gets its own photo unless a test says otherwise (two listings with one photo are one piece).
  const i = "https://cdn.example/" + u.replace(/^https:\/\//, "").replace(/[^a-z0-9]+/gi, "-") + "-" + String((o && o.n) || "").replace(/[^a-z0-9]+/gi, "-") + ".jpg";
  return E.normItem(Object.assign({u, b: "Brand", n: "Thing", s: "Shop", c: "", r: null, p: 50, i, t: ""}, o), "pool");
};
const brief = {colours: {olive: "love", navy: "love", white: "no", black: "ok", burgundy: "love"}, washed_only: ["black", "rust", "mustard", "red", "orange", "pink", "purple", "teal", "bright-blue"],
  patterns: {waffle: "love", stripe: "no", check: "no"}, fabrics: {acrylic: "no", merino: "love"}, styles: ["workwear", "90s"], brands_love: ["Universal Works"],
  logos: "small-label", leg: "slightly-tapered", topfit: "longer", fitprob: ["middle"], nontoxic: ["pfas", "acrylic", "silver"], denim: ["raw", "black"],
  categories: ["jackets", "knitwear", "tees", "jeans", "trousers", "trainers", "boots", "sweats", "overshirts", "shorts"], rules: "soft-ask-later"};

console.log("\nKeys and traits");
t("item keys: host + path, colour code or variant", () => {
  assert.equal(E.itemKey("https://www.uniqlo.com/uk/en/products/E478550-000/00?colorDisplayCode=57&sizeDisplayCode=005"), "uniqlo.com/uk/en/products/e478550-000/00~c57");
  assert.equal(E.itemKey("https://shop.example/products/Tee/", "Olive Green"), "shop.example/products/tee~olive-green");
});
t("colour after the comma wins over the model name", () => {
  const it = pool({n: "Navy Collection Bakers Jacket, Olive Twill", r: "jacket"});
  assert.ok(it.traits.includes("c:olive") && !it.traits.includes("c:navy"));
});
t("negated claims don't count ('no logo', 'not boxy')", () => {
  const it = pool({n: "Crew Tee, navy", r: "tee", t: "a clean tee with no logo, not boxy"});
  assert.ok(!it.traits.includes("det:logo"), it.traits.join());
  assert.ok(!it.traits.includes("fit:boxy"), it.traits.join());
});
t("washed finish and texture are read", () => {
  const it = pool({n: "Garment Dyed Waffle Henley, black", r: "tee"});
  assert.ok(it.traits.includes("w:washed") && it.traits.includes("x:waffle") && it.traits.includes("c:black"));
});
t("a Nike SB Blazer is a trainer, not smart", () => {
  const it = pool({n: "Nike SB Blazer Low, navy", c: "Footwear"});
  assert.equal(it.role, "trainer");
  assert.ok(!it.traits.includes("st:smart"));
});

console.log("\nRules");
t("soft rules (a setting): a 'no' colour sinks instead of hiding", () => {
  const m = E.makeModel({brief, entries: {}, cfg: {rules: "soft"}});
  const it = pool({n: "Crew Tee, white", r: "tee"});
  assert.equal(E.hiddenWhy(m, it), null);
  assert.ok(E.score(m, it, {}).s < E.score(m, pool({n: "Crew Tee, olive", r: "tee"}), {}).s - 1.5);
});
t("a brief with an empty category list (as the account stores it) hides nothing", () => {
  const m = E.makeModel({brief: {colours: {navy: "love"}, categories: [], washed_only: [], styles: []}, entries: {}});
  assert.equal(E.hiddenWhy(m, pool({n: "Crew Tee, navy", r: "tee"})), null);
  assert.equal(E.hiddenWhy(m, pool({n: "Washed Tee, black", r: "tee"})), null);
});
t("a 'no' hides by default, whatever the brief says", () => {
  for (const cfg of [{}, {rules: "hard"}, {rules: null}]) {
    const m = E.makeModel({brief, entries: {}, cfg});
    assert.match(E.hiddenWhy(m, pool({n: "Crew Tee, white", r: "tee"})) || "", /^colour:white/);
    assert.match(E.hiddenWhy(m, pool({n: "Crew Tee, black", r: "tee"})) || "", /washed only/, "unwashed black hides too");
  }
});
t("washed-only colours: unwashed black tee sinks, washed one doesn't, black jeans are fine", () => {
  const m = E.makeModel({brief, entries: {}, cfg: {rules: "soft"}});
  assert.equal(E.washedMiss(m, pool({n: "Crew Tee, black", r: "tee"})), "black");
  assert.equal(E.washedMiss(m, pool({n: "Washed Crew Tee, black", r: "tee"})), null);
  assert.equal(E.washedMiss(m, pool({n: "Slim Taper Jeans, black", r: "jeans"})), null);
  assert.equal(E.washedMiss(m, pool({n: "Pigment Dyed Sweat, rust", r: "sweat"})), null);
});
t("summer pieces out of season need a discount", () => {
  const m = E.makeModel({brief, entries: {}, now: Date.parse("2026-10-29T12:00:00Z")});
  assert.equal(E.offSeason(m, pool({n: "Linen Shorts, stone", r: "shorts"})), true);
  assert.equal(E.offSeason(m, pool({n: "Linen Shorts, stone", r: "shorts", d: 30, w: 70})), false);
});
t("classic shoe silhouettes lead, chunky ones and collabs sink, summer pieces wait", () => {
  const b2 = Object.assign({}, brief, {shoes: ["skate", "terrace"]});
  const m = E.makeModel({brief: b2, entries: {}, now: Date.parse("2026-10-29T12:00:00Z")});
  const jan = pool({n: "SB Zoom Janoski OG+, navy", c: "Footwear", b: "Nike SB"}), nyj = pool({n: "Zoom Nyjah 4 Skate Shoes, navy", c: "Footwear", b: "Nike SB"});
  assert.ok(jan.traits.includes("det:classic") && nyj.traits.includes("det:chunky"));
  assert.ok(E.score(m, jan, {}).s > E.score(m, nyj, {}).s + 1);
  const collab = pool({n: "X Brain Dead Track Pant", r: "jogger", b: "adidas"});
  assert.ok(collab.traits.includes("det:collab"));
  const shorts = pool({n: "Ripstop Short, stone", r: "shorts", d: 50, w: 100});
  assert.ok(E.score(m, shorts, {}).adj.some(a => a[0] === "season"));
  assert.deepEqual(E.formulasNow([{id: "a"}, {id: "b", season: "summer"}], Date.parse("2026-11-02T12:00:00Z")).map(f => f.id), ["a"]);
});
t("cuts from the brief stay hard either way", () => {
  const m = E.makeModel({brief, entries: {}});
  assert.match(E.hiddenWhy(m, pool({n: "Oversized Hoodie, navy", r: "hoodie"})) || "", /^cut:oversized/);
});

console.log("\nLearning");
t("a love lifts its traits; a reason focuses the lesson", () => {
  const it = pool({n: "Waffle Crew Knit, burgundy", r: "knit"});
  const m0 = E.makeModel({brief, entries: {}});
  const m1 = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), et: new Date().toISOString(), s: "love", f: E.snapshot(it)}}});
  assert.ok(E.affinity(m1, "c:burgundy") > E.affinity(m0, "c:burgundy"));
  const m2 = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), s: "nope", why: ["colour"], f: E.snapshot(it)}}});
  const drop = E.affinity(m0, "c:burgundy") - E.affinity(m2, "c:burgundy"), dropTex = E.affinity(m0, "x:waffle") - E.affinity(m2, "x:waffle");
  assert.ok(drop > dropTex * 2, `colour drop ${drop} vs texture ${dropTex}`);
});
t("old signals fade", () => {
  const it = pool({n: "Fleece, olive", r: "fleece"});
  const now = Date.parse("2026-10-29T12:00:00Z");
  const fresh = E.makeModel({brief: {}, entries: {[it.key]: {t: "2026-10-28T12:00:00Z", s: "love", f: E.snapshot(it)}}, now});
  const old = E.makeModel({brief: {}, entries: {[it.key]: {t: "2026-04-28T12:00:00Z", s: "love", f: E.snapshot(it)}}, now});
  assert.ok(fresh.aff["c:olive"] > old.aff["c:olive"] * 2);
});
t("pieces you only scrolled past teach through traitsFor", () => {
  const it = pool({n: "Cord Overshirt, rust", r: "overshirt"});
  const m = E.makeModel({brief: {}, entries: {[it.key]: {t: new Date().toISOString(), shownTotal: 6}}, traitsFor: k => k === it.key ? it.traits : null});
  assert.ok((m.aff["c:rust"] || 0) < 0);
});

console.log("\nThe feed");
t("nope hides that piece and its other colours; a colour reason or your own tap keeps them; wildcards one in five", () => {
  const items = [];
  const cols = ["olive", "navy", "stone", "charcoal", "burgundy", "oatmeal", "rust", "tan", "khaki", "cream"];
  const roles = [["Waffle Knit", "knit"], ["Chore Jacket", "jacket"], ["Crew Tee", "tee"], ["Tapered Chinos", "chino"], ["Overshirt", "overshirt"]];
  for (const c of cols) for (const [n, r] of roles) items.push(pool({u: `https://shop.example/products/${r}-${c}`, n: `${n}, ${c}`, r}));
  const nope = items[0];
  const now = new Date().toISOString();
  const m = E.makeModel({brief, entries: {[nope.key]: {t: now, s: "nope", f: E.snapshot(nope)}}, cfg: {explore: 0.2}});
  const {list, hidden} = E.rank(m, items, {today: "2026-10-29"});
  assert.ok(hidden.some(h => h.it.key === nope.key && h.why === "nope"));
  assert.ok(!list.some(x => x.it.key === nope.key));
  const sibling = items.find(i => i !== nope && i.role === nope.role);
  assert.equal(sibling.fam, nope.fam);
  assert.ok(hidden.some(h => h.it.key === sibling.key && h.why === "family"), "its other colours hide too");
  assert.ok(list.some(x => x.it.role === "jacket"), "other kinds of piece still show");
  const m2 = E.makeModel({brief, entries: {[nope.key]: {t: now, s: "nope", why: ["colour"], f: E.snapshot(nope)}}});
  assert.equal(E.hiddenWhy(m2, sibling), null, "'colour' as the reason keeps the other colours");
  const m3 = E.makeModel({brief, entries: {[nope.key]: {t: now, s: "nope", f: E.snapshot(nope)}, [sibling.key]: {t: now, s: "like", f: E.snapshot(sibling)}}});
  assert.equal(E.hiddenWhy(m3, sibling), null, "your own tap on a colour wins");
  // Colourways show once, the best match first, with the other colours tucked behind it.
  assert.ok(list.every(x => Array.isArray(x.alts)) && list.some(x => x.alts.length >= 3), "other colours ride along as alts");
  assert.equal(new Set(list.map(x => x.it.fam)).size, list.length, "one card per piece");
  // Wildcards: one in five, on a feed of distinct pieces.
  const many = [];
  for (let i = 0; i < 40; i++) many.push(pool({u: `https://shop.example/products/m${i}`, n: `Model ${i} ${roles[i % 5][0]}, ${cols[i % 10]}`, r: roles[i % 5][1]}));
  const wl = E.rank(E.makeModel({brief, entries: {}, cfg: {explore: 0.2}}), many, {today: "2026-10-29"}).list;
  const wild = wl.filter(x => x.wildcard);
  assert.ok(wild.length >= 1 && wild.every(x => /^Testing/.test(x.note)));
  for (let i = 0; i < 12; i++) if (wl[i].wildcard) assert.equal(i % 5, 4);
});
t("the same piece elsewhere hides too: another shop's listing, a re-listing with the same photo", () => {
  const a = pool({u: "https://shopone.example/products/carhartt-wip-chase-sweatshirt-navy", b: "Carhartt WIP", n: "Carhartt WIP Chase Sweatshirt, Navy", r: "sweat"});
  const b = pool({u: "https://shoptwo.example/products/chase-sweat", b: "Carhartt WIP", n: "Chase Sweat - Dark Navy", r: "sweat"});
  assert.equal(a.fam, b.fam, "brand words and the word for the kind of piece are ignored");
  const c = pool({u: "https://shopone.example/products/broadwalk-derby", b: "John White", n: "Broadwalk Derby Shoes, black", r: "trainer", i: "https://cdn.example/files/derby-black_800x.jpg?v=1"});
  const d = pool({u: "https://shopone.example/products/broad-derby-black", b: "John White", n: "Broad Derby, black", r: "trainer", i: "https://cdn.example/files/derby-black.jpg?v=2"});
  assert.equal(c.img, d.img, "one photo, whatever its size suffix or query");
  const now = new Date().toISOString();
  const m = E.makeModel({brief, entries: {[a.key]: {t: now, s: "nope", f: E.snapshot(a)}, [c.key]: {t: now, s: "no", why: ["colour"], f: E.snapshot(c)}}});
  assert.equal(E.hiddenWhy(m, b), "family");
  assert.equal(E.hiddenWhy(m, d), "same", "the same photo hides even when the colour was the reason");
  const e = pool({u: "https://shopone.example/products/chase-hoodie", b: "Carhartt WIP", n: "Chase Hoodie, Navy", r: "hoodie"});
  assert.equal(E.hiddenWhy(m, e), null, "a different kind of piece from the same line stays");
});
t("Train: a deck never deals two colours of one piece, and drops cards hidden since it was dealt", () => {
  const items = [];
  for (let i = 0; i < 12; i++) for (const c of ["olive", "navy", "stone"]) items.push(pool({u: `https://shop.example/products/k${i}-${c}`, n: `Model ${i} Knit, ${c}`, r: "knit"}));
  const m = E.makeModel({brief, entries: {}});
  const deck = E.trainDeck(m, items, {today: "2026-10-29", seed: "y"}, 12, 0);
  const fams = deck.map(d => d.card.it.fam);
  assert.equal(new Set(fams).size, fams.length, "one colour per piece");
  const first = deck[0].card.it, sib = items.find(i => i.fam === first.fam && i.key !== first.key);
  const m2 = E.makeModel({brief, entries: {[first.key]: {t: new Date().toISOString(), s: "no", f: E.snapshot(first)}}});
  assert.equal(E.stepLive(m2, deck[0]), false, "answered");
  assert.equal(E.stepLive(m2, {card: {it: sib}}), false, "its other colour is gone too");
  assert.equal(E.stepLive(m2, deck[1]), true);
});
t("sizes: in stock in yours, from the size list each piece carries", () => {
  const us = E.sizesFrom({top: "M", trw: 32, trl: 30, shoe: 9}, null, null);
  const tee = pool({u: "https://shop.example/products/tee", n: "Crew Tee, olive", r: "tee", zs: ["S", "L", "XL"]});
  assert.equal(E.sizeOk(tee, us), false);
  assert.equal(E.sizeOk(Object.assign({}, tee, {sizes: ["M/L"]}), us), true, "M/L counts as M");
  const jeans = pool({u: "https://shop.example/products/jeans", n: "501 Jeans, indigo", r: "jeans", zs: ["W30L30", "W32L30", "W34L32"]});
  assert.equal(E.sizeOk(jeans, us), true);
  assert.equal(E.sizeOk(jeans, {trw: 36, trl: 32}), false);
  assert.equal(E.sizeOk(pool({n: "Chinos, stone", r: "chino", zs: ["W32", "W34"]}), us), true, "waist-only sizing");
  assert.equal(E.sizeOk(pool({n: "Joggers, grey", r: "jogger", zs: ["S", "M"]}), us), true, "joggers by letter");
  const shoe = pool({n: "Samba OG, white", c: "Footwear", zs: ["UK8", "UK9", "UK10"]});
  assert.equal(E.sizeOk(shoe, us), true);
  assert.equal(E.sizeOk(pool({n: "Boston, taupe", c: "Footwear", zs: ["EU42", "EU43"]}), us), true, "EU 43 is about a UK 9");
  assert.equal(E.sizeOk(pool({n: "Old data tee", r: "tee"}), us), true, "no size list: assume it fits (older data was in the owner's size)");
  const don = E.sizesFrom({}, null, {top: "L", waist: "W34", leg: "L32", shoe: "UK 10"});
  assert.deepEqual(don, {top: "L", trw: 34, trl: 32, shoe: 10, dress: null, wtop: null});
  const r = E.rank(E.makeModel({brief, entries: {}}), [tee, jeans], {today: "2026-10-29", sizes: us});
  assert.ok(r.hidden.some(h => h.it.key === tee.key && h.why === "size") && r.list.some(x => x.it.key === jeans.key));
});
t("published data is cleaned: numbers stay numbers, links must be web links", () => {
  const it = pool({n: "<b>Tee</b>", p: "12.5", w: "x", d: "40<script>", u: "javascript:alert(1)", r: "tee"});
  assert.equal(it.price, 12.5);
  assert.equal(it.was, null);
  assert.equal(it.disc, 0);
  assert.equal(it.url, "");
});
t("a pass in Train hides the piece too", () => {
  const it = pool({u: "https://shop.example/products/cord", n: "Cord Overshirt, rust", r: "overshirt"});
  const m = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), s: "no", f: E.snapshot(it)}}});
  assert.equal(E.hiddenWhy(m, it), "passed");
  assert.ok(!E.rank(m, [it], {today: "2026-10-29"}).list.length);
});
t("colourway families: the name without its colour, per brand and kind", () => {
  const f = n => E.familyOf("Converse", n, "trainer");
  assert.equal(f("Louie Lopez Pro 2 Skate Shoes Egret / Black / Gum"), f("Louie Lopez Pro 2 Skate Shoes, Utility/Egret/Gum"));
  assert.equal(E.familyOf("Albam", "Classic T-Shirt in Grey Marl", "tee"), E.familyOf("Albam", "Classic T-Shirt in Petrol Blue", "tee"));
  assert.equal(E.familyOf("X", "Fleece Jacket - Olive Green", "fleece"), E.familyOf("X", "Fleece Jacket, Navy", "fleece"));
  assert.notEqual(E.familyOf("X", "Made in England Tee", "tee"), E.familyOf("X", "Made in Portugal Tee", "tee"));
  assert.notEqual(E.familyOf("Albam", "Classic T-Shirt in Slate", "tee"), E.familyOf("Folk", "Classic T-Shirt in Slate", "tee"));
});
t("no three of a kind in a row at the top", () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push(pool({u: `https://shop.example/products/k${i}`, n: `Waffle Knit ${i}, olive`, r: "knit"}));
  for (let i = 0; i < 4; i++) items.push(pool({u: `https://shop.example/products/t${i}`, n: `Crew Tee ${i}, navy`, r: "tee"}));
  const m = E.makeModel({brief, entries: {}, cfg: {explore: 0}});
  const top = E.rank(m, items, {today: "2026-10-29"}).list.slice(0, 8).map(x => x.it.role);
  for (let i = 2; i < top.length; i++) assert.ok(!(top[i] === top[i - 1] && top[i] === top[i - 2]) || top.slice(i).every(r => r === top[i]), top.join());
});
t("cooldown after three quiet showings; a price drop brings it back; too pricey steps aside", () => {
  const it = pool({n: "Chore Jacket, olive", r: "jacket", p: 150});
  let m = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), cool: "2026-11-12", lp: 150, shownTotal: 3}}});
  assert.equal(E.cooling(m, it, "2026-10-29"), true);
  assert.equal(E.cooling(m, Object.assign({}, it, {price: 120}), "2026-10-29"), false);
  m = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), pricey: 1, cool: "2026-11-28", lp: 150, f: E.snapshot(it)}}});
  assert.equal(E.cooling(m, it, "2026-10-29"), true);
  m = E.makeModel({brief, entries: {[it.key]: {t: new Date().toISOString(), s: "love", cool: "2026-11-28", lp: 150}}});
  assert.equal(E.cooling(m, it, "2026-10-29"), false);
});
t("train deck mixes cards and duels", () => {
  const items = [];
  for (let i = 0; i < 40; i++) items.push(pool({u: `https://shop.example/products/p${i}`, n: `${["Waffle Knit", "Crew Tee", "Chore Jacket"][i % 3]} ${i}, ${["olive", "navy", "stone", "rust"][i % 4]}`, r: ["knit", "tee", "jacket"][i % 3]}));
  const deck = E.trainDeck(E.makeModel({brief, entries: {}}), items, {today: "2026-10-29", seed: "x"}, 20, 6);
  assert.equal(deck.length, 20);
  assert.ok(deck.some(d => d.duel) && deck.some(d => d.card));
});

console.log("\nSync helpers");
t("merging two copies: the later deliberate tap wins, counters take the larger", () => {
  const a = {t: "2026-10-29T10:00:00Z", et: "2026-10-29T10:00:00Z", s: "love", open: 2};
  const b = {t: "2026-10-29T11:00:00Z", shownTotal: 5, open: 1};
  const m = E.mergeEntry(a, b);
  assert.equal(m.s, "love");
  assert.equal(m.open, 2);
  assert.equal(m.shownTotal, 5);
  assert.equal(m.t, "2026-10-29T11:00:00Z");
  const c = {t: "2026-10-29T12:00:00Z", et: "2026-10-29T12:00:00Z"};
  assert.equal(E.mergeEntry(a, c).s, undefined, "an undo made later wins");
});
t("settings patches round-trip", () => {
  const a = {owned: {s1: 1, "3": 1}, pins: {"c:olive": 1.5}, counts: {tees: 4}, caps: {}, explore: 0.2, theme: "auto"};
  const b = {owned: {s1: 0, "3": 1, "7": 1}, pins: {}, counts: {tees: 5}, caps: {tee: 50}, explore: 0.33, theme: "dark"};
  const p = E.cfgDiff(a, b);
  assert.deepEqual(p, {explore: 0.33, theme: "dark", "owned.s1": 0, "owned.7": 1, "pins.c:olive": null, "counts.tees": 5, "caps.tee": 50});
  assert.deepEqual(E.applyCfgPatch(a, p), b);
});
t("profile settings travel as patches too", () => {
  const a = {profile: {height: 183}}, b = {profile: {height: 183.5, build: "middle|broad"}};
  const p = E.cfgDiff(a, b);
  assert.deepEqual(p, {"profile.height": 183.5, "profile.build": "middle|broad"});
  assert.deepEqual(E.applyCfgPatch(a, p).profile, b.profile);
});

console.log("\nAbout you");
t("cleanProfile keeps known keys in range and drops the rest", () => {
  const p = E.cleanProfile({height: 183, weight: "86.2", chest: 999, fit: "relaxed", top: "L", build: "middle|broad|nonsense", avoid: "wool", junk: 1, skin: "green"});
  assert.deepEqual(p, {height: 183, weight: 86.2, fit: "relaxed", top: "L", build: "middle|broad", avoid: "wool"});
});
t("profile leans the ranking: build, fit, height, climate, fabrics to avoid", () => {
  const slim = pool({u: "https://shop.example/products/s", n: "Slim Fit Oxford Shirt, navy", r: "shirt"});
  const reg = pool({u: "https://shop.example/products/r", n: "Regular Fit Oxford Shirt, navy", r: "shirt"});
  const wool = pool({u: "https://shop.example/products/w", n: "Wool Overshirt, navy", r: "overshirt"});
  const long = pool({u: "https://shop.example/products/l", n: "Longline Tee, navy", r: "tee"});
  const none = E.makeModel({brief: {}, entries: {}});
  const me = E.makeModel({brief: {}, entries: {}, cfg: {profile: {build: "middle", fit: "regular", height: 191, avoid: "wool", climate: "cool-wet"}}});
  const s = (m, it) => E.score(m, it, {today: "2026-11-03"}).s;
  assert.ok(s(me, slim) < s(none, slim) && s(me, reg) > s(none, reg), "slim sinks, regular rises");
  assert.ok(s(me, wool) < s(none, wool) - 0.5, "wool sinks");
  assert.ok(s(me, long) > s(none, long), "tall: longer cuts rise");
  assert.ok(E.affinity(me, "det:waterproof") > 0, "cool and wet: waterproofing helps");
});
t("size guide from measurements, or height and weight", () => {
  assert.deepEqual(E.sizeAdvice({chest: 106, waist: 87, inseam: 81}), {top: "L", topFrom: "chest", trw: 34, trl: 32});
  assert.equal(E.sizeAdvice({height: 183, weight: 86}).top, "L");
  assert.deepEqual(E.sizeAdvice({}), {});
});
t("similar pieces: same kind and shared traits first", () => {
  const it = pool({u: "https://shop.example/products/a", n: "Waffle Crew Knit, olive", r: "knit"});
  const others = [pool({u: "https://shop.example/products/b", n: "Waffle Crew Knit, olive", r: "knit", b: "Other"}), pool({u: "https://shop.example/products/c", n: "Crew Tee, navy", r: "tee"}),
    pool({u: "https://shop.example/products/d", n: "Chore Jacket, olive", r: "jacket"})];
  assert.equal(E.similar(it, others, 3)[0].url, "https://shop.example/products/b");
});


console.log("\nFor anyone: departments, womenswear, a brief of your own");
const v2 = (o) => Object.assign({v: 2, colours: {}, styles: [], logos: "ok", rules: "hard"}, o);
t("womenswear pieces are read for what they are", () => {
  const role = (n, c) => pool({u: "https://shop.example/products/" + n.replace(/\W+/g, "-"), n, c: c || ""}).role;
  assert.equal(role("Satin Cowl Midi Dress"), "dress");
  assert.equal(role("Shirt Dress, navy"), "dress");
  assert.equal(role("Lace Corset Top"), "top");
  assert.equal(role("Denim Mini Skirt"), "skirt");
  assert.equal(role("Cargo Denim Shorts"), "shorts");
  assert.equal(role("Chambray Shorts, navy"), "shorts");
  assert.equal(role("Organic Cotton Dungarees"), "jumpsuit");
  assert.equal(role("Slingback Heels", "Footwear"), "heel");
  assert.equal(role("Leather Sandals", "Footwear"), "sandal");
  assert.equal(role("Mary Jane Flats", "Footwear"), "shoe");
  assert.equal(role("Seamless Sculpt Leggings"), "jogger");
});
t("styles anyone might pick are read from the piece and the brand", () => {
  const dress = pool({n: "Pentagram Velvet Mini Dress", r: "dress", b: "Killstar"});
  assert.ok(dress.traits.includes("st:alt"), dress.traits.join());
  assert.ok(dress.traits.includes("f:velvet") && dress.traits.includes("det:mini"), dress.traits.join());
  const party = pool({n: "Cut-Out Bodycon Mini Dress", r: "dress", b: "Oh Polly"});
  assert.ok(party.traits.includes("st:party") && party.traits.includes("fit:bodycon") && party.traits.includes("det:cutout"), party.traits.join());
  assert.ok(pool({n: "Floral Puff Sleeve Midi Dress", r: "dress", b: "Rixo"}).traits.includes("st:romantic"));
});
t("menswear, womenswear or both: the brief decides, unisex shows for everyone", () => {
  const dress = pool({u: "https://shop.example/products/d", n: "Slip Dress, black", r: "dress", g: "w"});
  const hood = pool({u: "https://shop.example/products/h", n: "Zip Hoodie, grey", r: "hoodie", g: "u"});
  const tee = pool({u: "https://shop.example/products/t", n: "Crew Tee, navy", r: "tee"});
  assert.equal(tee.dept, "m");
  const vis = (b) => E.rank(E.makeModel({brief: b, entries: {}}), [dress, hood, tee], {today: "2026-11-23"}).list.map(x => x.it.key).sort();
  assert.deepEqual(vis(v2({dept: ["w"]})), [dress.key, hood.key].sort());
  assert.deepEqual(vis(v2({dept: ["m"]})), [hood.key, tee.key].sort());
  assert.deepEqual(vis(v2({dept: ["m", "w"]})), [dress.key, hood.key, tee.key].sort());
  assert.deepEqual(vis({}), [hood.key, tee.key].sort(), "no brief: menswear, as the site always was");
  assert.equal(E.hiddenWhy(E.makeModel({brief: v2({dept: ["m"]}), entries: {}}), dress), "department");
});
t("a new person's brief starts neutral: the owner's house defaults stay with his", () => {
  const pink = pool({u: "https://shop.example/products/p", n: "Pink Satin Slip Dress", r: "dress", g: "w"});
  const graphic = pool({u: "https://shop.example/products/g", n: "Graphic Print Tee, black", r: "tee"});
  const chunky = pool({u: "https://shop.example/products/c", n: "Chunky Platform Trainer, black", c: "Footwear"});
  const newbie = E.makeModel({brief: v2({dept: ["m", "w"]}), entries: {}});
  assert.equal(E.hiddenWhy(newbie, pink), null, "pink isn't a no unless you say so");
  assert.equal(E.hiddenWhy(newbie, graphic), null, "graphics show unless you say no logos");
  assert.ok(E.score(newbie, chunky, {}).s > -0.5, "chunky soles aren't sunk for you");
  const owner = E.makeModel({brief: {rubric: 1, colours: {}}, entries: {}});
  assert.ok(E.hiddenWhy(owner, pink), "the owner's brief still rules out vivid colours");
  assert.ok(String(E.hiddenWhy(owner, graphic)).startsWith("graphic"));
  const noLogos = E.makeModel({brief: v2({logos: "none"}), entries: {}});
  assert.ok(String(E.hiddenWhy(noLogos, graphic)).startsWith("graphic"));
  const lover = E.makeModel({brief: v2({logos: "love"}), entries: {}});
  assert.ok(E.score(lover, graphic, {}).s > E.score(newbie, graphic, {}).s, "graphics rise for someone who loves them");
  const neverBlack = E.makeModel({brief: v2({colours: {black: "no"}}), entries: {}});
  assert.ok(String(E.hiddenWhy(neverBlack, graphic)).startsWith("colour"));
});
t("the owner's house flags hide pieces in his view only", () => {
  const white = pool({u: "https://shop.example/products/w", n: "Boxy Tee, white", r: "tee", h: ["white"]});
  const ok = pool({u: "https://shop.example/products/o", n: "Crew Tee, navy", r: "tee", h: ["nonsense"]});
  assert.deepEqual(ok.house, [], "only known flags are kept");
  const m = E.makeModel({brief: v2({}), entries: {}});
  const own = E.rank(m, [white, ok], {today: "2026-11-23", house: true});
  assert.ok(own.hidden.some(h => h.it.key === white.key && h.why === "house:white"));
  const anyone = E.rank(m, [white, ok], {today: "2026-11-23"});
  assert.equal(anyone.list.length, 2);
});
t("womenswear sizes: UK dress size, letters and waists that go with it, shoes either side", () => {
  const us = E.sizesFrom({dress: 10, shoe: 5}, null, null);
  assert.equal(us.dress, 10);
  const dress = pool({u: "https://shop.example/products/d1", n: "Midi Dress", r: "dress", g: "w", zs: ["D8", "D10", "D12"]});
  assert.equal(E.sizeOk(dress, us), true);
  assert.equal(E.sizeOk(Object.assign({}, dress, {sizes: ["D14", "D16"]}), us), false);
  const top = pool({u: "https://shop.example/products/t1", n: "Corset Top", r: "top", g: "w", zs: ["S", "M"]});
  assert.equal(E.sizeOk(top, us), true, "a 10 is an S or M");
  assert.equal(E.sizeOk(Object.assign({}, top, {sizes: ["XL", "XXL"]}), us), false);
  assert.equal(E.sizeOk(Object.assign({}, top, {sizes: ["XL"]}), {dress: 10, wtop: "XL"}), true, "your own letter wins");
  const jeans = pool({u: "https://shop.example/products/j1", n: "Flared Jeans", r: "jeans", g: "w", zs: ["W26L30", "W28L32"]});
  assert.equal(E.sizeOk(jeans, us), true, "a 10 is about a 27 waist");
  const heels = pool({u: "https://shop.example/products/h1", n: "Slingback Heels", c: "Footwear", g: "w", zs: ["EU37", "EU38"]});
  assert.equal(heels.role, "heel");
  assert.equal(E.sizeOk(heels, us), true, "EU 38 is a UK 5");
  assert.equal(E.sizeOk(Object.assign({}, heels, {sizes: ["EU40", "EU41"]}), us), false);
  assert.equal(E.sizeOk(dress, {top: "L", trw: 34}), true, "no womenswear sizes given: can't tell, so it shows");
  const hood = pool({u: "https://shop.example/products/u1", n: "Zip Hoodie", r: "hoodie", g: "u", zs: ["XS", "S"]});
  assert.equal(E.sizeOk(hood, us), true, "unisex letters read from your dress size");
  assert.equal(E.sizeOk(Object.assign({}, hood, {sizes: ["XL", "XXL"]}), us), false);
  const uJeans = pool({u: "https://shop.example/products/u2", n: "Straight Jeans", r: "jeans", g: "u", zs: ["W32L32", "W34L32"]});
  assert.equal(E.sizeOk(uJeans, us), false, "unisex jeans by the waist that goes with a 10");
  assert.equal(E.sizeOk(Object.assign({}, uJeans, {sizes: ["W27L30"]}), us), true);
});
t("height: petite ranges for 5'3\" and under, tall from 5'10\"", () => {
  const petite = pool({u: "https://shop.example/products/pe", n: "Petite Straight Jeans", r: "jeans", g: "w"});
  const tall = pool({u: "https://shop.example/products/ta", n: "Tall Wide Leg Trousers", r: "chino", g: "w"});
  const short = E.makeModel({brief: v2({dept: ["w"]}), entries: {}, cfg: {profile: {height: 157}}});
  const longer = E.makeModel({brief: v2({dept: ["w"]}), entries: {}, cfg: {profile: {height: 180}}});
  const sc = (m, it) => E.score(m, it, {}).s;
  assert.ok(sc(short, petite) > sc(longer, petite) && sc(longer, tall) > sc(short, tall));
});
t("taste test: 30 cards across your styles and others, every kind of piece, two a brand at most", () => {
  const items = [];
  const looks = [["alt", "Pentagram Velvet", "Killstar"], ["party", "Cut-Out Bodycon", "Oh Polly"], ["romantic", "Floral Ruffle", "Rixo"],
    ["boho", "Crochet Fringe", "Spell"], ["athleisure", "Seamless Sculpt", "TALA"], ["preppy", "Cable Knit Polo", "Gant"]];
  const kinds = [["Mini Dress", "dress"], ["Top", "top"], ["Mini Skirt", "skirt"], ["Jacket", "jacket"], ["Boots", "boot"]];
  let k = 0;
  for (const [, words, brand] of looks) for (const [kind, role] of kinds) for (let i = 0; i < 4; i++)
    items.push(pool({u: `https://shop.example/products/t${k++}`, n: `${words} ${kind} ${i}, black`, r: role, b: `${brand} ${i % 2 ? "A" : "B"}${k % 7}`, g: "w"}));
  const m = E.makeModel({brief: v2({dept: ["w"], styles: ["alt", "party"]}), entries: {}});
  const deck = E.tasteDeck(m, items, {today: "2026-11-23", seed: "s"}, 30);
  assert.equal(deck.length, 30);
  const its = deck.map(d => d.card.it);
  const st = it => it.traits.filter(t => t === "st:alt" || t === "st:party").length > 0;
  const mine = its.filter(st).length;
  assert.ok(mine >= 18 && mine <= 22, "about two in three from your styles: " + mine);
  assert.ok(new Set(its.map(i => i.role)).size >= 5, "every kind of piece");
  const brands = {};
  for (const it of its) brands[it.brand] = (brands[it.brand] || 0) + 1;
  assert.ok(Object.values(brands).every(n => n <= 2), JSON.stringify(brands));
  assert.equal(new Set(its.map(i => i.fam)).size, its.length, "one colour of a piece");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
