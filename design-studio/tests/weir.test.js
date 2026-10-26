'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/weir.js');
const F = M.fns;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test("Khosla's closed form at α = b/d = 10 matches Khosla's curves (≈ 28 % at E, ≈ 19.5 % at D) — Khosla, Bose & Taylor (1936), CBIP Pub. 12", () => {
  const lam = F.lambda(100, 10);
  near(lam, (1 + Math.sqrt(101)) / 2, 1e-12);
  near(100 * F.phiE(lam), 28.0, 0.3, 'φE');
  near(100 * F.phiD(lam), 19.45, 0.3, 'φD');
});

test('Khosla key points: independent re-calculation for b = 50 m, d = 6 m', () => {
  const a = 50 / 6, lam = (1 + Math.sqrt(1 + a * a)) / 2;
  near(F.lambda(50, 6), lam, 1e-12);
  near(F.phiE(lam), Math.acos((lam - 2) / lam) / Math.PI, 1e-12);
  near(F.phiD(lam), Math.acos((lam - 1) / lam) / Math.PI, 1e-12);
  assert.ok(F.phiE(lam) > F.phiD(lam), 'pressure falls along the seepage path E → D');
});

test('Exit gradient GE = H/d · 1/(π√λ) — independent check', () => {
  const lam = F.lambda(50, 6);
  near(F.exitGradient(4.5, 6, lam), 4.5 / 6 / (Math.PI * Math.sqrt(lam)), 1e-12);
  near(F.exitGradient(4.5, 6, lam), 0.1102, 5e-4);
});

test("Interference correction C = 19√(D/b′)(d + D)/b and Khosla's slope correction table", () => {
  near(F.interference(7, 4, 49.6, 50), 19 * Math.sqrt(7 / 49.6) * 11 / 50, 1e-12);
  assert.equal(F.interference(0, 4, 49.6, 50), 0);
  near(F.slopeCorrection(1), 11.2, 1e-9);
  near(F.slopeCorrection(3), 4.5, 1e-9);
  near(F.slopeCorrection(8), 2.0, 1e-9);
  near(F.slopeCorrection(3.5), (4.5 + 3.3) / 2, 1e-9);
});

test("Lacey scour depth R = 1.35 (q²/f)^(1/3) and Bligh creep length", () => {
  near(F.laceyScour(7.5, 1), 1.35 * Math.cbrt(56.25), 1e-12);
  near(F.laceyScour(7.5, 1), 5.17, 0.01);
  assert.equal(F.blighLength(50, 4, 6), 70);
});

test('Weir page defaults: corrections add up and all checks pass', () => {
  const p = M.pages[0];
  const v = DS.base.coerce(p.inputs, {});
  const r = p.design(v);
  const k = r.data.k;
  near(k.C1, k.raw.C1 + k.corr.int1 + k.corr.t1, 1e-9, 'C1');
  near(k.E2, k.raw.E2 + k.corr.int2 + k.corr.t2 + k.corr.slope, 1e-9, 'E2');
  near(r.data.H, 4.5, 1e-9);
  near(k.C1, 78.35, 0.05);
  near(k.E2, 29.2, 0.05);
  assert.ok(r.allOk(), r.checks.filter(c => !c.ok).map(c => c.label).join(', '));
  // thickness required at d/s end from corrected E2
  near(r.data.rows[r.data.rows.length - 1][3], k.E2 / 100 * 4.5 / (v.G - 1), 1e-3);
});

test('Weir page rejects a floor shorter than the crest block', () => {
  const p = M.pages[0];
  const v = DS.base.coerce(p.inputs, { b: 20 });
  assert.throws(() => p.design(v), /Floor too short/);
});
