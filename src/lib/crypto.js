/* Compy — optional passphrase encryption for backups (AES-GCM + PBKDF2).
   Exposes global `WLNCrypto`. Format (text file):
     WLNENC1.<saltB64>.<ivB64>.<cipherB64>
*/
(function (global) {
  "use strict";

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const PREFIX = "WLNENC1";

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(passphrase, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  const WLNCrypto = {
    isEncrypted(text) {
      return typeof text === "string" && text.startsWith(PREFIX + ".");
    },

    async encrypt(plaintext, passphrase) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(passphrase, salt);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
      return `${PREFIX}.${b64(salt)}.${b64(iv)}.${b64(ct)}`;
    },

    async decrypt(payload, passphrase) {
      const parts = payload.split(".");
      if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("Not a Compy encrypted backup.");
      const salt = unb64(parts[1]);
      const iv = unb64(parts[2]);
      const ct = unb64(parts[3]);
      const key = await deriveKey(passphrase, salt);
      try {
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return dec.decode(pt);
      } catch {
        throw new Error("Wrong passphrase or corrupted file.");
      }
    }
  };

  global.WLNCrypto = WLNCrypto;
})(typeof window !== "undefined" ? window : globalThis);
