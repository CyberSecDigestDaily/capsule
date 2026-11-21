/* D1 schema, created on first use so deploys need no migration step. Bump SCHEMA_VERSION and append statements
   (never edit old ones) when the schema changes. Deleting a user cascades to everything they own. */

import {randomToken, hmacHex, now, HttpError} from "./util.js";

const SCHEMA_VERSION = "1";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // role: "owner" for the account made with the owner invite (the one Claude's daily review reads), else "member".
  // brief: the style brief as JSON; cfg: settings (targets, ceilings, pins, theme, sleeve length...).
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     handle TEXT NOT NULL UNIQUE,
     role TEXT NOT NULL DEFAULT 'member',
     created_at INTEGER NOT NULL,
     rev INTEGER NOT NULL DEFAULT 0,
     cfg TEXT, cfg_t TEXT, cfg_rev INTEGER NOT NULL DEFAULT 0,
     brief TEXT, brief_t TEXT, brief_rev INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS credentials (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     public_key TEXT NOT NULL,
     alg INTEGER NOT NULL,
     counter INTEGER NOT NULL DEFAULT 0,
     transports TEXT,
     aaguid TEXT,
     backup_eligible INTEGER NOT NULL DEFAULT 0,
     backed_up INTEGER NOT NULL DEFAULT 0,
     name TEXT,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     authed_at INTEGER NOT NULL,
     method TEXT NOT NULL,
     device TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS recovery_codes (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     hash TEXT NOT NULL,
     used_at INTEGER,
     PRIMARY KEY (user_id, hash)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS challenges (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     challenge TEXT NOT NULL,
     user_id TEXT,
     data TEXT,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS link_codes (
     hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS link_codes_user ON link_codes(user_id)`,
  // Invites are single-use: only their hashes live in the Worker's config; a used one is recorded here.
  `CREATE TABLE IF NOT EXISTS invites_used (hash TEXT PRIMARY KEY, user_id TEXT, used_at INTEGER NOT NULL) WITHOUT ROWID`,
  // One row per piece you've reacted to (or been shown), merged newest-change-wins on the timestamp each device stamps.
  `CREATE TABLE IF NOT EXISTS entries (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     item TEXT NOT NULL,
     t TEXT NOT NULL,
     s TEXT,
     v TEXT NOT NULL,
     rev INTEGER NOT NULL,
     PRIMARY KEY (user_id, item)
   ) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS entries_rev ON entries(user_id, rev)`,
  // Notes Claude's review leaves for you (the weekly "what it learned").
  `CREATE TABLE IF NOT EXISTS notes (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     body TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS notes_user ON notes(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL) WITHOUT ROWID`
];

let ready = null, pepperValue = null;

/* Once per isolate: one read in the steady state, the full schema on a fresh database. */
export function ensureSchema(env) {
  if (!ready) {
    ready = (async () => {
      let rows = [];
      try { rows = (await env.DB.prepare("SELECT k, v FROM meta WHERE k IN ('schema', 'pepper')").all()).results || []; } catch (e) { rows = []; }
      const get = k => (rows.find(r => r.k === k) || {}).v;
      if (get("schema") !== SCHEMA_VERSION || !get("pepper")) {
        await env.DB.batch([
          ...SCHEMA.map(s => env.DB.prepare(s)),
          env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('pepper', ?)").bind(randomToken(32)),
          env.DB.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(SCHEMA_VERSION)
        ]);
        rows = (await env.DB.prepare("SELECT k, v FROM meta WHERE k IN ('schema', 'pepper')").all()).results || [];
      }
      pepperValue = get("pepper") || (rows.find(r => r.k === "pepper") || {}).v;
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

/* Rate-limit keys use a keyed hash of the client IP, so raw addresses are never written down. */
export async function ipKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  return (await hmacHex(pepperValue || "dev", "ip:" + ip)).slice(0, 24);
}

/* Fixed-window counter. Throws 429 when the window's budget is spent. */
export async function rateLimit(env, key, max, windowSec) {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rl (k, n, reset) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN rl.reset <= ?3 THEN 1 ELSE rl.n + 1 END,
                                  reset = CASE WHEN rl.reset <= ?3 THEN ?2 ELSE rl.reset END
     RETURNING n, reset`).bind(key, t + windowSec, t).first();
  if (row && row.n > max) throw new HttpError(429, "rate_limited", "Too many attempts. Wait a little and try again.", {retryAfter: Math.max(1, row.reset - t)});
}

export async function limitIP(env, request, bucket, max, windowSec) {
  await rateLimit(env, `ip:${bucket}:${await ipKey(request)}`, max, windowSec);
}

/* Nightly tidy-up (cron trigger). */
export async function cleanup(env) {
  await ensureSchema(env);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM challenges WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM link_codes WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM rl WHERE reset <= ?").bind(t),
    env.DB.prepare("DELETE FROM notes WHERE created_at <= ?").bind(t - 120 * 86400)
  ]);
}
