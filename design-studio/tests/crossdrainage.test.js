'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/crossdrainage.js');
const F = M.fns;
const page = M.pages[0];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const run = o => { const v = DS.base.coerce(page.inputs, o); return { v, r: page.design(v) }; };

test("Lacey perimeter P = 4.75√Q (Lacey regime theory)", () => {
  near(F.laceyP(100), 47.5, 1e-12);
  near(F.laceyP(120), 52.034, 0.001);
});

test('Molesworth afflux: hand calculation V = 2 m/s, A/a = 1.25', () => {
  near(F.molesworth(2, 125, 100), (4 / 17.88 + 0.0152) * (1.5625 - 1), 1e-12);
  near(F.molesworth(2, 125, 100), 0.1344, 0.0001);
  near(F.molesworth(2, 100, 100), 0, 1e-12);
});

test('Barrel loss = (entry + exit + Manning friction) V²/2g: independent re-calculation', () => {
  const V = 2, n = 0.015, L = 30, R = 3 * 2.5 / (2 * 5.5);
  const hf = n * n * V * V * L / Math.pow(R, 4 / 3);       // Manning friction head
  const bl = F.barrelLoss(V, n, L, R, 0.5, 1.0);
  near(bl.h, 1.5 * V * V / 19.62 + hf, 1e-9);
});

test('Trough normal depth satisfies Manning', () => {
  const y = F.normalDepthRect(25, 8, 0.016, 1 / 2000);
  const A = 8 * y, R = A / (8 + 2 * y);
  near(A * Math.pow(R, 2 / 3) * Math.sqrt(1 / 2000) / 0.016, 25, 1e-6);
});

test('Uplift thickness: slab weight balances FS × uplift', () => {
  const t = F.roofThickness(1.35, 24, 1.2);
  near(24 * t, 1.2 * 9.81 * 1.35, 1e-9);
  const tf = F.floorThickness(97, 96, 24, 1.2);           // WT 1 m above floor top
  near(24 * tf, 1.2 * 9.81 * (1 + tf), 1e-9);
  assert.equal(F.floorThickness(95, 96, 24, 1.2), 0);
});

test('Syphon aqueduct (defaults): afflux = barrel loss; all checks pass; STAAD barrel frame valid', () => {
  const { v, r } = run({});
  const D = r.data;
  near(D.uHFL - v.dHFL, D.h, 1e-12);
  assert.ok(r.allOk(), JSON.stringify(r.checks.filter(c => !c.ok)));
  const ex = page.exports(v, r);
  assert.equal(ex.length, 1);
  assert.deepEqual(DS.staad.lint(ex[0].text), []);
  assert.match(ex[0].text, /KFY/);
});

test('Aqueduct: trough levels, Molesworth afflux, STAAD trough U-frame passes lint', () => {
  const { v, r } = run({ type: 'aqueduct' });
  const D = r.data;
  const Vt = v.Qc / (v.Bt * D.yt), Vc = v.Qc / ((v.bc + v.zc * v.Dc) * v.Dc);
  near(D.tBed, v.cFSL - 1.2 * (Vt * Vt - Vc * Vc) / 19.62 - D.yt, 1e-9);
  assert.ok(r.allOk(), JSON.stringify(r.checks.filter(c => !c.ok)));
  const ex = page.exports(v, r);
  assert.equal(ex[0].name, 'aqueduct-trough.std');
  assert.deepEqual(DS.staad.lint(ex[0].text), []);
  assert.match(ex[0].text, /TRAP GX/);
  assert.match(ex[0].text, /PERFORM ANALYSIS/);
  // drawings: trough section and elevation, valid DXF on standard layers
  const ds = page.drawings(v, r);
  assert.deepEqual(ds.map(d => d.key), ['trough', 'elevation']);
  for (const d of ds) {
    const P = DS.dxf.parse(DS.dxf.write(d.d));
    assert.ok(P.entities.length > 10);
  }
});

test('Aqueduct with too little clearance fails the clearance check', () => {
  const { r } = run({ type: 'aqueduct', cFSL: 102.5 });
  assert.ok(!r.checks.find(c => /Clearance/.test(c.label)).ok);
});
