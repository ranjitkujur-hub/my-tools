/* Table building plus CSV and XLSX (Office Open XML) export.
 * The XLSX writer is a small self-contained zip (stored, no compression)
 * so no library or network is needed. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var m = factory(isNode ? require('./calc.js') : root.KT.calc);
  if (isNode) module.exports = m;
  else { root.KT = root.KT || {}; root.KT.exporter = m; }
})(typeof self !== 'undefined' ? self : this, function (calc) {
  'use strict';

  function str(v) { return v === null || v === undefined ? '' : String(v); }

  /* ---------- tables: {name, header: [], rows: [[]]} ---------- */

  function labKeysUsed(labs, profile, customTests) {
    var used = {};
    (labs || []).forEach(function (l) {
      Object.keys(calc.labValues(l, profile)).forEach(function (k) { used[k] = true; });
    });
    var keys = calc.TESTS.map(function (t) { return t.key; })
      .concat((customTests || []).map(function (t) { return t.key; }));
    return keys.filter(function (k) { return used[k]; });
  }

  function labsTable(data) {
    var profile = data.profile || {}, custom = (data.settings && data.settings.customTests) || [];
    var labs = (data.labs || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var keys = labKeysUsed(labs, profile, custom);
    var header = ['Date / तारीख', 'Lab / लैब'].concat(keys.map(function (k) {
      var t = calc.testInfo(k, custom);
      return t.en + (t.unit ? ' (' + t.unit + ')' : '');
    })).concat(['Lab-reported eGFR', 'Notes / नोट']);
    var rows = labs.map(function (l) {
      var v = calc.labValues(l, profile);
      return [calc.fmtDate(l.date), str(l.labName)]
        .concat(keys.map(function (k) { return v[k] === undefined ? '' : v[k]; }))
        .concat([calc.num(l.labEgfr) === null ? '' : calc.num(l.labEgfr), str(l.notes)]);
    });
    return { name: 'Lab results', header: header, rows: rows };
  }

  function simpleTable(name, list, cols, sortKey) {
    var rows = (list || []).slice().sort(function (a, b) {
      return str(a[sortKey]) < str(b[sortKey]) ? -1 : 1;
    }).map(function (r) {
      return cols.map(function (c) {
        var v = r[c[0]];
        if (c[2] === 'date') return calc.fmtDate(v);
        if (c[2] === 'datetime') return calc.fmtDateTime(v);
        if (c[2] === 'num') return calc.num(v) === null ? '' : calc.num(v);
        return str(v);
      });
    });
    return { name: name, header: cols.map(function (c) { return c[1]; }), rows: rows };
  }

  function allTables(data) {
    var p = data.profile || {};
    var profileRows = [
      ['Name / नाम', p.name], ['Sex / लिंग', p.sex === 'f' ? 'Female' : p.sex === 'm' ? 'Male' : ''],
      ['Date of birth / जन्म तिथि', calc.fmtDate(p.dob)], ['Height (cm)', p.height],
      ['Diagnosis / निदान', p.diagnosis], ['CKD stage', p.stage], ['Blood group', p.bloodGroup],
      ['Allergies / एलर्जी', p.allergies], ['Cautions / सावधानियाँ', p.cautions],
      ['Doctor / डॉक्टर', p.doctor], ['Doctor phone', p.doctorPhone],
      ['Hospital / अस्पताल', p.hospital], ['Hospital phone', p.hospitalPhone]
    ].map(function (r) { return [r[0], str(r[1])]; });
    var tables = [
      { name: 'Profile', header: ['Field', 'Value'], rows: profileRows },
      labsTable(data),
      simpleTable('Vitals', data.vitals, [['datetime', 'Date time', 'datetime'], ['sys', 'BP systolic', 'num'], ['dia', 'BP diastolic', 'num'],
        ['pulse', 'Pulse', 'num'], ['weight', 'Weight (kg)', 'num'], ['urine', 'Urine output (mL)', 'num'], ['notes', 'Symptoms / notes']], 'datetime'),
      simpleTable('Medicines', data.meds, [['name', 'Medicine'], ['strength', 'Strength'], ['dose', 'Dose'], ['timing', 'Timing'],
        ['food', 'Food'], ['start', 'Start', 'date'], ['stop', 'Stop', 'date'], ['prescribedBy', 'Prescribed by'], ['notes', 'Notes']], 'start'),
      simpleTable('Injections', data.injections, [['date', 'Date', 'date'], ['medicine', 'Medicine / brand'], ['dose', 'Dose', 'num'], ['unit', 'Unit'],
        ['site', 'Site'], ['givenBy', 'Given by'], ['frequency', 'Frequency'], ['customDays', 'Custom days', 'num'], ['notes', 'Notes']], 'date'),
      simpleTable('Doctor visits', data.visits, [['date', 'Date', 'date'], ['doctor', 'Doctor'], ['hospital', 'Hospital'], ['advice', 'Advice'],
        ['nextDate', 'Next visit', 'date'], ['questions', 'Questions']], 'date')
    ];
    if ((data.dialysis || []).length) {
      tables.push(simpleTable('Dialysis', data.dialysis, [['date', 'Date', 'date'], ['type', 'Type'], ['preWeight', 'Pre weight', 'num'],
        ['postWeight', 'Post weight', 'num'], ['uf', 'UF (mL)', 'num'], ['preBP', 'Pre BP'], ['postBP', 'Post BP'],
        ['hours', 'Hours', 'num'], ['notes', 'Notes']], 'date'));
    }
    return tables;
  }

  /* ---------- CSV ---------- */

  function csvCell(v) {
    if (typeof v === 'number') return String(v);
    var s = str(v);
    // Stop spreadsheet formula injection from free-text fields.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // CSV with a UTF-8 BOM so Excel shows Hindi text correctly.
  function toCSV(table) {
    var lines = [table.header].concat(table.rows).map(function (r) { return r.map(csvCell).join(','); });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /* ---------- XLSX ---------- */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Minimal zip writer (method 0 = stored), UTF-8 file names.
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = new Uint8Array([].concat(u32(0x04034b50), common));
      parts.push(local, name, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    var all = parts.concat(central, [end]);
    var total = all.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function xmlEsc(s) {
    return str(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function sheetXml(table) {
    var rows = [table.header].concat(table.rows).map(function (r, ri) {
      var cells = r.map(function (v, ci) {
        var ref = colName(ci) + (ri + 1);
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
        if (v === '' || v === null || v === undefined) return '';
        return '<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetData>' + rows + '</sheetData></worksheet>';
  }

  function safeSheetName(n, used) {
    var s = str(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet';
    var base = s, i = 2;
    while (used[s.toLowerCase()]) { s = base.slice(0, 28) + ' ' + i++; }
    used[s.toLowerCase()] = true;
    return s;
  }

  // Returns a Uint8Array .xlsx file, one sheet per table.
  function toXLSX(tables) {
    var used = {};
    var names = tables.map(function (t) { return safeSheetName(t.name, used); });
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        tables.map(function (t, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) { return '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        tables.map(function (t, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (tables.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>' }
    ].concat(tables.map(function (t, i) { return { name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(t) }; }));
    return zip(files);
  }

  return {
    labsTable: labsTable, allTables: allTables, toCSV: toCSV, toXLSX: toXLSX,
    crc32: crc32, zip: zip, colName: colName, labKeysUsed: labKeysUsed
  };
});
