// "मेरे दस्तावेज़ / My documents": the user's own files, kept only on this device.
// Holds the list, its search index (separate from the material), the storage limits and backups.
import { userStore } from './userstore.js';
import { createUserIndex } from './core/userindex.js';
import { MAX_TOTAL_BYTES } from './core/files/detect.js';
import { state } from './data.js';

let docs = [];
let loaded = false;
let index = null;
const cache = new Map();
const listeners = new Set();

function rebuild() {
  index = createUserIndex(docs, state.engine?.synonyms || [], cache);
  for (const f of listeners) { try { f(); } catch { /* ignore */ } }
}

export async function loadMyDocs() {
  try { docs = await userStore.list(); } catch { docs = []; }
  docs.sort((a, b) => String(b.added).localeCompare(String(a.added)));
  loaded = true;
  rebuild();
  return docs;
}

export const myDocsLoaded = () => loaded;
export const getDocs = () => docs;
export const getDoc = (id) => docs.find((d) => d.id === id) || null;
export const userIndex = () => index;
export const isPersistent = () => userStore.persistent !== false;

export function onDocsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bytes used by My documents (text and kept pictures/PDFs). */
export function usage() {
  return docs.reduce((s, d) => s + (d.stored || 0), 0);
}

export function newId() {
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Approximate stored size of a document record plus its blobs. */
export function storedSize(doc, blobs) {
  const text = (doc.units || []).reduce((s, u) => s + (u.text?.length || 0) + (u.notes?.length || 0) + (u.label?.length || 0) + 40, 0);
  return text * 2 + (blobs?.image?.size || 0) + (blobs?.file?.size || 0) + 500;
}

export function wouldExceed(bytes) {
  return usage() + bytes > MAX_TOTAL_BYTES;
}

/** Save a new document. Throws {code: 'storage-full'} when the total limit would be passed. */
export async function addDoc(doc, blobs = null) {
  doc.stored = storedSize(doc, blobs);
  if (wouldExceed(doc.stored)) throw Object.assign(new Error('storage-full'), { code: 'storage-full' });
  await userStore.put(doc, blobs);
  docs = [doc, ...docs.filter((d) => d.id !== doc.id)];
  rebuild();
  return doc;
}

export async function deleteDoc(id) {
  await userStore.remove(id);
  docs = docs.filter((d) => d.id !== id);
  rebuild();
}

export async function deleteAll() {
  await userStore.clear();
  docs = [];
  rebuild();
}

export const docBlobs = (id) => userStore.blobs(id);

// ---------- backup (JSON)
function blobToDataUrl(b) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlToBlob(u) {
  const r = await fetch(u);
  return r.blob();
}

export async function exportJson() {
  const out = [];
  for (const d of docs) {
    const b = await userStore.blobs(d.id);
    const blobs = {};
    if (b?.image) blobs.image = await blobToDataUrl(b.image);
    if (b?.file) blobs.file = await blobToDataUrl(b.file);
    out.push({ ...d, blobs });
  }
  return JSON.stringify({ format: 'drip-my-documents', v: 1, exported: new Date().toISOString(), docs: out });
}

/** Import a backup. Returns {added, skipped}. */
export async function importJson(text) {
  const data = JSON.parse(text);
  if (data?.format !== 'drip-my-documents' || !Array.isArray(data.docs)) throw new Error('not a My documents backup');
  let added = 0;
  let skipped = 0;
  for (const raw of data.docs) {
    if (!raw || !Array.isArray(raw.units) || !raw.name) { skipped++; continue; }
    const { blobs: enc, ...doc } = raw;
    if (getDoc(doc.id) || !doc.id) doc.id = newId();
    doc.units = doc.units.filter((u) => u && typeof u.text === 'string').map((u, i) => ({ n: u.n ?? i + 1, label: String(u.label || `Part ${i + 1}`), text: u.text, ...(u.title ? { title: String(u.title) } : {}), ...(u.notes ? { notes: String(u.notes) } : {}), ...(u.ocr ? { ocr: true } : {}) }));
    const blobs = {};
    try {
      if (typeof enc?.image === 'string' && enc.image.startsWith('data:image/')) blobs.image = await dataUrlToBlob(enc.image);
      if (typeof enc?.file === 'string' && enc.file.startsWith('data:')) blobs.file = await dataUrlToBlob(enc.file);
    } catch { /* keep the text */ }
    try {
      await addDoc(doc, Object.keys(blobs).length ? blobs : null);
      added++;
    } catch (e) {
      if (e.code === 'storage-full') { skipped += 1; break; }
      skipped++;
    }
  }
  return { added, skipped };
}
