# Spec: किडनी स्वास्थ्य रिकॉर्ड / Kidney Health Tracker

Build a private static web app in the folder `health-tracker/` of this repository.

## Context
For people with chronic kidney disease (CKD) and the family members who care for them, in India: monthly blood tests, injections such as EPO, medicines and regular nephrologist visits. They need to record results, see trends, and show a clean summary to the doctor. Users are not technical: simple screens, Hindi + English labels, big tap targets on a phone. Do not stop to ask questions; make sensible choices and list them in your final summary.

## Hard rules
1. **This repository is public.** Never put real personal or medical data in code, tests, sample data or docs. Any demo data must be clearly fictional.
2. Static site: plain HTML/CSS/JavaScript, with no build step needed to run it. It must work on GitHub Pages at `https://<user>.github.io/<repo>/health-tracker/` and when opened from disk. Make it an installable PWA (manifest plus a service worker scoped to `health-tracker/`) so it works offline on a phone after the first visit.
3. Work ONLY inside `health-tracker/`. Do not create or modify any file outside it: other sessions own the other folders and the root files. Keep `package.json`, `node_modules`, tests and a `.gitignore` inside `health-tracker/`. Do not modify `specs/`.
4. Privacy: health data never leaves the device. No network requests at runtime (add a strict Content-Security-Policy meta tag with `default-src 'self'` and `connect-src 'none'`; no inline scripts), no analytics, no CDN. Vendor libraries (for example Chart.js) into `health-tracker/vendor/`.
5. Data lives in IndexedDB. Backup (download one JSON file, with optional password encryption using WebCrypto AES-GCM with a PBKDF2-derived key); Restore (with a preview); Export to Excel and CSV; a "last backup" date and a reminder after 7 days. Optional app PIN lock to deter casual viewing on a shared device (explain in the app that it is not strong security).
6. Not a medical device: no dosing or treatment advice. Show a short disclaimer: "केवल रिकॉर्ड रखने हेतु — इलाज हेतु अपने डॉक्टर की सलाह मानें / For record-keeping only — follow your doctor's advice."

## Data
- Profile: name (optional), sex, date of birth (age calculated), height, diagnosis and CKD stage, blood group, allergies, doctor and hospital names and phone numbers, and free-text cautions from doctors (for example medicines or procedures to avoid).
- Lab results by test date. Common tests, each optional, with units: Hb (g/dL), PCV/Hct (%), MCV (fL), serum creatinine (mg/dL), blood urea (mg/dL), eGFR (calculated), sodium, potassium, chloride and bicarbonate (mmol/L), calcium (mg/dL), corrected calcium (calculated), phosphorus (mg/dL), PTH (pg/mL), albumin (g/dL), uric acid, ferritin (ng/mL), TSAT (%), serum iron, TIBC, 25-OH vitamin D, magnesium, glucose, HbA1c, urine ACR/PCR. Users can add custom tests (name, unit, range). The quick-entry form shows the most common tests first, with "more tests" to expand.
- eGFR: the CKD-EPI 2021 (race-free) creatinine equation, recalculated for each result from creatinine, age on the test date and sex: eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 (if female), with κ = 0.7 (female) or 0.9 (male) and α = −0.241 (female) or −0.302 (male). Test cases: female, 60, creatinine 1.0 → 64.5; male, 50, creatinine 1.2 → 73.7; male, 65, creatinine 5.0 → 12.1 (mL/min/1.73m², rounded to one decimal). Also show the lab-reported eGFR if one was entered.
- Corrected calcium = Ca + 0.8 × (4.0 − albumin). Test case: Ca 8.0, albumin 3.0 → 8.8.
- Reference ranges: sensible typical adult ranges by sex as defaults, labelled "typical lab range" and editable per test, plus an optional "doctor's target" range per test that the user enters (blank by default). Values outside the range are flagged high or low.
- Vitals: date and time, BP (systolic / diastolic), pulse, weight, urine output (optional), symptom notes (swelling, breathlessness, etc.).
- Medicines: name, strength, dose, timing in 1-0-1 style, before or after food, start and stop dates, prescribed by. Printable medicine chart.
- Injections: date, medicine or brand, dose with unit (IU or mcg), site, given by; a frequency (weekly, every 2 weeks, monthly, custom) gives the next due date on the dashboard.
- Doctor visits: date, doctor and hospital, advice, next visit date, and questions to ask next time.
- An optional dialysis log section, hidden until enabled.

## Screens
- Dashboard: latest value of the key tests with its flag and the change from the previous result (↑ / ↓), next injection due, next visit, and a "tests due" hint (configurable interval, default monthly for Hb and creatinine).
- Trends: line charts over time (Hb; creatinine with eGFR; potassium; calcium and phosphorus; PTH; BP; weight) with shaded range bands and a date-range filter.
- Results grid: tests as rows and dates as columns (the way doctors read trends), flags coloured, printable.
- Doctor summary (A4 print): profile header, diagnosis, current medicines, the last 6 results as a grid with flags, Hb / creatinine and eGFR / potassium charts, recent BP, and notes and questions for the doctor.
- Emergency card: one screen and one printable page with diagnosis, key cautions from the doctor notes, current medicines, allergies, blood group and doctor contact.
- Hindi + English labels throughout; all dates shown as DD.MM.YYYY.

## Quality bar
- Unit tests (`node --test`) for eGFR (all test cases above), corrected calcium, flagging, next-due-date logic, backup/restore and encrypted backup round trips, and CSV/XLSX export. Run them and fix failures. If a headless browser is already available, smoke-test the pages; do not spend long trying to install one.
- `health-tracker/README.md` in simple Hindi and English, one page at most: how to use, how to back up, and a privacy note.
- Commit with clear messages, push your branch, and open a pull request to `main` if you can. Finish with a short summary of what was built and anything not done.
