'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../js/calc.js');

test('eGFR CKD-EPI 2021: spec test cases', () => {
  assert.equal(calc.egfr(1.0, 60, 'f'), 64.5);
  assert.equal(calc.egfr(1.2, 50, 'm'), 73.7);
  assert.equal(calc.egfr(5.0, 65, 'm'), 12.1);
});

test('eGFR returns null for missing or invalid input', () => {
  assert.equal(calc.egfr(null, 60, 'f'), null);
  assert.equal(calc.egfr(1.0, null, 'f'), null);
  assert.equal(calc.egfr(1.0, 60, ''), null);
  assert.equal(calc.egfr(0, 60, 'm'), null);
  assert.equal(calc.egfr(1.0, 12, 'm'), null, 'adult equation only');
  assert.equal(calc.egfr('1.0', '60', 'f'), 64.5, 'accepts numeric strings');
});

test('eGFR uses age on the test date and recalculates per result', () => {
  const profile = { sex: 'f', dob: '1966-03-15' };
  const lab = { date: '2026-03-14', values: { creatinine: 1.0 } }; // still 59
  assert.equal(calc.ageOn(profile.dob, lab.date), 59);
  assert.equal(calc.labValues(lab, profile).egfr, calc.egfr(1.0, 59, 'f'));
  assert.equal(calc.labValues({ date: '2026-03-15', values: { creatinine: 1.0 } }, profile).egfr, 64.5);
});

test('corrected calcium', () => {
  assert.equal(calc.correctedCalcium(8.0, 3.0), 8.8);
  assert.equal(calc.correctedCalcium(9.0, 4.0), 9.0);
  assert.equal(calc.correctedCalcium(8.0, null), null);
  assert.equal(calc.labValues({ date: '2026-01-01', values: { calcium: 8, albumin: 3 } }, {}).ccalcium, 8.8);
});

test('flagging high / low / normal', () => {
  const r = { lo: 3.5, hi: 5.1 };
  assert.equal(calc.flag(6.2, r), 'H');
  assert.equal(calc.flag(3.1, r), 'L');
  assert.equal(calc.flag(4.2, r), '');
  assert.equal(calc.flag(5.1, r), '', 'bounds are inclusive');
  assert.equal(calc.flag(null, r), '');
  assert.equal(calc.flag(80, { lo: 90, hi: null }), 'L');
  assert.equal(calc.flag(1000, { lo: 90, hi: null }), '');
});

test('ranges by sex, user overrides and targets', () => {
  assert.deepEqual(calc.rangeFor('hb', 'f'), { lo: 12.0, hi: 15.5 });
  assert.deepEqual(calc.rangeFor('hb', 'm'), { lo: 13.0, hi: 17.0 });
  assert.deepEqual(calc.rangeFor('hb', ''), { lo: 12.0, hi: 17.0 }, 'unknown sex: wider range');
  const settings = { ranges: { hb: { lo: '11', hi: '16' } }, targets: { hb: { lo: '10', hi: '11.5' } } };
  assert.deepEqual(calc.rangeFor('hb', 'f', settings), { lo: 11, hi: 16 });
  assert.deepEqual(calc.targetFor('hb', settings), { lo: 10, hi: 11.5 });
  assert.equal(calc.targetFor('potassium', settings), null);
  const custom = [{ key: 'c_x', name: 'CRP', unit: 'mg/L', lo: '', hi: '5' }];
  assert.deepEqual(calc.rangeFor('c_x', 'm', {}, custom), { lo: null, hi: 5 });
  assert.equal(calc.flag(9, calc.rangeFor('c_x', 'm', {}, custom)), 'H');
});

test('date formatting is DD.MM.YYYY', () => {
  assert.equal(calc.fmtDate('2026-01-05'), '05.01.2026');
  assert.equal(calc.fmtDateTime('2026-01-05T08:30'), '05.01.2026 08:30');
  assert.equal(calc.fmtDate(''), '');
});

test('next due date logic', () => {
  assert.equal(calc.nextDue('2026-01-01', 'weekly'), '2026-01-08');
  assert.equal(calc.nextDue('2026-12-28', 'weekly'), '2027-01-04');
  assert.equal(calc.nextDue('2026-01-01', '2weeks'), '2026-01-15');
  assert.equal(calc.nextDue('2026-01-15', 'monthly'), '2026-02-15');
  assert.equal(calc.nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(calc.nextDue('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(calc.nextDue('2026-12-10', 'monthly'), '2027-01-10');
  assert.equal(calc.nextDue('2026-01-01', 'custom', 10), '2026-01-11');
  assert.equal(calc.nextDue('2026-01-01', 'custom', ''), null);
  assert.equal(calc.nextDue('', 'weekly'), null);
});

test('injection schedule uses latest dose per medicine', () => {
  const s = calc.injectionSchedule([
    { medicine: 'Demo EPO', date: '2026-01-01', frequency: 'weekly' },
    { medicine: 'demo epo', date: '2026-01-08', frequency: 'weekly' },
    { medicine: 'Demo Iron', date: '2026-01-02', frequency: 'monthly' }
  ], '2026-01-10');
  assert.equal(s.length, 2);
  assert.equal(s[0].medicine, 'demo epo');
  assert.equal(s[0].due, '2026-01-15');
  assert.equal(s[0].daysLeft, 5);
  assert.equal(s[1].due, '2026-02-02');
});

test('tests due hint', () => {
  const labs = [{ date: '2026-01-01', values: { hb: 10 } }, { date: '2026-02-01', values: { creatinine: 2 } }];
  const r = calc.testsDue(labs, [{ key: 'hb', days: 30 }, { key: 'creatinine', days: 30 }, { key: 'pth', days: 90 }], '2026-02-10');
  assert.equal(r[0].isDue, true);
  assert.equal(r[0].due, '2026-01-31');
  assert.equal(r[1].isDue, false);
  assert.equal(r[1].due, '2026-03-03');
  assert.equal(r[2].isDue, true);
  assert.equal(r[2].last, null);
});

test('latest value with change', () => {
  const labs = [
    { date: '2026-02-01', values: { hb: 9.5 } },
    { date: '2026-01-01', values: { hb: 10 } },
    { date: '2026-03-01', values: { potassium: 5 } }
  ];
  const r = calc.latestWithChange(labs, 'hb', {});
  assert.equal(r.value, 9.5);
  assert.equal(r.prev, 10);
  assert.equal(r.change, -0.5);
  assert.equal(calc.latestWithChange(labs, 'pth', {}), null);
});

test('timing parse and current medicines', () => {
  assert.deepEqual(calc.parseTiming('1-0-1'), ['1', '0', '1']);
  assert.deepEqual(calc.parseTiming('½-0-1'), ['½', '0', '1']);
  assert.equal(calc.isCurrentMed({ stop: '' }, '2026-01-01'), true);
  assert.equal(calc.isCurrentMed({ stop: '2025-12-31' }, '2026-01-01'), false);
});
