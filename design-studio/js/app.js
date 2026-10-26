/* UI controller: menu, routing, module pages (inputs → live results,
 * drawing, working, tables), exports, printing, projects and settings. */
(function () {
  'use strict';
  var DS = window.DS, B = DS.base, esc = DS.note.esc;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var pages = [], byId = {};
  DS.modules.forEach(function (m) { (m.pages || []).forEach(function (p) { pages.push(p); byId[p.id] = p; }); });
  pages.sort(function (a, b) { return a.group === b.group ? (a.order || 0) - (b.order || 0) : (a.group < b.group ? -1 : 1); });
  var groupOrder = B.GROUPS.map(function (g) { return g.id; });
  pages.sort(function (a, b) { var ga = groupOrder.indexOf(a.group), gb = groupOrder.indexOf(b.group); return ga === gb ? (a.order || 0) - (b.order || 0) : ga - gb; });

  var state = { settings: Object.assign({}, DS.store.DEFAULT_SETTINGS), page: null, v: null, rep: null, drawings: [], loaded: null, activeDrawing: 0, timer: null };

  /* ---------- small helpers ---------- */
  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.className = ''; }, 3200);
  }
  function download(name, mime, content) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function today() {
    var d = new Date();
    return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'design'; }
  function groupOf(id) { return B.GROUPS.filter(function (g) { return g.id === id; })[0] || { hi: '', en: '' }; }
  function bi(hi, en) { return esc(hi) + ' <span class="en">/ ' + esc(en) + '</span>'; }

  /* ---------- menu ---------- */
  function renderMenu() {
    var h = ['<a class="side-home" href="#/">⌂ मुख्य पृष्ठ <span class="en">/ Home</span></a>'];
    B.GROUPS.forEach(function (g) {
      var ps = pages.filter(function (p) { return p.group === g.id; });
      if (!ps.length) return;
      h.push('<div class="side-group"><div class="side-h">' + g.id + '. ' + bi(g.hi, g.en) + '</div>');
      ps.forEach(function (p) { h.push('<a href="#/m/' + p.id + '" data-id="' + p.id + '">' + esc(p.hi) + ' <span class="en">' + esc(p.en) + '</span></a>'); });
      h.push('</div>');
    });
    h.push('<div class="side-group"><a href="#/projects">परियोजनाएँ <span class="en">Projects</span></a><a href="#/guide">सॉफ़्टवेयर गाइड <span class="en">Software guide</span></a><a href="#/settings">सेटिंग <span class="en">Settings</span></a></div>');
    $('#side').innerHTML = h.join('');
  }
  function closeMenu() { document.body.classList.remove('menu-open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }

  /* ---------- routing ---------- */
  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    closeMenu();
    $$('#side a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#/' + hash || (parts[0] === 'm' && a.dataset.id === parts[1])); });
    if (parts[0] === 'm' && byId[parts[1]]) return openPage(byId[parts[1]], parts[2]);
    if (parts[0] === 'projects') return renderProjects();
    if (parts[0] === 'settings') return renderSettings();
    if (parts[0] === 'guide') return renderGuide();
    renderHome();
  }

  function renderHome() {
    state.page = null;
    var h = ['<section class="home"><h1>' + bi('डिज़ाइन एवं ड्रॉइंग स्टूडियो', 'Design & Drawing Studio') + '</h1>',
      '<p class="lead">नहर, बाँध, जलीय संरचनाएँ, पुल-पुलिया एवं आरसीसी की प्रारंभिक गणना, डिज़ाइन नोट और आयामित चित्र। ' +
      '<span class="en">Preliminary calculations, design notes and dimensioned drawings, with exports to AutoCAD (DXF), STAAD.Pro, HEC-RAS, QGIS and Excel.</span></p>'];
    B.GROUPS.forEach(function (g) {
      var ps = pages.filter(function (p) { return p.group === g.id; });
      if (!ps.length) return;
      h.push('<h2>' + g.id + '. ' + bi(g.hi, g.en) + '</h2><div class="cards">');
      ps.forEach(function (p) {
        h.push('<a class="card" href="#/m/' + p.id + '"><b>' + esc(p.hi) + '</b><span class="en">' + esc(p.en) + '</span>' +
          (p.refs ? '<small>' + esc(p.refs) + '</small>' : '') + '</a>');
      });
      h.push('</div>');
    });
    h.push('<h2>' + bi('अन्य', 'More') + '</h2><div class="cards">' +
      '<a class="card" href="#/projects"><b>परियोजनाएँ</b><span class="en">Projects, backup and restore</span></a>' +
      '<a class="card" href="#/guide"><b>सॉफ़्टवेयर गाइड</b><span class="en">Design software and workflows</span></a>' +
      '<a class="card" href="#/settings"><b>सेटिंग</b><span class="en">Office name, title block</span></a></div></section>');
    $('#view').innerHTML = h.join('');
  }

  /* ---------- module page ---------- */
  function fieldHTML(i) {
    if (i.sec) return '<h3 class="sec"' + (i.show ? ' data-sec="' + esc(i.sec) + '"' : '') + '>' + esc(i.sec) + '</h3>';
    var lbl = '<span class="lbl">' + (i.hi ? esc(i.hi) + ' <span class="en">/ ' + esc(i.en) + '</span>' : esc(i.en)) + '</span>';
    var ctl, unit = i.unit ? '<span class="unit">' + esc(i.unit) + '</span>' : '';
    var id = 'f-' + i.key;
    if (i.type === 'select') {
      ctl = '<select id="' + id + '" name="' + i.key + '">' + i.options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (i.type === 'textarea') {
      ctl = '<textarea id="' + id + '" name="' + i.key + '" rows="' + (i.rows || 6) + '" spellcheck="false"></textarea>';
    } else if (i.type === 'check') {
      return '<label class="field check" data-key="' + i.key + '"><input type="checkbox" id="' + id + '" name="' + i.key + '"> ' + lbl +
        (i.help ? '<small class="help">' + esc(i.help) + '</small>' : '') + '</label>';
    } else if (i.type === 'text') {
      ctl = '<input id="' + id + '" name="' + i.key + '" type="text">';
    } else {
      ctl = '<input id="' + id + '" name="' + i.key + '" type="text" inputmode="decimal" autocomplete="off">';
    }
    return '<label class="field' + (i.type === 'textarea' ? ' wide' : '') + '" data-key="' + i.key + '" for="' + id + '">' + lbl +
      '<span class="ctl">' + ctl + unit + '</span><small class="err"></small>' +
      (i.help ? '<small class="help">' + esc(i.help) + '</small>' : '') + '</label>';
  }

  function setForm(page, v) {
    var form = $('#inputs');
    page.inputs.forEach(function (i) {
      if (!i.key) return;
      var el = form.elements[i.key];
      if (!el) return;
      var x = v[i.key];
      if (i.type === 'check') el.checked = !!x;
      else el.value = (x === undefined || x === null || (typeof x === 'number' && !isFinite(x))) ? '' : x;
    });
  }
  function readForm(page) {
    var form = $('#inputs'), raw = {};
    page.inputs.forEach(function (i) {
      if (!i.key) return;
      var el = form.elements[i.key];
      if (!el) return;
      raw[i.key] = i.type === 'check' ? el.checked : el.value;
    });
    return B.coerce(page.inputs, raw);
  }

  function openPage(page, designId) {
    state.page = page; state.loaded = null; state.activeDrawing = 0;
    var g = groupOf(page.group);
    var h = [];
    h.push('<section class="mod"><div class="mod-head"><div class="crumb">' + page.group + '. ' + esc(g.hi) + ' / ' + esc(g.en) + '</div>');
    h.push('<h1>' + bi(page.hi, page.en) + '</h1>');
    if (page.intro) h.push('<p class="intro">' + esc(page.intro) + '</p>');
    if (page.refs) h.push('<p class="refs">संदर्भ / Basis: ' + esc(page.refs) + '</p>');
    h.push('<div class="toolbar">' +
      '<button type="button" data-act="save" class="primary">सहेजें <span class="en">Save</span></button>' +
      '<button type="button" data-act="note">डिज़ाइन नोट <span class="en">Design note (A4)</span></button>' +
      '<button type="button" data-act="csv-all">CSV <span class="en">all tables</span></button>' +
      '<button type="button" data-act="reset">डिफ़ॉल्ट <span class="en">Defaults</span></button>' +
      '<button type="button" data-act="jump" class="only-narrow">परिणाम ↓ <span class="en">Results</span></button></div>');
    h.push('<p class="loaded" id="loaded" hidden></p></div>');
    h.push('<div class="mod-grid"><form class="inputs" id="inputs" autocomplete="off" novalidate><h2>' + bi('इनपुट', 'Inputs') + '</h2>' + page.inputs.map(fieldHTML).join('') + '</form>');
    h.push('<div class="outputs"><div class="panel" id="p-results"></div><div class="panel" id="p-drawing"></div>' +
      '<div class="panel" id="p-exports" hidden></div><div class="panel" id="p-working"></div><div class="panel" id="p-tables"></div></div></div></section>');
    $('#view').innerHTML = h.join('');
    var v = B.coerce(page.inputs, {});
    setForm(page, v);
    $('#inputs').addEventListener('input', schedule);
    $('#inputs').addEventListener('change', schedule);
    $('#inputs').addEventListener('submit', function (e) { e.preventDefault(); });
    if (designId) {
      DS.db.get(designId).then(function (d) {
        if (!d || d.module !== page.id) { toast('डिज़ाइन नहीं मिला / Design not found', true); recalc(); return; }
        state.loaded = d;
        setForm(page, B.coerce(page.inputs, d.inputs));
        showLoaded();
        recalc();
      }).catch(function () { recalc(); });
    } else recalc();
    window.scrollTo(0, 0);
  }

  function showLoaded() {
    var el = $('#loaded'), d = state.loaded;
    if (!el) return;
    if (!d) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = 'खुला डिज़ाइन / Open design: <b>' + esc(d.project) + '</b> › ' + esc(d.structure || '—') + (d.title ? ' › ' + esc(d.title) : '') +
      (d.drawingNo ? ' · Drg. ' + esc(d.drawingNo) : '');
  }

  function schedule() { clearTimeout(state.timer); state.timer = setTimeout(recalc, 250); }

  function recalc() {
    var page = state.page; if (!page) return;
    var v = readForm(page);
    state.v = v;
    // show / hide conditional inputs
    var heads = $$('h3.sec[data-sec]');
    page.inputs.forEach(function (i) {
      if (i.sec && i.show) {
        heads.forEach(function (h) { if (h.dataset.sec === i.sec) h.hidden = !i.show(v); });
        return;
      }
      if (!i.key) return;
      var el = $('.field[data-key="' + i.key + '"]');
      if (el) el.hidden = !!(i.show && !i.show(v));
    });
    var err = B.validate(page.inputs, v);
    $$('.field').forEach(function (el) {
      var k = el.dataset.key, e = err[k], s = $('.err', el);
      el.classList.toggle('bad', !!e);
      if (s) s.textContent = e || '';
    });
    if (Object.keys(err).length) { showError('इनपुट जाँचें / Check the inputs marked in red.'); return; }
    var rep;
    try { rep = page.design(v); } catch (e) { showError(e.message || String(e)); return; }
    state.rep = rep;
    try { state.drawings = page.drawings ? page.drawings(v, rep) || [] : []; } catch (e2) { state.drawings = []; rep.warn('Drawing could not be made: ' + e2.message); }
    if (state.activeDrawing >= state.drawings.length) state.activeDrawing = 0;
    renderResults(rep);
    renderDrawing();
    renderExports(v, rep);
    renderWorking(rep);
    renderTables(rep);
  }

  function showError(msg) {
    state.rep = null;
    $('#p-results').innerHTML = '<h2>' + bi('परिणाम', 'Results') + '</h2><p class="status nok">' + esc(msg) + '</p>';
    ['#p-drawing', '#p-working', '#p-tables'].forEach(function (s) { $(s).innerHTML = ''; });
    $('#p-exports').hidden = true;
  }

  function badge(ok) { return ok ? '<b class="ok">OK</b>' : '<b class="nok">NOT OK</b>'; }

  function renderResults(rep) {
    var h = ['<h2>' + bi('परिणाम एवं जाँच', 'Results and checks') + '</h2>'];
    if (rep.checks.length) {
      var all = rep.allOk();
      h.push('<p class="status ' + (all ? 'ok' : 'nok') + '">' + (all ? 'सभी जाँच ठीक / All checks OK' : 'कुछ जाँच विफल / Some checks NOT OK') + '</p>');
    }
    h.push('<table class="res"><tbody>' + rep.results.map(function (r) {
      return '<tr><th>' + esc(r.label) + '</th><td class="num">' + esc(r.text) + '</td><td class="unit">' + esc(r.unit) + '</td></tr>';
    }).join('') + '</tbody></table>');
    if (rep.checks.length) {
      h.push('<table class="checks"><thead><tr><th>जाँच / Check</th><th>Value</th><th>Limit</th><th></th></tr></thead><tbody>' + rep.checks.map(function (c) {
        return '<tr class="' + (c.ok ? '' : 'row-nok') + '"><td>' + esc(c.label) + (c.note ? '<small>' + esc(c.note) + '</small>' : '') + '</td><td>' + esc(c.value) +
          '</td><td>' + esc(c.limit) + '</td><td>' + badge(c.ok) + '</td></tr>';
      }).join('') + '</tbody></table>');
    }
    if (rep.warnings.length) h.push('<ul class="warn">' + rep.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>');
    $('#p-results').innerHTML = h.join('');
  }

  function renderDrawing() {
    var el = $('#p-drawing');
    if (!state.drawings.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    var dr = state.drawings[state.activeDrawing];
    var out;
    try { out = DS.svg.render(dr.d); } catch (e) { el.innerHTML = '<p class="status nok">Drawing error: ' + esc(e.message) + '</p>'; return; }
    dr.scale = out.scale;
    var h = ['<h2>' + bi('चित्र', 'Drawing') + '</h2>'];
    if (state.drawings.length > 1) {
      h.push('<div class="tabs" role="tablist">' + state.drawings.map(function (x, k) {
        return '<button type="button" role="tab" data-act="tab" data-k="' + k + '" aria-selected="' + (k === state.activeDrawing) + '">' + esc(x.title) + '</button>';
      }).join('') + '</div>');
    }
    h.push('<div class="svgbox">' + out.svg + '</div>');
    h.push('<div class="btns">' +
      '<button type="button" data-act="dxf">DXF <span class="en">AutoCAD R12</span></button>' +
      '<button type="button" data-act="svg">SVG</button><button type="button" data-act="png">PNG</button>' +
      '<button type="button" data-act="print-A4">प्रिंट / PDF A4</button><button type="button" data-act="print-A3">प्रिंट / PDF A3</button></div>');
    h.push('<p class="hint">DXF: units metres, layers CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR. Scale ' + esc(dr.d.scaleLabel(out.scale)) + ' on A4.</p>');
    el.innerHTML = h.join('');
  }

  function renderExports(v, rep) {
    var el = $('#p-exports'), page = state.page;
    var list = [];
    try { list = page.exports ? page.exports(v, rep) || [] : []; } catch (e) { list = []; rep.warn('Export failed: ' + e.message); }
    state.exports = list;
    var guide = (typeof page.guide === 'function' ? page.guide(v, rep) : page.guide) || [];
    if (!list.length && !guide.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var h = ['<h2>' + bi('सॉफ़्टवेयर निर्यात', 'Software exports') + '</h2>'];
    if (list.length) h.push('<div class="btns">' + list.map(function (x, k) { return '<button type="button" data-act="export" data-k="' + k + '">' + esc(x.label) + '</button>'; }).join('') + '</div>');
    list.forEach(function (x) { if (x.preview) h.push('<details><summary>' + esc(x.label) + ' — preview</summary><pre class="pre">' + esc(x.text.slice(0, 6000)) + '</pre></details>'); });
    if (guide.length) h.push('<h3>' + bi('चरणबद्ध गाइड', 'Step-by-step guide') + '</h3><ol class="guide">' + guide.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>');
    el.innerHTML = h.join('');
  }

  function li(a) { return a.length ? '<ul>' + a.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p>—</p>'; }

  function renderWorking(rep) {
    var m = rep.method;
    var h = ['<details open><summary><h2>' + bi('विधि एवं चरणबद्ध गणना', 'Method and step-by-step working') + '</h2></summary>'];
    h.push('<div class="method"><div><h3>सूत्र / Formulae</h3>' + li(m.formulae) + '</div><div><h3>कोड / Codes and references</h3>' + li(m.refs) + '</div>' +
      '<div><h3>मान्यताएँ / Assumptions</h3>' + li(m.assumptions) + '</div><div><h3>सीमाएँ / Validity limits</h3>' + li(m.limits) + '</div></div>');
    h.push('<div class="steps">' + rep.steps.map(function (s) { return s.h ? '<h4>' + esc(s.h) + '</h4>' : '<p>' + esc(s.t) + '</p>'; }).join('') + '</div></details>');
    $('#p-working').innerHTML = h.join('');
  }

  function cellText(c) { return typeof c === 'number' ? (Number.isInteger(c) ? String(c) : B.f(c, Math.abs(c) >= 100 ? 2 : 3)) : String(c === undefined || c === null ? '' : c); }

  function renderTables(rep) {
    var el = $('#p-tables');
    if (!rep.tables.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    var h = ['<h2>' + bi('तालिकाएँ', 'Tables') + '</h2>'];
    rep.tables.forEach(function (t, k) {
      h.push('<div class="tbl-head"><h3>' + esc(t.title) + '</h3><button type="button" data-act="csv" data-k="' + k + '">CSV</button></div>');
      h.push('<div class="scroll"><table class="data"><thead><tr>' + t.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        t.rows.slice(0, 400).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(cellText(c)) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>');
      if (t.rows.length > 400) h.push('<p class="hint">' + (t.rows.length - 400) + ' more rows in the CSV.</p>');
    });
    el.innerHTML = h.join('');
  }

  /* ---------- outputs ---------- */
  function baseName() {
    var d = state.loaded;
    return state.page.id + (d && d.structure ? '-' + slug(d.structure) : '');
  }
  function drawingMeta(dr, k, size) {
    var s = state.settings, d = state.loaded;
    var code = state.page.id.toUpperCase().replace(/-/g, '').slice(0, 8);
    return {
      office: s.office, size: size,
      title: (d && d.structure ? d.structure + ' — ' : '') + (dr.title || ''),
      number: (d && d.drawingNo ? d.drawingNo + (state.drawings.length > 1 ? '/' + (k + 1) : '') : (s.prefix || 'DS') + '/' + code + '/' + (k + 1)),
      date: today(), designed: s.designed, checked: s.checked, approved: s.approved, disclaimer: B.DISCLAIMER
    };
  }

  function printHTML(html, pageCSS) {
    $('#page-style').textContent = '@page { ' + pageCSS + ' }';
    var root = $('#print-root');
    root.innerHTML = html;
    document.body.classList.add('printing');
    if (printHTML.done) window.removeEventListener('afterprint', printHTML.done);
    var done = printHTML.done = function () { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); printHTML.done = null; };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 60);
  }

  function svgToPng(svg, wmm, hmm, name) {
    var px = Math.min(8, 7000 / Math.max(wmm, hmm));
    var img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = Math.round(wmm * px); c.height = Math.round(hmm * px);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { download(name, 'image/png', b); }, 'image/png');
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('PNG नहीं बना / PNG failed', true); };
    img.src = url;
  }

  function act(name, btn) {
    var page = state.page, rep = state.rep, k = btn && btn.dataset.k !== undefined ? Number(btn.dataset.k) : 0;
    var dr = state.drawings[state.activeDrawing];
    var fname = baseName() + (dr ? '-' + dr.key : '');
    switch (name) {
      case 'tab': state.activeDrawing = k; renderDrawing(); break;
      case 'dxf': download(fname + '.dxf', 'application/dxf', DS.dxf.write(dr.d, { scale: dr.scale })); break;
      case 'svg': download(fname + '.svg', 'image/svg+xml', DS.svg.render(dr.d).svg); break;
      case 'png': { var r = DS.svg.render(dr.d); svgToPng(r.svg, r.w, r.h, fname + '.png'); break; }
      case 'print-A4': case 'print-A3': {
        var size = name.slice(-2), sh = DS.svg.sheet(dr.d, drawingMeta(dr, state.activeDrawing, size));
        printHTML('<div class="sheet sheet-' + size + '">' + sh.svg + '</div>', 'size: ' + size + ' landscape; margin: 0');
        break;
      }
      case 'csv': { var t = rep.tables[k]; download(baseName() + '-' + slug(t.title) + '.csv', 'text/csv', '﻿' + DS.csv.toCSV(t.columns, t.rows)); break; }
      case 'csv-all':
        if (!rep) return toast('पहले इनपुट ठीक करें / Fix inputs first', true);
        download(baseName() + '-all.csv', 'text/csv', '﻿' + DS.csv.reportCSV(page.en, DS.note.echoInputs(page, state.v), rep)); break;
      case 'export': { var x = state.exports[k]; download(x.name, x.mime || 'text/plain', x.text); break; }
      case 'reset': state.loaded = null; showLoaded(); setForm(page, B.coerce(page.inputs, {})); recalc(); break;
      case 'note': designNote(); break;
      case 'jump': $('#p-results').scrollIntoView({ behavior: 'smooth' }); break;
      case 'save': saveDialog(); break;
    }
  }

  function designNote() {
    var page = state.page, rep = state.rep;
    if (!rep) return toast('पहले इनपुट ठीक करें / Fix inputs first', true);
    var s = state.settings, d = state.loaded;
    var drs = state.drawings.map(function (dr, k) {
      var r = DS.svg.render(dr.d, { w: 236, h: 200 });   // usable ≈ 180 × 145 mm after label margins
      return { title: dr.title, svg: r.svg, scaleLabel: dr.d.nts ? 'NTS' : dr.d.scaleLabel(r.scale) + ' (on A4 portrait)', k: k };
    });
    var html = DS.note.html({
      page: page, inputs: DS.note.echoInputs(page, state.v), rep: rep, drawings: drs,
      meta: { office: s.office, project: d ? d.project : '', structure: d ? d.structure : '', number: d ? d.drawingNo : '', date: today(),
        designed: s.designed, checked: s.checked, approved: s.approved }
    });
    printHTML(html, 'size: A4 portrait; margin: 14mm 12mm 14mm 18mm');
  }

  /* ---------- save dialog ---------- */
  function dialog(html, onSubmit) {
    var dlg = $('#dlg'), form = $('#dlg-form');
    form.innerHTML = html;
    form.onsubmit = function (e) {
      var which = e.submitter ? e.submitter.value : 'ok';
      if (which === 'cancel') return;
      onSubmit(which, form);
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var first = $('input', form); if (first) first.focus();
  }

  function saveDialog() {
    if (!state.rep) return toast('पहले इनपुट ठीक करें / Fix inputs first', true);
    DS.db.designs().then(function (all) {
      var projects = Array.from(new Set(all.map(function (d) { return d.project; }))).sort();
      var d = state.loaded || {};
      dialog('<h2>' + bi('डिज़ाइन सहेजें', 'Save design') + '</h2>' +
        '<label>परियोजना / Project<input name="project" list="dl-projects" required value="' + esc(d.project || '') + '" placeholder="e.g. Sample Canal Project"></label>' +
        '<datalist id="dl-projects">' + projects.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
        '<label>संरचना / Structure<input name="structure" value="' + esc(d.structure || '') + '" placeholder="e.g. Fall at Ch 3+450"></label>' +
        '<label>शीर्षक / Title (optional)<input name="title" value="' + esc(d.title || '') + '"></label>' +
        '<label>चित्र संख्या / Drawing No.<input name="drawingNo" value="' + esc(d.drawingNo || '') + '" placeholder="' + esc((state.settings.prefix || 'DS') + '/001') + '"></label>' +
        '<div class="btns">' + (d.id ? '<button value="update" class="primary">अद्यतन / Update</button><button value="new">नया / Save as new</button>' : '<button value="new" class="primary">सहेजें / Save</button>') +
        '<button value="cancel" formnovalidate>रद्द / Cancel</button></div>', function (which, form) {
        var o = { project: form.elements.project.value, structure: form.elements.structure.value, title: form.elements.title.value,
          drawingNo: form.elements.drawingNo.value, module: state.page.id, inputs: state.v };
        if (which === 'update' && d.id) { o.id = d.id; o.created = d.created; }
        var rec = DS.store.makeDesign(o);
        DS.db.put(rec).then(function () { state.loaded = rec; showLoaded(); toast('सहेजा गया / Saved'); })
          .catch(function (e) { toast('सहेजा नहीं जा सका / Could not save: ' + e.message, true); });
      });
    }).catch(function (e) { toast('Storage error: ' + e.message, true); });
  }

  /* ---------- projects ---------- */
  function renderProjects() {
    state.page = null;
    DS.db.designs().then(function (all) {
      var groups = DS.store.group(all);
      var h = ['<section class="projects"><h1>' + bi('परियोजनाएँ', 'Projects') + '</h1>',
        '<div class="toolbar"><label class="filebtn">JSON आयात <span class="en">Import JSON</span><input type="file" accept=".json,application/json" id="imp"></label>' +
        '<button type="button" data-pact="backup">बैकअप <span class="en">Backup all</span></button>' +
        '<label class="filebtn">पुनर्स्थापना <span class="en">Restore</span><input type="file" accept=".json,application/json" id="restore"></label></div>'];
      if (!groups.length) h.push('<p class="empty">अभी कोई डिज़ाइन सहेजा नहीं गया। किसी मॉड्यूल में “सहेजें” दबाएँ। <span class="en">No saved designs yet. Use “Save” on any module page.</span></p>');
      groups.forEach(function (g) {
        h.push('<div class="proj"><div class="proj-head"><h2>' + esc(g.name) + '</h2><button type="button" data-pact="export-project" data-p="' + esc(g.name) + '">JSON निर्यात <span class="en">Export project</span></button></div>');
        g.structures.forEach(function (s) {
          h.push('<h3>' + esc(s.name) + '</h3><ul class="designs">');
          s.designs.forEach(function (d) {
            var p = byId[d.module];
            h.push('<li><a href="#/m/' + esc(d.module) + '/' + esc(d.id) + '"><b>' + esc(d.title || (p ? p.en : d.module)) + '</b> <span class="en">' + esc(p ? p.hi + ' / ' + p.en : d.module) +
              (d.drawingNo ? ' · ' + esc(d.drawingNo) : '') + ' · ' + esc(d.updated.slice(0, 10)) + '</span></a>' +
              '<span class="row-btns"><button type="button" data-pact="dup" data-id="' + esc(d.id) + '">प्रतिलिपि <span class="en">Duplicate</span></button>' +
              '<button type="button" data-pact="export-one" data-id="' + esc(d.id) + '">JSON</button>' +
              '<button type="button" data-pact="del" data-id="' + esc(d.id) + '" class="danger">हटाएँ <span class="en">Delete</span></button></span></li>');
          });
          h.push('</ul>');
        });
        h.push('</div>');
      });
      h.push('</section>');
      $('#view').innerHTML = h.join('');
      $('#imp').addEventListener('change', function (e) { readFile(e.target.files[0], importFile); e.target.value = ''; });
      $('#restore').addEventListener('change', function (e) { readFile(e.target.files[0], restoreFile); e.target.value = ''; });
      state.allDesigns = all;
    }).catch(function (e) { $('#view').innerHTML = '<p class="status nok">Storage error: ' + esc(e.message) + '</p>'; });
  }

  function readFile(file, fn) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () { fn(String(r.result)); };
    r.readAsText(file);
  }
  function importFile(text) {
    var j;
    try { j = DS.store.parseImport(text); } catch (e) { return toast(e.message, true); }
    DS.db.designs().then(function (all) {
      var list = DS.store.mergeIds(all, j.designs);
      return DS.db.putMany(list).then(function () { toast(list.length + ' डिज़ाइन आयात / design(s) imported'); renderProjects(); });
    }).catch(function (e) { toast(e.message, true); });
  }
  function restoreFile(text) {
    var j;
    try { j = DS.store.parseImport(text); } catch (e) { return toast(e.message, true); }
    if (!confirm('सभी मौजूदा डिज़ाइन बदल दिए जाएँगे। जारी रखें?\nAll current designs will be replaced by the ' + j.designs.length + ' design(s) in this file. Continue?')) return;
    var settings = j.settings ? Object.assign({}, DS.store.DEFAULT_SETTINGS, j.settings) : null;
    DS.db.replaceAll(j.designs, settings).then(function () {
      if (settings) state.settings = settings;
      toast('पुनर्स्थापित / Restored ' + j.designs.length + ' design(s)'); renderProjects();
    }).catch(function (e) { toast(e.message, true); });
  }

  function projAct(name, btn) {
    var all = state.allDesigns || [], id = btn.dataset.id;
    var d = all.filter(function (x) { return x.id === id; })[0];
    if (name === 'backup') {
      download('design-studio-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json', JSON.stringify(DS.store.backup(state.settings, all), null, 1));
    } else if (name === 'export-project') {
      var list = all.filter(function (x) { return x.project === btn.dataset.p; });
      download('project-' + slug(btn.dataset.p) + '.json', 'application/json', JSON.stringify(DS.store.exportDesigns(list, 'project'), null, 1));
    } else if (name === 'export-one' && d) {
      download(d.module + '-' + slug(d.structure || d.title) + '.json', 'application/json', JSON.stringify(DS.store.exportDesigns([d], 'design'), null, 1));
    } else if (name === 'dup' && d) {
      DS.db.put(DS.store.duplicate(d)).then(function () { toast('प्रतिलिपि बनी / Duplicated'); renderProjects(); });
    } else if (name === 'del' && d) {
      if (!confirm('यह डिज़ाइन हटाएँ? / Delete this design?\n' + d.project + ' › ' + (d.structure || '') + ' › ' + (d.title || d.module))) return;
      DS.db.del(id).then(function () { toast('हटाया गया / Deleted'); renderProjects(); });
    }
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    state.page = null;
    var s = state.settings;
    function f(key, hi, en, ph) {
      return '<label class="field"><span class="lbl">' + esc(hi) + ' <span class="en">/ ' + esc(en) + '</span></span><span class="ctl"><input name="' + key + '" value="' + esc(s[key] || '') + '" placeholder="' + esc(ph || '') + '"></span></label>';
    }
    $('#view').innerHTML = '<section class="settings"><h1>' + bi('सेटिंग', 'Settings') + '</h1><form id="set-form" class="inputs" autocomplete="off">' +
      '<h3 class="sec">शीर्षक खंड / Title block</h3>' +
      f('office', 'कार्यालय का नाम', 'Office name', 'e.g. Executive Engineer, Sample Irrigation Division') +
      f('designed', 'अभिकल्पित', 'Designed by', '') + f('checked', 'जाँचा', 'Checked by', '') + f('approved', 'अनुमोदित', 'Approved by', '') +
      f('prefix', 'चित्र संख्या उपसर्ग', 'Drawing number prefix', 'DS') +
      '<label class="field"><span class="lbl">डिफ़ॉल्ट शीट <span class="en">/ Default print sheet</span></span><span class="ctl"><select name="sheet"><option value="A3">A3</option><option value="A4">A4</option></select></span></label>' +
      '<div class="btns"><button class="primary" type="submit">सहेजें <span class="en">Save settings</span></button></div></form>' +
      '<p class="hint">ये नाम केवल इसी ब्राउज़र में रहते हैं। <span class="en">These details stay in this browser only and print in the title block and design notes.</span></p></section>';
    var form = $('#set-form');
    form.elements.sheet.value = s.sheet || 'A3';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = {};
      ['office', 'designed', 'checked', 'approved', 'prefix', 'sheet'].forEach(function (k) { n[k] = form.elements[k].value.trim(); });
      state.settings = Object.assign({}, DS.store.DEFAULT_SETTINGS, n);
      DS.db.saveSettings(state.settings).then(function () { toast('सहेजा गया / Saved'); }).catch(function (er) { toast(er.message, true); });
    });
  }

  function renderGuide() {
    state.page = null;
    $('#view').innerHTML = DS.guideHTML ? DS.guideHTML() : '<p>Guide not available.</p>';
  }

  /* ---------- wiring ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (b && state.page) { e.preventDefault(); try { act(b.dataset.act, b); } catch (er) { toast(er.message, true); } return; }
    var p = e.target.closest('[data-pact]');
    if (p) { e.preventDefault(); projAct(p.dataset.pact, p); }
  });
  $('#menu-btn').addEventListener('click', function () {
    var open = document.body.classList.toggle('menu-open');
    this.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', route);
  $('#disclaimer').textContent = B.DISCLAIMER;
  $('#foot-disc').textContent = B.DISCLAIMER;
  renderMenu();

  DS.db.settings().then(function (s) { state.settings = Object.assign({}, DS.store.DEFAULT_SETTINGS, s); })
    .catch(function () { /* private mode: settings stay default */ })
    .then(route);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
  }
})();
