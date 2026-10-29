/* Capsule taste engine. Pure functions, no DOM: the page (app.js) and the Worker (worker/review.js) both use it.

   Every piece is described as a bag of traits ("c:olive", "x:waffle", "b:universal-works", "r:knit" ...). Your
   reactions teach an affinity per trait, on top of a prior from your style brief. A piece scores by the traits it
   carries, plus outfit gaps, deals and freshness, minus fatigue. One slot in five is a labelled wildcard so the
   model keeps testing things it knows little about. Old signals fade (half-life ~3 months by default). */

export const ENGINE_VERSION = 1;

/* ------------------------------------------------------------------ vocabulary */
// Colour families. The first colour named in a product's title (or variant) wins, longest phrase on a tie.
export const COLOURS = {
  charcoal: ["charcoal", "graphite", "anthracite", "dark grey", "dark gray", "slate", "gunmetal"],
  navy: ["navy", "dark navy", "midnight", "ink", "marine", "dark blue", "deep blue", "nautical"],
  olive: ["olive", "olive green", "army green", "military green", "moss", "fatigue", "loden", "sage", "green olive", "dusty olive"],
  khaki: ["khaki", "army", "military", "dark khaki"],
  stone: ["stone", "putty", "sand", "beige", "fawn", "bone", "dune", "pebble", "sesame", "biscuit"],
  taupe: ["taupe", "mushroom", "mole", "greige", "dove"],
  "washed-blue": ["washed blue", "faded blue", "chambray", "mid blue", "denim blue", "blue", "bleach blue", "stone blue"],
  "light-blue": ["light blue", "pale blue", "sky blue", "sky", "powder blue", "ice blue", "baby blue", "cornflower"],
  oatmeal: ["oatmeal", "ecru", "natural", "undyed", "oat", "flax", "wheat"],
  cream: ["cream", "off white", "off-white", "ivory", "vanilla", "chalk", "egret", "bone white", "milk", "sail", "cloud white"],
  white: ["white", "optic white", "bright white", "pure white"],
  grey: ["grey marl", "heather grey", "grey melange", "grey heather", "light grey", "marl", "grey", "gray", "ash", "silver grey", "smoke"],
  "bottle-green": ["bottle green", "forest green", "forest", "dark green", "racing green", "pine", "hunter green", "spruce", "evergreen", "green"],
  indigo: ["indigo", "raw", "rinse", "rinsed", "dark wash", "raw denim", "one wash", "dark indigo", "rigid"],
  black: ["black", "jet black", "jet", "onyx"],
  brown: ["brown", "chocolate", "dark brown", "coffee", "espresso", "walnut", "cocoa", "chestnut", "bark", "earth", "umber", "mocha", "beaver"],
  tan: ["tan", "camel", "tobacco", "cognac", "caramel", "toffee", "maple", "honey", "whisky", "whiskey", "cinnamon brown"],
  burgundy: ["burgundy", "oxblood", "maroon", "wine", "claret", "bordeaux", "plum", "merlot", "aubergine", "port"],
  rust: ["rust", "terracotta", "burnt orange", "brick", "copper", "paprika", "redwood"],
  mustard: ["mustard", "ochre", "yellow", "gold", "saffron", "turmeric", "amber"],
  red: ["red", "scarlet", "crimson", "cherry", "tomato", "pillar box"],
  orange: ["orange", "tangerine"],
  pink: ["pink", "rose", "blush", "salmon", "coral", "peach", "fuchsia", "magenta"],
  purple: ["purple", "lilac", "lavender", "violet", "mauve"],
  teal: ["teal", "turquoise", "aqua", "petrol", "mint", "jade"],
  "bright-blue": ["royal blue", "cobalt", "electric blue", "bright blue", "azure"],
  multi: ["multi", "multicolour", "multicolor", "colour block", "colourblock", "colorblock", "tie dye", "tie-dye", "rainbow"]
};
export const VIBRANT = new Set(["rust", "mustard", "red", "orange", "pink", "purple", "teal", "bright-blue"]);
const WASHED = ["washed", "faded", "garment dyed", "garment-dyed", "pigment dyed", "pigment-dyed", "vintage", "sun faded", "sun-faded",
  "overdyed", "over-dyed", "stonewash", "stone wash", "stonewashed", "enzyme", "worn in", "worn-in", "mineral wash", "dyed"];

export const FABRICS = {
  merino: ["merino", "extrafine merino", "extra fine merino"],
  lambswool: ["lambswool", "lambs wool", "lamb's wool", "shetland", "geelong"],
  cashmere: ["cashmere"],
  wool: ["wool", "melton", "boiled wool", "tweed", "alpaca", "mohair"],
  jersey: ["jersey", "loopback", "french terry", "terry", "supima", "pima", "slub jersey", "cotton jersey"],
  brushed: ["brushed", "brushed cotton", "flannel", "peached"],
  cord: ["corduroy", "cord", "cords", "needlecord", "jumbo cord", "babycord"],
  moleskin: ["moleskin"],
  waxed: ["waxed", "wax", "waxed cotton", "oilskin"],
  canvas: ["canvas", "twill", "duck", "drill", "ripstop", "sateen", "gabardine", "poplin", "oxford"],
  denim: ["denim", "selvedge", "selvage", "jeans", "jean"],
  linen: ["linen"],
  fleece: ["fleece", "polar fleece", "pile", "sherpa", "teddy", "polartec"],
  nylon: ["nylon", "polyamide", "technical", "gore-tex", "goretex", "softshell", "pertex", "polyester"],
  acrylic: ["acrylic"],
  suede: ["suede", "nubuck"],
  leather: ["leather", "crazy horse", "oiled leather", "pull-up", "pull up"],
  hemp: ["hemp"]
};
export const TEXTURES = {
  waffle: ["waffle"], rib: ["rib", "ribbed"], cable: ["cable", "aran"], honeycomb: ["honeycomb"],
  herringbone: ["herringbone"], donegal: ["donegal", "fleck", "flecked", "nep", "neps", "nepp"], slub: ["slub"],
  textured: ["textured", "boucle", "bouclé", "seed stitch", "moss stitch", "pique", "piqué"],
  stripe: ["breton", "stripe", "striped", "stripes", "stripy"], pinstripe: ["pinstripe", "pin stripe"],
  check: ["check", "checked", "plaid", "tartan", "gingham", "houndstooth", "buffalo"], camo: ["camo", "camouflage"],
  fairisle: ["fair isle", "fairisle", "nordic", "jacquard", "intarsia"], graphic: ["graphic", "print", "printed", "slogan", "screen print", "all-over print"]
};
export const FITS = {
  regular: ["regular fit", "classic fit", "regular"], relaxed: ["relaxed", "loose", "easy fit", "roomy", "generous fit"],
  slim: ["slim", "slim fit", "fitted", "muscle fit"], skinny: ["skinny", "super slim", "extra slim"],
  tapered: ["tapered", "taper", "slim taper", "regular taper"], straight: ["straight", "straight leg", "straight fit"],
  wide: ["wide", "wide leg", "baggy", "barrel", "balloon", "loose leg"], boxy: ["boxy"], oversized: ["oversized", "oversize"],
  cropped: ["cropped", "crop"], longline: ["longline", "long fit", "long length", "longer length", "tall"],
  raglan: ["raglan"], drop: ["drop shoulder", "drop-shoulder", "dropped shoulder", "dropped shoulders"]
};
export const DETAILS = {
  hood: ["hoodie", "hooded", "hood"], zip: ["quarter zip", "quarter-zip", "half zip", "half-zip", "1/4 zip", "full zip", "full-zip", "zip neck", "zip-up", "zip up"],
  crew: ["crew neck", "crewneck", "crew-neck", "crew"], vneck: ["v neck", "v-neck"], shawl: ["shawl"], mock: ["mock neck", "mock-neck", "roll neck", "rollneck", "funnel", "turtle neck", "turtleneck"],
  button: ["button", "buttoned", "henley"], lined: ["lined", "pile lined", "fleece lined", "quilted", "padded", "insulated", "thermal", "shearling"],
  waterproof: ["waterproof", "gore-tex", "goretex", "water repellent", "water-repellent", "dwr", "water resistant", "water-resistant"],
  pfcfree: ["pfc free", "pfc-free", "pfas free", "pfas-free", "fluorocarbon free", "fluorocarbon-free", "pfc0", "c0 dwr"],
  silver: ["silver ion", "polygiene", "anti-odour", "anti odour", "antimicrobial", "anti-microbial", "silver thread"],
  organic: ["organic", "gots", "oeko-tex", "oeko tex", "oekotex", "bluesign"], recycled: ["recycled"],
  logo: ["logo", "badge", "patch", "embroidered", "embroidery", "branded", "monogram"],
  madeuk: ["made in england", "made in britain", "made in the uk", "made in scotland", "made in wales", "made in portugal", "made in italy", "made in japan"],
  pockets: ["cargo", "patch pocket", "chest pocket", "utility"]
};
export const ROLES = [
  ["wallabee", ["wallabee"]], ["boot", ["chelsea", "boot", "boots", "chukka", "desert boot"]],
  ["clog", ["clog", "clogs", "mule", "slipper", "slippers", "birkenstock", "boston"]],
  ["trainer", ["trainer", "trainers", "sneaker", "sneakers", "samba", "gazelle", "spezial", "janoski", "air max", "990", "991", "992", "993", "996", "574", "576", "1500", "shoe", "shoes", "plimsoll", "vulc"]],
  ["socks", ["socks", "sock"]], ["underwear", ["boxer", "boxers", "briefs", "trunks", "boxer shorts"]],
  ["beanie", ["beanie", "watch cap", "toque"]], ["cap", ["cap", "5 panel", "five panel", "6 panel", "baseball", "snapback", "bucket hat", "hat"]],
  ["scarf", ["scarf", "snood"]], ["gloves", ["gloves", "mittens", "glove"]], ["belt", ["belt"]],
  ["bag", ["bag", "tote", "backpack", "rucksack", "holdall", "sling", "pouch", "duffle bag", "camera"]], ["watch", ["watch"]],
  ["overshirt", ["overshirt", "over shirt", "shirt jacket", "shacket", "cpo", "chore shirt"]], ["cardigan", ["cardigan"]],
  ["fleece", ["fleece", "polartec"]], ["jacket", ["jacket", "coat", "parka", "blouson", "harrington", "bomber", "m-65", "m65", "anorak", "gilet", "smock"]],
  ["hoodie", ["hoodie", "hooded sweat", "hooded"]], ["sweat", ["sweatshirt", "sweat", "crewneck sweat"]],
  ["knit", ["jumper", "sweater", "knit", "knitted", "lambswool", "merino", "roll neck", "rollneck", "quarter zip", "half zip", "pullover"]],
  ["shirt", ["shirt", "oxford", "chambray"]], ["tee", ["t-shirt", "tee", "t shirt", "henley", "long sleeve", "ls top", "top"]],
  ["jeans", ["jeans", "jean", "denim"]], ["jogger", ["jogger", "joggers", "sweatpant", "sweatpants", "track pant", "lounge pant", "sweat pant"]],
  ["shorts", ["shorts", "short"]], ["chino", ["chino", "chinos", "cord", "cords", "pant", "pants", "fatigue", "trouser", "trousers", "pleated"]]
];
// The site's category for each role (outfit formulas and filters use these).
export const ROLE_CATEGORY = {
  tee: "Tees", shirt: "Shirts", overshirt: "Jackets & Overshirts", jacket: "Jackets & Overshirts", fleece: "Mid-layers & Knits",
  knit: "Mid-layers & Knits", cardigan: "Mid-layers & Knits", sweat: "Mid-layers & Knits", hoodie: "Mid-layers & Knits",
  jeans: "Jeans", chino: "Chinos & Trousers", trouser: "Chinos & Trousers", jogger: "Joggers & Shorts", shorts: "Joggers & Shorts",
  trainer: "Footwear", boot: "Footwear", wallabee: "Footwear", clog: "Footwear",
  socks: "Socks & Boxers", underwear: "Socks & Boxers", cap: "Accessories", beanie: "Accessories", scarf: "Accessories",
  gloves: "Accessories", belt: "Accessories", bag: "Accessories", watch: "Accessories"
};
// Price ceilings (full price) per role group; the brief's caps override these.
export const CAP_GROUP = {
  tee: "tee", shirt: "overshirt", overshirt: "overshirt", jacket: "jacket", fleece: "knit", knit: "knit", cardigan: "knit", sweat: "knit",
  hoodie: "knit", jeans: "jeans", chino: "chinos", trouser: "chinos", jogger: "chinos", shorts: "chinos", trainer: "trainers",
  boot: "boots", wallabee: "boots", clog: "trainers", socks: "tee", underwear: "tee", cap: "tee", beanie: "tee", scarf: "knit",
  gloves: "tee", belt: "tee", bag: "jacket", watch: "jacket"
};
export const DEFAULT_CAPS = {tee: 40, knit: 120, overshirt: 120, jacket: 220, jeans: 110, chinos: 80, trainers: 130, boots: 220};
const STYLE_WORDS = {
  workwear: ["chore", "carpenter", "work jacket", "workwear", "utility", "duck canvas", "double knee", "painter", "bakers", "coverall", "travail", "engineer", "work pant", "workshirt", "work shirt"],
  military: ["m-65", "m65", "field jacket", "fatigue", "army", "military", "cargo", "deck jacket", "jungle", "flight", "officer", "surplus", "gurkha"],
  scandi: ["minimal", "scandinavian", "nordic minimal"],
  "90s": ["fleece", "track top", "quarter zip", "half zip", "retro", "90s", "samba", "gazelle", "spezial", "air max", "anorak", "polar", "runner", "990", "574"],
  skate: ["skate", "janoski", "blazer low", "era", "sb ", "vulc", "skateboarding"],
  outdoor: ["hiking", "trail", "waterproof", "gore-tex", "goretex", "outdoor", "mountain", "camp", "fleece"],
  heritage: ["waxed", "harris tweed", "made in england", "made in scotland", "lambswool", "shetland", "moleskin", "wallabee", "chelsea", "brogue", "gansey", "guernsey"],
  smart: ["blazer", "suit", "tailored", "pleated", "wool trouser", "oxford shirt", "loafer", "loafers"]
};
const STYLE_BRANDS = {
  workwear: ["universal works", "dickies", "carhartt", "uskees", "le laboureur", "vetra", "bleu de paname", "lee", "wrangler", "yarmouth oilskins", "community clothing", "albam", "orslow", "nigel cabourn", "arpenteur"],
  military: ["alpha industries", "nigel cabourn", "buzz rickson"],
  scandi: ["norse projects", "arket", "cos", "asket", "folk", "sunspel", "our legacy", "wood wood", "hope", "s.n.s. herning", "sns herning", "a.p.c.", "apc", "margaret howell", "mhl"],
  "90s": ["patagonia", "napapijri", "nike", "adidas", "new balance", "the north face", "columbia", "helly hansen"],
  skate: ["vans", "dickies", "carhartt", "nike sb", "polar", "converse"],
  outdoor: ["finisterre", "patagonia", "passenger", "fjallraven", "fjällräven", "snow peak", "arc'teryx", "rab", "salomon", "napapijri"],
  heritage: ["barbour", "gloverall", "solovair", "grenson", "sanders", "clarks", "john white", "blundstone", "dr. martens", "dr martens", "william lockie", "howlin", "lavenham", "private white"]
};
const SEASON = {
  winter: ["wool", "waxed", "fleece", "lined", "thermal", "cord", "corduroy", "shearling", "quilted", "moleskin", "flannel", "brushed",
    "knit", "jumper", "cardigan", "boot", "boots", "lambswool", "merino", "beanie", "scarf", "gloves", "parka", "padded", "puffer", "insulated"],
  summer: ["linen", "shorts", "sandal", "sandals", "birkenstock", "swim", "seersucker", "short sleeve", "short-sleeve", "camp collar"]
};
// Brand aliases: one slug per brand however the shop spells it.
const BRAND_ALIAS = [
  [/^levi'?s.*/, "levis"], [/^adidas.*/, "adidas"], [/^nike.*/, "nike"], [/^carhartt.*/, "carhartt"], [/^new balance.*/, "new balance"],
  [/^dr\.? ?martens.*/, "dr martens"], [/^clarks.*/, "clarks"], [/^the north face.*/, "the north face"], [/^a\.p\.c\..*/, "apc"],
  [/^norse projects.*/, "norse projects"], [/^uniqlo.*/, "uniqlo"], [/^m&s.*|^marks.*spencer.*/, "m&s"], [/^vans.*/, "vans"],
  [/^patagonia.*/, "patagonia"], [/^fj[aä]llr[aä]ven.*/, "fjallraven"], [/^barbour.*/, "barbour"], [/^finisterre.*/, "finisterre"]
];

export const REASONS_NOPE = [["colour", "Colour"], ["fit", "Fit or cut"], ["fabric", "Fabric"], ["price", "Price"], ["brand", "Brand"],
  ["logo", "Logo or detail"], ["dressy", "Too dressy"], ["young", "Too young"], ["have", "Have one"]];
export const REASONS_LOVE = [["colour", "Colour"], ["texture", "Texture"], ["cut", "Cut"], ["brand", "Brand"], ["price", "Price"], ["versatile", "Goes with lots"]];
const REASON_GROUPS = {colour: ["c", "w"], fit: ["fit", "det"], fabric: ["f", "x"], price: ["p", "d"], brand: ["b", "s"], logo: ["det"],
  dressy: ["st"], young: ["st"], texture: ["x", "f"], cut: ["fit"], versatile: ["r", "c"]};

// How much each trait group counts when scoring. Colour and style matter most; the shop barely.
const G = {c: 1.0, w: 0.35, x: 0.7, f: 0.7, fit: 0.8, b: 0.8, st: 0.9, r: 0.55, s: 0.2, p: 0.5, d: 0.15, sea: 0.3, det: 0.35};
const groupOf = t => t.slice(0, t.indexOf(":"));

/* ------------------------------------------------------------------ text matching */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RX = new Map();
function rx(word) {
  let r = RX.get(word);
  if (r) return r;
  const w = esc(word.toLowerCase()).replace(/ /g, "[\\s-]?");
  const left = /^[a-z0-9]/i.test(word) ? "(?<![a-z0-9])" : "";
  const right = /[a-z0-9]$/i.test(word) ? "(?![a-z0-9])" : "";
  r = new RegExp(left + w + right);
  RX.set(word, r);
  return r;
}
const compiled = new Map();
function patterns(vocab) {
  let c = compiled.get(vocab);
  if (!c) {
    c = Object.entries(vocab).map(([k, words]) => [k, words.map(w => [w, rx(w)])]);
    compiled.set(vocab, c);
  }
  return c;
}
/* "no logo", "not boxy", "logo-free", "rather than a drop shoulder" don't count as claims. */
const NEGATION = /(?:\b(?:no|not|non|without|zero|never|free of|minus|rather than|instead of|avoids?|unlike|isn't|aren't|nothing|less)\b[^.;:!?]{0,26}|\bnon-)$/;
const GLOBAL = new WeakMap();
function said(text, r) {
  if (!r.test(text)) return false;
  let g = GLOBAL.get(r);
  if (!g) { g = new RegExp(r.source, "g"); GLOBAL.set(r, g); }
  g.lastIndex = 0;
  let m;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 34), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (!NEGATION.test(before) && !/^[\s-]?free\b/.test(after)) return true;
  }
  return false;
}
/* Every key of `vocab` whose words the text actually claims. */
function allIn(text, vocab) {
  const out = [];
  for (const [k, list] of patterns(vocab)) if (list.some(([, r]) => said(text, r))) out.push(k);
  return out;
}
/* The key named first in text (longest phrase wins a tie). */
function firstIn(text, vocab) {
  let best = null;
  for (const [k, list] of patterns(vocab)) {
    for (const [w, r] of list) {
      const m = r.exec(text);
      if (m && (!best || m.index < best.i || (m.index === best.i && w.length > best.len))) best = {k, i: m.index, len: w.length};
    }
  }
  return best ? best.k : null;
}
export const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[®™]/g, "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
export const slug = s => norm(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
export function brandSlug(b) {
  let s = norm(b).replace(/\s*(clothing|co\.?|ltd|apparel|uk)$/g, "").trim();
  for (const [re, to] of BRAND_ALIAS) if (re.test(s)) { s = to; break; }
  return slug(s);
}
/* Stable key for any product: host + path, lower case, no query, plus the colour when one listing holds several. */
export function itemKey(url, variant) {
  const u = String(url || "").trim().replace(/^https?:\/\/(www\.)?/i, "").split("#")[0];
  const [path, q] = u.split("?");
  let k = path.replace(/\/+$/, "").toLowerCase();
  const colour = /colorDisplayCode=(\d+)/i.exec(q || "");
  if (colour) k += "~c" + colour[1];
  else if (variant) k += "~" + slug(variant);
  return k.slice(0, 180);
}

/* ------------------------------------------------------------------ items */
/* One shape for watch-list items, approved finds, picks and pool items. */
export function normItem(raw, kind) {
  const r = raw || {};
  let it;
  if (kind === "pool") {
    it = {kind, url: r.u, brand: r.b, name: r.n, store: r.s, category: r.c, role: r.r, price: r.p, was: r.w || null, disc: r.d || 0,
      image: r.i, text: r.t || "", firstSeen: r.f || null, size: r.z || "", alt: r.x || [], src: r.src || "", inStock: true,
      variant: r.v || undefined, colourHint: r.v || ""};
  } else if (kind === "watch") {
    it = {kind, id: r.id, url: r.url, brand: r.brand, name: r.name, store: r.store, category: r.category, role: r.role,
      price: r.price ?? r.last_price ?? r.last_seen_price ?? null, was: r.was || null, disc: r.discount_pct || 0, image: r.image,
      text: (r.fit && r.fit.note ? r.fit.note : "").slice(0, 300), firstSeen: null, size: r.size, alt: r.alt_sizes || [],
      inStock: r.in_stock !== false && r.signal !== "SOLD OUT" && r.signal !== "LINK ERROR", signal: r.signal, target: r.target,
      bought: !!r.bought, tier: r.tier, fit: r.fit || null, variant: r.variant, colourHint: r.variant || ""};
  } else {
    // find or pick
    it = {kind, url: r.url, brand: r.brand, name: r.name, store: r.store, category: r.category, role: r.role,
      price: r.price_now ?? r.price ?? null, was: r.was || null, disc: r.discount_pct || 0, image: r.image,
      text: [r.why, r.colour, (r.fit_words || []).join(" "), r.composition].filter(Boolean).join(" ").slice(0, 300),
      firstSeen: kind === "pick" ? null : (r.first_seen || null), size: r.size, alt: [], inStock: r.in_stock !== false && !r.verify_error,
      variant: r.variant, why: kind === "pick" ? r.why : undefined, short: r.short, colourHint: r.colour || r.variant || ""};
  }
  it.key = itemKey(it.url, it.variant);
  if (!it.role) it.role = roleOf(`${it.name} ${it.category || ""}`, it.category);
  it.category = it.category || ROLE_CATEGORY[it.role] || "Other";
  it.traits = traitsOf(it);
  return it;
}

export function roleOf(text, category) {
  // "T-Shirt" isn't a shirt, and a polo shirt is closer to a tee: say so before matching (as pool_role() does).
  const t = norm(text).replace(/\b(?:t|tee)[\s-]?shirts?\b/g, "tee").replace(/\bpolo shirts?\b/g, "polo tee");
  const foot = /footwear/i.test(category || "");
  for (const [role, words] of ROLES) {
    if (foot && !["wallabee", "boot", "clog", "trainer"].includes(role)) continue;
    if (words.some(w => rx(w).test(t))) return role;
  }
  return foot ? "trainer" : null;
}

export function colourOf(it) {
  const name = norm(it.name), hint = norm(it.colourHint);
  // The colour after the comma in "Bakers Jacket, Olive Green Twill" or the variant beats one in the model name.
  const tail = name.includes(",") ? name.slice(name.lastIndexOf(",") + 1) : "";
  return firstIn(hint, COLOURS) || firstIn(tail, COLOURS) || firstIn(name, COLOURS) || firstIn(norm(it.text).slice(0, 120), COLOURS);
}

const FOOTWEAR = new Set(["trainer", "boot", "wallabee", "clog"]);
export function traitsOf(it) {
  const name = norm(it.name), text = norm(`${it.name} ${it.colourHint || ""} ${it.text || ""}`), brand = norm(it.brand);
  const foot = FOOTWEAR.has(it.role);
  const out = new Set();
  if (it.role) out.add("r:" + it.role);
  const col = colourOf(it);
  if (col) out.add("c:" + col);
  if (WASHED.some(w => rx(w).test(text))) out.add("w:washed");
  for (const f of allIn(text, FABRICS)) out.add("f:" + f);
  const tx = allIn(text, TEXTURES);
  for (const x of tx) out.add("x:" + x);
  if (!tx.length && !foot) out.add("x:plain");
  if (!foot) for (const f of allIn(text, FITS)) out.add("fit:" + f);
  for (const d of allIn(text, DETAILS)) out.add("det:" + d);
  const b = brandSlug(it.brand || it.store);
  if (b) out.add("b:" + b);
  const st = slug(it.store || "");
  if (st && st !== b) out.add("s:" + st);
  for (const [style, words] of Object.entries(STYLE_WORDS)) {
    if (foot && style === "smart" && !/loafer/.test(name)) continue;
    if (words.some(w => said(text, rx(w)))) out.add("st:" + style);
  }
  for (const [style, brands] of Object.entries(STYLE_BRANDS)) if (brands.some(x => brand.startsWith(x))) out.add("st:" + style);
  if (SEASON.winter.some(w => rx(w).test(name))) out.add("sea:winter");
  else if (SEASON.summer.some(w => rx(w).test(name))) out.add("sea:summer");
  if (it.disc >= 40) out.add("d:40"); else if (it.disc >= 25) out.add("d:25"); else if (it.disc >= 10) out.add("d:10");
  return [...out];
}
/* Price band relative to your ceiling for that kind of piece (depends on the brief, so it is added at score time). */
function priceTrait(it, caps) {
  const cap = capFor(it, caps);
  if (!cap || it.price == null) return null;
  const f = it.price / cap;
  return "p:" + (f <= 0.4 ? "low" : f <= 0.75 ? "mid" : f <= 1 ? "upper" : "over");
}
export function capFor(it, caps) {
  const g = CAP_GROUP[it.role] || "jacket";
  return (caps && caps[g]) || DEFAULT_CAPS[g] || 150;
}

/* ------------------------------------------------------------------ the brief (prior) */
const LEVEL = {love: 1.0, ok: 0, no: null};
const DEFAULT_NO = new Set(["red", "orange", "pink", "purple", "teal", "bright-blue", "multi"]);
// With soft rules (the brief's default), a "no" sinks a piece to the bottom instead of hiding it.
const RULE_WEIGHT = -2.5;
/* Turns the style brief into starting affinities and rules. Hard rules hide a piece outright. */
export function priorOf(brief) {
  const b = brief || {}, prior = {}, hard = {}, soft = {};
  const softRules = !/^hard/.test(b.rules || "");
  const rule = (t, why) => { if (softRules) soft[t] = Math.min(soft[t] || 0, RULE_WEIGHT); else hard[t] = why; };
  const col = b.colours || {}, washedOnly = new Set(b.washed_only || []);
  for (const fam of Object.keys(COLOURS)) {
    // A colour you allow only washed isn't a "no": unwashed pieces in it are caught by washedMiss().
    const lv = col[fam] || (DEFAULT_NO.has(fam) && !washedOnly.has(fam) ? "no" : "ok");
    if (lv === "no") rule("c:" + fam, "colour");
    else prior["c:" + fam] = LEVEL[lv] ?? 0;
  }
  for (const [k, lv] of Object.entries(b.patterns || {})) {
    if (lv === "no") rule("x:" + k, "pattern"); else prior["x:" + k] = lv === "love" ? 0.45 : 0;
  }
  hard["x:graphic"] = "graphic";
  for (const [k, lv] of Object.entries(b.fabrics || {})) {
    if (lv === "no") soft["f:" + k] = -2; else prior["f:" + k] = lv === "love" ? 0.5 : 0;
  }
  for (const s of b.styles || []) prior["st:" + s] = (prior["st:" + s] || 0) + 0.5;
  for (const br of b.brands_love || []) prior["b:" + brandSlug(br)] = 0.8;
  for (const br of b.brands_never || []) rule("b:" + brandSlug(br), "brand");
  if (b.logos === "none") soft["det:logo"] = -1.2; else if (b.logos === "tiny") soft["det:logo"] = -0.6; else soft["det:logo"] = -0.15;
  // Cut: the brief's hard nos, then the softer leanings.
  for (const k of ["boxy", "oversized", "drop", "skinny", "cropped"]) hard["fit:" + k] = "cut";
  soft["fit:wide"] = -1.4; soft["fit:relaxed"] = -0.25;
  if (b.topfit === "longer") prior["fit:longline"] = 0.45;
  if ((b.fitprob || []).includes("middle")) soft["fit:slim"] = -0.5;
  if (b.leg === "slightly-tapered" || b.leg === "tapered") prior["fit:tapered"] = 0.35;
  if (b.leg === "straight") prior["fit:straight"] = 0.35;
  for (const s of b.shoes || []) {
    const m = {wallabee: ["r:wallabee"], "winter-boot": ["r:boot", "det:waterproof", "det:lined"], "brown-chelsea": ["r:boot"], "black-chelsea": ["r:boot"],
      runner: ["st:90s"], terrace: ["st:90s"], skate: ["st:skate"], clog: ["r:clog"], hiking: ["st:outdoor"], loafer: ["st:smart"]}[s] || [];
    for (const t of m) prior[t] = (prior[t] || 0) + 0.3;
  }
  const nt = new Set(b.nontoxic || []);
  if (nt.has("silver")) hard["det:silver"] = "treatment";
  if (nt.has("pfas")) soft["det:waterproof"] = (soft["det:waterproof"] || 0) - 0.35, prior["det:pfcfree"] = 0.5;
  if (nt.has("oeko")) prior["det:organic"] = 0.35;
  if (b.ethics === "big") prior["det:madeuk"] = 0.5, prior["det:recycled"] = 0.3;
  else if (b.ethics === "small") prior["det:madeuk"] = 0.2, prior["det:recycled"] = 0.1;
  return {prior, hard, soft, softRules, cats: b.categories ? new Set(b.categories) : null, brief: b};
}

/* ------------------------------------------------------------------ learning */
// What each reaction is worth. Explicit taps dominate; quiet signals nudge.
export const SIGNAL = {love: 2.5, like: 1, no: -1, nope: -2.5, more: 1.5, save: 0.8, pricey: 0.8, own: 0.6, bought: 2.5,
  win: 0.7, loss: -0.5, open: 0.4, view: 0.15, linger: 0.25, ignored: -0.12};
export function signalOf(e) {
  if (!e) return 0;
  let v = {love: SIGNAL.love, like: SIGNAL.like, no: SIGNAL.no, nope: SIGNAL.nope}[e.s] || 0;
  if (e.more) v += SIGNAL.more;
  if (e.save) v += SIGNAL.save;
  if (e.pricey) v += SIGNAL.pricey;
  if (e.own) v += SIGNAL.own;
  if (e.bought) v += SIGNAL.bought;
  v += SIGNAL.win * Math.min(e.wins || 0, 5) + SIGNAL.loss * Math.min(e.losses || 0, 5);
  v += SIGNAL.open * Math.min(e.open || 0, 3) + SIGNAL.view * Math.min(e.view || 0, 4) + (e.linger ? SIGNAL.linger : 0);
  if (!e.s && !e.more && !e.save && !e.bought && !e.own && !e.pricey) v += SIGNAL.ignored * Math.min(Math.max(0, (e.shownTotal || 0) - 2), 5);
  return v;
}
const reacted = e => !!(e && (e.s || e.more || e.save || e.bought || e.own || e.pricey || e.wins || e.losses));
export {reacted};

/* Learn trait affinities from every entry (a stored reaction with a compact copy of the piece's traits). */
export function learn(entries, opts) {
  const o = opts || {}, now = o.now || Date.now(), half = (o.fadeDays || 90) * 864e5, since = o.resetAt ? Date.parse(o.resetAt) : 0;
  const sum = {}, wt = {};
  for (const [key, e] of Object.entries(entries || {})) {
    const traits = (e.f && e.f.tr) || (o.traitsFor && o.traitsFor(key)) || null;
    if (!traits || !traits.length) continue;
    const t = Date.parse(e.t || 0) || now;
    if (t < since) continue;
    const v = signalOf(e);
    if (!v) continue;
    const decay = Math.pow(0.5, Math.max(0, now - t) / half);
    const why = new Set(e.why || []);
    const target = new Set();
    for (const r of why) for (const g of REASON_GROUPS[r] || []) target.add(g);
    if (why.has("have")) continue; // "have one already" says nothing about taste
    for (const tr of traits) {
      const g = groupOf(tr);
      // A reason narrows the lesson: "not for me: colour" mostly teaches colour.
      const focus = target.size ? (target.has(g) ? 1 : (v < 0 ? 0.2 : 0.5)) : 1;
      sum[tr] = (sum[tr] || 0) + v * decay * focus;
      wt[tr] = (wt[tr] || 0) + decay * focus;
    }
  }
  const aff = {}, n = {};
  const K = 1.5;
  for (const tr of Object.keys(sum)) {
    aff[tr] = sum[tr] / (wt[tr] + K);
    n[tr] = wt[tr];
  }
  return {aff, n};
}

/* ------------------------------------------------------------------ the model */
/* traitsFor(key) lets entries without a snapshot (pieces you only scrolled past) still teach while the piece is listed. */
export function makeModel({brief: brief0, entries, cfg, now, traitsFor}) {
  const c = cfg || {};
  // How strict your no's are is a setting you can flip on the You tab; it overrides the brief's answer.
  const brief = c.rules ? Object.assign({}, brief0 || {}, {rules: c.rules}) : brief0;
  const p = priorOf(brief);
  const caps = Object.assign({}, DEFAULT_CAPS, (brief && brief.caps) || {}, c.caps || {});
  const counts = Object.assign({}, (brief && brief.counts) || {}, c.counts || {});
  const learned = learn(entries, {now, fadeDays: c.fadeDays || (brief && brief.fade_days) || 90, resetAt: c.resetAt, traitsFor});
  return {prior: p.prior, hard: p.hard, soft: p.soft, softRules: p.softRules, cats: p.cats, aff: learned.aff, n: learned.n, pins: c.pins || {},
    caps, counts, explore: c.explore ?? (brief && brief.explore) ?? 0.2, entries: entries || {}, brief: p.brief,
    now: now || Date.now(), repeatDays: (brief && brief.repeat_days) || 14};
}

/* A clothing piece in a colour you only wear washed (black, the vibrant ones), without a washed finish. */
export function washedMiss(m, it) {
  const traits = it.traits;
  const col = traits.find(t => t.startsWith("c:"));
  if (!col || !CLOTHING_ROLES.has(it.role) || traits.includes("w:washed") || m.pins[col] != null) return null;
  const fam = col.slice(2), b = m.brief || {};
  const washedOnly = b.washed_only || ["black", ...VIBRANT];
  if (!washedOnly.includes(fam)) return null;
  if (fam === "black" && it.role === "jeans" && (b.denim || []).includes("black")) return null;
  return fam;
}
/* Summer pieces out of season show only when they're reduced (the brief's "now, if they're on sale"). */
export function offSeason(m, it) {
  if (!it.traits.includes("sea:summer") || (m.brief && m.brief.summer === "always")) return false;
  const mo = new Date(m.now || Date.now()).getUTCMonth();
  return (mo >= 9 || mo <= 2) && !((it.disc || 0) >= 10);
}

/* Affinity for one trait: brief prior + learned + your own pin. */
export function affinity(m, t) {
  const pin = m.pins[t];
  if (pin != null) return pin;
  return (m.prior[t] || 0) + (m.soft[t] || 0) + (m.aff[t] || 0);
}

const CLOTHING_ROLES = new Set(["tee", "shirt", "overshirt", "jacket", "fleece", "knit", "cardigan", "sweat", "hoodie", "jeans", "chino", "trouser", "jogger", "shorts", "scarf", "beanie", "cap", "gloves"]);
export const pctOf = s => Math.round(100 / (1 + Math.exp(-1.3 * s)));

/* Why a piece is hidden for you, or null. */
export function hiddenWhy(m, it) {
  const e = m.entries[it.key];
  if (e && e.s === "nope") return "nope";
  if (e && (e.bought || it.bought)) return "owned";
  if (e && e.own) return "own-similar";
  if (m.cats && it.role && !roleWanted(m.cats, it.role)) return "category";
  const traits = it.traits;
  for (const t of traits) {
    if (m.pins[t] != null) {
      if (m.pins[t] <= -2.5) return "you-hid:" + t.slice(t.indexOf(":") + 1);
      continue;
    }
    const h = m.hard[t];
    if (!h) continue;
    if (h === "colour" && !CLOTHING_ROLES.has(it.role)) continue; // footwear keeps its own colour rules
    return h + ":" + t.slice(t.indexOf(":") + 1);
  }
  if (!m.softRules) { const fam = washedMiss(m, it); if (fam) return "colour:" + fam + " (washed only)"; }
  if (it.role === "knit" || it.role === "cardigan") {
    if (traits.includes("f:acrylic") && m.brief && (m.brief.nontoxic || []).includes("acrylic")) return "fabric:acrylic";
  }
  if (offSeason(m, it)) return "season:summer";
  return null;
}
const ROLE_CAT = {tee: "tees", shirt: "shirts", overshirt: "overshirts", jacket: "jackets", fleece: "fleece", knit: "knitwear", cardigan: "knitwear",
  sweat: "sweats", hoodie: "sweats", jeans: "jeans", chino: "trousers", trouser: "trousers", jogger: "joggers", shorts: "shorts",
  trainer: "trainers", boot: "boots", wallabee: "casual-shoes", clog: "clogs", socks: "socks", underwear: "socks", cap: "caps",
  beanie: "caps", scarf: "scarves", gloves: "scarves", belt: "belts", bag: "bags", watch: "watches"};
export const roleWanted = (cats, role) => !cats || !ROLE_CAT[role] || cats.has(ROLE_CAT[role]);

/* Score one piece. ctx: {gapRoles:Set, owned:{role:count}, picks:Set(keys), today:'YYYY-MM-DD'} */
export function score(m, it, ctx) {
  const c = ctx || {};
  const traits = it.traits.slice();
  const pt = priceTrait(it, m.caps);
  if (pt) traits.push(pt);
  let num = 0, den = 0;
  const parts = [];
  for (const t of traits) {
    const g = G[groupOf(t)] ?? 0.3;
    const a = affinity(m, t);
    num += g * a;
    den += g;
    if (a) parts.push([t, g * a]);
  }
  let s = den ? (num / den) * 3 : 0;
  const adj = [];
  // Soft rules: an unwashed piece in a washed-only colour sinks rather than disappearing.
  if (m.softRules && washedMiss(m, it)) { s += RULE_WEIGHT; adj.push(["unwashed", RULE_WEIGHT]); }
  // Outfit gaps and how many you already own of this kind.
  if (c.gapRoles && c.gapRoles.has(it.role)) { s += 0.5; adj.push(["gap", 0.5]); }
  const owned = (c.owned && c.owned[it.role]) || 0, target = targetFor(m, it.role);
  if (target != null && owned >= target) {
    const up = (it.disc || 0) >= 25 ? -0.5 : -1.6;
    s += up; adj.push(["enough", up]);
  }
  // Deals are boosted; pieces over your ceiling sink.
  if (it.disc) { const d = 0.6 * Math.min(it.disc, 50) / 50; s += d; adj.push(["deal", d]); }
  const cap = capFor(it, m.caps);
  if (it.price != null && cap && it.price > cap) { const o = -Math.min(3, (it.price / cap - 1) * 3); s += o; adj.push(["over", o]); }
  if (it.firstSeen && c.today && daysBetween(it.firstSeen, c.today) <= 2) { s += 0.3; adj.push(["new", 0.3]); }
  if (c.picks && c.picks.has(it.key)) { s += 0.6; adj.push(["pick", 0.6]); }
  if (it.signal === "BUY") { s += 0.4; adj.push(["buy", 0.4]); }
  const e = m.entries[it.key];
  if (e && !reacted(e) && (e.shownTotal || 0) > 2) { const f = -Math.min(0.8, 0.2 * ((e.shownTotal || 0) - 2)); s += f; adj.push(["seen", f]); }
  // Evidence: how much the model actually knows about this piece's traits (for wildcards and the train deck).
  let known = 0, total = 0;
  for (const t of it.traits) { const g = G[groupOf(t)] ?? 0.3; total += g; known += g * Math.min(1, (m.n[t] || 0) / 3); }
  return {s, pct: pctOf(s), parts: parts.sort((a, b) => b[1] - a[1]), adj, certainty: total ? known / total : 0};
}
export function targetFor(m, role) {
  const k = {tee: "tees", knit: "knits", cardigan: "knits", sweat: "sweats", hoodie: "sweats", fleece: "sweats", overshirt: "overshirts",
    jacket: "jackets", jeans: "jeans", chino: "trousers", trouser: "trousers", trainer: "trainers", boot: "boots", wallabee: "boots"}[role];
  return k && m.counts[k] != null ? m.counts[k] : null;
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + (b.length === 10 ? "T12:00:00Z" : "")) - Date.parse(a + (a.length === 10 ? "T12:00:00Z" : ""))) / 864e5);
}

/* Cooldown: a piece shown three times with no reaction steps aside for two weeks, unless its price drops. */
export function cooling(m, it, today) {
  const e = m.entries[it.key];
  // "Too pricey" also steps a piece aside until its price drops.
  if (!e || !e.cool || (reacted(e) && !e.pricey)) return false;
  if (e.lp != null && it.price != null && it.price < e.lp - 0.5) return false;
  return e.cool > today;
}

/* ------------------------------------------------------------------ labels and reasons */
const TITLE = {c: "", w: "", x: "", f: "", fit: "", b: "", s: "", st: "", r: "", sea: "", det: "", p: "", d: ""};
const NICE = {
  "fit:regular": "Regular fit", "fit:slim": "Slim fit", "fit:relaxed": "Relaxed fit", "fit:straight": "Straight leg", "fit:wide": "Wide leg",
  "fit:raglan": "Raglan sleeve",
  "c:washed-blue": "Washed blue", "c:light-blue": "Light blue", "c:bottle-green": "Bottle green", "c:bright-blue": "Bright blue",
  "w:washed": "Washed finish", "x:plain": "Plain", "x:fairisle": "Fair Isle", "fit:drop": "Drop shoulder", "fit:longline": "Longer cut",
  "st:90s": "90s sportswear", "st:scandi": "Scandi minimal", "sea:winter": "Winter-ready", "sea:summer": "Summer piece",
  "det:hood": "Hooded", "det:zip": "Zip neck", "det:crew": "Crew neck", "det:vneck": "V-neck", "det:mock": "High neck", "det:lined": "Lined",
  "det:waterproof": "Waterproofed", "det:pfcfree": "PFC-free finish", "det:silver": "Anti-odour treatment", "det:organic": "Organic or certified",
  "det:recycled": "Recycled", "det:logo": "Logo detail", "det:madeuk": "Made in UK or Europe", "det:pockets": "Utility pockets",
  "p:low": "Easy price", "p:mid": "Mid price", "p:upper": "Near your ceiling", "p:over": "Over your ceiling",
  "d:10": "On sale", "d:25": "25%+ off", "d:40": "40%+ off", "r:tee": "Tees", "r:knit": "Knitwear", "r:sweat": "Sweats", "r:hoodie": "Hoodies",
  "r:jogger": "Joggers", "r:chino": "Chinos", "r:trouser": "Trousers", "r:trainer": "Trainers", "r:boot": "Boots", "r:clog": "Clogs and slippers",
  "r:overshirt": "Overshirts", "r:jacket": "Jackets", "r:cardigan": "Cardigans", "r:fleece": "Fleece", "r:jeans": "Jeans", "r:shirt": "Shirts",
  "r:wallabee": "Wallabees", "r:cap": "Caps", "r:beanie": "Beanies", "r:bag": "Bags", "r:socks": "Socks", "r:shorts": "Shorts"
};
export function label(t, brands) {
  if (NICE[t]) return NICE[t];
  const [g, v] = [groupOf(t), t.slice(t.indexOf(":") + 1)];
  if (g === "b" && brands && brands[v]) return brands[v];
  const words = v.replace(/-/g, " ");
  const cap = words.charAt(0).toUpperCase() + words.slice(1);
  if (g === "x" && !["plain"].includes(v)) return cap + (["waffle", "rib", "cable", "honeycomb"].includes(v) ? " knit" : "");
  if (g === "st") return cap;
  return TITLE[g] + cap;
}
const ADJ_LABEL = {gap: "fills a gap", deal: "", new: "new in", pick: "in this week's edit", buy: "under your target"};

/* A short "why this?" line: the traits doing the work, then the context. */
export function why(m, it, sc, opts) {
  const o = opts || {}, bits = [];
  for (const [t, v] of sc.parts) {
    if (v <= 0.05 || bits.length >= 3) break;
    if (t.startsWith("s:") || t.startsWith("d:") || t.startsWith("p:low")) continue;
    bits.push(label(t, o.brands));
  }
  const like = o.lovedLike && o.lovedLike(it);
  if (like) bits.push(`like the ${like} you loved`);
  if (sc.adj.some(a => a[0] === "gap")) bits.push(o.gapLabel ? `fills ${o.gapLabel}` : "fills a gap");
  if (it.disc >= 10) bits.push(`${it.disc}% off`);
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ the feed */
function rngFrom(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}

/* Rank everything you could see. Returns [{it, sc, wildcard, note}] in display order, plus the hidden ones. */
export function rank(m, items, ctx) {
  const c = ctx || {}, today = c.today || new Date().toISOString().slice(0, 10);
  const seen = new Set(), visible = [], hidden = [];
  for (const it of items) {
    if (!it || !it.key || seen.has(it.key)) continue;
    seen.add(it.key);
    if (it.inStock === false) { hidden.push({it, why: "sold-out"}); continue; }
    const h = hiddenWhy(m, it);
    if (h) { hidden.push({it, why: h}); continue; }
    if (!c.ignoreCooldown && cooling(m, it, today)) { hidden.push({it, why: "cooldown"}); continue; }
    visible.push({it, sc: score(m, it, Object.assign({today}, c))});
  }
  // Greedy diversity: the best next piece, discounted when the last few shared its role, brand or colour.
  const pool = visible.slice().sort((a, b) => b.sc.s - a.sc.s);
  const out = [], explore = Math.max(0, Math.min(0.5, m.explore || 0)), every = explore ? Math.max(2, Math.round(1 / explore)) : 0;
  const rnd = rngFrom(c.seed || today);
  const used = new Set();
  const colourOfIt = it => (it.traits.find(t => t.startsWith("c:")) || "");
  const brandOfIt = it => (it.traits.find(t => t.startsWith("b:")) || "");
  while (out.length < pool.length) {
    const pos = out.length;
    let choice = null, wildcard = false;
    if (every && pos % every === every - 1) {
      // Wildcard: the least-known piece that isn't something you'd clearly dislike.
      let best = null;
      for (const v of pool) {
        if (used.has(v.it.key) || v.sc.s < -0.7) continue;
        const u = (1 - v.sc.certainty) * (1 + 0.15 * v.sc.s) + rnd() * 0.25;
        if (!best || u > best.u) best = {v, u};
      }
      if (best && best.v.sc.certainty < 0.6) { choice = best.v; wildcard = true; }
    }
    if (!choice) {
      let best = null;
      const recent = out.slice(-4);
      for (const v of pool) {
        if (used.has(v.it.key)) continue;
        let pen = 0;
        for (const r of recent) {
          if (r.it.role === v.it.role) pen += 0.45;
          if (brandOfIt(r.it) === brandOfIt(v.it)) pen += 0.3;
          if (colourOfIt(r.it) === colourOfIt(v.it)) pen += 0.15;
        }
        const val = v.sc.s - pen;
        if (!best || val > best.val) best = {v, val};
        if (best && v.sc.s < best.val - 3) break; // sorted: nothing further can win
      }
      choice = best && best.v;
    }
    if (!choice) break;
    used.add(choice.it.key);
    out.push({it: choice.it, sc: choice.sc, wildcard, note: wildcard ? wildcardNote(m, choice.it, c.brands) : ""});
  }
  return {list: out, hidden};
}

/* "Testing: rust knits" — names the least-known traits so you know what a tap will teach. */
export function wildcardNote(m, it, brands) {
  const unknown = it.traits.filter(t => /^(c|x|f|st|b|r):/.test(t) && t !== "x:plain")
    .map(t => [t, m.n[t] || 0]).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([t]) => label(t, brands).toLowerCase());
  return unknown.length ? `Testing ${unknown.join(" + ")}` : "Testing something new";
}

/* ------------------------------------------------------------------ train deck */
/* A deck of n cards for the Train tab: mostly pieces the model is unsure about, some it thinks you'll like,
   and a duel (two similar pieces, pick one) now and then. */
export function trainDeck(m, items, ctx, n = 20, duelEvery = 6) {
  const c = ctx || {}, rnd = rngFrom((c.seed || "") + (c.today || ""));
  const cand = [];
  const seen = new Set();
  for (const it of items) {
    if (!it || seen.has(it.key) || !it.image) continue;
    seen.add(it.key);
    if (it.inStock === false || hiddenWhy(m, it)) continue;
    const e = m.entries[it.key];
    if (reacted(e)) continue;
    const sc = score(m, it, c);
    if (sc.s < -0.8) continue; // something your brief or taps already rule out isn't worth a swipe
    cand.push({it, sc, u: (1 - sc.certainty) + rnd() * 0.3});
  }
  const unsure = cand.slice().sort((a, b) => b.u - a.u);
  const likely = cand.slice().sort((a, b) => b.sc.s - a.sc.s);
  const deck = [], used = new Set();
  const take = list => { for (const x of list) if (!used.has(x.it.key)) { used.add(x.it.key); return x; } return null; };
  while (deck.length < n && used.size < cand.length) {
    const pos = deck.length;
    if (duelEvery && pos % duelEvery === duelEvery - 1) {
      const a = take(likely);
      if (a) {
        let b = null;
        for (const x of likely) if (!used.has(x.it.key) && x.it.role === a.it.role && Math.abs(x.sc.s - a.sc.s) < 1.2) { b = x; break; }
        if (b) { used.add(b.it.key); deck.push({duel: [a, b]}); continue; }
        deck.push({card: a});
        continue;
      }
    }
    const pick = rnd() < 0.65 ? take(unsure) : take(likely);
    if (!pick) break;
    deck.push({card: pick});
  }
  return deck;
}

/* ------------------------------------------------------------------ profile summary */
export function summary(m, brands, limit = 12) {
  const all = new Set([...Object.keys(m.prior), ...Object.keys(m.aff), ...Object.keys(m.soft), ...Object.keys(m.pins)]);
  const rows = [];
  for (const t of all) {
    if (/^(s|d|p):/.test(t)) continue;
    const v = affinity(m, t);
    if (Math.abs(v) < 0.25) continue;
    rows.push({t, label: label(t, brands), v: Math.round(v * 100) / 100, learned: Math.round((m.aff[t] || 0) * 100) / 100,
      n: Math.round((m.n[t] || 0) * 10) / 10, pinned: m.pins[t] != null});
  }
  const likes = rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v).slice(0, limit);
  const dislikes = rows.filter(r => r.v < 0).sort((a, b) => a.v - b.v).slice(0, limit);
  const hard = Object.entries(m.hard).map(([t, why]) => ({t, label: label(t, brands), why}));
  return {likes, dislikes, hard};
}

/* The compact copy of a piece that travels with a reaction, so it keeps teaching after the piece leaves the pool. */
export function snapshot(it) {
  return {b: (it.brand || "").slice(0, 60), n: (it.name || "").slice(0, 120), r: it.role || null, u: it.url, i: it.image || null,
    p: it.price ?? null, tr: it.traits.slice(0, 40)};
}

/* ------------------------------------------------------------------ outfits */
/* Which roles would fill a missing slot in your outfit formulas, and how many of each role you own.
   ownedPieces: [{role}] (watch-list pieces you bought, staples you ticked, pieces you marked bought). */
export function outfitGaps(formulas, ownedPieces) {
  const owned = {};
  for (const p of ownedPieces || []) if (p && p.role) owned[p.role] = (owned[p.role] || 0) + 1;
  const gapRoles = new Set(), gaps = [];
  let ready = 0;
  for (const f of formulas || []) {
    const missing = (f.slots || []).filter(sl => !(sl.roles || []).some(r => owned[r]));
    if (!missing.length) ready++;
    for (const sl of missing) { for (const r of sl.roles || []) gapRoles.add(r); gaps.push({outfit: f.name, label: sl.label, roles: sl.roles}); }
  }
  return {gapRoles, owned, ready, total: (formulas || []).length, gaps};
}

/* Everything the page and the review build from the published files: watch list, approved deals, picks, pool. */
export function allItems(data, finds, pool) {
  const out = [];
  for (const x of (data && data.items) || []) out.push(normItem(x, "watch"));
  for (const x of (finds && finds.picks) || []) out.push(normItem(x, "pick"));
  for (const x of (finds && finds.finds) || []) out.push(normItem(x, "find"));
  for (const x of (pool && pool.items) || []) out.push(normItem(x, "pool"));
  return out;
}

/* Brand slug -> display name, for labels. */
export function brandNames(items) {
  const m = {};
  for (const it of items) { const b = brandSlug(it.brand || it.store); if (b && !m[b]) m[b] = (it.brand || it.store || "").replace(/[®™]/g, ""); }
  return m;
}

/* ------------------------------------------------------------------ settings */
/* Settings sync as patches ("owned.s3": 1, "pins.c:olive": null, "explore": 0.33) applied to the account's copy, so a
   change on one device never overwrites a different change made on another. null removes a key. */
export const CFG_MAPS = ["owned", "pins", "counts", "caps"];
export const CFG_KEYS = ["explore", "theme", "reach", "resetAt", "rules"];
export function cfgDiff(a, b) {
  const p = {}, x0 = a || {}, y0 = b || {};
  for (const k of CFG_KEYS) if (JSON.stringify(x0[k] ?? null) !== JSON.stringify(y0[k] ?? null)) p[k] = y0[k] ?? null;
  for (const m of CFG_MAPS) {
    const x = x0[m] || {}, y = y0[m] || {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) p[m + "." + k] = y[k] === undefined ? null : y[k];
  }
  return p;
}
export function applyCfgPatch(c, p) {
  const out = JSON.parse(JSON.stringify(c || {}));
  for (const [path, v] of Object.entries(p || {})) {
    const i = path.indexOf(".");
    if (i < 0) { out[path] = v; continue; }
    const m = path.slice(0, i), k = path.slice(i + 1);
    if (!CFG_MAPS.includes(m)) continue;
    out[m] = out[m] && typeof out[m] === "object" ? out[m] : {};
    if (v === null) delete out[m][k]; else out[m][k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ reactions */
const EXPLICIT = ["s", "more", "save", "pricey", "own", "bought", "why"];
const COUNTERS = ["wins", "losses", "open", "view", "shownTotal"];
/* Merge two copies of one entry (this device's and the server's): the reaction from whichever was set later
   (et = when it was set), counters as the larger of the two, the latest shown-state, the newest snapshot. */
export function mergeEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ea = Date.parse(a.et || 0) || 0, eb = Date.parse(b.et || 0) || 0;
  const src = eb > ea ? b : a, out = {};
  for (const k of EXPLICIT) if (src[k] !== undefined) out[k] = src[k];
  if (src.et) out.et = src.et;
  for (const k of COUNTERS) { const v = Math.max(a[k] || 0, b[k] || 0); if (v) out[k] = v; }
  if (a.linger || b.linger) out.linger = 1;
  const sa = a.sd || "", sb = b.sd || "";
  const sh = sb > sa ? b : a;
  for (const k of ["sd", "shown", "cool", "lp"]) if (sh[k] !== undefined) out[k] = sh[k];
  out.f = (Date.parse(b.t || 0) > Date.parse(a.t || 0) ? b.f || a.f : a.f || b.f);
  if (!out.f) delete out.f;
  out.t = Date.parse(b.t || 0) > Date.parse(a.t || 0) ? b.t : a.t;
  return out;
}

/* Pieces most like this one: shared traits (colour, texture, fabric, style, brand), same kind first. */
export function similar(it, items, n = 8) {
  const mine = new Set(it.traits.filter(t => !/^(s|d|p|sea):/.test(t)));
  const out = [];
  for (const o of items) {
    if (!o || o.key === it.key || o.inStock === false) continue;
    let shared = 0, total = mine.size;
    for (const t of o.traits) {
      if (/^(s|d|p|sea):/.test(t)) continue;
      if (mine.has(t)) shared += (G[groupOf(t)] ?? 0.3); else total += 0.3;
    }
    if (!shared) continue;
    out.push([o, shared / (total || 1) + (o.role === it.role ? 0.5 : 0)]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}
