# पत्र निर्माता / Hindi Letter Maker

सरकारी हिन्दी पत्र जल्दी बनाने का सरल टूल। सब कुछ आपके ब्राउज़र में चलता है — कोई डेटा इंटरनेट पर नहीं जाता।
A simple tool for official Hindi letters. Everything runs in your browser; nothing is sent anywhere.

## कैसे चलाएँ / How to open
- वेबसाइट पर `.../letter-maker/` खोलें, या इस फ़ोल्डर की `index.html` पर डबल-क्लिक करें।
  Open the GitHub Pages link, or double-click `index.html` in this folder.

## उपयोग / How to use
1. **पत्र / Letter** टैब: बाईं ओर फ़ॉर्म भरें, दाईं ओर A4 पूर्वावलोकन तुरंत बदलता है। (फ़ोन पर "संपादन / पूर्वावलोकन" बटन से बदलें।)
   Fill the form on the left; the A4 preview on the right updates live.
2. **नमूना / Template**: सामान्य, अग्रसारण या स्मार पत्र चुनकर "लागू करें" दबाएँ। अपना पत्र "नमूना सहेजें" से नमूने की तरह रखें।
   Pick a template and press Apply; save your own with "Save as template".
3. **वाक्यांश / Phrases**: बटन दबाते ही वाक्यांश कर्सर की जगह पर जुड़ जाता है। Click a phrase to insert it at the cursor.
4. **सहेजें / Save** (Ctrl+S) — पत्र "सहेजे पत्र" टैब में दिखेगा, जहाँ खोज, खोलना, प्रति बनाना और हटाना है।
   Saved letters can be searched, opened, duplicated or deleted in the "Saved" tab.
5. **प्रिंट / PDF**: प्रिंट विंडो में "Save as PDF" चुनें। पृष्ठ A4 है; हाशिया व अक्षर आकार सेटिंग में बदलें।
   Print or "Save as PDF". Margins and font size are in Settings.
6. **Word**: "Word (यूनिकोड)" Nirmala UI / Mangal फ़ॉन्ट में; "Word (कृतिदेव)" कृतिदेव फ़ॉन्ट में (कंप्यूटर पर Kruti Dev फ़ॉन्ट होना चाहिए)।
   Unicode Word file, or a Kruti Dev Word file (needs the Kruti Dev font on the PC).
7. **कॉपी / Copy**: पूरा पत्र यूनिकोड या कृतिदेव पाठ के रूप में कॉपी करें। Copy the letter as Unicode or Kruti Dev text.
8. **परिवर्तक / Converter**: यूनिकोड ⇄ कृतिदेव (010 / 040)। Two-way Unicode ⇄ Kruti Dev.
9. **सेटिंग / Settings**: कार्यालय का नाम, प्राप्तकर्ता सूची, वाक्यांश, हस्ताक्षर, कृतिदेव फ़ॉन्ट का नाम, हाशिया, अक्षर आकार।
   Office presets, addressees, phrases, signature, Kruti Dev font name, margins, font size.

## बैकअप / Backup
डेटा केवल इसी ब्राउज़र में रहता है। सेटिंग में **"बैकअप डाउनलोड"** से एक JSON फ़ाइल नियमित रूप से सहेजें और **"वापस लाएँ"** से लौटाएँ।
Data lives only in this browser. Download a backup file regularly (Settings → Backup) and use Restore to bring it back.

## डेवलपर के लिए / For developers
`npm install`, then `npm test` (Node's built-in test runner) and `npm run vendor` (copies `docx` and the Noto Sans Devanagari fonts into `vendor/`). No build step is needed to run the app.
