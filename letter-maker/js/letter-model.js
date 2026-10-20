/*
 * Letter data model: default presets, templates and the layout "blocks" that
 * the on-screen preview, print, Word export and text copy are all built from.
 * Classic script (window.LetterModel) and CommonJS module (for tests).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DOTS = '........................';
  var SHORT_DOTS = '..............';

  var KRUTI_FONTS = [
    'Kruti Dev 040 Wide', 'Kruti Dev 010', 'Kruti Dev 011', 'Kruti Dev 016',
    'Kruti Dev 020', 'Kruti Dev 021', 'Kruti Dev 030', 'Kruti Dev 040',
    'Kruti Dev 050', 'Kruti Dev 055', 'Kruti Dev 060', 'Kruti Dev 100',
    'Kruti Dev 120', 'Kruti Dev 140', 'Kruti Dev 500', 'Kruti Dev 501'
  ];

  function defaultSettings() {
    return {
      letterhead: 'झारखण्ड सरकार\nजल संसाधन विभाग\nकार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट',
      sender: 'कार्यपालक अभियंता,\nतेनुघाट बाँध प्रमण्डल, तेनुघाट।',
      signature: 'कार्यपालक अभियंता,\nतेनुघाट बाँध प्रमण्डल, तेनुघाट।',
      signName: '',
      closing: 'विश्वासभाजन,',
      salutation: 'महाशय,',
      enclosure: 'अनु०:- यथोक्त।',
      copySuffix: 'को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।',
      addressees: [
        'अधीक्षण अभियंता, तेनुघाट बाँध अंचल, तेनुघाट।',
        'मुख्य अभियंता, जल संसाधन विभाग, हजारीबाग।',
        'मुख्य अभियंता (मॉनिटरिंग), जल संसाधन विभाग, राँची।',
        'उप सचिव (अभियंत्रण), जल संसाधन विभाग, झारखण्ड, राँची।'
      ],
      phrases: [
        'उपर्युक्त विषयक प्रसंगाधीन पत्र के आलोक में सूचित करना है कि',
        'अतः अनुरोध है कि',
        'की प्रति संलग्न कर सूचनार्थ एवं आवश्यक कार्यार्थ अग्रसारित की जाती है।',
        'की स्वीकृति प्रदान करने की कृपा की जाय।',
        'उपर्युक्त विषय के संबंध में कहना है कि',
        'अनुपालन प्रतिवेदन संलग्न कर सूचनार्थ समर्पित किया जा रहा है।',
        'आवंटन उपलब्ध कराने की कृपा की जाय।',
        'इसे अति आवश्यक समझा जाय।'
      ],
      krutiFont: 'Kruti Dev 040 Wide',
      krutiFontUserSet: false,
      krutiFontSize: 16,
      unicodeFont: 'Nirmala UI',
      fontSize: 13,
      lineHeight: 1.5,
      margins: { top: 20, bottom: 20, left: 25, right: 20 },
      devanagariDigits: false,
      numberDots: true
    };
  }

  var BUILTIN_TEMPLATES = [
    {
      id: 'general', name: 'सामान्य पत्र / General letter', builtin: true,
      fields: {
        subject: '', reference: '',
        body: 'उपर्युक्त विषयक प्रसंगाधीन पत्र के आलोक में सूचित करना है कि ',
        numberParas: false
      }
    },
    {
      id: 'forward', name: 'अग्रसारण पत्र / Forwarding letter', builtin: true,
      fields: {
        subject: '.......... का अग्रसारण।', reference: '',
        body: 'उपर्युक्त विषयक प्रसंगाधीन पत्र के आलोक में .......... की प्रति संलग्न कर सूचनार्थ एवं आवश्यक कार्यार्थ अग्रसारित की जाती है।',
        numberParas: false
      }
    },
    {
      id: 'reminder', name: 'स्मार पत्र / Reminder', builtin: true,
      fields: {
        subject: 'स्मार पत्र — ..........',
        reference: 'इस कार्यालय का पत्रांक {पूर्व पत्रांक} दिनांक {पूर्व दिनांक}।',
        body: 'उपर्युक्त विषयक प्रसंगाधीन पत्र का कृपया अवलोकन किया जाय, जिसके द्वारा .......... हेतु अनुरोध किया गया था। अद्यतन इस संबंध में कोई सूचना प्राप्त नहीं हुई है।\nअतः अनुरोध है कि वांछित सूचना शीघ्र उपलब्ध कराने की कृपा की जाय।',
        numberParas: false
      }
    }
  ];

  var TEMPLATE_FIELDS = ['subject', 'reference', 'body', 'numberParas', 'enclosure', 'salutation', 'copyEnabled', 'copyRecipients'];

  function todayISO(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function newId() {
    return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function newLetter(settings, template) {
    settings = settings || defaultSettings();
    var l = {
      id: newId(),
      template: 'general',
      createdAt: new Date().toISOString(),
      updatedAt: null,
      letterhead: settings.letterhead,
      number: '',
      date: todayISO(),
      blankNumberDate: false,
      showSender: true,
      sender: settings.sender,
      addressee: splitAddressee(settings.addressees[0] || ''),
      subject: '',
      reference: '',
      salutation: settings.salutation,
      body: '',
      numberParas: false,
      enclosure: settings.enclosure,
      closing: settings.closing,
      signName: settings.signName,
      signature: settings.signature,
      copyEnabled: false,
      copyMemoNo: '',
      copyMemoDate: '',
      copyRecipients: '',
      copySuffix: settings.copySuffix,
      prevNumber: '',
      prevDate: '',
      devanagariDigits: !!settings.devanagariDigits
    };
    applyTemplate(l, template || BUILTIN_TEMPLATES[0]);
    return l;
  }

  function applyTemplate(letter, template) {
    if (!template) return letter;
    var f = template.fields || {};
    TEMPLATE_FIELDS.forEach(function (k) {
      if (f.hasOwnProperty(k)) letter[k] = f[k];
    });
    letter.template = template.id;
    return letter;
  }

  function templateFromLetter(letter, name) {
    var fields = {};
    TEMPLATE_FIELDS.forEach(function (k) { fields[k] = letter[k]; });
    return { id: 'T' + Date.now().toString(36), name: name, builtin: false, fields: fields };
  }

  // "अधीक्षण अभियंता, तेनुघाट बाँध अंचल, तेनुघाट।" -> two lines after the designation.
  function splitAddressee(text) {
    text = String(text || '').trim();
    if (text.indexOf('\n') !== -1) return text;
    var idx = text.indexOf(', ');
    // keep "(मॉनिटरिंग)" style qualifiers with the designation
    if (idx === -1) return text;
    return text.slice(0, idx + 1) + '\n' + text.slice(idx + 2);
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return m[3] + '.' + m[2] + '.' + m[1];
  }

  function toDevanagariDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return String.fromCharCode(0x0966 + Number(d)); });
  }

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (s) { return s.replace(/\s+$/, ''); });
  }

  function nonEmptyLines(text) {
    return lines(text).filter(function (s) { return s.trim() !== ''; });
  }

  function fillPlaceholders(text, letter) {
    return String(text || '')
      .replace(/\{पूर्व पत्रांक\}/g, letter.prevNumber ? letter.prevNumber : SHORT_DOTS)
      .replace(/\{पूर्व दिनांक\}/g, letter.prevDate ? formatDate(letter.prevDate) : SHORT_DOTS);
  }

  function stripEnd(s) {
    return String(s).trim().replace(/[।,]\s*$/, '').trim();
  }

  /**
   * Build the layout of the letter as a list of blocks.
   * Block types:
   *  center {text, size}    numdate {left, right}    line {text}
   *  indent {lines}         labeled {label, lines}   para {text, num}
   *  right  {lines}         copyline {text}          gap {lines}
   */
  function buildBlocks(letter) {
    var L = letter;
    var b = [];
    var fill = function (t) { return fillPlaceholders(t, L); };

    nonEmptyLines(L.letterhead).forEach(function (t, i) {
      b.push({ t: 'center', text: t, size: i < 2 ? 1.15 : 1, space: 0 });
    });

    var num = L.blankNumberDate || !String(L.number || '').trim() ? DOTS : String(L.number).trim();
    var date = L.blankNumberDate || !L.date ? SHORT_DOTS : formatDate(L.date);
    b.push({ t: 'numdate', left: 'पत्रांक— ' + num, right: 'दिनांक— ' + date, space: 1 });

    if (L.showSender && nonEmptyLines(L.sender).length) {
      b.push({ t: 'line', text: 'प्रेषक,', space: 0.8 });
      b.push({ t: 'indent', lines: nonEmptyLines(L.sender), space: 0 });
    }

    b.push({ t: 'line', text: 'सेवा में,', space: 0.8 });
    var to = nonEmptyLines(L.addressee);
    b.push({ t: 'indent', lines: to.length ? to : [DOTS], space: 0 });

    var subj = nonEmptyLines(fill(L.subject));
    b.push({ t: 'labeled', label: 'विषय:—', lines: subj.length ? subj : [DOTS], space: 0.8 });

    var ref = nonEmptyLines(fill(L.reference));
    if (ref.length) b.push({ t: 'labeled', label: 'प्रसंग:—', lines: ref, space: 0.4 });

    b.push({ t: 'line', text: L.salutation || 'महाशय,', space: 0.8 });

    var paras = nonEmptyLines(fill(L.body));
    if (!paras.length) paras = [''];
    paras.forEach(function (p, i) {
      b.push({ t: 'para', text: p.trim(), num: L.numberParas ? (i + 1) + '.' : '', space: i === 0 ? 0.4 : 0.5 });
    });

    var enc = nonEmptyLines(L.enclosure);
    if (enc.length === 1) {
      b.push({ t: 'line', text: enc[0].trim(), space: 0.8 });
    } else if (enc.length > 1) {
      var label = 'अनु०:—';
      if (/^अनु/.test(enc[0].trim()) && enc[0].trim().length <= 8) { label = enc[0].trim(); enc = enc.slice(1); }
      b.push({ t: 'labeled', label: label, lines: enc.map(function (e, i) { return (i + 1) + '. ' + e.trim(); }), space: 0.8 });
    }

    b.push({ t: 'right', lines: [L.closing || 'विश्वासभाजन,'], space: 1 });
    var sig = [];
    if (String(L.signName || '').trim()) sig.push('(' + String(L.signName).trim().replace(/^\(|\)$/g, '') + ')');
    sig = sig.concat(nonEmptyLines(L.signature));
    b.push({ t: 'right', lines: sig, space: 3, sign: true });

    if (L.copyEnabled) {
      var memo = String(L.copyMemoNo || '').trim() || SHORT_DOTS;
      var mdate = L.copyMemoDate ? formatDate(L.copyMemoDate) : SHORT_DOTS;
      b.push({ t: 'numdate', left: 'ज्ञापांक— ' + memo, right: 'दिनांक— ' + mdate, space: 1.5, keepNext: true });
      var recips = nonEmptyLines(L.copyRecipients);
      if (!recips.length) recips = [DOTS];
      var suffix = String(L.copySuffix || '').trim();
      recips.forEach(function (r) {
        var text = /प्रेषित|सूचनार्थ|अग्रसारित/.test(r) ? r.trim() : stripEnd(r).replace(/\n/g, ' ') + (suffix ? ' ' + suffix : '');
        b.push({ t: 'copyline', text: 'प्रतिलिपि:— ' + text, space: 0.6 });
      });
      b.push({ t: 'right', lines: nonEmptyLines(L.signature), space: 3, sign: true });
    }

    if (L.devanagariDigits) {
      b.forEach(function (blk) {
        ['text', 'left', 'right', 'label', 'num'].forEach(function (k) {
          if (typeof blk[k] === 'string') blk[k] = toDevanagariDigits(blk[k]);
        });
        if (blk.lines) blk.lines = blk.lines.map(toDevanagariDigits);
      });
    }
    return b;
  }

  /** Plain text version of the letter (for copy / paste). */
  function blocksToText(blocks) {
    var out = [];
    blocks.forEach(function (blk) {
      if (blk.space >= 0.8 && out.length) out.push('');
      switch (blk.t) {
        case 'center': out.push(blk.text); break;
        case 'numdate': out.push(blk.left + '\t\t\t' + blk.right); break;
        case 'line': out.push(blk.text); break;
        case 'indent': blk.lines.forEach(function (l) { out.push('\t' + l); }); break;
        case 'labeled':
          blk.lines.forEach(function (l, i) { out.push((i === 0 ? blk.label + ' ' : '\t') + l); });
          break;
        case 'para': out.push('\t' + (blk.num ? blk.num + ' ' : '') + blk.text); break;
        case 'copyline': out.push(blk.text); break;
        case 'right':
          if (blk.sign) out.push('', '');
          blk.lines.forEach(function (l) { out.push('\t\t\t\t\t' + l); });
          break;
      }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n\n');
  }

  function letterSearchText(l) {
    return [l.subject, l.number, formatDate(l.date), l.date, l.addressee, l.body].join(' ').toLowerCase();
  }

  return {
    KRUTI_FONTS: KRUTI_FONTS,
    BUILTIN_TEMPLATES: BUILTIN_TEMPLATES,
    DOTS: DOTS,
    defaultSettings: defaultSettings,
    newLetter: newLetter,
    newId: newId,
    applyTemplate: applyTemplate,
    templateFromLetter: templateFromLetter,
    splitAddressee: splitAddressee,
    formatDate: formatDate,
    toDevanagariDigits: toDevanagariDigits,
    todayISO: todayISO,
    buildBlocks: buildBlocks,
    blocksToText: blocksToText,
    letterSearchText: letterSearchText,
    nonEmptyLines: nonEmptyLines
  };
});
