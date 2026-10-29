// Unit tests for the taste engine (docs/engine.js). Run: node tests/engine.test.mjs
import assert from "node:assert/strict";
import * as E from "../docs/engine.js";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n    " + (e && e.message)); }
}
const pool = (o) => E.normItem(Object.assign({u: "https://shop.example/products/x", b: "Brand", n: "Thing", s: "Shop", c: "", r: null, p: 50, i: "https://cdn.example/x.jpg", t: ""}, o), "pool");
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
t("soft rules: a 'no' colour sinks instead of hiding", () => {
  const m = E.makeModel({brief, entries: {}});
  const it = pool({n: "Crew Tee, white", r: "tee"});
  assert.equal(E.hiddenWhy(m, it), null);
  assert.ok(E.score(m, it, {}).s < E.score(m, pool({n: "Crew Tee, olive", r: "tee"}), {}).s - 1.5);
});
t("hard rules (a setting) hide it", () => {
  const m = E.makeModel({brief, entries: {}, cfg: {rules: "hard"}});
  assert.match(E.hiddenWhy(m, pool({n: "Crew Tee, white", r: "tee"})) || "", /^colour:white/);
});
t("washed-only colours: unwashed black tee sinks, washed one doesn't, black jeans are fine", () => {
  const m = E.makeModel({brief, entries: {}});
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
t("nope hides that piece only; wildcards are labelled, one in five", () => {
  const items = [];
  const cols = ["olive", "navy", "stone", "charcoal", "burgundy", "oatmeal", "rust", "tan", "khaki", "cream"];
  const roles = [["Waffle Knit", "knit"], ["Chore Jacket", "jacket"], ["Crew Tee", "tee"], ["Tapered Chinos", "chino"], ["Overshirt", "overshirt"]];
  for (const c of cols) for (const [n, r] of roles) items.push(pool({u: `https://shop.example/products/${r}-${c}`, n: `${n}, ${c}`, r}));
  const nope = items[0];
  const m = E.makeModel({brief, entries: {[nope.key]: {t: new Date().toISOString(), s: "nope", f: E.snapshot(nope)}}, cfg: {explore: 0.2}});
  const {list, hidden} = E.rank(m, items, {today: "2026-10-29"});
  assert.ok(hidden.some(h => h.it.key === nope.key && h.why === "nope"));
  assert.ok(!list.some(x => x.it.key === nope.key));
  const sameAsNope = items.find(i => i !== nope && i.role === nope.role);
  assert.ok(list.some(x => x.it.key === sameAsNope.key), "a similar piece still shows");
  const wild = list.filter(x => x.wildcard);
  assert.ok(wild.length >= 1 && wild.every(x => /^Testing/.test(x.note)));
  for (let i = 0; i < 12; i++) if (list[i].wildcard) assert.equal(i % 5, 4);
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
t("similar pieces: same kind and shared traits first", () => {
  const it = pool({u: "https://shop.example/products/a", n: "Waffle Crew Knit, olive", r: "knit"});
  const others = [pool({u: "https://shop.example/products/b", n: "Waffle Crew Knit, olive", r: "knit", b: "Other"}), pool({u: "https://shop.example/products/c", n: "Crew Tee, navy", r: "tee"}),
    pool({u: "https://shop.example/products/d", n: "Chore Jacket, olive", r: "jacket"})];
  assert.equal(E.similar(it, others, 3)[0].url, "https://shop.example/products/b");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
