/*
 * Word (.docx) export, built in the browser with the vendored `docx` library.
 * mode "unicode": Unicode Hindi in Nirmala UI / Mangal.
 * mode "kruti":   text converted to Kruti Dev, with the Kruti Dev font applied
 *                 (English words stay in Times New Roman).
 */
(function (root) {
  'use strict';

  function mmToTwip(mm) { return Math.round(Number(mm) * 1440 / 25.4); }

  function buildDocument(blocks, settings, mode) {
    var D = root.docx;
    var K = root.KrutiDev;
    var kruti = mode === 'kruti';
    var m = settings.margins;
    var contentWidth = mmToTwip(210 - m.left - m.right);
    var ptSize = kruti ? Number(settings.krutiFontSize || 16) : Number(settings.fontSize || 13);
    var halfPts = Math.round(ptSize * 2);
    var lineTwips = Math.round(240 * (kruti ? 1.15 : 1.25));
    var indent = mmToTwip(12.7);
    var labelIndent = mmToTwip(18);

    function fontSpec(name) {
      return { ascii: name, hAnsi: name, cs: name, eastAsia: name };
    }

    function runs(text, opts) {
      opts = opts || {};
      var base = { size: opts.size || halfPts, sizeComplexScript: opts.size || halfPts, bold: !!opts.bold, boldComplexScript: !!opts.bold };
      if (!kruti) {
        return [new D.TextRun(Object.assign({ text: text, font: fontSpec(settings.unicodeFont || 'Nirmala UI'), language: { value: 'hi-IN', bidirectional: 'hi-IN' } }, base))];
      }
      return K.unicodeToKrutiSegments(text).map(function (seg) {
        return new D.TextRun(Object.assign({
          text: seg.text,
          font: fontSpec(seg.latin ? 'Times New Roman' : settings.krutiFont)
        }, base, seg.latin ? { size: Math.round(halfPts * 0.8), sizeComplexScript: Math.round(halfPts * 0.8) } : {}));
      });
    }

    function tab() { return new D.TextRun({ children: [new D.Tab()] }); }
    function lineBreak() { return new D.TextRun({ break: 1 }); }
    function spaceBefore(blk) { return Math.round((blk.space || 0) * ptSize * 20 * 1.2); }

    var paras = [];
    blocks.forEach(function (blk) {
      var spacing = { before: spaceBefore(blk), after: 0, line: lineTwips };
      switch (blk.t) {
        case 'center':
          paras.push(new D.Paragraph({
            alignment: D.AlignmentType.CENTER, spacing: spacing,
            children: runs(blk.text, { bold: true, size: Math.round(halfPts * (blk.size || 1)) })
          }));
          break;
        case 'numdate':
          paras.push(new D.Paragraph({
            spacing: spacing, keepNext: !!blk.keepNext,
            tabStops: [{ type: D.TabStopType.RIGHT, position: contentWidth }],
            children: runs(blk.left).concat([tab()], runs(blk.right))
          }));
          break;
        case 'line':
          paras.push(new D.Paragraph({ spacing: spacing, keepNext: true, children: runs(blk.text) }));
          break;
        case 'indent':
          blk.lines.forEach(function (l, i) {
            paras.push(new D.Paragraph({
              spacing: Object.assign({}, spacing, { before: i === 0 ? spacing.before : 0 }),
              indent: { left: indent }, keepNext: true, children: runs(l)
            }));
          });
          break;
        case 'labeled':
          var kids = runs(blk.label).concat([tab()]);
          blk.lines.forEach(function (l, i) {
            if (i > 0) kids.push(lineBreak());
            kids = kids.concat(runs(l));
          });
          paras.push(new D.Paragraph({
            spacing: spacing, alignment: D.AlignmentType.JUSTIFIED,
            indent: { left: labelIndent, hanging: labelIndent },
            tabStops: [{ type: D.TabStopType.LEFT, position: labelIndent }],
            children: kids
          }));
          break;
        case 'para':
          if (blk.num) {
            paras.push(new D.Paragraph({
              spacing: spacing, alignment: D.AlignmentType.JUSTIFIED,
              indent: { left: indent, hanging: mmToTwip(8) },
              tabStops: [{ type: D.TabStopType.LEFT, position: indent }],
              children: runs(blk.num).concat([tab()], runs(blk.text))
            }));
          } else {
            paras.push(new D.Paragraph({
              spacing: spacing, alignment: D.AlignmentType.JUSTIFIED,
              indent: { firstLine: indent }, children: runs(blk.text)
            }));
          }
          break;
        case 'copyline':
          paras.push(new D.Paragraph({
            spacing: spacing, alignment: D.AlignmentType.JUSTIFIED, children: runs(blk.text)
          }));
          break;
        case 'right':
          blk.lines.forEach(function (l, i) {
            paras.push(new D.Paragraph({
              alignment: D.AlignmentType.RIGHT, keepLines: true, keepNext: i < blk.lines.length - 1,
              spacing: Object.assign({}, spacing, { before: i === 0 ? spacing.before : 0 }),
              children: runs(l)
            }));
          });
          break;
      }
    });

    return new D.Document({
      creator: 'Letter Maker',
      title: 'Letter',
      styles: {
        default: {
          document: {
            run: kruti
              ? { font: fontSpec(settings.krutiFont), size: halfPts }
              : { font: fontSpec(settings.unicodeFont || 'Nirmala UI'), size: halfPts, sizeComplexScript: halfPts }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: mmToTwip(m.top), bottom: mmToTwip(m.bottom), left: mmToTwip(m.left), right: mmToTwip(m.right) }
          }
        },
        children: paras
      }]
    });
  }

  function toBlob(blocks, settings, mode) {
    return root.docx.Packer.toBlob(buildDocument(blocks, settings, mode));
  }

  root.DocxExport = { toBlob: toBlob, buildDocument: buildDocument };
})(typeof self !== 'undefined' ? self : this);
