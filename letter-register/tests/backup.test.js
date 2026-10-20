const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const now = new Date('2026-08-12T10:00:00Z');

test('backup → restore round trip keeps every field', () => {
  const es = C.makeSamples(now).concat([C.sanitizeEntry({
    id: 'u1', type: 'in', letterNo: 'क-१/२०२६', date: '2020', subject: 'उद्धरण "चिह्न" और \\ बैकस्लैश', summary: 'पंक्ति 1\nपंक्ति 2',
    fileLocation: 'C:\\Users\\Example\\Documents\\x.pdf', matters: ['बाँध'], status: 'pending', dueDate: '01.09.2026'
  }, now)]);
  es[0]._search = 'internal';
  const text = C.serializeBackup(es, { officeLine: 'कार्यालय' }, now);
  const r = C.parseBackup(text);
  assert.equal(r.ok, true);
  assert.equal(r.exportedAt, now.toISOString());
  assert.deepEqual(r.settings, { officeLine: 'कार्यालय' });
  const clean = es.map(e => { const o = Object.assign({}, e); delete o._search; return o; });
  assert.deepEqual(r.entries, clean);
  // a second round trip is identical
  assert.equal(C.serializeBackup(r.entries, r.settings, now), text);
});

test('restore rejects bad files and tolerates old shapes', () => {
  assert.equal(C.parseBackup('not json').ok, false);
  assert.equal(C.parseBackup('{"foo":1}').ok, false);
  assert.equal(C.parseBackup('{"app":"health-tracker","entries":[]}').ok, false);
  const r = C.parseBackup('\uFEFF[{"id":"a","date":"12/08/2026","type":"weird","status":"??"},{"id":"a"},null,5]');
  assert.equal(r.ok, true);
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0].date, '12.08.2026');
  assert.equal(r.entries[0].type, 'in');
  assert.equal(r.entries[0].status, 'info');
  assert.notEqual(r.entries[1].id, 'a'); // duplicate id renamed
});

test('merge keeps newer versions and adds new entries', () => {
  const a = C.sanitizeEntry({ id: 'a', subject: 'old', updatedAt: '2026-01-01T00:00:00Z' });
  const b = C.sanitizeEntry({ id: 'b', subject: 'mine', updatedAt: '2026-05-01T00:00:00Z' });
  const a2 = C.sanitizeEntry({ id: 'a', subject: 'new', updatedAt: '2026-02-01T00:00:00Z' });
  const b2 = C.sanitizeEntry({ id: 'b', subject: 'older', updatedAt: '2026-03-01T00:00:00Z' });
  const c = C.sanitizeEntry({ id: 'c', subject: 'added' });
  const m = C.mergeEntries([a, b], [a2, b2, c]);
  assert.equal(m.added, 1);
  assert.equal(m.updated, 1);
  const byId = Object.fromEntries(m.entries.map(e => [e.id, e.subject]));
  assert.deepEqual(byId, { a: 'new', b: 'mine', c: 'added' });
});

test('summary for restore preview', () => {
  const s = C.summarize(C.makeSamples(now));
  assert.equal(s.total, 7);
  assert.equal(s.in + s.out + s.event, 7);
  assert.equal(s.samples, 7);
  assert.equal(s.first, '2024 (लगभग)');
  assert.equal(s.matters, 2);
});
