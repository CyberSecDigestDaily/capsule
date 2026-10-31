/* Your account: rename, export everything, delete everything, and read the notes Claude's review left for you. */

import {HttpError} from "./util.js";
import {json, readJSON, requireSession, requireFresh, clearCookie} from "./http.js";
import {checkHandle} from "./validate.js";

export async function patchMe(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const body = await readJSON(request);
  if (body.handle !== undefined) {
    const h = checkHandle(body.handle);
    if (h !== s.handle) {
      try { await env.DB.prepare("UPDATE users SET handle = ? WHERE id = ?").bind(h, s.user_id).run(); }
      catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, "handle_taken", "That name is taken. Pick another."); throw e; }
    }
  }
  const u = await env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(s.user_id).first();
  return json({handle: u.handle});
}

export async function deleteMe(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  requireFresh(s);
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(s.user_id).run();
  return json({ok: true}, 200, {"Set-Cookie": clearCookie()});
}

export async function exportMe(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const [u, entries, creds, sessions, notes] = await env.DB.batch([
    env.DB.prepare("SELECT handle, role, created_at, cfg, brief FROM users WHERE id = ?").bind(s.user_id),
    env.DB.prepare("SELECT item, t, v FROM entries WHERE user_id = ?").bind(s.user_id),
    env.DB.prepare("SELECT name, created_at, last_used_at, backed_up FROM credentials WHERE user_id = ?").bind(s.user_id),
    env.DB.prepare("SELECT created_at, last_seen_at, method, device FROM sessions WHERE user_id = ?").bind(s.user_id),
    env.DB.prepare("SELECT kind, created_at, body FROM notes WHERE user_id = ? ORDER BY created_at").bind(s.user_id)
  ]);
  const user = u.results[0];
  const reactions = {};
  for (const r of entries.results) { try { reactions[r.item] = Object.assign(JSON.parse(r.v), {t: r.t}); } catch (e) { /* skip */ } }
  const iso = t => new Date(t * 1000).toISOString();
  const body = {exported: new Date().toISOString(), v: 1,
    account: {handle: user.handle, owner: user.role === "owner", created: iso(user.created_at)},
    brief: user.brief ? JSON.parse(user.brief) : null, settings: user.cfg ? JSON.parse(user.cfg) : null, reactions,
    notes: notes.results.map(n => ({kind: n.kind, created: iso(n.created_at), body: n.body})),
    passkeys: creds.results.map(c => ({name: c.name, created: iso(c.created_at), synced: !!c.backed_up})),
    sessions: sessions.results.map(x => ({created: iso(x.created_at), lastSeen: iso(x.last_seen_at), method: x.method, device: x.device}))};
  return json(body, 200, {"Content-Disposition": `attachment; filename="capsule-account-${new Date().toISOString().slice(0, 10)}.json"`});
}

export async function myNotes(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  const rows = (await env.DB.prepare("SELECT id, kind, created_at, body FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 12").bind(s.user_id).all()).results;
  return json({notes: rows.map(r => ({id: r.id, kind: r.kind, created: r.created_at, body: r.body}))});
}
