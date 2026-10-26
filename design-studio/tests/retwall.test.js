'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const W = require('../js/modules/retwall.js');
const page = W.pages[0];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

test('Rankine Ka = (1 − sin φ)/(1 + sin φ) = tan²(45° − φ/2): 1/3 at 30°, 0.271 at 35°', () => {
  near(W.fns.rankineKa(30), 1 / 3, 1e-12);
  near(W.fns.rankineKa(35), Math.pow(Math.tan((45 - 17.5) * Math.PI / 180), 2), 1e-12);
  near(W.fns.rankineKa(35), 0.271, 0.0005);
});

test('Stability of the default wall agrees with a hand re-calculation (moments about the toe)', () => {
  const v = DS.base.coerce(page.inputs, {});
  const s = W.fns.stability(v);
  const H = v.H, hs = H - v.tb, Ka = 1 / 3;
  const xB = v.toe + v.tbot, heel = v.Bw - xB;
  const parts = [
    [v.ttop * hs * 25, xB - v.ttop / 2],
    [0.5 * (v.tbot - v.ttop) * hs * 25, v.toe + 2 * (v.tbot - v.ttop) / 3],
    [v.Bw * v.tb * 25, v.Bw / 2],
    [heel * hs * 18, xB + heel / 2]];
  const Wsum = parts.reduce((a, p) => a + p[0], 0), Mr = parts.reduce((a, p) => a + p[0] * p[1], 0);
  near(s.Wsum, Wsum, 1e-9); near(s.Mr, Mr, 1e-9);
  const P1 = 0.5 * Ka * 18 * H * H, P2 = Ka * v.q * H;
  near(s.Ph, P1 + P2, 1e-9);
  near(s.Mo, P1 * H / 3 + P2 * H / 2, 1e-9);
  // base pressure resultant equals the vertical load
  near((s.qmax + s.qmin) / 2 * v.Bw, s.Wp, 1e-9);
  near(s.e, v.Bw / 2 - (Mr + v.q * heel * (xB + heel / 2) - s.Mo) / (Wsum + v.q * heel), 1e-9);
});

test('IS 456 cl 20.2 sliding check uses 0.9 × dead load; a short base fails', () => {
  const v = DS.base.coerce(page.inputs, { Bw: 2.6, mu: 0.5 });
  const r = page.design(v);
  const s = W.fns.stability(v);
  near(r.results.find(x => x.label === 'FS sliding (0.9 μ W/Ph)').value, 0.9 * 0.5 * s.Wsum / s.Ph, 1e-9);
  assert.equal(r.checks.find(c => c.label.startsWith('Sliding')).ok, false);
});

test('Stem moment Mu = 1.5 (Ka γ h³/6 + Ka q h²/2) at the top of the base', () => {
  const v = DS.base.coerce(page.inputs, {});
  const r = page.design(v);
  const h = v.H - v.tb, Ka = 1 / 3;
  const Mu = 1.5 * (Ka * 18 * h ** 3 / 6 + Ka * v.q * h * h / 2);
  near(r.tables[1].rows[0][1], Math.round(Mu * 100) / 100, 1e-9);
});

test('Default wall passes all checks and its drawing has REBAR, CONCRETE and SOIL layers', () => {
  const v = DS.base.coerce(page.inputs, {});
  const r = page.design(v);
  assert.deepEqual(r.checks.filter(c => !c.ok).map(c => c.label), []);
  const P = DS.dxf.parse(DS.dxf.write(page.drawings(v, r)[0].d));
  for (const l of ['REBAR', 'CONCRETE', 'SOIL']) assert.ok(P.entities.some(e => e.layer === l), l);
});

test('Invalid geometry is rejected with a clear message', () => {
  assert.throws(() => page.design(DS.base.coerce(page.inputs, { toe: 3.5, Bw: 3.7 })), /Toe/);
});
