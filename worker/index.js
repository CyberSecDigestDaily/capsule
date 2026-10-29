/* Capsule Worker: serves the site (static assets from docs/) and the /api used for accounts, syncing your reactions
   and settings, and Claude's daily review. Data lives in D1. No secrets: invites and the review key are configured as
   SHA-256 hashes only, so nothing usable is in wrangler.jsonc or the public repo. Built on the Dread List's Worker. */

import {HttpError} from "./util.js";
import {withHeaders, json, errorResponse, checkOrigin} from "./http.js";
import {ensureSchema, cleanup} from "./db.js";
import * as auth from "./auth.js";
import {getState, postState} from "./sync.js";
import {patchMe, deleteMe, exportMe, myNotes} from "./account.js";
import {getReview, postNote} from "./review.js";

/* [method, path pattern, handler(env, request, ctx, params, url)]. :name matches one path segment. */
const ROUTES = [
  ["GET", "/api/health", () => json({ok: true, app: "capsule"})],
  ["GET", "/api/me", (env, req, ctx) => auth.me(env, req, ctx)],
  ["PATCH", "/api/me", (env, req, ctx) => patchMe(env, req, ctx)],
  ["DELETE", "/api/me", (env, req, ctx) => deleteMe(env, req, ctx)],
  ["GET", "/api/me/export", (env, req, ctx) => exportMe(env, req, ctx)],
  ["GET", "/api/me/notes", (env, req, ctx) => myNotes(env, req, ctx)],
  ["GET", "/api/me/passkeys", (env, req, ctx) => auth.listPasskeys(env, req, ctx)],
  ["POST", "/api/me/passkeys/options", (env, req, ctx) => auth.addPasskeyOptions(env, req, ctx)],
  ["POST", "/api/me/passkeys/verify", (env, req, ctx) => auth.addPasskeyVerify(env, req, ctx)],
  ["DELETE", "/api/me/passkeys/:id", (env, req, ctx, p) => auth.deletePasskey(env, req, ctx, p.id)],
  ["POST", "/api/me/recovery", (env, req, ctx) => auth.regenerateRecovery(env, req, ctx)],
  ["POST", "/api/me/link", (env, req, ctx) => auth.createLink(env, req, ctx)],
  ["GET", "/api/me/sessions", (env, req, ctx) => auth.listSessions(env, req, ctx)],
  ["DELETE", "/api/me/sessions/:id", (env, req, ctx, p) => auth.revokeSession(env, req, ctx, p.id)],
  ["POST", "/api/auth/register/options", (env, req) => auth.registerOptions(env, req)],
  ["POST", "/api/auth/register/verify", (env, req) => auth.registerVerify(env, req)],
  ["POST", "/api/auth/login/options", (env, req) => auth.loginOptions(env, req)],
  ["POST", "/api/auth/login/verify", (env, req) => auth.loginVerify(env, req)],
  ["POST", "/api/auth/reauth/options", (env, req, ctx) => auth.reauthOptions(env, req, ctx)],
  ["POST", "/api/auth/reauth/verify", (env, req, ctx) => auth.reauthVerify(env, req, ctx)],
  ["POST", "/api/auth/recover", (env, req) => auth.recover(env, req)],
  ["POST", "/api/auth/link", (env, req) => auth.redeemLink(env, req)],
  ["POST", "/api/auth/logout", (env, req, ctx) => auth.logout(env, req, ctx)],
  ["GET", "/api/state", (env, req, ctx, p, url) => getState(env, req, ctx, url)],
  ["POST", "/api/state", (env, req, ctx) => postState(env, req, ctx)],
  ["GET", "/api/review", (env, req) => getReview(env, req)],
  ["POST", "/api/review/note", (env, req) => postNote(env, req)]
].map(([method, path, fn]) => {
  const names = [];
  const re = new RegExp("^" + path.replace(/:([a-z]+)/g, (m, n) => { names.push(n); return "([^/]{1,200})"; }) + "$");
  return {method, re, names, fn};
});

async function api(request, env, ctx, url) {
  let pathMatched = false;
  for (const r of ROUTES) {
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== request.method && !(r.method === "GET" && request.method === "HEAD")) continue;
    const params = {};
    try { r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); }); }
    catch (e) { throw new HttpError(400, "bad_path", "Malformed address."); }
    checkOrigin(request, env);
    await ensureSchema(env);
    return r.fn(env, request, ctx, params, url);
  }
  if (pathMatched) throw new HttpError(405, "method_not_allowed", "Method not allowed.");
  throw new HttpError(404, "not_found", "No such endpoint.");
}

const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
const text = (body, maxAge) => new Response(body, {headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}`}});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.protocol === "http:" && !/^(localhost|127\.)/.test(url.hostname)) {
      return withHeaders(Response.redirect("https://" + url.host + url.pathname + url.search, 301), "api");
    }
    if (url.pathname === "/robots.txt") return withHeaders(text(ROBOTS_TXT, 86400), "api");
    if (url.pathname.startsWith("/api/")) {
      let res;
      try { res = await api(request, env, ctx, url); } catch (e) { res = errorResponse(e); }
      return withHeaders(res, "api");
    }
    const res = await env.ASSETS.fetch(request);
    return (res.headers.get("Content-Type") || "").startsWith("text/html") && url.pathname !== "/drop.html" ? withHeaders(res, "page") : res;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  }
};
