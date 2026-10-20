/*
 * Unicode Devanagari <-> Kruti Dev (010 / 040 share one encoding) converter.
 *
 * The glyph mapping follows the widely used public Kruti Dev converter tables
 * (the "array_one / array_two" tables circulated by Rajbhasha cells and used in
 * most online converters). Instead of blind string replacement this version
 * parses text into syllable clusters, so that the ि matra and the reph (र्)
 * are always moved to the correct side of a whole conjunct.
 *
 * Works as a classic browser script (window.KrutiDev) and as a CommonJS module
 * (for `node --test`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KrutiDev = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HALANT = '्';
  var NUKTA = '़';
  var CONSONANTS = 'कखगघङचछजझञटठडढणतथदधनपफबभमयरलळवशषसह';

  function isCons(c) {
    return !!c && c.length === 1 && CONSONANTS.indexOf(c) !== -1;
  }

  // Full (complete) consonant forms.
  var FULL = {
    'क': 'd', 'ख': '[k', 'ग': 'x', 'घ': '?k', 'ङ': '³',
    'च': 'p', 'छ': 'N', 'ज': 't', 'झ': '>', 'ञ': '¥',
    'ट': 'V', 'ठ': 'B', 'ड': 'M', 'ढ': '<', 'ण': '.k',
    'त': 'r', 'थ': 'Fk', 'द': 'n', 'ध': '/k', 'न': 'u',
    'प': 'i', 'फ': 'Q', 'ब': 'c', 'भ': 'Hk', 'म': 'e',
    'य': ';', 'र': 'j', 'ल': 'y', 'ळ': 'G', 'व': 'o',
    'श': "'k", 'ष': '"k', 'स': 'l', 'ह': 'g'
  };

  // Half forms (consonant + halant followed by another consonant).
  // Consonants missing here are written as full form + "~" (visible halant).
  var HALF = {
    'क': 'D', 'ख': '[', 'ग': 'X', 'घ': '?', 'च': 'P', 'ज': 'T',
    'झ': '÷', 'ण': '.', 'त': 'R', 'थ': 'F', 'ध': '/', 'न': 'U',
    'प': 'I', 'फ': '¶', 'ब': 'C', 'भ': 'H', 'म': 'E', 'य': '¸',
    'ल': 'Y', 'व': 'O', 'श': "'", 'ष': '"', 'स': 'L', 'ह': 'º'
  };

  // Special conjunct glyphs (consonant part of a cluster), longest first.
  var CONJUNCTS = [
    ['क्ष्', '{'], ['त्र्', '«'], ['त्त्', 'Ù'],
    ['क्ष', '{k'], ['त्र', '='], ['ज्ञ', 'K'], ['श्र', 'J'], ['त्त', 'Ùk'],
    ['द्ध', ')'], ['द्व', '}'], ['द्य', '|'], ['द्द', 'í'], ['द्र', 'æ'],
    ['ह्म', 'ã'], ['ह्य', 'á'], ['ह्न', 'à'], ['ह्र', 'ºz'],
    ['ट्ट', 'ê'], ['ट्ठ', 'ë'], ['ड्ड', 'ì'], ['ड्ढ', 'ï'],
    ['ट्य', 'Vî'], ['ठ्य', 'Bî'], ['ड्य', 'Mî'], ['ढ्य', '<î'], ['छ्य', 'Nî'],
    ['ट्र', 'Vª'], ['ड्र', 'Mª'], ['ढ्र', '<ª'], ['छ्र', 'Nª'],
    ['क्र', 'Ø'], ['फ्र', 'Ý']
  ];
  CONJUNCTS.sort(function (a, b) { return b[0].length - a[0].length; });

  var VOWELS = {
    'अ': 'v', 'आ': 'vk', 'इ': 'b', 'ई': 'bZ', 'उ': 'm', 'ऊ': 'Å',
    'ऋ': '_', 'ए': ',', 'ऐ': ',s', 'ओ': 'vks', 'औ': 'vkS', 'ऑ': 'vkW', 'ऍ': ',W'
  };

  var MATRAS = {
    'ा': 'k', 'ी': 'h', 'ु': 'q', 'ू': 'w', 'ृ': '`', 'े': 's', 'ै': 'S',
    'ो': 'ks', 'ौ': 'kS', 'ॅ': 'W', 'ॉ': 'kW'
  };
  var NASALS = { 'ं': 'a', 'ँ': '¡', 'ः': '%' };

  var OTHERS = {
    '।': 'A', '॥': 'AA', '॰': 'Œ', 'ॐ': '¬', 'ऽ': '·',
    '०': 'å', '१': 'ƒ', '२': '„', '३': '…', '४': '†',
    '५': '‡', '६': 'ˆ', '७': '‰', '८': 'Š', '९': '‹',
    '.': '-', ',': ']', '-': '&', '—': '&', '–': '&',
    '(': '¼', ')': '½', '{': '¿', '}': 'À', '=': '¾', '?': '\\',
    '‘': '^', '’': '*', '“': 'Þ', '”': 'ß', "'": '*', '"': 'ß',
    ':': '%', '/': '@', ';': '(', '+': '$'
  };

  function isSign(c) {
    return c === 'ि' || MATRAS.hasOwnProperty(c) || NASALS.hasOwnProperty(c);
  }

  function prepare(text) {
    // NFC also decomposes क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़ into consonant + nukta.
    return String(text == null ? '' : text).normalize('NFC')
      .replace(/[‌‍]/g, '')
      .replace(/ऩ/g, 'न' + NUKTA).replace(/ऱ/g, 'र' + NUKTA)
      .replace(/ऴ/g, 'ळ' + NUKTA)
      .replace(/[क़-य़]/g, function (c) { return c.normalize('NFD'); });
  }

  // Render the consonant part of one cluster (e.g. "स्थ", "ष्ट्र").
  function renderConsonants(str) {
    var out = '';
    var j = 0;
    while (j < str.length) {
      var matched = false;
      for (var k = 0; k < CONJUNCTS.length; k++) {
        var key = CONJUNCTS[k][0];
        if (str.startsWith(key, j) && str.charAt(j + key.length) !== NUKTA) {
          out += CONJUNCTS[k][1];
          j += key.length;
          // A full-form conjunct that is itself followed by a halant.
          if (key.charAt(key.length - 1) !== HALANT && str.charAt(j) === HALANT) {
            out += '~';
            j++;
          }
          matched = true;
          break;
        }
      }
      if (matched) continue;

      var ch = str.charAt(j);
      j++;
      var nukta = '';
      if (str.charAt(j) === NUKTA) { nukta = '+'; j++; }
      if (str.charAt(j) === HALANT) {
        var next = str.charAt(j + 1);
        if (next === 'र' && str.charAt(j + 2) !== NUKTA) {
          // Rakar: प्र -> iz
          out += FULL[ch] + nukta + 'z';
          j += 2;
          if (str.charAt(j) === HALANT) { out += '~'; j++; }
        } else if (isCons(next)) {
          out += HALF[ch] ? HALF[ch] + nukta : FULL[ch] + nukta + '~';
          j++;
        } else {
          out += FULL[ch] + nukta + '~';
          j++;
        }
      } else {
        out += FULL[ch] + nukta;
      }
    }
    return out;
  }

  function renderCluster(cons, finalHalant, signs) {
    var reph = false;
    if (cons.length > 1 && cons[0] === 'र') { reph = true; cons = cons.slice(1); }
    var iMatra = signs.indexOf('ि') !== -1;
    if (iMatra) signs = signs.replace('ि', '');

    var vowelSigns = '';
    var nasalSigns = '';
    for (var s = 0; s < signs.length; s++) {
      var c = signs.charAt(s);
      if (NASALS.hasOwnProperty(c)) nasalSigns += NASALS[c];
      else vowelSigns += MATRAS[c];
    }

    var body;
    if (cons.length === 1 && cons[0] === 'र' && !finalHalant && (signs.charAt(0) === 'ु' || signs.charAt(0) === 'ू')) {
      body = signs.charAt(0) === 'ु' ? '#' : ':';
      vowelSigns = vowelSigns.slice(1);
    } else {
      body = renderConsonants(cons.join(HALANT) + (finalHalant ? HALANT : ''));
    }
    var core = body + vowelSigns;
    // Ligatures of क / द / ह with ृ
    core = core.replace(/^d`/, '—').replace(/^n`/, '–').replace(/^g`/, 'â');
    if (cons.length > 1) core = core.replace(/([^\s])d`$/, '$1—');
    return (iMatra ? 'f' : '') + core + (reph ? 'Z' : '') + nasalSigns;
  }

  /**
   * Convert Unicode Hindi to Kruti Dev text.
   * Latin letters are left as they are (they cannot be shown in a Kruti Dev font).
   */
  function unicodeToKruti(text) {
    var s = prepare(text);
    var out = '';
    var i = 0;
    var n = s.length;
    while (i < n) {
      var c = s.charAt(i);
      if (isCons(c)) {
        var cons = [];
        for (;;) {
          var unit = s.charAt(i);
          i++;
          if (s.charAt(i) === NUKTA) { unit += NUKTA; i++; }
          cons.push(unit);
          if (s.charAt(i) === HALANT && isCons(s.charAt(i + 1))) { i++; continue; }
          break;
        }
        var finalHalant = false;
        if (s.charAt(i) === HALANT) { finalHalant = true; i++; }
        var signs = '';
        while (i < n && isSign(s.charAt(i))) { signs += s.charAt(i); i++; }
        out += renderCluster(cons, finalHalant, signs);
      } else if (VOWELS.hasOwnProperty(c)) {
        out += VOWELS[c];
        i++;
      } else if (MATRAS.hasOwnProperty(c)) {
        out += MATRAS[c]; i++;
      } else if (NASALS.hasOwnProperty(c)) {
        out += NASALS[c]; i++;
      } else if (c === 'ि') {
        out += 'f'; i++;
      } else if (c === HALANT) {
        out += '~'; i++;
      } else if (c === NUKTA) {
        out += '+'; i++;
      } else if (/[A-Za-z]/.test(c)) {
        // Keep a whole Latin word together, including its own punctuation.
        var m = /^[A-Za-z][A-Za-z0-9]*(?:[.\-\/'&@_][A-Za-z0-9]+)*\.?/.exec(s.slice(i));
        out += m[0];
        i += m[0].length;
      } else if (OTHERS.hasOwnProperty(c)) {
        out += OTHERS[c]; i++;
      } else {
        out += c; i++;
      }
    }
    return out;
  }

  /**
   * Split Unicode text into segments for Word export: Hindi/punctuation parts
   * are converted to Kruti Dev, Latin words are kept (to be shown in a Latin font).
   */
  function unicodeToKrutiSegments(text) {
    var s = prepare(text);
    var re = /[A-Za-z][A-Za-z0-9]*(?:[.\-\/'&@_][A-Za-z0-9]+)*\.?(?:\s+[A-Za-z][A-Za-z0-9]*(?:[.\-\/'&@_][A-Za-z0-9]+)*\.?)*/g;
    var segs = [];
    var last = 0;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) segs.push({ text: unicodeToKruti(s.slice(last, m.index)), latin: false });
      segs.push({ text: m[0], latin: true });
      last = m.index + m[0].length;
    }
    if (last < s.length) segs.push({ text: unicodeToKruti(s.slice(last)), latin: false });
    return segs;
  }

  // ---------------------------------------------------------------- reverse

  // type: C full consonant, H half consonant, X subscript (्र/्य) joined to
  // previous consonant, K nukta, M vowel sign, N nasal, V vowel, F ि, Z reph, O other
  var KTABLE = {};
  function addK(k, u, t) { if (!KTABLE.hasOwnProperty(k)) KTABLE[k] = { u: u, t: t }; }

  addK('vks', 'ओ', 'V'); addK('vkS', 'औ', 'V'); addK('vkW', 'ऑ', 'V');
  addK('vk', 'आ', 'V'); addK('v', 'अ', 'V'); addK('bZ', 'ई', 'V'); addK('b', 'इ', 'V');
  addK('m', 'उ', 'V'); addK('Å', 'ऊ', 'V'); addK('_', 'ऋ', 'V');
  addK(',s', 'ऐ', 'V'); addK(',W', 'ऍ', 'V'); addK(',', 'ए', 'V');

  CONJUNCTS.forEach(function (p) {
    if (p[1] === 'ºz') return;
    var u = p[0];
    if (/î$|ª$/.test(p[1])) return; // built from base + subscript below
    addK(p[1], u, u.charAt(u.length - 1) === HALANT ? 'H' : 'C');
  });
  addK('ç', 'प्र', 'C');
  addK('—', 'कृ', 'C'); addK('–', 'दृ', 'C'); addK('â', 'हृ', 'C');
  addK('#', 'रु', 'C'); addK(':', 'रू', 'C');
  Object.keys(FULL).forEach(function (c) { addK(FULL[c], c, 'C'); });
  Object.keys(HALF).forEach(function (c) { addK(HALF[c], c + HALANT, 'H'); });
  addK('z', HALANT + 'र', 'X'); addK('ª', HALANT + 'र', 'X'); addK('î', HALANT + 'य', 'X');
  addK('+', NUKTA, 'K');
  addK('kW', 'ॉ', 'M'); addK('ks', 'ो', 'M'); addK('kS', 'ौ', 'M');
  Object.keys(MATRAS).forEach(function (c) { addK(MATRAS[c], c, 'M'); });
  addK('a', 'ं', 'N'); addK('¡', 'ँ', 'N'); addK('%', 'ः', 'N');
  addK('f', 'ि', 'F'); addK('Z', 'र्', 'Z'); addK('~', HALANT, 'M');
  addK('AA', '॥', 'O');
  Object.keys(OTHERS).forEach(function (c) {
    var k = OTHERS[c];
    if (k === '&' || k === 'AA' || k === '*' || k === 'ß' || k === '%') return;
    addK(k, c, 'O');
  });
  addK('*', '’', 'O'); addK('ß', '”', 'O');

  var KKEYS = Object.keys(KTABLE).sort(function (a, b) { return b.length - a.length; });
  var MAXK = KKEYS[0].length;

  var SKIP_BACK = 'ािीुूृेैोौॅॉंँः' + NUKTA;

  function insertReph(out) {
    var j = out.length;
    while (j > 0 && SKIP_BACK.indexOf(out.charAt(j - 1)) !== -1) j--;
    if (j > 0 && isCons(out.charAt(j - 1))) {
      j--;
      for (;;) {
        if (out.charAt(j - 1) !== HALANT) break;
        var m = j - 2;
        if (out.charAt(m) === NUKTA) m--;
        if (m >= 0 && isCons(out.charAt(m))) j = m; else break;
      }
    }
    return out.slice(0, j) + 'र्' + out.slice(j);
  }

  function tokenize(s) {
    var tokens = [];
    var i = 0;
    while (i < s.length) {
      var tok = null;
      for (var len = Math.min(MAXK, s.length - i); len > 0; len--) {
        var piece = s.substr(i, len);
        if (KTABLE.hasOwnProperty(piece)) { tok = { k: piece, u: KTABLE[piece].u, t: KTABLE[piece].t }; break; }
      }
      if (!tok) {
        var c = s.charAt(i);
        if (c === '&') {
          var prev = s.charAt(i - 1);
          var next = s.charAt(i + 1);
          var dash = (next === '' || /\s/.test(next) || prev === '%' || prev === '' || /\s/.test(prev)) ? '—' : '-';
          tok = { k: c, u: dash, t: 'O' };
        } else {
          tok = { k: c, u: c, t: 'O' };
        }
      }
      // "%&" is a colon followed by a dash (e.g. प्रतिलिपि:—), not a visarga.
      if (tok.k === '%' && s.charAt(i + 1) === '&') tok = { k: '%', u: ':', t: 'O' };
      i += tok.k.length;
      // A half consonant followed by the vertical bar "k" is the full consonant.
      if (tok.t === 'H' && s.charAt(i) === 'k' && s.substr(i, 2) !== 'kW' && s.substr(i, 2) !== 'ks' && s.substr(i, 2) !== 'kS') {
        tok = { k: tok.k + 'k', u: tok.u.slice(0, -1), t: 'C' };
        i++;
      }
      tokens.push(tok);
    }
    return tokens;
  }

  /** Convert Kruti Dev text to Unicode Hindi. */
  function krutiToUnicode(text) {
    var s = String(text == null ? '' : text);
    var tokens = tokenize(s);
    var out = '';
    var pendingI = false;
    var sawCons = false;
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      if (tok.t === 'F') {
        if (pendingI) out += 'ि';
        pendingI = true;
        sawCons = false;
        continue;
      }
      if (tok.t === 'Z') {
        if (pendingI) { out += 'ि'; pendingI = false; }
        out = insertReph(out);
        continue;
      }
      out += tok.u;
      if (pendingI) {
        if (tok.t === 'C' || tok.t === 'X' || tok.t === 'K') sawCons = sawCons || tok.t === 'C';
        if (tok.t === 'H') continue;
        var nt = tokens[t + 1];
        var joins = nt && (nt.t === 'X' || nt.t === 'K');
        if ((tok.t === 'C' || tok.t === 'X' || tok.t === 'K') && sawCons && !joins) {
          out += 'ि';
          pendingI = false;
        } else if (tok.t !== 'C' && tok.t !== 'X' && tok.t !== 'K') {
          // ि with no consonant to attach to: keep it where it was.
          out = out.slice(0, out.length - tok.u.length) + 'ि' + tok.u;
          pendingI = false;
        }
      }
    }
    if (pendingI) out += 'ि';
    return out
      .replace(/्ा/g, '')
      .replace(/ाे/g, 'ो').replace(/ाै/g, 'ौ').replace(/ाॅ/g, 'ॉ')
      .replace(/अा/g, 'आ').replace(/एे/g, 'ऐ')
      .replace(/([ंँ])([ािीुूृेैोौॅॉ])/g, '$2$1')
      .normalize('NFC');
  }

  return {
    unicodeToKruti: unicodeToKruti,
    unicodeToKrutiSegments: unicodeToKrutiSegments,
    krutiToUnicode: krutiToUnicode
  };
});
