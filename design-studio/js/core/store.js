/* Project data format (pure functions; IndexedDB access is in js/db.js).
 * A saved design: {id, project, structure, module, title, drawingNo, inputs, created, updated}. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.DS = root.DS || {}; root.DS.store = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP = 'design-studio', VERSION = 1;

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nowISO() { return new Date().toISOString(); }

  function makeDesign(o) {
    var t = nowISO();
    return {
      id: o.id || newId(), project: String(o.project || 'Untitled project').trim(), structure: String(o.structure || '').trim(),
      module: o.module, title: String(o.title || '').trim(), drawingNo: String(o.drawingNo || '').trim(),
      inputs: o.inputs || {}, created: o.created || t, updated: t
    };
  }

  function duplicate(d) {
    var c = JSON.parse(JSON.stringify(d));
    c.id = newId();
    c.title = (d.title || d.structure || 'Design') + ' (copy)';
    c.created = c.updated = nowISO();
    return c;
  }

  // Group designs by project, then by structure.
  function group(designs) {
    var projects = {};
    designs.forEach(function (d) {
      var p = projects[d.project] = projects[d.project] || {};
      (p[d.structure || '—'] = p[d.structure || '—'] || []).push(d);
    });
    return Object.keys(projects).sort().map(function (name) {
      return { name: name, structures: Object.keys(projects[name]).sort().map(function (s) {
        return { name: s, designs: projects[name][s].sort(function (a, b) { return b.updated < a.updated ? -1 : 1; }) };
      }) };
    });
  }

  function exportDesigns(designs, kind) {
    return { app: APP, version: VERSION, kind: kind || 'designs', exported: nowISO(), designs: designs };
  }

  function backup(settings, designs) {
    return { app: APP, version: VERSION, kind: 'backup', exported: nowISO(), settings: settings || {}, designs: designs };
  }

  function validDesign(d) {
    return d && typeof d === 'object' && typeof d.module === 'string' && d.module &&
      typeof d.inputs === 'object' && d.inputs !== null && !Array.isArray(d.inputs);
  }

  // Parse an imported file. Returns {kind, designs, settings}; throws on bad files.
  function parseImport(text) {
    var j;
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('यह JSON फ़ाइल नहीं है / Not a JSON file'); }
    if (!j || j.app !== APP) throw new Error('यह इस ऐप की फ़ाइल नहीं है / Not a Design Studio file');
    if (j.version > VERSION) throw new Error('नए संस्करण की फ़ाइल / File is from a newer version');
    var list = Array.isArray(j.designs) ? j.designs : [];
    var bad = list.filter(function (d) { return !validDesign(d); }).length;
    if (bad) throw new Error(bad + ' अमान्य प्रविष्टि / invalid design record(s)');
    var designs = list.map(function (d) {
      return { id: String(d.id || newId()), project: String(d.project || 'Imported'), structure: String(d.structure || ''), module: d.module,
        title: String(d.title || ''), drawingNo: String(d.drawingNo || ''), inputs: d.inputs, created: d.created || nowISO(), updated: d.updated || nowISO() };
    });
    return { kind: j.kind === 'backup' ? 'backup' : 'designs', designs: designs, settings: j.kind === 'backup' ? (j.settings || {}) : null };
  }

  // Imported designs get new ids when they would overwrite an existing one.
  function mergeIds(existing, incoming) {
    var ids = {};
    existing.forEach(function (d) { ids[d.id] = true; });
    return incoming.map(function (d) { if (ids[d.id]) { d = JSON.parse(JSON.stringify(d)); d.id = newId(); } ids[d.id] = true; return d; });
  }

  var DEFAULT_SETTINGS = {
    office: 'कार्यालय का नाम / Office name (set in Settings)',
    designed: '', checked: '', approved: '',
    prefix: 'DS', sheet: 'A3'
  };

  return { APP: APP, VERSION: VERSION, newId: newId, makeDesign: makeDesign, duplicate: duplicate, group: group,
    exportDesigns: exportDesigns, backup: backup, parseImport: parseImport, mergeIds: mergeIds, validDesign: validDesign,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS };
});
