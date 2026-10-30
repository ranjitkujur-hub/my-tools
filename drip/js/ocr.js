// On-device OCR with Tesseract.js in a Web Worker. Nothing leaves the device.
import { loadTesseract, tesseractOptions } from './libs.js';
import { prefs } from './store.js';

let worker = null;       // {langs, p: Promise<TesseractWorker>}
let progressFn = null;   // progress callback of the job that is running
let stage = 'load';

export function ocrLangs() {
  return prefs.get().ocrHindi ? ['eng', 'hin'] : ['eng'];
}

export function setOcrHindi(on) {
  prefs.set({ ocrHindi: Boolean(on) });
}

// loading (core + language data + init) is reported as 0–20%, recognising as 20–100%
function onLog(m) {
  if (!progressFn || !m) return;
  const p = Number.isFinite(m.progress) ? m.progress : 0;
  if (m.status === 'recognizing text') {
    stage = 'read';
    progressFn({ stage, pct: Math.round(20 + 80 * p) });
  } else {
    stage = 'load';
    const step = { 'loading tesseract core': 0, 'initializing tesseract': 1, 'loading language traineddata': 2, 'initializing api': 3 }[m.status] ?? 3;
    progressFn({ stage, pct: Math.round(((step + p) / 4) * 20) });
  }
}

async function getWorker(langs) {
  const key = langs.join('+');
  if (worker && worker.langs === key) return worker.p;
  await terminateOcr();
  const T = await loadTesseract();
  const p = T.createWorker(langs, 1 /* OEM.LSTM_ONLY */, tesseractOptions(onLog));
  worker = { langs: key, p };
  p.catch(() => { if (worker?.p === p) worker = null; });
  return p;
}

export async function terminateOcr() {
  const w = worker;
  worker = null;
  if (w) {
    try { (await w.p).terminate(); } catch { /* ignore */ }
  }
}

/**
 * Recognise text in a canvas or image blob. Returns {text, confidence, ms}.
 * signal: an AbortSignal; cancelling stops the worker (it is started again next time).
 */
export async function recognize(image, { onProgress, signal, langs = ocrLangs() } = {}) {
  const t0 = performance.now();
  if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
  progressFn = onProgress || null;
  onProgress?.({ stage: 'load', pct: 0 });
  let abortHandler;
  const aborted = new Promise((_, reject) => {
    abortHandler = () => { terminateOcr(); reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); };
    signal?.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    const w = await Promise.race([getWorker(langs), aborted]);
    // PSM 3 (automatic page segmentation) suits slides, pages and screenshots
    const r = await Promise.race([w.recognize(image, {}, { text: true }), aborted]);
    onProgress?.({ stage: 'done', pct: 100 });
    return { text: (r.data.text || '').replace(/[ \t]+\n/g, '\n').trim(), confidence: r.data.confidence, ms: Math.round(performance.now() - t0) };
  } finally {
    signal?.removeEventListener('abort', abortHandler);
    progressFn = null;
  }
}

/** Almost no text: fewer than 3 real words. */
export function tooLittleText(text) {
  return (String(text).match(/[A-Za-zऀ-ॿ]{3,}/g) || []).length < 3;
}
