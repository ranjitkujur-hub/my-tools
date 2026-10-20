/*
 * Browser storage (localStorage) for settings, saved letters, user templates
 * and the letter currently being edited. Backup / restore as one JSON file.
 */
(function (root) {
  'use strict';
  var KEY = 'letterMaker.v1';
  var M = root.LetterModel;

  function blank() {
    return { settings: M.defaultSettings(), letters: [], templates: [], current: null };
  }

  function mergeSettings(s) {
    var d = M.defaultSettings();
    s = s || {};
    var out = Object.assign({}, d, s);
    out.margins = Object.assign({}, d.margins, s.margins || {});
    if (!Array.isArray(out.addressees)) out.addressees = d.addressees;
    if (!Array.isArray(out.phrases)) out.phrases = d.phrases;
    return out;
  }

  function normalize(data) {
    data = data || {};
    return {
      settings: mergeSettings(data.settings),
      letters: Array.isArray(data.letters) ? data.letters : [],
      templates: Array.isArray(data.templates) ? data.templates : [],
      current: data.current || null
    };
  }

  var memory = null; // used if localStorage is blocked

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : blank();
    } catch (e) {
      return memory ? normalize(memory) : blank();
    }
  }

  function save(data) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      memory = JSON.parse(JSON.stringify(data));
      return false;
    }
  }

  function backupJSON(data) {
    return JSON.stringify({
      app: 'letter-maker',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { settings: data.settings, letters: data.letters, templates: data.templates }
    }, null, 2);
  }

  function parseBackup(text) {
    var obj = JSON.parse(text);
    if (!obj || obj.app !== 'letter-maker' || !obj.data) throw new Error('यह पत्र निर्माता की बैकअप फ़ाइल नहीं है / Not a Letter Maker backup file');
    return normalize(obj.data);
  }

  root.LetterStore = { load: load, save: save, backupJSON: backupJSON, parseBackup: parseBackup, normalize: normalize };
})(typeof self !== 'undefined' ? self : this);
