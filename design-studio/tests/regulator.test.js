'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/regulator.js');
const F = M.fns;
const page = M.pages[0];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const run = o => { const v = DS.base.coerce(page.inputs, o); return { v, r: page.design(v) }; };

test('Drowned weir formula (Garg): independent hand calculation', () => {
  // L = 10 m, h = 0.30 m, hd = 1.30 m, Cd1 = 0.577, Cd2 = 0.80
  const q1 = 2 / 3 * 0.577 * Math.sqrt(19.62) * Math.pow(0.3, 1.5) * 10;  // ≈ 2.800
  const q2 = 0.8 * 10 * 1.3 * Math.sqrt(19.62 * 0.3);                       // ≈ 25.226
  near(F.drownedWeirQ(0.577, 0.8, 10, 0.3, 1.3), q1 + q2, 1e-9);
  near(F.drownedWeirQ(0.577, 0.8, 10, 0.3, 1.3), 28.03, 0.01);
  near(F.freeWeirQ(1.71, 10, 1), 17.1, 1e-12);
});

test('Sluice gate: free and submerged flow, opening solver returns the opening that passes Q', () => {
  // free: h3 below Cc·a
  near(F.gateQ(0.61, 0.61, 9, 0.5, 1.6, 0), 0.61 * 9 * 0.5 * Math.sqrt(19.62 * (1.6 - 0.305)), 1e-9);
  // submerged: Δh = h1 − h3
  near(F.gateQ(0.61, 0.61, 9, 0.5, 1.6, 1.3), 0.61 * 9 * 0.5 * Math.sqrt(19.62 * 0.3), 1e-9);
  const a = F.gateOpening(12, 0.61, 0.61, 9, 1.6, 1.3);
  near(F.gateQ(0.61, 0.61, 9, a, 1.6, 1.3), 12, 1e-6);
  assert.ok(Number.isNaN(F.gateOpening(500, 0.61, 0.61, 9, 1.6, 1.3)), 'too large: gate fully open');
});

test('Bays: the smallest number whose effective length meets the requirement', () => {
  const b = F.bays(20, 3, 0.01, 0.1, 1.5);
  assert.ok(b.Le >= 20);
  const prev = (b.n - 1) * 3 - 2 * (0.01 * (b.n - 2) + 0.1) * 1.5;
  assert.ok(prev < 20);
});

test('Head regulator design (defaults): drowned flow, waterway, gates, escape', () => {
  const { v, r } = run({});
  const D = r.data;
  assert.equal(r.results[0].value, 'Drowned weir');
  assert.ok(r.allOk(), JSON.stringify(r.checks.filter(c => !c.ok)));
  const gates = r.tables.find(t => t.id === 'gates');
  assert.equal(gates.rows.length, 5);
  const openings = gates.rows.map(x => x[3]);
  for (let i = 1; i < openings.length; i++) assert.ok(openings[i] > openings[i - 1], 'opening grows with Q');
  const esc = r.results.find(x => /Escape/.test(x.label)).value;
  near(esc, 0.5 * v.Q / (v.Cesc * Math.pow(v.escHead, 1.5)), 1e-9);
  assert.equal(D.n, 3);
});

test('Free (modular) flow when the d/s level is below the crest', () => {
  const { v, r } = run({ dsFSL: 148.3, dsBed: 147 });
  assert.equal(r.results[0].value, 'Free weir');
  const Lreq = r.results.find(x => /required/.test(x.label)).value;
  const H = v.usFSL + v.Va * v.Va / 19.62 - v.crest;
  near(Lreq, v.Q / (v.Cf * Math.pow(H, 1.5)), 1e-9);
});

test('Cross regulator adds the afflux check', () => {
  const { r } = run({ type: 'cross', dsFSL: 149.9 });
  assert.ok(r.checks.some(c => /Afflux/.test(c.label)));
});
