// TXT, CSV and Markdown: decoded text in chunks of whole lines ("Lines a–b").
import { splitLong, UNIT_MAX, UNIT_MIN } from './office.js';

export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

export function chunkLines(text, { max = UNIT_MAX, min = UNIT_MIN } = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const units = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.parts.join('').trim()) {
      units.push({ n: units.length + 1, label: cur.a === cur.b ? `Line ${cur.a}` : `Lines ${cur.a}–${cur.b}`, text: cur.parts.join('\n').trim() });
    }
    cur = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const no = i + 1;
    if (!line.trim()) {
      if (cur && cur.len >= min) flush();
      else if (cur) cur.parts.push('');
      return;
    }
    for (const piece of line.length > max ? splitLong(line, max) : [line]) {
      if (cur && cur.len + piece.length > max) flush();
      if (!cur) cur = { a: no, b: no, parts: [], len: 0 };
      cur.parts.push(piece);
      cur.len += piece.length + 1;
      cur.b = no;
    }
  });
  flush();
  return units;
}

export function parsePlain(bytes, kind = 'txt') {
  const text = decodeText(bytes);
  // CSV: show cells separated like table rows elsewhere in the app
  const body = kind === 'csv' ? text.split(/\r?\n/).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()).join(' | ')).join('\n') : text;
  return { kind, units: chunkLines(body) };
}
