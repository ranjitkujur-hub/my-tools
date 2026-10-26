# Spec: डिज़ाइन एवं ड्रॉइंग स्टूडियो / Design & Drawing Studio

Build a static web app in `design-studio/` of this repository. It is used by the engineers of a Water Resources Department division (canals, dams, hydraulic structures, small bridges and culverts) for preliminary design calculations, design notes and dimensioned drawings, and to hand data over to desktop software (AutoCAD, STAAD.Pro, HEC-RAS, QGIS and others). It is linked from the office app's menu and from the root `index.html`.

Do not stop to ask questions; make sensible choices and list them in your final summary.

## Hard rules
1. **Public repository:** no real names, phone numbers or project data in code, tests, samples or docs. Use fictional examples.
2. **Static site:** plain HTML/CSS/JavaScript, no build step needed to run, works on GitHub Pages at `https://<user>.github.io/<repo>/design-studio/` and offline after the first visit (a service worker scoped to `design-studio/`). No runtime network calls, no analytics, no CDN. Vendor any library into `design-studio/vendor/`.
3. **Work only inside `design-studio/`**, plus one change at the root: add a fourth card for this tool to the root `index.html`, matching the existing cards. Don't touch other folders or `specs/`. Keep `package.json`, tests and `.gitignore` inside `design-studio/`.
4. **Mobile and desktop:** usable on a phone, best on a PC. Hindi + English headings and labels (for example "नहर डिज़ाइन / Canal design"). Calculation text and reports in English with Hindi headings. SI units (m, m³/s, kN, MPa), with the units shown on every input.
5. **Engineering honesty:** every module shows its formula, the code clause or textbook method it follows, its assumptions and validity limits, and step-by-step working. When a code clause number is not certain, say "verify clause" rather than guessing. Every screen and report shows the disclaimer: "प्रारंभिक डिज़ाइन सहायक — अंतिम डिज़ाइन सक्षम अभियंता द्वारा संबंधित IS/IRC कोड से जाँचें / Preliminary design aid — final design must be checked by a competent engineer against the relevant IS/IRC codes."

## Framework (build first)
- **Module page layout:** inputs (with sensible defaults and validation), a live results panel with OK / NOT OK checks, the step-by-step working, and a drawing panel.
- **Drawing engine:** dimensioned 2D sections in SVG (dimension lines, levels such as "FSL 210.50", hatching for concrete, soil and water, a north/flow arrow where relevant, and an auto scale).
- **Exports for every drawing:**
  - **DXF** (AutoCAD R12 ASCII, written in JS) with layers CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR; units in metres; opens in AutoCAD, LibreCAD and QGIS;
  - SVG and PNG;
  - **Print/PDF** on A4 or A3 with a title block: office name (setting), drawing title, drawing number, scale, date, and "Designed / Checked / Approved" boxes.
- **Design note (A4 print):** inputs, method and code references, step-by-step working, results and checks, the drawing, and signature blocks.
- **Projects:** save each design by project and structure in IndexedDB; list, duplicate, delete (with confirmation); export and import JSON; and Backup / Restore all data.
- Export calculation tables as CSV.

## Modules (build in this order; finish each properly before starting the next)
**A. Hydrology (जल विज्ञान)**
- Flood peaks: Dickens, Ryves and Inglis (user-chosen coefficients, with typical ranges shown), and the rational method with a Kirpich time of concentration.
- Gumbel flood frequency analysis from a pasted annual-maximum series, with return-period floods for 25, 50, 100 and 1000 years.

**B. Canals (नहर)**
- Unlined alluvial canals by Lacey's regime theory and Kennedy's theory (IS 7112).
- Lined canals by Manning's equation (IS 4745 / IS 10430): trapezoidal sections, and triangular with a rounded bottom, with B/D guidance, freeboard, berm, bank and service-road widths, and velocity checks.
- A longitudinal-section helper: bed levels by chainage, with falls where the ground drops.
- Drawing: the canal cross-section with lining, banks, berms, FSL and bed level.

**C. Hydraulic structures (जलीय संरचनाएँ)**
1. Weirs and barrages on permeable foundations (IS 6966 Part 1): Bligh's creep and **Khosla's theory**. Uplift at key points with corrections, exit gradient check, floor thickness, and cut-off depths. Drawing: floor profile with cut-offs and pressure diagram.
2. Hydraulic jump and stilling basins (IS 4997): Froude number, sequent depth, basin type selection, basin length, apron level, chute blocks and end sill. Drawing of the basin.
3. Ogee spillways (IS 6934): the WES crest profile, and discharge with pier and abutment contraction. Bucket energy dissipators (IS 7365) at a basic level. Drawing: crest profile coordinates table plus section.
4. Canal falls: the Sarda type and the straight drop (USBR) with cistern. Drawing.
5. Head and cross regulators (IS 6531 / IS 7114), and canal escapes (IS 6936): crest or vent sizing and gate openings.
6. Cross-drainage works (IS 7784): drainage waterway by Lacey, afflux, barrel and syphon head loss (entry + friction + exit), and uplift on the trough or barrel. Drawing of a box barrel or trough.

**D. Dams (बाँध)**
1. Gravity dam stability (IS 6512):
   - a user-defined section (top width, height, u/s and d/s slopes, a drainage gallery);
   - forces: self weight, water, uplift with drains, silt, and pseudo-static earthquake (user αh, αv);
   - the main load combinations;
   - checks for overturning, sliding (shear friction factor) and heel/toe stresses (no tension).
   - Drawing with the force diagram.
2. Earth dams:
   - the phreatic line (Kozeny/Casagrande) and seepage discharge;
   - freeboard (IS 10635);
   - slope stability (IS 7894) by Fellenius and Bishop simplified for a given circle, plus a coarse grid search for the minimum factor of safety.
   - Drawing with the phreatic line and the critical circle.

**E. Bridges and culverts (पुल एवं पुलिया)** (IRC:5, IRC:78, IRC:SP:13)
- Linear waterway (Lacey), normal and maximum scour depth, afflux, and vertical clearance and freeboard.
- Box-culvert and slab-culvert preliminary sizing.
- Drawings: elevation and section.

**F. RCC basics (IS 456, limit state)**
- Singly and doubly reinforced beams, one-way and two-way slabs (Annex D coefficients), short axial columns, isolated footings, and cantilever retaining walls (stability + design).
- Reinforcement shown in the drawings on layer REBAR.

## Software bridges (सॉफ़्टवेयर से जोड़)
- **AutoCAD:** the DXF exports above.
- **STAAD.Pro:** generate `.std` input files for:
  - a box culvert as a 2D frame per metre run (dead load, earth pressure, water, live load as UDL);
  - a simple beam or portal;
  - an aqueduct trough as a frame.
  
  Each file includes units, joints, members, properties, supports, loads, combinations, `PERFORM ANALYSIS` and print commands. Note that STAAD.Pro is licensed software that must be installed separately.
- **HEC-RAS:** export cross-section station–elevation tables and reach lengths as text that can be pasted into the HEC-RAS cross-section editor, plus a steady-flow table. Include a short step-by-step guide.
- **QGIS:** export the canal alignment and chainage points and structure locations (entered coordinates or a pasted CSV) as GeoJSON and CSV, with a guide.
- **Excel:** CSV of every calculation table.

## Software guide page (सॉफ़्टवेयर गाइड)
- A page listing useful design software for WRD work: what each is best for, free or licensed, and the official website as plain text links that open externally.
  - **Free:** QGIS, HEC-RAS, HEC-HMS, LibreCAD, FreeCAD, EPANET, SWMM.
  - **Licensed:** AutoCAD/Civil 3D, STAAD.Pro, ETABS, GeoStudio (SEEP/W, SLOPE/W), MIKE.
- Short workflows: canal L-section from survey data (QGIS → HEC-RAS), checking a stilling basin in HEC-RAS, box-culvert analysis in STAAD.Pro using the exported `.std`, and using the DXF in AutoCAD.

## Quality bar
- **Unit tests** (`node --test`) for every formula module, checked against standard worked examples (cite the textbook or example in the test name) and against an independent re-calculation. Also tests for the DXF writer (valid R12 structure, layers, entities), the STAAD `.std` generator (valid command structure), and the CSV and GeoJSON exports.
- Run the tests and fix failures. If a headless browser is already available, smoke-test each module page at 375px and 1280px, and confirm that drawings render and exports download.
- `design-studio/README.md`: how to use it, in simple Hindi and English, one page at most.
- Commit with clear messages, push your branch, and open a pull request to `main`. Finish with a short summary of what was built, what remains (if any module had to be simplified), and the choices you made.
