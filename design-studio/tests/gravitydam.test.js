'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/gravitydam.js');
const { section, forces, analyze, upliftDiagram, zangarCm, polyProps, COMBOS } = M.fns;
const page = M.pages[0];

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

// Elementary triangular profile: vertical u/s face, d/s slope from the top, no top width.
function triangle(H, B, opts) {
  return Object.assign({ FL: 0, TL: H, a: 0, mu: 0, hu: 0, md: B / H, hdv: 0, gallery: false, xd: B / 2,
    gc: 24, gw: 9.81, gsh: 13.34, gsv: 18.88, ah: 0, av: 0, FRL: H, MWL: H, TWL: -1, TWLmax: -1, SL: -1,
    mu_f: 0.75, coh: 0 }, opts || {});
}
const B_combo = COMBOS.find(c => c.id === 'B');
const G_combo = COMBOS.find(c => c.id === 'G');

test('Elementary profile B = H/√(Sc − c) with full uplift (c = 1) gives zero heel stress (Garg, gravity dams — elementary profile, independent check)', () => {
  const H = 40, Sc = 24 / 9.81, Bw = H / Math.sqrt(Sc - 1);
  const v = triangle(H, Bw);
  const s = section(v);
  near(s.B, Bw, 1e-9, 'base width');
  const an = analyze(forces(v, s, G_combo).list, s.B, v);   // drains inoperative => linear uplift
  near(an.sHeel, 0, 1e-6, 'heel stress');
  near(an.xbar, 2 * Bw / 3, 1e-6, 'resultant at outer middle third');
});

test('Elementary profile without uplift: B = H/√Sc gives zero heel stress (independent check)', () => {
  const H = 30, Sc = 24 / 9.81, Bw = H / Math.sqrt(Sc);
  const v = triangle(H, Bw);
  const s = section(v);
  const list = forces(v, s, G_combo).list.filter(q => q.kind !== 'U');
  const an = analyze(list, s.B, v);
  near(an.sHeel, 0, 1e-6, 'heel stress');
});

test('Forces on a triangular profile match hand calculation', () => {
  const H = 20, Bw = 16, v = triangle(H, Bw, { coh: 100 });
  const s = section(v);
  const fr = forces(v, s, G_combo);
  const W = fr.list.find(q => q.kind === 'W'), P = fr.list.find(q => q.kind === 'Pw'), U = fr.list.find(q => q.kind === 'U');
  near(-W.Fy, 0.5 * Bw * H * 24, 1e-6, 'W'); near(W.x, Bw / 3, 1e-9, 'W at B/3 from heel');
  near(P.Fx, 9.81 * H * H / 2, 1e-6, 'P'); near(P.y, H / 3, 1e-9, 'P at H/3');
  near(U.Fy, 9.81 * H * Bw / 2, 1e-6, 'U'); near(U.x, Bw / 3, 1e-9, 'U at B/3');
  const an = analyze(fr.list, s.B, v);
  const V = 0.5 * Bw * H * 24 - 9.81 * H * Bw / 2;
  near(an.V, V, 1e-6, 'ΣV');
  near(an.sff, (0.75 * V + 100 * Bw) / (9.81 * H * H / 2), 1e-9, 'shear friction factor');
  // overturning about toe: restoring W·2B/3; overturning P·H/3 + U·2B/3
  const fs = (0.5 * Bw * H * 24 * 2 * Bw / 3) / (9.81 * H * H / 2 * H / 3 + 9.81 * H * Bw / 2 * 2 * Bw / 3);
  near(an.fsToe, fs, 1e-9, 'FS overturning');
  // stresses sum: (σh + σt)/2 = ΣV/B
  near((an.sHeel + an.sToe) / 2, V / Bw, 1e-9, 'mean stress');
});

test('Uplift with drains: head at drain line = h2 + (h1 − h2)/3 (IS 6512 practice, verify clause)', () => {
  const ud = upliftDiagram(40, 30, 3, true, 8);
  near(ud[2][1], 3 + 27 / 3, 1e-12);
  // area by hand: trapezoids 0–8 and 8–40
  near(polyProps(ud).A, 8 * (30 + 12) / 2 + 32 * (12 + 3) / 2, 1e-9, 'uplift area');
});

test('Zangar hydrodynamic coefficient: Cm = 0.735 for a vertical face, 0 for horizontal', () => {
  near(zangarCm(0), 0.735, 1e-12);
  near(zangarCm(90), 0, 1e-12);
  near(zangarCm(30), 0.735 * 2 / 3, 1e-12);
});

test('Earthquake: Zangar Pe = 0.726 Cm αh γw h² for a vertical face, weight reduced by (1 − αv)', () => {
  const H = 30, v = triangle(H, 25, { ah: 0.1, av: 0.05 });
  const s = section(v);
  const fr = forces(v, s, COMBOS.find(c => c.id === 'C'));
  const Pe = fr.list.find(q => q.kind === 'Pe'), W = fr.list.find(q => q.kind === 'W'), EQ = fr.list.find(q => q.kind === 'EQ');
  near(Pe.Fx, 0.726 * 0.735 * 0.1 * 9.81 * H * H, 1e-6, 'Pe');
  near(Pe.y, 0.412 * H, 1e-9, 'Pe height');
  near(-W.Fy, 0.95 * 0.5 * 25 * H * 24, 1e-6, 'W(1 − αv)');
  near(EQ.Fx, 0.1 * 0.5 * 25 * H * 24, 1e-6, 'αh W');
});

test('Gallery area is deducted from self weight', () => {
  const v = DS.base.coerce(page.inputs, {});
  const s = section(v);
  const noGal = section(Object.assign({}, v, { gallery: false }));
  near(polyProps(s.pts).A - M.fns.massProps(s).A, v.gwid * v.ghgt, 1e-9);
  near(M.fns.massProps(noGal).A, polyProps(noGal.pts).A, 1e-12);
});

test('Default design: seven load combinations, all checks pass, tables for CSV', () => {
  const v = DS.base.coerce(page.inputs, {});
  const r = page.design(v);
  assert.equal(r.tables[0].rows.length, 7);
  assert.ok(r.allOk(), r.checks.filter(c => !c.ok).map(c => c.label).join('; '));
  const csv = DS.csv.toCSV(r.tables[1].columns, r.tables[1].rows);
  assert.ok(csv.split('\r\n').length > 40);
});

test('Invalid inputs give clear errors', () => {
  const v = DS.base.coerce(page.inputs, {});
  assert.throws(() => page.design(Object.assign({}, v, { gx: 47 })), /Gallery/);
  assert.throws(() => page.design(Object.assign({}, v, { MWL: 240 })), /MWL/);
  assert.throws(() => page.design(Object.assign({}, v, { hdv: 60 })), /Vertical d\/s/);
});
