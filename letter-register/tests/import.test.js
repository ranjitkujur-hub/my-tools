const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const C = require('../js/core.js');

test('CSV parsing: quotes, commas, new lines, BOM, semicolons', () => {
  const rows = C.parseCSV('\uFEFFपत्रांक,विषय\r\n"A-1, 2026","पंक्ति 1\nपंक्ति 2"\r\nB-2,"कहा ""हाँ"""\r\n\r\n');
  assert.deepEqual(rows, [['पत्रांक', 'विषय'], ['A-1, 2026', 'पंक्ति 1\nपंक्ति 2'], ['B-2', 'कहा "हाँ"']]);
  assert.deepEqual(C.parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(C.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  const back = C.parseCSV(C.toCSV([['x,y', 'q"q', 'new\nline']]));
  assert.deepEqual(back, [['x,y', 'q"q', 'new\nline']]);
});

test('column mapping is guessed from Hindi and English headings', () => {
  const m = C.guessMapping(['क्रम', 'पत्रांक', 'दिनांक', 'प्रेषक', 'To', 'Subject', 'मामला', 'Status', 'Due Date', 'Remarks', 'Received date', 'something']);
  assert.deepEqual(m, ['', 'letterNo', 'date', 'from', 'to', 'subject', 'matters', 'status', 'dueDate', 'remarks', 'receivedDate', '']);
});

test('rows map to entries with day-first dates, types and statuses', () => {
  const rows = [
    ['प्रकार', 'पत्रांक', 'दिनांक', 'विषय', 'मामला', 'स्थिति', 'समय-सीमा'],
    ['आवक', 'A/1', '12/08/2026', 'पहला', 'X; Y', 'लंबित', '2026-08-20'],
    ['Outgoing', 'B/2', 46246, 'दूसरा', 'X', 'closed', ''],
    ['event', '', '2019', 'पुराना', '', '', ''],
    ['?', 'C/3', 'kal', 'तीसरा', '', 'xyz', ''],
    ['', '', '', '', '', '', '']
  ];
  const r = C.mapImportRows(rows, C.guessMapping(rows[0]), { extraMatter: 'Z', now: new Date('2026-08-12T10:00:00Z') });
  assert.equal(r.entries.length, 4);
  const [a, b, c, d] = r.entries;
  assert.equal(a.type, 'in'); assert.equal(a.date, '12.08.2026'); assert.equal(a.dueDate, '20.08.2026');
  assert.deepEqual(a.matters, ['X', 'Y', 'Z']); assert.equal(a.status, 'pending');
  assert.equal(b.type, 'out'); assert.equal(b.date, '12.08.2026'); assert.equal(b.status, 'closed');
  assert.equal(c.type, 'event'); assert.equal(c.date, '2019'); assert.equal(c.status, 'info');
  assert.equal(d.type, 'in'); assert.equal(d.date, ''); assert.match(d.remarks, /kal/);
  assert.equal(r.problems.length, 3);
  assert.deepEqual(r.problems.map(p => p.row), [5, 5, 5]);
  assert.ok(new Set(r.entries.map(e => e.id)).size === 4);
});

test('XLSX import: real workbook with date cells, text dates and serials', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Letter No', 'Date', 'From', 'Subject'],
    ['N-1', new Date(Date.UTC(2026, 7, 12)), 'क', 'तिथि सेल'],
    ['N-2', '03/04/2026', 'ख', 'पाठ तिथि'],
    ['N-3', 45000, 'ग', 'संख्या']
  ], { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb2.Sheets.Sheet1, { header: 1, raw: true, defval: '' });
  const r = C.mapImportRows(rows, C.guessMapping(rows[0]));
  assert.deepEqual(r.entries.map(e => [e.letterNo, e.date, e.from]), [
    ['N-1', '12.08.2026', 'क'], ['N-2', '03.04.2026', 'ख'], ['N-3', '15.03.2023', 'ग']
  ]);
  assert.equal(r.problems.length, 0);
});

test('export rows round-trip through CSV import', () => {
  const es = C.makeSamples(new Date(2026, 7, 12));
  const rows = C.exportRows(es);
  const parsed = C.parseCSV(C.toCSV(rows));
  const r = C.mapImportRows(parsed, C.guessMapping(parsed[0]));
  assert.equal(r.problems.length, 0, JSON.stringify(r.problems));
  const key = e => [e.type, e.letterNo, e.date, e.subject, e.status, e.matters.join('|')].join('#');
  assert.deepEqual(r.entries.map(key).sort(), C.sortEntries(es).map(key).sort());
});
