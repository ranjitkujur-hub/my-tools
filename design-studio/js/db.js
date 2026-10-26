/* Tiny IndexedDB wrapper: saved designs and settings. Everything stays on this device. */
(function (root) {
  'use strict';
  var DB_NAME = 'design-studio';
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB not available')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function tx(stores, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode), result;
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
        result = fn(t);
      });
    });
  }

  function getAll(store) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  var DB = {
    designs: function () { return getAll('designs'); },
    get: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var r = db.transaction('designs', 'readonly').objectStore('designs').get(id);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { reject(r.error); };
        });
      });
    },
    put: function (d) { return tx(['designs'], 'readwrite', function (t) { t.objectStore('designs').put(d); return d; }); },
    putMany: function (list) { return tx(['designs'], 'readwrite', function (t) { list.forEach(function (d) { t.objectStore('designs').put(d); }); return list.length; }); },
    del: function (id) { return tx(['designs'], 'readwrite', function (t) { t.objectStore('designs').delete(id); }); },
    settings: function () {
      return getAll('kv').then(function (rows) {
        var s = rows.filter(function (r) { return r.key === 'settings'; })[0];
        return s ? s.value : {};
      });
    },
    saveSettings: function (s) { return tx(['kv'], 'readwrite', function (t) { t.objectStore('kv').put({ key: 'settings', value: s }); }); },
    // Restore: replace every design and the settings.
    replaceAll: function (designs, settings) {
      return tx(['designs', 'kv'], 'readwrite', function (t) {
        var st = t.objectStore('designs');
        st.clear();
        designs.forEach(function (d) { st.put(d); });
        if (settings) t.objectStore('kv').put({ key: 'settings', value: settings });
        return designs.length;
      });
    }
  };
  root.DS = root.DS || {};
  root.DS.db = DB;
})(typeof self !== 'undefined' ? self : this);
