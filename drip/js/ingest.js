// Adding files and folders to My documents, one file at a time: Office and text files are parsed in a
// worker, PDFs with pdf.js (scanned pages can be read with OCR), photos with OCR. Nothing is uploaded.
// (the Office parsers load in the worker, or here on demand, so the app shell stays small)
import { detectType, MESSAGES, FileError, hasText, UNREADABLE, MAX_FILE_BYTES } from './core/files/detect.js';
import { parsePdf, openPdf } from './core/files/pdf.js';
import { loadPdfjs, PDF_EXTRA } from './libs.js';
import { recognize, tooLittleText } from './ocr.js';
import { preparePhoto, greyStretch } from './imageprep.js';
import { addDoc, newId, storedSize, wouldExceed } from './mydocs.js';
import { lsGet, lsSet } from './store.js';

// ---------- Office/text parsing in a module worker (falls back to this thread)
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker === false) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./ingest-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.r);
      else p.reject(new FileError(e.data.code, e.data.message));
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      worker?.terminate();
      worker = false;
      for (const p of pending.values()) p.fallback();
      pending.clear();
    };
  } catch {
    worker = false;
  }
  return worker || null;
}

const parseHere = (kind, bytes) => import('./core/files/index.js').then((m) => m.parseOffice(kind, bytes));

export function parseOfficeAsync(kind, bytes) {
  const w = getWorker();
  if (!w) return parseHere(kind, bytes);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const copy = bytes.slice();
    pending.set(id, { resolve, reject, fallback: () => parseHere(kind, bytes).then(resolve, reject) });
    w.postMessage({ id, kind, bytes: copy.buffer }, [copy.buffer]);
  });
}

// ---------- OCR helpers
export const DEFAULT_SEC_PER_PAGE = 8;
export function secPerPage() {
  return lsGet('ocrSecPerPage', DEFAULT_SEC_PER_PAGE) || DEFAULT_SEC_PER_PAGE;
}
function recordOcrTime(ms) {
  const prev = secPerPage();
  lsSet('ocrSecPerPage', Math.round(((prev + ms / 1000) / 2) * 10) / 10);
}

/** Render a PDF page to a canvas at about 2× (long side at most 2600 px). */
export async function renderPdfPage(pdf, n, { scale = 2, maxSide = 2600 } = {}) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const s = Math.min(scale, maxSide / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale: s });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup?.();
  return c;
}

const fail = (code) => ({ ok: false, code, message: MESSAGES[code] || MESSAGES.corrupt });

/** OCR, turning a failure to start (no network, no library) into FileError('ocr'). */
async function ocr(image, opts) {
  try {
    return await recognize(image, opts);
  } catch (e) {
    throw e?.code === 'cancelled' ? e : new FileError('ocr', e?.message || String(e));
  }
}

async function pdfReader() {
  try { return await loadPdfjs(); } catch (e) { throw new FileError('reader', e?.message || String(e)); }
}

/**
 * Turn one File into a stored document.
 * onStep({state: 'read'|'ocr', pct, page, pages}) reports progress.
 * confirmOcr(pages, seconds) is asked before reading more than 10 scanned PDF pages.
 * Returns {ok: true, doc} or {ok: false, code, message}.
 */
export async function ingestFile(file, { onStep, confirmOcr, signal, source = 'file' } = {}) {
  if (file.size > MAX_FILE_BYTES) return fail('too-big');
  if (wouldExceed(file.size / 4)) return fail('storage-full');
  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { return fail('corrupt'); }
  const { kind } = detectType(file.name, bytes, file.type);
  if (UNREADABLE.has(kind)) return fail(kind);
  const doc = { id: newId(), name: file.name || 'file', path: file.webkitRelativePath || file.name || 'file', type: kind, size: file.size, added: new Date().toISOString(), source, units: [] };
  let blobs = null;
  try {
    onStep?.({ state: 'read', pct: 0 });
    if (kind === 'image') {
      const ph = await preparePhoto(file);
      const r = await ocr(ph.ocr, { signal, onProgress: (p) => onStep?.({ state: 'ocr', pct: p.pct }) });
      recordOcrTime(r.ms);
      if (tooLittleText(r.text)) return fail('empty');
      doc.units = [{ n: 1, label: 'Photo', text: r.text, ocr: true }];
      doc.width = ph.width;
      doc.height = ph.height;
      blobs = { image: ph.keep };
    } else if (kind === 'pdf') {
      const pdfjs = await pdfReader();
      const r = await parsePdf(pdfjs, bytes, { signal, extra: PDF_EXTRA(), onPage: (n, total) => onStep?.({ state: 'read', pct: Math.round((n / total) * 100), page: n, pages: total }) });
      doc.units = r.units;
      doc.pages = r.pages;
      if (r.scanned.length) {
        const sec = secPerPage();
        const ok = r.scanned.length <= 10 || (await confirmOcr?.(r.scanned.length, Math.round(r.scanned.length * sec)));
        if (ok) {
          const pdf = await openPdf(pdfjs, bytes, PDF_EXTRA());
          try {
            let i = 0;
            for (const n of r.scanned) {
              if (signal?.aborted) throw new FileError('cancelled');
              const canvas = greyStretch(await renderPdfPage(pdf, n));
              const o = await ocr(canvas, { signal, onProgress: (p) => onStep?.({ state: 'ocr', pct: Math.round(((i + p.pct / 100) / r.scanned.length) * 100), page: n, pages: r.scanned.length }) });
              recordOcrTime(o.ms);
              const u = doc.units.find((x) => x.n === n);
              if (u && o.text.trim()) { u.text = o.text; u.ocr = true; }
              i++;
            }
          } finally {
            await pdf.destroy?.();
          }
        }
        doc.scanned = r.scanned.length;
      }
      blobs = { file: new Blob([bytes], { type: 'application/pdf' }) };
    } else {
      const r = await parseOfficeAsync(kind, bytes);
      doc.units = r.units;
      if (r.note) doc.note = r.note;
      if (r.sheets) doc.sheets = r.sheets;
    }
  } catch (e) {
    const code = typeof e?.code === 'string' && MESSAGES[e.code] ? e.code : 'corrupt';
    return fail(code);
  }
  if (!hasText(doc.units)) return fail('empty');
  if (wouldExceed(storedSize(doc, blobs))) return fail('storage-full');
  try {
    await addDoc(doc, blobs);
  } catch (e) {
    return fail(e.code === 'storage-full' ? 'storage-full' : 'storage');
  }
  return { ok: true, doc };
}

/**
 * Add several files (a selection or a folder), one at a time.
 * onUpdate(items) after every change; each item: {name, path, state: 'wait'|'read'|'ocr'|'added'|'skipped', pct, message, units}
 */
export async function ingestFiles(files, { onUpdate, confirmOcr, signal } = {}) {
  const items = [...files].map((f) => ({ file: f, name: f.name, path: f.webkitRelativePath || f.name, state: 'wait', pct: 0 }));
  const update = () => onUpdate?.(items);
  update();
  for (const it of items) {
    if (signal?.aborted) { it.state = 'skipped'; it.code = 'cancelled'; it.message = MESSAGES.cancelled; continue; }
    it.state = 'read';
    update();
    const r = await ingestFile(it.file, {
      signal,
      confirmOcr,
      onStep: (s) => { it.state = s.state; it.pct = s.pct; it.page = s.page; it.pages = s.pages; update(); },
    });
    if (r.ok) { it.state = 'added'; it.units = r.doc.units.length; it.doc = r.doc; } else { it.state = 'skipped'; it.code = r.code; it.message = r.message; }
    update();
  }
  const added = items.filter((x) => x.state === 'added').length;
  return { items, added, skipped: items.length - added, unsupported: items.filter((x) => ['unsupported', 'legacy', 'heic'].includes(x.code)).length };
}
