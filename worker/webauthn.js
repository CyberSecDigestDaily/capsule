/* WebAuthn (passkey) verification (shared with the Dread List) on Web Crypto, following the relying-party steps of WebAuthn Level 3 sections 7.1
   and 7.2. Attestation is requested as "none", so the attestation statement is not trusted or checked: what matters is
   that the client data names our origin and a fresh single-use challenge, the authenticator data names our RP ID and
   carries the user-present and user-verified flags, and every sign-in is signed by the key registered for that
   credential. Supported keys: Ed25519 (-8), ECDSA P-256 (-7) and RSA PKCS#1 v1.5 SHA-256 (-257). */

import {decodeCBOR, CborError} from "./cbor.js";
import {te, b64url, unb64url, sha256, hex, equalBytes, concat} from "./util.js";

export const ALGS = [-8, -7, -257];
const FLAG = {UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80};
const tdFatal = new TextDecoder("utf-8", {fatal: true});
const TRANSPORTS = new Set(["usb", "nfc", "ble", "smart-card", "hybrid", "internal"]);

export class WebAuthnError extends Error {}
const fail = msg => { throw new WebAuthnError(msg); };

/* Authenticator data: rpIdHash(32) flags(1) signCount(4) [attested credential data] [extensions]. */
export function parseAuthData(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 37) fail("Authenticator data is too short");
  const flags = bytes[32];
  const counter = new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0);
  let pos = 37, cred = null;
  try {
    if (flags & FLAG.AT) {
      if (bytes.length < pos + 18) fail("Attested credential data is truncated");
      const aaguid = bytes.slice(pos, pos + 16); pos += 16;
      const idLen = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2;
      if (idLen < 16 || idLen > 1023 || bytes.length < pos + idLen) fail("Credential id length is invalid");
      const credentialId = bytes.slice(pos, pos + idLen); pos += idLen;
      const {value: cose, length} = decodeCBOR(bytes.subarray(pos), {allowTrailing: true});
      if (!(cose instanceof Map)) fail("Credential public key is not a COSE map");
      const publicKey = bytes.slice(pos, pos + length); pos += length;
      cred = {aaguid, credentialId, publicKey, cose};
    }
    if (flags & FLAG.ED) {
      const {length} = decodeCBOR(bytes.subarray(pos), {allowTrailing: true});
      pos += length;
    }
  } catch (e) {
    if (e instanceof CborError) fail("Authenticator data is malformed");
    throw e;
  }
  if (pos !== bytes.length) fail("Authenticator data has trailing bytes");
  return {rpIdHash: bytes.slice(0, 32), flags, counter, cred,
    up: !!(flags & FLAG.UP), uv: !!(flags & FLAG.UV), be: !!(flags & FLAG.BE), bs: !!(flags & FLAG.BS)};
}

function clientData(b64, type, expected) {
  const bytes = unb64url(b64);
  if (bytes.length > 4096) fail("Client data is too large");
  let cd;
  try { cd = JSON.parse(tdFatal.decode(bytes)); } catch (e) { fail("Client data is not valid JSON"); }
  if (!cd || typeof cd !== "object") fail("Client data is not an object");
  if (cd.type !== type) fail("Unexpected ceremony type");
  if (typeof cd.challenge !== "string" || cd.challenge !== expected.challenge) fail("Challenge mismatch");
  if (typeof cd.origin !== "string" || !expected.origins.includes(cd.origin)) fail("Origin mismatch");
  if (cd.crossOrigin === true) fail("Cross-origin ceremonies are not allowed");
  return bytes;
}

async function checkAuthData(ad, expected) {
  if (!equalBytes(ad.rpIdHash, await sha256(te.encode(expected.rpId)))) fail("RP ID mismatch");
  if (!ad.up) fail("User presence flag not set");
  if (expected.requireUV && !ad.uv) fail("User verification flag not set");
  if (ad.bs && !ad.be) fail("Backup state set without backup eligibility");
}

/* COSE key -> what Web Crypto needs to verify with it. */
function coseKey(cose) {
  const kty = cose.get(1), alg = cose.get(3);
  const bytes = (v, n) => v instanceof Uint8Array && (n === undefined || v.length === n);
  if (alg === -7) {
    const x = cose.get(-2), y = cose.get(-3);
    if (kty !== 2 || cose.get(-1) !== 1 || !bytes(x, 32) || !bytes(y, 32)) fail("Invalid P-256 key");
    return {alg, format: "jwk", key: {kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y), ext: true},
      importAlg: {name: "ECDSA", namedCurve: "P-256"}, verifyAlg: {name: "ECDSA", hash: "SHA-256"}, der: true};
  }
  if (alg === -257) {
    const n = cose.get(-1), e = cose.get(-2);
    if (kty !== 3 || !bytes(n) || !bytes(e) || n.length < 256 || n.length > 1024 || e.length > 8) fail("Invalid RSA key");
    return {alg, format: "jwk", key: {kty: "RSA", n: b64url(n), e: b64url(e), alg: "RS256", ext: true},
      importAlg: {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, verifyAlg: {name: "RSASSA-PKCS1-v1_5"}};
  }
  if (alg === -8) {
    const x = cose.get(-2);
    if (kty !== 1 || cose.get(-1) !== 6 || !bytes(x, 32)) fail("Invalid Ed25519 key");
    return {alg, format: "raw", key: x, importAlg: {name: "Ed25519"}, verifyAlg: {name: "Ed25519"}};
  }
  fail("Unsupported key algorithm");
}

async function importKey(k) {
  try {
    return await crypto.subtle.importKey(k.format, k.key, k.importAlg, false, ["verify"]);
  } catch (e) {
    if (k.alg === -8) { // older runtimes name it NODE-ED25519
      try { return await crypto.subtle.importKey("raw", k.key, {name: "NODE-ED25519", namedCurve: "NODE-ED25519"}, false, ["verify"]); } catch (e2) { /* fall through */ }
    }
    fail("Public key could not be imported");
  }
}

/* ECDSA signatures arrive DER-encoded; Web Crypto wants r || s, each padded to 32 bytes. */
export function derToRaw(der) {
  let p = 0;
  const byte = () => { if (p >= der.length) fail("Signature is truncated"); return der[p++]; };
  if (byte() !== 0x30) fail("Signature is not a DER sequence");
  let len = byte();
  if (len & 0x80) { const n = len & 0x7f; if (n < 1 || n > 2) fail("Bad DER length"); len = 0; for (let i = 0; i < n; i++) len = (len << 8) | byte(); }
  if (p + len !== der.length) fail("DER length mismatch");
  const int = () => {
    if (byte() !== 0x02) fail("Signature integer missing");
    const l = byte();
    if (l < 1 || l > 33 || p + l > der.length) fail("Bad signature integer");
    let v = der.slice(p, p + l); p += l;
    while (v.length > 1 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) fail("Signature integer too long");
    const out = new Uint8Array(32); out.set(v, 32 - v.length);
    return out;
  };
  const r = int(), s = int();
  if (p !== der.length) fail("Trailing bytes in signature");
  return concat(r, s);
}

function shape(cred, kind) {
  if (!cred || typeof cred !== "object" || cred.type !== "public-key" || typeof cred.id !== "string") fail("Not a public-key credential");
  const r = cred.response;
  if (!r || typeof r !== "object" || typeof r.clientDataJSON !== "string") fail("Credential response is missing");
  if (kind === "create" && typeof r.attestationObject !== "string") fail("Attestation object is missing");
  if (kind === "get" && (typeof r.authenticatorData !== "string" || typeof r.signature !== "string")) fail("Assertion is incomplete");
  if (cred.rawId !== undefined && cred.rawId !== cred.id) fail("Credential id mismatch");
  return r;
}

/* Registration: returns what to store for the new credential. expected = {challenge, origins, rpId, requireUV}. */
export async function verifyRegistration(cred, expected) {
  const r = shape(cred, "create");
  clientData(r.clientDataJSON, "webauthn.create", expected);
  let att;
  try { att = decodeCBOR(unb64url(r.attestationObject)).value; } catch (e) { if (e instanceof CborError) fail("Attestation object is malformed"); throw e; }
  if (!(att instanceof Map) || typeof att.get("fmt") !== "string" || !(att.get("authData") instanceof Uint8Array)) fail("Attestation object is incomplete");
  const ad = parseAuthData(att.get("authData"));
  await checkAuthData(ad, expected);
  if (!ad.cred) fail("No credential in the registration");
  if (!equalBytes(ad.cred.credentialId, unb64url(cred.id))) fail("Credential id mismatch");
  const key = coseKey(ad.cred.cose);
  if (!ALGS.includes(key.alg)) fail("Key algorithm not allowed");
  await importKey(key);
  const transports = Array.isArray(r.transports) ? r.transports.filter(t => TRANSPORTS.has(t)).slice(0, 6) : [];
  return {id: b64url(ad.cred.credentialId), publicKey: b64url(ad.cred.publicKey), alg: key.alg, counter: ad.counter,
    aaguid: hex(ad.cred.aaguid), backupEligible: ad.be, backedUp: ad.bs, transports, uv: ad.uv};
}

/* Sign-in: stored = {publicKey, alg, counter}. Returns the new counter and backup state. */
export async function verifyAuthentication(cred, expected, stored) {
  const r = shape(cred, "get");
  const cdBytes = clientData(r.clientDataJSON, "webauthn.get", expected);
  const authData = unb64url(r.authenticatorData);
  const ad = parseAuthData(authData);
  await checkAuthData(ad, expected);
  let cose;
  try { cose = decodeCBOR(unb64url(stored.publicKey)).value; } catch (e) { fail("Stored key is unreadable"); }
  const key = coseKey(cose);
  if (key.alg !== stored.alg) fail("Stored key algorithm mismatch");
  const pub = await importKey(key);
  let sig = unb64url(r.signature);
  if (sig.length > 1024) fail("Signature is too large");
  if (key.der) sig = derToRaw(sig);
  const signed = concat(authData, await sha256(cdBytes));
  let ok = false;
  try { ok = await crypto.subtle.verify(key.verifyAlg, pub, sig, signed); } catch (e) { ok = false; }
  if (!ok) fail("Signature check failed");
  // A counter that stops rising suggests a cloned authenticator. Synced passkeys always report 0, which is fine.
  if ((ad.counter > 0 || stored.counter > 0) && ad.counter <= stored.counter) fail("Signature counter did not increase");
  return {counter: ad.counter, backedUp: ad.bs, uv: ad.uv};
}
