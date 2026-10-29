// End-to-end API tests against `wrangler dev` (local D1). Run with tests/run-api.sh, or:
//   npx wrangler dev --var INVITE_HASHES:<h> --var OWNER_INVITE_HASH:<h> --var REVIEW_HASHES:<h2>  then  node tests/api.test.mjs
// Each "device" keeps its own cookie jar; passkeys are software authenticators making real signatures.
import {SoftAuthenticator} from "./softauthn.mjs";

const BASE = process.argv[2] || "http://localhost:8787";
const ORIGIN = BASE;
const INVITE = process.env.TEST_INVITE || "test-invite-0123456789abcdef";
const REVIEW = process.env.TEST_REVIEW || "test-review-key-0123456789abcdefghijklmnopqrstuv";
let passed = 0, failed = 0;
const ok = (cond, name, extra) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + JSON.stringify(extra).slice(0, 400) : "")); } };
const section = s => console.log("\n" + s);

class Device {
  constructor(name) { this.name = name; this.cookie = null; }
  async req(method, path, body, opts = {}) {
    const headers = Object.assign({}, opts.headers);
    if (body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (method !== "GET" && !("Origin" in headers)) headers.Origin = ORIGIN;
    if (headers.Origin === null) delete headers.Origin;
    if (this.cookie) headers.Cookie = this.cookie;
    headers["User-Agent"] = opts.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
    const res = await fetch(BASE + path, {method, headers, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)), redirect: "manual"});
    const sc = res.headers.get("set-cookie");
    if (sc) { const m = /__Host-capsule=([^;]*)/.exec(sc); if (m) this.cookie = m[1] ? "__Host-capsule=" + m[1] : null; }
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return {status: res.status, data, headers: res.headers};
  }
  get = (p, o) => this.req("GET", p, undefined, o);
  post = (p, b, o) => this.req("POST", p, b === undefined ? {} : b, o);
  patch = (p, b, o) => this.req("PATCH", p, b, o);
  del = (p, o) => this.req("DELETE", p, {}, o);
}

async function signUp(dev, authr, handle, invite, brief) {
  const o = await dev.post("/api/auth/register/options", {handle, invite});
  if (o.status !== 200) return o;
  const cred = await authr.create(o.data.options, ORIGIN);
  return dev.post("/api/auth/register/verify", {flow: o.data.flow, credential: cred, name: "Test phone", brief});
}
async function signIn(dev, authr) {
  const o = await dev.post("/api/auth/login/options");
  const a = await authr.get(o.data.options, ORIGIN);
  return dev.post("/api/auth/login/verify", {flow: o.data.flow, credential: a});
}

const phone = new Device("phone"), desk = new Device("desk"), stranger = new Device("stranger");
const key = new SoftAuthenticator(-7);

section("Basics");
let r = await phone.get("/api/health");
ok(r.status === 200 && r.data.ok, "health");
r = await phone.get("/api/me");
ok(r.status === 200 && r.data.user === null, "signed out at first");
ok(/no-store/.test(r.headers.get("cache-control") || ""), "API responses aren't cached");
ok(/frame-ancestors 'none'/.test(r.headers.get("content-security-policy") || ""), "API sends a CSP");
r = await phone.get("/");
ok(r.status === 200 && /script-src 'self'/.test(r.headers.get("content-security-policy") || ""), "page gets the strict CSP");

section("Invite-only sign-up");
r = await stranger.post("/api/auth/register/options", {handle: "someone", invite: "nope-nope-nope-nope-nope"});
ok(r.status === 403 && r.data.error === "invite_needed", "no valid invite, no account", r.data);
r = await stranger.post("/api/auth/register/options", {handle: "someone"});
ok(r.status === 403, "missing invite refused");
const brief = {colours: {olive: "love", white: "no"}, styles: ["workwear"], caps: {tee: 50}, junk: "dropped", categories: ["tees", "knitwear"]};
r = await signUp(phone, key, "don", INVITE, brief);
ok(r.status === 200 && r.data.user && r.data.user.owner === true, "owner invite makes the owner account", r.data);
ok(Array.isArray(r.data.recoveryCodes) && r.data.recoveryCodes.length === 10, "ten recovery codes");
r = await signUp(stranger, new SoftAuthenticator(-7), "other", INVITE);
ok(r.status === 403, "an invite works once", r.data);
r = await phone.get("/api/me");
ok(r.data.user && r.data.user.handle === "don" && r.data.user.owner, "me after sign-up");

section("Sync");
r = await phone.get("/api/state?since=0");
ok(r.status === 200 && r.data.brief && r.data.brief.colours.olive === "love" && !("junk" in r.data.brief), "brief saved at sign-up, unknown keys dropped", r.data.brief);
const t1 = new Date(Date.now() - 60000).toISOString(), t2 = new Date().toISOString();
const snap = {b: "Universal Works", n: "Bakers Jacket, olive", r: "jacket", u: "https://universalworks.com/products/bakers-jacket", i: "https://cdn.shopify.com/x.jpg", p: 170, tr: ["r:jacket", "c:olive", "st:workwear"]};
r = await phone.post("/api/state", {since: 0, entries: {
  "universalworks.com/products/bakers-jacket": {t: t1, s: "love", why: ["colour", "bogus"], f: snap},
  "BAD KEY!": {t: t1, s: "love"},
  "example.com/products/x": {t: t1, s: "explode", save: 1}
}, cfg: {counts: {tees: 4, nonsense: 9}, caps: {tee: 50}, theme: "dark", reach: 88, t: t1}});
ok(r.status === 200, "post state");
const e1 = r.data.entries["universalworks.com/products/bakers-jacket"];
ok(e1 && e1.s === "love" && e1.why.join() === "colour" && e1.f.tr.length === 3, "entry stored and cleaned", e1);
ok(!r.data.entries["BAD KEY!"], "bad keys dropped");
ok(r.data.entries["example.com/products/x"] && !r.data.entries["example.com/products/x"].s && r.data.entries["example.com/products/x"].save === 1, "unknown states dropped, flags kept");
ok(r.data.cfg && r.data.cfg.counts.tees === 4 && !("nonsense" in r.data.cfg.counts) && r.data.cfg.reach === 88, "settings cleaned", r.data.cfg);
const rev1 = r.data.rev;
r = await phone.post("/api/state", {since: rev1, entries: {"universalworks.com/products/bakers-jacket": {t: new Date(Date.now() - 3600000).toISOString(), s: "nope"}}});
ok(!r.data.entries["universalworks.com/products/bakers-jacket"], "an older change doesn't win");
r = await phone.post("/api/state", {since: rev1, entries: {"universalworks.com/products/bakers-jacket": {t: t2, s: "nope", why: ["fit"]}}});
ok(r.data.entries["universalworks.com/products/bakers-jacket"] && r.data.entries["universalworks.com/products/bakers-jacket"].s === "nope", "a newer change wins");
r = await phone.post("/api/state", {since: 0, entries: {"example.com/products/y": {t: new Date(Date.now() + 9 * 864e5).toISOString(), s: "love"}}});
ok(Date.parse(r.data.entries["example.com/products/y"].t) <= Date.now() + 864e5, "far-future timestamps are pulled back");

section("Origin and auth checks");
r = await phone.post("/api/state", {since: 0}, {headers: {Origin: "https://evil.example"}});
ok(r.status === 403 && r.data.error === "bad_origin", "foreign Origin refused");
r = await phone.post("/api/state", {since: 0}, {headers: {Origin: null}});
ok(r.status === 403, "missing Origin refused");
r = await phone.req("POST", "/api/state", "since=0", {headers: {"Content-Type": "application/x-www-form-urlencoded"}});
ok(r.status === 415, "form posts refused");
r = await stranger.get("/api/state?since=0");
ok(r.status === 401, "state needs a session");

section("Link another device");
r = await phone.post("/api/me/link");
ok(r.status === 200 && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(r.data.code), "link code while fresh", r.data);
const code = r.data.code;
r = await desk.post("/api/auth/link", {code: code.toLowerCase().replace("-", " ")});
ok(r.status === 200 && r.data.user.handle === "don", "desk signs in with the code (any case, spaces)");
r = await stranger.post("/api/auth/link", {code});
ok(r.status === 400, "a link code works once");
r = await desk.get("/api/state?since=0");
ok(r.status === 200 && r.data.entries["universalworks.com/products/bakers-jacket"], "desk sees the phone's reactions");
r = await desk.post("/api/me/link");
ok(r.status === 200, "a just-linked device counts as fresh for 15 minutes, like a passkey sign-in");

section("Settings patches from two devices combine");
r = await phone.post("/api/state", {since: 0, cfgPatch: {"owned.s3": 1, "explore": 0.33, "rules": "hard", "evil": 1, "owned.<x>": 1}});
ok(r.status === 200 && r.data.cfg.owned.s3 === 1 && r.data.cfg.explore === 0.33 && r.data.cfg.rules === "hard" && !("evil" in r.data.cfg), "phone's patch applied, bad paths ignored", r.data.cfg);
ok(r.data.cfg.counts.tees === 4, "earlier settings kept");
r = await desk.post("/api/state", {since: 0, cfgPatch: {"pins.c:olive": 1.5, "owned.s5": 0}});
ok(r.data.cfg.owned.s3 === 1 && r.data.cfg.owned.s5 === 0 && r.data.cfg.pins["c:olive"] === 1.5, "desk's patch adds to the phone's instead of replacing it", r.data.cfg);
r = await phone.post("/api/state", {since: 0, cfgPatch: {"pins.c:olive": null, "explore": 9}});
ok(!("c:olive" in r.data.cfg.pins) && r.data.cfg.explore === 0.2, "null removes a key; out-of-range values fall back", r.data.cfg);

section("Passkey sign-in on a third device");
const tablet = new Device("tablet");
r = await signIn(tablet, key);
ok(r.status === 200 && r.data.user.handle === "don" && r.data.user.owner, "discoverable passkey sign-in");

section("Claude's review");
r = await stranger.get("/api/review");
ok(r.status === 401, "review needs the key");
r = await stranger.get("/api/review", {headers: {Authorization: "Bearer wrong-wrong-wrong-wrong-wrong-wrong-wrong"}});
ok(r.status === 401, "wrong key refused");
r = await stranger.get("/api/review", {headers: {Authorization: "Bearer " + REVIEW}});
ok(r.status === 200 && r.data.owner === "don" && Array.isArray(r.data.ranked), "review reads the owner's account", r.data && r.data.message);
ok(r.data.recent && r.data.recent.length >= 1, "recent reactions included");
ok(r.data.profile && Array.isArray(r.data.profile.likes), "profile summary included");
ok(r.data.ranked.length > 0 && typeof r.data.ranked[0].pct === "number", "ranked pieces with match %", r.data.ranked && r.data.ranked[0]);
r = await stranger.post("/api/review/note", {kind: "weekly", body: "You leaned into olive and waffle this week."}, {headers: {Authorization: "Bearer " + REVIEW, Origin: null}});
ok(r.status === 200, "review leaves a note");
r = await phone.get("/api/me/notes");
ok(r.data.notes && r.data.notes[0] && /olive/.test(r.data.notes[0].body), "note shows on the account");

section("Export, sessions, sign out");
r = await phone.get("/api/me/export");
ok(r.status === 200 && r.data.reactions && r.data.brief && /attachment/.test(r.headers.get("content-disposition") || ""), "export has everything");
r = await phone.get("/api/me/sessions");
ok(r.data.sessions && r.data.sessions.length >= 3, "three signed-in devices listed");
r = await desk.post("/api/auth/logout");
ok(r.status === 200, "desk signs out");
r = await desk.get("/api/me");
ok(r.data.user === null, "desk is signed out");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
