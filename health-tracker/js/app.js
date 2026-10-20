/* Kidney Health Tracker — user interface.
 * Single page, hash routes, all data in IndexedDB on this device. */
(function () {
  'use strict';
  var KT = window.KT, calc = KT.calc, db = KT.db, charts = KT.charts, backup = KT.backup, exporter = KT.exporter;

  var S = { profile: {}, settings: {}, labs: [], vitals: [], meds: [], injections: [], visits: [], dialysis: [] };
  var ui = { trend: { preset: '1y', from: '', to: '' }, gridCols: '12', restore: null, locked: false, hiddenAt: 0 };
  var main = document.getElementById('main');
  var DEFAULT_DUE = [{ key: 'hb', days: 30 }, { key: 'creatinine', days: 30 }];

  /* ---------- small helpers ---------- */

  function esc(s) {
    return s === null || s === undefined ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function bi(hi, en) { return '<span lang="hi">' + esc(hi) + '</span> <span class="en">/ ' + esc(en) + '</span>'; }
  function today() { return calc.todayISO(); }
  function nowLocal() { var d = new Date(); return today() + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function fd(v) { return calc.fmtDate(v); }
  function fmtV(v) { return v === null || v === undefined || v === '' ? '' : String(+(+v).toFixed(2)); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function custom() { return S.settings.customTests || []; }
  function range(key) { return calc.rangeFor(key, S.profile.sex, S.settings, custom()); }
  function target(key) { return calc.targetFor(key, S.settings); }
  function info(key) { return calc.testInfo(key, custom()) || { key: key, hi: key, en: key, unit: '' }; }
  function byDesc(k) { return function (a, b) { return (a[k] || '') < (b[k] || '') ? 1 : (a[k] || '') > (b[k] || '') ? -1 : 0; }; }
  function byAsc(k) { return function (a, b) { return (a[k] || '') < (b[k] || '') ? -1 : (a[k] || '') > (b[k] || '') ? 1 : 0; }; }
  function hasData() { return db.STORES.some(function (s) { return S[s].length; }) || !!S.profile.name; }
  function age() { return calc.ageOn(S.profile.dob, today()); }
  function sexLabel(s) { return s === 'f' ? 'महिला / Female' : s === 'm' ? 'पुरुष / Male' : ''; }
  function rangeText(r) {
    if (!r || (r.lo === null && r.hi === null)) return '';
    if (r.lo === null) return '≤ ' + fmtV(r.hi);
    if (r.hi === null) return '≥ ' + fmtV(r.lo);
    return fmtV(r.lo) + '–' + fmtV(r.hi);
  }
  function flagBadge(f) {
    return f === 'H' ? ' <b class="flag H" title="ज़्यादा / High">H</b>' : f === 'L' ? ' <b class="flag L" title="कम / Low">L</b>' : '';
  }
  function offTarget(key, v) {
    var t = target(key);
    return t && calc.flag(v, t) ? ' <span class="offt" title="डॉक्टर के लक्ष्य से बाहर / Outside doctor\'s target">◎</span>' : '';
  }
  function valueHtml(key, v) { return fmtV(v) + flagBadge(calc.flag(v, range(key))) + offTarget(key, v); }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function saveSettings() { return db.setMeta('settings', S.settings); }
  function current(meds) { var t = today(); return (meds || S.meds).filter(function (m) { return calc.isCurrentMed(m, t); }).sort(byAsc('name')); }

  /* ---------- form fields ---------- */

  function field(f, val) {
    var id = 'f_' + f.k, v = val === null || val === undefined ? '' : val, input;
    var attrs = ' id="' + id + '" name="' + f.k + '"' + (f.req ? ' required' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '');
    switch (f.type) {
      case 'textarea': input = '<textarea' + attrs + ' rows="3">' + esc(v) + '</textarea>'; break;
      case 'select':
        input = '<select' + attrs + '>' + f.options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>';
        break;
      case 'date': case 'datetime':
        input = '<input type="' + (f.type === 'date' ? 'date' : 'datetime-local') + '"' + attrs + ' value="' + esc(v) + '">' +
          '<small class="date-hint" data-hint-for="' + id + '">' + esc(f.type === 'date' ? fd(v) : calc.fmtDateTime(v)) + '</small>';
        break;
      case 'number':
        input = '<input type="number" inputmode="decimal" step="' + (f.step || 'any') + '"' + attrs + ' value="' + esc(v) + '">'; break;
      case 'tel': input = '<input type="tel"' + attrs + ' value="' + esc(v) + '">'; break;
      case 'password': input = '<input type="password"' + attrs + ' autocomplete="new-password">'; break;
      default:
        input = '<input type="text"' + attrs + (f.list ? ' list="' + f.list + '"' : '') + ' value="' + esc(v) + '" autocomplete="off">';
    }
    return '<div class="field' + (f.wide ? ' wide' : '') + '"><label for="' + id + '">' + bi(f.hi, f.en) +
      (f.unit ? ' <small>(' + esc(f.unit) + ')</small>' : '') + (f.req ? ' *' : '') + '</label>' + input +
      (f.help ? '<small class="help">' + f.help + '</small>' : '') + '</div>';
  }

  function readFields(form, fields, base) {
    var data = new FormData(form), out = Object.assign({}, base || {});
    fields.forEach(function (f) {
      var raw = data.get(f.k);
      raw = raw === null ? '' : String(raw).trim();
      out[f.k] = f.type === 'number' ? calc.num(raw) : raw;
    });
    return out;
  }

  /* ---------- record types with a generic list + form ---------- */

  var FOOD = [['', 'कोई भी / Any'], ['before', 'खाने से पहले / Before food'], ['after', 'खाने के बाद / After food'], ['with', 'खाने के साथ / With food']];
  function foodLabel(v) { var o = FOOD.filter(function (x) { return x[0] === v; })[0]; return o && v ? o[1] : ''; }
  var FREQ = Object.keys(calc.FREQUENCIES).map(function (k) { return [k, calc.FREQUENCIES[k].hi + ' / ' + calc.FREQUENCIES[k].en]; });

  var RECORDS = {
    vitals: {
      hi: 'बीपी, वज़न व लक्षण', en: 'BP, weight & symptoms', sort: 'datetime',
      fields: [
        { k: 'datetime', type: 'datetime', hi: 'तारीख व समय', en: 'Date & time', req: true, def: nowLocal },
        { k: 'sys', type: 'number', hi: 'बीपी ऊपर', en: 'BP systolic', unit: 'mmHg', step: 1 },
        { k: 'dia', type: 'number', hi: 'बीपी नीचे', en: 'BP diastolic', unit: 'mmHg', step: 1 },
        { k: 'pulse', type: 'number', hi: 'नब्ज़', en: 'Pulse', unit: '/min', step: 1 },
        { k: 'weight', type: 'number', hi: 'वज़न', en: 'Weight', unit: 'kg' },
        { k: 'urine', type: 'number', hi: 'पेशाब की मात्रा (वैकल्पिक)', en: 'Urine output (optional)', unit: 'mL/day' },
        { k: 'notes', type: 'textarea', hi: 'लक्षण', en: 'Symptoms', ph: 'सूजन, साँस फूलना… / swelling, breathlessness…', wide: true }
      ],
      line: function (r) {
        return '<b>' + esc(calc.fmtDateTime(r.datetime)) + '</b> ' +
          (r.sys || r.dia ? '<span class="pill">BP ' + fmtV(r.sys) + '/' + fmtV(r.dia) + '</span>' : '') +
          (r.pulse ? '<span class="pill">' + fmtV(r.pulse) + '/min</span>' : '') +
          (r.weight ? '<span class="pill">' + fmtV(r.weight) + ' kg</span>' : '') +
          (r.urine ? '<span class="pill">' + fmtV(r.urine) + ' mL</span>' : '') +
          (r.notes ? '<div class="sub">' + nl2br(r.notes) + '</div>' : '');
      }
    },
    meds: {
      hi: 'दवाइयाँ', en: 'Medicines', sort: 'start',
      fields: [
        { k: 'name', hi: 'दवा का नाम', en: 'Medicine name', req: true, list: 'dl-meds' },
        { k: 'strength', hi: 'ताक़त', en: 'Strength', ph: '500 mg' },
        { k: 'dose', hi: 'खुराक', en: 'Dose', ph: '1 tab' },
        { k: 'timing', hi: 'समय (सुबह-दोपहर-रात)', en: 'Timing (morning-noon-night)', ph: '1-0-1' },
        { k: 'food', type: 'select', hi: 'खाने से', en: 'Food', options: FOOD },
        { k: 'start', type: 'date', hi: 'शुरू', en: 'Start date', def: today },
        { k: 'stop', type: 'date', hi: 'बंद', en: 'Stop date', help: 'खाली = चालू है / blank = still taking' },
        { k: 'prescribedBy', hi: 'किसने लिखी', en: 'Prescribed by' },
        { k: 'notes', type: 'textarea', hi: 'नोट', en: 'Notes', wide: true }
      ],
      line: function (r) {
        return '<b>' + esc(r.name) + '</b> ' + esc(r.strength || '') +
          (r.timing ? ' <span class="pill">' + esc(r.timing) + '</span>' : '') + (r.food ? ' <span class="pill">' + esc(foodLabel(r.food)) + '</span>' : '') +
          '<div class="sub">' + esc(r.dose || '') + (r.start ? ' · ' + fd(r.start) : '') + (r.stop ? ' → ' + fd(r.stop) : '') +
          (r.prescribedBy ? ' · ' + esc(r.prescribedBy) : '') + '</div>';
      }
    },
    injections: {
      hi: 'इंजेक्शन', en: 'Injections', sort: 'date',
      fields: [
        { k: 'date', type: 'date', hi: 'तारीख', en: 'Date', req: true, def: today },
        { k: 'medicine', hi: 'दवा / ब्रांड', en: 'Medicine / brand', req: true, list: 'dl-inj', ph: 'EPO…' },
        { k: 'dose', type: 'number', hi: 'खुराक', en: 'Dose' },
        { k: 'unit', type: 'select', hi: 'इकाई', en: 'Unit', options: [['IU', 'IU'], ['mcg', 'mcg'], ['mg', 'mg'], ['mL', 'mL']] },
        { k: 'site', hi: 'जगह', en: 'Site', ph: 'बायाँ हाथ / left arm' },
        { k: 'givenBy', hi: 'किसने लगाया', en: 'Given by' },
        { k: 'frequency', type: 'select', hi: 'कितने दिन में', en: 'Frequency', options: FREQ },
        { k: 'customDays', type: 'number', hi: 'अन्य: हर कितने दिन', en: 'Custom: every N days', step: 1, help: 'सिर्फ़ "अन्य" के लिए / only for custom' },
        { k: 'notes', type: 'textarea', hi: 'नोट', en: 'Notes', wide: true }
      ],
      line: function (r) {
        var due = calc.nextDue(r.date, r.frequency, r.customDays);
        return '<b>' + fd(r.date) + '</b> ' + esc(r.medicine) + ' <span class="pill">' + fmtV(r.dose) + ' ' + esc(r.unit || '') + '</span>' +
          '<div class="sub">' + esc(r.site || '') + (r.givenBy ? ' · ' + esc(r.givenBy) : '') +
          (due ? ' · अगला / next: ' + fd(due) : '') + '</div>';
      }
    },
    visits: {
      hi: 'डॉक्टर विज़िट', en: 'Doctor visits', sort: 'date',
      fields: [
        { k: 'date', type: 'date', hi: 'तारीख', en: 'Date', req: true, def: today },
        { k: 'doctor', hi: 'डॉक्टर', en: 'Doctor', list: 'dl-doc' },
        { k: 'hospital', hi: 'अस्पताल', en: 'Hospital', list: 'dl-hosp' },
        { k: 'advice', type: 'textarea', hi: 'डॉक्टर की सलाह', en: 'Advice', wide: true },
        { k: 'nextDate', type: 'date', hi: 'अगली विज़िट', en: 'Next visit' },
        { k: 'questions', type: 'textarea', hi: 'अगली बार पूछने के सवाल', en: 'Questions to ask next time', wide: true }
      ],
      line: function (r) {
        return '<b>' + fd(r.date) + '</b> ' + esc(r.doctor || '') + (r.hospital ? ', ' + esc(r.hospital) : '') +
          (r.advice ? '<div class="sub">' + nl2br(r.advice) + '</div>' : '') +
          (r.nextDate ? '<div class="sub">अगली विज़िट / Next: <b>' + fd(r.nextDate) + '</b></div>' : '');
      }
    },
    dialysis: {
      hi: 'डायलिसिस लॉग', en: 'Dialysis log', sort: 'date',
      fields: [
        { k: 'date', type: 'date', hi: 'तारीख', en: 'Date', req: true, def: today },
        { k: 'type', type: 'select', hi: 'प्रकार', en: 'Type', options: [['HD', 'हीमोडायलिसिस / HD'], ['PD', 'पेरिटोनियल / PD']] },
        { k: 'preWeight', type: 'number', hi: 'पहले वज़न', en: 'Pre weight', unit: 'kg' },
        { k: 'postWeight', type: 'number', hi: 'बाद वज़न', en: 'Post weight', unit: 'kg' },
        { k: 'uf', type: 'number', hi: 'निकाला पानी (UF)', en: 'Fluid removed (UF)', unit: 'mL' },
        { k: 'preBP', hi: 'पहले बीपी', en: 'Pre BP', ph: '140/90' },
        { k: 'postBP', hi: 'बाद बीपी', en: 'Post BP', ph: '130/80' },
        { k: 'hours', type: 'number', hi: 'घंटे', en: 'Hours' },
        { k: 'notes', type: 'textarea', hi: 'नोट', en: 'Notes', wide: true }
      ],
      line: function (r) {
        return '<b>' + fd(r.date) + '</b> ' + esc(r.type || '') +
          (r.preWeight || r.postWeight ? ' <span class="pill">' + fmtV(r.preWeight) + ' → ' + fmtV(r.postWeight) + ' kg</span>' : '') +
          (r.uf ? ' <span class="pill">UF ' + fmtV(r.uf) + ' mL</span>' : '') +
          '<div class="sub">' + esc(r.preBP || '') + (r.postBP ? ' → ' + esc(r.postBP) : '') + (r.hours ? ' · ' + fmtV(r.hours) + ' h' : '') +
          (r.notes ? ' · ' + esc(r.notes) : '') + '</div>';
      }
    }
  };

  function datalists() {
    function dl(id, vals) {
      var uniq = {};
      vals.forEach(function (v) { if (v) uniq[v] = true; });
      return '<datalist id="' + id + '">' + Object.keys(uniq).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
    }
    return dl('dl-meds', S.meds.map(function (m) { return m.name; })) +
      dl('dl-inj', S.injections.map(function (m) { return m.medicine; })) +
      dl('dl-doc', S.visits.map(function (v) { return v.doctor; }).concat([S.profile.doctor])) +
      dl('dl-hosp', S.visits.map(function (v) { return v.hospital; }).concat([S.profile.hospital]));
  }

  function recordList(type) {
    var R = RECORDS[type], rows = S[type].slice().sort(byDesc(R.sort));
    var html = '<div class="toolbar"><a class="btn primary" href="#/edit/' + type + '">+ ' + bi('नया जोड़ें', 'Add new') + '</a>';
    if (type === 'meds') html += '<a class="btn" href="#/medchart">🖨 ' + bi('दवा चार्ट', 'Medicine chart') + '</a>';
    html += '</div>';
    if (type === 'injections') html += injectionScheduleHtml();
    if (type === 'meds') {
      var cur = rows.filter(function (m) { return calc.isCurrentMed(m, today()); });
      var old = rows.filter(function (m) { return !calc.isCurrentMed(m, today()); });
      return html + '<h3>' + bi('अभी चल रही', 'Current') + '</h3>' + listHtml(type, cur) +
        (old.length ? '<details><summary>' + bi('बंद की गई दवाइयाँ', 'Stopped medicines') + ' (' + old.length + ')</summary>' + listHtml(type, old) + '</details>' : '');
    }
    return html + listHtml(type, rows);
  }

  function listHtml(type, rows) {
    if (!rows.length) return '<p class="empty">' + bi('अभी कुछ नहीं', 'Nothing yet') + '</p>';
    return '<ul class="list">' + rows.map(function (r) {
      return '<li><div class="li-main">' + RECORDS[type].line(r) + '</div><a class="btn small" href="#/edit/' + type + '/' + encodeURIComponent(r.id) + '">' + bi('बदलें', 'Edit') + '</a></li>';
    }).join('') + '</ul>';
  }

  function recordForm(type, id) {
    var R = RECORDS[type];
    var rec = id ? S[type].filter(function (r) { return r.id === id; })[0] : null;
    if (id && !rec) return '<p class="empty">' + bi('रिकॉर्ड नहीं मिला', 'Record not found') + '</p>';
    var vals = rec || {};
    if (!rec) {
      R.fields.forEach(function (f) { if (f.def) vals[f.k] = f.def(); });
      if (type === 'injections' && S.injections.length) {
        var last = S.injections.slice().sort(byDesc('date'))[0];
        ['medicine', 'dose', 'unit', 'frequency', 'customDays', 'givenBy'].forEach(function (k) { vals[k] = last[k]; });
      }
      if (type === 'visits') { vals.doctor = S.profile.doctor; vals.hospital = S.profile.hospital; }
    }
    return '<form class="card form" data-form="record" data-type="' + type + '" data-id="' + esc(id || '') + '">' +
      '<div class="grid2">' + R.fields.map(function (f) { return field(f, vals[f.k]); }).join('') + '</div>' +
      '<div class="toolbar"><button class="btn primary" type="submit">' + bi('सेव करें', 'Save') + '</button>' +
      '<a class="btn" href="#/' + type + '">' + bi('रद्द', 'Cancel') + '</a>' +
      (rec ? '<button class="btn danger" type="button" data-action="delete-record" data-type="' + type + '" data-id="' + esc(id) + '">' + bi('हटाएँ', 'Delete') + '</button>' : '') +
      '</div></form>' + datalists();
  }

  /* ---------- dashboard ---------- */

  var KEY_TESTS = ['hb', 'creatinine', 'egfr', 'urea', 'potassium', 'sodium', 'calcium', 'phosphorus', 'albumin', 'pth'];

  function injectionScheduleHtml() {
    var sch = calc.injectionSchedule(S.injections, today());
    if (!sch.length) return '';
    return '<div class="card"><h3>💉 ' + bi('अगला इंजेक्शन', 'Next injection due') + '</h3><ul class="plain">' + sch.map(function (s) {
      var cls = s.daysLeft < 0 ? 'overdue' : s.daysLeft <= 1 ? 'soon' : '';
      var when = s.daysLeft < 0 ? (-s.daysLeft) + ' दिन देर / days overdue' : s.daysLeft === 0 ? 'आज / today' :
        s.daysLeft === 1 ? 'कल / tomorrow' : s.daysLeft + ' दिन में / in ' + s.daysLeft + ' days';
      return '<li class="' + cls + '"><b>' + esc(s.medicine) + '</b> — ' + fd(s.due) + ' <small>(' + when + ')</small></li>';
    }).join('') + '</ul></div>';
  }

  function backupBanner() {
    if (!hasData()) return '';
    var lb = S.settings.lastBackup;
    var days = lb ? calc.daysBetween(lb, today()) : null;
    if (lb && days < 7) return '';
    return '<div class="banner warn">💾 ' + (lb ? bi('पिछला बैकअप ' + fd(lb) + ' (' + days + ' दिन पहले)', 'Last backup ' + fd(lb) + ' (' + days + ' days ago)')
      : bi('अभी तक कोई बैकअप नहीं लिया', 'No backup taken yet')) +
      ' <a class="btn small" href="#/backup">' + bi('बैकअप लें', 'Back up now') + '</a></div>';
  }

  function renderHome() {
    var h = backupBanner();
    if (!hasData()) {
      return h + '<div class="card welcome"><h2>' + bi('स्वागत है', 'Welcome') + '</h2>' +
        '<p>' + bi('जाँच रिपोर्ट, दवाइयाँ, इंजेक्शन और डॉक्टर विज़िट यहाँ लिखें। सारा डेटा सिर्फ़ इसी फ़ोन/कंप्यूटर में रहता है।',
          'Record test reports, medicines, injections and doctor visits. All data stays only on this device.') + '</p>' +
        '<div class="toolbar"><a class="btn primary" href="#/profile">1. ' + bi('प्रोफ़ाइल भरें', 'Fill profile') + '</a>' +
        '<a class="btn primary" href="#/lab">2. ' + bi('पहली रिपोर्ट जोड़ें', 'Add first report') + '</a>' +
        '<button class="btn" data-action="load-demo">' + bi('काल्पनिक डेमो डेटा देखें', 'Try fictional demo data') + '</button></div></div>';
    }
    if (!S.profile.sex || !S.profile.dob) {
      h += '<div class="banner">ℹ️ ' + bi('eGFR के लिए प्रोफ़ाइल में लिंग और जन्म तिथि भरें', 'Add sex and date of birth in Profile to calculate eGFR') +
        ' <a class="btn small" href="#/profile">' + bi('प्रोफ़ाइल', 'Profile') + '</a></div>';
    }
    h += '<div class="toolbar quick"><a class="btn primary" href="#/lab">+ ' + bi('जाँच रिपोर्ट', 'Test results') + '</a>' +
      '<a class="btn primary" href="#/edit/vitals">+ ' + bi('बीपी / वज़न', 'BP / weight') + '</a>' +
      '<a class="btn primary" href="#/edit/injections">+ ' + bi('इंजेक्शन', 'Injection') + '</a></div>';

    var tiles = KEY_TESTS.map(function (k) {
      var l = calc.latestWithChange(S.labs, k, S.profile);
      if (!l) return '';
      var t = info(k), fl = calc.flag(l.value, range(k));
      var ch = l.change === null ? '' : l.change > 0 ? '↑ ' + fmtV(l.change) : l.change < 0 ? '↓ ' + fmtV(-l.change) : '→ 0';
      return '<div class="tile ' + fl + '"><div class="t-name">' + bi(t.hi, t.en) + '</div>' +
        '<div class="t-val">' + fmtV(l.value) + ' <small>' + esc(t.unit) + '</small>' + flagBadge(fl) + offTarget(k, l.value) + '</div>' +
        '<div class="t-sub">' + fd(l.date) + (ch ? ' · <span class="chg">' + ch + '</span> <small>(' + bi('पिछला', 'prev') + ' ' + fmtV(l.prev) + ')</small>' : '') +
        (k === 'egfr' ? ' · ' + calc.gfrCategory(l.value) : '') + '</div>' +
        '<div class="t-range">' + bi('सामान्य', 'typical') + ': ' + esc(rangeText(range(k))) + '</div></div>';
    }).join('');
    if (tiles) h += '<h2>' + bi('ताज़ा जाँच', 'Latest results') + '</h2><div class="tiles">' + tiles + '</div>';

    h += injectionScheduleHtml();

    var nv = S.visits.filter(function (v) { return v.nextDate && v.nextDate >= today(); }).sort(byAsc('nextDate'))[0];
    if (nv) {
      h += '<div class="card"><h3>🩺 ' + bi('अगली डॉक्टर विज़िट', 'Next doctor visit') + '</h3><p><b>' + fd(nv.nextDate) + '</b> ' +
        esc(nv.doctor || '') + (nv.hospital ? ', ' + esc(nv.hospital) : '') + ' <small>(' + calc.daysBetween(today(), nv.nextDate) + ' ' + bi('दिन', 'days') + ')</small></p>' +
        (nv.questions ? '<p class="sub"><b>' + bi('पूछने के सवाल', 'Questions') + ':</b><br>' + nl2br(nv.questions) + '</p>' : '') + '</div>';
    }

    var due = calc.testsDue(S.labs, S.settings.testsDue || DEFAULT_DUE, today()).filter(function (d) { return d.isDue; });
    if (due.length) {
      h += '<div class="card"><h3>🧪 ' + bi('जाँच का समय', 'Tests due') + '</h3><ul class="plain">' + due.map(function (d) {
        var t = info(d.key);
        return '<li><b>' + bi(t.hi, t.en) + '</b> — ' + (d.last ? bi('पिछली बार', 'last') + ' ' + fd(d.last) : bi('अभी तक नहीं', 'never recorded')) + '</li>';
      }).join('') + '</ul></div>';
    }

    var lv = S.vitals.filter(function (v) { return v.sys || v.weight; }).sort(byDesc('datetime'))[0];
    if (lv) h += '<div class="card"><h3>❤️ ' + bi('पिछला बीपी / वज़न', 'Latest BP / weight') + '</h3>' + RECORDS.vitals.line(lv) + '</div>';

    h += '<div class="toolbar"><a class="btn" href="#/summary">📄 ' + bi('डॉक्टर के लिए सारांश', 'Doctor summary') + '</a>' +
      '<a class="btn" href="#/emergency">🚑 ' + bi('इमरजेंसी कार्ड', 'Emergency card') + '</a></div>';
    return h;
  }

  /* ---------- lab results ---------- */

  function renderLabs() {
    var rows = S.labs.slice().sort(byDesc('date'));
    var h = '<div class="toolbar"><a class="btn primary" href="#/lab">+ ' + bi('नई रिपोर्ट', 'New report') + '</a>' +
      '<a class="btn" href="#/grid">▦ ' + bi('तालिका', 'Results grid') + '</a><a class="btn" href="#/trends">📈 ' + bi('ग्राफ़', 'Trends') + '</a></div>';
    if (!rows.length) return h + '<p class="empty">' + bi('अभी कोई रिपोर्ट नहीं', 'No reports yet') + '</p>';
    return h + '<ul class="list">' + rows.map(function (l) {
      var v = calc.labValues(l, S.profile), keys = Object.keys(v);
      var flagged = keys.filter(function (k) { return calc.flag(v[k], range(k)); });
      var show = ['hb', 'creatinine', 'egfr', 'potassium'].filter(function (k) { return v[k] !== undefined; });
      return '<li><div class="li-main"><b>' + fd(l.date) + '</b> ' + esc(l.labName || '') + '<div class="sub">' +
        show.map(function (k) { return esc(info(k).en.split(' (')[0]) + ' ' + valueHtml(k, v[k]); }).join(' · ') +
        '</div><div class="sub">' + keys.length + ' ' + bi('जाँचें', 'tests') + (flagged.length ? ' · <span class="H-text">' + flagged.length + ' ' + bi('सीमा से बाहर', 'out of range') + '</span>' : '') +
        '</div></div><a class="btn small" href="#/lab/' + encodeURIComponent(l.id) + '">' + bi('बदलें', 'Edit') + '</a></li>';
    }).join('') + '</ul>';
  }

  function labInput(t, v) {
    var r = range(t.key);
    return '<div class="field"><label for="t_' + t.key + '">' + bi(t.hi, t.en) + ' <small>(' + esc(t.unit) + ')</small></label>' +
      '<input type="number" inputmode="decimal" step="any" id="t_' + t.key + '" name="t_' + t.key + '" value="' + esc(v === undefined ? '' : v) + '">' +
      '<small class="help">' + bi('सामान्य', 'typical') + ': ' + esc(rangeText(r)) + '</small></div>';
  }

  function renderLabForm(id) {
    var lab = id ? S.labs.filter(function (l) { return l.id === id; })[0] : null;
    if (id && !lab) return '<p class="empty">' + bi('रिपोर्ट नहीं मिली', 'Report not found') + '</p>';
    var vals = (lab && lab.values) || {};
    var tests = calc.TESTS.filter(function (t) { return !t.calculated; });
    var common = tests.filter(function (t) { return t.common; });
    var more = tests.filter(function (t) { return !t.common; }).concat(custom().map(function (c) { return info(c.key); }));
    var moreFilled = more.some(function (t) { return vals[t.key] !== undefined && vals[t.key] !== ''; });
    return '<form class="card form" data-form="lab" data-id="' + esc(id || '') + '">' +
      '<div class="grid2">' + field({ k: 'date', type: 'date', hi: 'जाँच की तारीख', en: 'Test date', req: true }, lab ? lab.date : today()) +
      field({ k: 'labName', hi: 'लैब का नाम', en: 'Lab name', list: 'dl-labs' }, lab ? lab.labName : '') + '</div>' +
      '<h3>' + bi('मुख्य जाँचें', 'Common tests') + '</h3><div class="grid2">' + common.map(function (t) { return labInput(t, vals[t.key]); }).join('') + '</div>' +
      '<div class="calc-box" id="calc-box" aria-live="polite"></div>' +
      '<details' + (moreFilled ? ' open' : '') + '><summary>' + bi('और जाँचें', 'More tests') + '</summary><div class="grid2">' +
      more.map(function (t) { return labInput(t, vals[t.key]); }).join('') +
      field({ k: 'labEgfr', type: 'number', hi: 'लैब द्वारा दिया eGFR', en: 'Lab-reported eGFR', unit: 'mL/min/1.73m²' }, lab ? lab.labEgfr : '') +
      '</div><p class="sub">' + bi('नई जाँच जोड़ने के लिए: सेटिंग्स → अपनी जाँचें', 'To add another test: Settings → Custom tests') + '</p></details>' +
      field({ k: 'notes', type: 'textarea', hi: 'नोट', en: 'Notes', wide: true }, lab ? lab.notes : '') +
      '<div class="toolbar"><button class="btn primary" type="submit">' + bi('सेव करें', 'Save') + '</button><a class="btn" href="#/labs">' + bi('रद्द', 'Cancel') + '</a>' +
      (lab ? '<button class="btn danger" type="button" data-action="delete-record" data-type="labs" data-id="' + esc(id) + '">' + bi('हटाएँ', 'Delete') + '</button>' : '') +
      '</div></form><datalist id="dl-labs">' + uniq(S.labs.map(function (l) { return l.labName; })).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
  }

  function uniq(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o); }

  function updateLabCalc(form) {
    var box = document.getElementById('calc-box');
    if (!box) return;
    var g = function (k) { var el = form.elements['t_' + k]; return el ? el.value : ''; };
    var date = form.elements.date.value;
    var e = calc.egfr(g('creatinine'), calc.ageOn(S.profile.dob, date), S.profile.sex);
    var cc = calc.correctedCalcium(g('calcium'), g('albumin'));
    var parts = [];
    if (e !== null) parts.push('eGFR (CKD-EPI 2021): <b>' + valueHtml('egfr', e) + '</b> mL/min/1.73m² · ' + calc.gfrCategory(e));
    else if (calc.num(g('creatinine')) !== null) parts.push(bi('eGFR के लिए प्रोफ़ाइल में लिंग व जन्म तिथि भरें', 'Add sex and date of birth in Profile for eGFR'));
    if (cc !== null) parts.push(bi('करेक्टेड कैल्शियम', 'Corrected calcium') + ': <b>' + valueHtml('ccalcium', cc) + '</b> mg/dL');
    box.innerHTML = parts.join('<br>');
    box.hidden = !parts.length;
  }

  /* ---------- trends ---------- */

  function trendRange() {
    var t = ui.trend, to = t.to || today(), from = t.from;
    if (t.preset !== 'custom') {
      from = t.preset === 'all' ? '' : calc.addMonths(today(), -({ '3m': 3, '6m': 6, '1y': 12, '2y': 24 })[t.preset]);
      to = '';
    }
    return { from: from || '', to: to || '' };
  }
  function inRange(d, r) { d = (d || '').slice(0, 10); return (!r.from || d >= r.from) && (!r.to || d <= r.to); }

  function labSeries(key, r) {
    return S.labs.filter(function (l) { return inRange(l.date, r); }).map(function (l) {
      return { date: l.date, value: calc.labValues(l, S.profile)[key] };
    }).filter(function (p) { return p.value !== undefined; });
  }

  function bandsFor(key, axis, suffix) {
    var out = [], lr = range(key), tg = target(key);
    if (lr.lo !== null || lr.hi !== null) out.push({ lo: lr.lo, hi: lr.hi, cls: 'lab', axis: axis, label: 'सामान्य लैब रेंज / Typical lab range' + (suffix || '') });
    if (tg) out.push({ lo: tg.lo, hi: tg.hi, cls: 'target', axis: axis, label: 'डॉक्टर का लक्ष्य / Doctor\'s target' + (suffix || '') });
    return out;
  }

  function chartFor(name, r, size) {
    size = size || {};
    var o;
    switch (name) {
      case 'hb': o = { series: [{ label: 'Hb', cls: 's1', points: labSeries('hb', r) }], bands: bandsFor('hb'), leftUnit: 'g/dL' }; break;
      case 'creat': o = {
        series: [{ label: 'Creatinine (mg/dL)', cls: 's2', points: labSeries('creatinine', r) },
          { label: 'eGFR (mL/min/1.73m², right axis)', cls: 's1', axis: 'right', dashed: true, points: labSeries('egfr', r) }],
        bands: bandsFor('creatinine', 'left', ' (creatinine)'), leftUnit: 'mg/dL', rightUnit: 'eGFR' }; break;
      case 'k': o = { series: [{ label: 'Potassium', cls: 's3', points: labSeries('potassium', r) }], bands: bandsFor('potassium'), leftUnit: 'mmol/L' }; break;
      case 'caphos': o = {
        series: [{ label: 'Calcium', cls: 's1', points: labSeries('calcium', r) }, { label: 'Corrected Ca', cls: 's1', dashed: true, points: labSeries('ccalcium', r) },
          { label: 'Phosphorus', cls: 's2', points: labSeries('phosphorus', r) }],
        bands: bandsFor('calcium', 'left', ' (Ca)').concat(bandsFor('phosphorus', 'left', ' (P)').map(function (b) { b.cls += ' alt'; return b; })), leftUnit: 'mg/dL' }; break;
      case 'pth': o = { series: [{ label: 'PTH', cls: 's3', points: labSeries('pth', r) }], bands: bandsFor('pth'), leftUnit: 'pg/mL' }; break;
      case 'bp':
        var vs = S.vitals.filter(function (v) { return inRange(v.datetime, r); });
        o = { series: [{ label: 'Systolic / ऊपर', cls: 's2', points: vs.map(function (v) { return { date: v.datetime, value: v.sys }; }) },
          { label: 'Diastolic / नीचे', cls: 's1', points: vs.map(function (v) { return { date: v.datetime, value: v.dia }; }) }],
          bands: [{ lo: 90, hi: 130, cls: 'lab', label: 'Systolic 90–130' }, { lo: 60, hi: 80, cls: 'lab alt', label: 'Diastolic 60–80' }], leftUnit: 'mmHg' }; break;
      case 'wt':
        o = { series: [{ label: 'Weight', cls: 's4', points: S.vitals.filter(function (v) { return inRange(v.datetime, r); }).map(function (v) { return { date: v.datetime, value: v.weight }; }) }], leftUnit: 'kg' }; break;
    }
    // Match the screen width so axis text stays readable on phones.
    var w = Math.max(300, Math.min(720, (main.clientWidth || 640) - 36));
    o.width = size.width || w; o.height = size.height || (w < 480 ? 240 : 260); o.title = name;
    return charts.lineChart(o);
  }

  var TREND_LIST = [['hb', 'हीमोग्लोबिन', 'Hb'], ['creat', 'क्रिएटिनिन व eGFR', 'Creatinine & eGFR'], ['k', 'पोटैशियम', 'Potassium'],
    ['caphos', 'कैल्शियम व फ़ॉस्फ़ोरस', 'Calcium & phosphorus'], ['pth', 'पीटीएच', 'PTH'], ['bp', 'बीपी', 'Blood pressure'], ['wt', 'वज़न', 'Weight']];

  function renderTrends() {
    var t = ui.trend, r = trendRange();
    var h = '<form class="card filters" data-form="trend-range"><div class="field"><label for="tr-preset">' + bi('समय', 'Period') + '</label>' +
      '<select id="tr-preset" name="preset" data-change="trend">' + [['3m', '3 महीने / 3 months'], ['6m', '6 महीने / 6 months'], ['1y', '1 साल / 1 year'],
      ['2y', '2 साल / 2 years'], ['all', 'सब / All'], ['custom', 'तारीख चुनें / Choose dates']].map(function (o) {
        return '<option value="' + o[0] + '"' + (t.preset === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';
    if (t.preset === 'custom') {
      h += field({ k: 'from', type: 'date', hi: 'से', en: 'From' }, t.from) + field({ k: 'to', type: 'date', hi: 'तक', en: 'To' }, t.to) +
        '<button class="btn" type="submit">' + bi('दिखाएँ', 'Show') + '</button>';
    }
    h += '</form>';
    return h + TREND_LIST.map(function (c) {
      return '<section class="card"><h3>' + bi(c[1], c[2]) + '</h3>' + chartFor(c[0], r) + '</section>';
    }).join('');
  }

  /* ---------- results grid ---------- */

  function gridHtml(labs, compact) {
    labs = labs.slice().sort(byAsc('date'));
    if (!labs.length) return '<p class="empty">' + bi('अभी कोई रिपोर्ट नहीं', 'No reports yet') + '</p>';
    var vals = labs.map(function (l) { return calc.labValues(l, S.profile); });
    var keys = exporter.labKeysUsed(labs, S.profile, custom());
    var anyLabEgfr = labs.some(function (l) { return calc.num(l.labEgfr) !== null; });
    var h = '<div class="table-scroll"><table class="grid' + (compact ? ' compact' : '') + '"><thead><tr><th class="sticky">' + bi('जाँच', 'Test') + '</th><th>' + bi('सामान्य', 'Typical') + '</th>' +
      labs.map(function (l) { return '<th>' + fd(l.date) + '</th>'; }).join('') + '</tr></thead><tbody>';
    keys.forEach(function (k) {
      var t = info(k);
      h += '<tr><th class="sticky">' + esc(t.en) + ' <small>' + esc(t.unit) + '</small><br><small lang="hi">' + esc(t.hi) + '</small></th><td class="rng">' + esc(rangeText(range(k))) +
        (target(k) ? '<br><small>◎ ' + esc(rangeText(target(k))) + '</small>' : '') + '</td>' +
        vals.map(function (v) {
          var x = v[k];
          return x === undefined ? '<td></td>' : '<td class="v ' + calc.flag(x, range(k)) + '">' + valueHtml(k, x) + '</td>';
        }).join('') + '</tr>';
    });
    if (anyLabEgfr) {
      h += '<tr><th class="sticky">eGFR (lab-reported) <br><small lang="hi">लैब का eGFR</small></th><td></td>' + labs.map(function (l) {
        return '<td>' + fmtV(calc.num(l.labEgfr)) + '</td>';
      }).join('') + '</tr>';
    }
    return h + '</tbody></table></div><p class="legend-text"><b class="flag H">H</b> ' + bi('ज़्यादा', 'high') + ' · <b class="flag L">L</b> ' + bi('कम', 'low') +
      ' · ◎ ' + bi('डॉक्टर के लक्ष्य से बाहर / लक्ष्य', 'outside / doctor\'s target') + ' · eGFR: CKD-EPI 2021</p>';
  }

  function renderGrid() {
    var labs = S.labs.slice().sort(byAsc('date'));
    var n = ui.gridCols === 'all' ? labs.length : +ui.gridCols;
    var h = '<div class="toolbar no-print"><div class="field inline"><label for="grid-cols">' + bi('कॉलम', 'Columns') + '</label><select id="grid-cols" data-change="grid-cols">' +
      [['6', 'पिछली 6 / Last 6'], ['12', 'पिछली 12 / Last 12'], ['all', 'सब / All']].map(function (o) {
        return '<option value="' + o[0] + '"' + (ui.gridCols === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div><button class="btn" data-action="print">🖨 ' + bi('प्रिंट', 'Print') + '</button></div>';
    return h + printHeader('जाँच परिणाम तालिका', 'Lab results grid') + gridHtml(labs.slice(-n));
  }

  function printHeader(hi, en) {
    var p = S.profile;
    return '<div class="print-only print-head"><b>' + esc(p.name || '') + '</b>' + (age() !== null ? ' · ' + age() + ' yrs' : '') +
      (p.sex ? ' · ' + sexLabel(p.sex) : '') + ' — ' + bi(hi, en) + ' · ' + bi('प्रिंट', 'printed') + ' ' + fd(today()) + '</div>';
  }

  /* ---------- doctor summary ---------- */

  function profileHeader() {
    var p = S.profile, a = age();
    var rows = [
      ['नाम', 'Name', p.name], ['उम्र / लिंग', 'Age / sex', (a !== null ? a + ' yrs' : '') + (p.sex ? ', ' + sexLabel(p.sex) : '')],
      ['जन्म तिथि', 'DOB', fd(p.dob)], ['लंबाई', 'Height', p.height ? p.height + ' cm' : ''], ['ब्लड ग्रुप', 'Blood group', p.bloodGroup],
      ['निदान', 'Diagnosis', (p.diagnosis || '') + (p.stage ? ' — CKD stage ' + p.stage : '')], ['एलर्जी', 'Allergies', p.allergies],
      ['डॉक्टर', 'Doctor', [p.doctor, p.hospital].filter(Boolean).join(', ')]
    ].filter(function (r) { return r[2]; });
    return '<dl class="kv">' + rows.map(function (r) { return '<dt>' + bi(r[0], r[1]) + '</dt><dd>' + esc(r[2]) + '</dd>'; }).join('') + '</dl>';
  }

  function medTable(meds) {
    if (!meds.length) return '<p class="empty">' + bi('कोई चालू दवा दर्ज नहीं', 'No current medicines recorded') + '</p>';
    return '<table class="meds"><thead><tr><th>' + bi('दवा', 'Medicine') + '</th><th>' + bi('ताक़त', 'Strength') + '</th><th>' + bi('खुराक', 'Dose') +
      '</th><th>' + bi('सुबह', 'Morning') + '</th><th>' + bi('दोपहर', 'Noon') + '</th><th>' + bi('रात', 'Night') + '</th><th>' + bi('खाना', 'Food') + '</th><th>' + bi('कब से', 'Since') + '</th></tr></thead><tbody>' +
      meds.map(function (m) {
        var p = calc.parseTiming(m.timing);
        var tcells = p.length === 3 ? p.map(function (x) { return '<td class="c">' + (x === '0' ? '–' : esc(x)) + '</td>'; }).join('') : '<td class="c" colspan="3">' + esc(m.timing || '') + '</td>';
        return '<tr><td><b>' + esc(m.name) + '</b>' + (m.notes ? '<br><small>' + esc(m.notes) + '</small>' : '') + '</td><td>' + esc(m.strength || '') + '</td><td>' + esc(m.dose || '') + '</td>' +
          tcells + '<td>' + esc(foodLabel(m.food)) + '</td><td>' + fd(m.start) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderSummary() {
    var p = S.profile;
    var labs = S.labs.slice().sort(byAsc('date')).slice(-6);
    var r = { from: labs.length ? S.labs.slice().sort(byAsc('date')).slice(-12)[0].date : '', to: '' };
    var bp = S.vitals.filter(function (v) { return v.sys || v.dia; }).sort(byDesc('datetime')).slice(0, 8);
    var lastQ = S.visits.filter(function (v) { return v.questions; }).sort(byDesc('date'))[0];
    var lastV = S.visits.slice().sort(byDesc('date'))[0];
    var size = { width: 640, height: 190 };
    return '<div class="toolbar no-print"><button class="btn primary" data-action="print">🖨 ' + bi('प्रिंट / PDF', 'Print / PDF') + '</button></div>' +
      '<article class="a4 summary"><header class="doc-head"><h1>' + bi('किडनी स्वास्थ्य सारांश', 'Kidney health summary') + '</h1><div>' + bi('तारीख', 'Date') + ': ' + fd(today()) + '</div></header>' +
      profileHeader() +
      (p.cautions ? '<div class="cautions"><b>⚠ ' + bi('डॉक्टर द्वारा सावधानियाँ', 'Cautions from doctors') + ':</b><br>' + nl2br(p.cautions) + '</div>' : '') +
      '<h2>' + bi('चालू दवाइयाँ', 'Current medicines') + '</h2>' + medTable(current()) +
      '<h2>' + bi('पिछली 6 रिपोर्ट', 'Last 6 results') + '</h2>' + gridHtml(labs, true) +
      '<div class="chart-row"><section><h3>Hb</h3>' + chartFor('hb', r, size) + '</section>' +
      '<section><h3>Creatinine & eGFR</h3>' + chartFor('creat', r, size) + '</section>' +
      '<section><h3>Potassium</h3>' + chartFor('k', r, size) + '</section></div>' +
      '<h2>' + bi('हाल का बीपी', 'Recent BP') + '</h2>' + (bp.length ? '<table class="bp"><tr>' + bp.map(function (v) {
        return '<td><small>' + esc(calc.fmtDateTime(v.datetime)) + '</small><br><b>' + fmtV(v.sys) + '/' + fmtV(v.dia) + '</b>' + (v.weight ? '<br><small>' + fmtV(v.weight) + ' kg</small>' : '') + '</td>';
      }).join('') + '</tr></table>' : '<p class="empty">—</p>') +
      (lastV && lastV.advice ? '<h2>' + bi('पिछली सलाह', 'Last advice') + ' (' + fd(lastV.date) + ')</h2><p>' + nl2br(lastV.advice) + '</p>' : '') +
      '<h2>' + bi('डॉक्टर के लिए सवाल / नोट', 'Questions & notes for the doctor') + '</h2>' +
      (lastQ ? '<p>' + nl2br(lastQ.questions) + '</p>' : '') +
      '<textarea class="no-print" id="summary-notes" rows="4" placeholder="अतिरिक्त नोट यहाँ लिखें / Type extra notes here">' + esc(S.settings.summaryNotes || '') + '</textarea>' +
      '<p class="print-only" id="summary-notes-print">' + nl2br(S.settings.summaryNotes || '') + '</p>' +
      '<footer class="doc-foot">' + disclaimer() + '</footer></article>';
  }

  function renderMedChart() {
    return '<div class="toolbar no-print"><button class="btn primary" data-action="print">🖨 ' + bi('प्रिंट', 'Print') + '</button><a class="btn" href="#/meds">' + bi('वापस', 'Back') + '</a></div>' +
      '<article class="a4"><header class="doc-head"><h1>' + bi('दवा चार्ट', 'Medicine chart') + '</h1><div>' + esc(S.profile.name || '') + ' · ' + fd(today()) + '</div></header>' +
      medTable(current()) + '<p class="sub">1-0-1 = ' + bi('सुबह 1, दोपहर 0, रात 1', 'morning 1, noon 0, night 1') + '</p>' +
      '<footer class="doc-foot">' + disclaimer() + '</footer></article>';
  }

  /* ---------- emergency card ---------- */

  function tel(n) { return n ? '<a href="tel:' + esc(String(n).replace(/[^\d+]/g, '')) + '">' + esc(n) + '</a>' : ''; }

  function renderEmergency() {
    var p = S.profile, a = age(), meds = current();
    return '<div class="toolbar no-print"><button class="btn primary" data-action="print">🖨 ' + bi('प्रिंट', 'Print') + '</button><a class="btn" href="#/profile">' + bi('जानकारी बदलें', 'Edit details') + '</a></div>' +
      '<article class="a4 emergency"><header class="em-head">🚑 ' + bi('इमरजेंसी कार्ड', 'Emergency card') + '</header>' +
      '<div class="em-name">' + esc(p.name || '—') + '<small>' + (a !== null ? ' · ' + a + ' yrs' : '') + (p.sex ? ' · ' + sexLabel(p.sex) : '') + '</small></div>' +
      '<div class="em-grid"><div class="em-box"><div class="em-l">' + bi('ब्लड ग्रुप', 'Blood group') + '</div><div class="em-big">' + esc(p.bloodGroup || '—') + '</div></div>' +
      '<div class="em-box"><div class="em-l">' + bi('निदान', 'Diagnosis') + '</div><div>' + esc(p.diagnosis || '—') + (p.stage ? '<br><b>CKD stage ' + esc(p.stage) + '</b>' : '') +
      (S.settings.dialysisEnabled ? '<br><b>' + bi('डायलिसिस पर', 'On dialysis') + '</b>' : '') + '</div></div></div>' +
      '<div class="em-box alert"><div class="em-l">⚠ ' + bi('एलर्जी', 'Allergies') + '</div><div>' + nl2br(p.allergies || '—') + '</div></div>' +
      '<div class="em-box alert"><div class="em-l">⚠ ' + bi('डॉक्टर की सावधानियाँ', 'Cautions from doctors') + '</div><div>' + nl2br(p.cautions || '—') + '</div></div>' +
      '<div class="em-box"><div class="em-l">💊 ' + bi('चालू दवाइयाँ', 'Current medicines') + '</div>' + (meds.length ? '<ul>' + meds.map(function (m) {
        return '<li><b>' + esc(m.name) + '</b> ' + esc(m.strength || '') + ' ' + esc(m.timing || '') + '</li>';
      }).join('') + '</ul>' : '—') + '</div>' +
      '<div class="em-grid"><div class="em-box"><div class="em-l">🩺 ' + bi('डॉक्टर', 'Doctor') + '</div><div>' + esc(p.doctor || '—') + '<br>' + tel(p.doctorPhone) + '</div></div>' +
      '<div class="em-box"><div class="em-l">🏥 ' + bi('अस्पताल', 'Hospital') + '</div><div>' + esc(p.hospital || '—') + '<br>' + tel(p.hospitalPhone) + '</div></div></div>' +
      '<footer class="doc-foot">' + bi('अपडेट', 'Updated') + ' ' + fd(today()) + ' · ' + disclaimer() + '</footer></article>';
  }

  /* ---------- profile ---------- */

  var PROFILE_FIELDS = [
    { k: 'name', hi: 'नाम (वैकल्पिक)', en: 'Name (optional)' },
    { k: 'sex', type: 'select', hi: 'लिंग', en: 'Sex', options: [['', '—'], ['f', 'महिला / Female'], ['m', 'पुरुष / Male']], help: 'eGFR के लिए ज़रूरी / needed for eGFR' },
    { k: 'dob', type: 'date', hi: 'जन्म तिथि', en: 'Date of birth', help: 'eGFR के लिए ज़रूरी / needed for eGFR' },
    { k: 'height', type: 'number', hi: 'लंबाई', en: 'Height', unit: 'cm' },
    { k: 'diagnosis', hi: 'निदान / बीमारी', en: 'Diagnosis', wide: true },
    { k: 'stage', type: 'select', hi: 'CKD स्टेज', en: 'CKD stage', options: [['', '—'], ['1', '1'], ['2', '2'], ['3a', '3a'], ['3b', '3b'], ['4', '4'], ['5', '5'], ['5D', '5D (dialysis)'], ['Tx', 'Transplant / प्रत्यारोपण']] },
    { k: 'bloodGroup', type: 'select', hi: 'ब्लड ग्रुप', en: 'Blood group', options: [['', '—']].concat(['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(function (b) { return [b, b]; })) },
    { k: 'allergies', type: 'textarea', hi: 'एलर्जी', en: 'Allergies', wide: true },
    { k: 'doctor', hi: 'डॉक्टर (नेफ्रोलॉजिस्ट)', en: 'Doctor (nephrologist)' },
    { k: 'doctorPhone', type: 'tel', hi: 'डॉक्टर का फ़ोन', en: 'Doctor phone' },
    { k: 'hospital', hi: 'अस्पताल', en: 'Hospital' },
    { k: 'hospitalPhone', type: 'tel', hi: 'अस्पताल का फ़ोन', en: 'Hospital phone' },
    { k: 'cautions', type: 'textarea', hi: 'डॉक्टर द्वारा बताई सावधानियाँ', en: 'Cautions from doctors', wide: true,
      ph: 'जैसे: दर्द की कुछ दवाइयाँ न लें… / e.g. medicines or procedures to avoid', help: 'हर सावधानी नई लाइन में / one caution per line' }
  ];

  function renderProfile() {
    var a = age();
    return '<form class="card form" data-form="profile"><div class="grid2">' + PROFILE_FIELDS.map(function (f) { return field(f, S.profile[f.k]); }).join('') + '</div>' +
      (a !== null ? '<p>' + bi('उम्र', 'Age') + ': <b>' + a + '</b></p>' : '') +
      '<div class="toolbar"><button class="btn primary" type="submit">' + bi('सेव करें', 'Save') + '</button></div></form>';
  }

  /* ---------- backup, restore, export ---------- */

  function renderBackup() {
    var lb = S.settings.lastBackup, rs = ui.restore;
    var h = '<section class="card"><h2>💾 ' + bi('बैकअप', 'Backup') + '</h2><p>' + bi('पिछला बैकअप', 'Last backup') + ': <b>' + (lb ? fd(lb) : bi('कभी नहीं', 'never')) + '</b></p>' +
      '<p class="sub">' + bi('बैकअप फ़ाइल को Google Drive, ईमेल या पेन ड्राइव में सुरक्षित रखें। फ़ोन खोने या बदलने पर इसी से डेटा वापस आएगा।',
        'Keep the backup file safe (Drive, email to yourself, pen drive). It is the only way to get data back on a new or lost phone.') + '</p>' +
      '<form data-form="backup"><div class="grid2">' +
      field({ k: 'pw', type: 'password', hi: 'पासवर्ड (वैकल्पिक)', en: 'Password (optional)' }) +
      field({ k: 'pw2', type: 'password', hi: 'पासवर्ड दोबारा', en: 'Repeat password' }) + '</div>' +
      '<p class="sub">' + bi('पासवर्ड देने पर फ़ाइल एन्क्रिप्ट (AES-GCM) होगी। पासवर्ड भूल गए तो फ़ाइल नहीं खुलेगी।',
        'With a password the file is encrypted (AES-GCM). If you forget the password the file cannot be opened.') + '</p>' +
      '<button class="btn primary" type="submit">⬇ ' + bi('बैकअप फ़ाइल डाउनलोड करें', 'Download backup file') + '</button></form></section>';

    h += '<section class="card"><h2>♻ ' + bi('बैकअप से वापस लाएँ', 'Restore from backup') + '</h2>' +
      '<div class="field"><label for="restore-file">' + bi('बैकअप फ़ाइल चुनें', 'Choose backup file') + '</label><input type="file" id="restore-file" accept=".json,application/json" data-change="restore-file"></div>';
    if (rs && rs.error) h += '<p class="banner error">' + rs.error + '</p>';
    if (rs && rs.needPassword) {
      h += '<form data-form="restore-password">' + field({ k: 'pw', type: 'password', hi: 'बैकअप का पासवर्ड', en: 'Backup password', req: true }) +
        '<button class="btn primary" type="submit">' + bi('खोलें', 'Open') + '</button></form>';
    }
    if (rs && rs.data) {
      var pv = backup.previewData(rs.data), c = pv.counts;
      h += '<div class="preview"><h3>' + bi('फ़ाइल में क्या है', 'What is in this file') + '</h3><ul class="plain">' +
        '<li>' + bi('बनाया', 'Created') + ': ' + esc(rs.exportedAt ? fd(rs.exportedAt.slice(0, 10)) : '?') + (rs.encrypted ? ' 🔒' : '') + '</li>' +
        (pv.name ? '<li>' + bi('नाम', 'Name') + ': <b>' + esc(pv.name) + '</b></li>' : '') +
        '<li>' + bi('जाँच रिपोर्ट', 'Lab reports') + ': ' + c.labs + ' · ' + bi('बीपी/वज़न', 'Vitals') + ': ' + c.vitals + ' · ' + bi('दवाइयाँ', 'Medicines') + ': ' + c.meds + '</li>' +
        '<li>' + bi('इंजेक्शन', 'Injections') + ': ' + c.injections + ' · ' + bi('विज़िट', 'Visits') + ': ' + c.visits + ' · ' + bi('डायलिसिस', 'Dialysis') + ': ' + c.dialysis + '</li>' +
        (pv.from ? '<li>' + bi('अवधि', 'Period') + ': ' + fd(pv.from) + ' – ' + fd(pv.to) + '</li>' : '') + '</ul>' +
        '<p class="banner warn">' + bi('ध्यान दें: इस डिवाइस का मौजूदा सारा डेटा इस फ़ाइल से बदल जाएगा।', 'Warning: all current data on this device will be replaced by this file.') + '</p>' +
        '<div class="toolbar"><button class="btn danger" data-action="restore-confirm">' + bi('हाँ, डेटा बदलें', 'Yes, replace my data') + '</button>' +
        '<button class="btn" data-action="restore-cancel">' + bi('रद्द', 'Cancel') + '</button></div></div>';
    }
    h += '</section>';

    var tables = exporter.allTables(S);
    h += '<section class="card"><h2>📊 ' + bi('एक्सेल / CSV में निकालें', 'Export to Excel / CSV') + '</h2>' +
      '<p class="sub">' + bi('ये फ़ाइलें पढ़ने के लिए हैं; वापस लाने के लिए बैकअप फ़ाइल ही काम आती है।', 'These files are for viewing/sharing; only the backup file can be restored.') + '</p>' +
      '<div class="toolbar"><button class="btn primary" data-action="export-xlsx">⬇ Excel (.xlsx)</button></div>' +
      '<div class="toolbar"><select id="csv-table" aria-label="CSV table">' + tables.map(function (t, i) {
        return '<option value="' + i + '"' + (t.name === 'Lab results' ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      }).join('') + '</select><button class="btn" data-action="export-csv">⬇ CSV</button></div></section>';
    return h;
  }

  /* ---------- settings ---------- */

  function renderSettings() {
    var st = S.settings, sex = S.profile.sex;
    var h = '<section class="card"><h2>' + bi('जाँच की रेंज और डॉक्टर का लक्ष्य', 'Test ranges & doctor\'s targets') + '</h2>' +
      '<p class="sub">' + bi('"सामान्य लैब रेंज" आम वयस्कों की है — अपनी लैब रिपोर्ट के अनुसार बदल सकते हैं। "डॉक्टर का लक्ष्य" सिर्फ़ तब भरें जब डॉक्टर ने बताया हो।',
        '"Typical lab range" is a common adult range — change it to match your lab report. Fill "doctor\'s target" only if your doctor gave one.') +
      (sex ? '' : ' ' + bi('लिंग न भरने पर दोनों की चौड़ी रेंज ली जाती है।', 'Without sex in Profile, the wider of the male/female ranges is used.')) + '</p>' +
      '<form data-form="ranges"><div class="table-scroll"><table class="ranges"><thead><tr><th>' + bi('जाँच', 'Test') + '</th><th colspan="2">' + bi('सामान्य लैब रेंज', 'Typical lab range') +
      '</th><th colspan="2">' + bi('डॉक्टर का लक्ष्य', 'Doctor\'s target') + '</th></tr><tr><th></th><th>' + bi('कम से कम', 'Low') + '</th><th>' + bi('ज़्यादा से ज़्यादा', 'High') + '</th><th>' + bi('कम से कम', 'Low') + '</th><th>' + bi('ज़्यादा से ज़्यादा', 'High') + '</th></tr></thead><tbody>' +
      calc.TESTS.concat(custom().map(function (c) { return info(c.key); })).map(function (t) {
        var o = (st.ranges || {})[t.key] || {}, g = (st.targets || {})[t.key] || {};
        var def = calc.rangeFor(t.key, sex, {}, custom());
        function inp(name, v, ph) { return '<td><input type="number" step="any" inputmode="decimal" name="' + name + '" value="' + esc(v === undefined || v === null ? '' : v) + '" placeholder="' + esc(ph === null || ph === undefined ? '' : fmtV(ph)) + '" aria-label="' + esc(t.en + ' ' + name) + '"></td>'; }
        return '<tr><th>' + esc(t.en) + ' <small>' + esc(t.unit) + '</small></th>' + inp('lo_' + t.key, o.lo, def.lo) + inp('hi_' + t.key, o.hi, def.hi) + inp('tlo_' + t.key, g.lo) + inp('thi_' + t.key, g.hi) + '</tr>';
      }).join('') + '</tbody></table></div><div class="toolbar"><button class="btn primary" type="submit">' + bi('सेव करें', 'Save') + '</button></div></form></section>';

    h += '<section class="card"><h2>' + bi('अपनी जाँचें', 'Custom tests') + '</h2>' + (custom().length ? '<ul class="list">' + custom().map(function (c) {
      return '<li><div class="li-main"><b>' + esc(c.name) + '</b> ' + esc(c.unit || '') + ' <small>' + esc(rangeText({ lo: calc.num(c.lo), hi: calc.num(c.hi) })) + '</small></div>' +
        '<button class="btn small danger" data-action="delete-custom" data-key="' + esc(c.key) + '">' + bi('हटाएँ', 'Remove') + '</button></li>';
    }).join('') + '</ul>' : '') +
      '<form data-form="custom-test"><div class="grid2">' + field({ k: 'name', hi: 'जाँच का नाम', en: 'Test name', req: true, ph: 'CRP' }) + field({ k: 'unit', hi: 'इकाई', en: 'Unit', ph: 'mg/L' }) +
      field({ k: 'lo', type: 'number', hi: 'सामान्य कम से कम', en: 'Range low' }) + field({ k: 'hi', type: 'number', hi: 'सामान्य ज़्यादा से ज़्यादा', en: 'Range high' }) + '</div>' +
      '<button class="btn" type="submit">+ ' + bi('जाँच जोड़ें', 'Add test') + '</button></form></section>';

    var due = st.testsDue || DEFAULT_DUE;
    var testOpts = calc.TESTS.filter(function (t) { return !t.calculated; }).concat(custom().map(function (c) { return info(c.key); }));
    h += '<section class="card"><h2>' + bi('जाँच कब-कब', 'Test reminders') + '</h2><p class="sub">' + bi('डैशबोर्ड पर याद दिलाने के लिए: हर कितने दिन में कौन सी जाँच', 'Dashboard hint: which test, every how many days') + '</p>' +
      '<form data-form="tests-due">' + due.map(function (d, i) { return dueRow(d, i, testOpts); }).join('') + dueRow({ key: '', days: 30 }, due.length, testOpts) +
      '<p class="sub">' + bi('पंक्ति हटाने के लिए जाँच "—" चुनें', 'Choose "—" to remove a row') + '</p><button class="btn primary" type="submit">' + bi('सेव करें', 'Save') + '</button></form></section>';

    h += '<section class="card"><h2>' + bi('डायलिसिस लॉग', 'Dialysis log') + '</h2><label class="check"><input type="checkbox" data-change="dialysis"' + (st.dialysisEnabled ? ' checked' : '') + '> ' +
      bi('डायलिसिस सेक्शन दिखाएँ', 'Show the dialysis section') + '</label></section>';

    h += '<section class="card"><h2>🔒 ' + bi('ऐप PIN', 'App PIN') + '</h2><p class="sub">' +
      bi('PIN सिर्फ़ साझा फ़ोन पर दूसरों को सरसरी तौर पर देखने से रोकता है। यह मज़बूत सुरक्षा नहीं है: डेटा इससे एन्क्रिप्ट नहीं होता और जानकार व्यक्ति इसे पार कर सकता है।',
        'The PIN only stops casual viewing on a shared device. It is NOT strong security: it does not encrypt the data, and a technical person can get around it.') + '</p>' +
      (st.pin ? '<div class="toolbar"><button class="btn" data-action="lock">' + bi('अभी लॉक करें', 'Lock now') + '</button><button class="btn danger" data-action="remove-pin">' + bi('PIN हटाएँ', 'Remove PIN') + '</button></div>' : '') +
      '<form data-form="pin"><div class="grid2">' + field({ k: 'pin', type: 'password', hi: st.pin ? 'नया PIN' : 'PIN (4–6 अंक)', en: st.pin ? 'New PIN' : 'PIN (4–6 digits)' }) +
      field({ k: 'pin2', type: 'password', hi: 'PIN दोबारा', en: 'Repeat PIN' }) + '</div><button class="btn primary" type="submit">' + bi(st.pin ? 'PIN बदलें' : 'PIN लगाएँ', st.pin ? 'Change PIN' : 'Set PIN') + '</button></form></section>';

    h += '<section class="card"><h2>' + bi('डेटा', 'Data') + '</h2><div class="toolbar"><button class="btn" data-action="load-demo">' + bi('काल्पनिक डेमो डेटा लोड करें', 'Load fictional demo data') + '</button>' +
      '<button class="btn danger" data-action="delete-all">' + bi('सारा डेटा मिटाएँ', 'Delete all data') + '</button></div></section>';
    return h;
  }

  function dueRow(d, i, tests) {
    return '<div class="grid2 due-row"><div class="field"><label for="due_k_' + i + '">' + bi('जाँच', 'Test') + '</label><select id="due_k_' + i + '" name="due_k_' + i + '"><option value="">—</option>' +
      tests.map(function (t) { return '<option value="' + esc(t.key) + '"' + (t.key === d.key ? ' selected' : '') + '>' + esc(t.en) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="due_d_' + i + '">' + bi('हर कितने दिन', 'Every N days') + '</label><input type="number" min="1" step="1" id="due_d_' + i + '" name="due_d_' + i + '" value="' + esc(d.days) + '"></div></div>';
  }

  /* ---------- more / about ---------- */

  function renderMore() {
    var items = [['#/vitals', '❤️', 'बीपी, वज़न व लक्षण', 'BP, weight & symptoms'], ['#/injections', '💉', 'इंजेक्शन', 'Injections'], ['#/visits', '🩺', 'डॉक्टर विज़िट', 'Doctor visits']];
    if (S.settings.dialysisEnabled) items.push(['#/dialysis', '🔁', 'डायलिसिस लॉग', 'Dialysis log']);
    items = items.concat([['#/grid', '▦', 'जाँच तालिका', 'Results grid'], ['#/summary', '📄', 'डॉक्टर के लिए सारांश', 'Doctor summary'], ['#/emergency', '🚑', 'इमरजेंसी कार्ड', 'Emergency card'],
      ['#/profile', '👤', 'प्रोफ़ाइल', 'Profile'], ['#/backup', '💾', 'बैकअप व एक्सपोर्ट', 'Backup & export'], ['#/settings', '⚙️', 'सेटिंग्स', 'Settings']]);
    return '<nav class="menu">' + items.map(function (i) { return '<a class="menu-item" href="' + i[0] + '"><span class="ic">' + i[1] + '</span>' + bi(i[2], i[3]) + '</a>'; }).join('') + '</nav>' +
      '<section class="card"><h2>' + bi('निजता', 'Privacy') + '</h2><p>' + bi('आपका डेटा सिर्फ़ इसी डिवाइस के ब्राउज़र में रहता है। ऐप कोई डेटा इंटरनेट पर नहीं भेजता। ब्राउज़र का डेटा मिटाने पर रिकॉर्ड भी मिट सकते हैं — नियमित बैकअप लें।',
        'Your data stays only in this browser on this device. The app sends nothing over the internet. Clearing browser data can erase your records — take regular backups.') + '</p>' +
      '<p class="sub">eGFR: CKD-EPI 2021 (race-free) creatinine equation. ' + bi('सामान्य रेंज सिर्फ़ अनुमान हैं, अपनी लैब की रेंज देखें।', 'Typical ranges are approximate; check your lab\'s ranges.') + '</p></section>';
  }

  function disclaimer() {
    return '<span lang="hi">केवल रिकॉर्ड रखने हेतु — इलाज हेतु अपने डॉक्टर की सलाह मानें</span> / For record-keeping only — follow your doctor\'s advice.';
  }

  /* ---------- lock screen ---------- */

  function renderLock() {
    return '<form class="card lock" data-form="unlock"><h2>🔒 ' + bi('PIN डालें', 'Enter PIN') + '</h2>' +
      '<input type="password" name="pin" inputmode="numeric" autocomplete="off" aria-label="PIN" required autofocus>' +
      '<button class="btn primary" type="submit">' + bi('खोलें', 'Unlock') + '</button>' +
      '<details><summary>' + bi('PIN भूल गए?', 'Forgot PIN?') + '</summary><p class="sub">' +
      bi('PIN वापस नहीं मिल सकता। आप इस डिवाइस का सारा डेटा मिटाकर बैकअप फ़ाइल से वापस ला सकते हैं।', 'The PIN cannot be recovered. You can erase all data on this device and then restore from your backup file.') +
      '</p><button class="btn danger" type="button" data-action="forgot-pin">' + bi('सारा डेटा मिटाएँ', 'Erase all data') + '</button></details></form>';
  }

  /* ---------- router ---------- */

  var ROUTES = {
    home: ['होम', 'Home', renderHome],
    labs: ['जाँच रिपोर्ट', 'Lab reports', renderLabs],
    lab: ['जाँच परिणाम लिखें', 'Enter test results', function (id) { return renderLabForm(id); }],
    trends: ['ग्राफ़', 'Trends', renderTrends],
    grid: ['जाँच तालिका', 'Results grid', renderGrid],
    meds: ['दवाइयाँ', 'Medicines', function () { return recordList('meds'); }],
    medchart: ['दवा चार्ट', 'Medicine chart', renderMedChart],
    vitals: ['बीपी, वज़न व लक्षण', 'BP, weight & symptoms', function () { return recordList('vitals'); }],
    injections: ['इंजेक्शन', 'Injections', function () { return recordList('injections'); }],
    visits: ['डॉक्टर विज़िट', 'Doctor visits', function () { return recordList('visits'); }],
    dialysis: ['डायलिसिस लॉग', 'Dialysis log', function () { return recordList('dialysis'); }],
    edit: ['', '', null],
    summary: ['डॉक्टर के लिए सारांश', 'Doctor summary', renderSummary],
    emergency: ['इमरजेंसी कार्ड', 'Emergency card', renderEmergency],
    profile: ['प्रोफ़ाइल', 'Profile', renderProfile],
    backup: ['बैकअप व एक्सपोर्ट', 'Backup & export', renderBackup],
    settings: ['सेटिंग्स', 'Settings', renderSettings],
    more: ['और', 'More', renderMore]
  };

  function parseRoute() {
    var parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/').map(decodeURIComponent);
    return { name: ROUTES[parts[0]] ? parts[0] : 'home', a: parts[1], b: parts[2] };
  }

  function render() {
    var r = parseRoute(), title, html;
    document.body.setAttribute('data-route', ui.locked ? 'lock' : r.name);
    if (ui.locked) {
      main.innerHTML = renderLock();
      document.getElementById('page-title').innerHTML = '';
      return;
    }
    if (r.name === 'edit' && RECORDS[r.a]) {
      var R = RECORDS[r.a];
      title = bi(R.hi, R.en);
      html = recordForm(r.a, r.b);
    } else if (r.name === 'dialysis' && !S.settings.dialysisEnabled) {
      title = bi('डायलिसिस लॉग', 'Dialysis log');
      html = '<p class="empty">' + bi('सेटिंग्स में डायलिसिस सेक्शन चालू करें', 'Enable the dialysis section in Settings') + '</p><a class="btn" href="#/settings">' + bi('सेटिंग्स', 'Settings') + '</a>';
    } else {
      var rt = ROUTES[r.name === 'edit' ? 'home' : r.name];
      title = bi(rt[0], rt[1]);
      html = rt[2](r.a);
    }
    document.getElementById('page-title').innerHTML = title;
    main.innerHTML = html;
    document.querySelectorAll('.bottom-nav a').forEach(function (a) {
      var tab = a.getAttribute('data-tab'), on = tab === r.name || (tab === 'labs' && (r.name === 'lab' || r.name === 'grid')) ||
        (tab === 'meds' && (r.name === 'medchart' || (r.name === 'edit' && r.a === 'meds'))) ||
        (tab === 'more' && ['vitals', 'injections', 'visits', 'dialysis', 'summary', 'emergency', 'profile', 'backup', 'settings'].concat(r.name === 'edit' && r.a !== 'meds' ? ['edit'] : []).indexOf(r.name) >= 0);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var labForm = main.querySelector('form[data-form="lab"]');
    if (labForm) updateLabCalc(labForm);
  }

  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
    window.scrollTo(0, 0);
  }

  function reload() {
    return db.loadAll().then(function (d) { Object.keys(d).forEach(function (k) { S[k] = d[k]; }); });
  }

  /* ---------- form submits ---------- */

  var FORMS = {
    record: function (form) {
      var type = form.getAttribute('data-type'), id = form.getAttribute('data-id');
      var base = id ? S[type].filter(function (r) { return r.id === id; })[0] : {};
      var rec = readFields(form, RECORDS[type].fields, base);
      if (type === 'injections' && rec.frequency === 'custom' && !(rec.customDays > 0)) {
        toast('अन्य के लिए दिन भरें / Enter the number of days for custom'); return;
      }
      return db.put(type, rec).then(reload).then(function () { toast('सेव हो गया / Saved'); go('#/' + type); });
    },
    lab: function (form) {
      var id = form.getAttribute('data-id');
      var base = id ? S.labs.filter(function (l) { return l.id === id; })[0] : {};
      var lab = Object.assign({}, base, { date: form.elements.date.value, labName: form.elements.labName.value.trim(),
        notes: form.elements.notes.value.trim(), labEgfr: calc.num(form.elements.labEgfr.value), values: {} });
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name && el.name.indexOf('t_') === 0) {
          var n = calc.num(el.value);
          if (n !== null) lab.values[el.name.slice(2)] = n;
        }
      });
      if (!Object.keys(lab.values).length && lab.labEgfr === null) { toast('कम से कम एक जाँच भरें / Enter at least one result'); return; }
      return db.put('labs', lab).then(reload).then(function () { toast('सेव हो गया / Saved'); go('#/labs'); });
    },
    profile: function (form) {
      S.profile = readFields(form, PROFILE_FIELDS, S.profile);
      return db.setMeta('profile', S.profile).then(function () { toast('सेव हो गया / Saved'); go('#/home'); });
    },
    'trend-range': function (form) {
      ui.trend.from = form.elements.from ? form.elements.from.value : '';
      ui.trend.to = form.elements.to ? form.elements.to.value : '';
      render();
    },
    ranges: function (form) {
      var ranges = {}, targets = {};
      calc.TESTS.concat(custom().map(function (c) { return { key: c.key }; })).forEach(function (t) {
        var lo = calc.num(form.elements['lo_' + t.key].value), hi = calc.num(form.elements['hi_' + t.key].value);
        var tlo = calc.num(form.elements['tlo_' + t.key].value), thi = calc.num(form.elements['thi_' + t.key].value);
        if (lo !== null || hi !== null) ranges[t.key] = { lo: lo, hi: hi };
        if (tlo !== null || thi !== null) targets[t.key] = { lo: tlo, hi: thi };
      });
      S.settings.ranges = ranges; S.settings.targets = targets;
      return saveSettings().then(function () { toast('सेव हो गया / Saved'); render(); });
    },
    'custom-test': function (form) {
      var name = form.elements.name.value.trim();
      if (!name) return;
      S.settings.customTests = custom().concat([{ key: 'c_' + db.newId(), name: name, unit: form.elements.unit.value.trim(),
        lo: calc.num(form.elements.lo.value), hi: calc.num(form.elements.hi.value) }]);
      return saveSettings().then(function () { toast('जाँच जोड़ी / Test added'); render(); });
    },
    'tests-due': function (form) {
      var rules = [];
      for (var i = 0; form.elements['due_k_' + i]; i++) {
        var k = form.elements['due_k_' + i].value, d = parseInt(form.elements['due_d_' + i].value, 10);
        if (k && d > 0) rules.push({ key: k, days: d });
      }
      S.settings.testsDue = rules;
      return saveSettings().then(function () { toast('सेव हो गया / Saved'); render(); });
    },
    pin: function (form) {
      var p = form.elements.pin.value, p2 = form.elements.pin2.value;
      if (!/^\d{4,6}$/.test(p)) { toast('PIN 4–6 अंकों का हो / PIN must be 4–6 digits'); return; }
      if (p !== p2) { toast('दोनों PIN एक जैसे नहीं / PINs do not match'); return; }
      return backup.hashPin(p).then(function (h) { S.settings.pin = h; return saveSettings(); }).then(function () { toast('PIN लग गया / PIN set'); render(); });
    },
    unlock: function (form) {
      return backup.checkPin(form.elements.pin.value, S.settings.pin).then(function (ok) {
        if (ok) { ui.locked = false; render(); } else { toast('गलत PIN / Wrong PIN'); form.elements.pin.value = ''; }
      });
    },
    backup: function (form) {
      var pw = form.elements.pw.value;
      if (pw !== form.elements.pw2.value) { toast('पासवर्ड मेल नहीं खाते / Passwords do not match'); return; }
      toast('बैकअप बन रहा है… / Preparing backup…');
      return backup.createBackup(S, pw || null).then(function (text) {
        download('kidney-health-backup-' + fd(today()).replace(/\./g, '-') + (pw ? '-encrypted' : '') + '.json', new Blob([text], { type: 'application/json' }));
        S.settings.lastBackup = today();
        return saveSettings();
      }).then(function () { toast('बैकअप डाउनलोड हुआ / Backup downloaded'); render(); });
    },
    'restore-password': function (form) {
      var rs = ui.restore;
      return backup.readBackup(rs.text, form.elements.pw.value).then(function (data) {
        rs.data = data; rs.needPassword = false; rs.error = null; render();
      }, function () { rs.error = bi('गलत पासवर्ड', 'Wrong password'); render(); });
    }
  };

  var ERRORS = {
    NOT_JSON: ['यह बैकअप फ़ाइल नहीं है', 'This is not a backup file'],
    NOT_BACKUP: ['यह इस ऐप की बैकअप फ़ाइल नहीं है', 'This is not a backup from this app'],
    TOO_NEW: ['यह फ़ाइल ऐप के नए संस्करण की है', 'This file is from a newer version of the app']
  };

  /* ---------- click actions ---------- */

  function replaceAllKeepingDevice(data) {
    var settings = Object.assign({}, data.settings || {});
    if (S.settings.pin) settings.pin = S.settings.pin;
    if (S.settings.lastBackup) settings.lastBackup = S.settings.lastBackup;
    return db.replaceAll(Object.assign({}, data, { settings: settings })).then(reload);
  }

  var ACTIONS = {
    print: function () { window.print(); },
    'delete-record': function (el) {
      if (!confirm('क्या सच में हटाना है? / Delete this record?')) return;
      var type = el.getAttribute('data-type');
      return db.del(type, el.getAttribute('data-id')).then(reload).then(function () { toast('हटाया / Deleted'); go('#/' + type); });
    },
    'delete-custom': function (el) {
      var key = el.getAttribute('data-key');
      if (!confirm('यह जाँच सूची से हटाएँ? पुराने मान रिकॉर्ड में रहेंगे। / Remove this test? Old values stay in the records.')) return;
      S.settings.customTests = custom().filter(function (c) { return c.key !== key; });
      return saveSettings().then(render);
    },
    'load-demo': function () {
      if (hasData() && !confirm('डेमो डेटा आपके मौजूदा डेटा को बदल देगा। पहले बैकअप लें! जारी रखें? / Demo data REPLACES your current data. Back up first! Continue?')) return;
      return replaceAllKeepingDevice(KT.demo.build(today())).then(function () { toast('काल्पनिक डेमो डेटा लोड हुआ / Fictional demo data loaded'); go('#/home'); });
    },
    'delete-all': function () {
      if (!confirm('इस डिवाइस का सारा डेटा मिट जाएगा। / All data on this device will be erased. Continue?')) return;
      if (!confirm('पक्का? यह वापस नहीं होगा (बैकअप फ़ाइल को छोड़कर)। / Are you sure? This cannot be undone (except from a backup file).')) return;
      return db.replaceAll({ profile: {}, settings: {} }).then(reload).then(function () { toast('डेटा मिटाया / Data erased'); go('#/home'); });
    },
    'forgot-pin': function () {
      if (!confirm('इस डिवाइस का सारा डेटा मिट जाएगा। / All data on this device will be erased. Continue?')) return;
      return db.replaceAll({ profile: {}, settings: {} }).then(reload).then(function () { ui.locked = false; go('#/backup'); });
    },
    'remove-pin': function () {
      delete S.settings.pin;
      return saveSettings().then(function () { toast('PIN हटाया / PIN removed'); render(); });
    },
    lock: function () { ui.locked = true; render(); },
    'restore-cancel': function () { ui.restore = null; render(); },
    'restore-confirm': function () {
      var data = ui.restore && ui.restore.data;
      if (!data) return;
      return replaceAllKeepingDevice(data).then(function () { ui.restore = null; toast('डेटा वापस आ गया / Data restored'); go('#/home'); });
    },
    'export-xlsx': function () {
      var bytes = exporter.toXLSX(exporter.allTables(S));
      download('kidney-health-' + fd(today()).replace(/\./g, '-') + '.xlsx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    },
    'export-csv': function () {
      var tables = exporter.allTables(S), t = tables[+document.getElementById('csv-table').value] || tables[1];
      download('kidney-health-' + t.name.toLowerCase().replace(/\s+/g, '-') + '-' + fd(today()).replace(/\./g, '-') + '.csv', new Blob([exporter.toCSV(t)], { type: 'text/csv;charset=utf-8' }));
    }
  };

  var CHANGES = {
    trend: function (el) { ui.trend.preset = el.value; render(); },
    'grid-cols': function (el) { ui.gridCols = el.value; render(); },
    dialysis: function (el) { S.settings.dialysisEnabled = el.checked; return saveSettings().then(function () { toast('सेव हो गया / Saved'); }); },
    'restore-file': function (el) {
      var f = el.files && el.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var rs = ui.restore = { text: text };
        try {
          var i = backup.inspectBackup(text);
          rs.encrypted = i.encrypted; rs.exportedAt = i.exportedAt;
        } catch (e) {
          var m = ERRORS[e.message] || ERRORS.NOT_JSON;
          rs.error = bi(m[0], m[1]); render(); return;
        }
        if (rs.encrypted) { rs.needPassword = true; render(); return; }
        return backup.readBackup(text).then(function (d) { rs.data = d; render(); }, function () { rs.error = bi('फ़ाइल ख़राब है', 'The file is damaged'); render(); });
      });
    }
  };

  function handleError(e) {
    console.error(e);
    toast('गड़बड़ी हुई / Something went wrong: ' + (e && e.message ? e.message : e));
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || !ACTIONS[el.getAttribute('data-action')]) return;
    e.preventDefault();
    Promise.resolve().then(function () { return ACTIONS[el.getAttribute('data-action')](el); }).catch(handleError);
  });
  document.addEventListener('submit', function (e) {
    var form = e.target, name = form.getAttribute('data-form');
    if (!FORMS[name]) return;
    e.preventDefault();
    Promise.resolve().then(function () { return FORMS[name](form); }).catch(handleError);
  });
  document.addEventListener('change', function (e) {
    var name = e.target.getAttribute('data-change');
    if (name && CHANGES[name]) Promise.resolve().then(function () { return CHANGES[name](e.target); }).catch(handleError);
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.type === 'date' || el.type === 'datetime-local') {
      var hint = el.form ? el.form.querySelector('[data-hint-for="' + el.id + '"]') : null;
      if (hint) hint.textContent = el.type === 'date' ? fd(el.value) : calc.fmtDateTime(el.value);
    }
    if (el.form && el.form.getAttribute('data-form') === 'lab') updateLabCalc(el.form);
    if (el.id === 'summary-notes') {
      S.settings.summaryNotes = el.value;
      document.getElementById('summary-notes-print').innerHTML = nl2br(el.value);
      clearTimeout(ui.notesTimer);
      ui.notesTimer = setTimeout(function () { saveSettings().catch(handleError); }, 600);
    }
  });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  // Re-lock after 5 minutes in the background.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { ui.hiddenAt = Date.now(); return; }
    if (S.settings.pin && ui.hiddenAt && Date.now() - ui.hiddenAt > 5 * 60 * 1000) { ui.locked = true; render(); }
  });

  /* ---------- start ---------- */

  document.getElementById('disclaimer').innerHTML = disclaimer();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
  }
  reload().then(function () {
    ui.locked = !!S.settings.pin;
    render();
  }).catch(function (e) {
    main.innerHTML = '<p class="banner error">' + bi('इस ब्राउज़र में डेटा सेव नहीं हो सकता (IndexedDB बंद है)। प्राइवेट/इन्कॉग्निटो मोड बंद करके देखें।',
      'This browser cannot store data (IndexedDB unavailable). Try outside private/incognito mode.') + '<br><small>' + esc(e && e.message) + '</small></p>';
  });
})();
