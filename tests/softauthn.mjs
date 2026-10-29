// A software passkey for tests: makes real WebAuthn registration and assertion responses (ES256, Ed25519 or RS256)
// the way a browser and authenticator would, so the Worker's verification runs against genuine signatures.
import {webcrypto as crypto} from "node:crypto";

const te = new TextEncoder();
export const b64url = b => Buffer.from(b).toString("base64url");
export const unb64url = s => new Uint8Array(Buffer.from(s, "base64url"));
const sha256 = async d => new Uint8Array(await crypto.subtle.digest("SHA-256", d));
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

// Minimal canonical CBOR encoder: ints, byte strings, text, arrays, maps (Map or plain object).
function head(major, n) {
  if (n < 24) return Uint8Array.of((major << 5) | n);
  if (n < 256) return Uint8Array.of((major << 5) | 24, n);
  if (n < 65536) return Uint8Array.of((major << 5) | 25, n >> 8, n & 255);
  return Uint8Array.of((major << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}
export function cbor(v) {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (v instanceof Uint8Array) return concat(head(2, v.length), v);
  if (typeof v === "string") { const b = te.encode(v); return concat(head(3, b.length), b); }
  if (Array.isArray(v)) return concat(head(4, v.length), ...v.map(cbor));
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return concat(head(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)]));
}

function rawToDer(raw) {
  const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = b.slice(i); if (v[0] & 0x80) v = concat(Uint8Array.of(0), v); return concat(Uint8Array.of(2, v.length), v); };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}

export class SoftAuthenticator {
  constructor(alg = -7) { this.alg = alg; this.creds = []; }

  async create(options, origin, tweak = {}) {
    const alg = this.alg;
    let keys, cose;
    if (alg === -7) {
      keys = await crypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]);
      const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
      cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, unb64url(jwk.x)], [-3, unb64url(jwk.y)]]);
    } else if (alg === -8) {
      keys = await crypto.subtle.generateKey({name: "Ed25519"}, true, ["sign", "verify"]);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
      cose = new Map([[1, 1], [3, -8], [-1, 6], [-2, raw]]);
    } else {
      keys = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256"}, true, ["sign", "verify"]);
      const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
      cose = new Map([[1, 3], [3, -257], [-1, unb64url(jwk.n)], [-2, unb64url(jwk.e)]]);
    }
    const credId = crypto.getRandomValues(new Uint8Array(32));
    const rpIdHash = await sha256(te.encode(tweak.rpId || options.rp.id));
    const flags = tweak.flags ?? (0x01 | 0x04 | 0x08 | 0x10 | 0x40);
    const coseBytes = cbor(cose);
    const authData = concat(rpIdHash, Uint8Array.of(flags, 0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(credId.length >> 8, credId.length & 255), credId, coseBytes);
    const clientData = te.encode(JSON.stringify({type: tweak.type || "webauthn.create", challenge: tweak.challenge || options.challenge, origin: tweak.origin || origin, crossOrigin: false}));
    const attObj = cbor({fmt: "none", attStmt: new Map(), authData});
    const cred = {id: b64url(credId), keys, alg, userId: options.user.id, counter: 0, useCounter: !!tweak.useCounter};
    this.creds.push(cred);
    return {id: cred.id, rawId: cred.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {credProps: {rk: true}},
      response: {clientDataJSON: b64url(clientData), attestationObject: b64url(attObj), transports: ["internal", "hybrid"]}};
  }

  async get(options, origin, tweak = {}) {
    const allowed = (options.allowCredentials || []).map(c => c.id);
    const cred = tweak.cred || this.creds.find(c => !allowed.length || allowed.includes(c.id));
    if (!cred) throw new Error("no credential");
    if (cred.useCounter && !tweak.keepCounter) cred.counter++;
    const rpIdHash = await sha256(te.encode(tweak.rpId || options.rpId));
    const c = cred.counter;
    const authData = concat(rpIdHash, Uint8Array.of(tweak.flags ?? 0x05, (c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255));
    const clientData = te.encode(JSON.stringify({type: tweak.type || "webauthn.get", challenge: tweak.challenge || options.challenge, origin: tweak.origin || origin, crossOrigin: false}));
    const signed = concat(authData, await sha256(clientData));
    let sig;
    if (cred.alg === -7) sig = rawToDer(new Uint8Array(await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, cred.keys.privateKey, signed)));
    else if (cred.alg === -8) sig = new Uint8Array(await crypto.subtle.sign({name: "Ed25519"}, cred.keys.privateKey, signed));
    else sig = new Uint8Array(await crypto.subtle.sign({name: "RSASSA-PKCS1-v1_5"}, cred.keys.privateKey, signed));
    if (tweak.corruptSig) sig[sig.length - 3] ^= 0xff;
    const ad = tweak.corruptAuthData ? (() => { const a = authData.slice(); a[33] ^= 1; return a; })() : authData;
    return {id: cred.id, rawId: cred.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
      response: {clientDataJSON: b64url(clientData), authenticatorData: b64url(ad), signature: b64url(sig), userHandle: cred.userId}};
  }
}
