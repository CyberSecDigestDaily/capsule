/* A strict, minimal CBOR decoder (RFC 8949) for WebAuthn attestation objects and COSE keys.
   Definite lengths only (WebAuthn data is canonical CBOR), bounded depth and sizes, maps decode to Map so integer
   COSE labels keep their type. Throws on anything malformed or truncated. */

const tdFatal = new TextDecoder("utf-8", {fatal: true});

export class CborError extends Error {}

const MAX_DEPTH = 16, MAX_ITEMS = 1024;

function float16(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

function decodeAt(bytes, view, pos, depth) {
  if (depth > MAX_DEPTH) throw new CborError("CBOR nested too deeply");
  const need = n => { if (n < 0 || pos + n > bytes.length) throw new CborError("CBOR truncated"); };
  need(1);
  const ib = bytes[pos++], major = ib >> 5, info = ib & 31;

  if (major === 7) {
    if (info === 20) return [false, pos];
    if (info === 21) return [true, pos];
    if (info === 22) return [null, pos];
    if (info === 23) return [undefined, pos];
    if (info === 25) { need(2); return [float16(view.getUint16(pos)), pos + 2]; }
    if (info === 26) { need(4); return [view.getFloat32(pos), pos + 4]; }
    if (info === 27) { need(8); return [view.getFloat64(pos), pos + 8]; }
    throw new CborError("Unsupported CBOR simple value");
  }

  let arg;
  if (info < 24) arg = info;
  else if (info === 24) { need(1); arg = bytes[pos]; pos += 1; }
  else if (info === 25) { need(2); arg = view.getUint16(pos); pos += 2; }
  else if (info === 26) { need(4); arg = view.getUint32(pos); pos += 4; }
  else if (info === 27) {
    need(8);
    const hi = view.getUint32(pos), lo = view.getUint32(pos + 4);
    if (hi > 0x1fffff) throw new CborError("CBOR integer too large");
    arg = hi * 2 ** 32 + lo;
    pos += 8;
  } else throw new CborError("Indefinite-length CBOR is not supported");

  switch (major) {
    case 0: return [arg, pos];
    case 1: return [-1 - arg, pos];
    case 2: need(arg); return [bytes.slice(pos, pos + arg), pos + arg];
    case 3: {
      need(arg);
      let s;
      try { s = tdFatal.decode(bytes.subarray(pos, pos + arg)); } catch (e) { throw new CborError("Invalid UTF-8 in CBOR text"); }
      return [s, pos + arg];
    }
    case 4: {
      if (arg > MAX_ITEMS) throw new CborError("CBOR array too long");
      const out = [];
      for (let i = 0; i < arg; i++) { let v; [v, pos] = decodeAt(bytes, view, pos, depth + 1); out.push(v); }
      return [out, pos];
    }
    case 5: {
      if (arg > MAX_ITEMS) throw new CborError("CBOR map too long");
      const out = new Map();
      for (let i = 0; i < arg; i++) {
        let k, v;
        [k, pos] = decodeAt(bytes, view, pos, depth + 1);
        if (typeof k !== "string" && typeof k !== "number") throw new CborError("Unsupported CBOR map key");
        if (out.has(k)) throw new CborError("Duplicate CBOR map key");
        [v, pos] = decodeAt(bytes, view, pos, depth + 1);
        out.set(k, v);
      }
      return [out, pos];
    }
    case 6: return decodeAt(bytes, view, pos, depth + 1); // tags carry no meaning for WebAuthn: return the tagged item
    default: throw new CborError("Unknown CBOR major type");
  }
}

/* Decode one item from the start of bytes. With allowTrailing, returns how many bytes it used (for the COSE key inside
   authenticator data); otherwise the item must fill the buffer exactly. */
export function decodeCBOR(bytes, opts) {
  if (!(bytes instanceof Uint8Array)) throw new CborError("CBOR input must be bytes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [value, end] = decodeAt(bytes, view, 0, 0);
  if (!(opts && opts.allowTrailing) && end !== bytes.length) throw new CborError("Trailing bytes after CBOR item");
  return {value, length: end};
}
