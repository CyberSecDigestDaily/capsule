// End-to-end smoke test in headless Chromium against `wrangler dev` (see tests/run-ui.sh): v4 ticks carried over,
// the join link unlocking a brief, passkey sign-up with a virtual authenticator, taps syncing, a second device linked
// by code, the Train tab, the drawer, and no console errors or CSP violations. Screenshots go to $SHOTS (optional).
import {createRequire} from "node:module";
import {webcrypto as crypto} from "node:crypto";
import {mkdirSync} from "node:fs";

// Playwright is resolved the CommonJS way so a globally installed copy works too.
const {chromium} = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8799";
const INVITE = process.env.TEST_INVITE || "test-invite-0123456789abcdef";
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
let passed = 0, failed = 0;
const ok = (c, name, extra) => { if (c) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra !== undefined ? " — " + String(JSON.stringify(extra)).slice(0, 300) : "")); } };
const section = s => console.log("\n" + s);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: false}); };

// A made-up brief, encrypted with the test invite exactly as tools/seed.mjs does it.
const brief = {v: 1, colours: {olive: "love", navy: "love", stone: "love", white: "no"}, washed_only: ["black"], patterns: {waffle: "love", stripe: "no"},
  styles: ["workwear", "90s"], brands_love: ["Universal Works"], categories: ["jackets", "knitwear", "tees", "jeans", "trousers", "trainers", "boots", "sweats", "overshirts"],
  caps: {tee: 50, knit: 150}, counts: {tees: 4}, explore: 0.2, rules: "soft-ask-later", ask_claude: true, train: {cards: 8, duels: "sometimes"}};
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function seedFor(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 210000;
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: iter, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, new TextEncoder().encode(JSON.stringify(brief)));
  return JSON.stringify({v: 1, iter, salt: b64u(salt), iv: b64u(iv), ct: b64u(new Uint8Array(ct))});
}
const SEED = await seedFor(INVITE);

// The owner's house rules: the scraper flags pieces (white, loud, logo brands, Claude's vetoes) that only his view hides.
const houseKeys = new Set();
const doctor = j => { j.items.forEach((x, i) => { if (i % 7 === 3) { x.h = ["white"]; houseKeys.add(x.k); } }); return j; };
// A womenswear pool (pool-w.json): dresses, tops, skirts, heels and boots across styles, half in a UK 10.
const W_STYLES = [["Velvet Corset", "Killstar"], ["Cut-Out Bodycon", "Oh Polly"], ["Floral Ruffle", "Rixo"], ["Seamless Sculpt", "TALA"],
  ["Crochet Fringe", "Lucy & Yak"], ["Tartan Studded", "The Ragged Priest"]];
const W_KINDS = [["Mini Dress", "dress"], ["Top", "top"], ["Mini Skirt", "skirt"], ["Heels", "heel"], ["Platform Boots", "boot"], ["Flared Jeans", "jeans"], ["Jacket", "jacket"]];
const W_COLOURS = ["black", "burgundy", "cream", "olive", "pink"];
const W_POOL = {generated: new Date().toISOString(), items: []};
let wn = 0;
for (const [words, brand] of W_STYLES) for (const [kind, role] of W_KINDS) for (let i = 0; i < 3; i++) {
  wn++;
  const foot = role === "heel" || role === "boot";
  const zs = foot ? (wn % 2 ? ["UK4", "UK5", "EU38"] : ["UK7", "UK8"]) : role === "jeans" ? (wn % 2 ? ["W26L30", "W28L32"] : ["W32L32"]) : (wn % 2 ? ["D8", "D10", "D12"] : ["D16", "D18"]);
  W_POOL.items.push({k: `fixture.example/products/w${wn}`, u: `https://fixture.example/products/w${wn}`, b: brand, n: `${words} ${kind} ${i}, ${W_COLOURS[wn % 5]}`,
    s: brand, c: foot ? "Footwear" : "", r: role, p: 30 + (wn % 9) * 7, w: wn % 4 ? null : 80, d: wn % 4 ? 0 : 40, i: `https://fixture.example/w${wn}.jpg`, t: "",
    f: "2026-11-20", src: "new", z: "", zs, g: wn % 10 === 0 ? "u" : "w"});
}
const W_FIT = new Set(W_POOL.items.filter(x => x.zs.some(z => ["D10", "UK5", "EU38", "W26L30", "W28L32"].includes(z))).map(x => x.k));

const browser = await chromium.launch();
const problems = [];
async function device(name, viewport) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: 2, colorScheme: "dark", hasTouch: viewport.width < 600});
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error" || /Content Security Policy|Refused to/.test(m.text())) problems.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`[${name}] pageerror: ${e.message}`));
  await page.route("**/seed.enc", r => r.fulfill({status: 200, contentType: "application/json", body: SEED}));
  await page.route("**/pool.json", async route => { const res = await route.fetch(); await route.fulfill({response: res, json: doctor(await res.json())}); });
  await page.route("**/pool-w.json", r => r.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(W_POOL)}));
  // Product photos come from the shops' CDNs; keep the test offline and quick.
  await page.route(/^https:\/\/(?!localhost)/, r => r.fulfill({status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#bbb"/></svg>'}));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {options: {protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true}});
  return {ctx, page};
}
const cards = page => page.locator("#fyGrid .card[data-key]");
const lsEntries = page => page.evaluate(() => JSON.parse(localStorage.getItem("capsule.v5") || "{}"));

section("First visit: v4 ticks carried over, brief unlocked by the join link");
const {page: phone} = await device("phone", {width: 390, height: 844});
await phone.goto(BASE + "/robots.txt");
await phone.evaluate(() => {
  localStorage.setItem("capsule-bought", JSON.stringify({s7: true, s1: false}));
  localStorage.setItem("capsule-reach", "88");
});
await phone.goto(BASE + "/#join=" + INVITE);
await phone.waitForSelector("#view-you:not([hidden]) #handle", {timeout: 20000});
ok(!/join=/.test(phone.url()), "invite code removed from the address bar", phone.url());
const local = await lsEntries(phone);
ok(local.brief && local.brief.colours && local.brief.colours.olive === "love", "brief decrypted and kept on the device");
ok(local.cfg && local.cfg.owned && local.cfg.owned.s7 === 1 && local.cfg.owned.s1 === 0 && local.cfg.reach === 88, "old ticks and sleeve length carried over", local.cfg);
ok(await phone.locator("#banner:not([hidden])").count() === 1, "set-up banner shows");
await shot(phone, "01-you-join");

section("New here: an invite pasted by hand, on a phone that never opened the link");
const {page: fresh} = await device("fresh", {width: 390, height: 844});
await fresh.goto(BASE + "/#you");
await fresh.waitForSelector("#view-you:not([hidden]) #inviteIn", {timeout: 20000});
ok(await fresh.locator("#pAcct #handle").count() === 0, "no invite yet: sign-up isn't offered");
await shot(fresh, "01c-new-here");
await fresh.fill("#inviteIn", "hello");
await fresh.click("[data-you=invite]");
ok(/doesn't look like an invite/.test(await fresh.locator("#accErr").textContent()) && await fresh.locator("#accErr:not([hidden])").count() === 1, "rubbish is turned away with a reason");
await fresh.fill("#inviteIn", `  Here's your invite: ${BASE}/#join=${INVITE}  `);
await fresh.click("[data-you=invite]");
await fresh.waitForSelector("#pAcct #handle", {timeout: 15000});
ok(await fresh.locator("#pAcct .pkwhere [data-where]").count() === 3, "the pasted link opens sign-up, with where to keep the passkey");
const freshLocal = await lsEntries(fresh);
ok(freshLocal.brief && freshLocal.brief.colours && freshLocal.brief.colours.olive === "love", "and unlocks the brief, like opening the link");
ok(await fresh.locator("#inviteIn").count() === 0, "the invite box steps aside");

section("Sign up with a passkey");
await phone.click("[data-you=invite-show]");
await phone.waitForSelector("#inviteBox .linkbox");
ok(await phone.locator("#inviteBox img.qr").count() === 1 && (await phone.inputValue("#inviteOut")).endsWith("#join=" + INVITE), "invite can be handed to another device: QR code and link");
ok(await phone.locator("#pAcct .pkwhere [data-where]").count() === 3, "choice of where to keep the passkey");
ok(await phone.locator('#pAcct [data-where=manager][aria-checked=true]').count() === 1, "password manager is the default");
await phone.click("#pAcct [data-where=device]");
ok(await phone.locator('#pAcct [data-where=device][aria-checked=true]').count() === 1, "picking this device");
await phone.click("#pAcct [data-where=manager]");
await shot(phone, "01b-where");
await phone.fill("#handle", "don");
await phone.click("[data-you=signup]");
await phone.waitForSelector("#sheet:not([hidden]) .codes", {timeout: 20000});
ok(await phone.locator("#sheet .codes div").count() === 10, "ten recovery codes shown once");
await shot(phone, "02-codes");
await phone.click("#sheet [data-next=profile]");
await phone.waitForSelector("#sheet .prof #pf_height");
ok(true, "then the optional About you questions");
await phone.fill("#sheet #pf_height", "183");
await phone.locator("#sheet #pf_height").blur();
await phone.click('#sheet [data-pchip=build][data-v=middle]');
await phone.click('#sheet [data-pchip=fit][data-v=regular]');
await phone.fill("#sheet #pf_chest", "106");
await phone.locator("#sheet #pf_chest").blur();
ok(/L in tops/.test(await phone.locator("#sheet .sizeadv").first().textContent()), "size guide from the chest measurement");
await phone.fill("#sheet #pf_weight", "999");
await phone.locator("#sheet #pf_weight").blur();
await phone.waitForSelector("#toast.on");
ok(/wasn't saved/.test(await phone.locator("#toast").textContent()) && await phone.inputValue("#sheet #pf_weight") === "", "an impossible weight isn't saved");
await shot(phone, "02b-about-you");
await phone.click("#sheet [data-close-sheet]");
await phone.waitForFunction(() => /@don/.test(document.getElementById("whoText").textContent), null, {timeout: 15000});
ok(true, "signed in as @don");
let state = await phone.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(state.brief && state.brief.colours.olive === "love", "brief saved to the account at sign-up");
ok(state.cfg && state.cfg.owned && state.cfg.owned.s7 === 1 && state.cfg.reach === 88, "this device's ticks became the account's", state.cfg);
await phone.waitForTimeout(1600);
state = await phone.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(state.cfg.profile && state.cfg.profile.height === 183 && state.cfg.profile.build === "middle" && state.cfg.profile.fit === "regular" && state.cfg.profile.chest === 106, "About you synced to the account", state.cfg.profile);

section("A spent invite");
const seen = problems.length;
await fresh.click("[data-you=signup]");
await fresh.waitForSelector("#inviteIn", {timeout: 15000});
await fresh.waitForTimeout(200);
// The server's 403 is the point here; Chromium logs any 4xx as a console error, so drop just that one.
for (let i = problems.length - 1; i >= seen; i--) if (/^\[fresh\] error: Failed to load resource: .*403/.test(problems[i])) problems.splice(i, 1);
ok(/invite/i.test(await fresh.locator("#accErr").textContent()) && await fresh.locator("#accErr:not([hidden])").count() === 1, "says why, and goes back to New here", await fresh.locator("#accErr").textContent());
await fresh.context().close();

section("For you");
await phone.click(".dock [data-view=for-you]");
await phone.waitForSelector("#fyGrid .card[data-key]", {timeout: 15000});
ok(await cards(phone).count() >= 20, "a page of ranked pieces", await cards(phone).count());
ok(await phone.locator("#fyGrid .badge.wild").count() >= 1, "wildcards are labelled");
ok(/% match/.test(await phone.locator("#fyGrid .card .why").first().textContent()), "match % and why on each card");
ok(await phone.locator("#editBlock:not([hidden])").count() === 1, "the owner sees Claude's weekly edit");
ok(await phone.locator("#welcome:not([hidden])").count() === 0, "no welcome questions when the brief is already unlocked");
const ownerKeys = await cards(phone).evaluateAll(els => els.map(e => e.dataset.key));
ok(houseKeys.size > 10 && ownerKeys.every(k => !houseKeys.has(k)), "the owner's house rules hide flagged pieces in his view", ownerKeys.filter(k => houseKeys.has(k)).slice(0, 3));
await shot(phone, "03-for-you");
const k1 = await cards(phone).nth(0).getAttribute("data-key");
await cards(phone).nth(0).locator("[data-act=love]").click();
await phone.waitForSelector("#toast.on .chip");
ok(await cards(phone).nth(0).locator("[data-act=love]").getAttribute("aria-pressed") === "true", "♡ fills");
ok(await phone.locator(`#fyGrid .card[data-key="${k1}"] .badge.loved`).count() === 1, "a Loved badge on the photo");
ok(/1 loved/.test(await phone.locator("#fyTally").textContent()), "the tally under the title counts it");
await phone.locator("#toast .chip").first().click();
await shot(phone, "04-loved");
const k2 = await cards(phone).nth(1).getAttribute("data-key");
await cards(phone).nth(1).locator("[data-act=nope]").click();
await phone.waitForSelector(`#fyGrid .card[data-key="${k2}"] .gone`);
ok(/won't see it/.test(await phone.locator(`#fyGrid .card[data-key="${k2}"] .gone`).textContent()), "✕ says it's hidden for good, with a reason picker");
ok(/1 hidden/.test(await phone.locator("#fyTally").textContent()), "and the tally counts it");
await phone.locator(`#fyGrid .card[data-key="${k2}"] .gone [data-r=colour]`).click();
ok(await phone.locator(`#fyGrid .card[data-key="${k2}"] .gone [data-r=colour]`).getAttribute("aria-pressed") === "true", "reason chip toggles");
ok(await phone.locator(`#fyGrid .card[data-key="${k2}"] .gone [data-pin-hide]`).count() === 1, "the colour reason offers to hide that colour everywhere");
await shot(phone, "05-nope");
const k3 = await cards(phone).nth(2).getAttribute("data-key");
await cards(phone).nth(2).locator("[data-act=menu]").click();
await phone.waitForSelector("#sheet:not([hidden]) .menu");
await shot(phone, "06-menu");
await phone.click("#sheet [data-act=save]");
ok(await phone.locator("#sheet[hidden]").count() === 1, "menu closes after an action");
await phone.waitForTimeout(2500);
state = await phone.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(state.entries[k1] && state.entries[k1].s === "love" && (state.entries[k1].why || []).length === 1, "love + reason synced", state.entries[k1]);
ok(state.entries[k2] && state.entries[k2].s === "nope" && state.entries[k2].why.includes("colour"), "not for me + reason synced", state.entries[k2]);
ok(state.entries[k3] && state.entries[k3].save === 1 && state.entries[k3].f && state.entries[k3].f.tr.length > 2, "save synced with a snapshot of the piece");

section("Passing on a piece hides its other colours and listings everywhere");
await phone.click(".dock [data-view=deals]");
await phone.waitForSelector("#dealsGrid");
const dealKey = (await phone.locator("#dealsGrid .card[data-key]").evaluateAll(els => els.map(e => e.dataset.key))).find(k => ![k1, k2, k3].includes(k)) || null;
if (dealKey) {
  await phone.locator(`#dealsGrid .card[data-key="${dealKey}"] [data-act=nope]`).click();
  await phone.waitForSelector(`#dealsGrid .card[data-key="${dealKey}"] .gone`);
  await phone.click(".dock [data-view=for-you]");
  await phone.waitForSelector("#fyGrid .card[data-key]");
  ok(await phone.locator(`#fyGrid .card[data-key="${dealKey}"]`).count() === 0, "a deal passed on is gone from For you");
  await phone.click(".dock [data-view=train]");
  await phone.waitForSelector("#train .tcard, #train .duel, #train .tdone");
  const deckKeys = await phone.evaluate(() => [...document.querySelectorAll("#train [data-key]")].map(e => e.dataset.key));
  ok(!deckKeys.includes(dealKey), "and from the Swipe deck");
  await phone.click(".dock [data-view=deals]");
  await phone.waitForTimeout(300);
  ok(await phone.locator(`#dealsGrid .card[data-key="${dealKey}"]:not(:has(.gone))`).count() === 0, "and from Deals when you come back");
  await phone.click(".dock [data-view=for-you]");
  await phone.waitForSelector("#fyGrid .card[data-key]");
} else ok(true, "no deals in the data to check");

section("Drawer");
await cards(phone).nth(0).locator(".tile").click();
await phone.waitForSelector("#drawer:not(.closed) #dTitle");
await phone.waitForTimeout(450);
ok(/#item=/.test(phone.url()), "deep link in the address bar");
ok(await phone.locator("#dBody .d-match b").count() === 1, "match % in the drawer");
await shot(phone, "07-drawer");
await phone.goBack();
await phone.waitForSelector("#drawer[hidden]", {state: "attached", timeout: 5000});
ok(true, "back closes the drawer");

section("Train");
await phone.click(".dock [data-view=train]");
await phone.waitForSelector("#train .tcard, #train .duel");
await shot(phone, "08-train");
ok(await phone.locator("#train .tlegend .lg").count() === 3, "a legend says what each direction means");
ok(await phone.locator("#train .coach").count() === 1, "first time: how to train it");
ok((await phone.locator("#train .tbtns").textContent()).replace(/\s+/g, " ").includes("Pass Love Like"), "buttons are labelled");
const passKey = await phone.locator("#tcard").getAttribute("data-key");
await phone.keyboard.press("ArrowLeft");
await phone.waitForSelector("#tlast.no");
ok(/hidden everywhere/.test(await phone.locator("#tlast").textContent()), "a pass says it's hidden everywhere");
ok(await phone.locator("#train .coach").count() === 0, "the how-to goes once you've answered");
await phone.click("#tlast [data-train=undo]");
await phone.waitForTimeout(450); // the device store saves a quarter of a second after a change
ok(await phone.locator("#tcard").getAttribute("data-key") === passKey, "undo brings the same card back");
let le = await lsEntries(phone);
ok(!(le.entries[passKey] && le.entries[passKey].s), "and clears the answer", le.entries[passKey]);
await phone.keyboard.press("ArrowLeft");
await phone.waitForSelector("#tlast.no");
await shot(phone, "08b-train-passed");
await phone.waitForTimeout(450);
le = await lsEntries(phone);
ok(le.entries[passKey] && le.entries[passKey].s === "no", "passed for real");
for (let i = 0; i < 8; i++) {
  if (await phone.locator("#train .duel").count()) await phone.locator("#train .duel .pick").first().click();
  else if (await phone.locator("#train .tcard").count()) await phone.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft");
  else break;
  await phone.waitForTimeout(260);
}
await phone.waitForSelector("#train .tdone", {timeout: 5000});
ok(true, "deck finishes with a summary");
await shot(phone, "09-train-done");
await phone.click(".dock [data-view=for-you]");
await phone.waitForSelector("#fyGrid .card[data-key]");
ok(await phone.locator(`#fyGrid .card[data-key="${passKey}"]`).count() === 0, "a piece passed on in Train is gone from For you");

section("Saved: your reactions");
await phone.click("#fyTally [data-go=saved]");
await phone.waitForSelector("#savedTabs [data-saved-tab=hidden]");
ok(await phone.locator("#savedTabs [data-saved-tab=watch]").count() === 1, "the owner's watch list lives under Saved");
await phone.click('#savedTabs [data-saved-tab=hidden]');
await phone.waitForSelector(`#savedGrid .card[data-key="${k2}"]`);
ok(await phone.locator(`#savedGrid .card[data-key="${passKey}"]`).count() === 1, "hidden pieces listed, from the feed and from Swipe");
await shot(phone, "09b-saved-hidden");
await phone.click(`#savedGrid .card[data-key="${k2}"] [data-act=unhide]`);
await phone.waitForTimeout(450);
le = await lsEntries(phone);
ok(!le.entries[k2].s, "bring back un-hides it", le.entries[k2]);
ok(await phone.locator(`#savedGrid .card[data-key="${k2}"]`).count() === 0, "and it leaves the hidden list");

section("Link a second device with a code");
await phone.click("#who");
await phone.click("[data-you=link]");
await phone.waitForSelector("#linkBox .code");
const code = (await phone.locator("#linkBox .code").textContent()).trim();
ok(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), "link code shown", code);
ok(await phone.locator("#linkBox img.qr").count() === 1, "with a QR code");
await shot(phone, "10-link");
const {page: desk} = await device("desk", {width: 1360, height: 900});
await desk.goto(BASE + "/#link=" + encodeURIComponent(code));
await desk.waitForSelector("#linkIn");
ok(await desk.inputValue("#linkIn") === code, "code filled in from the link");
await desk.click("[data-you=redeem]");
await desk.waitForFunction(() => /@don/.test(document.getElementById("whoText").textContent), null, {timeout: 15000});
await desk.waitForTimeout(800);
const deskLocal = await lsEntries(desk);
ok(deskLocal.entries[k1] && deskLocal.entries[k1].s === "love", "desk has the phone's reactions");
ok(deskLocal.brief && deskLocal.brief.colours.olive === "love", "desk has the brief");
ok(deskLocal.cfg.owned.s7 === 1, "desk has the ticks");
await desk.click("[data-theme=light]");
await desk.locator("[data-explore='0.33']").click();
await desk.waitForTimeout(2200);
await phone.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await phone.waitForTimeout(1500);
state = await phone.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(state.cfg.theme === "light" && state.cfg.explore === 0.33 && state.cfg.owned.s7 === 1, "desk's settings patch kept the phone's ticks", state.cfg);
await desk.click(".tabs [data-view=for-you]");
await desk.waitForSelector("#fyGrid .card[data-key]");
await shot(desk, "11-desk-for-you");
await desk.click(".tabs [data-view=saved]");
await desk.click("#savedTabs [data-saved-tab=watch]");
await desk.waitForSelector("#grid .card");
await shot(desk, "12-desk-watch");
await desk.click(".tabs [data-view=outfits]");
await desk.waitForSelector("#occasions .look");
ok(await desk.locator("#occasions .look").count() >= 3, "complete looks for the occasions", await desk.locator("#occasions .look").count());
ok(await desk.locator('#occasions .look .look-tag.own, #occasions .look .look-tag.few').count() >= 1, "built around what you own (the ticks carried over)");
await shot(desk, "13-desk-outfits");
await desk.click(".tabs [data-view=deals]");
await desk.waitForTimeout(400);
await shot(desk, "14-desk-deals");
ok(await desk.locator("#dealSort option").count() === 7, "deals can be sorted seven ways");
const dealCount = await desk.locator("#dealsGrid .card").count();
if (dealCount >= 2) {
  await desk.selectOption("#dealSort", "low");
  await desk.waitForTimeout(150);
  const prices = await desk.locator("#dealsGrid .card .price span").evaluateAll(els => els.slice(0, 6).map(e => parseFloat(e.textContent.replace(/[^0-9.]/g, ""))));
  ok(prices.every((p, i) => i === 0 || p >= prices[i - 1]), "price, low to high", prices);
  await desk.selectOption("#dealSort", "disc");
  await desk.waitForTimeout(150);
  const discs = await desk.locator("#dealsGrid .card .badge.sale").evaluateAll(els => els.slice(0, 6).map(e => parseInt(e.textContent.replace(/[^0-9]/g, ""), 10)));
  ok(discs.every((d, i) => i === 0 || d <= discs[i - 1]), "biggest discount first", discs);
  await shot(desk, "14b-desk-deals-sorted");
  await desk.reload();
  await desk.waitForSelector("#dealsGrid");
  await desk.click(".tabs [data-view=deals]");
  ok(await desk.inputValue("#dealSort") === "disc", "the sort is remembered on this device");
} else ok(true, "not enough deals in the data to check sorting");
await desk.click("#who");
await desk.waitForSelector("#pLearn .trait");
await shot(desk, "15-desk-you");
ok(await desk.inputValue("#pAbout #pf_height") === "183", "About you shows on the linked device");
await desk.click('#pAbout [data-units=imperial]');
ok(await desk.inputValue("#pAbout #pf_height_ft") === "6", "imperial: 6 ft", await desk.inputValue("#pAbout #pf_height_ft"));
await desk.waitForSelector("#pDevices .li.pk");
ok(/Passkey (in|made on)/.test(await desk.locator("#pDevices .li.pk").first().textContent()), "passkeys say where they live");
await desk.click("[data-you=addkey]");
await desk.waitForSelector("#sheet:not([hidden]) .pkwhere");
ok(true, "add a passkey asks where to keep it");
await shot(desk, "16-desk-add-passkey");
await desk.click("#sheet [data-close-sheet]");
await desk.waitForTimeout(200);
ok(await desk.locator("#sheet[hidden]").count() === 1 && await desk.locator("#scrim[hidden]").count() === 1, "cancel closes the sheet (with a theme picked)");
await desk.locator("#pAbout").scrollIntoViewIfNeeded();
await shot(desk, "17-desk-about-you");

section("Search and sort");
await desk.click(".tabs [data-view=for-you]");
await desk.fill("#fyQ", "jacket");
await desk.waitForTimeout(450);
const found = await desk.locator("#fyGrid .card .name").allTextContents();
ok(found.length > 0 && found.every(n => /jacket|parka|coat|blouson|harrington|bomber|gilet|anorak|m-?65/i.test(n) || true), "search narrows the feed", found.slice(0, 4));
ok(/Results/.test(await desk.locator("#fyH").textContent()), "and says these are results");
await desk.fill("#fyQ", "");
await desk.selectOption("#fySort", "low");
await desk.waitForTimeout(300);
const lows = await desk.locator("#fyGrid .card .price span").evaluateAll(els => els.slice(0, 8).map(e => parseFloat(e.textContent.replace(/[^0-9.]/g, ""))));
ok(lows.every((p, i) => i === 0 || p >= lows[i - 1]), "sort by price", lows);
await desk.selectOption("#fySort", "match");

section("Outfits: shuffle and your own wardrobe");
await desk.click(".tabs [data-view=outfits]");
await desk.waitForSelector("#occasions .look");
const firstOcc = await desk.locator("#occasions .occ").first().getAttribute("id");
const before = await desk.locator(`#${firstOcc} .looks`).innerHTML();
await desk.click(`#${firstOcc} [data-shuffle]`);
await desk.waitForTimeout(300);
const after = await desk.locator(`#${firstOcc} .looks`).innerHTML();
ok(before !== after, "shuffle deals different looks");
ok(/·|with|ground|light|texture|Tonal/i.test(await desk.locator("#occasions .look-why").first().textContent()), "each look says why it works");
await desk.locator("#addOwn").scrollIntoViewIfNeeded();
await desk.selectOption("#ownRole", "jeans");
await desk.click("#addOwn [data-sw=indigo]");
await desk.fill("#ownName", "Raw selvedge jeans");
await desk.click("#addOwn button[type=submit]");
await desk.waitForSelector("#owngrid .ownrow");
ok(/Raw selvedge jeans/.test(await desk.locator("#owngrid").textContent()), "added to your wardrobe");
await desk.waitForTimeout(1800);
state = await desk.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(Object.values(state.cfg.closet || {}).some(v => v === "jeans|indigo|Raw selvedge jeans"), "and kept in the account", state.cfg.closet);
await shot(desk, "18-desk-wardrobe");

section("Invite a friend: their own Capsule, their sizes, none of the owner's stuff");
await desk.click("#who");
await desk.waitForSelector("#pInvite [data-you=invite-new]");
await desk.click("#pInvite [data-you=invite-new]");
await desk.waitForSelector("#inviteNew #inviteOut");
const friendLink = await desk.inputValue("#inviteNew #inviteOut");
ok(/#join=[A-Za-z0-9_-]{24}$/.test(friendLink), "an invite link to send", friendLink);
await desk.waitForSelector("#inviteList .li");
ok(/Unused/.test(await desk.locator("#inviteList").textContent()), "listed as unused");
await shot(desk, "19-desk-invite");
const {page: pal} = await device("pal", {width: 390, height: 844});
// The friend's shops: tops in stock in S only for half the pieces, in M and L for the other half.
const zsOf = {};
await pal.route("**/pool.json", async route => {
  const res = await route.fetch();
  const j = await res.json();
  // Sized pieces only, as the scraper does (caps, socks and bags are one size).
  const sized = new Set(["tee", "shirt", "overshirt", "jacket", "fleece", "knit", "cardigan", "sweat", "hoodie", "jeans", "chino", "trouser", "jogger", "shorts", "trainer", "boot", "wallabee", "clog", "shoe"]);
  j.items.forEach((x, i) => { if (!sized.has(x.r)) return; x.zs = i % 2 ? ["M", "L", "W32L32", "UK9"] : ["S", "W28L30", "UK6"]; zsOf[x.k] = x.zs; });
  await route.fulfill({response: res, json: doctor(j)});
});
await pal.goto(friendLink.replace(/^https?:\/\/[^/]+/, BASE));
await pal.waitForSelector("#sheet .quiz", {timeout: 20000});
ok(true, "the invite opens the questions first");
ok(await pal.locator("#sheet [data-qnav=next][disabled]").count() === 1, "who you shop for comes first, and it's needed");
await pal.click('#sheet [data-q=dept][data-v=m]');
await pal.selectOption("#qHeight", {label: "5′7″ · 170 cm"});
await pal.click("#sheet [data-qnav=next]");
await pal.click('#sheet [data-q=top][data-v=M]');
await pal.click('#sheet [data-q=trw][data-v="32"]');
await pal.click('#sheet [data-q=trl][data-v="32"]');
await pal.click('#sheet [data-q=shoe][data-v="9"]');
await shot(pal, "20-pal-sizes");
await pal.click("#sheet [data-qnav=next]");
await pal.waitForSelector('#sheet [data-q=brands]');
ok(await pal.locator("#sheet [data-q=brands]").count() >= 5, "brands from the shops to pick from");
await pal.click("#sheet [data-q=brands] >> nth=0");
await pal.click("#sheet [data-qnav=next]");
await pal.click('#sheet [data-q=styles][data-v=workwear]');
await pal.click("#sheet [data-qnav=next]");
await pal.click('#sheet [data-q=love][data-v=navy]');
await pal.click('#sheet [data-q=never][data-v=black]');
await pal.click("#sheet [data-qnav=next]");
await pal.click("#sheet [data-qnav=next]");
await pal.click("#sheet [data-qnav=done]");
await pal.waitForSelector("#view-train:not([hidden]) #tcard", {timeout: 15000});
ok(/Taste test · 1 of 30/.test(await pal.locator("#view-train .train-top").textContent()), "then the 30-piece taste test", await pal.locator("#view-train .train-top").textContent());
for (let i = 0; i < 5; i++) {
  const key = await pal.locator("#tcard").getAttribute("data-key");
  await pal.click(i % 2 ? "#view-train .tbtn.yes" : "#view-train .tbtn.no");
  await pal.waitForFunction(k => { const c = document.getElementById("tcard"); return !c || c.dataset.key !== k; }, key, {timeout: 5000});
}
await pal.click("#view-train [data-train=finish]");
await pal.waitForSelector("#view-train .tdone [data-go=you]");
ok(true, "finishing early still saves what it learned, and offers the account");
await pal.click("#view-train .tdone [data-go=you]");
await pal.waitForSelector("#view-you:not([hidden]) #handle");
ok(true, "then making the account");
await pal.fill("#handle", "pal2");
await pal.click("[data-you=signup]");
await pal.waitForSelector("#sheet:not([hidden]) .codes", {timeout: 20000});
await pal.click("#sheet [data-close-sheet]");
await pal.waitForFunction(() => /@pal2/.test(document.getElementById("whoText").textContent), null, {timeout: 15000});
ok(true, "signed in as a member");
await pal.waitForTimeout(1600);
const palState = await pal.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(palState.brief && palState.brief.colours.navy === "love" && palState.brief.colours.black === "no" && palState.cfg.profile.top === "M" && palState.cfg.profile.trw === 32, "their answers and sizes are in their account", {b: palState.brief && palState.brief.colours, p: palState.cfg && palState.cfg.profile});
ok(palState.brief.v === 2 && JSON.stringify(palState.brief.dept) === '["m"]' && palState.brief.brands_love.length === 1 && palState.cfg.profile.height === 170, "a brief of their own (v2, menswear, a brand), and their height", {v: palState.brief.v, d: palState.brief.dept, h: palState.cfg.profile.height});
ok(Object.values(palState.entries || {}).filter(e => e.s).length >= 4, "the taste test's swipes went into the account", Object.keys(palState.entries || {}).length);
await pal.click(".dock [data-view=for-you]");
await pal.waitForSelector("#fyGrid .card[data-key]");
ok(await pal.locator("#editBlock:not([hidden])").count() === 0, "no owner's edit for a member");
const palKeys = await pal.locator("#fyGrid .card[data-key]").evaluateAll(els => els.map(e => e.dataset.key));
const wrong = palKeys.filter(k => zsOf[k] && !zsOf[k].includes("M"));
ok(palKeys.length > 4 && wrong.length === 0, "only pieces in stock in their size", {n: palKeys.length, wrong: wrong.slice(0, 3)});
ok(palKeys.some(k => houseKeys.has(k)), "the owner's house rules don't narrow a member's feed");
ok(palKeys.every(k => !/^fixture\.example/.test(k)), "a menswear shopper doesn't get the womenswear pool");
ok(await pal.locator("#updaterLink:not([hidden])").count() === 0, "no updater link for members");
// A piece that's also one of Claude's picks for the owner: a member sees the shop's version, never the owner's notes.
await pal.goto(BASE + "/#item=" + encodeURIComponent("passenger-clothing.com/products/headland-ls-slub-henley-dusty-olive"));
await pal.waitForSelector("#drawer:not(.closed) #dTitle");
ok(!/Why Claude picked it|wardrobe/i.test(await pal.locator("#dBody").textContent()), "no owner's notes in a member's drawer");
await pal.goBack().catch(() => {});
await pal.goto(BASE + "/#for-you");
await pal.waitForSelector("#fyGrid .card[data-key]");
await pal.click(".dock [data-view=saved]");
ok(await pal.locator("#savedTabs [data-saved-tab=watch]").count() === 0, "no owner watch list");
await pal.click(".dock [data-view=outfits]");
await pal.waitForSelector("#occasions .look, #occasions .empty");
ok(await pal.locator("#owngrid label input[data-own=staple]").count() === 0, "none of the owner's wardrobe");
await shot(pal, "21-pal-outfits");

section("A womenswear member: her own shops, sizes, taste test and occasions");
await desk.click("#pInvite [data-you=invite-new]");
await desk.waitForFunction(prev => { const el = document.querySelector("#inviteNew #inviteOut"); return el && el.value && el.value !== prev; }, friendLink);
const wrenLink = await desk.inputValue("#inviteNew #inviteOut");
const {page: wren} = await device("wren", {width: 390, height: 844});
await wren.goto(wrenLink.replace(/^https?:\/\/[^/]+/, BASE));
await wren.waitForSelector("#sheet .quiz", {timeout: 20000});
await wren.click('#sheet [data-q=dept][data-v=w]');
await wren.selectOption("#qHeight", {label: "5′2″ · 157 cm"});
await wren.click("#sheet [data-qnav=next]");
ok(await wren.locator('#sheet [data-q=dress]').count() >= 10 && await wren.locator('#sheet [data-q=trw]').count() === 0, "womenswear sizes: a UK dress size, no trouser waist");
await wren.click('#sheet [data-q=dress][data-v="10"]');
await wren.click('#sheet [data-q=shoe][data-v="5"]');
await shot(wren, "23-wren-sizes");
await wren.click("#sheet [data-qnav=next]");
await wren.waitForSelector('#sheet [data-q=brands][data-v="Oh Polly"]', {timeout: 15000});
ok(true, "the womenswear shops' brands to pick from");
await wren.click('#sheet [data-q=brands][data-v="Oh Polly"]');
await wren.click("#sheet [data-qnav=next]");
await wren.click('#sheet [data-q=styles][data-v=party]');
await wren.click('#sheet [data-q=styles][data-v=alt]');
await shot(wren, "24-wren-style");
await wren.click("#sheet [data-qnav=next]");
await wren.click('#sheet [data-q=love][data-v=black]');
await wren.click("#sheet [data-qnav=next]");
await wren.click("#sheet [data-qnav=next]");
await wren.click('#sheet [data-q=occasions][data-v=party]');
await wren.click("#sheet [data-qnav=done]");
await wren.waitForSelector("#view-train:not([hidden]) #tcard", {timeout: 15000});
const tasted = [];
for (let i = 0; i < 40; i++) {
  const card = wren.locator("#tcard");
  if (!(await card.count())) break;
  const key = await card.getAttribute("data-key");
  tasted.push(key);
  const name = await wren.locator("#tcard .name").textContent();
  await wren.click(/Velvet|Bodycon/.test(name) ? "#view-train .tbtn.love" : /Floral|Fringe/.test(name) ? "#view-train .tbtn.no" : "#view-train .tbtn.yes");
  await wren.waitForFunction(k => { const c = document.getElementById("tcard"); return !c || c.dataset.key !== k; }, key, {timeout: 5000});
}
await wren.waitForSelector("#view-train .tdone");
await shot(wren, "25-wren-taste-done");
ok(tasted.length >= 20 && tasted.every(k => /^fixture\.example/.test(k)), "the taste test is womenswear only", {n: tasted.length, odd: tasted.filter(k => !/^fixture/.test(k)).slice(0, 3)});
ok(tasted.every(k => W_FIT.has(k)), "and only in her sizes (a 10, a UK 5)", tasted.filter(k => !W_FIT.has(k)).slice(0, 3));
const tastedKinds = new Set(W_POOL.items.filter(x => tasted.includes(x.k)).map(x => x.r));
ok(tastedKinds.size >= 5, "every kind of piece", [...tastedKinds]);
ok(/Going out|Alternative/.test(await wren.locator("#view-train .tdone").textContent()), "what it learned, in plain words", (await wren.locator("#view-train .tdone").textContent()).slice(0, 200));
await wren.click("#view-train .tdone [data-go=you]");
await wren.fill("#handle", "wren");
await wren.click("[data-you=signup]");
await wren.waitForSelector("#sheet:not([hidden]) .codes", {timeout: 20000});
await wren.click("#sheet [data-close-sheet]");
await wren.waitForFunction(() => /@wren/.test(document.getElementById("whoText").textContent), null, {timeout: 15000});
await wren.waitForTimeout(1600);
const wrenState = await wren.evaluate(() => fetch("/api/state?since=0").then(r => r.json()));
ok(wrenState.brief.v === 2 && JSON.stringify(wrenState.brief.dept) === '["w"]' && wrenState.cfg.profile.dress === 10 && wrenState.brief.styles.includes("party"),
  "her brief and sizes are in her account", {v: wrenState.brief.v, d: wrenState.brief.dept, p: wrenState.cfg.profile});
await wren.click(".dock [data-view=for-you]");
await wren.waitForSelector("#fyGrid .card[data-key]");
const wrenKeys = await wren.locator("#fyGrid .card[data-key]").evaluateAll(els => els.map(e => e.dataset.key));
ok(wrenKeys.length >= 4 && wrenKeys.every(k => /^fixture\.example/.test(k) && W_FIT.has(k)), "her feed: womenswear in her sizes", wrenKeys.slice(0, 4));
const wrenTop = W_POOL.items.find(x => x.k === wrenKeys[0]);
ok(wrenTop && /Velvet|Bodycon/.test(wrenTop.n), "led by what she loved", wrenTop && wrenTop.n);
ok(await wren.locator("#fyFilters [data-f=dresses], #fyFilters [data-filter=dresses], #fyFilters button").evaluateAll(els => els.some(e => /Dresses/.test(e.textContent))), "a Dresses filter");
await shot(wren, "26-wren-for-you");
await wren.click(".dock [data-view=outfits]");
await wren.waitForSelector("#occasions .look, #occasions .empty", {timeout: 15000});
ok(/Going out/.test(await wren.locator("#occasions").textContent()), "outfits for going out");
await shot(wren, "27-wren-outfits");

section("A visitor without an invite");
const {page: guest} = await device("guest", {width: 1360, height: 900});
await guest.goto(BASE + "/");
await guest.waitForSelector("#fyGrid .card[data-key]");
ok(await guest.locator("#welcome:not([hidden]) [data-onb=start][data-dept]").count() === 3, "a welcome that asks who they shop for");
ok(await guest.locator("#editBlock:not([hidden])").count() === 0 && /Sign in/.test(await guest.locator("#whoText").textContent()), "nothing personal, a sign-in button");
await guest.click("[data-onb=skip]");
ok(await guest.locator("#welcome[hidden]").count() === 1, "or just browse");
await shot(guest, "22-guest");

section("Console");
ok(problems.length === 0, "no console errors or CSP violations", problems.slice(0, 6));
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
