/* Small helpers shared by the Worker (same as the Dread List's). No dependencies: everything runs on the Workers runtime's Web Crypto. */

export const te = new TextEncoder();
export const td = new TextDecoder("utf-8", {fatal: true});

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}

export const now = () => Math.floor(Date.now() / 1000);

export function b64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) throw new HttpError(400, "bad_encoding", "Malformed base64url data.");
  const t = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 32) => b64url(randomBytes(n));

export async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? te.encode(data) : data));
}
export const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
export const sha256hex = async data => hex(await sha256(data));

export async function hmacHex(keyText, msg) {
  const key = await crypto.subtle.importKey("raw", te.encode(keyText), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(msg))));
}

export function equalBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* Crockford base32 without I, L, O, U: easy to read aloud and type. Codes are shown in groups of four. */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function b32code(chars) {
  const bytes = randomBytes(chars);
  let s = "";
  for (let i = 0; i < chars; i++) s += B32[bytes[i] & 31];
  return s;
}
export const groupCode = s => s.match(/.{1,4}/g).join("-");
/* Accept what people type: any case, spaces or dashes, and O/I/L for 0/1. */
export function normCode(input) {
  return String(input || "").toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}
export const isB32 = s => /^[0-9A-HJKMNP-TV-Z]+$/.test(s);

/* A coarse device label for the sessions list ("Firefox on Windows"); the full user agent is never stored. */
export function deviceLabel(ua) {
  const s = String(ua || "");
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Browser";
  const os = /iPad/.test(s) ? "iPad" : /iPhone|iPod/.test(s) ? "iPhone" : /Android/.test(s) ? "Android" : /CrOS/.test(s) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function isoOk(t) {
  return typeof t === "string" && t.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/.test(t) && !isNaN(Date.parse(t));
}
