# किडनी स्वास्थ्य रिकॉर्ड / Kidney Health Tracker

CKD (किडनी की पुरानी बीमारी) वाले मरीज़ों और उनके परिवार के लिए एक निजी, ऑफ़लाइन रिकॉर्ड ऐप।
A private, offline record keeper for people with chronic kidney disease and their families.

> **केवल रिकॉर्ड रखने हेतु — इलाज हेतु अपने डॉक्टर की सलाह मानें / For record-keeping only — follow your doctor's advice.**

## कैसे इस्तेमाल करें / How to use
1. ऐप खोलें: `https://<user>.github.io/<repo>/health-tracker/` (या `index.html` सीधे खोलें)। फ़ोन पर ब्राउज़र मेनू से **"Add to Home screen / Install"** चुनें — इसके बाद इंटरनेट के बिना भी चलेगा।
   Open the link (or `index.html` from disk). On a phone choose **Add to Home screen / Install**; it then works offline.
2. **प्रोफ़ाइल / Profile** भरें — लिंग और जन्म तिथि से eGFR अपने-आप निकलता है। Fill in sex and date of birth so eGFR is calculated.
3. **जाँच / Tests → + नई रिपोर्ट**: रिपोर्ट की तारीख और मान लिखें ("और जाँचें / More tests" में बाकी जाँचें)। Enter each lab report.
4. दवाइयाँ, इंजेक्शन, बीपी/वज़न और डॉक्टर विज़िट भी लिखें। **ग्राफ़ / Trends**, **तालिका / Results grid**, **डॉक्टर सारांश / Doctor summary** (A4 प्रिंट) और **इमरजेंसी कार्ड** देखें।
5. आज़माने के लिए: होम या सेटिंग्स में **"काल्पनिक डेमो डेटा"** — यह पूरी तरह नकली डेटा है। To try it out, load the *fictional* demo data.

## बैकअप / Backup
- **और / More → बैकअप व एक्सपोर्ट**: "बैकअप फ़ाइल डाउनलोड करें" — एक `.json` फ़ाइल बनती है। पासवर्ड देने पर फ़ाइल एन्क्रिप्ट होती है (AES-GCM); पासवर्ड भूलने पर फ़ाइल नहीं खुलेगी।
- फ़ाइल को Google Drive / ईमेल / पेन ड्राइव में रखें। हर हफ़्ते बैकअप लें — 7 दिन बाद ऐप याद दिलाता है।
- नए फ़ोन पर: उसी पेज पर "बैकअप से वापस लाएँ" → फ़ाइल चुनें → झलक देखें → पुष्टि करें।
- Excel (.xlsx) और CSV एक्सपोर्ट पढ़ने/शेयर करने के लिए हैं; वापस लाने के लिए सिर्फ़ बैकअप फ़ाइल।

Back up weekly (the app reminds you after 7 days), keep the file somewhere safe, and restore it on a new phone from the same page.

## निजता / Privacy
- सारा डेटा सिर्फ़ इसी डिवाइस के ब्राउज़र (IndexedDB) में रहता है। ऐप कोई डेटा इंटरनेट पर नहीं भेजता — कोई सर्वर, एनालिटिक्स या CDN नहीं (सख़्त Content-Security-Policy)।
- ब्राउज़र डेटा मिटाने पर रिकॉर्ड भी मिट सकते हैं, इसलिए बैकअप ज़रूरी है।
- ऐप PIN सिर्फ़ साझा फ़ोन पर सरसरी नज़र से बचाता है; यह मज़बूत सुरक्षा नहीं है।

All data stays in this browser on this device; nothing is sent anywhere. The optional PIN only deters casual viewing and is not strong security.

## डेवलपर / Developers
Plain HTML/CSS/JS, no build step. Tests: `cd health-tracker && npm test` (Node 20+, `node --test`).
