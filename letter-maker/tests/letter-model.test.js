'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.self = global;
const M = require('../js/letter-model.js');
global.LetterModel = M;
require('../js/store.js');
const Store = global.LetterStore;

function sample() {
  const l = M.newLetter(M.defaultSettings());
  l.number = '123';          // fictional sample data
  l.date = '2026-08-12';
  l.subject = 'नमूना विषय';
  l.body = 'पहला अनुच्छेद।\nदूसरा अनुच्छेद।';
  return l;
}

test('date is printed as DD.MM.YYYY, optionally in Devanagari digits', () => {
  assert.equal(M.formatDate('2026-08-12'), '12.08.2026');
  assert.equal(M.toDevanagariDigits('12.08.2026'), '१२.०८.२०२६');
  const l = sample();
  l.devanagariDigits = true;
  const nd = M.buildBlocks(l).find((b) => b.t === 'numdate');
  assert.equal(nd.right, 'दिनांक— १२.०८.२०२६');
});

test('letterhead, number/date line, sender and addressee', () => {
  const blocks = M.buildBlocks(sample());
  const centers = blocks.filter((b) => b.t === 'center').map((b) => b.text);
  assert.deepEqual(centers, ['झारखण्ड सरकार', 'जल संसाधन विभाग', 'कार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट']);
  const nd = blocks.find((b) => b.t === 'numdate');
  assert.equal(nd.left, 'पत्रांक— 123');
  assert.equal(nd.right, 'दिनांक— 12.08.2026');
  const indents = blocks.filter((b) => b.t === 'indent');
  assert.deepEqual(indents[0].lines, ['कार्यपालक अभियंता,', 'तेनुघाट बाँध प्रमण्डल, तेनुघाट।']);
  assert.deepEqual(indents[1].lines, ['अधीक्षण अभियंता,', 'तेनुघाट बाँध अंचल, तेनुघाट।']);
});

test('blank number/date prints dotted lines; sender can be hidden', () => {
  const l = sample();
  l.blankNumberDate = true;
  l.showSender = false;
  const blocks = M.buildBlocks(l);
  const nd = blocks.find((b) => b.t === 'numdate');
  assert.match(nd.left, /^पत्रांक— \.{10,}$/);
  assert.match(nd.right, /^दिनांक— \.{10,}$/);
  assert.ok(!blocks.some((b) => b.text === 'प्रेषक,'));
});

test('numbered paragraphs and enclosure list', () => {
  const l = sample();
  l.numberParas = true;
  l.enclosure = 'प्राक्कलन की प्रति\nमापी पुस्त की प्रति';
  const blocks = M.buildBlocks(l);
  assert.deepEqual(blocks.filter((b) => b.t === 'para').map((b) => b.num), ['1.', '2.']);
  const enc = blocks.find((b) => b.t === 'labeled' && b.label.startsWith('अनु'));
  assert.deepEqual(enc.lines, ['1. प्राक्कलन की प्रति', '2. मापी पुस्त की प्रति']);
  l.enclosure = 'अनु०:- यथोक्त।';
  assert.ok(M.buildBlocks(l).some((b) => b.t === 'line' && b.text === 'अनु०:- यथोक्त।'));
});

test('endorsement section', () => {
  const l = sample();
  l.copyEnabled = true;
  l.copyRecipients = 'मुख्य अभियंता, जल संसाधन विभाग, हजारीबाग।\nउप सचिव (अभियंत्रण), जल संसाधन विभाग, झारखण्ड, राँची।';
  const blocks = M.buildBlocks(l);
  const memo = blocks.filter((b) => b.t === 'numdate')[1];
  assert.match(memo.left, /^ज्ञापांक— \.+$/);
  const copies = blocks.filter((b) => b.t === 'copyline').map((b) => b.text);
  assert.deepEqual(copies, [
    'प्रतिलिपि:— मुख्य अभियंता, जल संसाधन विभाग, हजारीबाग को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।',
    'प्रतिलिपि:— उप सचिव (अभियंत्रण), जल संसाधन विभाग, झारखण्ड, राँची को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।'
  ]);
  assert.equal(blocks.filter((b) => b.t === 'right' && b.sign).length, 2);
});

test('reminder template fills earlier letter number and date', () => {
  const l = M.newLetter(M.defaultSettings(), M.BUILTIN_TEMPLATES.find((t) => t.id === 'reminder'));
  l.prevNumber = '45';
  l.prevDate = '2026-07-01';
  const ref = M.buildBlocks(l).find((b) => b.label === 'प्रसंग:—');
  assert.deepEqual(ref.lines, ['इस कार्यालय का पत्रांक 45 दिनांक 01.07.2026।']);
});

test('signature block with optional name; text export', () => {
  const l = sample();
  l.signName = 'नमूना नाम';
  const sign = M.buildBlocks(l).find((b) => b.t === 'right' && b.sign);
  assert.deepEqual(sign.lines, ['(नमूना नाम)', 'कार्यपालक अभियंता,', 'तेनुघाट बाँध प्रमण्डल, तेनुघाट।']);
  const text = M.blocksToText(M.buildBlocks(l));
  assert.match(text, /विश्वासभाजन,/);
  assert.match(text, /विषय:— नमूना विषय/);
});

test('backup round trip', () => {
  const data = Store.normalize({ letters: [sample()] });
  const restored = Store.parseBackup(Store.backupJSON(data));
  assert.equal(restored.letters.length, 1);
  assert.equal(restored.letters[0].subject, 'नमूना विषय');
  assert.equal(restored.settings.fontSize, 13);
  assert.throws(() => Store.parseBackup('{"foo":1}'));
});
