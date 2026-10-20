const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const D = require('../js/docx.js');

test('crc32 matches the standard check value', () => {
  assert.equal(D.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('docx is a valid zip with Unicode Hindi, repeated header row and font fallback', () => {
  const bytes = D.buildDocx([
    { type: 'p', text: 'कार्यालय & <परीक्षण>', bold: true, align: 'center' },
    { type: 'table', headers: ['क्रम सं.', 'विषय / सार'], rows: [['1.', 'पंक्ति 1\nपंक्ति 2']], widths: [1, 5] }
  ], { landscape: true, title: 'घटनाक्रम — परीक्षण' });
  const zip = XLSX.CFB.read(Buffer.from(bytes), { type: 'buffer' });
  const names = zip.FullPaths.map(p => p.replace(/^Root Entry\//, ''));
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/fontTable.xml']) {
    assert.ok(names.some(x => x.endsWith(n)), n);
  }
  const get = n => Buffer.from(zip.FileIndex[zip.FullPaths.findIndex(p => p.endsWith('/' + n))].content).toString('utf8');
  const doc = get('word/document.xml');
  assert.match(doc, /कार्यालय &amp; &lt;परीक्षण&gt;/);
  assert.match(doc, /<w:tblHeader\/>/);
  assert.match(doc, /w:orient="landscape"/);
  assert.match(doc, /पंक्ति 1<\/w:t><w:br\/>/);
  assert.match(doc, /w:cs="Nirmala UI"/);
  assert.match(get('word/fontTable.xml'), /<w:altName w:val="Mangal"\/>/);
});
