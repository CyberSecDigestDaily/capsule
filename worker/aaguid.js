/* Which passkey manager made a passkey, from the AAGUID in its registration (the community list at
   github.com/passkeydeveloper/passkey-authenticator-aaguids). Shown next to each passkey on the You tab, so you can see
   it landed where you meant it to. An all-zero AAGUID (some browsers anonymise it) means "not saying". */

const PROVIDERS = {
  "ea9b8d664d011d213ce4b6b48cb575d4": "Google Password Manager",
  "adce000235bcc60a648b0b25f1f05503": "Chrome on Mac",
  "08987058cadc4b81b6e130de50dcbe96": "Windows Hello",
  "9ddd1817af5a4672a2b93e3dd95000a9": "Windows Hello",
  "6028b017b1d44c02b4b3afcdafc96bb2": "Windows Hello",
  "dd4ec289e01d41c9bb8970fa845d4bf2": "iCloud Keychain",
  "531126d6e717415c93203d9aa6981239": "Dashlane",
  "bada5566a7aa401fbd9645619a55120d": "1Password",
  "b84e404815dc4dd08640f4f60813c8af": "NordPass",
  "0ea242b443c44a1b8b17dd6d0b6baec6": "Keeper",
  "f38095407f1449c1a8b38f813b225541": "Enpass",
  "b53976664885aa6bcebfe52262a439a2": "Chromium",
  "771b48fdd3d44f749232fc157ab0507a": "Edge on Mac",
  "d548826e79b4db40a3d811116f7e8349": "Bitwarden",
  "fbfc3007154e4ecc8c0b6e020557d7bd": "Apple Passwords",
  "53414d53554e47000000000000000000": "Samsung Pass",
  "50726f746f6e5061737350726f746f6e": "Proton Pass",
  "fdb141b25d84443e8a354698c205a502": "KeePassXC",
  "eaecdef21c3156348639f1cbd9c00a08": "KeePassDX",
  "b35a26b28f6e4697ab1dd44db4da28c6": "Zoho Vault",
  "b78a0a556ef8d246a042ba0f6d55050c": "LastPass",
  "d345266801fd4c12926c83a4204853aa": "Microsoft Password Manager"
};

export function providerOf(aaguidHex) {
  const h = String(aaguidHex || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (h.length !== 32 || /^0+$/.test(h)) return null;
  return PROVIDERS[h] || null;
}
