/* Tiny IndexedDB wrapper. Everything stays on this device. */
(function (root) {
  'use strict';
  var DB_NAME = 'kidney-health-tracker';
  var STORES = ['labs', 'vitals', 'meds', 'injections', 'visits', 'dialysis'];
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function tx(stores, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode);
        var result;
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
        result = fn(t);
      });
    });
  }

  function reqP(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Load everything into one plain object.
  function loadAll() {
    return open().then(function (db) {
      var t = db.transaction(['meta'].concat(STORES), 'readonly');
      var out = {};
      return Promise.all([reqP(t.objectStore('meta').getAll())].concat(STORES.map(function (s) {
        return reqP(t.objectStore(s).getAll()).then(function (rows) { out[s] = rows; });
      }))).then(function (res) {
        var meta = {};
        res[0].forEach(function (r) { meta[r.key] = r.value; });
        out.profile = meta.profile || {};
        out.settings = meta.settings || {};
        return out;
      });
    });
  }

  function put(store, row) {
    if (!row.id) row.id = newId();
    return tx([store], 'readwrite', function (t) { t.objectStore(store).put(row); return row; });
  }

  function del(store, id) {
    return tx([store], 'readwrite', function (t) { t.objectStore(store).delete(id); });
  }

  function setMeta(key, value) {
    return tx(['meta'], 'readwrite', function (t) { t.objectStore('meta').put({ key: key, value: value }); });
  }

  // Replace all data in one transaction (used by restore and "delete all").
  function replaceAll(data) {
    return tx(['meta'].concat(STORES), 'readwrite', function (t) {
      t.objectStore('meta').clear();
      t.objectStore('meta').put({ key: 'profile', value: data.profile || {} });
      t.objectStore('meta').put({ key: 'settings', value: data.settings || {} });
      STORES.forEach(function (s) {
        var os = t.objectStore(s);
        os.clear();
        (data[s] || []).forEach(function (r) { os.put(r); });
      });
    });
  }

  root.KT = root.KT || {};
  root.KT.db = { STORES: STORES, loadAll: loadAll, put: put, del: del, setMeta: setMeta, replaceAll: replaceAll, newId: newId };
})(self);
