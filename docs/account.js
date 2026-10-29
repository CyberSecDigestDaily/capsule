/* Capsule accounts and sync (adapted from the Dread List): passkeys, no passwords and no email, one-time recovery
   codes, and short codes to sign in another device. Signed in, every tap syncs to your private store on Capsule's
   Cloudflare Worker: reactions piece by piece (newest deliberate tap wins), settings as small patches applied to the
   account's copy (so two devices never overwrite each other). Signed out, or on the GitHub Pages copy, which has no
   server, everything stays in this browser. */

import {mergeEntry, applyCfgPatch} from "./engine.js";

const KEY_ACCT = "capsule.acct.v1", KEY_JOIN = "capsule.join";
export const acct = {server: null, user: null, me: null, session: null, rev: 0, dirty: new Set(), cfgPatch: {}, briefDirty: false,
  timer: null, pushing: false, again: false, status: "local", error: "", wired: false};
let host = null;

/* ---------- small helpers ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: memory only */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {method, credentials: "same-origin", cache: "no-store",
      headers: body !== undefined ? {"Content-Type": "application/json"} : {}, body: body !== undefined ? JSON.stringify(body) : undefined});
  } catch (e) {
    throw new ApiError(0, "offline", "Can't reach Capsule's server. Check your connection.");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || "http_" + res.status, (data && data.message) || `The server returned an error (${res.status}).`);
  if (!data || typeof data !== "object") throw new ApiError(res.status, "no_server", "This copy of Capsule has no server behind it.");
  return data;
}

/* Is there a Capsule Worker behind this page? (The GitHub Pages copy has none.) */
export async function hasServer() {
  if (acct.server !== null) return acct.server;
  if (/\.github\.io$/.test(location.hostname)) return (acct.server = false); // the static copy has no API
  try {
    const r = await fetch("/api/health", {cache: "no-store", credentials: "same-origin"});
    const d = r.ok && /json/.test(r.headers.get("Content-Type") || "") ? await r.json() : null;
    acct.server = !!(d && d.ok && d.app === "capsule");
  } catch (e) { acct.server = false; }
  return acct.server;
}

/* ---------- passkeys in the browser ---------- */
export const b64u = {
  enc(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    const t = String(str).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
};
export const hasPasskeys = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
function createOptions(o) {
  if (window.PublicKeyCredential && PublicKeyCredential.parseCreationOptionsFromJSON) {
    try { return PublicKeyCredential.parseCreationOptionsFromJSON(o); } catch (e) { /* fall back to by hand */ }
  }
  return Object.assign({}, o, {challenge: b64u.dec(o.challenge), user: Object.assign({}, o.user, {id: b64u.dec(o.user.id)}),
    excludeCredentials: (o.excludeCredentials || []).map(c => Object.assign({}, c, {id: b64u.dec(c.id)}))});
}
function requestOptions(o) {
  if (window.PublicKeyCredential && PublicKeyCredential.parseRequestOptionsFromJSON) {
    try { return PublicKeyCredential.parseRequestOptionsFromJSON(o); } catch (e) { /* fall back to by hand */ }
  }
  return Object.assign({}, o, {challenge: b64u.dec(o.challenge), allowCredentials: (o.allowCredentials || []).map(c => Object.assign({}, c, {id: b64u.dec(c.id)}))});
}
function credentialJSON(c) {
  if (typeof c.toJSON === "function") { try { return c.toJSON(); } catch (e) { /* fall back to by hand */ } }
  const r = c.response;
  const out = {id: c.id, rawId: b64u.enc(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment || undefined,
    clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, response: {clientDataJSON: b64u.enc(r.clientDataJSON)}};
  if (r.attestationObject) {
    out.response.attestationObject = b64u.enc(r.attestationObject);
    if (typeof r.getTransports === "function") out.response.transports = r.getTransports();
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = b64u.enc(r.authenticatorData);
    out.response.signature = b64u.enc(r.signature);
    if (r.userHandle) out.response.userHandle = b64u.enc(r.userHandle);
  }
  return out;
}
export function passkeyError(e) {
  const n = e && e.name;
  if (e instanceof ApiError) return e.message;
  if (n === "NotAllowedError") return "The passkey prompt was closed or timed out. Try again when you're ready.";
  if (n === "InvalidStateError") return "This device already has a passkey for this account.";
  if (n === "SecurityError") return "Passkeys only work on Capsule's own address, over https.";
  if (n === "NotSupportedError") return "This browser can't make a passkey. Try another browser, or sign in with a code.";
  if (n === "AbortError") return "Cancelled.";
  return (e && e.message) || "The passkey didn't work.";
}
async function passkeyCreate(options) {
  if (!hasPasskeys()) throw new Error("This browser doesn't support passkeys. Try another browser, or sign in with a code.");
  return credentialJSON(await navigator.credentials.create({publicKey: createOptions(options)}));
}
async function passkeyGet(options) {
  if (!hasPasskeys()) throw new Error("This browser doesn't support passkeys. Sign in with a code instead.");
  return credentialJSON(await navigator.credentials.get({publicKey: requestOptions(options)}));
}
/* Sensitive changes need a recent sign-in: on "reauth", confirm with a passkey and try once more. */
export async function withFresh(fn) {
  try { return await fn(); } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "reauth") throw e;
    const o = await api("POST", "/api/auth/reauth/options", {});
    await api("POST", "/api/auth/reauth/verify", {flow: o.flow, credential: await passkeyGet(o.options)});
    if (acct.session) acct.session.fresh = true;
    return fn();
  }
}
export function deviceName() {
  const s = navigator.userAgent;
  const os = /iPad/.test(s) ? "iPad" : /iPhone/.test(s) ? "iPhone" : /Android/.test(s) ? "Android" : /Mac OS X|Macintosh/.test(s) ? "Mac"
    : /Windows/.test(s) ? "Windows" : /CrOS/.test(s) ? "Chromebook" : /Linux/.test(s) ? "Linux" : "";
  const br = /Edg\//.test(s) ? "Edge" : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ") || "Passkey";
}

/* ---------- the private brief that travels with an invite ---------- */
/* seed.enc in the public repo is the style brief, encrypted (AES-256-GCM, key from PBKDF2-SHA256 over the invite
   code). Only someone holding the invite link can read it; the code only ever leaves the browser to redeem the invite. */
export async function readSeed(code) {
  const res = await fetch("seed.enc", {cache: "no-cache"});
  if (!res.ok) throw new Error("No brief to unlock here.");
  const s = await res.json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt: b64u.dec(s.salt), iterations: s.iter, hash: "SHA-256"}, base,
    {name: "AES-GCM", length: 256}, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: b64u.dec(s.iv)}, key, b64u.dec(s.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
export const pendingInvite = () => {
  const j = store.get(KEY_JOIN, null);
  return j && j.code && Date.now() - (j.at || 0) < 30 * 864e5 ? j.code : null;
};
export const rememberInvite = code => store.set(KEY_JOIN, {code, at: Date.now()});
export const forgetInvite = () => store.del(KEY_JOIN);

/* ---------- sync ---------- */
function persist() {
  if (acct.user) store.set(KEY_ACCT, {user: acct.user, rev: acct.rev, dirty: [...acct.dirty], cfgPatch: acct.cfgPatch, briefDirty: acct.briefDirty});
  else store.del(KEY_ACCT);
}
function setStatus(s, err) { acct.status = s; acct.error = err || ""; if (host) host.onStatus(); }
const pending = () => acct.dirty.size > 0 || Object.keys(acct.cfgPatch).length > 0 || acct.briefDirty;
export const hasPending = pending;

function schedule(ms) {
  clearTimeout(acct.timer);
  acct.timer = setTimeout(() => sync(), ms);
}
/* Pieces changed on this device. */
export function markDirty(keys) {
  if (!acct.user) return;
  for (const k of keys || []) acct.dirty.add(k);
  persist();
  schedule(1500);
}
/* Settings changed on this device, as a patch (see cfgDiff in engine.js). */
export function markCfg(patch) {
  if (!acct.user || !patch || !Object.keys(patch).length) return;
  Object.assign(acct.cfgPatch, patch);
  persist();
  schedule(1200);
}
export function markBrief() {
  if (!acct.user) return;
  acct.briefDirty = true;
  persist();
  schedule(1200);
}

/* The parts of an entry that matter when deciding whether two copies agree (not the snapshot or the timestamp). */
const SIG_KEYS = ["s", "et", "more", "save", "pricey", "own", "bought", "why", "wins", "losses", "open", "view", "linger", "shownTotal", "shown", "sd", "cool", "lp"];
const sig = e => e ? JSON.stringify(SIG_KEYS.map(k => e[k] === undefined ? null : e[k])) : "";
const after = (t, than) => Date.parse(t || 0) > Date.parse(than || 0) ? t : new Date(Date.parse(than || 0) + 1).toISOString();

function absorbEntries(entries) {
  const st = host.state();
  let changed = false;
  for (const [k, e] of Object.entries(entries || {})) {
    const local = st.entries[k];
    const merged = mergeEntry(local, e);
    // This device knows something the server's copy doesn't: push the merged copy, stamped later so it wins.
    if (sig(merged) !== sig(e)) { merged.t = after(merged.t, e.t); acct.dirty.add(k); }
    if (!local || sig(merged) !== sig(local) || merged.t !== local.t || (!local.f && merged.f)) { st.entries[k] = merged; changed = true; }
  }
  return changed;
}
/* The account's settings, with anything this device hasn't pushed yet laid on top. */
function absorbCfg(cfg) {
  if (!cfg) return false;
  const st = host.state();
  const next = Object.assign({}, st.cfg, applyCfgPatch(cfg, acct.cfgPatch));
  if (JSON.stringify(next) === JSON.stringify(st.cfg)) return false;
  st.cfg = next;
  return true;
}
function absorb(res) {
  let changed = absorbEntries(res.entries);
  if (absorbCfg(res.cfg)) changed = true;
  const st = host.state();
  if (res.brief && !acct.briefDirty && JSON.stringify(res.brief) !== JSON.stringify(st.brief)) { st.brief = res.brief; changed = true; }
  acct.rev = Math.max(acct.rev, res.rev || 0);
  return changed;
}

/* Push what changed here (in chunks the server accepts), pull what changed elsewhere. */
export async function sync() {
  if (!acct.user || !host) return;
  if (acct.pushing) { acct.again = true; return; }
  acct.pushing = true;
  clearTimeout(acct.timer);
  setStatus("syncing");
  let more = false, retry = 0;
  try {
    const st = host.state();
    const sent = [...acct.dirty].slice(0, 400), sentT = {}; // small batches keep each request well inside the free plan's CPU budget
    const body = {since: acct.rev, entries: {}};
    for (const k of sent) if (st.entries[k]) { body.entries[k] = st.entries[k]; sentT[k] = st.entries[k].t; }
    const patch = Object.assign({}, acct.cfgPatch);
    if (Object.keys(patch).length) body.cfgPatch = patch;
    const briefSent = acct.briefDirty && st.brief ? JSON.stringify(st.brief) : null;
    if (briefSent) body.brief = st.brief;
    const res = await api("POST", "/api/state", body);
    // Anything changed again while the request was in flight stays pending.
    for (const k of sent) if (!st.entries[k] || st.entries[k].t === sentT[k]) acct.dirty.delete(k);
    for (const [p, v] of Object.entries(patch)) if (JSON.stringify(acct.cfgPatch[p]) === JSON.stringify(v)) delete acct.cfgPatch[p];
    if (briefSent !== null && JSON.stringify(st.brief) === briefSent) acct.briefDirty = false;
    const changed = absorb(res);
    persist();
    if (changed) host.onRemote();
    setStatus("synced");
    more = pending();
  } catch (e) {
    if (e.status === 401) { signedOut(); setStatus("local"); host.onRemote(); }
    else { setStatus(e.code === "offline" ? "offline" : "error", e.message); retry = e.status === 429 ? 60000 : 20000; }
  } finally {
    acct.pushing = false;
    if (acct.again) { acct.again = false; more = true; }
    if (acct.user && more) schedule(300);
    else if (acct.user && retry && pending()) schedule(retry);
  }
}

function signedOut() {
  acct.user = null; acct.me = null; acct.session = null; acct.rev = 0; acct.dirty.clear(); acct.cfgPatch = {}; acct.briefDirty = false;
  persist();
}

/* First sign-in on a device: take the account's settings and brief, add this device's ticks and pins where the
   account has none, merge reactions both ways, then push the result. */
async function afterSignIn(user) {
  acct.user = {id: user.id, handle: user.handle, owner: !!user.owner};
  acct.rev = 0;
  acct.cfgPatch = {};
  acct.briefDirty = false;
  persist();
  const st = host.state();
  const full = await api("GET", "/api/state?since=0");
  absorbEntries(full.entries);
  for (const k of Object.keys(st.entries)) if (!full.entries || !full.entries[k]) acct.dirty.add(k);
  const local = st.cfg || {}, sc = full.cfg || null, patch = {};
  for (const m of ["owned", "pins", "counts", "caps"]) {
    for (const [k, v] of Object.entries(local[m] || {})) if (!sc || !sc[m] || !(k in sc[m])) patch[m + "." + k] = v;
  }
  for (const k of ["reach", "rules"]) if (local[k] != null && (!sc || sc[k] == null)) patch[k] = local[k];
  if (!sc) for (const k of ["explore", "theme", "resetAt"]) if (local[k] != null) patch[k] = local[k];
  acct.cfgPatch = patch;
  if (sc) st.cfg = Object.assign({}, st.cfg, applyCfgPatch(sc, patch));
  if (full.brief) st.brief = full.brief; else if (st.brief) acct.briefDirty = true;
  acct.rev = full.rev || 0;
  persist();
  host.onRemote();
  await refreshMe();
  await sync();
}

/* Who's signed in, how many passkeys and recovery codes are left. */
export async function refreshMe() {
  try {
    const me = await api("GET", "/api/me");
    if (me.user) {
      acct.me = me.user;
      acct.session = me.session;
      acct.user = {id: me.user.id, handle: me.user.handle, owner: !!me.user.owner};
      persist();
    }
    return me;
  } catch (e) { return null; }
}

export async function initAccount(h) {
  host = h;
  const cached = store.get(KEY_ACCT, null);
  if (cached && cached.user) {
    acct.user = cached.user; acct.rev = Number(cached.rev) || 0;
    acct.dirty = new Set(Array.isArray(cached.dirty) ? cached.dirty : []);
    acct.cfgPatch = cached.cfgPatch && typeof cached.cfgPatch === "object" ? cached.cfgPatch : {};
    acct.briefDirty = !!cached.briefDirty;
  }
  if (!(await hasServer())) { setStatus("local"); return; }
  if (!acct.wired) {
    acct.wired = true;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && acct.user) sync(); });
    setInterval(() => { if (acct.user && document.visibilityState === "visible") sync(); }, 120000);
  }
  try {
    const me = await api("GET", "/api/me");
    if (me.user) {
      const changedUser = !acct.user || acct.user.id !== me.user.id;
      acct.me = me.user;
      acct.session = me.session;
      if (changedUser) { if (acct.user) signedOut(); await afterSignIn(me.user); }
      else { acct.user = {id: me.user.id, handle: me.user.handle, owner: !!me.user.owner}; await sync(); }
    } else {
      if (acct.user) { signedOut(); host.onRemote(); }
      setStatus("local");
    }
  } catch (e) { setStatus(e.code === "offline" ? "offline" : "error", e.message); }
}

/* ---------- account actions (the You tab calls these) ---------- */
export async function signUp(handle, invite, brief) {
  const o = await api("POST", "/api/auth/register/options", {handle, invite});
  const credential = await passkeyCreate(o.options);
  const res = await api("POST", "/api/auth/register/verify", {flow: o.flow, credential, name: deviceName(), brief: brief || undefined});
  forgetInvite();
  await afterSignIn(res.user);
  return res;
}
export async function signIn() {
  const o = await api("POST", "/api/auth/login/options", {});
  const res = await api("POST", "/api/auth/login/verify", {flow: o.flow, credential: await passkeyGet(o.options)});
  await afterSignIn(res.user);
  return res;
}
export async function redeemCode(code) {
  const res = await api("POST", "/api/auth/link", {code});
  await afterSignIn(res.user);
  return res;
}
export async function recoverWith(handle, code) {
  const res = await api("POST", "/api/auth/recover", {handle, code});
  await afterSignIn(res.user);
  return res;
}
export const linkCode = () => withFresh(() => api("POST", "/api/me/link", {}));
export const newRecoveryCodes = () => withFresh(() => api("POST", "/api/me/recovery", {}));
export const listSessions = () => api("GET", "/api/me/sessions");
export const revokeSession = id => api("DELETE", "/api/me/sessions/" + encodeURIComponent(id), {});
export const listPasskeys = () => api("GET", "/api/me/passkeys");
export async function addPasskey() {
  const o = await withFresh(() => api("POST", "/api/me/passkeys/options", {}));
  const r = await api("POST", "/api/me/passkeys/verify", {flow: o.flow, credential: await passkeyCreate(o.options), name: deviceName()});
  await refreshMe();
  return r;
}
export const notes = () => api("GET", "/api/me/notes");
export async function signOut() {
  if (pending()) { try { await sync(); } catch (e) { /* best effort */ } }
  try { await api("POST", "/api/auth/logout", {}); } catch (e) { /* signed out locally either way */ }
  signedOut();
  setStatus("local");
}
export async function deleteAccount() {
  await withFresh(() => api("DELETE", "/api/me", {}));
  signedOut();
  setStatus("local");
}
