/* पत्र पंजी — user interface */
(function () {
  'use strict';

  var C = window.LRCore;
  var DB = window.LRDB;
  var FS = window.LRFileSync;

  var state = {
    entries: [],
    byId: {},
    settings: { officeLine: C.DEFAULT_OFFICE_LINE, chronoCols: ['sn', 'date', 'letterNo', 'fromTo', 'subject', 'remarks'], includeSummary: true, orientation: 'portrait' },
    lastBackup: '',
    lastFileSave: '',
    annex: [],
    reg: { filters: {}, sort: 'desc', selected: {}, limit: 200 },
    form: { editingId: null, matters: [], statusTouched: false, dirty: false },
    dbOk: true,
    bannerSnoozed: false
  };

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }
  function h(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function hbr(s) { return h(s).replace(/\n/g, '<br>'); }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }

  /** Simple modal. buttons: [{label, value, cls}] → resolves with value ('' on Esc). */
  function dialog(title, html, buttons) {
    var d = $('dialog');
    $('dlg-title').textContent = title;
    $('dlg-body').innerHTML = html;
    var acts = $('dlg-actions');
    acts.innerHTML = '';
    (buttons || [{ label: 'ठीक है / OK', value: 'ok' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.value = b.value;
      btn.textContent = b.label;
      if (b.cls) btn.className = b.cls;
      acts.appendChild(btn);
    });
    return new Promise(function (resolve) {
      d.onclose = function () { resolve(d.returnValue || ''); };
      d.returnValue = '';
      d.showModal();
    });
  }

  function confirmBox(title, html, okLabel, danger) {
    return dialog(title, html, [
      { label: okLabel || 'हाँ / Yes', value: 'yes', cls: danger ? 'danger' : '' },
      { label: 'रद्द / Cancel', value: 'no', cls: 'secondary' }
    ]).then(function (v) { return v === 'yes'; });
  }

  function download(name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatIso(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return C.todayString(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function typePill(t) { return '<span class="pill t-' + t + '">' + h(C.TYPES[t].hi) + '</span>'; }
  function statusPill(s) { return '<span class="pill s-' + s + '">' + h(C.STATUSES[s].hi) + '</span>'; }

  function entryLabel(e) {
    return C.TYPES[e.type].hi + ' | ' + (e.letterNo || '—') + ' | ' + (C.displayDate(e.date) || 'बिना दिनांक') + ' | ' + truncate(e.subject, 70);
  }

  function entryLink(e) {
    if (!e) return '<em>हटाई गई प्रविष्टि / deleted entry</em>';
    return '<a href="#edit/' + encodeURIComponent(e.id) + '">' + h(entryLabel(e)) + '</a>';
  }

  /* ---------- data ---------- */

  function index(e) {
    e._search = C.searchText(e);
    state.byId[e.id] = e;
  }

  function setEntries(list) {
    state.entries = list;
    state.byId = {};
    list.forEach(index);
  }

  /** Save changed/new entries and delete ids; updates memory, IndexedDB and the linked file. */
  function commit(changed, deletedIds) {
    changed = changed || [];
    deletedIds = deletedIds || [];
    var del = {};
    deletedIds.forEach(function (id) { del[id] = 1; });
    var map = {};
    state.entries.forEach(function (e) { if (!del[e.id]) map[e.id] = e; });
    changed.forEach(function (e) { map[e.id] = e; });
    // drop links that point to deleted entries
    if (deletedIds.length) {
      Object.keys(map).forEach(function (id) {
        var e = map[id];
        var refs = e.refIds.filter(function (r) { return !del[r]; });
        if (refs.length !== e.refIds.length || del[e.replyId]) {
          var copy = Object.assign({}, e, { refIds: refs, replyId: del[e.replyId] ? '' : e.replyId });
          map[id] = copy;
          changed.push(copy);
        }
      });
      state.annex = state.annex.filter(function (id) { return !del[id]; });
      saveMeta('annex', state.annex);
    }
    setEntries(Object.keys(map).map(function (k) { return map[k]; }));
    var p = Promise.resolve();
    if (state.dbOk) {
      p = Promise.all([
        changed.length ? DB.putMany(changed) : null,
        deletedIds.length ? DB.deleteMany(deletedIds) : null
      ]).catch(function (err) {
        showStorageError(err);
      });
    }
    scheduleFileSave();
    refreshCommon();
    return p;
  }

  function replaceAllEntries(list) {
    setEntries(list);
    state.annex = state.annex.filter(function (id) { return state.byId[id]; });
    saveMeta('annex', state.annex);
    var p = state.dbOk ? DB.replaceAll(list).catch(showStorageError) : Promise.resolve();
    scheduleFileSave();
    refreshCommon();
    return p;
  }

  function saveMeta(key, value) {
    if (!state.dbOk) return Promise.resolve();
    return DB.setMeta(key, value).catch(showStorageError);
  }

  function saveSettings() { return saveMeta('settings', state.settings); }

  function showStorageError(err) {
    console.error(err);
    toast('डेटा सहेजने में त्रुटि! तुरंत बैकअप डाउनलोड करें। / Error saving data — download a backup now.', 6000);
  }

  /* ---------- keep data in a file ---------- */

  var fileTimer = null;
  function scheduleFileSave() {
    if (!FS.handle || FS.status !== 'ok') return;
    clearTimeout(fileTimer);
    fileTimer = setTimeout(writeFileNow, 700);
  }

  function writeFileNow() {
    clearTimeout(fileTimer);
    return FS.write(C.serializeBackup(state.entries, state.settings)).then(function (ok) {
      if (ok) {
        state.lastFileSave = new Date().toISOString();
        saveMeta('lastFileSave', state.lastFileSave);
      }
      renderBanners();
      if (currentScreen === 'data') renderFileSync();
      return ok;
    });
  }

  /* ---------- routing ---------- */

  var currentScreen = '';
  var SCREENS = ['register', 'add', 'pending', 'chronology', 'annexure', 'import', 'data'];

  function route() {
    var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    var screen = hash.split('/')[0] || 'register';
    var arg = hash.slice(screen.length + 1);
    if (screen === 'edit') {
      var e = state.byId[arg];
      if (!e) { location.replace('#register'); return; }
      loadForm(e);
      screen = 'add';
    } else if (screen === 'add') {
      if (state.form.editingId) resetForm();
    }
    if (SCREENS.indexOf(screen) === -1) screen = 'register';
    currentScreen = screen;
    SCREENS.forEach(function (s) { $('screen-' + s).hidden = s !== screen; });
    document.querySelectorAll('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-screen') === screen && !(screen === 'add' && state.form.editingId));
    });
    renderScreen();
    window.scrollTo(0, 0);
    if (screen === 'add' && !state.form.editingId) setTimeout(function () { $('entry-form').elements.letterNo.focus(); }, 30);
  }

  function renderScreen() {
    switch (currentScreen) {
      case 'register': renderRegister(); break;
      case 'pending': renderPending(); break;
      case 'chronology': renderChronologyForm(); renderChronology(); break;
      case 'annexure': renderAnnex(); break;
      case 'data': renderData(); break;
      case 'add': renderRelations(); break;
    }
  }

  function refreshCommon() {
    fillDatalists();
    renderBadges();
    renderBanners();
    if (currentScreen !== 'add' && currentScreen !== 'import') renderScreen();
  }

  /* ---------- datalists, badges, banners ---------- */

  function fillDatalists() {
    var opts = function (values) { return values.slice(0, 300).map(function (v) { return '<option value="' + h(v) + '">'; }).join(''); };
    var people = C.distinctValues(state.entries, 'from').concat(C.distinctValues(state.entries, 'to'));
    var uniq = people.filter(function (v, i) { return people.indexOf(v) === i; });
    $('dl-from').innerHTML = opts(uniq);
    $('dl-to').innerHTML = opts(uniq);
    $('dl-matters').innerHTML = opts(C.allMatters(state.entries).map(function (m) { return m.name; }));
  }

  function renderBadges() {
    var g = C.pendingGroups(state.entries);
    var n = g.overdue.length + g.soon.length;
    var b = $('pending-badge');
    b.hidden = !n;
    b.textContent = n;
    b.title = g.overdue.length + ' समय-सीमा पार / overdue, ' + g.soon.length + ' 7 दिनों में / due within 7 days';
    var a = $('annex-badge');
    a.hidden = !state.annex.length;
    a.textContent = state.annex.length;
  }

  function backupAgeDays() {
    var times = [state.lastBackup, state.lastFileSave].filter(Boolean).sort();
    var last = times[times.length - 1];
    if (last) return daysSince(last);
    var real = state.entries.filter(function (e) { return !e.sample; });
    if (!real.length) return null;
    var oldest = real.map(function (e) { return e.createdAt; }).sort()[0];
    return daysSince(oldest);
  }

  function renderBanners() {
    var html = '';
    if (!state.dbOk) {
      html += '<div class="banner danger"><span class="grow"><b>इस ब्राउज़र में डेटा सहेजा नहीं जा सकता</b> (शायद Private/Incognito मोड)। बंद करने से पहले बैकअप डाउनलोड करें।<br><small>Data cannot be stored in this browser (private mode?). Download a backup before closing.</small></span>' +
        '<button type="button" data-act="backup">बैकअप / Backup</button></div>';
    }
    if (FS.handle && FS.status === 'needs-permission') {
      html += '<div class="banner"><span class="grow">डेटा फ़ाइल से फिर जोड़ने के लिए अनुमति दें, ताकि बदलाव फ़ाइल में सहेजे जाएँ। <small>Click to reconnect your data file so changes keep saving to it.</small></span>' +
        '<button type="button" data-act="reconnect">फ़ाइल से जोड़ें / Reconnect file</button></div>';
    } else if (FS.handle && FS.status === 'error') {
      html += '<div class="banner danger"><span class="grow">डेटा फ़ाइल में सहेजने में त्रुटि / Could not save to the data file: ' + h(FS.lastError) + '</span>' +
        '<button type="button" data-act="reconnect">पुनः प्रयास / Retry</button></div>';
    }
    var age = backupAgeDays();
    if (!state.bannerSnoozed && age !== null && age >= 7) {
      var lastTxt = state.lastBackup ? 'अंतिम बैकअप ' + age + ' दिन पहले' : 'अभी तक कोई बैकअप नहीं लिया गया';
      var lastEn = state.lastBackup ? 'Last backup ' + age + ' days ago' : 'No backup taken yet';
      html += '<div class="banner"><span class="grow"><b>बैकअप लें!</b> ' + lastTxt + '। <small>' + lastEn + '.</small></span>' +
        '<button type="button" data-act="backup">अभी बैकअप लें / Back up now</button>' +
        '<button type="button" class="secondary" data-act="snooze">बाद में / Later</button></div>';
    }
    $('banners').innerHTML = html;
  }

  $('banners').addEventListener('click', function (ev) {
    var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
    if (act === 'backup') downloadBackup();
    else if (act === 'snooze') { state.bannerSnoozed = true; renderBanners(); }
    else if (act === 'reconnect') {
      FS.reconnect().then(function (ok) {
        if (ok) { FS.status = 'ok'; writeFileNow(); toast('फ़ाइल जुड़ गई / File reconnected'); }
        renderBanners();
      }).catch(function (err) { toast(String(err.message || err)); });
    }
  });

  /* ---------- register ---------- */

  function fillSelect(sel, options, current) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + h(o[0]) + '"' + (o[0] === current ? ' selected' : '') + '>' + h(o[1]) + '</option>';
    }).join('');
  }

  function typeOptions(all) {
    var o = Object.keys(C.TYPES).map(function (k) { return [k, C.typeLabel(k)]; });
    return all ? [['', '— सभी / All —']].concat(o) : o;
  }
  function statusOptions(all) {
    var o = Object.keys(C.STATUSES).map(function (k) { return [k, C.statusLabel(k)]; });
    return all ? [['', '— सभी / All —']].concat(o) : o;
  }
  function matterOptions(placeholder) {
    return [['', placeholder]].concat(C.allMatters(state.entries).map(function (m) { return [m.name, m.name + ' (' + m.count + ')']; }));
  }

  function readFilters() {
    var f = state.reg.filters;
    f.q = $('f-q').value;
    f.type = $('f-type').value;
    f.matter = $('f-matter').value;
    f.status = $('f-status').value;
    f.dateFrom = $('f-dfrom').value;
    f.dateTo = $('f-dto').value;
    f.from = $('f-from').value;
    f.to = $('f-to').value;
    state.reg.sort = $('f-sort').value;
    state.reg.limit = 200;
  }

  function filteredEntries() {
    return C.sortEntries(C.filterEntries(state.entries, state.reg.filters), state.reg.sort === 'desc');
  }

  function renderRegister() {
    var f = state.reg.filters;
    fillSelect($('f-type'), typeOptions(true), f.type || '');
    fillSelect($('f-status'), statusOptions(true), f.status || '');
    fillSelect($('f-matter'), matterOptions('— सभी / All —'), f.matter || '');
    ['f-dfrom', 'f-dto'].forEach(function (id) {
      var v = $(id).value;
      $(id).classList.toggle('invalid', !!v.trim() && !C.parseDate(v));
    });
    var list = filteredEntries();
    var total = state.entries.length;
    $('reg-count').textContent = list.length === total ? total + ' प्रविष्टियाँ / entries' : list.length + ' / ' + total + ' प्रविष्टियाँ मिलीं / entries match';
    var sel = state.reg.selected;
    var rows = list.slice(0, state.reg.limit).map(function (e) {
      var fromTo = C.fromToText(e);
      var dueTxt = '';
      if (e.status === 'pending' && e.dueDate) {
        var dd = C.daysUntil(e.dueDate);
        dueTxt = '<div class="sub' + (dd !== null && dd < 0 ? '" style="color:var(--danger)' : '') + '">समय-सीमा ' + h(e.dueDate) + '</div>';
      }
      return '<tr data-id="' + h(e.id) + '"' + (sel[e.id] ? ' class="selected"' : '') + '>' +
        '<td class="c-check"><input type="checkbox" data-check="' + h(e.id) + '"' + (sel[e.id] ? ' checked' : '') + ' aria-label="चुनें / Select"></td>' +
        '<td class="c-date">' + h(C.displayDate(e.date) || '—') + '</td>' +
        '<td class="c-type">' + typePill(e.type) + (e.sample ? ' <span class="pill tag-sample">नमूना</span>' : '') + '</td>' +
        '<td data-l="पत्रांक / Letter no.">' + h(e.letterNo || '—') + '</td>' +
        '<td data-l="प्रेषक → प्राप्तकर्ता / From → To">' + h(fromTo || '—') + '</td>' +
        '<td data-l="विषय / Subject">' + h(e.subject) + (e.summary ? '<div class="sub">' + h(truncate(e.summary, 120)) + '</div>' : '') + '</td>' +
        '<td data-l="मामला / Matter">' + e.matters.map(function (m) { return '<span class="chip">' + h(m) + '</span>'; }).join(' ') + '</td>' +
        '<td data-l="स्थिति / Status">' + statusPill(e.status) + dueTxt + '</td></tr>';
    });
    $('reg-body').innerHTML = rows.join('');
    $('reg-more').hidden = list.length <= state.reg.limit;
    var empty = $('reg-empty');
    if (!total) {
      empty.hidden = false;
      empty.innerHTML = '<p>पंजी अभी खाली है। / The register is empty.</p>' +
        '<button type="button" onclick="location.hash=\'#add\'">+ पहला पत्र जोड़ें / Add first entry</button>' +
        '<button type="button" class="secondary" id="empty-samples">नमूना देखें / Load sample entries</button>' +
        '<button type="button" class="secondary" onclick="location.hash=\'#import\'">Excel से आयात / Import</button>';
      $('empty-samples').onclick = loadSamples;
    } else if (!list.length) {
      empty.hidden = false;
      empty.innerHTML = '<p>कोई प्रविष्टि नहीं मिली। / Nothing matches.</p>';
    } else empty.hidden = true;
    var nSel = Object.keys(sel).length;
    $('reg-annex').disabled = !nSel;
    $('reg-annex').textContent = 'चयनित (' + nSel + ') → अनुलग्नक / Selected → Annexure';
    var visible = list.slice(0, state.reg.limit);
    $('reg-all').checked = visible.length > 0 && visible.every(function (e) { return sel[e.id]; });
  }

  (function wireRegister() {
    var timer;
    ['f-q', 'f-dfrom', 'f-dto', 'f-from', 'f-to'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { readFilters(); renderRegister(); }, 150);
      });
    });
    ['f-type', 'f-matter', 'f-status', 'f-sort'].forEach(function (id) {
      $(id).addEventListener('change', function () { readFilters(); renderRegister(); });
    });
    $('f-clear').onclick = function () {
      ['f-q', 'f-dfrom', 'f-dto', 'f-from', 'f-to'].forEach(function (id) { $(id).value = ''; });
      state.reg.filters = {};
      $('f-type').value = $('f-matter').value = $('f-status').value = '';
      readFilters();
      renderRegister();
    };
    if (window.matchMedia('(max-width: 760px)').matches) $('filters').classList.add('collapsed');
    $('f-toggle').onclick = function () { $('filters').classList.toggle('collapsed'); };
    $('reg-body').addEventListener('click', function (ev) {
      var cb = ev.target.getAttribute('data-check');
      if (cb) {
        if (ev.target.checked) state.reg.selected[cb] = 1; else delete state.reg.selected[cb];
        renderRegister();
        return;
      }
      if (ev.target.closest('td.c-check')) return;
      var tr = ev.target.closest('tr[data-id]');
      if (tr) location.hash = '#edit/' + encodeURIComponent(tr.getAttribute('data-id'));
    });
    $('reg-all').onchange = function () {
      var on = this.checked;
      filteredEntries().slice(0, state.reg.limit).forEach(function (e) {
        if (on) state.reg.selected[e.id] = 1; else delete state.reg.selected[e.id];
      });
      renderRegister();
    };
    $('reg-more-btn').onclick = function () { state.reg.limit += 500; renderRegister(); };
    $('reg-annex').onclick = function () {
      var ids = C.sortEntries(Object.keys(state.reg.selected).map(function (id) { return state.byId[id]; }).filter(Boolean)).map(function (e) { return e.id; });
      ids.forEach(function (id) { if (state.annex.indexOf(id) === -1) state.annex.push(id); });
      state.reg.selected = {};
      saveMeta('annex', state.annex);
      renderBadges();
      location.hash = '#annexure';
    };
    $('reg-chrono').onclick = function () {
      chronoState.source = 'filter';
      location.hash = '#chronology';
    };
  })();

  /* ---------- entry pickers ---------- */

  /**
   * opts: {multi, onChange(ids), onPick(id) (instant mode, no chips), exclude() → ids to hide, placeholder}
   */
  function makePicker(container, opts) {
    var ids = [];
    container.innerHTML = '<div class="chips"><input type="text" placeholder="' + h(opts.placeholder || 'खोजकर चुनें — पत्रांक / विषय / दिनांक … / Search and pick') + '"></div><div class="picker-results" hidden></div>';
    var chips = container.querySelector('.chips');
    var input = chips.querySelector('input');
    var results = container.querySelector('.picker-results');
    var current = [], active = 0;

    function renderChips() {
      chips.querySelectorAll('.chip').forEach(function (c) { c.remove(); });
      ids.forEach(function (id) {
        var e = state.byId[id];
        var span = document.createElement('span');
        span.className = 'chip';
        span.innerHTML = '<a href="#edit/' + encodeURIComponent(id) + '">' + h(e ? truncate(entryLabel(e), 80) : 'हटाई गई प्रविष्टि') + '</a><button type="button" aria-label="हटाएँ / Remove">×</button>';
        span.querySelector('button').onclick = function () {
          ids = ids.filter(function (x) { return x !== id; });
          renderChips();
          if (opts.onChange) opts.onChange(ids.slice());
        };
        chips.insertBefore(span, input);
      });
      input.hidden = !opts.multi && ids.length > 0;
    }

    function search() {
      var q = input.value;
      if (!q.trim()) { close(); return; }
      var ex = {};
      (opts.exclude ? opts.exclude() : []).concat(ids).forEach(function (id) { ex[id] = 1; });
      current = C.sortEntries(C.filterEntries(state.entries, { q: q }), true).filter(function (e) { return !ex[e.id]; }).slice(0, 10);
      active = 0;
      results.innerHTML = current.length ? current.map(function (e, i) {
        return '<div data-i="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + h(entryLabel(e)) + '</div>';
      }).join('') : '<div class="muted">कुछ नहीं मिला / Nothing found</div>';
      results.hidden = false;
    }

    function close() { results.hidden = true; current = []; }

    function pick(i) {
      var e = current[i];
      if (!e) return;
      input.value = '';
      close();
      if (opts.onPick) { opts.onPick(e.id); return; }
      ids.push(e.id);
      renderChips();
      if (opts.onChange) opts.onChange(ids.slice());
      if (opts.multi) input.focus();
    }

    input.addEventListener('input', search);
    input.addEventListener('keydown', function (ev) {
      if (results.hidden || !current.length) {
        if (ev.key === 'Escape') close();
        return;
      }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        active = (active + (ev.key === 'ArrowDown' ? 1 : current.length - 1)) % current.length;
        results.querySelectorAll('div[data-i]').forEach(function (d, i) { d.classList.toggle('on', i === active); });
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        pick(active);
      } else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 200); });
    results.addEventListener('mousedown', function (ev) {
      var d = ev.target.closest('div[data-i]');
      if (d) { ev.preventDefault(); pick(+d.getAttribute('data-i')); }
    });

    return {
      input: input,
      get: function () { return ids.slice(); },
      set: function (list) { ids = (list || []).filter(Boolean).slice(); input.value = ''; close(); renderChips(); },
      isOpen: function () { return !results.hidden && current.length > 0; }
    };
  }

  /* ---------- add / edit form ---------- */

  var form = $('entry-form');
  var refPicker = makePicker($('ref-picker'), {
    multi: true,
    exclude: function () { return state.form.editingId ? [state.form.editingId] : []; },
    onChange: function () { state.form.dirty = true; }
  });
  var replyPicker = makePicker($('reply-picker'), {
    multi: false,
    placeholder: 'उत्तर वाला पत्र खोजें / Search the reply entry',
    exclude: function () { return state.form.editingId ? [state.form.editingId] : []; },
    onChange: function (ids) {
      state.form.dirty = true;
      if (ids.length && form.elements.status.value === 'pending') {
        form.elements.status.value = 'replied';
        toast('स्थिति "उत्तर दिया" की गई / Status set to Replied');
      }
    }
  });
  fillSelect(form.elements.status, statusOptions(false), 'pending');

  function renderMatterChips() {
    var box = $('matter-chips');
    var input = $('matter-input');
    box.querySelectorAll('.chip').forEach(function (c) { c.remove(); });
    state.form.matters.forEach(function (m) {
      var span = document.createElement('span');
      span.className = 'chip';
      span.innerHTML = h(m) + '<button type="button" aria-label="हटाएँ / Remove">×</button>';
      span.querySelector('button').onclick = function () {
        state.form.matters = state.form.matters.filter(function (x) { return x !== m; });
        state.form.dirty = true;
        renderMatterChips();
      };
      box.insertBefore(span, input);
    });
  }

  function addMatterFromInput() {
    var input = $('matter-input');
    var parts = input.value.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var added = false;
    parts.forEach(function (v) {
      if (state.form.matters.indexOf(v) === -1) { state.form.matters.push(v); added = true; }
    });
    input.value = '';
    if (added) { state.form.dirty = true; renderMatterChips(); }
    return parts.length > 0;
  }

  $('matter-input').addEventListener('change', function () {
    // picking from the autocomplete list adds the tag directly
    var v = this.value.trim();
    if (v && C.allMatters(state.entries).some(function (m) { return m.name === v; })) addMatterFromInput();
  });
  $('matter-input').addEventListener('blur', addMatterFromInput);

  function updateReceivedLabel() {
    var t = form.elements.type.value;
    $('recv-label').innerHTML = t === 'out' ? 'प्रेषण तिथि <small>Dispatch date</small>' :
      t === 'event' ? 'अन्य तिथि <small>Other date (optional)</small>' : 'प्राप्ति तिथि <small>Received date</small>';
  }

  function defaultStatusFor(type) { return type === 'in' ? 'pending' : 'info'; }

  form.querySelectorAll('input[name=type]').forEach(function (r) {
    r.addEventListener('change', function () {
      updateReceivedLabel();
      if (!state.form.statusTouched && !state.form.editingId) form.elements.status.value = defaultStatusFor(form.elements.type.value);
    });
  });
  form.elements.status.addEventListener('change', function () { state.form.statusTouched = true; });
  form.addEventListener('input', function () { state.form.dirty = true; });

  /** Turn typed digits like 12082026 into 12.08.2026 and show how the date was understood. */
  function checkDateField(input) {
    var name = input.name;
    var hint = form.querySelector('[data-hint="' + name + '"]');
    var v = input.value.trim();
    var digits = C.toAsciiDigits(v);
    if (/^\d{8}$/.test(digits)) v = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    if (!v) { input.classList.remove('invalid'); hint.textContent = ''; hint.classList.remove('err'); return true; }
    var p = C.parseDate(v);
    var needDay = input.getAttribute('data-date') === 'day';
    var ok = !!p && (!needDay || p.precision === 'day');
    input.classList.toggle('invalid', !ok);
    hint.classList.toggle('err', !ok);
    if (ok) {
      input.value = C.formatDate(p);
      var weekday = p.precision === 'day' ? new Date(p.y, p.m - 1, p.d).toLocaleDateString('hi-IN', { weekday: 'long' }) : '';
      hint.textContent = '✓ ' + C.displayDate(input.value) + (weekday ? ' (' + weekday + ')' : '');
    } else {
      hint.textContent = needDay ? 'पूरा दिनांक DD.MM.YYYY लिखें / Enter a full date DD.MM.YYYY' : 'दिनांक समझ नहीं आया — DD.MM.YYYY, MM.YYYY या YYYY / Date not understood';
    }
    return ok;
  }

  form.querySelectorAll('input[data-date]').forEach(function (inp) {
    inp.addEventListener('blur', function () { checkDateField(inp); });
  });
  ['f-dfrom', 'f-dto', 'ch-dfrom', 'ch-dto'].forEach(function (id) {
    $(id).addEventListener('blur', function () {
      var p = C.parseDate(this.value);
      if (p) this.value = C.formatDate(p);
    });
  });

  function setFormValues(e) {
    var el = form.elements;
    form.querySelector('input[name=type][value="' + e.type + '"]').checked = true;
    ['letterNo', 'date', 'receivedDate', 'from', 'to', 'subject', 'refsText', 'summary', 'action', 'dueDate', 'fileLocation', 'remarks'].forEach(function (f) {
      el[f].value = e[f] || '';
    });
    el.status.value = e.status;
    state.form.matters = (e.matters || []).slice();
    renderMatterChips();
    refPicker.set(e.refIds || []);
    replyPicker.set(e.replyId ? [e.replyId] : []);
    form.querySelectorAll('input[data-date]').forEach(function (inp) {
      if (inp.value) checkDateField(inp);
      else { inp.classList.remove('invalid'); form.querySelector('[data-hint="' + inp.name + '"]').textContent = ''; }
    });
    updateReceivedLabel();
    autoGrow();
  }

  function resetForm(keep) {
    keep = keep || {};
    state.form.editingId = null;
    state.form.statusTouched = false;
    var type = keep.type || 'in';
    setFormValues(C.sanitizeEntry({ type: type, matters: keep.matters || [], status: defaultStatusFor(type) }));
    state.form.dirty = false;
    $('form-title').textContent = 'नया पत्र / New entry';
    $('btn-delete').hidden = true;
    $('btn-duplicate').hidden = true;
    $('form-relations').hidden = true;
  }

  function loadForm(e) {
    state.form.editingId = e.id;
    state.form.statusTouched = true;
    setFormValues(e);
    state.form.dirty = false;
    $('form-title').textContent = 'प्रविष्टि देखें / बदलें — Edit entry' + (e.sample ? ' (नमूना / SAMPLE)' : '');
    $('btn-delete').hidden = false;
    $('btn-duplicate').hidden = false;
    renderRelations();
  }

  function renderRelations() {
    var id = state.form.editingId;
    var box = $('form-relations');
    if (!id || !state.byId[id]) { box.hidden = true; return; }
    var e = state.byId[id];
    var lines = [];
    var repliedTo = state.entries.filter(function (x) { return x.replyId === id; });
    if (repliedTo.length) lines.push('<b>इसके उत्तर में / In reply to:</b> ' + repliedTo.map(entryLink).join('; '));
    if (e.replyId) lines.push('<b>उत्तर / Reply:</b> ' + entryLink(state.byId[e.replyId]));
    if (e.refIds.length) lines.push('<b>प्रसंग / References:</b> ' + e.refIds.map(function (r) { return entryLink(state.byId[r]); }).join('; '));
    var refBy = state.entries.filter(function (x) { return x.refIds.indexOf(id) !== -1; });
    if (refBy.length) lines.push('<b>जिनमें इसका प्रसंग है / Referred to by:</b> ' + refBy.map(entryLink).join('; '));
    lines.push('<span class="muted small">बनाया / Created ' + h(formatIso(e.createdAt)) + ' · बदला / Updated ' + h(formatIso(e.updatedAt)) + '</span>');
    box.innerHTML = lines.join('<br>');
    box.hidden = false;
  }

  function readForm() {
    var el = form.elements;
    addMatterFromInput();
    var e = {
      type: el.type.value,
      status: el.status.value,
      matters: state.form.matters.slice(),
      refIds: refPicker.get(),
      replyId: replyPicker.get()[0] || ''
    };
    ['letterNo', 'date', 'receivedDate', 'from', 'to', 'subject', 'refsText', 'summary', 'action', 'dueDate', 'fileLocation', 'remarks'].forEach(function (f) {
      e[f] = el[f].value;
    });
    return e;
  }

  function validateForm() {
    var el = form.elements;
    var ok = true;
    form.querySelectorAll('input[data-date]').forEach(function (inp) { if (!checkDateField(inp)) ok = false; });
    if (!ok) { toast('दिनांक ठीक करें / Please correct the date', 3500); form.querySelector('input.invalid').focus(); return false; }
    if (!el.date.value.trim()) {
      toast('दिनांक लिखें (पता न हो तो केवल वर्ष) / Enter the date (year only if unknown)', 4000);
      el.date.focus();
      el.date.classList.add('invalid');
      return false;
    }
    if (!el.letterNo.value.trim() && !el.subject.value.trim()) {
      toast('पत्रांक या विषय लिखें / Enter a letter no. or subject', 3500);
      el.letterNo.focus();
      return false;
    }
    return true;
  }

  function saveForm(andNew) {
    if (!validateForm()) return;
    var data = readForm();
    var now = new Date().toISOString();
    var old = state.form.editingId ? state.byId[state.form.editingId] : null;
    var entry = C.sanitizeEntry(Object.assign({}, old || {}, data, {
      id: old ? old.id : C.newId(),
      createdAt: old ? old.createdAt : now,
      updatedAt: now
    }));
    var changed = [entry];
    // linking a reply: make sure the reply knows it belongs to the same matter
    commit(changed).then(function () {
      toast(old ? 'बदलाव सहेजे गए / Changes saved' : 'सहेजा गया / Saved');
    });
    state.form.dirty = false;
    if (andNew) {
      resetForm({ type: entry.type, matters: entry.matters });
      if (location.hash !== '#add') history.replaceState(null, '', '#add');
      route();
    } else if (old) {
      loadForm(entry);
    } else {
      location.hash = '#edit/' + encodeURIComponent(entry.id);
    }
  }

  form.addEventListener('submit', function (ev) { ev.preventDefault(); saveForm(false); });
  $('btn-save-new').onclick = function () { saveForm(true); };
  $('btn-cancel').onclick = function () {
    var go = function () { state.form.dirty = false; resetForm(); location.hash = '#register'; };
    if (state.form.dirty) confirmBox('बदलाव छोड़ें? / Discard changes?', '<p>बिना सहेजे बदलाव हट जाएँगे। / Unsaved changes will be lost.</p>', 'छोड़ें / Discard', true).then(function (y) { if (y) go(); });
    else go();
  };
  $('btn-duplicate').onclick = function () {
    var data = readForm();
    data.replyId = '';
    data.status = defaultStatusFor(data.type);
    state.form.editingId = null;
    setFormValues(C.sanitizeEntry(data));
    state.form.dirty = true;
    state.form.statusTouched = false;
    $('form-title').textContent = 'नया पत्र (प्रतिलिपि से) / New entry (duplicate)';
    $('btn-delete').hidden = true;
    $('btn-duplicate').hidden = true;
    $('form-relations').hidden = true;
    history.replaceState(null, '', '#add');
    currentScreen = 'add';
    form.elements.letterNo.focus();
    form.elements.letterNo.select();
    toast('प्रतिलिपि बनी — पत्रांक/दिनांक बदलकर सहेजें / Duplicated — change letter no./date and save', 3500);
  };
  $('btn-delete').onclick = function () {
    var e = state.byId[state.form.editingId];
    if (!e) return;
    confirmBox('प्रविष्टि हटाएँ? / Delete entry?', '<p>' + h(entryLabel(e)) + '</p><p class="muted">यह वापस नहीं होगा (बैकअप से ही मिलेगा)। / This cannot be undone except from a backup.</p>', 'हटाएँ / Delete', true)
      .then(function (y) {
        if (!y) return;
        commit([], [e.id]);
        state.form.dirty = false;
        resetForm();
        toast('हटाया गया / Deleted');
        location.hash = '#register';
      });
  };

  /* keyboard: Enter → next field, Shift+Enter → new line in text areas, Ctrl+S / Ctrl+Enter → save */
  function focusables() {
    return Array.prototype.filter.call(form.querySelectorAll('input, select, textarea'), function (x) {
      if (x.disabled || x.hidden || x.offsetParent === null) return false;
      if (x.type === 'radio') return x.checked;
      return true;
    });
  }

  form.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S' || ev.key === 'Enter')) {
      ev.preventDefault();
      saveForm(false);
      return;
    }
    if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
    var t = ev.target;
    if (t.tagName === 'BUTTON') return;
    if (t.id === 'matter-input' && t.value.trim()) { ev.preventDefault(); addMatterFromInput(); return; }
    ev.preventDefault();
    var list = focusables();
    var i = list.indexOf(t);
    if (i === -1) return;
    if (t.getAttribute('data-date')) checkDateField(t);
    if (i === list.length - 1) { saveForm(false); return; }
    list[i + 1].focus();
    if (list[i + 1].select && list[i + 1].type !== 'radio') list[i + 1].select();
  });

  function autoGrow() {
    form.querySelectorAll('textarea').forEach(function (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight + 2, 400) + 'px';
    });
  }
  form.addEventListener('input', function (ev) { if (ev.target.tagName === 'TEXTAREA') autoGrow(); });

  window.addEventListener('beforeunload', function (ev) {
    if (state.form.dirty && currentScreen === 'add') { ev.preventDefault(); ev.returnValue = ''; }
  });

  /* ---------- pending ---------- */

  function renderPending() {
    var g = C.pendingGroups(state.entries);
    var item = function (e, cls) {
      var d = C.daysUntil(e.dueDate);
      var due = '';
      if (d !== null) {
        due = d < 0 ? (-d) + ' दिन विलंब / ' + (-d) + ' days overdue' : d === 0 ? 'आज / Today' : d + ' दिन शेष / ' + d + ' days left';
        due = 'समय-सीमा ' + h(e.dueDate) + ' — ' + due;
      } else due = 'समय-सीमा नहीं / No due date';
      return '<div class="pitem ' + cls + '" data-id="' + h(e.id) + '">' +
        '<div class="pmain" data-open="' + h(e.id) + '"><div class="due">' + due + '</div>' +
        '<div>' + typePill(e.type) + ' <b>' + h(e.letterNo || '—') + '</b> दि. ' + h(C.displayDate(e.date)) + ' — ' + h(e.subject) + '</div>' +
        (e.action ? '<div>कार्रवाई / Action: ' + h(e.action) + '</div>' : '') +
        '<div class="muted small">' + h(C.fromToText(e)) + (e.matters.length ? ' · ' + h(e.matters.join(', ')) : '') + '</div></div>' +
        '<div class="actions" style="margin:0"><button type="button" class="secondary tiny" data-status="replied">✓ उत्तर दिया / Replied</button>' +
        '<button type="button" class="secondary tiny" data-status="closed">बंद / Close</button></div></div>';
    };
    var sec = function (title, list, cls, emptyTxt) {
      return '<div class="pgroup"><h3>' + title + ' (' + list.length + ')</h3>' +
        (list.length ? list.map(function (e) { return item(e, cls); }).join('') : '<p class="muted">' + emptyTxt + '</p>') + '</div>';
    };
    $('pending-list').innerHTML =
      sec('⚠ समय-सीमा पार <small>Overdue</small>', g.overdue, 'overdue', 'कोई नहीं / None') +
      sec('7 दिनों में देय <small>Due within 7 days</small>', g.soon, 'soon', 'कोई नहीं / None') +
      sec('अन्य लंबित <small>Other pending</small>', g.later, '', 'कोई नहीं / None');
  }

  $('pending-list').addEventListener('click', function (ev) {
    var st = ev.target.getAttribute('data-status');
    var box = ev.target.closest('.pitem');
    if (st && box) {
      var e = state.byId[box.getAttribute('data-id')];
      commit([Object.assign({}, e, { status: st, updatedAt: new Date().toISOString() })]);
      toast('स्थिति: ' + C.statusLabel(st));
      return;
    }
    var open = ev.target.closest('[data-open]');
    if (open) location.hash = '#edit/' + encodeURIComponent(open.getAttribute('data-open'));
  });

  /* ---------- chronology ---------- */

  var chronoState = { source: 'matter', titleEdited: false };

  function renderChronologyForm() {
    $('ch-source').value = chronoState.source;
    $('ch-matter-wrap').hidden = chronoState.source !== 'matter';
    var cur = $('ch-matter').value;
    var opts = matterOptions('— मामला चुनें / Choose a matter —');
    fillSelect($('ch-matter'), opts, cur || (state.reg.filters.matter || ''));
    if (!$('ch-office').value) $('ch-office').value = state.settings.officeLine;
    $('ch-cols').innerHTML = C.CHRONO_COLUMNS.map(function (c) {
      return '<label><input type="checkbox" value="' + c.key + '"' + (state.settings.chronoCols.indexOf(c.key) !== -1 ? ' checked' : '') + '> ' + h(c.label) + '</label>';
    }).join('');
    $('ch-summary').checked = state.settings.includeSummary !== false;
    document.querySelector('input[name=ch-orient][value="' + (state.settings.orientation || 'portrait') + '"]').checked = true;
    if (!chronoState.titleEdited) $('ch-title').value = defaultChronoTitle();
  }

  function defaultChronoTitle() {
    if (chronoState.source === 'matter') return $('ch-matter').value || '';
    var f = state.reg.filters;
    return f.matter || f.q || 'चयनित पत्र';
  }

  function chronoData() {
    var opts = {
      dateFrom: $('ch-dfrom').value,
      dateTo: $('ch-dto').value,
      includeSummary: $('ch-summary').checked,
      columns: state.settings.chronoCols,
      title: $('ch-title').value.trim()
    };
    if (chronoState.source === 'matter') {
      opts.matter = $('ch-matter').value;
      if (!opts.matter) return null;
    } else {
      opts.ids = C.filterEntries(state.entries, state.reg.filters).map(function (e) { return e.id; });
    }
    return C.buildChronology(state.entries, opts);
  }

  var COL_WIDTHS = { sn: 6, date: 14, letterNo: 15, fromTo: 21, subject: 31, remarks: 13 };

  function chronoHtml(ch, forClipboard) {
    var font = "font-family:'Nirmala UI',Mangal,'Noto Sans Devanagari',sans-serif;";
    var cellStyle = forClipboard ? ' style="border:1px solid #000;padding:3px 5px;vertical-align:top;' + font + 'font-size:11pt"' : '';
    var office = $('ch-office').value.trim();
    var html = '<div class="doc"' + (forClipboard ? ' style="' + font + '"' : '') + '>';
    if (office) html += '<p class="office"' + (forClipboard ? ' style="text-align:center;font-weight:bold;' + font + '"' : '') + '>' + h(office) + '</p>';
    html += '<p class="title"' + (forClipboard ? ' style="text-align:center;font-weight:bold;font-size:13pt;' + font + '"' : '') + '>' + h(ch.title) + '</p>';
    html += '<table' + (forClipboard ? ' style="border-collapse:collapse;width:100%" border="1" cellspacing="0" cellpadding="4"' : '') + '><thead><tr>' +
      ch.columns.map(function (c) { return '<th' + (forClipboard ? ' style="border:1px solid #000;padding:3px 5px;background:#eee;' + font + 'font-size:11pt"' : '') + ' width="' + COL_WIDTHS[c.key] + '%">' + h(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    html += ch.rows.map(function (r) {
      return '<tr>' + r.cells.map(function (v, i) {
        return '<td class="' + ch.columns[i].key + '"' + cellStyle + '>' + hbr(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    if (!ch.rows.length) html += '<tr><td colspan="' + ch.columns.length + '" style="text-align:center">कोई प्रविष्टि नहीं / No entries</td></tr>';
    return html + '</tbody></table></div>';
  }

  function renderChronology() {
    var ch = chronoData();
    $('ch-preview').innerHTML = ch ? chronoHtml(ch) : '<p class="muted">मामला चुनें या स्रोत "वर्तमान खोज/फ़िल्टर" रखें। / Choose a matter, or use the current search/filter result.</p>';
  }

  (function wireChronology() {
    $('ch-source').onchange = function () { chronoState.source = this.value; chronoState.titleEdited = false; renderChronologyForm(); renderChronology(); };
    $('ch-matter').onchange = function () { chronoState.titleEdited = false; $('ch-title').value = defaultChronoTitle(); renderChronology(); };
    $('ch-title').oninput = function () { chronoState.titleEdited = true; renderChronology(); };
    $('ch-office').oninput = renderChronology;
    $('ch-office').onchange = function () { state.settings.officeLine = this.value; saveSettings(); };
    ['ch-dfrom', 'ch-dto'].forEach(function (id) { $(id).addEventListener('change', renderChronology); });
    $('ch-cols').addEventListener('change', function () {
      state.settings.chronoCols = Array.prototype.map.call($('ch-cols').querySelectorAll('input:checked'), function (x) { return x.value; });
      if (!state.settings.chronoCols.length) state.settings.chronoCols = ['sn', 'date', 'subject'];
      saveSettings();
      renderChronology();
    });
    $('ch-summary').onchange = function () { state.settings.includeSummary = this.checked; saveSettings(); renderChronology(); };
    document.querySelectorAll('input[name=ch-orient]').forEach(function (r) {
      r.onchange = function () { state.settings.orientation = this.value; saveSettings(); };
    });
    var need = function () {
      var ch = chronoData();
      if (!ch) toast('पहले मामला चुनें / Choose a matter first');
      return ch;
    };
    // ASCII file names: some browsers replace Hindi download names with "download"
    var fileBase = function () { return 'chronology-' + isoToday(); };
    $('ch-print').onclick = function () {
      var ch = need();
      if (ch) printHtml(chronoHtml(ch), state.settings.orientation === 'landscape');
    };
    $('ch-docx').onclick = function () {
      var ch = need();
      if (!ch) return;
      var blocks = [];
      var office = $('ch-office').value.trim();
      if (office) blocks.push({ type: 'p', text: office, bold: true, align: 'center', size: 24, after: 60 });
      blocks.push({ type: 'p', text: ch.title, bold: true, align: 'center', size: 26, after: 200 });
      blocks.push({
        type: 'table', size: 20,
        headers: ch.columns.map(function (c) { return c.label; }),
        rows: ch.rows.map(function (r) { return r.cells; }),
        widths: ch.columns.map(function (c) { return COL_WIDTHS[c.key]; })
      });
      var bytes = window.LRDocx.buildDocx(blocks, { landscape: state.settings.orientation === 'landscape', title: ch.title });
      download(fileBase(ch) + '.docx', bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    };
    $('ch-xlsx').onclick = function () {
      var ch = need();
      if (!ch) return;
      var office = $('ch-office').value.trim();
      var aoa = [];
      if (office) aoa.push([office]);
      aoa.push([ch.title], []);
      aoa.push(ch.columns.map(function (c) { return c.label; }));
      ch.rows.forEach(function (r) { aoa.push(r.cells); });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var n = ch.columns.length - 1;
      ws['!merges'] = (office ? [0, 1] : [0]).map(function (r) { return { s: { r: r, c: 0 }, e: { r: r, c: n } }; });
      ws['!cols'] = ch.columns.map(function (c) { return { wch: Math.max(8, COL_WIDTHS[c.key] * 1.6) }; });
      writeXlsx(ws, 'घटनाक्रम', fileBase(ch) + '.xlsx');
    };
    $('ch-copy').onclick = function () {
      var ch = need();
      if (!ch) return;
      var text = [ch.title, ch.columns.map(function (c) { return c.label; }).join('\t')].concat(ch.rows.map(function (r) {
        return r.cells.map(function (c) { return String(c).replace(/\s*\n\s*/g, ' '); }).join('\t');
      })).join('\n');
      copyRich(chronoHtml(ch, true), text);
    };
  })();

  function writeXlsx(ws, sheetName, fileName) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(fileName, new Uint8Array(out), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function printHtml(html, landscape) {
    var area = $('print-area');
    area.innerHTML = html;
    var st = $('page-style');
    if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); }
    st.textContent = '@page { size: A4 ' + (landscape ? 'landscape' : 'portrait') + '; margin: 14mm 12mm; }';
    setTimeout(function () { window.print(); }, 50);
  }

  function copyRich(html, text) {
    var fallback = function () {
      var div = document.createElement('div');
      div.contentEditable = 'true';
      div.style.position = 'fixed';
      div.style.left = '-9999px';
      div.innerHTML = html;
      document.body.appendChild(div);
      var range = document.createRange();
      range.selectNodeContents(div);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      sel.removeAllRanges();
      div.remove();
      toast(ok ? 'कॉपी हो गया — Word में Ctrl+V करें / Copied — paste into Word' : 'कॉपी नहीं हो सका / Copy failed');
    };
    if (navigator.clipboard && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(function () {
        toast('कॉपी हो गया — Word में Ctrl+V करें / Copied — paste into Word');
      }, fallback);
    } else fallback();
  }

  /* ---------- annexure ---------- */

  var annexPicker = makePicker($('annex-picker'), {
    multi: true,
    placeholder: 'पत्र खोजकर जोड़ें / Search and add an entry',
    exclude: function () { return state.annex; },
    onPick: function (id) {
      state.annex.push(id);
      saveMeta('annex', state.annex);
      renderAnnex();
      renderBadges();
    }
  });

  function annexEntries() { return state.annex.map(function (id) { return state.byId[id]; }).filter(Boolean); }

  function annexStart() { return Math.max(1, parseInt($('annex-start').value, 10) || 1); }

  function annexHtml(forClipboard) {
    var lines = C.annexureLines(annexEntries(), annexStart());
    var font = forClipboard ? ' style="font-family:\'Nirmala UI\',Mangal,sans-serif;font-size:12pt"' : '';
    return '<div class="doc"' + font + '><p class="title"' + (forClipboard ? ' style="text-align:center;font-weight:bold"' : '') + '>अनुलग्नक सूची</p><ol>' +
      lines.map(function (l) { return '<li' + font + '>' + h(l) + '</li>'; }).join('') + '</ol></div>';
  }

  function renderAnnex() {
    var list = annexEntries();
    var lines = C.annexureLines(list, annexStart());
    $('annex-items').innerHTML = list.length ? list.map(function (e, i) {
      return '<li data-i="' + i + '"><span>' + h(lines[i]) + '</span>' +
        '<button type="button" class="secondary tiny" data-move="-1" title="ऊपर / Up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="secondary tiny" data-move="1" title="नीचे / Down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="danger tiny" data-remove="1" title="हटाएँ / Remove">×</button></li>';
    }).join('') : '<li class="muted">सूची खाली है / The list is empty</li>';
    $('annex-preview').innerHTML = annexHtml(false);
  }

  (function wireAnnex() {
    $('annex-items').addEventListener('click', function (ev) {
      var li = ev.target.closest('li[data-i]');
      if (!li) return;
      var i = +li.getAttribute('data-i');
      var ids = annexEntries().map(function (e) { return e.id; });
      if (ev.target.getAttribute('data-remove')) ids.splice(i, 1);
      var mv = +ev.target.getAttribute('data-move');
      if (mv) { var j = i + mv; var t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
      state.annex = ids;
      saveMeta('annex', state.annex);
      renderAnnex();
      renderBadges();
    });
    $('annex-start').oninput = renderAnnex;
    $('annex-sort').onclick = function () {
      state.annex = C.sortEntries(annexEntries()).map(function (e) { return e.id; });
      saveMeta('annex', state.annex);
      renderAnnex();
    };
    $('annex-clear').onclick = function () {
      state.annex = [];
      saveMeta('annex', state.annex);
      renderAnnex();
      renderBadges();
    };
    $('annex-copy').onclick = function () {
      var lines = C.annexureLines(annexEntries(), annexStart());
      if (!lines.length) { toast('सूची खाली है / The list is empty'); return; }
      copyRich(annexHtml(true), lines.join('\n'));
    };
    $('annex-print').onclick = function () {
      if (!state.annex.length) { toast('सूची खाली है / The list is empty'); return; }
      printHtml(annexHtml(false), false);
    };
    $('annex-docx').onclick = function () {
      var lines = C.annexureLines(annexEntries(), annexStart());
      if (!lines.length) { toast('सूची खाली है / The list is empty'); return; }
      var blocks = [{ type: 'p', text: 'अनुलग्नक सूची', bold: true, align: 'center', size: 26, after: 200 }]
        .concat(lines.map(function (l) { return { type: 'p', text: l, size: 24, after: 120 }; }));
      download('annexure-list-' + isoToday() + '.docx', window.LRDocx.buildDocx(blocks, { title: 'अनुलग्नक सूची' }),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    };
  })();

  /* ---------- import ---------- */

  var imp = { workbook: null, rows: [], mapping: [], result: null };

  function importRowsFromSheet() {
    var name = $('imp-sheet').value;
    var ws = imp.workbook.Sheets[name];
    imp.rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  }

  function importSetup() {
    var hasHeader = $('imp-header').value === '1';
    var width = imp.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    var headers = [];
    for (var c = 0; c < width; c++) headers.push(hasHeader ? String((imp.rows[0] || [])[c] || '') : '');
    imp.mapping = hasHeader ? C.guessMapping(headers) : headers.map(function () { return ''; });
    var fieldOpts = [['', '— छोड़ें / Skip —']].concat(C.IMPORT_FIELDS.map(function (f) { return [f.key, f.label]; }));
    var sample = imp.rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 3);
    var html = '<thead><tr><th>स्तम्भ / Column</th>' + headers.map(function (hd, i) { return '<th>' + h(hd || 'स्तम्भ ' + (i + 1)) + '</th>'; }).join('') + '</tr>' +
      '<tr><th>किस खाने में / Goes to</th>' + headers.map(function (hd, i) {
        return '<th><select data-col="' + i + '">' + fieldOpts.map(function (o) {
          return '<option value="' + o[0] + '"' + (imp.mapping[i] === o[0] ? ' selected' : '') + '>' + h(o[1]) + '</option>';
        }).join('') + '</select></th>';
      }).join('') + '</tr></thead><tbody>' +
      sample.map(function (r) { return '<tr><td class="muted">उदाहरण / sample</td>' + headers.map(function (hd, i) { return '<td>' + h(truncate(cellText(r[i]), 60)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
    $('imp-map').innerHTML = html;
    $('imp-step2').hidden = false;
    importPreview();
  }

  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) return v + ' (' + C.formatDate(C.parseDate(v)) + '?)';
    return String(v);
  }

  function importPreview() {
    imp.result = C.mapImportRows(imp.rows, imp.mapping, {
      hasHeader: $('imp-header').value === '1',
      defaultType: $('imp-deftype').value,
      extraMatter: $('imp-matter').value.trim()
    });
    var r = imp.result;
    var s = C.summarize(r.entries);
    var html = '<p><b>' + r.entries.length + '</b> प्रविष्टियाँ आयात होंगी / entries will be imported' +
      (s.first ? ' — ' + h(s.first) + ' से / to ' + h(s.last) : '') + '.</p>';
    if (!imp.mapping.some(Boolean)) html += '<p class="hint err">कम से कम एक स्तम्भ मिलाएँ / Match at least one column.</p>';
    if (r.problems.length) {
      html += '<div class="problems"><b>ध्यान दें / Please check (' + r.problems.length + '):</b><br>' +
        r.problems.slice(0, 100).map(function (p) { return 'पंक्ति / Row ' + p.row + ': ' + h(p.message); }).join('<br>') + '</div>';
    }
    html += '<div class="table-wrap" style="margin-top:8px"><table class="mapping"><thead><tr><th>दिनांक</th><th>प्रकार</th><th>पत्रांक</th><th>प्रेषक → प्राप्तकर्ता</th><th>विषय</th><th>मामला</th><th>स्थिति</th></tr></thead><tbody>' +
      r.entries.slice(0, 15).map(function (e) {
        return '<tr><td>' + h(C.displayDate(e.date) || '—') + '</td><td>' + h(C.TYPES[e.type].hi) + '</td><td>' + h(e.letterNo) + '</td><td>' + h(C.fromToText(e)) +
          '</td><td>' + h(truncate(e.subject, 80)) + '</td><td>' + h(e.matters.join(', ')) + '</td><td>' + h(C.STATUSES[e.status].hi) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (r.entries.length > 15 ? '<p class="muted small">पहली 15 पंक्तियाँ / first 15 rows shown</p>' : '');
    $('imp-preview').innerHTML = html;
    $('imp-go').disabled = !r.entries.length || !imp.mapping.some(Boolean);
  }

  (function wireImport() {
    fillSelect($('imp-deftype'), typeOptions(false), 'in');
    $('imp-file').onchange = function () {
      var file = this.files[0];
      if (!file) return;
      var isText = /\.(csv|txt)$/i.test(file.name);
      var reader = new FileReader();
      reader.onerror = function () { toast('फ़ाइल पढ़ी नहीं जा सकी / Could not read the file'); };
      reader.onload = function () {
        try {
          if (isText) {
            // own CSV parser: never lets a library turn 12/08/2026 into 8 December
            imp.workbook = null;
            imp.rows = C.parseCSV(reader.result);
            $('imp-sheet-wrap').hidden = true;
          } else {
            imp.workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: false });
            fillSelect($('imp-sheet'), imp.workbook.SheetNames.map(function (n) { return [n, n]; }), imp.workbook.SheetNames[0]);
            $('imp-sheet-wrap').hidden = imp.workbook.SheetNames.length < 2;
            importRowsFromSheet();
          }
          if (!imp.rows.length) { toast('फ़ाइल खाली है / The file is empty'); return; }
          importSetup();
        } catch (err) {
          console.error(err);
          toast('यह फ़ाइल पढ़ी नहीं जा सकी / Could not read this file: ' + (err.message || err), 5000);
        }
      };
      if (isText) reader.readAsText(file, 'utf-8'); else reader.readAsArrayBuffer(file);
    };
    $('imp-sheet').onchange = function () { importRowsFromSheet(); importSetup(); };
    $('imp-header').onchange = importSetup;
    $('imp-deftype').onchange = importPreview;
    $('imp-matter').oninput = importPreview;
    $('imp-map').addEventListener('change', function (ev) {
      var col = ev.target.getAttribute('data-col');
      if (col === null) return;
      var v = ev.target.value;
      // one column per field: clear the field elsewhere
      if (v) imp.mapping = imp.mapping.map(function (m, i) { return m === v && i !== +col ? '' : m; });
      imp.mapping[+col] = v;
      $('imp-map').querySelectorAll('select[data-col]').forEach(function (s) { s.value = imp.mapping[+s.getAttribute('data-col')]; });
      importPreview();
    });
    $('imp-go').onclick = function () {
      var list = imp.result && imp.result.entries;
      if (!list || !list.length) return;
      confirmBox('आयात करें? / Import?', '<p>' + list.length + ' नई प्रविष्टियाँ पंजी में जोड़ी जाएँगी। / ' + list.length + ' new entries will be added.</p>', 'आयात करें / Import')
        .then(function (y) {
          if (!y) return;
          commit(list).then(function () { toast(list.length + ' प्रविष्टियाँ आयात हुईं / entries imported', 3500); });
          $('imp-file').value = '';
          $('imp-step2').hidden = true;
          imp = { workbook: null, rows: [], mapping: [], result: null };
          location.hash = '#register';
        });
    };
  })();

  /* ---------- backup, restore, export ---------- */

  function downloadBackup() {
    var text = C.serializeBackup(state.entries, state.settings);
    download('letter-register-backup-' + isoToday() + '.json', text, 'application/json');
    state.lastBackup = new Date().toISOString();
    saveMeta('lastBackup', state.lastBackup);
    renderBanners();
    if (currentScreen === 'data') renderData();
    toast('बैकअप फ़ाइल डाउनलोड हुई — इसे सुरक्षित रखें / Backup downloaded — keep it safe', 3500);
  }

  function summaryTable(cur, inc, incLabel) {
    var row = function (label, a, b) { return '<tr><th>' + label + '</th><td>' + h(a) + '</td><td>' + h(b) + '</td></tr>'; };
    return '<table><tr><th></th><th>अभी / Now</th><th>' + incLabel + '</th></tr>' +
      row('कुल / Total', cur.total, inc.total) +
      row('आवक / Incoming', cur.in, inc.in) +
      row('जावक / Outgoing', cur.out, inc.out) +
      row('घटना / Events', cur.event, inc.event) +
      row('मामले / Matters', cur.matters, inc.matters) +
      row('अवधि / Period', cur.first ? cur.first + ' – ' + cur.last : '—', inc.first ? inc.first + ' – ' + inc.last : '—') +
      '</table>';
  }

  /** Show what a backup contains and ask Replace / Merge / Cancel. */
  function restorePreview(parsed, sourceLabel) {
    var cur = C.summarize(state.entries);
    var inc = C.summarize(parsed.entries);
    var html = (parsed.exportedAt ? '<p>बैकअप की तिथि / Backup taken: <b>' + h(formatIso(parsed.exportedAt)) + '</b></p>' : '') +
      summaryTable(cur, inc, sourceLabel) +
      '<p><b>बदलें / Replace:</b> अभी की सभी ' + cur.total + ' प्रविष्टियाँ हटकर बैकअप की ' + inc.total + ' प्रविष्टियाँ आ जाएँगी। (पहले वर्तमान डेटा की सुरक्षा-प्रति अपने-आप डाउनलोड होगी।)<br>' +
      '<small>All ' + cur.total + ' current entries are replaced by the ' + inc.total + ' in the backup. A safety copy of the current data is downloaded first.</small></p>' +
      '<p><b>मिलाएँ / Merge:</b> बैकअप की नई प्रविष्टियाँ जुड़ेंगी, वर्तमान बनी रहेंगी। <small>Adds entries from the backup and keeps current ones (newer version wins).</small></p>';
    return dialog('पुनःस्थापना पूर्वावलोकन / Restore preview', html, [
      { label: 'बदलें / Replace all', value: 'replace', cls: 'danger' },
      { label: 'मिलाएँ / Merge', value: 'merge' },
      { label: 'रद्द / Cancel', value: 'cancel', cls: 'secondary' }
    ]);
  }

  function applyRestore(parsed, mode) {
    if (mode === 'replace') {
      if (state.entries.length) {
        download('letter-register-before-restore-' + isoToday() + '.json', C.serializeBackup(state.entries, state.settings), 'application/json');
      }
      if (parsed.settings && parsed.settings.officeLine) {
        state.settings = Object.assign({}, state.settings, parsed.settings);
        saveSettings();
        $('ch-office').value = state.settings.officeLine;
      }
      return replaceAllEntries(parsed.entries).then(function () {
        toast('पुनःस्थापना पूर्ण: ' + parsed.entries.length + ' प्रविष्टियाँ / Restored ' + parsed.entries.length + ' entries', 4000);
      });
    }
    if (mode === 'merge') {
      var m = C.mergeEntries(state.entries, parsed.entries);
      return replaceAllEntries(m.entries).then(function () {
        toast(m.added + ' जोड़ी, ' + m.updated + ' अद्यतन / ' + m.added + ' added, ' + m.updated + ' updated', 4000);
      });
    }
    return Promise.resolve();
  }

  $('btn-backup').onclick = downloadBackup;
  $('restore-file').onchange = function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    file.text().then(function (text) {
      var parsed = C.parseBackup(text);
      if (!parsed.ok) { dialog('त्रुटि / Error', '<p>' + h(parsed.error) + '</p>'); return; }
      restorePreview(parsed, 'बैकअप / Backup').then(function (mode) { return applyRestore(parsed, mode); });
    });
  };
  $('btn-xlsx').onclick = function () {
    var ws = XLSX.utils.aoa_to_sheet(C.exportRows(state.entries));
    ws['!cols'] = C.EXPORT_FIELDS.map(function (f) { return { wch: ['subject', 'summary', 'remarks', 'from', 'to'].indexOf(f.key) !== -1 ? 40 : 16 }; });
    writeXlsx(ws, 'पत्र पंजी', 'letter-register-' + isoToday() + '.xlsx');
  };
  $('btn-csv').onclick = function () {
    download('letter-register-' + isoToday() + '.csv', C.toCSV(C.exportRows(state.entries)), 'text/csv;charset=utf-8');
  };

  function loadSamples() {
    var have = {};
    state.entries.forEach(function (e) { have[e.id] = 1; });
    var samples = C.makeSamples().filter(function (e) { return !have[e.id]; });
    if (!samples.length) { toast('नमूना पहले से मौजूद है / Samples are already loaded'); return; }
    commit(samples).then(function () { toast(samples.length + ' नमूना प्रविष्टियाँ जोड़ी गईं / sample entries added'); });
    location.hash = '#register';
  }
  $('btn-samples').onclick = loadSamples;
  $('btn-unsamples').onclick = function () {
    var ids = state.entries.filter(function (e) { return e.sample; }).map(function (e) { return e.id; });
    if (!ids.length) { toast('कोई नमूना प्रविष्टि नहीं / No sample entries'); return; }
    confirmBox('नमूना हटाएँ? / Remove samples?', '<p>' + ids.length + ' नमूना प्रविष्टियाँ हटेंगी। आपकी अपनी प्रविष्टियाँ नहीं हटेंगी। / ' + ids.length + ' sample entries will be removed; your own entries stay.</p>', 'हटाएँ / Remove', true)
      .then(function (y) { if (y) { commit([], ids); toast('नमूना हटाए गए / Samples removed'); } });
  };

  /* ---------- data screen ---------- */

  function renderData() {
    var age = backupAgeDays();
    var txt = state.lastBackup ? 'अंतिम बैकअप / Last backup: <b>' + h(formatIso(state.lastBackup)) + '</b> (' + daysSince(state.lastBackup) + ' दिन पहले / days ago)' : 'अभी तक कोई बैकअप नहीं / No backup downloaded yet';
    if (state.lastFileSave) txt += '<br>फ़ाइल में अंतिम सहेजा / Last saved to file: ' + h(formatIso(state.lastFileSave));
    $('backup-status').innerHTML = txt + '<br>कुल प्रविष्टियाँ / Total entries: ' + state.entries.length;
    $('backup-status').style.color = age !== null && age >= 7 ? 'var(--danger)' : '';
    renderFileSync();
    renderMatters();
    $('set-office').value = state.settings.officeLine;
    if (navigator.storage && navigator.storage.estimate) {
      Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : false]).then(function (r) {
        $('storage-info').textContent = 'ब्राउज़र भंडारण उपयोग / Browser storage used: ' + Math.round((r[0].usage || 0) / 1024) + ' KB' +
          (r[1] ? ' · स्थायी / persistent ✓' : '');
      }).catch(function () {});
    }
  }

  $('set-office').onchange = function () {
    state.settings.officeLine = this.value.trim() || C.DEFAULT_OFFICE_LINE;
    $('ch-office').value = state.settings.officeLine;
    saveSettings();
    toast('सहेजा गया / Saved');
  };

  function renderFileSync() {
    var box = $('filesync');
    if (!FS.supported) {
      box.innerHTML = '<p class="muted">यह सुविधा PC पर Chrome या Edge में ही उपलब्ध है। इस ब्राउज़र में नियमित रूप से "बैकअप डाउनलोड करें" का प्रयोग करें।<br><small>Available only in Chrome or Edge on a PC. In this browser, use "Download backup" regularly.</small></p>';
      return;
    }
    if (!FS.handle) {
      box.innerHTML = '<p>एक JSON फ़ाइल चुनें (जैसे OneDrive फ़ोल्डर में)। हर बदलाव उसमें अपने-आप सहेजा जाएगा।<br><small class="muted">Pick a JSON file (for example in your OneDrive folder). Every change is saved to it automatically.</small></p>' +
        '<div class="actions"><button type="button" id="fs-new">नई डेटा फ़ाइल बनाएँ / Create data file</button>' +
        '<button type="button" class="secondary" id="fs-open">मौजूदा फ़ाइल खोलें / Open existing file</button></div>';
      $('fs-new').onclick = fsCreate;
      $('fs-open').onclick = fsOpen;
      return;
    }
    var st = FS.status === 'ok' ? '✓ जुड़ी हुई — हर बदलाव अपने-आप सहेजा जाता है / Connected — every change auto-saves' :
      FS.status === 'needs-permission' ? '⚠ अनुमति चाहिए / Permission needed' : '⚠ त्रुटि / Error: ' + h(FS.lastError);
    box.innerHTML = '<p>फ़ाइल / File: <b>' + h(FS.handle.name) + '</b><br>' + st + '</p>' +
      '<div class="actions">' + (FS.status === 'ok' ? '<button type="button" id="fs-save" class="secondary">अभी सहेजें / Save now</button>' : '<button type="button" id="fs-reconnect">फ़ाइल से जोड़ें / Reconnect</button>') +
      '<button type="button" class="secondary" id="fs-unlink">फ़ाइल से अलग करें / Stop using file</button></div>';
    if ($('fs-save')) $('fs-save').onclick = function () { writeFileNow().then(function (ok) { toast(ok ? 'फ़ाइल में सहेजा / Saved to file' : 'सहेजा नहीं जा सका / Could not save'); }); };
    if ($('fs-reconnect')) $('fs-reconnect').onclick = function () {
      FS.reconnect().then(function (ok) { if (ok) writeFileNow(); renderFileSync(); renderBanners(); });
    };
    $('fs-unlink').onclick = function () {
      FS.unlink().then(function () { renderFileSync(); renderBanners(); toast('फ़ाइल अलग की गई; डेटा ब्राउज़र में बना रहेगा / File unlinked; data stays in the browser'); });
    };
  }

  function fsCreate() {
    FS.createNew('letter-register-data.json').then(function () { return writeFileNow(); }).then(function () {
      renderFileSync();
      toast('डेटा फ़ाइल बनी — अब हर बदलाव उसमें सहेजा जाएगा / Data file created', 3500);
    }).catch(function (err) { if (err && err.name !== 'AbortError') toast(String(err.message || err), 5000); });
  }

  function fsOpen() {
    var picked;
    FS.pickExisting().then(function (r) {
      picked = r;
      var parsed = C.parseBackup(r.text || '{"entries":[]}');
      if (!parsed.ok) throw new Error(parsed.error);
      if (!parsed.entries.length) return 'overwrite';
      if (!state.entries.length) return applyRestore(parsed, 'replace').then(function () { return 'done'; });
      return restorePreview(parsed, 'फ़ाइल / File').then(function (mode) {
        if (mode === 'cancel' || !mode) return 'cancel';
        return applyRestore(parsed, mode).then(function () { return 'done'; });
      });
    }).then(function (res) {
      if (res === 'cancel' || !picked) return;
      return FS.link(picked.handle).then(function () { return writeFileNow(); }).then(function () {
        renderFileSync();
        renderBanners();
        toast('फ़ाइल जुड़ गई / File connected', 3000);
      });
    }).catch(function (err) { if (err && err.name !== 'AbortError') dialog('त्रुटि / Error', '<p>' + h(err.message || err) + '</p>'); });
  }

  function renderMatters() {
    var list = C.allMatters(state.entries);
    $('matters-list').innerHTML = list.length ? list.map(function (m, i) {
      return '<div class="mrow" data-i="' + i + '"><span class="name"><b>' + h(m.name) + '</b> <span class="muted">(' + m.count + ')</span></span>' +
        '<input data-rename="' + i + '" value="' + h(m.name) + '" style="max-width:280px">' +
        '<button type="button" class="secondary tiny" data-do="rename">नाम बदलें / Rename</button>' +
        '<button type="button" class="secondary tiny" data-do="chrono">घटनाक्रम</button>' +
        '<button type="button" class="danger tiny" data-do="remove">टैग हटाएँ / Remove tag</button></div>';
    }).join('') : '<p class="muted">अभी कोई मामला नहीं / No matters yet</p>';
    $('matters-list').onclick = function (ev) {
      var act = ev.target.getAttribute('data-do');
      var row = ev.target.closest('.mrow');
      if (!act || !row) return;
      var m = list[+row.getAttribute('data-i')];
      if (act === 'chrono') {
        chronoState.source = 'matter';
        chronoState.titleEdited = false;
        location.hash = '#chronology';
        setTimeout(function () { $('ch-matter').value = m.name; $('ch-title').value = m.name; renderChronology(); }, 0);
        return;
      }
      if (act === 'rename') {
        var nn = row.querySelector('input').value.trim();
        if (!nn || nn === m.name) return;
        var exists = list.some(function (x) { return x.name === nn; });
        confirmBox(exists ? 'मामले मिलाएँ? / Merge matters?' : 'नाम बदलें? / Rename?',
          '<p>"' + h(m.name) + '" → "' + h(nn) + '" (' + m.count + ' प्रविष्टियाँ / entries)' + (exists ? '<br>दोनों मामले एक हो जाएँगे। / The two matters will be merged.' : '') + '</p>')
          .then(function (y) { if (y) { commit(C.renameMatter(state.entries, m.name, nn)); toast('हो गया / Done'); } });
      }
      if (act === 'remove') {
        confirmBox('टैग हटाएँ? / Remove tag?', '<p>"' + h(m.name) + '" टैग ' + m.count + ' प्रविष्टियों से हटेगा। प्रविष्टियाँ नहीं हटेंगी। / The tag is removed from ' + m.count + ' entries; entries stay.</p>', 'हटाएँ / Remove', true)
          .then(function (y) { if (y) commit(C.renameMatter(state.entries, m.name, '')); });
      }
    };
  }

  /* ---------- start ---------- */

  function start() {
    var load = DB.getAll().then(function (list) {
      return Promise.all([DB.getMeta('settings'), DB.getMeta('lastBackup'), DB.getMeta('lastFileSave'), DB.getMeta('annex')]).then(function (m) {
        if (m[0]) state.settings = Object.assign(state.settings, m[0]);
        state.lastBackup = m[1] || '';
        state.lastFileSave = m[2] || '';
        state.annex = Array.isArray(m[3]) ? m[3] : [];
        setEntries((list || []).map(function (e) { return C.sanitizeEntry(e); }));
      });
    }).catch(function (err) {
      console.error(err);
      state.dbOk = false;
    });
    load.then(function () {
      if (state.dbOk) DB.persist();
      return state.dbOk ? FS.init() : null;
    }).then(function () {
      $('ch-office').value = state.settings.officeLine;
      resetForm();
      fillDatalists();
      renderBadges();
      renderBanners();
      window.addEventListener('hashchange', route);
      route();
    });
  }

  start();
})();
