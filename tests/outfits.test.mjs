// Unit tests for the outfit builder (docs/outfits.js). Run: node tests/outfits.test.mjs
import assert from "node:assert/strict";
import * as E from "../docs/engine.js";
import * as O from "../docs/outfits.js";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); } catch (e) { failed++; console.log("  ✗ " + name + "\n    " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n    ") : e)); }
}
let n = 0;
const piece = (name, role, o = {}) => {
  n++;
  const it = E.normItem(Object.assign({u: `https://shop.example/products/p${n}`, b: o.b || "Brand", n: name, s: "Shop", r: role, p: o.p || 50,
    i: `https://cdn.example/p${n}.jpg`, t: o.t || "", c: o.c || ""}, o.raw || {}), "pool");
  return {it, sc: {s: o.s ?? 1.5, pct: o.pct ?? 70}};
};
const NOW = Date.parse("2026-11-23T12:00:00Z");
const office = O.DEFAULT_FORMULAS.find(f => f.id === "office");

console.log("\nJudging a look");
t("classic pairings beat clashes; brown boots with black clothes lose", () => {
  const P = (name, role, colour, extra = []) => ({slot: {label: role, roles: [role]}, c: {id: name, role, colour, traits: ["c:" + colour, ...extra], value: 1, owned: true}});
  const good = O.judge([P("a", "chino", "stone"), P("b", "knit", "navy"), P("c", "tee", "white"), P("d", "boot", "brown")], office);
  const bad = O.judge([P("a", "chino", "black"), P("b", "knit", "black"), P("c", "tee", "rust"), P("d", "boot", "brown")], office);
  assert.ok(good.s > bad.s + 2, `${good.s} vs ${bad.s}`);
  assert.ok(good.notes.some(x => /Navy with stone|Stone with navy/.test(x)) && good.notes.some(x => /Brown boots ground it/.test(x)), good.notes.join(" | "));
});
t("one accent at most, one pattern at most, no double denim", () => {
  const P = (id, role, colour, extra = []) => ({slot: {label: role, roles: [role]}, c: {id, role, colour, traits: ["c:" + colour, ...extra], value: 1, owned: true}});
  const one = O.judge([P("a", "knit", "burgundy"), P("b", "chino", "navy"), P("c", "trainer", "white")], office).s;
  const two = O.judge([P("a", "knit", "burgundy"), P("b", "chino", "mustard"), P("c", "trainer", "white")], office).s;
  assert.ok(one > two + 1);
  const plain = O.judge([P("a", "shirt", "navy", ["x:check"]), P("b", "chino", "stone")], office).s;
  const busy = O.judge([P("a", "shirt", "navy", ["x:check"]), P("b", "chino", "stone", ["x:stripe"])], office).s;
  assert.ok(plain > busy + 1);
  const denim = O.judge([P("a", "jacket", "indigo", ["f:denim"]), P("b", "jeans", "indigo", ["f:denim"])], office).s;
  const mixed = O.judge([P("a", "jacket", "olive", ["f:waxed"]), P("b", "jeans", "indigo", ["f:denim"])], office).s;
  assert.ok(mixed > denim + 0.8);
});

console.log("\nBuilding looks");
const shop = [
  piece("Stretch Chinos, stone", "chino", {s: 1.8}), piece("Stretch Chinos, navy", "chino", {s: 1.6}),
  piece("Lambswool Crew, navy", "knit", {s: 2.2}), piece("Lambswool Crew, burgundy", "knit", {s: 1.9}), piece("Waffle Crew, olive", "knit", {s: 2.0}),
  piece("Organic Tee, white", "tee", {s: 1.4}), piece("Organic Tee, oatmeal", "tee", {s: 1.5}),
  piece("Byrne Chelsea Boot, brown suede", "boot", {s: 2.0, c: "Footwear"}), piece("Chelsea Boot, black", "boot", {s: 1.0, c: "Footwear"}),
  piece("Field Jacket, olive", "jacket", {s: 1.8}), piece("Raglan Sweat, grey marl", "sweat", {s: 1.5}),
  piece("502 Taper Jeans, indigo", "jeans", {s: 1.7}), piece("Samba OG, white", "trainer", {s: 1.6, c: "Footwear"})
];
t("with nothing owned: fresh looks only, every required slot filled, colours that work", () => {
  const res = O.buildLooks(shop, [], [office], {now: NOW, seed: "a"});
  const looks = res[0].looks;
  assert.ok(looks.length >= 1);
  const l = looks[0];
  assert.equal(l.mode, "fresh");
  for (const lab of ["Trousers", "Knit or cardigan", "Tee or shirt", "Shoes"]) assert.ok(l.pieces.some(p => p.label === lab), lab);
  const cols = l.pieces.map(p => p.c.colour);
  assert.ok(!(cols.includes("black") && cols.includes("brown")), cols.join());
  assert.ok(l.toBuy > 0 && l.buys >= 4);
});
t("what you own comes first: a look you can wear now, then the fewest new pieces", () => {
  const owned = [O.ownedPiece({id: "s1", role: "chino", name: "Chinos, navy"}), O.ownedPiece({id: "s2", role: "knit", name: "Merino crew, grey"}),
    O.ownedPiece({id: "s3", role: "tee", name: "Plain tee, white"}), O.ownedPiece({id: "s4", role: "boot", name: "Dr. Martens, brushed brown leather"})];
  assert.equal(owned[3].colour, "brown");
  const res = O.buildLooks(shop, owned, [office], {now: NOW, seed: "a"});
  const modes = res[0].looks.map(l => l.mode);
  assert.equal(modes[0], "own");
  assert.ok(res[0].looks[0].pieces.every(p => p.c.owned));
  const few = res[0].looks.find(l => l.mode === "few");
  assert.ok(few && few.buys === 1, "one new piece with three of yours");
  const ids = res[0].looks.map(l => l.pieces.map(p => p.c.id).sort().join());
  assert.equal(new Set(ids).size, ids.length, "no look shown twice");
});
t("an occasion that needs two new pieces still gets a 'fewest new pieces' look", () => {
  const owned = [O.ownedPiece({id: "s1", role: "chino", name: "Chinos, navy"}), O.ownedPiece({id: "s4", role: "boot", name: "Chelsea boots, brown suede"})];
  const res = O.buildLooks(shop, owned, [office], {now: NOW});
  const few = res[0].looks.find(l => l.mode === "few");
  assert.ok(few && few.buys === 2 && few.pieces.filter(p => p.c.owned).length >= 2);
});
t("shuffle gives a different look; winter adds a coat only when it helps; summer waits", () => {
  const a = O.buildLooks(shop, [], [office], {now: NOW, seed: "z"})[0].looks[0];
  const b = O.buildLooks(shop, [], [office], {now: NOW, seed: "z", shuffle: {office: 3}})[0].looks[0];
  assert.notEqual(a.pieces.map(p => p.c.id).join(), b.pieces.map(p => p.c.id).join());
  const beach = O.DEFAULT_FORMULAS.find(f => f.id === "beach");
  assert.equal(O.buildLooks(shop, [], [beach], {now: NOW}).length, 0, "summer occasion skipped in November");
});
t("a slot nothing can fill is named, the rest still dress", () => {
  const lounge = O.DEFAULT_FORMULAS.find(f => f.id === "lounge");
  const res = O.buildLooks(shop, [], [lounge], {now: NOW});
  const l = res[0].looks[0];
  assert.ok(l && l.missing.includes("Slippers or clogs"), JSON.stringify(l && l.missing));
});
t("best next buys favour pieces that complete looks with what you own", () => {
  const owned = [O.ownedPiece({id: "s1", role: "chino", name: "Chinos, navy"}), O.ownedPiece({id: "s3", role: "tee", name: "Plain tee, white"}),
    O.ownedPiece({id: "s4", role: "boot", name: "Chelsea boots, brown suede"})];
  const res = O.buildLooks(shop, owned, O.DEFAULT_FORMULAS, {now: NOW});
  const next = O.nextBuys(res, owned, 3);
  assert.ok(next.length === 3 && next.every(x => !x.c.owned), next.map(x => x.c.name).join(" | "));
  assert.equal(new Set(next.map(x => x.c.role)).size, 3, "three different kinds of piece");
  assert.ok(next[0].occasions.length >= 2, "the top one completes looks for more than one occasion");
});
t("today's look: a weekday picks the office if you dress for it", () => {
  const owned = [O.ownedPiece({id: "s1", role: "chino", name: "Chinos, navy"}), O.ownedPiece({id: "s2", role: "knit", name: "Merino crew, grey"}),
    O.ownedPiece({id: "s3", role: "tee", name: "Plain tee, white"}), O.ownedPiece({id: "s4", role: "boot", name: "Chelsea boots, brown suede"})];
  const res = O.buildLooks(shop, owned, O.DEFAULT_FORMULAS, {now: NOW});
  const today = O.todayLook(res, Date.parse("2026-11-24T08:00:00Z"));
  assert.equal(today.occasion.id, "office");
  assert.equal(today.look.mode, "own");
});
t("occasions from the brief's answers", () => {
  const ids = O.occasionsFor({contexts: ["office", "outdoor & photography", "lounging"]}).map(f => f.id);
  assert.deepEqual(ids, ["office", "outdoor", "lounge"]);
  assert.equal(O.occasionsFor({}).length, O.DEFAULT_FORMULAS.length);
});


console.log("\nWomenswear and both");
t("occasions follow the brief: womenswear gets going out and dress-or-separates looks", () => {
  const w = O.formulasFor({v: 2, dept: ["w"], contexts: ["everyday", "party"]});
  assert.deepEqual(w.map(f => f.id), ["everyday", "date", "party"]);
  assert.ok(w.find(f => f.id === "party").alt.length >= 1);
  assert.deepEqual(O.formulasFor({v: 2, dept: ["m"], contexts: ["office"]}).map(f => f.id), ["office"]);
  assert.equal(O.formulasFor({}).length, O.DEFAULT_FORMULAS.length, "no brief: the menswear occasions");
});
t("a night out from a dress or from separates, whichever is better; all black is a look", () => {
  const party = O.W_FORMULAS.find(f => f.id === "party");
  const ranked = [piece("Sequin Mini Dress, black", "dress", {s: 2.2, raw: {g: "w"}}), piece("Strappy Heels, black", "heel", {c: "Footwear", raw: {g: "w"}}),
    piece("Lace Corset Top, burgundy", "top", {s: 0.4, raw: {g: "w"}}), piece("Satin Mini Skirt, mustard", "skirt", {s: 0.2, raw: {g: "w"}})];
  const res = O.buildLooks(ranked, [], [party], {now: NOW, seed: "x"});
  const look = res[0].looks[0];
  assert.ok(look, "a look");
  const roles = look.pieces.map(p => p.c.role).sort();
  assert.deepEqual(roles, ["dress", "heel"], roles.join());
  assert.ok(look.notes.includes("All black"), look.notes.join(" | "));
});
t("owned womenswear counts: a dress you own completes the everyday look with one new piece", () => {
  const everyday = O.W_FORMULAS.find(f => f.id === "everyday");
  const owned = [O.ownedPiece({id: "c1", role: "dress", name: "Navy midi dress", colour: "navy"})];
  const ranked = [piece("Leather Chelsea Boots, brown", "boot", {c: "Footwear"}), piece("Crew Tee, white", "tee"), piece("Straight Jeans, indigo", "jeans")];
  const res = O.buildLooks(ranked, owned, [everyday], {now: NOW, seed: "y"});
  const few = res[0].looks.find(l => l.mode === "few");
  assert.ok(few && few.buys === 1 && few.pieces.some(p => p.c.owned && p.c.role === "dress"), JSON.stringify(res[0].looks.map(l => [l.mode, l.buys])));
  const gaps = E.outfitGaps([everyday], [{role: "dress"}, {role: "boot"}]);
  assert.equal(gaps.ready, 1, "a dress and boots make the everyday look");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
