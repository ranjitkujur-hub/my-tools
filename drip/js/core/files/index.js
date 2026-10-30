// One entry point for turning a file into citable units. Office and text files are parsed here
// (in a worker in the browser); PDFs need the pdf.js module and photos need OCR, both passed in.
import { parseDocx, parsePptx, parseXlsx } from './office.js';
import { parsePlain } from './plain.js';
import { parsePdf } from './pdf.js';
// (FileError codes are keys of MESSAGES: corrupt, encrypted, cancelled, …)
import { detectType, MESSAGES, MAX_FILE_BYTES, FileError, UNREADABLE, hasText } from './detect.js';

export { detectType, MESSAGES, FileError, UNREADABLE, hasText };

export const OFFICE_KINDS = new Set(['docx', 'pptx', 'xlsx', 'txt', 'csv', 'md']);

/** Synchronous parse of Word, PowerPoint, Excel and text files. */
export function parseOffice(kind, bytes) {
  switch (kind) {
    case 'docx': return parseDocx(bytes);
    case 'pptx': return parsePptx(bytes);
    case 'xlsx': return parseXlsx(bytes);
    case 'txt': case 'csv': case 'md': return parsePlain(bytes, kind);
    default: throw new FileError('unsupported');
  }
}

export function failure(code, kind = null, detail = '') {
  return { ok: false, code, kind, message: MESSAGES[code] || MESSAGES.corrupt, detail };
}

/**
 * Detect and parse (no OCR). Returns {ok: true, kind, units, scanned?, note?} or {ok: false, code, message}.
 * `pdfjs` is needed for PDFs; images return {ok: true, kind: 'image', units: []} for the caller to OCR.
 */
export async function parseBytes(name, bytes, { mime = '', pdfjs = null, parseOfficeFn = parseOffice } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > MAX_FILE_BYTES) return failure('too-big');
  const { kind } = detectType(name, b, mime);
  if (UNREADABLE.has(kind)) return failure(kind, kind);
  try {
    if (kind === 'image') return { ok: true, kind, units: [] };
    const r = kind === 'pdf' ? await parsePdf(pdfjs, b) : await parseOfficeFn(kind, b);
    if (kind !== 'pdf' && !hasText(r.units)) return failure('empty', kind);
    return { ok: true, ...r, kind };
  } catch (e) {
    return failure(typeof e?.code === 'string' && MESSAGES[e.code] ? e.code : 'corrupt', kind, e?.message || String(e));
  }
}
