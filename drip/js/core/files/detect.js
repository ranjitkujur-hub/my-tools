// What kind of file is this, and the bilingual messages for files that cannot be read.

export class FileError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
  }
}

/** Kinds that are reported, not read. */
export const UNREADABLE = new Set(['heic', 'legacy', 'encrypted', 'unsupported']);

export function hasText(units) {
  return units.some((u) => `${u.text || ''}${u.notes || ''}`.trim());
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

export const MESSAGES = {
  legacy: { hi: 'कृपया DOCX/PPTX/XLSX या PDF में सहेजें', en: 'Please save as DOCX/PPTX/XLSX or PDF' },
  encrypted: { hi: 'यह फ़ाइल पासवर्ड से सुरक्षित (encrypted) है, इसलिए खोली नहीं जा सकती', en: 'This file is password-protected (encrypted) and cannot be opened' },
  heic: { hi: 'HEIC फ़ोटो नहीं पढ़ी जा सकती — फ़ोटो को JPG के रूप में साझा करें', en: 'HEIC photos cannot be read — please share the photo as JPG' },
  unsupported: { hi: 'यह फ़ाइल प्रकार समर्थित नहीं है', en: 'This file type is not supported' },
  'too-big': { hi: 'फ़ाइल 50 MB से बड़ी है', en: 'The file is larger than 50 MB' },
  'storage-full': { hi: 'मेरे दस्तावेज़ों की सीमा (लगभग 300 MB) पूरी हो गई — कुछ दस्तावेज़ हटाएँ', en: 'My documents is full (about 300 MB) — delete some documents first' },
  corrupt: { hi: 'फ़ाइल पढ़ी नहीं जा सकी (ख़राब या अधूरी?)', en: 'The file could not be read (damaged or incomplete?)' },
  empty: { hi: 'इस फ़ाइल में पढ़ने योग्य पाठ नहीं मिला', en: 'No readable text was found in this file' },
  cancelled: { hi: 'रद्द किया गया', en: 'Cancelled' },
  storage: { hi: 'इस डिवाइस पर सहेजा नहीं जा सका', en: 'Could not save on this device' },
  ocr: { hi: 'OCR शुरू नहीं हो सका (ऑफ़लाइन? सेटिंग → “ऑफ़लाइन के लिए OCR डाउनलोड करें”)', en: 'OCR could not start (offline? Settings → “Download OCR for offline use”)' },
  reader: { hi: 'PDF पढ़ने वाला लोड नहीं हुआ (ऑफ़लाइन? सेटिंग → “ऑफ़लाइन के लिए OCR डाउनलोड करें”)', en: 'The PDF reader could not load (offline? Settings → “Download OCR for offline use”)' },
};

export const TYPE_LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', image: 'Photo', txt: 'Text', csv: 'CSV', md: 'Markdown' };

const EXT = {
  pdf: 'pdf',
  docx: 'docx', docm: 'docx', dotx: 'docx',
  pptx: 'pptx', pptm: 'pptx', ppsx: 'pptx', potx: 'pptx',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', jfif: 'image',
  heic: 'heic', heif: 'heic',
  txt: 'txt', text: 'txt', log: 'txt', csv: 'csv', tsv: 'csv', md: 'md', markdown: 'md',
  doc: 'legacy', ppt: 'legacy', xls: 'legacy', pps: 'legacy', dot: 'legacy', xlt: 'legacy', rtf: 'legacy', odt: 'legacy', ods: 'legacy', odp: 'legacy',
};

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);

function hasUtf16(b, word) {
  // look for an OLE directory entry name such as "EncryptedPackage" (UTF-16LE)
  const pat = [];
  for (const ch of word) pat.push(ch.charCodeAt(0), 0);
  const lim = Math.min(b.length, 4 * 1024 * 1024) - pat.length;
  outer: for (let i = 0; i < lim; i++) {
    for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer;
    return true;
  }
  return false;
}

/** Returns {kind, ext}; kind is one of pdf docx pptx xlsx image txt csv md heic legacy encrypted unsupported. */
export function detectType(name, bytes, mime = '') {
  const ext = extOf(name);
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const byExt = EXT[ext];
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { kind: 'pdf', ext };
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    // OLE compound file: an encrypted Office 2007+ file, or an old .doc/.ppt/.xls
    if (['docx', 'pptx', 'xlsx'].includes(byExt) || hasUtf16(b, 'EncryptedPackage')) return { kind: 'encrypted', ext };
    return { kind: 'legacy', ext };
  }
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) {
    if (['docx', 'pptx', 'xlsx'].includes(byExt)) return { kind: byExt, ext };
    if (byExt === 'legacy') return { kind: 'legacy', ext }; // OpenDocument
    const s = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 1 << 16)));
    if (s.includes('word/')) return { kind: 'docx', ext };
    if (s.includes('ppt/')) return { kind: 'pptx', ext };
    if (s.includes('xl/')) return { kind: 'xlsx', ext };
    return { kind: 'unsupported', ext };
  }
  if (startsWith(b, [0xff, 0xd8, 0xff]) || startsWith(b, [0x89, 0x50, 0x4e, 0x47]) || (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b[8] === 0x57 && b[9] === 0x45)) return { kind: 'image', ext };
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && /^(heic|heix|hevc|mif1|msf1|heim|heis)/.test(String.fromCharCode(...b.subarray(8, 12)))) return { kind: 'heic', ext };
  if (byExt === 'heic' || /image\/hei[cf]/.test(mime)) return { kind: 'heic', ext };
  if (byExt === 'legacy') return { kind: 'legacy', ext };
  if (['txt', 'csv', 'md'].includes(byExt)) return { kind: byExt, ext };
  if (byExt === 'image') return { kind: 'unsupported', ext }; // named like a picture but not one
  if (/^text\//.test(mime)) return { kind: 'txt', ext };
  return { kind: 'unsupported', ext };
}
