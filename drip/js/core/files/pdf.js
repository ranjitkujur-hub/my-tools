// PDF text per page with pdf.js ("Page n"). The pdf.js module is passed in, so the same code runs in the
// browser (vendored module build, loaded on first use) and in the Node tests.
import { FileError } from './detect.js';

/** A page with fewer non-space characters than this is treated as a scanned page (offer OCR). */
export const SCANNED_CHARS = 20;

export function pageText(items) {
  let out = '';
  let prev = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    if (prev && !prev.hasEOL && out && !/\s$/.test(out) && it.str && !/^\s/.test(it.str)) {
      // separate items that are apart on the line (pdf.js does not always emit the space)
      const px = prev.transform?.[4] ?? 0;
      const gap = (it.transform?.[4] ?? 0) - (px + (prev.width || 0));
      const sameLine = Math.abs((it.transform?.[5] ?? 0) - (prev.transform?.[5] ?? 0)) < 2;
      if (!sameLine) out += '\n';
      else if (gap > Math.max(1, (prev.height || 10) * 0.15)) out += ' ';
    }
    out += it.str;
    if (it.hasEOL) out += '\n';
    prev = it;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const PDF_OPTIONS = { isEvalSupported: false, useSystemFonts: true, verbosity: 0, stopAtErrors: false };

/** Opens a PDF. Throws FileError('encrypted') for password-protected files. */
export async function openPdf(pdfjs, bytes, extra = {}) {
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
  const task = pdfjs.getDocument({ data, ...PDF_OPTIONS, ...extra });
  try {
    return await task.promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new FileError('encrypted', e.message);
    throw new FileError('corrupt', e?.message || String(e));
  }
}

/** Text units of every page; `scanned` lists pages with almost no text. */
export async function parsePdf(pdfjs, bytes, { onPage, signal, extra } = {}) {
  const doc = await openPdf(pdfjs, bytes, extra);
  const units = [];
  const scanned = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new FileError('cancelled');
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const text = pageText(tc.items);
      if (text.replace(/\s/g, '').length < SCANNED_CHARS) scanned.push(n);
      units.push({ n, label: `Page ${n}`, text });
      page.cleanup?.();
      onPage?.(n, doc.numPages);
    }
  } finally {
    await doc.destroy?.();
  }
  return { kind: 'pdf', units, scanned, pages: units.length };
}
