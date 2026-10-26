'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/rcc.js');
const F = M.fns;
const page = id => M.pages.find(p => p.id === id);
const run = (id, over) => { const p = page(id); const v = DS.base.coerce(p.inputs, over || {}); return { p, v, r: p.design(v) }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (±${tol})`);
const resultText = (r, label) => r.results.find(x => x.label === label).text;

test('SP 16 Table D: Mu,lim/(b d²) = 0.148 fck (Fe250), 0.138 fck (Fe415), 0.133 fck (Fe500); 2.76 N/mm² for M20 Fe415', () => {
  const k = (fck, fy) => F.muLim(fck, fy, 1000, 1000) / 1e9;
  near(k(20, 415), 2.76, 0.005, 'M20 Fe415');
  near(k(20, 250) / 20, 0.148, 0.001, 'Fe250');
  near(k(25, 415) / 25, 0.138, 0.001, 'Fe415');
  near(k(30, 500) / 30, 0.133, 0.001, 'Fe500');
  assert.equal(F.xuMaxRatio(250), 0.53);
  assert.equal(F.xuMaxRatio(415), 0.48);
  assert.equal(F.xuMaxRatio(500), 0.46);
});

test('IS 456 G-1.1: Ast from the closed form satisfies moment equilibrium within the rounding of its constants (independent re-calculation)', () => {
  const b = 230, d = 450, fck = 20, fy = 415, Mu = 100e6;
  const Ast = F.astSingly(Mu, fck, fy, b, d);
  const xu = 0.87 * fy * Ast / (0.36 * fck * b);
  near(0.87 * fy * Ast * (d - 0.42 * xu), Mu, 5e-3 * Mu, 'moment');
  assert.ok(xu / d < F.xuMaxRatio(fy), 'under-reinforced');
  assert.ok(Number.isNaN(F.astSingly(1e12, fck, fy, b, d)), 'NaN when the section is far too small');
});

test('IS 456 Table 19 τc at grid points and by linear interpolation; Table 20 τc,max', () => {
  assert.equal(F.tauC(1.0, 20), 0.62);
  assert.equal(F.tauC(0.5, 25), 0.49);
  assert.equal(F.tauC(3.0, 40), 1.01);
  near(F.tauC(0.375, 20), 0.42, 1e-9);
  near(F.tauC(1.0, 22.5), 0.63, 1e-9);
  near(F.tauC(0.05, 20), 0.28, 1e-9, 'below pt 0.15 uses the first row');
  assert.equal(F.tauCmax(20), 2.8);
  assert.equal(F.tauCmax(30), 3.5);
  near(F.slabK(150), 1.30, 1e-9); near(F.slabK(300), 1.00, 1e-9); near(F.slabK(160), 1.28, 1e-9);
});

test("SP 16 Table F: fsc for Fe415 = 355, 353, 342, 329 N/mm² at d'/d = 0.05–0.20", () => {
  assert.deepEqual([0.05, 0.1, 0.15, 0.2].map(x => F.fsc(415, x)), [355, 353, 342, 329]);
  assert.equal(F.fsc(250, 0.1), 217);
  near(F.fsc(500, 0.125), (412 + 395) / 2, 1e-9);
});

test('Doubly reinforced beam: Asc and Ast match an independent re-calculation (IS 456 G-1.2)', () => {
  const { r, v } = run('rcc-beam', { b: 300, D: 550, cover: 50, dc: 50, Mu: 290, fck: '25', fy: '415' });
  const d = 500, Ml = F.muLim(25, 415, 300, d);
  const fsc = F.fsc(415, 0.1), Asc = (290e6 - Ml) / ((fsc - 0.446 * 25) * (d - 50));
  const xm = 0.48 * d, Ast = Ml / (0.87 * 415 * (d - 0.42 * xm)) + Asc * (fsc - 0.446 * 25) / (0.87 * 415);
  assert.equal(resultText(r, 'Section type'), 'Doubly reinforced');
  near(r.results.find(x => x.label === 'Ast required').value, Ast, 0.5);
  assert.match(resultText(r, 'Compression steel'), new RegExp('^' + Math.ceil(Asc / F.barArea(v.phic)) + ' – 16'));
});

test('Singly reinforced beam: tension bars cover Ast,req and stirrup spacing follows 0.87 fy Asv d / Vus', () => {
  const { r } = run('rcc-beam', { Mu: 150, Vu: 250, phi: 20 });
  assert.equal(resultText(r, 'Section type'), 'Singly reinforced');
  const req = r.results.find(x => x.label === 'Ast required').value;
  const n = Number(resultText(r, 'Tension steel').split(' ')[0]);
  assert.ok(n * F.barArea(20) >= req && (n - 1) * F.barArea(20) < req);
  const d = 500, pt = 100 * n * F.barArea(20) / (300 * d), Vus = 250e3 - F.tauC(pt, 25) * 300 * d;
  const sv = 0.87 * 415 * 2 * F.barArea(8) * d / Vus;
  const prov = Number(resultText(r, 'Stirrups').match(/@ (\d+)/)[1]);
  assert.equal(prov, Math.floor(Math.min(sv, 300) / 5) * 5);
});

test('Deflection modification factor (fitted to IS 456 Fig. 4) behaves like the chart', () => {
  const m = F.mfTension(240, 1.0);
  assert.ok(m > 0.9 && m < 1.15, 'fs 240, pt 1 % ≈ 1.0: ' + m);
  assert.ok(F.mfTension(145, 0.5) > F.mfTension(240, 0.5), 'lower stress → larger factor');
  assert.ok(F.mfTension(240, 0.3) > F.mfTension(240, 2.0), 'less steel → larger factor');
  assert.equal(F.mfTension(100, 0.05), 2.0, 'capped at 2');
  near(F.mfCompression(1.0), 1.25, 1e-9);
});

test('IS 456 Table 27 and Table 26 coefficients (transcribed) with interpolation', () => {
  const ss = F.twoWayCoeffs('ss', 1.0);
  assert.equal(ss.ax, 0.062); assert.equal(ss.ay, 0.062);
  const ss2 = F.twoWayCoeffs('ss', 1.05);
  near(ss2.ax, 0.068, 1e-9); near(ss2.ay, 0.0615, 1e-9);
  const c1 = F.twoWayCoeffs(1, 1.0);
  assert.equal(c1.axn, 0.032); assert.equal(c1.ax, 0.024); assert.equal(c1.ayn, 0.032); assert.equal(c1.ay, 0.024);
  near(F.twoWayCoeffs(4, 1.25).axn, (0.060 + 0.065) / 2, 1e-9);
  assert.equal(F.twoWayCoeffs(9, 2.0).ax, 0.107);
  assert.equal(F.twoWayCoeffs(6, 1.5).axn, 0, 'case 6 has no short-span support moment');
});

test('Two-way simply supported slab: Mx = αx wu lx² (independent re-calculation)', () => {
  const { r } = run('rcc-slab', { lx: 4, ly: 4.8, D: 160, edge: 'ss', LL: 3, FF: 1, gc: 25 });
  const wu = 1.5 * (0.16 * 25 + 1 + 3), ax = 0.084;    // ly/lx = 1.2
  near(r.results.find(x => x.label === 'Short span midspan (+) Mu').value, ax * wu * 16, 1e-6);
  near(r.results.find(x => x.label === 'Long span midspan (+) Mu').value, 0.059 * wu * 16, 1e-6);
});

test('One-way simply supported slab (ly/lx > 2): M = wu lx²/8 and distribution steel ≥ 0.12 % bD', () => {
  const { r } = run('rcc-slab', { lx: 3, ly: 7, D: 125, edge: 'ss' });
  assert.equal(resultText(r, 'Slab type'), 'One-way');
  const wu = 1.5 * (0.125 * 25 + 1 + 3);
  near(r.results.find(x => x.label === 'Short span midspan (+) Mu').value, wu * 9 / 8, 1e-6);
  const dist = r.tables[0].rows.find(row => row[0] === 'Distribution (long)');
  assert.ok(dist[5] >= 0.0012 * 1000 * 125);
});

test('Short column IS 456 cl 39.3: 400×400, M20, Fe415, 1 % steel carries 1712 kN (independent re-calculation)', () => {
  const Ag = 160000, Asc = 1600, Pu = (0.4 * 20 * (Ag - Asc) + 0.67 * 415 * Asc) / 1e3;
  near(Pu, 1712.08, 0.01);
  const { r } = run('rcc-column', { b: 400, D: 400, Pu: Pu, fck: '20', fy: '415' });
  near(r.results.find(x => x.label === 'Asc required').value, 1600, 0.5);
  assert.ok(r.results.find(x => x.label === 'Axial capacity Pu').value >= Pu);
  assert.deepEqual(F.perimeterLayout(8, 400, 400), { nb: 3, nd: 3, total: 8 });
});

test('Column: minimum eccentricity and slenderness checks', () => {
  const { r } = run('rcc-column', { b: 300, D: 300, l: 4, lex: 4, ley: 4 });
  const c = r.checks.find(x => x.label.startsWith('emin ≤ 0.05 D'));
  assert.equal(c.ok, false, 'l/500 + D/30 = 18 mm < 20 → 20 > 15 mm');
  assert.equal(r.checks.find(x => x.label.startsWith('Short column lex/D')).ok, false, '4000/300 = 13.3 ≥ 12');
});

test('Isolated footing: size, net pressure and punching shear agree with an independent re-calculation', () => {
  const { r } = run('rcc-footing', { P: 1000, SBC: 200, sw: 10, cb: 400, cd: 400, fck: '20', fy: '415', cover: 50, phi: 12, gf: 1.5 });
  const L = Math.ceil(Math.sqrt(1100 / 200) / 0.05 - 1e-9) * 0.05;   // 2.35 m
  near(L, 2.35, 1e-9);
  const qu = 1500 / (L * L);
  near(r.results.find(x => x.label === 'Net upward pressure qu').value, qu, 1e-6);
  const D = r.results.find(x => x.label === 'Thickness D').value;
  const d = D - 50 - 12, b0 = 4 * (400 + d), Vp = 1500 - qu * Math.pow((400 + d) / 1000, 2);
  assert.ok(Vp * 1e3 / (b0 * d) <= 0.25 * Math.sqrt(20), 'punching OK at adopted depth');
  assert.ok(r.allOk(), 'all footing checks pass for the default design');
  // 50 mm thinner must fail at least one shear/flexure check (smallest depth adopted)
  const thinner = F.footingAt({ cb: 400, cd: 400, L, B: L, qu, Pu: 1500, fck: 20, fy: 415, cover: 50, phi: 12 }, D - 50);
  assert.equal(thinner.ok, false);
});

test('Every RCC drawing carries reinforcement on layer REBAR in the DXF', () => {
  for (const p of M.pages) {
    const v = DS.base.coerce(p.inputs, {});
    const r = p.design(v);
    for (const dr of p.drawings(v, r)) {
      const P = DS.dxf.parse(DS.dxf.write(dr.d));
      assert.ok(P.entities.some(e => e.layer === 'REBAR'), p.id + ' has REBAR entities');
      assert.ok(P.entities.some(e => e.layer === 'CONCRETE'), p.id + ' has CONCRETE entities');
    }
  }
});

test('Default RCC designs pass all their checks', () => {
  for (const p of M.pages) {
    const r = p.design(DS.base.coerce(p.inputs, {}));
    assert.deepEqual(r.checks.filter(c => !c.ok).map(c => c.label), [], p.id);
  }
});
