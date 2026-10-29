// WebCrypto helpers shared by the build (Node 18+: globalThis.crypto.subtle) and the browser.

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

export function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}

export function toB64(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PBKDF2-SHA-256 key-encryption key (AES-GCM, can only wrap/unwrap). */
export async function deriveKek(passcode, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(String(passcode).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Generate an extractable AES-GCM data key (build side only). */
export function generateDataKey() {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDataKey(kek, dataKey) {
  const iv = randomBytes(12);
  const ct = await subtle().wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv });
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Unwrap to a NON-extractable decrypt-only key (safe to keep in IndexedDB). */
export function unwrapDataKey(kek, wrapped) {
  return subtle().unwrapKey(
    'raw', fromB64(wrapped.ct), kek, { name: 'AES-GCM', iv: fromB64(wrapped.iv) },
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

/** AES-GCM encrypt: output = 12-byte IV || ciphertext+tag */
export async function encryptBytes(key, data) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(key, data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12)));
}

/**
 * Try a passcode against every slot in keys.json.
 * Returns {slot, keys: [CryptoKey...]} for the slot with the most keys that opens, or null.
 */
export async function unlockWithPasscode(keysJson, passcode) {
  const attempts = keysJson.slots.map(async (slot, i) => {
    try {
      const kek = await deriveKek(passcode, fromB64(slot.salt), keysJson.iterations);
      const keys = [];
      for (const w of slot.wrapped) keys.push(await unwrapDataKey(kek, w));
      return { slot: i, keys };
    } catch {
      return null;
    }
  });
  const ok = (await Promise.all(attempts)).filter(Boolean);
  if (!ok.length) return null;
  ok.sort((a, b) => b.keys.length - a.keys.length);
  return ok[0];
}
