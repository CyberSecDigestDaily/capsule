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

const browser = await chromium.launch();
const problems = [];
async function device(name, viewport) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: 2, colorScheme: "dark", hasTouch: viewport.width < 600});
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error" || /Content Security Policy|Refused to/.test(m.text())) problems.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`[${name}] pageerror: ${e.message}`));
  await page.route("**/seed.enc", r => r.fulfill({status: 200, contentType: "application/json", body: SEED}));
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

section("Sign up with a passkey");
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

section("For you");
await phone.click(".dock [data-view=for-you]");
await phone.waitForSelector("#fyGrid .card[data-key]", {timeout: 15000});
ok(await cards(phone).count() >= 20, "a page of ranked pieces", await cards(phone).count());
ok(await phone.locator("#fyGrid .badge.wild").count() >= 1, "wildcards are labelled");
ok(/% match/.test(await phone.locator("#fyGrid .card .why").first().textContent()), "match % and why on each card");
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
ok(/hidden from your feed/.test(await phone.locator("#tlast").textContent()), "a pass says it's hidden from your feed");
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

section("Your reactions");
await phone.click("#fyTally [data-go=you]");
await phone.waitForSelector("#pReact .rtabs");
await phone.click('#pReact [data-rtab=hidden]');
await phone.waitForSelector(`#pReact .mini[data-key="${k2}"]`);
ok(await phone.locator(`#pReact .mini[data-key="${passKey}"]`).count() === 1, "hidden pieces listed, from the feed and from Train");
await shot(phone, "09b-reactions");
await phone.click(`#pReact .mini[data-key="${k2}"] [data-act=unhide]`);
await phone.waitForTimeout(450);
le = await lsEntries(phone);
ok(!le.entries[k2].s, "bring back un-hides it", le.entries[k2]);
ok(await phone.locator(`#pReact .mini[data-key="${k2}"]`).count() === 0, "and it leaves the hidden list");

section("Link a second device with a code");
await phone.click(".dock [data-view=you]");
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
await desk.click("[data-view=for-you]");
await desk.waitForSelector("#fyGrid .card[data-key]");
await shot(desk, "11-desk-for-you");
await desk.click("[data-view=shop]");
await desk.waitForSelector("#grid .card");
await shot(desk, "12-desk-watch");
await desk.click("[data-view=outfits]");
await desk.waitForSelector("#outfits .outfit");
await shot(desk, "13-desk-outfits");
await desk.click("[data-view=deals]");
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
  await desk.click("[data-view=deals]");
  ok(await desk.inputValue("#dealSort") === "disc", "the sort is remembered on this device");
} else ok(true, "not enough deals in the data to check sorting");
await desk.click("[data-view=you]");
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
await desk.locator("#pAbout").scrollIntoViewIfNeeded();
await shot(desk, "17-desk-about-you");

section("Console");
ok(problems.length === 0, "no console errors or CSP violations", problems.slice(0, 6));
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
