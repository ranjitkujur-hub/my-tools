const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('normalisation is forgiving', () => {
  const n = C.normalizeSearch;
  assert.equal(n('सड़क'), n('सडक'));          // nukta (decomposed)
  assert.equal(n('\u095C'), n('\u0922'.replace('\u0922', '\u0921')));  // precomposed ड़ → ड
  assert.equal(n('फ़ाइल'), n('फाइल'));
  assert.equal(n('बाँध'), n('बांध'));         // chandrabindu ≈ anusvara
  assert.equal(n('प्रमण्डल'), n('प्रमंडल'));   // half nasal ≈ anusvara
  assert.equal(n('सम्बन्ध'), n('संबंध'));
  assert.equal(n('सितम्बर'), n('सितंबर'));
  assert.equal(n('१२३/२०२६'), '123 2026');     // Devanagari digits, punctuation
  assert.equal(n('  Land   ACQUISITION '), 'land acquisition');
  assert.equal(n('Café'), 'cafe');
  assert.equal(n('क\u200Dष'), n('कष'));       // zero width joiner
});

test('search matches across all fields, all words required', () => {
  const e = C.sanitizeEntry({
    id: 'a', type: 'in', letterNo: 'नमूना-101/2026', date: '15.03.2026', from: 'उपायुक्त, काल्पनिक जिला',
    subject: 'भू-अर्जन हेतु प्राक्कलन', matters: ['बाँध भू-अर्जन'], summary: 'राशि रु. 12,34,000', remarks: 'Urgent file',
    fileLocation: 'C:\\Users\\Example\\letter.pdf', status: 'pending'
  });
  assert.ok(C.matchesQuery(e, 'प्राक्कलन'));
  assert.ok(C.matchesQuery(e, 'बांध'));            // matter, anusvara spelling
  assert.ok(C.matchesQuery(e, '101/2026'));
  assert.ok(C.matchesQuery(e, '१०१'));
  assert.ok(C.matchesQuery(e, 'urgent उपायुक्त'));
  assert.ok(C.matchesQuery(e, 'letter.pdf'));
  assert.ok(C.matchesQuery(e, '15.03.2026'));
  assert.ok(C.matchesQuery(e, 'लंबित'));            // status label
  assert.ok(C.matchesQuery(e, 'incoming'));        // type label in English
  assert.ok(C.matchesQuery(e, ''));
  assert.ok(!C.matchesQuery(e, 'प्राक्कलन जावक'));
});

test('filters by type, matter, status, from and to', () => {
  const es = [
    { id: '1', type: 'in', from: 'उपायुक्त', to: 'कार्यपालक अभियंता', matters: ['A'], status: 'pending' },
    { id: '2', type: 'out', from: 'कार्यपालक अभियंता', to: 'उपायुक्त', matters: ['A', 'B'], status: 'closed' },
    { id: '3', type: 'event', matters: ['B'], status: 'info' }
  ].map(e => C.sanitizeEntry(e));
  const ids = f => C.filterEntries(es, f).map(e => e.id);
  assert.deepEqual(ids({ type: 'out' }), ['2']);
  assert.deepEqual(ids({ matter: 'B' }), ['2', '3']);
  assert.deepEqual(ids({ status: 'pending' }), ['1']);
  assert.deepEqual(ids({ from: 'उपायुक्त' }), ['1']);
  assert.deepEqual(ids({ to: 'उपायुक्त' }), ['2']);
  assert.deepEqual(ids({ matter: 'A', q: 'pending' }), ['1']);
});
