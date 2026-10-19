# Spec: पत्र निर्माता / Hindi Letter Maker

Build a static web tool in the folder `letter-maker/` of this repository.

## Context
The user is an Executive Engineer (कार्यपालक अभियंता) in the Water Resources Department, Government of Jharkhand. He writes official Hindi letters almost daily (forwarding letters to the Superintending Engineer, allotment requests, compliance reports) and his office uses the Kruti Dev font in MS Word. He is not a programmer, so the tool must be very simple, with Hindi + English labels (for example "विषय / Subject"). Do not stop to ask questions; make sensible choices and list them in your final summary.

## Hard rules
1. **This repository is public.** Never put real names, phone numbers, real letter numbers or letter contents in code, tests, sample data or docs. Use clearly fictional sample data.
2. Static site: plain HTML/CSS/JavaScript (ES modules are fine), with no build step needed to run it. It must work on GitHub Pages at `https://<user>.github.io/<repo>/letter-maker/` and also when `index.html` is opened directly from disk.
3. Work only inside `letter-maker/`, plus these root files, which you own: `index.html` (a simple bilingual landing page linking to `./letter-maker/`, `./letter-register/` and `./health-tracker/`; the other two folders are being built in parallel sessions, so just link to them), `README.md` (replace it with a short description of the three tools) and an empty `.nojekyll`. Create nothing else at the root: keep `package.json`, `node_modules`, tests and a `.gitignore` (for `node_modules`) inside `letter-maker/`. Do not modify `specs/`.
4. No network calls at runtime, no analytics, no CDN. Vendor third-party libraries into `letter-maker/vendor/` (install with npm, copy the browser builds). Bundle Noto Sans Devanagari (OFL licence, for example `@fontsource/noto-sans-devanagari`, regular and bold woff2) for on-screen and print rendering.
5. All data stays in the browser (IndexedDB or localStorage). Provide Backup (download one JSON file) and Restore.
6. Responsive: mainly used on a Windows PC, but usable on a phone.

## A. Letter editor with live A4 preview
Side by side on desktop, tabs on a phone. Every field is editable; the defaults below are saved as presets the user can change in Settings.
- Letterhead, centred: "झारखण्ड सरकार" / "जल संसाधन विभाग" / "कार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट"
- पत्रांक and दिनांक on one line (left and right). A checkbox "हाथ से भरने हेतु खाली छोड़ें / leave blank for handwriting" prints a dotted line instead. Date picker, printed as DD.MM.YYYY. Option for Devanagari digits (default: English digits, for example 12.08.2026).
- प्रेषक block (can be hidden): "कार्यपालक अभियंता," / "तेनुघाट बाँध प्रमण्डल, तेनुघाट।"
- सेवा में: pick from a saved addressee list or type. Default list: "अधीक्षण अभियंता, तेनुघाट बाँध अंचल, तेनुघाट।"; "मुख्य अभियंता, जल संसाधन विभाग, हजारीबाग।"; "मुख्य अभियंता (मॉनिटरिंग), जल संसाधन विभाग, राँची।"; "उप सचिव (अभियंत्रण), जल संसाधन विभाग, झारखण्ड, राँची।". Add, edit and delete addressees.
- विषय (multi-line). प्रसंग (optional, multi-line, numbered references allowed).
- सम्बोधन: "महाशय," (default) / "महोदय," / "महोदया,"
- Body: paragraphs, with an option to number them (1., 2., ...) for कंडिका-wise letters. A phrase library of common official phrases, insertable at the cursor, editable and savable, for example: "उपर्युक्त विषयक प्रसंगाधीन पत्र के आलोक में सूचित करना है कि"; "अतः अनुरोध है कि"; "की प्रति संलग्न कर सूचनार्थ एवं आवश्यक कार्यार्थ अग्रसारित की जाती है।"; "की स्वीकृति प्रदान करने की कृपा की जाय।"
- संलग्न: default "अनु०:- यथोक्त।", or a list of enclosures.
- Closing "विश्वासभाजन," and a right-aligned signature block: "कार्यपालक अभियंता," / "तेनुघाट बाँध प्रमण्डल, तेनुघाट।" with an optional name line (blank by default).
- प्रतिलिपि (endorsement) section, optional: "ज्ञापांक— ...... दिनांक— ......", then one or more lines "प्रतिलिपि:— <addressee> को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।", then the signature block again.
- Templates: सामान्य पत्र (general), अग्रसारण पत्र (forwarding, one-paragraph body), स्मार पत्र (reminder quoting an earlier letter number and date). Users can save their own templates.

## B. Output
- Print / Save as PDF from the browser: exact A4 (`@page { size: A4 }`), sensible government-letter margins, adjustable font size (default 13pt), clean page breaks, nothing but the letter on the page.
- Download Word (.docx), generated in the browser (for example with the `docx` npm library), in two versions: (1) Unicode Hindi (font "Nirmala UI", fallback "Mangal"); (2) Kruti Dev encoded text with the Kruti Dev font applied, so it opens correctly in Word on a PC with Kruti Dev installed. The .docx layout must match the preview (centred letterhead, number/date line using a right tab, right-aligned signature block).
- Copy buttons: the whole letter as Unicode text, and as Kruti Dev text.
- The Kruti Dev font name is a setting (default "Kruti Dev 040 Wide"; also offer "Kruti Dev 010" and others). Detect which Kruti Dev fonts are installed (for example by canvas width comparison) and pre-select one that is found.

## C. Converter tab
Two-way Unicode ⇄ Kruti Dev (Kruti Dev 010 and 040 share one encoding) with Copy buttons. It must correctly handle ि matra reordering, reph (र्) placement, half letters and conjuncts (क्ष, त्र, ज्ञ, श्र, द्ध, द्व, ह्म, etc.), nukta, chandrabindu and anusvara, visarga, word-final halant, ृ, ॅ and ॉ, danda and double danda, em dash (—), Devanagari and English digits, and mixed English text. Base it on a widely used, well-tested mapping table.

Write unit tests (`node --test`) with at least 40 real official phrases, for example "कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट।", "अधीक्षण अभियंता", "प्रतिलिपि:— मुख्य अभियंता (मॉनिटरिंग), जल संसाधन विभाग, राँची को सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित।", "विश्वासभाजन", "क्षेत्र", "श्रीमान", "कृपया", "स्वीकृति", "प्रमण्डल", "आवंटन", "अधियाचना", "पत्रांक 123 दिनांक 01.01.2026". Check Unicode → Kruti Dev → Unicode round trips and compare against known Kruti Dev strings.

## D. Saved letters and settings
Save drafts in the browser; list and search them (subject, letter number, date, addressee); open, duplicate as a new letter, delete (with confirmation). A Settings page for office presets, addressees, phrases, signature, Kruti Dev font name, margins and font size. Backup and Restore all data as one JSON file.

## Quality bar
- Hindi must render correctly everywhere (no broken conjuncts, no misplaced ि) in the preview, in print and in the Unicode .docx.
- Run the tests and fix failures. If a headless browser is already available, render the preview and check it; do not spend long trying to install one.
- `letter-maker/README.md`: how to use, in simple Hindi and English, one page at most.
- Commit with clear messages, push your branch, and open a pull request to `main` if you can. Finish with a short summary of what was built and anything not done.
