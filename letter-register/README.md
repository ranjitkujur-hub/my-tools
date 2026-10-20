# पत्र पंजी एवं घटनाक्रम / Letter Register & Chronology

हर आवक-जावक पत्र और घटना (बैठक, निरीक्षण, आदेश) की पंजी रखें। किसी भी मामले का दिनांकवार **घटनाक्रम** एक क्लिक में बनाएँ।
Keep a register of every letter and event, and get a datewise chronology for any matter in one click.

**खोलें / Open:** `https://<user>.github.io/<repo>/letter-register/`, या `index.html` पर डबल-क्लिक करें / or double-click `index.html`. इंटरनेट की ज़रूरत नहीं / works offline.

## उपयोग / How to use
1. **+ नया / Add**: प्रकार, पत्रांक, दिनांक (DD.MM.YYYY; पुराने पत्र के लिए केवल `08.2019` या `2019` भी चलेगा, "(लगभग)" दिखेगा), विषय, मामला आदि भरें। **Enter** से अगला खाना, **Ctrl+S** से सहेजें। "सहेजें व नया" से अगला पत्र, "प्रतिलिपि" से मिलता-जुलता पत्र।
   Fill the form. Enter = next field, Ctrl+S = save.
2. **पंजी / Register**: कुछ भी खोजें (हिंदी/English; नुक्ता, ँ/ं का अंतर नहीं देखा जाता)। प्रकार, मामला, स्थिति, दिनांक से फ़िल्टर करें। पत्र पर क्लिक कर खोलें।
   Search and filter; click an entry to open it.
3. **लंबित / Pending**: समय-सीमा पार (लाल) और 7 दिनों में देय कार्य। / Overdue (red) and due within 7 days.
4. **घटनाक्रम / Chronology**: मामला चुनें → प्रिंट/PDF, Word, Excel या "तालिका कॉपी" (Word में Ctrl+V)।
5. **अनुलग्नक / Annexure**: पंजी में ☑ लगाकर "चयनित → अनुलग्नक" — "अनुलग्नक-1: पत्रांक … दिनांक … (विषय)" सूची।
6. **आयात / Import**: पुरानी Excel/CSV सूची लाएँ; स्तम्भ मिलाएँ, पूर्वावलोकन देखें, फिर आयात करें। दिनांक हमेशा दिन.माह.वर्ष माना जाता है।
7. आज़माने के लिए **बैकअप → नमूना जोड़ें**; बाद में "नमूना हटाएँ"। / Try it with sample entries, then remove them.

## बैकअप — ज़रूरी! / Backup — important!
डेटा केवल **इसी कंप्यूटर के इसी ब्राउज़र** में रहता है। ब्राउज़र का डेटा साफ़ करने पर मिट सकता है।
Data lives only in this browser on this device; clearing browser data can erase it.

- **बैकअप → बैकअप डाउनलोड करें**: एक `.json` फ़ाइल बनती है; इसे पेन-ड्राइव/OneDrive/ईमेल में रखें। 7 दिन बैकअप न लेने पर पीली चेतावनी आएगी।
  Download a backup file regularly; a reminder appears after 7 days.
- **पुनःस्थापित / Restore**: बैकअप फ़ाइल चुनें → पूर्वावलोकन देखें → "बदलें" (पहले वर्तमान डेटा की प्रति अपने-आप डाउनलोड होती है) या "मिलाएँ"।
- **फ़ाइल में डेटा रखें / Keep data in a file** (PC पर Chrome/Edge): OneDrive फ़ोल्डर में एक फ़ाइल चुनें; हर बदलाव उसमें अपने-आप सहेजा जाएगा। दूसरे PC पर "मौजूदा फ़ाइल खोलें"।
- **Excel / CSV निर्यात** भी उपलब्ध है। / Excel and CSV export are available too.

## डेवलपर हेतु / For developers
Plain HTML/CSS/JS, no build step. Libraries are vendored in `vendor/` (SheetJS `xlsx` 0.18.5, Noto Sans Devanagari — SIL OFL). Word files are written by `js/docx.js` (no library).
`npm install && npm test` runs the unit tests; `node tests/smoke.browser.js` runs an optional browser check (needs Playwright). Never commit real names, letter numbers or letter contents — this repository is public.
