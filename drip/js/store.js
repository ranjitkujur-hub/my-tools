// Device storage. Never stores passcodes. Keys are kept only as non-extractable
// CryptoKey objects in IndexedDB (when the user chose "Remember on this device").

const LS = 'drip.';

export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(LS + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(LS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function lsDel(key) {
  try { localStorage.removeItem(LS + key); } catch { /* ignore */ }
}

export function lsClearAll() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LS)) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

const DEFAULT_PREFS = { lang: 'hi-en', size: 16 };
let prefCache = null;
export const prefs = {
  get() {
    if (!prefCache) prefCache = { ...DEFAULT_PREFS, ...(lsGet('prefs', {}) || {}) };
    return prefCache;
  },
  set(p) {
    prefCache = { ...prefs.get(), ...p };
    lsSet('prefs', prefCache);
  },
};

// ---- IndexedDB key store
const DB = 'drip-keys';
const STORE = 'k';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function saveKeys(record) {
  try {
    await tx('readwrite', (s) => s.put(record, 'keys'));
    return true;
  } catch {
    return false;
  }
}

export async function loadKeys() {
  try {
    return (await tx('readonly', (s) => s.get('keys'))) || null;
  } catch {
    return null;
  }
}

export async function forgetKeys() {
  try { await tx('readwrite', (s) => s.delete('keys')); } catch { /* ignore */ }
}
