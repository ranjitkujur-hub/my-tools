/* Design note (A4 print): inputs, method and code references, step-by-step
 * working, results and checks, tables, drawings and signature blocks.
 * Returns an HTML string; the app places it in #print-root and prints. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./base.js'));
  else { root.DS = root.DS || {}; root.DS.note = factory(root.DS.base); }
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Visible inputs as [{label, value, unit}] for notes and CSV.
  function echoInputs(page, v) {
    var out = [];
    (page.inputs || []).forEach(function (i) {
      if (!i.key || (i.show && !i.show(v))) return;
      var val = v[i.key];
      if (i.type === 'select') {
        var o = (i.options || []).filter(function (op) { return String(op[0]) === String(val); })[0];
        val = o ? o[1] : val;
      } else if (i.type === 'check') val = val ? 'Yes / हाँ' : 'No / नहीं';
      else if (i.type === 'textarea') {
        var lines = String(val || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        val = lines.length > 6 ? lines.slice(0, 6).join('; ') + ' … (' + lines.length + ' lines)' : lines.join('; ');
      }
      out.push({ label: (i.hi ? i.hi + ' / ' : '') + i.en, value: val, unit: i.unit || '' });
    });
    return out;
  }

  function list(items) {
    if (!items || !items.length) return '<p>—</p>';
    return '<ul>' + items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
  }

  function table(cols, rows, cls) {
    return '<table class="' + (cls || '') + '"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + (c && c.html ? c.html : esc(c)) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  function stepsHTML(steps) {
    return steps.map(function (s) { return s.h ? '<h4>' + esc(s.h) + '</h4>' : '<p class="step">' + esc(s.t) + '</p>'; }).join('');
  }

  /* o = {page, inputs: echoInputs(), rep, drawings: [{title, svg, scale}], meta: {office, project, structure, title, number, date, designed, checked, approved}} */
  function html(o) {
    var p = o.page, rep = o.rep, m = o.meta || {};
    var h = [];
    h.push('<article class="note">');
    h.push('<header class="note-head"><div class="office">' + esc(m.office || '') + '</div>');
    h.push('<h1>डिज़ाइन नोट / Design note</h1>');
    h.push('<h2>' + esc(p.hi) + ' / ' + esc(p.en) + '</h2>');
    h.push(table(['Project / परियोजना', 'Structure / संरचना', 'Drawing No.', 'Date'],
      [[m.project || '—', m.structure || '—', m.number || '—', m.date || '']], 'meta'));
    h.push('<p class="disc">' + esc(B.DISCLAIMER) + '</p></header>');

    h.push('<section><h3>1. इनपुट / Inputs</h3>' + table(['Item', 'Value', 'Unit'], o.inputs.map(function (i) { return [i.label, i.value, i.unit]; })) + '</section>');
    h.push('<section><h3>2. विधि एवं संदर्भ / Method and code references</h3>');
    h.push('<h4>Formulae</h4>' + list(rep.method.formulae));
    h.push('<h4>Codes and references</h4>' + list(rep.method.refs));
    h.push('<h4>Assumptions</h4>' + list(rep.method.assumptions));
    h.push('<h4>Validity limits</h4>' + list(rep.method.limits) + '</section>');
    h.push('<section><h3>3. चरणबद्ध गणना / Step-by-step working</h3>' + stepsHTML(rep.steps) + '</section>');
    h.push('<section><h3>4. परिणाम एवं जाँच / Results and checks</h3>');
    h.push(table(['Result', 'Value', 'Unit'], rep.results.map(function (r) { return [r.label, r.text, r.unit]; })));
    if (rep.checks.length) {
      h.push(table(['Check', 'Value', 'Limit', 'Status'], rep.checks.map(function (c) {
        return [c.label + (c.note ? ' (' + c.note + ')' : ''), c.value, c.limit, { html: c.ok ? '<b class="ok">OK</b>' : '<b class="nok">NOT OK</b>' }];
      })));
    }
    if (rep.warnings.length) h.push('<h4>Warnings / चेतावनी</h4>' + list(rep.warnings));
    h.push('</section>');
    if (rep.tables.length) {
      h.push('<section><h3>5. तालिकाएँ / Tables</h3>');
      rep.tables.forEach(function (t) {
        var rows = t.rows.length > 60 ? t.rows.slice(0, 60).concat([['… ' + (t.rows.length - 60) + ' more rows in CSV']]) : t.rows;
        h.push('<h4>' + esc(t.title) + '</h4>' + table(t.columns, rows.map(function (r) { return r.map(function (c) { return typeof c === 'number' ? B.f(c, 3) : c; }); })));
      });
      h.push('</section>');
    }
    if (o.drawings && o.drawings.length) {
      h.push('<section class="drw"><h3>6. चित्र / Drawings</h3>');
      o.drawings.forEach(function (d) { h.push('<figure>' + d.svg + '<figcaption>' + esc(d.title) + ' — scale ' + esc(d.scaleLabel || '') + '</figcaption></figure>'); });
      h.push('</section>');
    }
    h.push('<section class="sign"><table><tr><td>Designed / अभिकल्पित<br><br><br>' + esc(m.designed || '') + '</td><td>Checked / जाँचा<br><br><br>' + esc(m.checked || '') +
      '</td><td>Approved / अनुमोदित<br><br><br>' + esc(m.approved || '') + '</td></tr></table>');
    h.push('<p class="disc">' + esc(B.DISCLAIMER) + '</p></section>');
    h.push('</article>');
    return h.join('\n');
  }

  return { html: html, echoInputs: echoInputs, esc: esc };
});
