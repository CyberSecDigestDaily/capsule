/* Your reactions and settings on the server: one row per piece, merged last-writer-wins on the timestamp each device
   stamps on its change. Every write bumps the account's revision, so a device asks only for what changed since the
   revision it last saw. (The Dread List's sync, shaped for Capsule.) */

import {HttpError} from "./util.js";
import {json, readJSON, requireSession} from "./http.js";
import {rateLimit} from "./db.js";
import {cleanEntry, cleanCfg, cleanPatch, cleanBrief, ITEM_KEY, bad} from "./validate.js";
import {applyCfgPatch} from "../docs/engine.js";

const MAX_BATCH = 2000, MAX_ENTRIES = 20000;

function rowsToEntries(rows) {
  const out = {};
  for (const r of rows) {
    try { out[r.item] = Object.assign(JSON.parse(r.v), {t: r.t}); } catch (e) { /* skip a bad row */ }
  }
  return out;
}

export async function changesSince(env, userId, since) {
  const [u, rows] = await env.DB.batch([
    env.DB.prepare("SELECT rev, cfg, cfg_rev, brief, brief_rev FROM users WHERE id = ?").bind(userId),
    env.DB.prepare("SELECT item, t, v FROM entries WHERE user_id = ? AND rev > ?").bind(userId, since)
  ]);
  const user = u.results[0];
  if (!user) throw new HttpError(401, "signed_out", "Sign in first.");
  const out = {rev: user.rev, entries: rowsToEntries(rows.results)};
  if (user.cfg && user.cfg_rev > since) { try { out.cfg = JSON.parse(user.cfg); } catch (e) { /* ignore */ } }
  if (user.brief && user.brief_rev > since) { try { out.brief = JSON.parse(user.brief); } catch (e) { /* ignore */ } }
  return out;
}

const sinceOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : 0; };

export async function getState(env, request, ctx, url) {
  const s = await requireSession(env, request, ctx);
  return json(await changesSince(env, s.user_id, sinceOf(url.searchParams.get("since"))));
}

export async function postState(env, request, ctx) {
  const s = await requireSession(env, request, ctx);
  await rateLimit(env, "sync:" + s.user_id, 600, 600);
  const body = await readJSON(request, 3 * 1024 * 1024);
  const since = sinceOf(body.since);
  const serverNow = Date.now();
  const batch = [];
  if (body.entries && typeof body.entries === "object" && !Array.isArray(body.entries)) {
    const keys = Object.keys(body.entries);
    if (keys.length > MAX_BATCH) bad(`Send at most ${MAX_BATCH} pieces at a time.`);
    for (const key of keys) {
      if (!ITEM_KEY.test(key)) continue;
      const e = cleanEntry(body.entries[key], serverNow);
      if (!e) continue;
      const {t, ...rest} = e;
      const v = JSON.stringify(rest);
      if (v.length > 6000) continue;
      batch.push({k: key, t, s: rest.s || null, v});
    }
  }
  let cfg = body.cfg ? cleanCfg(body.cfg) : null, patched = false;
  const patch = cleanPatch(body.cfgPatch);
  if (patch) {
    // Applied to the account's current settings, so changes from different devices combine instead of overwriting.
    const row = await env.DB.prepare("SELECT cfg FROM users WHERE id = ?").bind(s.user_id).first();
    let cur = {};
    try { cur = row && row.cfg ? JSON.parse(row.cfg) : {}; } catch (e) { cur = {}; }
    cfg = cleanCfg(Object.assign(applyCfgPatch(cur, patch), {t: new Date(serverNow).toISOString()}));
    patched = true;
  }
  const brief = body.brief ? cleanBrief(body.brief) : null;
  if (batch.length) {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE user_id = ?").bind(s.user_id).first();
    if (n.n + batch.length > MAX_ENTRIES + MAX_BATCH) bad("Your history has reached its size limit.");
  }
  if (batch.length || cfg || brief) {
    const stmts = [env.DB.prepare("UPDATE users SET rev = rev + 1 WHERE id = ?").bind(s.user_id)];
    if (batch.length) {
      // One statement for the whole batch: rows come in as a JSON array, and a row only replaces an older one.
      stmts.push(env.DB.prepare(
        `INSERT INTO entries (user_id, item, t, s, v, rev)
         SELECT ?1, json_extract(value, '$.k'), json_extract(value, '$.t'), json_extract(value, '$.s'), json_extract(value, '$.v'),
                (SELECT rev FROM users WHERE id = ?1)
           FROM json_each(?2) WHERE true
         ON CONFLICT(user_id, item) DO UPDATE SET t = excluded.t, s = excluded.s, v = excluded.v, rev = excluded.rev
         WHERE excluded.t > entries.t`).bind(s.user_id, JSON.stringify(batch)));
    }
    if (cfg && patched) {
      stmts.push(env.DB.prepare(`UPDATE users SET cfg = ?2, cfg_t = ?3, cfg_rev = rev WHERE id = ?1`).bind(s.user_id, JSON.stringify(cfg), cfg.t));
    } else if (cfg) {
      stmts.push(env.DB.prepare(`UPDATE users SET cfg = ?2, cfg_t = ?3, cfg_rev = rev WHERE id = ?1 AND (cfg_t IS NULL OR cfg_t < ?3)`)
        .bind(s.user_id, JSON.stringify(cfg), cfg.t));
    }
    if (brief) {
      const bt = new Date(serverNow).toISOString();
      stmts.push(env.DB.prepare(`UPDATE users SET brief = ?2, brief_t = ?3, brief_rev = rev WHERE id = ?1`).bind(s.user_id, JSON.stringify(brief), bt));
    }
    await env.DB.batch(stmts);
  }
  return json(await changesSince(env, s.user_id, since));
}
