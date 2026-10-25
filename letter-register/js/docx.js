/* Minimal .docx writer (Unicode, Nirmala UI with Mangal fallback). No dependencies. Browser: window.LRDocx; Node: require. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LRDocx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FONT = 'Nirmala UI';
  var FALLBACK_FONT = 'Mangal';

  /* ---------- zip (stored, no compression) ---------- */

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

  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(files) {
    var chunks = [], central = [], offset = 0;
    var u16 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF]; };
    var u32 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; };
    files.forEach(function (f) {
      var name = utf8(f.name);
      var data = typeof f.data === 'string' ? utf8(f.data) : f.data;
      var crc = crc32(data);
      // 0x0800 = names are UTF-8; DOS time/date fixed at 01.01.2020
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x5021), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = new Uint8Array([].concat(u32(0x04034b50), common));
      chunks.push(local, name, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    var all = chunks.concat(central, [end]);
    var total = all.reduce(function (s, c) { return s + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  /* ---------- WordprocessingML ---------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function run(text, o) {
    o = o || {};
    var props = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '"/>' +
      (o.bold ? '<w:b/><w:bCs/>' : '') +
      '<w:sz w:val="' + (o.size || 22) + '"/><w:szCs w:val="' + (o.size || 22) + '"/><w:lang w:val="en-IN" w:bidi="hi-IN"/></w:rPr>';
    var lines = String(text === null || text === undefined ? '' : text).split('\n');
    return '<w:r>' + props + lines.map(function (l, i) {
      return (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + esc(l) + '</w:t>';
    }).join('') + '</w:r>';
  }

  function para(text, o) {
    o = o || {};
    var ppr = '<w:pPr>' + (o.keepNext ? '<w:keepNext/>' : '') +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after === undefined ? 120 : o.after) + '"/>' +
      (o.indent ? '<w:ind w:left="' + o.indent + '" w:hanging="' + o.indent + '"/>' : '') +
      (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') + '</w:pPr>';
    return '<w:p>' + ppr + run(text, o) + '</w:p>';
  }

  function table(headers, rows, widths, totalWidth, size) {
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);
    var tw = widths.map(function (w) { return Math.floor(w / sum * totalWidth); });
    var border = '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
    var cell = function (text, i, header) {
      return '<w:tc><w:tcPr><w:tcW w:w="' + tw[i] + '" w:type="dxa"/>' + (header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : '') +
        '</w:tcPr>' + para(text, { bold: header, size: size, after: 0, align: header ? 'center' : null }) + '</w:tc>';
    };
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + totalWidth + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' + border +
      '</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      tw.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
    // header row repeats on every page
    xml += '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' + headers.map(function (h, i) { return cell(h, i, true); }).join('') + '</w:tr>';
    rows.forEach(function (r) {
      xml += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + r.map(function (c, i) { return cell(c, i, false); }).join('') + '</w:tr>';
    });
    return xml + '</w:tbl>';
  }

  /**
   * blocks: [{type:'p', text, bold, align:'center'|'right'|'left', size (half-points), indent},
   *          {type:'table', headers, rows, widths}]
   * opts: {landscape, title}
   */
  function buildDocx(blocks, opts) {
    opts = opts || {};
    var W = 11906, H = 16838, margin = 1000;
    var pageW = opts.landscape ? H : W, pageH = opts.landscape ? W : H;
    var textWidth = pageW - 2 * margin;
    var body = blocks.map(function (b) {
      if (b.type === 'table') return table(b.headers, b.rows, b.widths || b.headers.map(function () { return 1; }), textWidth, b.size || 20);
      return para(b.text, b);
    }).join('');
    var sect = '<w:sectPr><w:pgSz w:w="' + pageW + '" w:h="' + pageH + '"' + (opts.landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + margin + '" w:right="' + margin + '" w:bottom="' + margin + '" w:left="' + margin + '" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>';
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ' + NS + '><w:body>' + body + '<w:p/>' + sect + '</w:body></w:document>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
      '<w:lang w:val="en-IN" w:bidi="hi-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    // Word substitutes w:altName when the main font is missing (older Windows without Nirmala UI → Mangal)
    var fontTable = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts ' + NS + '>' +
      '<w:font w:name="' + FONT + '"><w:altName w:val="' + FALLBACK_FONT + '"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>' +
      '<w:font w:name="' + FALLBACK_FONT + '"><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font></w:fonts>';
    var settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ' + NS + '><w:themeFontLang w:val="en-IN" w:bidi="hi-IN"/></w:settings>';
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>';
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(opts.title || '') + '</dc:title><dc:creator>पत्र पंजी / Letter Register</dc:creator></cp:coreProperties>';
    return zip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rels },
      { name: 'word/document.xml', data: document },
      { name: 'word/_rels/document.xml.rels', data: docRels },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/fontTable.xml', data: fontTable },
      { name: 'word/settings.xml', data: settings },
      { name: 'docProps/core.xml', data: core }
    ]);
  }

  return { buildDocx: buildDocx, zip: zip, crc32: crc32, FONT: FONT, FALLBACK_FONT: FALLBACK_FONT };
});
