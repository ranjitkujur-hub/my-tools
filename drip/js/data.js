// Unlocking, loading the encrypted bundles and pictures.
import { unlockWithPasscode, decryptBytes } from './core/crypto.js';
import { createEngine } from './core/engine.js';
import { saveKeys, loadKeys, forgetKeys, lsGet, lsSet, lsDel } from './store.js';

export const state = {
  tier: null,      // 'general' | 'office'
  keys: null,      // {general: CryptoKey, office?: CryptoKey}
  general: null,
  office: null,
  engine: null,
};

async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* fall back */ }
  }
  const { gunzipSync } = await import('../vendor/fflate.js');
  return gunzipSync(bytes);
}

async function fetchBytes(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function loadBundle(name, key) {
  const enc = await fetchBytes(`data/${name}.bin`);
  const gz = await decryptBytes(key, enc);
  const json = new TextDecoder().decode(await gunzip(gz));
  return JSON.parse(json);
}

async function openWithKeys(keys) {
  const general = await loadBundle('general', keys.general);
  const office = keys.office ? await loadBundle('office', keys.office) : null;
  state.keys = keys;
  state.general = general;
  state.office = office;
  state.tier = office ? 'office' : 'general';
  state.engine = createEngine({ general, office });
  return state;
}

// ---- wrong-passcode slow-down (there is no server, so this is a client-side delay)
export function lockoutRemaining() {
  const f = lsGet('fail', { n: 0, until: 0 });
  return Math.max(0, (f.until || 0) - Date.now());
}

function recordFailure() {
  const f = lsGet('fail', { n: 0, until: 0 });
  f.n = (f.n || 0) + 1;
  if (f.n >= 5) f.until = Date.now() + Math.min(300000, 2000 * 2 ** (f.n - 5));
  lsSet('fail', f);
  return f;
}

/** Returns {ok, tier} or {ok:false, reason:'wrong'|'wait'|'network', wait}. */
export async function unlock(passcode, remember) {
  const wait = lockoutRemaining();
  if (wait > 0) return { ok: false, reason: 'wait', wait };
  let keysJson;
  try {
    const r = await fetch('data/keys.json', { cache: 'no-cache' });
    keysJson = await r.json();
  } catch {
    return { ok: false, reason: 'network' };
  }
  const res = await unlockWithPasscode(keysJson, passcode);
  if (!res) {
    const f = recordFailure();
    return { ok: false, reason: 'wrong', fails: f.n, wait: lockoutRemaining() };
  }
  lsDel('fail');
  const keys = { general: res.keys[0] };
  if (res.keys[1]) keys.office = res.keys[1];
  await openWithKeys(keys);
  if (remember) await saveKeys({ ...keys, version: state.general.version });
  else await forgetKeys();
  return { ok: true, tier: state.tier };
}

/** Re-open with keys remembered on this device. Returns true when unlocked. */
export async function restore() {
  const rec = await loadKeys();
  if (!rec || !rec.general) return false;
  try {
    await openWithKeys({ general: rec.general, office: rec.office || undefined });
    return true;
  } catch {
    await forgetKeys(); // a new build was published: keys changed
    return false;
  }
}

const imgCache = new Map();

export async function lock(forget = true) {
  for (const url of imgCache.values()) URL.revokeObjectURL(url);
  imgCache.clear();
  if (forget) await forgetKeys();
  state.tier = state.keys = state.general = state.office = state.engine = null;
}

/** Bundle that holds a document. */
export function bundleOf(doc) {
  if (state.general?.units[doc]) return 'general';
  if (state.office?.units[doc]) return 'office';
  return null;
}

/** Object URL of a decrypted slide/page picture. */
export async function picture(doc, n) {
  const k = `${doc}:${n}`;
  if (imgCache.has(k)) return imgCache.get(k);
  const b = bundleOf(doc);
  if (!b) throw new Error('not available');
  const name = state[b].media?.[doc]?.[n];
  if (!name) throw new Error('no picture');
  const bytes = await decryptBytes(state.keys[b], await fetchBytes(`m/${name}.bin`));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  imgCache.set(k, url);
  return url;
}

export function docMeta(id) {
  return state.engine?.docs.get(id) || null;
}

export function unit(doc, n) {
  return state.engine?.units.get(`${doc}:${n}`) || null;
}

export function allDocs() {
  return [...(state.general?.docs || []), ...(state.office?.docs || [])];
}

export function allFaq() {
  return [...(state.general?.faq || []), ...(state.office?.faq || [])];
}

export function allCategories() {
  return [...(state.general?.categories || []), ...(state.office?.categories || [])].sort((a, b) => a.order - b.order);
}
