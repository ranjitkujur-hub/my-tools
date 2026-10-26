'use strict';
/* Generic checks for every module page: defaults validate, design() returns a
 * complete report (formulae, references, assumptions, limits, steps, results),
 * every drawing renders to SVG and to a valid R12 DXF on the standard layers,
 * and every export produces text. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const DS = require('../js/core/index.js');

const dir = path.join(__dirname, '..', 'js', 'modules');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const ALLOWED = new Set(['0'].concat(DS.Drawing.LAYER_NAMES));

for (const file of files) {
  const mod = require(path.join(dir, file));
  for (const page of mod.pages) {
    test(`${file} › ${page.id}: inputs, report, drawings and exports`, () => {
      assert.ok(page.id && page.group && page.hi && page.en, 'page meta');
      for (const i of page.inputs) {
        if (!i.key) continue;
        if (!i.type || i.type === 'number') assert.ok(i.unit, `${page.id}.${i.key} must show a unit`);
        assert.ok(i.en, `${page.id}.${i.key} needs an English label`);
      }
      const v = DS.base.coerce(page.inputs, {});
      assert.deepEqual(DS.base.validate(page.inputs, v), {}, 'defaults must validate');
      const rep = page.design(v);
      assert.ok(rep instanceof DS.base.Report, 'design() returns a Report');
      const m = rep.method;
      assert.ok(m.formulae.length && m.refs.length && m.assumptions.length && m.limits.length, 'method sections filled');
      assert.ok(rep.steps.length > 2 && rep.results.length, 'steps and results');
      for (const r of rep.results) if (typeof r.value === 'number') assert.ok(isFinite(r.value), `result ${r.label} finite`);
      const drawings = page.drawings ? page.drawings(v, rep) : [];
      for (const dr of drawings) {
        assert.ok(dr.key && dr.title && dr.d instanceof DS.Drawing, 'drawing entry');
        const s = DS.svg.render(dr.d);
        assert.match(s.svg, /^<svg[\s\S]*<\/svg>$/);
        assert.ok(!/NaN|Infinity/.test(s.svg), `${dr.key} SVG has no NaN`);
        const dxf = DS.dxf.write(dr.d, { scale: s.scale });
        assert.ok(!/NaN|Infinity/.test(dxf), `${dr.key} DXF has no NaN`);
        const P = DS.dxf.parse(dxf);
        assert.deepEqual(P.sections, ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
        assert.ok(P.entities.length > 5, 'has entities');
        for (const e of P.entities) if (e.layer !== null) assert.ok(ALLOWED.has(e.layer), 'layer ' + e.layer);
        const sheet = DS.svg.sheet(dr.d, { size: 'A3', title: dr.title });
        assert.ok(!/NaN/.test(sheet.svg));
      }
      const ex = page.exports ? page.exports(v, rep) : [];
      for (const x of ex) assert.ok(x.name && typeof x.text === 'string' && x.text.length > 20, 'export ' + x.label);
      const note = DS.note.html({ page, inputs: DS.note.echoInputs(page, v), rep, drawings: [], meta: {} });
      assert.ok(note.includes('Preliminary design aid'));
    });
  }
}
