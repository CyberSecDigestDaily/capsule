/* Request plumbing: security headers, JSON bodies, the same-origin check and sessions (adapted from the Dread List). */

import {HttpError, now, randomToken, sha256hex, deviceLabel} from "./util.js";

export const COOKIE = "__Host-capsule";
const SESSION_TTL = 30 * 86400;      // sliding: renewed while you keep using it
const SESSION_MAX = 180 * 86400;     // absolute: sign in again at least twice a year
export const FRESH = 15 * 60;        // sensitive changes need a passkey (or code) sign-in this recent
const MAX_SESSIONS = 20;

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Origin-Agent-Cluster": "?1",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()"
};
// Product photos come straight from the shops' image CDNs, so images may load from any https host. Scripts, styles,
// fonts and data are our own files only.
export const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https:; " +
  "connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export function withHeaders(res, kind) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  h.set("Content-Security-Policy", kind === "page" ? PAGE_CSP : API_CSP);
  if (kind === "api" && !h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(res.body, {status: res.status, statusText: res.statusText, headers: h});
}

export function json(data, status = 200, headers) {
  return new Response(JSON.stringify(data), {status, headers: Object.assign({"Content-Type": "application/json; charset=utf-8"}, headers || {})});
}

export function errorResponse(e) {
  if (e instanceof HttpError) {
    const headers = e.extra && e.extra.retryAfter ? {"Retry-After": String(e.extra.retryAfter)} : undefined;
    return json({error: e.code, message: e.message}, e.status, headers);
  }
  console.error("Unhandled error:", e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : String(e));
  return json({error: "server_error", message: "Something went wrong on our side. Try again in a moment."}, 500);
}

/* The canonical origins: ORIGIN when set (a custom domain), otherwise whatever address this Worker is answering on
   (the workers.dev URL before a domain is chosen). */
export function allowedOrigins(env, request) {
  const set = String(env.ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (set.length) return set;
  return request ? [new URL(request.url).origin] : [];
}
export function rpId(env, request) {
  return env.RP_ID || new URL(allowedOrigins(env, request)[0] || request.url).hostname;
}

/* State-changing requests must come from our own pages: the Origin header has to match, and bodies must be JSON
   (which a cross-site form can't send without a CORS preflight we never answer). The session cookie is also
   SameSite=Strict, so this is the third lock on the same door. The review key (a bearer token) is exempt: it never
   rides along with a browser on its own. */
export function checkOrigin(request, env) {
  const m = request.method;
  if (m === "GET" || m === "HEAD") return;
  if ((request.headers.get("Authorization") || "").startsWith("Bearer ")) return;
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env, request).includes(origin)) throw new HttpError(403, "bad_origin", "Requests must come from Capsule itself.");
}

export async function readJSON(request, maxBytes = 64 * 1024) {
  const ct = request.headers.get("Content-Type") || "";
  if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, "bad_content_type", "Send JSON.");
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > maxBytes) throw new HttpError(413, "too_large", "That request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "That request is too large.");
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v;
  } catch (e) {
    throw new HttpError(400, "bad_json", "That wasn't valid JSON.");
  }
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

const cookieAttrs = maxAge => `Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
export const clearCookie = () => `${COOKIE}=; ${cookieAttrs(0)}`;

/* New session: a 256-bit random token in the cookie, only its SHA-256 in the database. */
export async function createSession(env, request, userId, method) {
  const token = randomToken(32), t = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, authed_at, method, device)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(await sha256hex(token), userId, t, t, t + SESSION_TTL, t, method, deviceLabel(request.headers.get("User-Agent"))),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND (expires_at <= ?2 OR id NOT IN
                      (SELECT id FROM sessions WHERE user_id = ?1 ORDER BY last_seen_at DESC, created_at DESC LIMIT ?3))`)
      .bind(userId, t, MAX_SESSIONS)
  ]);
  return `${COOKIE}=${token}; ${cookieAttrs(SESSION_TTL)}`;
}

/* The signed-in user for this request, or null. Renews the sliding expiry at most once an hour. */
export async function getSession(env, request, ctx) {
  const token = readCookie(request, COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = await sha256hex(token), t = now();
  const s = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, s.authed_at, s.method, u.handle, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`).bind(id, t).first();
  if (!s) return null;
  if (t - s.last_seen_at > 3600) {
    const exp = Math.min(s.created_at + SESSION_MAX, t + SESSION_TTL);
    const p = env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").bind(t, exp, id).run();
    if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {})); else await p;
  }
  return s;
}

export async function requireSession(env, request, ctx) {
  const s = await getSession(env, request, ctx);
  if (!s) throw new HttpError(401, "signed_out", "Sign in first.");
  return s;
}

export function requireFresh(session) {
  if (now() - session.authed_at > FRESH) throw new HttpError(403, "reauth", "Confirm it's you with your passkey first.");
}
