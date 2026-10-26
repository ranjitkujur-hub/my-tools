'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mod = require('../js/modules/canal.js');
const C = mod.fns;
const DS = require('../js/core/index.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const page = id => mod.pages.find(p => p.id === id);

test('Lacey regime channel, Q = 30 m³/s, f = 1 (classic example, S.K. Garg, Irrigation Engineering)', () => {
  const L = C.lacey(30, 1.0);
  close(L.V, 0.7735, 0.0005, 'V = (Q f²/140)^(1/6)');
  close(L.P, 26.02, 0.01, 'P = 4.75 √Q');
  close(L.R, 1.496, 0.001, 'R = 2.5 V²/f');
  close(L.A, 38.78, 0.05, 'A = Q/V');
  close(1 / L.S, 5887, 2, 'S = f^(5/3) / (3340 Q^(1/6))');
  close(C.siltFactor(0.323), 1.0003, 0.001, 'f = 1.76 √d');
});

test('Lacey trapezoid: section from P and A satisfies both (independent check)', () => {
  const L = C.lacey(30, 1);
  const t = C.trapFromPA(L.P, L.A, 0.5);
  const g = C.trapGeom(t.b, t.D, 0.5);
  close(g.P, L.P, 1e-6);
  close(g.A, L.A, 1e-6);
});

test("Kennedy: V0 = 0.55 m D^0.64 and Kutter's formula consistent at the solution", () => {
  close(C.kennedyV0(1, 1), 0.55, 1e-12);
  const K = C.kennedy(14, 1, 0.0225, 5.7, 0.5);
  close(K.A * K.V0, 14, 1e-6, 'continuity');
  close(K.b / K.D, 5.7, 1e-9);
  close(C.kutterV(0.0225, K.R, K.S), K.V0, 1e-6, 'Kutter velocity equals V0');
  assert.ok(K.D > 1 && K.D < 2.5, 'depth of the right order for 14 m³/s');
});

test("Manning, lined trapezoid: re-computed discharge equals design Q (independent re-calculation)", () => {
  const p = page('canal-lined');
  const v = DS.base.coerce(p.inputs, { Q: 12, n: 0.018, Sn: 5000, z: 1.5, ratio: 3 });
  const rep = p.design(v);
  const D = rep.data.D, b = rep.data.b;
  const A = (b + 1.5 * D) * D, P = b + 2 * D * Math.sqrt(1 + 1.5 * 1.5);
  close(A * Math.pow(A / P, 2 / 3) * Math.sqrt(1 / 5000) / 0.018, 12, 1e-6);
  close(b / D, 3, 1e-9);
});

test('Triangular section with rounded bottom (IS 4745): A = D²(θ + cot θ), P = 2D(θ + cot θ), R = D/2', () => {
  const z = 1.25, th = Math.atan(1 / z), D = 2;
  const g = C.triGeom(D, z);
  close(g.A, 4 * (th + 1 / Math.tan(th)), 1e-12);
  close(g.R, 1, 1e-12);
  // top width: tangent point then straight slope to FSL
  close(g.T, 2 * (D * Math.sin(th) + z * D * Math.cos(th)), 1e-12);
  // numeric area check of the same shape by integration of the half section
  let area = 0; const n = 20000;
  for (let i = 0; i < n; i++) {
    const y = D * (i + 0.5) / n; // height above bed
    const yc = D - y;            // distance below FSL (centre)
    const xArc = Math.sqrt(Math.max(D * D - yc * yc, 0));
    const yt = D * Math.cos(th); // depth of tangent point below FSL
    const x = yc > yt ? xArc : D * Math.sin(th) + z * (yt - yc);
    area += 2 * x * D / n;
  }
  close(area, g.A, 1e-3, 'integrated area');
});

test('Lined canal checks: velocity limits flag a steep canal', () => {
  const p = page('canal-lined');
  const rep = p.design(DS.base.coerce(p.inputs, { Sn: 300 }));
  assert.equal(rep.checks.find(c => /limit for lining/.test(c.label)).ok, false);
  assert.equal(C.liningFreeboard(0.5), 0.3);
  assert.equal(C.liningFreeboard(50), 0.6);
});

test('L-section: bed falls at the slope, falls are inserted where ground drops (independent re-calculation)', () => {
  const p = page('canal-lsection');
  const v = DS.base.coerce(p.inputs, { ground: '0, 101\n1000, 100.9\n2000, 99.0', bed0: 100.4, Sn: 5000, dbal: 0.6, minFall: 0.5, maxFall: 1.5 });
  const rep = p.design(v);
  const rows = rep.data.rows;
  close(rows[1][4], 100.4 - 0.2, 1e-9, 'no fall at 1000 m');
  // at 2000 m: bed before = 100.0, target = 98.4 → drop 1.6 limited to 1.5
  close(rows[2][3], 100.0, 1e-9);
  close(rows[2][5], 1.5, 1e-9);
  close(rows[2][4], 98.5, 1e-9);
  assert.equal(rep.data.falls.length, 1);
  const ex = p.exports(v, rep)[0];
  assert.ok(ex.text.includes('River Station: 2000.0') && ex.text.includes('River Station: 0.0'));
});
