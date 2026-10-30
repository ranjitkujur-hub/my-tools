// The large libraries (OCR and PDF) are loaded only when first needed, from vendor/, never from a CDN.
// The service worker caches them on first use in a separate bucket; Settings can download them ahead
// of time for offline use, or remove them. Sizes and the bucket name come from vendor/libs.json (build).

const abs = (p) => new URL(p, document.baseURI).href;

// WebAssembly SIMD test module (as used by wasm-feature-detect)
const SIMD_WASM = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
let simd = null;
export function hasSimd() {
  if (simd === null) {
    try { simd = WebAssembly.validate(SIMD_WASM); } catch { simd = false; }
  }
  return simd;
}

export function coreFile() {
  return `vendor/ocr/core/${hasSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`;
}

export const OCR_BASE = ['vendor/ocr/tesseract.esm.min.js', 'vendor/ocr/worker.min.js'];
export const LANG_FILE = (l) => `vendor/ocr/lang/${l}.traineddata.gz`;
export const PDF_FILES = ['vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'vendor/pdfjs/wasm/jbig2.wasm', 'vendor/pdfjs/wasm/openjpeg.wasm', 'vendor/pdfjs/wasm/qcms_bg.wasm'];

export function ocrFiles(langs = ['eng']) {
  return [...OCR_BASE, coreFile(), ...langs.map(LANG_FILE)];
}

let manifestP = null;
export function libsManifest() {
  manifestP ||= fetch('vendor/libs.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}

/** Download size (compressed transfer, bytes) of a list of files, from the build manifest. */
export async function downloadSize(files) {
  const m = await libsManifest();
  if (!m) return null;
  return files.reduce((s, f) => s + (m.files?.[f]?.gz || 0), 0);
}

// ---------- pdf.js
let pdfjsP = null;
export function loadPdfjs() {
  pdfjsP ||= import('../vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = abs('vendor/pdfjs/pdf.worker.min.mjs');
    return m;
  }).catch((e) => { pdfjsP = null; throw e; });
  return pdfjsP;
}

export const PDF_EXTRA = () => ({ wasmUrl: abs('vendor/pdfjs/wasm/'), useWorkerFetch: false });

// ---------- Tesseract
let tessP = null;
export function loadTesseract() {
  tessP ||= import('../vendor/ocr/tesseract.esm.min.js').then((m) => m.default || m).catch((e) => { tessP = null; throw e; });
  return tessP;
}

export function tesseractOptions(logger) {
  return {
    workerPath: abs('vendor/ocr/worker.min.js'),
    corePath: abs(coreFile()),
    langPath: abs('vendor/ocr/lang'),
    workerBlobURL: false,
    gzip: true,
    // the service worker keeps these files for offline use; no second copy in IndexedDB
    cacheMethod: 'none',
    logger,
    errorHandler: () => {},
  };
}

// ---------- offline download (Settings)
async function bucket() {
  const m = await libsManifest();
  if (!m?.cache || !('caches' in globalThis)) return null;
  return caches.open(m.cache);
}

/** {base, eng, hin, pdf}: true when those files are in the offline cache. */
export async function offlineStatus() {
  const c = await bucket().catch(() => null);
  const out = { available: Boolean(c), base: false, eng: false, hin: false, pdf: false };
  if (!c) return out;
  const all = async (files) => (await Promise.all(files.map((f) => c.match(abs(f))))).every(Boolean);
  out.base = await all([...OCR_BASE, coreFile()]);
  out.eng = await all([LANG_FILE('eng')]);
  out.hin = await all([LANG_FILE('hin')]);
  out.pdf = await all(PDF_FILES);
  return out;
}

export async function downloadOffline({ hindi = false, onProgress } = {}) {
  const c = await bucket();
  if (!c) throw new Error('no cache storage');
  const files = [...ocrFiles(hindi ? ['eng', 'hin'] : ['eng']), ...PDF_FILES];
  let done = 0;
  for (const f of files) {
    if (!(await c.match(abs(f)))) {
      const r = await fetch(abs(f), { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${f}`);
      await c.put(abs(f), r);
    }
    onProgress?.(++done, files.length);
  }
  return files.length;
}

export async function removeOffline() {
  const m = await libsManifest();
  if (m?.cache && 'caches' in globalThis) await caches.delete(m.cache);
}
