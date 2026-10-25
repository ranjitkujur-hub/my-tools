const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('full dates are always day before month', () => {
  for (const s of ['12.08.2026', '12/08/2026', '12-08-2026', '12.8.2026', '12 08 2026', '12082026', '2026-08-12', '१२.०८.२०२६', '12.08.26']) {
    assert.deepEqual(C.parseDate(s), { y: 2026, m: 8, d: 12, precision: 'day' }, s);
  }
  assert.equal(C.normalizeDate('03/04/2026'), '03.04.2026'); // 3 April, never 4 March
  assert.equal(C.normalizeDate('2026-08-12T00:00:00Z'), '12.08.2026');
});

test('invalid dates are rejected', () => {
  for (const s of ['31.02.2026', '13/13/2026', '00.01.2026', 'abc', '', '32.01.2026', '29.02.2025', '1.2', '12.2026.08']) {
    assert.equal(C.parseDate(s), null, s);
  }
  assert.ok(C.parseDate('29.02.2024'));
});

test('partial dates (month or year only)', () => {
  assert.deepEqual(C.parseDate('08.2026'), { y: 2026, m: 8, precision: 'month' });
  assert.deepEqual(C.parseDate('8/2026'), { y: 2026, m: 8, precision: 'month' });
  assert.deepEqual(C.parseDate('2026-08'), { y: 2026, m: 8, precision: 'month' });
  assert.deepEqual(C.parseDate('2026'), { y: 2026, precision: 'year' });
  assert.deepEqual(C.parseDate('अगस्त 2026'), { y: 2026, m: 8, precision: 'month' });
  assert.deepEqual(C.parseDate('Aug 2026'), { y: 2026, m: 8, precision: 'month' });
  assert.deepEqual(C.parseDate('12 सितंबर 2025'), { y: 2025, m: 9, d: 12, precision: 'day' });
  assert.deepEqual(C.parseDate('2019 (लगभग)'), { y: 2019, precision: 'year' });
  assert.equal(C.displayDate('08.2026'), 'अगस्त 2026 (लगभग)');
  assert.equal(C.displayDate('2019'), '2019 (लगभग)');
  assert.equal(C.displayDate('12.08.2026'), '12.08.2026');
  assert.ok(C.isPartialDate('2019'));
  assert.ok(!C.isPartialDate('01.01.2019'));
});

test('Excel serial numbers', () => {
  assert.deepEqual(C.parseDate(46246), { y: 2026, m: 8, d: 12, precision: 'day' });
  assert.equal(C.normalizeDate('46246'), '12.08.2026');
  assert.equal(C.normalizeDate(1), '01.01.1900');
  assert.equal(C.normalizeDate(61), '01.03.1900');
  assert.equal(C.normalizeDate(45658.75), '01.01.2025'); // time part ignored
  assert.equal(C.normalizeDate(new Date(2026, 7, 12)), '12.08.2026');
});

test('sorting puts partial dates sensibly and undated last', () => {
  const mk = (id, date, createdAt) => C.sanitizeEntry({ id, date, subject: id, createdAt });
  const list = [
    mk('d', '15.03.2026', '2026-01-01T00:00:00Z'),
    mk('none', '', '2020-01-01T00:00:00Z'),
    mk('y', '2026', '2026-01-01T00:00:00Z'),
    mk('m', '03.2026', '2026-01-01T00:00:00Z'),
    mk('a', '01.03.2026', '2026-01-02T00:00:00Z'),
    mk('old', '31.12.2025', '2026-01-01T00:00:00Z'),
    mk('a2', '01.03.2026', '2026-01-01T00:00:00Z')
  ];
  assert.deepEqual(C.sortEntries(list).map(e => e.id), ['old', 'y', 'm', 'a2', 'a', 'd', 'none']);
  assert.deepEqual(C.sortEntries(list, true).map(e => e.id)[0], 'none');
});

test('dateSpan and range filter include overlapping partial dates', () => {
  assert.deepEqual(C.dateSpan('2026'), [20260101, 20261231]);
  assert.deepEqual(C.dateSpan('02.2024'), [20240201, 20240229]);
  const es = ['2025', '06.2026', '10.06.2026', '01.01.2027'].map((d, i) => C.sanitizeEntry({ id: 'x' + i, date: d }));
  const got = C.filterEntries(es, { dateFrom: '01.06.2026', dateTo: '30.06.2026' }).map(e => e.date);
  assert.deepEqual(got, ['06.2026', '10.06.2026']);
});

test('pending groups: overdue, within 7 days, later', () => {
  const now = new Date(2026, 7, 12);
  const es = [
    { id: 'o', status: 'pending', dueDate: '10.08.2026' },
    { id: 't', status: 'pending', dueDate: '12.08.2026' },
    { id: 's', status: 'pending', dueDate: '19.08.2026' },
    { id: 'l', status: 'pending', dueDate: '20.08.2026' },
    { id: 'n', status: 'pending' },
    { id: 'c', status: 'closed', dueDate: '01.08.2026' }
  ].map(e => C.sanitizeEntry(e));
  const g = C.pendingGroups(es, now);
  assert.deepEqual(g.overdue.map(e => e.id), ['o']);
  assert.deepEqual(g.soon.map(e => e.id), ['t', 's']);
  assert.deepEqual(g.later.map(e => e.id).sort(), ['l', 'n']);
  assert.equal(C.daysUntil('10.08.2026', now), -2);
});
