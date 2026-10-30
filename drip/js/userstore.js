// "मेरे दस्तावेज़ / My documents" storage: a separate IndexedDB database (not the keys store).
// docs: {id, name, path, type, size, added, units: [{n, label, text, …}], …}
// blobs: {id, image?: Blob (JPEG about 1600 px, photos), file?: Blob (the original PDF, for page pictures)}
// When IndexedDB is not available, documents are kept for this session only.

const DB = 'drip-userdocs';
const VERSION = 1;
let dbPromise = null;
let memory = null; // Map fallback: id -> {doc, blobs}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('no indexedDB')); return; }
    let req;
    try { req = indexedDB.open(DB, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run(stores, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then((v) => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const userStore = {
  /** true when documents survive a reload (IndexedDB works), false for session-only storage. */
  persistent: null,

  async init() {
    if (this.persistent !== null) return this.persistent;
    try {
      await openDb();
      this.persistent = true;
    } catch {
      this.persistent = false;
      memory = new Map();
    }
    return this.persistent;
  },

  async list() {
    await this.init();
    if (!this.persistent) return [...memory.values()].map((x) => x.doc);
    try {
      return await run(['docs'], 'readonly', (t) => reqP(t.objectStore('docs').getAll()));
    } catch {
      return [];
    }
  },

  /** Save a document and its blobs. Returns true, or throws {code: 'storage-full'|'storage'}. */
  async put(doc, blobs = null) {
    await this.init();
    if (!this.persistent) {
      memory.set(doc.id, { doc, blobs: blobs || memory.get(doc.id)?.blobs || null });
      return true;
    }
    try {
      await run(['docs', 'blobs'], 'readwrite', (t) => {
        t.objectStore('docs').put(doc);
        if (blobs) t.objectStore('blobs').put({ id: doc.id, ...blobs });
      });
      return true;
    } catch (e) {
      const err = new Error(e?.message || 'storage');
      err.code = e?.name === 'QuotaExceededError' ? 'storage-full' : 'storage';
      throw err;
    }
  },

  async blobs(id) {
    await this.init();
    if (!this.persistent) return memory.get(id)?.blobs || null;
    try {
      return (await run(['blobs'], 'readonly', (t) => reqP(t.objectStore('blobs').get(id)))) || null;
    } catch {
      return null;
    }
  },

  async remove(id) {
    await this.init();
    if (!this.persistent) { memory.delete(id); return; }
    try {
      await run(['docs', 'blobs'], 'readwrite', (t) => { t.objectStore('docs').delete(id); t.objectStore('blobs').delete(id); });
    } catch { /* ignore */ }
  },

  async clear() {
    await this.init();
    if (!this.persistent) { memory.clear(); return; }
    try {
      await run(['docs', 'blobs'], 'readwrite', (t) => { t.objectStore('docs').clear(); t.objectStore('blobs').clear(); });
    } catch { /* ignore */ }
  },
};
