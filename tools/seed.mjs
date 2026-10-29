// Encrypts the private style brief into docs/seed.enc, keyed by an invite code, so the public repo only ever holds
// ciphertext. The join link (#join=<code>) decrypts it in the browser (readSeed() in docs/account.js).
//   node tools/seed.mjs <brief.json> <out.enc>      (the invite code is read from the CAPSULE_INVITE environment variable)
import {readFileSync, writeFileSync} from "node:fs";
import {webcrypto as crypto} from "node:crypto";

const [, , briefPath, outPath] = process.argv;
const code = process.env.CAPSULE_INVITE || "";
if (!briefPath || !outPath || code.length < 16) {
  console.error("usage: CAPSULE_INVITE=<code> node tools/seed.mjs <brief.json> <out.enc>");
  process.exit(2);
}
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 210000;
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({name: "PBKDF2", salt, iterations: iter, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt"]);
const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, new TextEncoder().encode(JSON.stringify(brief)));
writeFileSync(outPath, JSON.stringify({v: 1, kdf: "PBKDF2-SHA256", iter, alg: "AES-256-GCM", salt: b64u(salt), iv: b64u(iv), ct: b64u(new Uint8Array(ct))}) + "\n");
console.log(`wrote ${outPath} (${brief && Object.keys(brief).length} brief fields, encrypted)`);
