/* Backup file format, optional AES-GCM encryption (PBKDF2 key) and
 * restore parsing / preview. Uses WebCrypto (browser and Node 20+). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.KT = root.KT || {}; root.KT.backup = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP_ID = 'kidney-health-tracker';
  var FORMAT_VERSION = 1;
  var PBKDF2_ITERATIONS = 310000;
  var STORES = ['labs', 'vitals', 'meds', 'injections', 'visits', 'dialysis'];

  function subtle() {
    var c = (typeof crypto !== 'undefined' && crypto) || null;
    if (!c || !c.subtle) throw new Error('WebCrypto is not available');
    return c.subtle;
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  function toB64(bytes) {
    var s = '';
    var b = new Uint8Array(bytes);
    for (var i = 0; i < b.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function fromB64(str) {
    var s = atob(str);
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function deriveKey(password, salt, iterations) {
    return subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return subtle().deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  // Strip things that must not travel in a backup (the device PIN).
  function cleanData(data) {
    var out = { profile: data.profile || {}, settings: Object.assign({}, data.settings || {}) };
    delete out.settings.pin;
    delete out.settings.lastBackup;
    STORES.forEach(function (s) { out[s] = Array.isArray(data[s]) ? data[s] : []; });
    return out;
  }

  /* Build the backup file text. With a password the data is encrypted;
   * returns a Promise<string> either way. */
  function createBackup(data, password, now) {
    var payload = cleanData(data);
    var head = { app: APP_ID, version: FORMAT_VERSION, exportedAt: (now || new Date()).toISOString() };
    if (!password) {
      return Promise.resolve(JSON.stringify(Object.assign(head, { encrypted: false, data: payload }), null, 1));
    }
    var salt = randomBytes(16), iv = randomBytes(12);
    return deriveKey(password, salt, PBKDF2_ITERATIONS).then(function (key) {
      return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    }).then(function (ct) {
      return JSON.stringify(Object.assign(head, {
        encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt) },
        cipher: { name: 'AES-GCM', iv: toB64(iv) },
        ciphertext: toB64(ct)
      }), null, 1);
    });
  }

  // Read the outer file without decrypting. Throws on a foreign file.
  function inspectBackup(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('NOT_JSON'); }
    if (!obj || obj.app !== APP_ID) throw new Error('NOT_BACKUP');
    if (obj.version > FORMAT_VERSION) throw new Error('TOO_NEW');
    return { encrypted: !!obj.encrypted, exportedAt: obj.exportedAt, raw: obj };
  }

  function validate(data) {
    if (!data || typeof data !== 'object') throw new Error('BAD_DATA');
    var out = cleanData(data);
    STORES.forEach(function (s) {
      out[s] = out[s].filter(function (r) { return r && typeof r === 'object' && r.id; });
    });
    return out;
  }

  /* Parse a backup file into data. Encrypted files need the password;
   * a wrong password rejects with Error('BAD_PASSWORD'). */
  function readBackup(text, password) {
    var info;
    try { info = inspectBackup(text); } catch (e) { return Promise.reject(e); }
    var obj = info.raw;
    if (!obj.encrypted) {
      try { return Promise.resolve(validate(obj.data)); } catch (e) { return Promise.reject(e); }
    }
    if (!password) return Promise.reject(new Error('NEED_PASSWORD'));
    return deriveKey(password, fromB64(obj.kdf.salt), obj.kdf.iterations).then(function (key) {
      return subtle().decrypt({ name: 'AES-GCM', iv: fromB64(obj.cipher.iv) }, key, fromB64(obj.ciphertext));
    }).then(function (pt) {
      return validate(JSON.parse(new TextDecoder().decode(pt)));
    }, function () {
      throw new Error('BAD_PASSWORD');
    });
  }

  // Counts and date spans shown before the user confirms a restore.
  function previewData(data) {
    var p = { name: (data.profile && data.profile.name) || '', counts: {}, from: null, to: null };
    STORES.forEach(function (s) {
      var rows = data[s] || [];
      p.counts[s] = rows.length;
      rows.forEach(function (r) {
        var d = (r.date || r.datetime || r.start || '').slice(0, 10);
        if (!d) return;
        if (!p.from || d < p.from) p.from = d;
        if (!p.to || d > p.to) p.to = d;
      });
    });
    return p;
  }

  /* PIN hashing for the casual app lock (PBKDF2-SHA-256). */
  function hashPin(pin, saltB64) {
    var salt = saltB64 ? fromB64(saltB64) : randomBytes(16);
    return subtle().importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits'])
      .then(function (base) {
        return subtle().deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, base, 256);
      }).then(function (bits) { return { salt: toB64(salt), hash: toB64(bits) }; });
  }

  function checkPin(pin, stored) {
    if (!stored) return Promise.resolve(true);
    return hashPin(pin, stored.salt).then(function (h) { return h.hash === stored.hash; });
  }

  return {
    APP_ID: APP_ID, FORMAT_VERSION: FORMAT_VERSION, STORES: STORES,
    createBackup: createBackup, inspectBackup: inspectBackup, readBackup: readBackup,
    previewData: previewData, hashPin: hashPin, checkPin: checkPin, toB64: toB64, fromB64: fromB64
  };
});
