'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/krutidev.js');

// Real official phrases used in Hindi government letters (no personal data).
const PHRASES = [
  'कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट।',
  'अधीक्षण अभियंता',
  'प्रतिलिपि:— मुख्य अभियंता (मॉनिटरिंग), जल संसाधन विभाग, राँची को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।',
  'विश्वासभाजन',
  'क्षेत्र',
  'श्रीमान',
  'कृपया',
  'स्वीकृति',
  'प्रमण्डल',
  'आवंटन',
  'अधियाचना',
  'पत्रांक 123 दिनांक 01.01.2026',
  'झारखण्ड सरकार',
  'जल संसाधन विभाग',
  'कार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट',
  'अधीक्षण अभियंता, तेनुघाट बाँध अंचल, तेनुघाट।',
  'मुख्य अभियंता, जल संसाधन विभाग, हजारीबाग।',
  'उप सचिव (अभियंत्रण), जल संसाधन विभाग, झारखण्ड, राँची।',
  'उपर्युक्त विषयक प्रसंगाधीन पत्र के आलोक में सूचित करना है कि',
  'अतः अनुरोध है कि',
  'की प्रति संलग्न कर सूचनार्थ एवं आवश्यक कार्यार्थ अग्रसारित की जाती है।',
  'की स्वीकृति प्रदान करने की कृपा की जाय।',
  'ज्ञापांक— ...... दिनांक— ......',
  'महाशय,',
  'महोदय,',
  'महोदया,',
  'सेवा में,',
  'प्रेषक,',
  'विषय:— आवंटन की अधियाचना।',
  'प्रसंग:— आपका पत्रांक 45 दिनांक 12.08.2026',
  'अनुपालन प्रतिवेदन संलग्न कर समर्पित किया जा रहा है।',
  'स्मार पत्र',
  'अग्रसारण पत्र',
  'राष्ट्रीय राजमार्ग',
  'निर्माण कार्य की प्रशासनिक स्वीकृति',
  'तकनीकी स्वीकृति हेतु प्राक्कलन',
  'वित्तीय वर्ष 2026-27 में राशि का आवंटन',
  'आवश्यक कार्रवाई करने की कृपा की जाय।',
  'उपायुक्त, बोकारो',
  'सिंचाई क्षमता का पुनर्स्थापन',
  'नहर की मरम्मती एवं जीर्णोद्धार',
  'बाँध सुरक्षा',
  'अति आवश्यक',
  'पूर्व में भी अनुरोध किया गया था।',
  'अद्यतन स्थिति से अवगत कराया जाय।',
  'द्वितीय स्मार',
  'विद्युत आपूर्ति',
  'ब्रह्मपुत्र',
  'सड़क एवं पुल',
  'श्रमिकों की मजदूरी',
  'हस्ताक्षर',
  'आर्थिक',
  'कार्यों की गुणवत्ता',
  'उद्धरण',
  'ट्रैक्टर',
  'डॉ० राजेन्द्र प्रसाद पथ',
  'दृष्टिगत',
  'कृषि विभाग',
  'संबंधित पदाधिकारी',
  'प्रधान सचिव, जल संसाधन विभाग',
  'सहायक अभियंता एवं कनीय अभियंता',
  'जगत्',
  'छुट्टी',
  'चिह्नित',
  'विशेष',
  'पुनः',
  'ॐ',
  'समय-सीमा'
];

const KNOWN = [
  ['कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट।', 'dk;Zikyd vfHk;ark] rsuq?kkV ck¡/k ize.My] rsuq?kkVA'],
  ['अधीक्षण अभियंता', 'v/kh{k.k vfHk;ark'],
  ['विश्वासभाजन', "fo'oklHkktu"],
  ['क्षेत्र', '{ks='],
  ['श्रीमान', 'Jheku'],
  ['कृपया', '—i;k'],
  ['प्रमण्डल', 'ize.My'],
  ['आवंटन', 'vkoaVu'],
  ['अधियाचना', 'vf/k;kpuk'],
  ['पत्रांक 123 दिनांक 01.01.2026', 'i=kad 123 fnukad 01-01-2026'],
  ['प्रतिलिपि:—', 'izfrfyfi%&'],
  ['सूचनार्थ', 'lwpukFkZ'],
  ['कार्यार्थ', 'dk;kZFkZ'],
  ['प्रेषित।', 'izsf"krA'],
  ['आवश्यक', "vko';d"],
  ['मुख्य अभियंता (मॉनिटरिंग)', 'eq[; vfHk;ark ¼ekWfuVfjax½'],
  ['स्थिति', 'fLFkfr'],
  ['आर्थिक', 'vkfFkZd'],
  ['निर्माण', 'fuekZ.k'],
  ['राष्ट्रीय', 'jk"Vªh;'],
  ['कार्य', 'dk;Z'],
  ['धर्म', '/keZ'],
  ['हिन्दी', 'fgUnh'],
  ['उद्धरण', 'm)j.k'],
  ['विद्युत', 'fo|qr'],
  ['द्वारा', '}kjk'],
  ['प्रिय', 'fiz;'],
  ['सड़क', 'lM+d'],
  ['जगत्', 'txr~'],
  ['ईंट', 'bZaV'],
  ['ओर', 'vksj'],
  ['औसत', 'vkSlr'],
  ['ऊपर', 'Åij'],
  ['ऋण', '_.k'],
  ['रुपये', '#i;s'],
  ['रूप', ':i'],
  ['ट्रक', 'Vªd'],
  ['छुट्टी', 'Nqêh'],
  ['ज्ञापांक', 'Kkikad'],
  ['अतः', 'vr%'],
  ['पुनः', 'iqu%'],
  ['॥', 'AA'],
  ['१२.०८.२०२६', 'ƒ„-åŠ-„å„ˆ'],
  ['उपर्युक्त', 'mi;qZDr'],
  ['कॉलेज', 'dkWyst'],
  ['हैं', 'gSa'],
  ['ब्रह्म', 'czã']
];

test('at least 40 official phrases are covered', () => {
  assert.ok(PHRASES.length >= 40, `only ${PHRASES.length} phrases`);
});

test('Unicode → Kruti Dev matches known Kruti Dev strings', () => {
  for (const [u, k] of KNOWN) assert.equal(K.unicodeToKruti(u), k, u);
});

test('Kruti Dev → Unicode matches known Unicode strings', () => {
  for (const [u, k] of KNOWN) assert.equal(K.krutiToUnicode(k), u.normalize('NFC'), k);
});

test('Unicode → Kruti Dev → Unicode round trip for official phrases', () => {
  for (const p of PHRASES) {
    const kd = K.unicodeToKruti(p);
    // Kruti Dev has a single dash glyph, so a hyphen may come back as an em dash.
    const back = K.krutiToUnicode(kd).replace(/—/g, '-');
    assert.equal(back, p.normalize('NFC').replace(/—/g, '-'), `${p} -> ${kd}`);
  }
});

test('ि matra is placed before the whole conjunct', () => {
  assert.equal(K.unicodeToKruti('स्थिति'), 'fLFkfr');
  assert.equal(K.unicodeToKruti('क्रिया'), 'fØ;k');
  assert.equal(K.unicodeToKruti('चिह्नित'), 'fpfàr');
  assert.equal(K.krutiToUnicode('fLFkfr'), 'स्थिति');
  assert.equal(K.krutiToUnicode('fØ;k'), 'क्रिया');
});

test('reph is placed after the consonant and its matras', () => {
  assert.equal(K.unicodeToKruti('पूर्व'), 'iwoZ');
  assert.equal(K.unicodeToKruti('शर्मा'), "'kekZ");
  assert.equal(K.unicodeToKruti('कार्यों'), 'dk;ksZa');
  assert.equal(K.unicodeToKruti('पुनर्स्थापन'), 'iquLFkkZiu');
  assert.equal(K.krutiToUnicode('dk;ksZa'), 'कार्यों');
  assert.equal(K.krutiToUnicode('dk;ksaZ'), 'कार्यों');
  assert.equal(K.krutiToUnicode('iquLFkkZiu'), 'पुनर्स्थापन');
});

test('conjuncts, nukta, chandrabindu, anusvara and visarga', () => {
  const cases = { 'क्ष': '{k', 'त्र': '=', 'ज्ञ': 'K', 'श्र': 'J', 'द्ध': ')', 'द्व': '}', 'ह्म': 'ã', 'ड़': 'M+', 'ढ़': '<+', 'फ़': 'Q+', 'ज़': 't+', 'आँ': 'vk¡', 'अं': 'va', 'दुःख': 'nq%[k' };
  for (const [u, k] of Object.entries(cases)) {
    assert.equal(K.unicodeToKruti(u), k, u);
    assert.equal(K.krutiToUnicode(k), u.normalize('NFC'), k);
  }
  // precomposed nukta letters give the same result as consonant + nukta
  assert.equal(K.unicodeToKruti('ड़'), 'M+');
});

test('ृ, ॅ and ॉ', () => {
  assert.equal(K.unicodeToKruti('मृदा'), 'e`nk');
  assert.equal(K.unicodeToKruti('दृष्टि'), '–f"V');
  assert.equal(K.unicodeToKruti('हृदय'), 'ân;');
  assert.equal(K.unicodeToKruti('बैंक'), 'cSad');
  assert.equal(K.unicodeToKruti('डॉक्टर'), 'MkWDVj');
  assert.equal(K.unicodeToKruti('ऑफिस'), 'vkWfQl');
  assert.equal(K.krutiToUnicode('vkWfQl'), 'ऑफिस');
  assert.equal(K.krutiToUnicode('MkWDVj'), 'डॉक्टर');
});

test('danda, double danda, em dash and digits', () => {
  assert.equal(K.unicodeToKruti('।'), 'A');
  assert.equal(K.unicodeToKruti('॥'), 'AA');
  assert.equal(K.unicodeToKruti('ज्ञापांक— 12'), 'Kkikad& 12');
  assert.equal(K.krutiToUnicode('Kkikad& 12'), 'ज्ञापांक— 12');
  assert.equal(K.krutiToUnicode('2026&27'), '2026-27');
  assert.equal(K.unicodeToKruti('०१२३४५६७८९'), 'åƒ„…†‡ˆ‰Š‹');
  assert.equal(K.krutiToUnicode('åƒ„…†‡ˆ‰Š‹'), '०१२३४५६७८९');
  assert.equal(K.unicodeToKruti('0123456789'), '0123456789');
});

test('mixed English text is kept unchanged when converting to Kruti Dev', () => {
  assert.equal(K.unicodeToKruti('PWD कार्यालय'), 'PWD dk;kZy;');
  assert.equal(K.unicodeToKruti('e-mail द्वारा'), 'e-mail }kjk');
  const segs = K.unicodeToKrutiSegments('ई-मेल: office.example@example.com पर भेजें');
  assert.ok(segs.some((s) => s.latin && s.text === 'office.example@example.com'));
  assert.ok(segs.some((s) => !s.latin && s.text.includes('Hkst')));
});
