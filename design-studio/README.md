# डिज़ाइन एवं ड्रॉइंग स्टूडियो / Design & Drawing Studio

> **प्रारंभिक डिज़ाइन सहायक — अंतिम डिज़ाइन सक्षम अभियंता द्वारा संबंधित IS/IRC कोड से जाँचें।**
> Preliminary design aid — final design must be checked by a competent engineer against the relevant IS/IRC codes.

नहर, बाँध, जलीय संरचनाएँ, पुल-पुलिया और आरसीसी की प्रारंभिक गणना, डिज़ाइन नोट और आयामित चित्र। इंटरनेट नहीं चाहिए; डेटा केवल आपके ब्राउज़र में रहता है।
*Preliminary calculations, design notes and dimensioned drawings for canals, dams, hydraulic structures, bridges, culverts and RCC. Works offline after the first visit; data stays in your browser.*

## कैसे उपयोग करें / How to use
1. **मॉड्यूल चुनें / Pick a module** from the menu (☰ on a phone).
2. **इनपुट भरें / Enter inputs** — every box shows its unit (m, m³/s, kN, MPa). Red box = value out of range.
3. **परिणाम / Results** update live with **OK / NOT OK** checks. Read *Method and step-by-step working* for formulae, code clauses, assumptions and limits ("verify clause" means check the clause number in the code).
4. **चित्र / Drawing**: download **DXF** (AutoCAD R12, metres, layers CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR), **SVG**, **PNG**, or **Print / PDF** on A4 or A3 with a title block.
5. **डिज़ाइन नोट / Design note**: A4 print with inputs, method, working, results, drawing and signature boxes. Choose "Save as PDF" in the print dialog for a PDF.
6. **सहेजें / Save** a design under a project and structure. **Projects** page: open, duplicate, delete, export/import JSON, **Backup / Restore** all data. Keep backups — clearing browser data deletes saved designs.
7. **सेटिंग / Settings**: office name and Designed / Checked / Approved names for title blocks.
8. **CSV** buttons give every calculation table for Excel.

## मॉड्यूल / Modules
A Hydrology (flood peaks, Gumbel) · B Canals (Lacey/Kennedy, lined canal, L-section) · C Hydraulic structures (weir — Bligh/Khosla, stilling basin, ogee spillway and bucket, canal falls, regulators and escapes, cross-drainage) · D Dams (gravity dam, earth dam) · E Bridges and culverts · F RCC (beam, slab, column, footing, retaining wall) · Software bridges (STAAD.Pro `.std`, HEC-RAS text, QGIS GeoJSON/CSV) · Software guide.

## दूसरे सॉफ़्टवेयर / Other software
STAAD.Pro, AutoCAD and other licensed software must be installed separately; this app only writes their input files. Step-by-step guides are on each export page and on **Software guide**.

## डेवलपर / Developers
Plain HTML/CSS/JavaScript, no build step. Open `index.html` through any static server (or GitHub Pages). Tests: `cd design-studio && node --test` (Node 18+). Optional browser smoke test: `node tests/smoke.browser.js` (needs Playwright with Chromium). All sample data is fictional.
