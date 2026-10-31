/* Accounts without passwords (adapted from the Dread List): passkeys to sign up and sign in, one-time recovery
   codes for a lost passkey, and short link codes to sign in a new device from one that's already signed in.
   Sign-up needs an invite while Capsule is just for Don: only SHA-256 hashes of invites live in the Worker's config
   (INVITE_HASHES), each works once, and the one in OWNER_INVITE_HASH makes the owner account. */

import {HttpError, now, randomToken, randomBytes, b64url, sha256hex, b32code, groupCode, normCode, isB32} from "./util.js";
import {verifyRegistration, verifyAuthentication, WebAuthnError, ALGS} from "./webauthn.js";
import {json, readJSON, createSession, clearCookie, requireSession, requireFresh, allowedOrigins, rpId, getSession} from "./http.js";
import {limitIP, rateLimit} from "./db.js";
import {checkHandle, normHandle, passkeyName, cleanBrief, bad} from "./validate.js";

const CHALLENGE_TTL = 300, LINK_TTL = 600, RECOVERY_COUNT = 10, MAX_PASSKEYS = 20;

const rp = (env, request) => ({rpId: rpId(env, request), origins: allowedOrigins(env, request), requireUV: true});

async function newChallenge(env, kind, userId, data) {
  const id = randomToken(18), challenge = randomToken(32);
  await env.DB.prepare("INSERT INTO challenges (id, kind, challenge, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, kind, challenge, userId || null, data ? JSON.stringify(data) : null, now() + CHALLENGE_TTL).run();
  return {id, challenge};
}

/* Single use: the row is deleted as it's read, so a challenge can never be replayed. */
async function takeChallenge(env, id, kind) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(id)) throw new HttpError(400, "bad_flow", "That sign-in attempt has expired. Try again.");
  const row = await env.DB.prepare("DELETE FROM challenges WHERE id = ? RETURNING kind, challenge, user_id, data, expires_at").bind(id).first();
  if (!row || row.kind !== kind || row.expires_at < now()) throw new HttpError(400, "expired", "That sign-in attempt has expired. Try again.");
  return {challenge: row.challenge, userId: row.user_id, data: row.data ? JSON.parse(row.data) : {}};
}

const webauthnError = e => {
  if (e instanceof WebAuthnError) return new HttpError(400, "passkey_rejected", "That passkey couldn't be verified. " + e.message + ".");
  return e;
};

function creationOptions(env, request, userId, handle, challenge, exclude) {
  return {
    rp: {id: rpId(env, request), name: "Capsule"},
    user: {id: userId, name: handle, displayName: handle},
    challenge,
    pubKeyCredParams: ALGS.map(alg => ({type: "public-key", alg})),
    timeout: CHALLENGE_TTL * 1000,
    attestation: "none",
    authenticatorSelection: {residentKey: "required", requireResidentKey: true, userVerification: "required"},
    excludeCredentials: (exclude || []).map(c => ({type: "public-key", id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined})),
    extensions: {credProps: true}
  };
}

async function newRecoveryCodes(env, userId) {
  const codes = Array.from({length: RECOVERY_COUNT}, () => b32code(16));
  const stmts = [env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(userId)];
  for (const c of codes) stmts.push(env.DB.prepare("INSERT INTO recovery_codes (user_id, hash) VALUES (?, ?)").bind(userId, await sha256hex("rc:" + c)));
  return {codes: codes.map(groupCode), stmts};
}

function storeCredential(env, userId, v, name) {
  return env.DB.prepare(`INSERT INTO credentials (id, user_id, public_key, alg, counter, transports, aaguid, backup_eligible, backed_up, name, created_at, last_used_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(v.id, userId, v.publicKey, v.alg, v.counter, JSON.stringify(v.transports), v.aaguid, v.backupEligible ? 1 : 0, v.backedUp ? 1 : 0, name || null, now(), now());
}

const inviteList = env => String(env.INVITE_HASHES || "").split(",").map(s => s.trim().toLowerCase()).filter(h => /^[0-9a-f]{64}$/.test(h));

/* An invite is good if its hash is configured and it hasn't been used. Returns {hash, owner}. */
async function checkInvite(env, raw) {
  const code = String(raw || "").trim();
  const generic = new HttpError(403, "invite_needed", "Capsule is invite-only for now. That invite isn't valid or has been used.");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) throw generic;
  const hash = await sha256hex("inv:" + code);
  if (!inviteList(env).includes(hash)) throw generic;
  if (await env.DB.prepare("SELECT 1 FROM invites_used WHERE hash = ?").bind(hash).first()) throw generic;
  return {hash, owner: String(env.OWNER_INVITE_HASH || "").toLowerCase() === hash};
}

export async function me(env, request, ctx) {
  const s = await getSession(env, request, ctx);
  if (!s) return json({user: null, invites: inviteList(env).length > 0});
  const [u, keys, codes] = await env.DB.batch([
    env.DB.prepare("SELECT id, handle, role, created_at FROM users WHERE id = ?").bind(s.user_id),
    env.DB.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?").bind(s.user_id),
    env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").bind(s.user_id)
  ]);
  const user = u.results[0];
  if (!user) return json({user: null});
  return json({user: {id: user.id, handle: user.handle, owner: user.role === "owner", created: user.created_at,
    passkeys: keys.results[0].n, recoveryLeft: codes.results[0].n},
    session: {method: s.method, fresh: now() - s.authed_at <= 15 * 60}});
}

/* ---- Sign up (invite only) ---- */
export async function registerOptions(env, request) {
  await limitIP(env, request, "reg", 30, 3600);
  const body = await readJSON(request);
  const inv = await checkInvite(env, body.invite);
  const handle = checkHandle(body.handle);
  if (await env.DB.prepare("SELECT 1 FROM users WHERE handle = ?").bind(handle).first()) throw new HttpError(409, "handle_taken", "That name is taken. Pick another.");
  const userId = b64url(randomBytes(16));
  const {id, challenge} = await newChallenge(env, "reg", null, {handle, userId, invite: inv.hash, owner: inv.owner});
  return json({flow: id, options: creationOptions(env, request, userId, handle, challenge)});
}

export async function registerVerify(env, request) {
  await limitIP(env, request, "regv", 20, 3600);
  await rateLimit(env, "reg:all", 200, 86400);
  const body = await readJSON(request, 64 * 1024);
  const flow = await takeChallenge(env, body.flow, "reg");
  const {handle, userId, invite, owner} = flow.data;
  let v;
  try { v = await verifyRegistration(body.credential, Object.assign(rp(env, request), {challenge: flow.challenge})); } catch (e) { throw webauthnError(e); }
  const brief = body.brief ? cleanBrief(body.brief) : null;
  const rc = await newRecoveryCodes(env, userId);
  const t = now(), iso = new Date().toISOString();
  try {
    await env.DB.batch([
      // The invite is spent in the same batch: if someone else used it a moment ago, the whole sign-up fails.
      env.DB.prepare("INSERT INTO invites_used (hash, user_id, used_at) VALUES (?, ?, ?)").bind(invite, userId, t),
      env.DB.prepare("INSERT INTO users (id, handle, role, created_at, rev, brief, brief_t, brief_rev) VALUES (?, ?, ?, ?, 1, ?, ?, ?)")
        .bind(userId, handle, owner ? "owner" : "member", t, brief ? JSON.stringify(brief) : null, brief ? iso : null, brief ? 1 : 0),
      storeCredential(env, userId, v, passkeyName(body.name)),
      ...rc.stmts
    ]);
  } catch (e) {
    const m = String(e && e.message);
    if (/invites_used/i.test(m) || (/UNIQUE|PRIMARY/i.test(m) && !/handle/i.test(m))) throw new HttpError(403, "invite_needed", "That invite has just been used.");
    if (/UNIQUE/i.test(m)) throw new HttpError(409, "handle_taken", "That name was taken a moment ago. Pick another.");
    throw e;
  }
  const cookie = await createSession(env, request, userId, "passkey");
  return json({user: {id: userId, handle, owner: !!owner}, recoveryCodes: rc.codes}, 200, {"Set-Cookie": cookie});
}

/* ---- Sign in with a passkey (discoverable: no name needed) ---- */
export async function loginOptions(env, request) {
  await limitIP(env, request, "login", 60, 600);
  const {id, challenge} = await newChallenge(env, "auth", null, null);
  return json({flow: id, options: {challenge, rpId: rpId(env, request), timeout: CHALLENGE_TTL * 1000, userVerification: "required", allowCredentials: []}});
}

async function checkAssertion(env, request, body, flow, onlyUser) {
  const cred = body.credential;
  if (!cred || typeof cred.id !== "string" || cred.id.length > 1400) throw new HttpError(400, "passkey_rejected", "That passkey couldn't be verified.");
  const row = await env.DB.prepare("SELECT c.id, c.user_id, c.public_key, c.alg, c.counter, u.handle, u.role FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?")
    .bind(cred.id).first();
  if (!row) throw new HttpError(400, "unknown_passkey", "That passkey isn't registered here. It may belong to an account that was deleted.");
  if (onlyUser && row.user_id !== onlyUser) throw new HttpError(400, "wrong_passkey", "Use a passkey for this account.");
  const uh = cred.response && cred.response.userHandle;
  if (uh && uh !== row.user_id) throw new HttpError(400, "passkey_rejected", "That passkey couldn't be verified.");
  let v;
  try { v = await verifyAuthentication(cred, Object.assign(rp(env, request), {challenge: flow.challenge}), {publicKey: row.public_key, alg: row.alg, counter: row.counter}); }
  catch (e) { throw webauthnError(e); }
  await env.DB.prepare("UPDATE credentials SET counter = ?, backed_up = ?, last_used_at = ? WHERE id = ?").bind(v.counter, v.backedUp ? 1 : 0, now(), row.id).run();
  return row;
}

export async function loginVerify(env, request) {
  await limitIP(env, request, "loginv", 30, 600);
  const body = await readJSON(request, 32 * 1024);
  const flow = await takeChallenge(env, body.flow, "auth");
  const row = await checkAssertion(env, request, body, flow, null);
  const cookie = await createSession(env, request, row.user_id, "passkey");
  return json({user: {id: row.user_id, handle: row.handle, owner: row.role === "owner"}}, 200, {"Set-Cookie": cookie});
}

/* ---- Step-up: confirm it's you before a sensitive change ---- */
export async function reauthOptions(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  await rateLimit(env, "reauth:" + s.user_id, 30, 600);
  const creds = (await env.DB.prepare("SELECT id, transports FROM credentials WHERE user_id = ?").bind(s.user_id).all()).results;
  if (!creds.length) throw new HttpError(400, "no_passkeys", "This account has no passkeys. Add one first.");
  const {id, challenge} = await newChallenge(env, "reauth", s.user_id, null);
  return json({flow: id, options: {challenge, rpId: rpId(env, request), timeout: CHALLENGE_TTL * 1000, userVerification: "required",
    allowCredentials: creds.map(c => ({type: "public-key", id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined}))}});
}

export async function reauthVerify(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const body = await readJSON(request, 32 * 1024);
  const flow = await takeChallenge(env, body.flow, "reauth");
  if (flow.userId !== s.user_id) throw new HttpError(400, "expired", "That attempt has expired. Try again.");
  await checkAssertion(env, request, body, flow, s.user_id);
  await env.DB.prepare("UPDATE sessions SET authed_at = ?, method = 'passkey' WHERE id = ?").bind(now(), s.id).run();
  return json({ok: true});
}

/* ---- Recovery codes ---- */
export async function recover(env, request) {
  await limitIP(env, request, "recover", 10, 3600);
  const body = await readJSON(request);
  const handle = normHandle(body.handle), code = normCode(body.code);
  await rateLimit(env, "recover:" + handle.slice(0, 40), 6, 3600);
  const generic = new HttpError(400, "bad_code", "That name and recovery code don't match. Each code works once.");
  if (code.length !== 16 || !isB32(code)) throw generic;
  const hash = await sha256hex("rc:" + code);
  const row = await env.DB.prepare(
    `UPDATE recovery_codes SET used_at = ?1
      WHERE used_at IS NULL AND hash = ?2 AND user_id = (SELECT id FROM users WHERE handle = ?3)
      RETURNING user_id`).bind(now(), hash, handle).first();
  if (!row) throw generic;
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").bind(row.user_id).first();
  const cookie = await createSession(env, request, row.user_id, "recovery");
  return json({user: {id: row.user_id, handle}, recoveryLeft: left.n}, 200, {"Set-Cookie": cookie});
}

export async function regenerateRecovery(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  requireFresh(s);
  const rc = await newRecoveryCodes(env, s.user_id);
  await env.DB.batch(rc.stmts);
  return json({recoveryCodes: rc.codes});
}

/* ---- Link codes: sign in a new device from a signed-in one ---- */
export async function createLink(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  requireFresh(s);
  await rateLimit(env, "link:" + s.user_id, 10, 3600);
  const code = b32code(8), t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM link_codes WHERE user_id = ? OR expires_at <= ?").bind(s.user_id, t),
    env.DB.prepare("INSERT INTO link_codes (hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256hex("lk:" + code), s.user_id, t + LINK_TTL)
  ]);
  return json({code: groupCode(code), expires: t + LINK_TTL});
}

export async function redeemLink(env, request) {
  await limitIP(env, request, "linkr", 10, 600);
  const body = await readJSON(request);
  const code = normCode(body.code);
  const generic = new HttpError(400, "bad_code", "That code didn't work. Codes last ten minutes and work once.");
  if (code.length !== 8 || !isB32(code)) throw generic;
  const row = await env.DB.prepare("DELETE FROM link_codes WHERE hash = ? RETURNING user_id, expires_at").bind(await sha256hex("lk:" + code)).first();
  if (!row || row.expires_at < now()) throw generic;
  const u = await env.DB.prepare("SELECT handle, role FROM users WHERE id = ?").bind(row.user_id).first();
  if (!u) throw generic;
  const cookie = await createSession(env, request, row.user_id, "link");
  return json({user: {id: row.user_id, handle: u.handle, owner: u.role === "owner"}}, 200, {"Set-Cookie": cookie});
}

/* ---- Passkeys on the account ---- */
export async function listPasskeys(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const rows = (await env.DB.prepare("SELECT id, name, created_at, last_used_at, backed_up, transports FROM credentials WHERE user_id = ? ORDER BY created_at").bind(s.user_id).all()).results;
  return json({passkeys: rows.map(r => ({id: r.id, name: r.name, created: r.created_at, lastUsed: r.last_used_at, synced: !!r.backed_up,
    transports: r.transports ? JSON.parse(r.transports) : []}))});
}

export async function addPasskeyOptions(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  requireFresh(s);
  const creds = (await env.DB.prepare("SELECT id, transports FROM credentials WHERE user_id = ?").bind(s.user_id).all()).results;
  if (creds.length >= MAX_PASSKEYS) throw new HttpError(400, "too_many", "That's the most passkeys one account can have. Remove one first.");
  const {id, challenge} = await newChallenge(env, "add", s.user_id, null);
  return json({flow: id, options: creationOptions(env, request, s.user_id, s.handle, challenge, creds)});
}

export async function addPasskeyVerify(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const body = await readJSON(request, 32 * 1024);
  const flow = await takeChallenge(env, body.flow, "add");
  if (flow.userId !== s.user_id) throw new HttpError(400, "expired", "That attempt has expired. Try again.");
  let v;
  try { v = await verifyRegistration(body.credential, Object.assign(rp(env, request), {challenge: flow.challenge})); } catch (e) { throw webauthnError(e); }
  try {
    await env.DB.batch([
      storeCredential(env, s.user_id, v, passkeyName(body.name)),
      env.DB.prepare("UPDATE sessions SET authed_at = ?, method = 'passkey' WHERE id = ?").bind(now(), s.id)
    ]);
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(String(e && e.message))) throw new HttpError(409, "duplicate_passkey", "That passkey is already on your account.");
    throw e;
  }
  return json({ok: true, id: v.id});
}

export async function deletePasskey(env, request, ctx, credId) {
  const s = await requireSession(env, request, ctx);
  requireFresh(s);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?").bind(s.user_id).first();
  if (n.n <= 1) throw new HttpError(400, "last_passkey", "That's your only passkey. Add another before removing it.");
  const r = await env.DB.prepare("DELETE FROM credentials WHERE id = ? AND user_id = ?").bind(credId, s.user_id).run();
  if (!r.meta.changes) throw new HttpError(404, "not_found", "No such passkey.");
  return json({ok: true});
}

/* ---- Sessions ---- */
export async function logout(env, request, ctx) {
  const s = await getSession(env, request, ctx);
  if (s) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(s.id).run();
  return json({ok: true}, 200, {"Set-Cookie": clearCookie()});
}

export async function listSessions(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const rows = (await env.DB.prepare("SELECT id, created_at, last_seen_at, method, device FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC").bind(s.user_id, now()).all()).results;
  return json({sessions: rows.map(r => ({id: r.id.slice(0, 16), created: r.created_at, lastSeen: r.last_seen_at, method: r.method, device: r.device, current: r.id === s.id}))});
}

export async function revokeSession(env, request, ctx, shortId) {
  const s = await requireSession(env, request, ctx);
  if (!/^[0-9a-f]{16}$/.test(shortId)) bad("No such session.");
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ? AND id != ?").bind(s.user_id, shortId, s.id).run();
  return json({ok: true});
}
