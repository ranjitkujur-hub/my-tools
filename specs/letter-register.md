# Spec: पत्र पंजी एवं घटनाक्रम / Letter Register & Chronology

Build a static web tool in the folder `letter-register/` of this repository.

## Context
The user is an Executive Engineer (कार्यपालक अभियंता) in the Water Resources Department, Government of Jharkhand. He often has to prepare datewise chronologies (घटनाक्रम) of the correspondence on long-running matters, such as land acquisition, recovery of dues and compliance reports, and must quote letter numbers and dates exactly. This tool keeps a register of every letter and builds those chronologies instantly. He is not a programmer: simple screens, Hindi + English labels (for example "विषय / Subject"). Do not stop to ask questions; make sensible choices and list them in your final summary.

## Hard rules
1. **This repository is public.** Never put real names, phone numbers, real letter numbers or letter contents in code, tests, sample data or docs. Use clearly fictional sample data.
2. Static site: plain HTML/CSS/JavaScript, with no build step needed to run it. It must work on GitHub Pages at `https://<user>.github.io/<repo>/letter-register/` and when opened from disk.
3. Work ONLY inside `letter-register/`. Do not create or modify any file outside it: other sessions are building `letter-maker/` and `health-tracker/` and own the root files. Keep `package.json`, `node_modules`, tests and a `.gitignore` inside `letter-register/`. Do not modify `specs/`.
4. No network calls at runtime, no analytics, no CDN. Vendor libraries into `letter-register/vendor/` (install with npm, copy the browser builds). Bundle Noto Sans Devanagari (OFL licence, for example `@fontsource/noto-sans-devanagari`).
5. Data lives in IndexedDB on the device, and data safety is critical: Backup (download one JSON file); Restore (with a preview of what will be replaced); Export to Excel (.xlsx) and CSV; a "last backup" date and a reminder banner after 7 days without a backup. Where the File System Access API is available (Chrome or Edge on a PC), offer "keep data in a file" so every change auto-saves to a JSON file the user picks (for example in his OneDrive folder); fall back gracefully elsewhere.
6. Responsive: PC first, usable on a phone.

## Entry fields
- प्रकार / Type: आवक (incoming), जावक (outgoing), घटना (other event: meeting, site inspection, order, notification)
- पत्रांक / Letter no. (also used for ज्ञापांक)
- दिनांक / Date in DD.MM.YYYY. Also allow partial dates for old records (month and year only, or year only), shown with "(लगभग)" and sorted sensibly.
- प्राप्ति / प्रेषण तिथि: received or dispatch date (optional)
- प्रेषक / From and प्राप्तकर्ता / To: free text with autocomplete from earlier entries
- विषय / Subject
- प्रसंग / References: free text, plus optional links to other entries in the register
- मामला / Matter tags: one or more, with autocomplete and a manageable list (rename and merge tags)
- सार / Summary, including key figures (amounts, areas, levels)
- कार्रवाई / Action required, समय-सीमा / Due date, स्थिति / Status: लंबित (pending), उत्तर दिया (replied), बंद (closed), सूचनार्थ (for information)
- उत्तर / Reply: a link to the reply entry; the reply then shows "in reply to"
- फ़ाइल स्थान / File location: file number, register page, or a PC path such as `C:\Users\...\Documents\...\letter.pdf` (text only)
- अभ्युक्ति / Remarks

## Screens
- Quick add / edit form: keyboard friendly (Enter moves to the next field), "save and add another", "duplicate this entry".
- Register: a table (cards on a phone) with full-text search across all fields, in Hindi and English, Unicode-normalised so matching is forgiving (for example ignore nukta, treat ँ and ं alike); filters by type, matter, status, date range, from and to; sort by date; click an entry to open it.
- लंबित कार्य / Pending: items needing action, overdue ones highlighted, and those due within 7 days.
- घटनाक्रम / Chronology: choose a matter (or use the current search or filter result) and a date range to get a numbered datewise table with columns क्रम सं. | दिनांक | पत्रांक | प्रेषक → प्राप्तकर्ता | विषय / सार | अभ्युक्ति, titled "घटनाक्रम — <matter>", with an editable office line (default "कार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट"). Options: choose columns, include summaries, portrait or landscape. Outputs: Print / PDF (A4, table header repeated on every page), Word .docx (Unicode, font "Nirmala UI" with fallback "Mangal"), Excel .xlsx, and Copy table (pastes cleanly into Word).
- अनुलग्नक सूची / Annexure list: select entries to get a numbered list "अनुलग्नक-1: पत्रांक ... दिनांक ... (विषय)" for compliance reports; copy, print or .docx.
- Import from Excel or CSV with a column-mapping screen and a preview, so existing lists can be loaded in bulk. Dates such as 12.08.2026, 12/08/2026, 2026-08-12 and Excel date serials must parse correctly (always day before month, never MM/DD).
- A "load sample entries" button that adds 6 to 8 clearly fictional demo entries marked नमूना / SAMPLE, and a one-click "remove samples".

## Quality bar
- Unit tests (`node --test`) for date parsing and sorting (including partial dates), search normalisation, chronology ordering and numbering, CSV/XLSX import mapping, and backup/restore round trips. Run them and fix failures. If a headless browser is already available, smoke-test the pages; do not spend long trying to install one.
- `letter-register/README.md`: how to use, in simple Hindi and English, one page at most, including how to back up.
- Commit with clear messages, push your branch, and open a pull request to `main` if you can. Finish with a short summary of what was built and anything not done.
