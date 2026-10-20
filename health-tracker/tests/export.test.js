'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('../js/export.js');

const data = {
  profile: { name: 'Demo Patient (fictional)', sex: 'm', dob: '1976-01-01' },
  settings: { customTests: [{ key: 'c_crp', name: 'CRP', unit: 'mg/L', hi: 5 }] },
  labs: [
    { id: '2', date: '2026-02-01', values: { hb: 9.9, creatinine: 1.2, c_crp: 7 }, notes: 'after "fast", ok' },
    { id: '1', date: '2026-01-01', values: { hb: 9.5, calcium: 8, albumin: 3 }, labEgfr: 70 }
  ],
  vitals: [{ id: 'v', datetime: '2026-01-02T07:15', sys: 130, dia: 80, notes: '=cmd()' }],
  meds: [], injections: [], visits: [], dialysis: []
};

// Read a stored (uncompressed) zip produced by ex.zip.
function unzip(buf) {
  const files = {};
  let p = 0;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true);
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true);
    const xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(buf.subarray(p + 30, p + 30 + nlen));
    const body = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    assert.equal(method, 0);
    assert.equal(ex.crc32(body), crc, 'crc of ' + name);
    files[name] = new TextDecoder().decode(body);
    p += 30 + nlen + xlen + size;
  }
  assert.equal(dv.getUint32(buf.length - 22, true), 0x06054b50, 'end of central directory');
  return files;
}

test('crc32 known value', () => {
  assert.equal(ex.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('lab table: dates DD.MM.YYYY, sorted, calculated columns', () => {
  const t = ex.labsTable(data);
  assert.equal(t.rows[0][0], '01.01.2026');
  assert.equal(t.rows[1][0], '01.02.2026');
  const ci = t.header.findIndex(h => h.startsWith('Corrected calcium'));
  assert.equal(t.rows[0][ci], 8.8);
  const ei = t.header.findIndex(h => h.startsWith('eGFR'));
  assert.equal(t.rows[1][ei], 73.7);
  assert.ok(t.header.includes('CRP (mg/L)'));
});

test('CSV export escapes and has BOM', () => {
  const csv = ex.toCSV(ex.labsTable(data));
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"after ""fast"", ok"'));
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  const vit = ex.toCSV(ex.allTables(data).find(t => t.name === 'Vitals'));
  assert.ok(vit.includes("'=cmd()"), 'formula injection neutralised');
  assert.ok(vit.includes('02.01.2026 07:15'));
});

test('XLSX export is a valid workbook', () => {
  const tables = ex.allTables(data);
  const buf = ex.toXLSX(tables);
  assert.ok(buf instanceof Uint8Array);
  const files = unzip(buf);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'])
    assert.ok(files[f], f);
  assert.equal(Object.keys(files).filter(f => f.startsWith('xl/worksheets/')).length, tables.length);
  assert.ok(files['xl/workbook.xml'].includes('name="Lab results"'));
  const lab = files['xl/worksheets/sheet2.xml'];
  assert.ok(lab.includes('<v>9.5</v>'), 'numbers stored as numbers');
  assert.ok(lab.includes('01.01.2026'));
  assert.ok(files['xl/worksheets/sheet1.xml'].includes('Demo Patient (fictional)'));
  assert.ok(lab.includes('after &quot;fast&quot;, ok'));
});

test('column names', () => {
  assert.equal(ex.colName(0), 'A');
  assert.equal(ex.colName(25), 'Z');
  assert.equal(ex.colName(26), 'AA');
  assert.equal(ex.colName(27), 'AB');
});
