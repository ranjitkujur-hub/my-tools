/* Pure calculation helpers: test catalogue, eGFR, corrected calcium,
 * range flags, dates and due-date logic. No DOM access, so it runs in
 * the browser (as window.KT.calc) and in Node (require) for unit tests. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.KT = root.KT || {}; root.KT.calc = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Typical adult lab ranges. `m`/`f` are [low, high]; null = no bound.
  // These are defaults only — labs differ, so every range is editable.
  var TESTS = [
    { key: 'hb', hi: 'हीमोग्लोबिन', en: 'Hb (Haemoglobin)', unit: 'g/dL', m: [13.0, 17.0], f: [12.0, 15.5], common: true },
    { key: 'creatinine', hi: 'क्रिएटिनिन', en: 'Serum creatinine', unit: 'mg/dL', m: [0.7, 1.3], f: [0.6, 1.1], common: true },
    { key: 'egfr', hi: 'ईजीएफ़आर (गणना)', en: 'eGFR (calculated)', unit: 'mL/min/1.73m²', m: [90, null], f: [90, null], calculated: true },
    { key: 'urea', hi: 'ब्लड यूरिया', en: 'Blood urea', unit: 'mg/dL', m: [15, 40], f: [15, 40], common: true },
    { key: 'potassium', hi: 'पोटैशियम', en: 'Potassium (K)', unit: 'mmol/L', m: [3.5, 5.1], f: [3.5, 5.1], common: true },
    { key: 'sodium', hi: 'सोडियम', en: 'Sodium (Na)', unit: 'mmol/L', m: [135, 145], f: [135, 145], common: true },
    { key: 'calcium', hi: 'कैल्शियम', en: 'Calcium', unit: 'mg/dL', m: [8.5, 10.5], f: [8.5, 10.5], common: true },
    { key: 'ccalcium', hi: 'करेक्टेड कैल्शियम (गणना)', en: 'Corrected calcium (calculated)', unit: 'mg/dL', m: [8.5, 10.5], f: [8.5, 10.5], calculated: true },
    { key: 'phosphorus', hi: 'फ़ॉस्फ़ोरस', en: 'Phosphorus', unit: 'mg/dL', m: [2.5, 4.5], f: [2.5, 4.5], common: true },
    { key: 'albumin', hi: 'एल्ब्यूमिन', en: 'Albumin', unit: 'g/dL', m: [3.5, 5.0], f: [3.5, 5.0], common: true },
    { key: 'pcv', hi: 'पीसीवी / हिमेटोक्रिट', en: 'PCV / Hct', unit: '%', m: [40, 50], f: [36, 46] },
    { key: 'mcv', hi: 'एमसीवी', en: 'MCV', unit: 'fL', m: [80, 100], f: [80, 100] },
    { key: 'chloride', hi: 'क्लोराइड', en: 'Chloride (Cl)', unit: 'mmol/L', m: [98, 107], f: [98, 107] },
    { key: 'bicarbonate', hi: 'बाइकार्बोनेट', en: 'Bicarbonate (HCO₃)', unit: 'mmol/L', m: [22, 29], f: [22, 29] },
    { key: 'pth', hi: 'पीटीएच', en: 'PTH (intact)', unit: 'pg/mL', m: [15, 65], f: [15, 65] },
    { key: 'uricacid', hi: 'यूरिक एसिड', en: 'Uric acid', unit: 'mg/dL', m: [3.5, 7.2], f: [2.6, 6.0] },
    { key: 'ferritin', hi: 'फ़ेरिटिन', en: 'Ferritin', unit: 'ng/mL', m: [30, 400], f: [15, 150] },
    { key: 'tsat', hi: 'टीसैट', en: 'TSAT', unit: '%', m: [20, 50], f: [20, 50] },
    { key: 'iron', hi: 'सीरम आयरन', en: 'Serum iron', unit: 'µg/dL', m: [65, 175], f: [50, 170] },
    { key: 'tibc', hi: 'टीआईबीसी', en: 'TIBC', unit: 'µg/dL', m: [250, 450], f: [250, 450] },
    { key: 'vitd', hi: 'विटामिन डी (25-OH)', en: '25-OH Vitamin D', unit: 'ng/mL', m: [30, 100], f: [30, 100] },
    { key: 'magnesium', hi: 'मैग्नीशियम', en: 'Magnesium', unit: 'mg/dL', m: [1.7, 2.4], f: [1.7, 2.4] },
    { key: 'glucose', hi: 'ग्लूकोज़ (फ़ास्टिंग)', en: 'Glucose (fasting)', unit: 'mg/dL', m: [70, 100], f: [70, 100] },
    { key: 'hba1c', hi: 'एचबीए1सी', en: 'HbA1c', unit: '%', m: [4.0, 5.6], f: [4.0, 5.6] },
    { key: 'uacr', hi: 'यूरिन एसीआर', en: 'Urine ACR', unit: 'mg/g', m: [0, 30], f: [0, 30] },
    { key: 'upcr', hi: 'यूरिन पीसीआर', en: 'Urine PCR', unit: 'mg/g', m: [0, 150], f: [0, 150] }
  ];

  var TEST_BY_KEY = {};
  TESTS.forEach(function (t) { TEST_BY_KEY[t.key] = t; });

  function round(x, dp) {
    var p = Math.pow(10, dp || 0);
    return Math.round(x * p) / p;
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* CKD-EPI 2021 (race-free) creatinine equation.
   * sex: 'f' or 'm'; returns mL/min/1.73m² rounded to 1 dp, or null. */
  function egfr(scr, age, sex) {
    scr = num(scr); age = num(age);
    if (scr === null || scr <= 0 || age === null || age < 18 || (sex !== 'f' && sex !== 'm')) return null;
    var female = sex === 'f';
    var k = female ? 0.7 : 0.9;
    var a = female ? -0.241 : -0.302;
    var r = scr / k;
    var v = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.200) *
      Math.pow(0.9938, age) * (female ? 1.012 : 1);
    return round(v, 1);
  }

  // Corrected Ca = Ca + 0.8 × (4.0 − albumin), mg/dL and g/dL.
  function correctedCalcium(ca, albumin) {
    ca = num(ca); albumin = num(albumin);
    if (ca === null || albumin === null) return null;
    return round(ca + 0.8 * (4.0 - albumin), 1);
  }

  // Dates are stored as ISO 'YYYY-MM-DD' strings (local calendar dates).
  function parseISO(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toISO(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function todayISO(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Show every date as DD.MM.YYYY.
  function fmtDate(s) {
    var p = parseISO(s);
    return p ? pad(p.d) + '.' + pad(p.m) + '.' + p.y : '';
  }

  function fmtDateTime(s) {
    if (!s) return '';
    var t = /T(\d{2}:\d{2})/.exec(s);
    return fmtDate(s) + (t ? ' ' + t[1] : '');
  }

  // Whole years between date of birth and a date.
  function ageOn(dob, onDate) {
    var b = parseISO(dob), o = parseISO(onDate);
    if (!b || !o) return null;
    var age = o.y - b.y;
    if (o.m < b.m || (o.m === b.m && o.d < b.d)) age--;
    return age >= 0 ? age : null;
  }

  function addDays(iso, n) {
    var p = parseISO(iso);
    return p ? toISO(p.y, p.m, p.d + n) : null;
  }

  // Calendar months; clamps to month end (31 Jan + 1 month = 28/29 Feb).
  function addMonths(iso, n) {
    var p = parseISO(iso);
    if (!p) return null;
    var y = p.y, m = p.m - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return toISO(y, m + 1, Math.min(p.d, last));
  }

  function daysBetween(a, b) {
    var pa = parseISO(a), pb = parseISO(b);
    if (!pa || !pb) return null;
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
  }

  var FREQUENCIES = {
    weekly: { hi: 'हर हफ़्ते', en: 'Weekly' },
    '2weeks': { hi: 'हर 2 हफ़्ते', en: 'Every 2 weeks' },
    monthly: { hi: 'हर महीने', en: 'Monthly' },
    custom: { hi: 'अन्य (दिन)', en: 'Custom (days)' }
  };

  // Next due date for an injection given on `lastDate`.
  function nextDue(lastDate, frequency, customDays) {
    if (!parseISO(lastDate)) return null;
    switch (frequency) {
      case 'weekly': return addDays(lastDate, 7);
      case '2weeks': return addDays(lastDate, 14);
      case 'monthly': return addMonths(lastDate, 1);
      case 'custom':
        var n = parseInt(customDays, 10);
        return n > 0 ? addDays(lastDate, n) : null;
      default: return null;
    }
  }

  /* For each medicine name, the latest injection and its next due date.
   * Sorted soonest first. */
  function injectionSchedule(injections, today) {
    var latest = {};
    (injections || []).forEach(function (inj) {
      var k = (inj.medicine || '').trim().toLowerCase();
      if (!k || !inj.date) return;
      if (!latest[k] || inj.date > latest[k].date) latest[k] = inj;
    });
    return Object.keys(latest).map(function (k) {
      var inj = latest[k];
      var due = nextDue(inj.date, inj.frequency, inj.customDays);
      return { medicine: inj.medicine, last: inj, due: due, daysLeft: due ? daysBetween(today, due) : null };
    }).filter(function (x) { return x.due; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  /* Tests due: rules = [{key, days}]. A test is due when its last result
   * is at least `days` old (or it has never been done). */
  function testsDue(labs, rules, today) {
    return (rules || []).map(function (r) {
      var last = null;
      (labs || []).forEach(function (l) {
        if (l.values && num(l.values[r.key]) !== null && (!last || l.date > last)) last = l.date;
      });
      var due = last ? addDays(last, r.days) : null;
      return { key: r.key, days: r.days, last: last, due: due, isDue: !last || due <= today };
    });
  }

  function testInfo(key, customTests) {
    if (TEST_BY_KEY[key]) return TEST_BY_KEY[key];
    var c = (customTests || []).filter(function (t) { return t.key === key; })[0];
    return c ? { key: c.key, hi: c.name, en: c.name, unit: c.unit || '', m: [num(c.lo), num(c.hi)], f: [num(c.lo), num(c.hi)], custom: true } : null;
  }

  /* Range used for flagging. Order: user's edited lab range, then the
   * default for the sex; when sex is unknown, the wider of the two. */
  function rangeFor(key, sex, settings, customTests) {
    var o = settings && settings.ranges && settings.ranges[key];
    if (o && (num(o.lo) !== null || num(o.hi) !== null)) return { lo: num(o.lo), hi: num(o.hi) };
    var t = testInfo(key, customTests);
    if (!t) return { lo: null, hi: null };
    if (sex === 'm' || sex === 'f') return { lo: t[sex][0], hi: t[sex][1] };
    function pick(a, b, fn) { return a === null ? null : b === null ? null : fn(a, b); }
    return { lo: pick(t.m[0], t.f[0], Math.min), hi: pick(t.m[1], t.f[1], Math.max) };
  }

  function targetFor(key, settings) {
    var o = settings && settings.targets && settings.targets[key];
    if (!o) return null;
    var lo = num(o.lo), hi = num(o.hi);
    return lo === null && hi === null ? null : { lo: lo, hi: hi };
  }

  // 'H' above range, 'L' below range, '' within / unknown.
  function flag(value, range) {
    var v = num(value);
    if (v === null || !range) return '';
    if (range.lo !== null && range.lo !== undefined && v < range.lo) return 'L';
    if (range.hi !== null && range.hi !== undefined && v > range.hi) return 'H';
    return '';
  }

  /* All values of one lab entry including calculated ones.
   * profile: {sex, dob}. Returns {key: number}. */
  function labValues(lab, profile) {
    var out = {};
    var v = (lab && lab.values) || {};
    Object.keys(v).forEach(function (k) {
      var n = num(v[k]);
      if (n !== null) out[k] = n;
    });
    var age = profile ? ageOn(profile.dob, lab.date) : null;
    var e = egfr(out.creatinine, age, profile && profile.sex);
    if (e !== null) out.egfr = e;
    var cc = correctedCalcium(out.calcium, out.albumin);
    if (cc !== null) out.ccalcium = cc;
    return out;
  }

  // Latest value of a test, its date and the previous value (for ↑/↓).
  function latestWithChange(labs, key, profile) {
    var rows = (labs || []).map(function (l) { return { date: l.date, v: labValues(l, profile)[key] }; })
      .filter(function (r) { return r.v !== undefined && r.date; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (!rows.length) return null;
    var cur = rows[0], prev = rows[1] || null;
    return {
      value: cur.v, date: cur.date,
      prev: prev ? prev.v : null, prevDate: prev ? prev.date : null,
      change: prev ? round(cur.v - prev.v, 2) : null
    };
  }

  // Parse dose timing like "1-0-1" or "½-0-1" into parts.
  function parseTiming(s) {
    if (!s) return [];
    return String(s).split(/[-–\/ ]+/).filter(function (x) { return x !== ''; });
  }

  function isCurrentMed(med, today) {
    return !med.stop || med.stop >= today;
  }

  // CKD stage hint from eGFR (G1–G5), for display next to eGFR only.
  function gfrCategory(e) {
    if (e === null || e === undefined) return '';
    if (e >= 90) return 'G1';
    if (e >= 60) return 'G2';
    if (e >= 45) return 'G3a';
    if (e >= 30) return 'G3b';
    if (e >= 15) return 'G4';
    return 'G5';
  }

  return {
    TESTS: TESTS, FREQUENCIES: FREQUENCIES,
    round: round, num: num, egfr: egfr, correctedCalcium: correctedCalcium,
    parseISO: parseISO, toISO: toISO, todayISO: todayISO, fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    ageOn: ageOn, addDays: addDays, addMonths: addMonths, daysBetween: daysBetween,
    nextDue: nextDue, injectionSchedule: injectionSchedule, testsDue: testsDue,
    testInfo: testInfo, rangeFor: rangeFor, targetFor: targetFor, flag: flag,
    labValues: labValues, latestWithChange: latestWithChange, parseTiming: parseTiming,
    isCurrentMed: isCurrentMed, gfrCategory: gfrCategory
  };
});
