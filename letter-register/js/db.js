/* Storage: IndexedDB on this device, plus optional auto-save to a JSON file (File System Access API). */
(function (root) {
  'use strict';

  var DB_NAME = 'letter-register';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB not available')); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var s = t.objectStore(store);
        var result;
        var r = fn(s);
        if (r && 'onsuccess' in r) r.onsuccess = function () { result = r.result; };
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  function clean(e) {
    var o = {};
    Object.keys(e).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = e[k]; });
    return o;
  }

  var DB = {
    getAll: function () { return tx('entries', 'readonly', function (s) { return s.getAll(); }); },
    putMany: function (list) {
      return tx('entries', 'readwrite', function (s) { list.forEach(function (e) { s.put(clean(e)); }); });
    },
    deleteMany: function (ids) {
      return tx('entries', 'readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); });
    },
    replaceAll: function (list) {
      return tx('entries', 'readwrite', function (s) {
        s.clear();
        list.forEach(function (e) { s.put(clean(e)); });
      });
    },
    getMeta: function (key) { return tx('meta', 'readonly', function (s) { return s.get(key); }); },
    setMeta: function (key, value) { return tx('meta', 'readwrite', function (s) { s.put(value, key); }); },
    delMeta: function (key) { return tx('meta', 'readwrite', function (s) { s.delete(key); }); },
    persist: function () {
      // ask the browser not to evict our data under storage pressure
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
      return Promise.resolve(false);
    }
  };

  /* ---------- keep data in a file ---------- */

  var FileSync = {
    supported: typeof root.showSaveFilePicker === 'function' && typeof root.showOpenFilePicker === 'function',
    handle: null,
    status: 'off', // off | ok | needs-permission | error
    lastError: '',

    init: function () {
      if (!this.supported) return Promise.resolve();
      var self = this;
      return DB.getMeta('fileHandle').then(function (h) {
        if (!h) return;
        self.handle = h;
        return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
          self.status = p === 'granted' ? 'ok' : 'needs-permission';
        });
      }).catch(function (err) { self.status = 'error'; self.lastError = String(err); });
    },

    /** Must be called from a click. */
    reconnect: function () {
      var self = this;
      if (!this.handle) return Promise.resolve(false);
      return this.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
        self.status = p === 'granted' ? 'ok' : 'needs-permission';
        return p === 'granted';
      });
    },

    createNew: function (suggestedName) {
      var self = this;
      return root.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{ description: 'Letter register data (JSON)', accept: { 'application/json': ['.json'] } }]
      }).then(function (h) {
        self.handle = h; self.status = 'ok';
        return DB.setMeta('fileHandle', h);
      });
    },

    /** Pick an existing data file; returns its text. Caller decides whether to load it, then calls link(). */
    pickExisting: function () {
      return root.showOpenFilePicker({
        types: [{ description: 'Letter register data (JSON)', accept: { 'application/json': ['.json'] } }]
      }).then(function (hs) {
        var h = hs[0];
        return h.getFile().then(function (f) { return f.text(); }).then(function (text) { return { handle: h, text: text }; });
      });
    },

    link: function (h) {
      var self = this;
      self.handle = h;
      return h.requestPermission({ mode: 'readwrite' }).catch(function () { return 'prompt'; }).then(function (p) {
        self.status = p === 'granted' ? 'ok' : 'needs-permission';
        return DB.setMeta('fileHandle', h);
      });
    },

    unlink: function () {
      this.handle = null; this.status = 'off';
      return DB.delMeta('fileHandle');
    },

    write: function (text) {
      var self = this;
      if (!this.handle || this.status !== 'ok') return Promise.resolve(false);
      return this.handle.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      }).then(function () { self.lastError = ''; return true; }, function (err) {
        self.status = err && err.name === 'NotAllowedError' ? 'needs-permission' : 'error';
        self.lastError = String(err && err.message || err);
        return false;
      });
    }
  };

  root.LRDB = DB;
  root.LRFileSync = FileSync;
})(typeof self !== 'undefined' ? self : this);
