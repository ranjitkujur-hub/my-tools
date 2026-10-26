'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/basin.js');
const F = M.fns;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('Sequent depth by the Bélanger equation (Chow, Open-Channel Hydraulics, 1959, Ch. 15): y1 = 0.5 m, V1 = 10 m/s', () => {
  const F1 = F.froude(10, 0.5);
  near(F1, 10 / Math.sqrt(9.81 * 0.5), 1e-12);
  near(F1, 4.515, 1e-3);
  const y2 = F.sequentDepth(0.5, F1);
  near(y2, 0.25 * (Math.sqrt(1 + 8 * F1 * F1) - 1), 1e-12);
  near(y2, 2.953, 2e-3);
});

test('Jump energy loss (y2 − y1)³/(4y1y2) equals E1 − E2 (independent identity check)', () => {
  const q = 5, y1 = 0.5, V1 = q / y1, y2 = F.sequentDepth(y1, F.froude(V1, y1));
  const E1 = y1 + V1 * V1 / (2 * 9.81), E2 = y2 + Math.pow(q / y2, 2) / (2 * 9.81);
  near(F.jumpLoss(y1, y2), E1 - E2, 1e-9);
});

test('Supercritical depth satisfies the energy equation and is below critical depth', () => {
  const q = 10, E = 12.25, y1 = F.supercriticalDepth(q, E);
  near(y1 + q * q / (2 * 9.81 * y1 * y1), E, 1e-8);
  assert.ok(y1 < F.criticalDepth(q));
  assert.ok(Number.isNaN(F.supercriticalDepth(q, 1.4 * F.criticalDepth(q))), 'no root below minimum specific energy');
});

test('Required floor level gives tail-water depth equal to y2 (k = 1)', () => {
  const z = F.requiredFloor(10, 110, 103, 0, 1);
  const s = F.jumpAt(10, 110, z, 0);
  near(103 - z, s.y2, 1e-5);
});

test('USBR basin selection by Froude number and velocity (Peterka, EM 25)', () => {
  assert.equal(F.basinType(1.5, 5).id, 'none');
  assert.equal(F.basinType(2.0, 6).id, 'I');
  assert.equal(F.basinType(3.5, 8).id, 'IV');
  assert.equal(F.basinType(6, 15).id, 'III');
  assert.equal(F.basinType(9, 20).id, 'II');
});

test('Stilling basin page defaults: Basin III with Peterka proportions', () => {
  const p = M.pages[0];
  const v = DS.base.coerce(p.inputs, {});
  const r = p.design(v);
  const s = r.data.s;
  assert.equal(r.data.bt.id, 'III');
  near(r.data.els.h3, s.y1 * (4 + s.F1) / 6, 1e-12, 'baffle pier height');
  near(r.data.els.h4, s.y1 * (18 + s.F1) / 18, 1e-12, 'end sill height');
  near(r.data.z, 97.75, 1e-9, 'adopted floor');
  assert.ok(r.allOk(), r.checks.filter(c => !c.ok).map(c => c.label).join(', '));
});

test('Stilling basin check mode flags sweep-out when the floor is too high', () => {
  const p = M.pages[0];
  const v = DS.base.coerce(p.inputs, { mode: 'check', zGiven: 99.0 });
  const r = p.design(v);
  assert.equal(r.checks.find(c => /sweep-out/.test(c.label)).ok, false);
});
