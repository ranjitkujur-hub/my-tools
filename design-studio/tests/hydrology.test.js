'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/modules/hydrology.js').fns;
const DS = require('../js/core/index.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('Dickens, Ryves, Inglis — formula forms as in Subramanya, Engineering Hydrology (independent re-calculation)', () => {
  close(H.dickens(100, 11), 11 * Math.pow(100, 0.75), 1e-9);
  close(H.dickens(100, 11), 347.85, 0.01, 'Q = 11 × 100^0.75');
  close(H.ryves(100, 8.5), 8.5 * Math.pow(100, 2 / 3), 1e-9);
  close(H.ryves(100, 8.5), 183.13, 0.01);
  close(H.inglis(100), 124 * 100 / Math.sqrt(110.4), 1e-9);
  close(H.inglis(100), 1180.15, 0.01);
});

test('Kirpich (1940) time of concentration and rational method', () => {
  // L = 3000 m, S = 0.01: tc = 0.01947 × 3000^0.77 × 0.01^-0.385
  const tc = H.kirpich(3000, 0.01);
  close(tc, 0.01947 * Math.exp(0.77 * Math.log(3000)) * Math.exp(-0.385 * Math.log(0.01)), 1e-9);
  close(tc, 54.6, 0.2);
  // Q = C i A / 3.6 = 0.278 C i A
  close(H.rational(0.5, 36, 10), 50, 1e-9, '0.5 × 36 mm/h × 10 km² / 3.6');
  close(H.rainfallDepth(240, 24), 240, 1e-9);
  close(H.rainfallDepth(240, 3), 120, 1e-9, '(3/24)^(1/3) = 0.5');
});

test('Gumbel frequency factor K for N → ∞ — table in Chow, Maidment & Mays, Applied Hydrology (1988)', () => {
  close(H.gumbelKinf(25), 2.044, 0.001);
  close(H.gumbelKinf(50), 2.592, 0.001);
  close(H.gumbelKinf(100), 3.137, 0.001);
  close(H.gumbelKinf(1000), 4.936, 0.001);
  close(H.reducedVariate(100), 4.6001, 0.0001);
});

test('Gumbel yn, Sn table (Subramanya, Table of reduced mean and SD) and finite-sample K', () => {
  const t = H.ynSn(30);
  close(t.yn, 0.5362, 1e-9); close(t.sn, 1.1124, 1e-9);
  const t2 = H.ynSn(32);
  assert.ok(t2.yn > 0.5362 && t2.yn < 0.5403, 'interpolated');
  close(H.gumbelK(100, 30), (4.6001 - 0.5362) / 1.1124, 0.001);
});

test('Gumbel design for a fictional series matches an independent mean/SD calculation', () => {
  const page = require('../js/modules/hydrology.js').pages.find(p => p.id === 'gumbel');
  const qs = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550];
  const v = DS.base.coerce(page.inputs, { series: qs.join('\n'), method: 'inf' });
  const rep = page.design(v);
  const mean = 325, sd = Math.sqrt(qs.reduce((a, q) => a + (q - mean) ** 2, 0) / 9);
  close(rep.data.mean, mean, 1e-9);
  close(rep.data.sd, sd, 1e-9);
  const q100 = rep.data.res.find(r => r[0] === 100)[3];
  close(q100, mean + 3.1367 * sd, 0.1);
  assert.ok(rep.checks.find(c => /Record length/.test(c.label)).ok === false, 'short record flagged');
});
