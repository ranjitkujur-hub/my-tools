/* Letter Maker UI. Plain script, no build step; works from file:// too. */
(function () {
  'use strict';
  var M = window.LetterModel;
  var K = window.KrutiDev;
  var Store = window.LetterStore;

  var state = Store.load();
  if (!state.current) { state.current = M.newLetter(state.settings); state.currentDirty = false; }
  var letter = state.current;
  var lastField = null;
  var saveTimer = null;
  var installedKruti = [];

  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  function $all(sel, rootEl) { return Array.prototype.slice.call((rootEl || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function persist(now) {
    clearTimeout(saveTimer);
    var run = function () {
      state.current = letter;
      if (!Store.save(state)) toast('ब्राउज़र में सहेजा नहीं जा सका / Could not save in this browser');
    };
    if (now) run(); else saveTimer = setTimeout(run, 300);
  }

  // ------------------------------------------------------------ tabs
  function showTab(name) {
    $all('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $all('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    if (name === 'saved') renderSaved();
    if (name === 'editor') fitPreview();
  }
  $all('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  $all('.mobile-switch button').forEach(function (b) {
    b.addEventListener('click', function () {
      $all('.mobile-switch button').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('.editor-grid').classList.toggle('show-preview', b.dataset.pane === 'preview');
      fitPreview();
    });
  });

  // ------------------------------------------------------------ page style
  function applyPageStyle() {
    var s = state.settings;
    var m = s.margins;
    var rootStyle = document.documentElement.style;
    rootStyle.setProperty('--letter-size', Number(s.fontSize || 13) + 'pt');
    rootStyle.setProperty('--letter-lh', String(s.lineHeight || 1.5));
    rootStyle.setProperty('--m-top', m.top + 'mm');
    rootStyle.setProperty('--m-right', m.right + 'mm');
    rootStyle.setProperty('--m-bottom', m.bottom + 'mm');
    rootStyle.setProperty('--m-left', m.left + 'mm');
    rootStyle.setProperty('--kruti', "'" + String(s.krutiFont).replace(/'/g, '') + "', 'Kruti Dev 010', monospace");
    $('#page-style').textContent =
      '@page { size: A4; margin: ' + m.top + 'mm ' + m.right + 'mm ' + m.bottom + 'mm ' + m.left + 'mm; }';
  }

  // ------------------------------------------------------------ preview
  function blocksToHTML(blocks) {
    return blocks.map(function (b, idx) {
      var style = b.space ? ' style="margin-top:' + (b.space * 1.2).toFixed(2) + 'em"' : '';
      var keep = (b.keepNext || b.t === 'line' || (b.t === 'right' && !b.sign) || b.t === 'center') ? ' keep-next' : '';
      switch (b.t) {
        case 'center':
          return '<p class="b-center' + keep + '"' + style + '><span style="font-size:' + (b.size || 1) + 'em">' + esc(b.text) + '</span></p>';
        case 'numdate':
          return '<div class="b-numdate' + keep + '"' + style + '><span>' + esc(b.left) + '</span><span>' + esc(b.right) + '</span></div>';
        case 'line':
          return '<p class="b-line' + keep + '"' + style + '>' + esc(b.text) + '</p>';
        case 'indent':
          return '<div class="b-indent keep-next"' + style + '>' + b.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
        case 'labeled':
          return '<div class="b-labeled"' + style + '><span class="lbl">' + esc(b.label) + '</span><div>' +
            b.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div></div>';
        case 'para':
          if (b.num) return '<div class="b-para num"' + style + '><span>' + esc(b.num) + '</span><span>' + esc(b.text) + '</span></div>';
          return '<p class="b-para"' + style + '>' + (b.text ? esc(b.text) : '&nbsp;') + '</p>';
        case 'copyline':
          return '<p class="b-copyline"' + style + '>' + esc(b.text) + '</p>';
        case 'right':
          return '<div class="b-right' + (b.sign ? ' sign-block' : '') + keep + '"' + style + '>' +
            b.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
      }
      return '';
    }).join('\n');
  }

  function currentBlocks() { return M.buildBlocks(letter); }

  function renderPreview() {
    $('#preview').innerHTML = blocksToHTML(currentBlocks());
    var form = $('#letter-form');
    form.classList.toggle('is-reminder', letter.template === 'reminder' || /\{पूर्व/.test(letter.reference || '') || !!letter.prevNumber);
    form.classList.toggle('has-copy', !!letter.copyEnabled);
    fitPreview();
  }

  function fitPreview() {
    var scroller = $('#preview-scroll');
    var wrap = $('#page-wrap');
    if (!scroller || !scroller.clientWidth) return;
    var pagePx = 210 * 96 / 25.4;
    var avail = scroller.clientWidth - 32;
    var z = Math.min(1, avail / pagePx);
    wrap.style.zoom = z.toFixed(3);
    wrap.style.width = pagePx + 'px';
  }
  window.addEventListener('resize', fitPreview);

  // ------------------------------------------------------------ letter form
  function fillForm() {
    $all('#letter-form [data-f]').forEach(function (el) {
      var v = letter[el.dataset.f];
      if (el.type === 'checkbox') el.checked = !!v;
      else {
        if (el.tagName === 'SELECT' && v && !$all('option', el).some(function (o) { return o.value === v; })) {
          var o = document.createElement('option'); o.textContent = v; el.appendChild(o);
        }
        el.value = v == null ? '' : v;
      }
    });
    renderPreview();
  }

  function markDirty() {
    state.currentDirty = true;
    $('#save-status').textContent = 'बदलाव सहेजे नहीं गए / unsaved changes';
  }

  $all('#letter-form [data-f]').forEach(function (el) {
    var handler = function () {
      letter[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      markDirty();
      renderPreview();
      persist();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    if (el.tagName === 'TEXTAREA' || el.type === 'text') {
      el.addEventListener('focus', function () { lastField = el; });
    }
  });

  function setField(name, value) {
    letter[name] = value;
    var el = $('#letter-form [data-f="' + name + '"]');
    if (el) el.value = value;
    markDirty();
    renderPreview();
    persist();
  }

  // ------------------------------------------------------------ dropdowns
  function allTemplates() { return M.BUILTIN_TEMPLATES.concat(state.templates); }

  function renderTemplateSelect() {
    var sel = $('#template-select');
    sel.innerHTML = allTemplates().map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.builtin ? '' : ' ★') + '</option>';
    }).join('');
    sel.value = allTemplates().some(function (t) { return t.id === letter.template; }) ? letter.template : 'general';
  }

  function renderAddresseeSelects() {
    var opts = state.settings.addressees.map(function (a, i) {
      return '<option value="' + i + '">' + esc(a) + '</option>';
    }).join('');
    $('#addressee-select').innerHTML = '<option value="">— सूची से चुनें / pick from list —</option>' + opts;
    $('#copy-add-select').innerHTML = '<option value="">＋ सूची से प्रतिलिपि जोड़ें / add copy recipient from list</option>' + opts;
  }

  function renderPhraseButtons() {
    $('#phrase-list').innerHTML = state.settings.phrases.map(function (p, i) {
      return '<button type="button" data-i="' + i + '">' + esc(p) + '</button>';
    }).join('');
  }

  $('#phrase-list').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('#phrase-list').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    insertAtCursor(lastField || $('#body-text'), state.settings.phrases[Number(btn.dataset.i)]);
  });

  function insertAtCursor(el, text) {
    var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
    var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    var before = el.value.slice(0, start);
    var after = el.value.slice(end);
    var ins = text;
    if (before && !/\s$/.test(before)) ins = ' ' + ins;
    if (after && !/^\s/.test(after)) ins = ins + ' ';
    el.value = before + ins + after;
    var pos = start + ins.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input'));
  }

  $('#addressee-select').addEventListener('change', function (e) {
    var a = state.settings.addressees[Number(e.target.value)];
    if (e.target.value !== '' && a != null) setField('addressee', M.splitAddressee(a));
    e.target.value = '';
  });

  $('#copy-add-select').addEventListener('change', function (e) {
    var a = state.settings.addressees[Number(e.target.value)];
    if (e.target.value !== '' && a != null) {
      var cur = String(letter.copyRecipients || '').replace(/\s+$/, '');
      setField('copyRecipients', (cur ? cur + '\n' : '') + a);
    }
    e.target.value = '';
  });

  $('#btn-add-addressee').addEventListener('click', function () {
    var a = M.nonEmptyLines(letter.addressee).map(function (s) { return s.trim(); }).join(' ');
    if (!a) return toast('पहले पता लिखें / Type an address first');
    if (state.settings.addressees.indexOf(a) === -1) {
      state.settings.addressees.push(a);
      persist(true);
      renderAddresseeSelects();
      renderListEditors();
      toast('सूची में जोड़ा गया / Added to list');
    } else toast('यह पता पहले से सूची में है / Already in list');
  });

  $('#btn-apply-template').addEventListener('click', function () {
    var t = allTemplates().filter(function (x) { return x.id === $('#template-select').value; })[0];
    if (!t) return;
    if (!confirm('विषय, प्रसंग और मुख्य भाग इस नमूने से बदल जाएँगे। आगे बढ़ें?\nSubject, reference and body will be replaced. Continue?')) return;
    M.applyTemplate(letter, clone(t));
    markDirty();
    fillForm();
    persist();
  });

  $('#btn-save-template').addEventListener('click', function () {
    var name = prompt('नमूने का नाम / Template name:', '');
    if (!name || !name.trim()) return;
    var t = M.templateFromLetter(letter, name.trim());
    state.templates.push(t);
    letter.template = t.id;
    persist(true);
    renderTemplateSelect();
    renderListEditors();
    toast('नमूना सहेजा गया / Template saved');
  });

  // ------------------------------------------------------------ toolbar
  function setLetter(l, dirty) {
    letter = l;
    state.current = l;
    state.currentDirty = !!dirty;
    $('#save-status').textContent = dirty ? 'बदलाव सहेजे नहीं गए / unsaved changes' : '';
    renderTemplateSelect();
    fillForm();
    persist(true);
  }

  function okToLeave() {
    return !state.currentDirty || confirm('इस पत्र के बदलाव सहेजे नहीं गए हैं। फिर भी आगे बढ़ें?\nThis letter has unsaved changes. Continue anyway?');
  }

  $('#btn-new').addEventListener('click', function () {
    if (!okToLeave()) return;
    setLetter(M.newLetter(state.settings), false);
    toast('नया पत्र / New letter');
  });

  function saveLetter() {
    letter.updatedAt = new Date().toISOString();
    var copy = clone(letter);
    var idx = state.letters.findIndex(function (x) { return x.id === letter.id; });
    if (idx === -1) state.letters.push(copy); else state.letters[idx] = copy;
    state.currentDirty = false;
    persist(true);
    var t = new Date();
    $('#save-status').textContent = 'सहेजा गया / saved ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    toast('पत्र सहेजा गया / Letter saved');
  }
  $('#btn-save').addEventListener('click', saveLetter);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveLetter(); }
  });

  function preparePrint() { $('#print-area').innerHTML = blocksToHTML(currentBlocks()); }
  window.addEventListener('beforeprint', preparePrint);
  $('#btn-print').addEventListener('click', function () { preparePrint(); window.print(); });

  function fileBase() {
    var part = String(letter.number || '').trim() || M.formatDate(letter.date) || 'letter';
    return 'patra-' + part.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportDocx(mode) {
    if (!window.docx) return toast('Word लाइब्रेरी लोड नहीं हुई / Word library not loaded');
    window.DocxExport.toBlob(currentBlocks(), state.settings, mode).then(function (blob) {
      download(blob, fileBase() + (mode === 'kruti' ? '-krutidev' : '-unicode') + '.docx');
    }).catch(function (err) {
      console.error(err);
      toast('Word फ़ाइल नहीं बनी / Could not create Word file');
    });
  }
  $('#btn-docx-u').addEventListener('click', function () { exportDocx('unicode'); });
  $('#btn-docx-k').addEventListener('click', function () { exportDocx('kruti'); });

  function copyText(text) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? 'कॉपी हो गया / Copied' : 'कॉपी नहीं हुआ / Copy failed');
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('कॉपी हो गया / Copied'); }, fallback);
    } else fallback();
  }
  $('#btn-copy-u').addEventListener('click', function () { copyText(M.blocksToText(currentBlocks())); });
  $('#btn-copy-k').addEventListener('click', function () { copyText(K.unicodeToKruti(M.blocksToText(currentBlocks()))); });

  // ------------------------------------------------------------ saved letters
  function renderSaved() {
    var q = $('#search').value.trim().toLowerCase();
    var list = state.letters.slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    }).filter(function (l) {
      return !q || q.split(/\s+/).every(function (w) { return M.letterSearchText(l).indexOf(w) !== -1; });
    });
    var box = $('#saved-list');
    if (!list.length) {
      box.innerHTML = '<div class="empty-state">' + (state.letters.length
        ? 'कोई पत्र नहीं मिला / No matching letters'
        : 'अभी कोई पत्र सहेजा नहीं गया है। / No saved letters yet.') + '</div>';
      return;
    }
    box.innerHTML = list.map(function (l) {
      var subj = M.nonEmptyLines(l.subject)[0] || '(बिना विषय / no subject)';
      var to = M.nonEmptyLines(l.addressee)[0] || '';
      return '<div class="saved-item" data-id="' + esc(l.id) + '"><div class="meta">' +
        '<div class="subj">' + esc(subj) + '</div>' +
        '<div class="sub">पत्रांक / No.: ' + esc(l.number || '—') + ' · दिनांक / Date: ' + esc(M.formatDate(l.date) || '—') +
        ' · सेवा में / To: ' + esc(to) + '</div></div>' +
        '<div class="acts">' +
        '<button type="button" data-act="open" class="primary">खोलें / Open</button>' +
        '<button type="button" data-act="dup">प्रति बनाएँ / Duplicate</button>' +
        '<button type="button" data-act="del" class="danger">हटाएँ / Delete</button>' +
        '</div></div>';
    }).join('');
  }
  $('#search').addEventListener('input', renderSaved);
  $('#saved-list').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.closest('.saved-item').dataset.id;
    var idx = state.letters.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return;
    var saved = state.letters[idx];
    if (btn.dataset.act === 'open') {
      if (!okToLeave()) return;
      setLetter(clone(saved), false);
      showTab('editor');
    } else if (btn.dataset.act === 'dup') {
      if (!okToLeave()) return;
      var d = clone(saved);
      d.id = M.newId();
      d.number = '';
      d.date = M.todayISO();
      d.createdAt = new Date().toISOString();
      d.updatedAt = null;
      setLetter(d, true);
      showTab('editor');
      toast('नई प्रति बनी — पत्रांक भरें / Copy created — fill the new letter number');
    } else if (btn.dataset.act === 'del') {
      var subj = M.nonEmptyLines(saved.subject)[0] || '';
      if (!confirm('यह पत्र हटाएँ?\nDelete this letter?\n\n' + subj)) return;
      state.letters.splice(idx, 1);
      persist(true);
      renderSaved();
      toast('हटा दिया गया / Deleted');
    }
  });

  // ------------------------------------------------------------ converter
  var convU = $('#conv-u');
  var convK = $('#conv-k');
  function toK() { convK.value = K.unicodeToKruti(convU.value); }
  function toU() { convU.value = K.krutiToUnicode(convK.value); }
  convU.addEventListener('input', toK);
  convK.addEventListener('input', toU);
  $('#conv-to-k').addEventListener('click', toK);
  $('#conv-to-u').addEventListener('click', toU);
  $('#conv-copy-u').addEventListener('click', function () { copyText(convU.value); });
  $('#conv-copy-k').addEventListener('click', function () { copyText(convK.value); });

  // ------------------------------------------------------------ settings
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    var parts = path.split('.');
    var last = parts.pop();
    var o = parts.reduce(function (acc, k) { return acc[k]; }, obj);
    o[last] = value;
  }

  function fillSettings() {
    $all('#settings-form [data-s]').forEach(function (el) {
      var v = getPath(state.settings, el.dataset.s);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    renderKrutiSelect();
    renderListEditors();
  }

  $all('#settings-form [data-s]').forEach(function (el) {
    var handler = function () {
      var v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') {
        v = parseFloat(v);
        if (!isFinite(v)) return;
      }
      setPath(state.settings, el.dataset.s, v);
      if (el.dataset.s === 'krutiFont') { state.settings.krutiFontUserSet = true; renderKrutiSelect(); }
      applyPageStyle();
      renderPreview();
      persist();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  function renderKrutiSelect() {
    var sel = $('#kruti-font-select');
    var cur = state.settings.krutiFont;
    var names = M.KRUTI_FONTS.slice();
    if (names.indexOf(cur) === -1) names.unshift(cur);
    sel.innerHTML = names.map(function (n) {
      var ok = installedKruti.indexOf(n) !== -1;
      return '<option value="' + esc(n) + '">' + esc(n) + (ok ? '  ✓ इंस्टॉल है / installed' : '') + '</option>';
    }).join('');
    sel.value = cur;
    var note = installedKruti.length
      ? 'इस कंप्यूटर पर मिले / Found on this computer: ' + installedKruti.join(', ')
      : 'इस कंप्यूटर पर कोई कृतिदेव फ़ॉन्ट नहीं मिला (Word फ़ाइल फिर भी बनेगी)। / No Kruti Dev font found here (Word files still work on a PC that has it).';
    $('#kruti-detect-note').textContent = note;
    $('#kruti-font-note').textContent = installedKruti.indexOf(cur) !== -1
      ? 'फ़ॉन्ट / Font: ' + cur
      : 'कृतिदेव फ़ॉन्ट इंस्टॉल न होने से ऊपर का पाठ अंग्रेज़ी अक्षरों में दिखेगा — यही सही है। / Without a Kruti Dev font the text above shows as Latin letters; that is expected.';
  }
  $('#kruti-font-select').addEventListener('change', function (e) {
    state.settings.krutiFont = e.target.value;
    state.settings.krutiFontUserSet = true;
    $('#settings-form [data-s="krutiFont"]').value = e.target.value;
    applyPageStyle();
    renderKrutiSelect();
    persist();
  });

  function listEditor(container, items, opts) {
    container.innerHTML = items.length ? items.map(function (it, i) {
      return '<div class="item" data-i="' + i + '">' +
        (opts.input ? '<input type="text" value="' + esc(opts.text(it)) + '">' : '<textarea rows="1">' + esc(opts.text(it)) + '</textarea>') +
        '<button type="button" class="danger" title="हटाएँ / Delete">✕</button></div>';
    }).join('') : '<p class="hint">' + (opts.empty || 'खाली / empty') + '</p>';
    $all('.item', container).forEach(function (row) {
      var i = Number(row.dataset.i);
      var field = $('textarea, input', row);
      field.addEventListener('input', function () { opts.update(i, field.value); persist(); opts.after(); });
      $('button', row).addEventListener('click', function () {
        if (!confirm('हटाएँ? / Delete?\n\n' + opts.text(items[i]))) return;
        items.splice(i, 1);
        persist(true);
        opts.after();
        renderListEditors();
      });
    });
  }

  function renderListEditors() {
    var s = state.settings;
    listEditor($('#addressee-editor'), s.addressees, {
      text: function (x) { return x; },
      update: function (i, v) { s.addressees[i] = v; },
      after: renderAddresseeSelects
    });
    listEditor($('#phrase-editor'), s.phrases, {
      text: function (x) { return x; },
      update: function (i, v) { s.phrases[i] = v; },
      after: renderPhraseButtons
    });
    listEditor($('#template-editor'), state.templates, {
      input: true,
      text: function (t) { return t.name; },
      update: function (i, v) { state.templates[i].name = v; },
      after: renderTemplateSelect,
      empty: 'अभी कोई नमूना नहीं। पत्र टैब में "नमूना सहेजें" दबाएँ। / None yet. Use "Save as template" on the Letter tab.'
    });
  }

  $('#btn-new-addressee').addEventListener('click', function () {
    state.settings.addressees.push('');
    renderListEditors();
    var rows = $all('#addressee-editor textarea');
    rows[rows.length - 1].focus();
  });
  $('#btn-new-phrase').addEventListener('click', function () {
    state.settings.phrases.push('');
    renderListEditors();
    var rows = $all('#phrase-editor textarea');
    rows[rows.length - 1].focus();
  });

  $('#btn-backup').addEventListener('click', function () {
    persist(true);
    download(new Blob([Store.backupJSON(state)], { type: 'application/json' }), 'letter-maker-backup-' + M.todayISO() + '.json');
  });
  $('#btn-restore').addEventListener('click', function () { $('#restore-file').click(); });
  $('#restore-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = Store.parseBackup(String(reader.result)); } catch (err) { return alert(err.message || err); }
      if (!confirm('बैकअप से ' + data.letters.length + ' पत्र और सेटिंग वापस लाएँ? अभी का डेटा बदल जाएगा।\nRestore ' + data.letters.length + ' letters and settings? Current data will be replaced.')) return;
      state.settings = data.settings;
      state.letters = data.letters;
      state.templates = data.templates;
      persist(true);
      refreshAll();
      toast('बैकअप वापस आ गया / Backup restored');
    };
    reader.readAsText(file);
  });

  $('#btn-reset-settings').addEventListener('click', function () {
    if (!confirm('सभी सेटिंग, प्राप्तकर्ता सूची और वाक्यांश डिफ़ॉल्ट हो जाएँगे। (सहेजे पत्र नहीं हटेंगे)\nReset settings, addressees and phrases to defaults? (Saved letters are kept.)')) return;
    state.settings = M.defaultSettings();
    persist(true);
    refreshAll();
    detectKrutiFonts();
  });

  // ------------------------------------------------------------ font detection
  function detectKrutiFonts() {
    var ctx;
    try { ctx = document.createElement('canvas').getContext('2d'); } catch (e) { return; }
    if (!ctx) return;
    var sample = 'dk;Zikyd vfHk;Urk mmmWWWiiilll 0123';
    var bases = ['monospace', 'serif', 'sans-serif'];
    var width = function (font) { ctx.font = '40px ' + font; return ctx.measureText(sample).width; };
    var baseW = bases.map(width);
    installedKruti = M.KRUTI_FONTS.concat(
      M.KRUTI_FONTS.indexOf(state.settings.krutiFont) === -1 ? [state.settings.krutiFont] : []
    ).filter(function (name) {
      return bases.some(function (b, i) { return width("'" + name + "', " + b) !== baseW[i]; });
    });
    if (!state.settings.krutiFontUserSet && installedKruti.length && installedKruti.indexOf(state.settings.krutiFont) === -1) {
      state.settings.krutiFont = installedKruti[0];
      persist();
    }
    applyPageStyle();
    fillSettings();
  }

  // ------------------------------------------------------------ init
  function refreshAll() {
    applyPageStyle();
    renderTemplateSelect();
    renderAddresseeSelects();
    renderPhraseButtons();
    fillForm();
    fillSettings();
    renderSaved();
  }

  refreshAll();
  if (state.currentDirty) $('#save-status').textContent = 'बदलाव सहेजे नहीं गए / unsaved changes';
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { detectKrutiFonts(); fitPreview(); });
  else detectKrutiFonts();

  // exposed for automated checks
  window.LetterApp = { state: function () { return state; }, blocks: currentBlocks, toHTML: blocksToHTML };
})();
