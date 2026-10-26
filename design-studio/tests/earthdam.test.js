'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/earthdam.js');
const { geometry, ground, phreatic, waveHeight, windSetup, circleFS, gridSearch } = M.fns;
const page = M.pages[0];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

const dam = { FL: 0, crest: 25, bc: 7, zu: 3, zd: 3 };

test('Kozeny base parabola with toe filter: S = √(d² + h²) − d, q = kS, passes through B at reservoir level (Casagrande 1937, independent re-calculation)', () => {
  const g = geometry(dam), h = 21, Lf = 20, k = 1e-7;
  const ph = phreatic(g, { h, filter: true, Lf, k });
  const xB = 0.7 * 3 * h, xF = g.xT - Lf, d = xF - xB;
  const S = Math.sqrt(d * d + h * h) - d;
  near(ph.S, S, 1e-9, 'S'); near(ph.q, k * S, 1e-15, 'q');
  near(ph.yBase(xB), h, 1e-9, 'base parabola through B');
  near(ph.yBase(xF + S / 2), 0, 1e-6, 'vertex S/2 beyond focus');
  near(ph.yBase(xF), S, 1e-9, 'y = S above the focus');
  near(ph.y(3 * h), h, 1e-9, 'starts at reservoir level on the u/s face');
});

test('Schaffernak (α < 30°): exit point lies on the Dupuit line and on the d/s face', () => {
  const g = geometry(dam), h = 21, k = 1e-6;
  const ph = phreatic(g, { h, filter: false, k });
  assert.equal(ph.method, 'schaffernak');
  const a = ph.a, al = Math.atan(1 / 3);
  near(ph.q, k * a * Math.sin(al) * Math.tan(al), 1e-15, 'q');
  const [xe, ye] = ph.exit;
  near(ye, ground(g, xe), 1e-9, 'exit on d/s face');
  near(ye * ye, h * h - 2 * (ph.q / k) * (xe - ph.xB), 1e-6, 'Dupuit parabola through exit');
});

test('Casagrande (α ≥ 30°) used for steep d/s slopes', () => {
  const g = geometry(Object.assign({}, dam, { zd: 1.5 }));
  const ph = phreatic(g, { h: 21, filter: false, k: 1e-6 });
  assert.equal(ph.method, 'casagrande');
  assert.ok(ph.a > 0 && ph.exit[1] > 0);
});

test('Wave height, Molitor–Stevenson: V = 80 km/h, F = 3 km gives 0.902 m (independent re-calculation)', () => {
  near(waveHeight(80, 3), 0.032 * Math.sqrt(240) + 0.763 - 0.271 * Math.pow(3, 0.25), 1e-12);
  near(waveHeight(80, 3), 0.902, 0.0005);
  near(waveHeight(100, 40), 0.032 * Math.sqrt(4000), 1e-12, 'long-fetch form');
});

test('Wind set-up, Zuider Zee formula S = V²F/(62000 D)', () => {
  near(windSetup(80, 3, 12), 80 * 80 * 3 / (62000 * 12), 1e-12);
});

test('Undrained slope (φ = 0): Fellenius = Bishop = c·R·arc / ΣW·arm (independent numerical integration)', () => {
  const g = geometry({ FL: 0, crest: 10, bc: 20, zu: 2, zd: 2 });
  const s = { g, phr: null, gm: 18, gs: 18, c: 40, phi: 0, Df: 10, n: 24 };
  const xc = 52, yc = 16, R = Math.sqrt((g.xT - xc) ** 2 + yc * yc);
  const r = circleFS(s, xc, yc, R, true);
  near(r.fel, r.bishop, 1e-9, 'identical for φ = 0');
  // independent: fine slicing
  let Md = 0; const N = 20000, dx = (r.xR - r.xL) / N;
  for (let i = 0; i < N; i++) {
    const x = r.xL + (i + 0.5) * dx, yb = yc - Math.sqrt(R * R - (x - xc) ** 2), h = ground(g, x) - yb;
    if (h > 0) Md += 18 * h * dx * (xc - x);
  }
  const aL = Math.atan2(ground(g, r.xL) - yc, r.xL - xc), aR = Math.atan2(ground(g, r.xR) - yc, r.xR - xc);
  const arc = R * Math.abs(aR - aL);
  near(r.bishop, 40 * arc * R / Md, 0.02 * r.bishop, 'FS within 2 % of fine integration');
});

test('Dry cohesionless 2:1 slope: minimum FS ≈ tanφ/tanβ (infinite-slope limit), Bishop ≥ Fellenius', () => {
  const g = geometry({ FL: 0, crest: 10, bc: 20, zu: 2, zd: 2 });
  const s = { g, phr: null, gm: 18, gs: 18, c: 0, phi: 30, Df: 10, n: 24 };
  const best = gridSearch(s).best;
  const inf = Math.tan(Math.PI / 6) / 0.5;
  assert.ok(best.bishop >= inf * 0.98, `FS ${best.bishop} should not be below the infinite-slope value ${inf}`);
  assert.ok(best.bishop <= inf * 1.2, `FS ${best.bishop} should approach ${inf}`);
  assert.ok(best.bishop >= best.fel - 1e-9, 'Bishop ≥ Fellenius');
});

test('Pore pressure from seepage lowers the factor of safety', () => {
  const g = geometry(dam);
  const ph = phreatic(g, { h: 21, filter: false, k: 1e-7 });
  const base = { g, gm: 19, gs: 20.5, c: 15, phi: 28, Df: 5, n: 24 };
  const wet = circleFS(Object.assign({ phr: ph }, base), 136, 68, 72);
  const dry = circleFS(Object.assign({ phr: null }, base), 136, 68, 72);
  assert.ok(wet.bishop < dry.bishop);
});

test('Default design runs fast and passes; given-circle mode and errors', () => {
  const v = DS.base.coerce(page.inputs, {});
  const t = Date.now();
  const r = page.design(v);
  assert.ok(Date.now() - t < 500, 'live recalculation should be quick');
  assert.ok(r.allOk(), r.checks.filter(c => !c.ok).map(c => c.label).join('; '));
  assert.ok(r.tables.find(t => t.id === 'slices').rows.length >= 20);
  const r2 = page.design(Object.assign({}, v, { mode: 'given' }));
  assert.ok(r2.data.given.bishop >= r2.data.crit.bishop - 1e-6, 'grid minimum not above the given circle');
  assert.throws(() => page.design(Object.assign({}, v, { mode: 'given', R: 200 })), /Given circle/);
  assert.throws(() => page.design(Object.assign({}, v, { FRL: 130 })), /FRL/);
});
