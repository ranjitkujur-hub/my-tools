'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/falls.js');
const F = M.fns;
const page = M.pages[0];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const run = o => { const v = DS.base.coerce(page.inputs, o); return { v, r: page.design(v) }; };

test('Sarda crest formulae (Garg, Irrigation Engineering): rectangular 1.835, trapezoidal 1.99, B = 0.55√d', () => {
  // independent re-calculation: L = 6, H = 0.8, B = 0.8
  near(F.sardaQ('rect', 6, 0.8, 0.8), 1.835 * 6 * Math.pow(0.8, 1.5), 1e-12);
  near(F.sardaQ('trap', 10, 1.0, 1.0), 19.9, 1e-12);
  near(F.sardaCrestWidth('rect', 0.8, 2.25), 0.55 * 1.5, 1e-12);
  near(F.sardaCrestWidth('trap', 0.75, 3.25), 0.55 * 2, 1e-12);
});

test('Sarda head iteration satisfies Q, B and d simultaneously (independent re-check)', () => {
  for (const shape of ['rect', 'trap']) {
    const s = F.sardaHead(8, 6, shape, 210.52, 207.7);
    assert.ok(s.ok);
    near(s.d, 210.52 - s.H - 207.7, 1e-9, 'd');
    near(s.B, shape === 'rect' ? 0.55 * Math.sqrt(s.d) : 0.55 * Math.sqrt(s.H + s.d), 1e-9, 'B');
    near(F.sardaQ(shape, 6, s.H, s.B), 8, 1e-6, 'Q');
  }
});

test('Cistern (UPIRI formula in Garg): Lc = 5√(E·HL), x = (E·HL)^(2/3)/4', () => {
  const c = F.cistern(1, 1);
  near(c.L, 5, 1e-12); near(c.x, 0.25, 1e-12);
  const c2 = F.cistern(0.8, 1.5);
  near(c2.L, 5 * Math.sqrt(1.2), 1e-12); near(c2.x, Math.pow(1.2, 2 / 3) / 4, 1e-12);
});

test('Rand (1955) straight drop: hand calculation q = 2 m²/s, h = 2 m', () => {
  const g = F.rand(2, 2);
  near(g.D, 4 / (9.81 * 8), 1e-9, 'D');
  near(g.Ld, 3.850, 0.002, 'Ld');
  near(g.yc, Math.cbrt(4 / 9.81), 1e-9, 'yc');
  // momentum check: Bélanger sequent depth of Rand's y1 is close to Rand's y2
  const F1 = (2 / g.y1) / Math.sqrt(9.81 * g.y1), y2b = g.y1 / 2 * (Math.sqrt(1 + 8 * F1 * F1) - 1);
  near(y2b / g.y2, 1, 0.08, 'y2 consistent with momentum');
});

test('Sarda design (defaults): levels, Bligh creep and thickness are consistent', () => {
  const { v, r } = run({});
  const D = r.data;
  near(D.crest + D.H, v.usBed + v.Du + Math.pow(v.Q / ((v.Bu + v.z * v.Du) * v.Du), 2) / 19.62, 1e-9, 'crest + H = TEL');
  near(D.cf, v.dsBed - D.x, 1e-12);
  assert.ok(r.allOk(), JSON.stringify(r.checks.filter(c => !c.ok)));
  const creep = r.checks.find(c => /Creep/.test(c.label));
  assert.ok(creep.ok);
});

test('Sarda auto crest: trapezoidal above 14 m³/s', () => {
  const { r } = run({ Q: 20, Bu: 10 });
  assert.equal(r.data.shape, 'trap');
});

test('Straight drop design (defaults): USBR basin proportions and tail-water', () => {
  const { v, r } = run({ type: 'drop' });
  const D = r.data;
  near(D.LB, D.rand.Ld + 2.55 * D.yc, 1e-9, 'L_B');
  near(D.xb, D.rand.Ld + 0.8 * D.yc, 1e-9);
  near(D.hb, 0.8 * D.yc, 1e-12); near(D.hs, 0.4 * D.yc, 1e-12);
  assert.ok(v.dsBed + v.Dd - D.floor >= 2.15 * D.yc - 1e-9);
  // crest length keeps the u/s FSL: critical flow over the crest
  near(1.705 * D.L * Math.pow(D.usWL + D.ha - D.crest, 1.5), v.Q, 1e-6);
  assert.ok(r.allOk(), JSON.stringify(r.checks.filter(c => !c.ok)));
});

test('Bad levels are rejected with a clear message', () => {
  assert.throws(() => run({ dsBed: 210 }), /Downstream bed/);
});
