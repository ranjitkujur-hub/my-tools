const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const entries = [
  { id: 'c', type: 'out', letterNo: 'X-3', date: '20.05.2025', from: 'क', to: 'ख', subject: 'तीसरा', summary: 'सार 3', matters: ['M'], remarks: 'टिप्पणी' },
  { id: 'a', type: 'event', date: '2024', from: 'अंचल', subject: 'पहला (वर्ष मात्र)', matters: ['M'] },
  { id: 'b', type: 'in', letterNo: 'X-2', date: '05.2025', from: 'ख', to: 'क', subject: 'दूसरा', matters: ['M'] },
  { id: 'z', type: 'in', letterNo: 'Z-1', date: '01.01.2025', subject: 'अन्य मामला', matters: ['N'] },
  { id: 'd', type: 'in', letterNo: 'X-4', date: '01.06.2025', subject: 'चौथा', summary: 'राशि रु. 5,000', matters: ['M'] }
].map(e => C.sanitizeEntry(e));

test('chronology is date-ordered and numbered from 1', () => {
  const ch = C.buildChronology(entries, { matter: 'M' });
  assert.equal(ch.title, 'घटनाक्रम — M');
  assert.deepEqual(ch.columns.map(c => c.label), ['क्रम सं.', 'दिनांक', 'पत्रांक', 'प्रेषक → प्राप्तकर्ता', 'विषय / सार', 'अभ्युक्ति']);
  assert.deepEqual(ch.rows.map(r => r.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ch.rows.map(r => r.cells[0]), ['1.', '2.', '3.', '4.']);
  assert.equal(ch.rows[0].cells[1], '2024 (लगभग)');
  assert.equal(ch.rows[0].cells[2], 'घटना');
  assert.equal(ch.rows[1].cells[1], 'मई 2025 (लगभग)');
  assert.equal(ch.rows[2].cells[3], 'क → ख');
  assert.equal(ch.rows[2].cells[4], 'तीसरा');
  assert.equal(ch.rows[2].cells[5], 'टिप्पणी');
});

test('summaries, columns, date range and id lists', () => {
  const ch = C.buildChronology(entries, { matter: 'M', includeSummary: true, columns: ['sn', 'date', 'subject'], dateFrom: '01.05.2025', dateTo: '31.05.2025' });
  assert.deepEqual(ch.columns.map(c => c.key), ['sn', 'date', 'subject']);
  assert.deepEqual(ch.rows.map(r => r.cells), [['1.', 'मई 2025 (लगभग)', 'दूसरा'], ['2.', '20.05.2025', 'तीसरा\nसार 3']]);
  const byIds = C.buildChronology(entries, { ids: ['z', 'd'], title: 'खोज' });
  assert.equal(byIds.title, 'घटनाक्रम — खोज');
  assert.deepEqual(byIds.rows.map(r => r.id), ['z', 'd']);
});

test('annexure lines', () => {
  const lines = C.annexureLines([entries[4], entries[1]], 3);
  assert.deepEqual(lines, [
    'अनुलग्नक-3: पत्रांक X-4 दिनांक 01.06.2025 (चौथा)',
    'अनुलग्नक-4: दिनांक 2024 (लगभग) (पहला (वर्ष मात्र))'
  ]);
});

test('matter rename and merge', () => {
  const changed = C.renameMatter(entries, 'N', 'M');
  assert.equal(changed.length, 1);
  assert.deepEqual(changed[0].matters, ['M']);
  const both = C.sanitizeEntry({ id: 'q', matters: ['P', 'M'] });
  assert.deepEqual(C.renameMatter([both], 'P', 'M')[0].matters, ['M']);
  assert.deepEqual(C.renameMatter([both], 'P', '')[0].matters, ['M']);
  assert.deepEqual(C.allMatters(entries).map(m => [m.name, m.count]), [['M', 4], ['N', 1]]);
});

test('sample entries are fictional, marked and linked', () => {
  const s = C.makeSamples(new Date(2026, 7, 12));
  assert.ok(s.length >= 6 && s.length <= 8);
  for (const e of s) {
    assert.equal(e.sample, true);
    assert.match(e.subject, /नमूना \/ SAMPLE/);
  }
  const ids = new Set(s.map(e => e.id));
  for (const e of s) {
    if (e.replyId) assert.ok(ids.has(e.replyId));
    e.refIds.forEach(r => assert.ok(ids.has(r)));
  }
  assert.ok(s.some(e => C.isPartialDate(e.date)));
  const g = C.pendingGroups(s, new Date(2026, 7, 12));
  assert.ok(g.overdue.length >= 1 && g.soon.length >= 1);
});
