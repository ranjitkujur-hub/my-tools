/* Software guide page / सॉफ़्टवेयर गाइड: useful design software for WRD work
 * and short workflows. Links are plain text that open externally on click;
 * nothing is fetched by the app. */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  var SOFTWARE = [
    { name: 'QGIS', free: true, best: 'GIS mapping: canal alignments, command areas, catchments, DEM analysis, map layouts.', url: 'https://qgis.org' },
    { name: 'HEC-RAS', free: true, best: '1D/2D river and canal hydraulics: water-surface profiles, bridges and culverts, stilling basins, dam-break.', url: 'https://www.hec.usace.army.mil/software/hec-ras/' },
    { name: 'HEC-HMS', free: true, best: 'Rainfall–runoff modelling of catchments: design floods, unit hydrographs, reservoir routing.', url: 'https://www.hec.usace.army.mil/software/hec-hms/' },
    { name: 'LibreCAD', free: true, best: '2D drafting; opens and edits the DXF drawings from this app.', url: 'https://librecad.org' },
    { name: 'FreeCAD', free: true, best: 'Parametric 3D modelling, 2D drawings from 3D, structural and BIM workbenches.', url: 'https://www.freecad.org' },
    { name: 'EPANET', free: true, best: 'Pressurised pipe networks: water supply, lift irrigation and pipe distribution networks.', url: 'https://www.epa.gov/water-research/epanet' },
    { name: 'SWMM (EPA Storm Water Management Model)', free: true, best: 'Urban drainage and storm-water networks, detention ponds.', url: 'https://www.epa.gov/water-research/storm-water-management-model-swmm' },
    { name: 'AutoCAD / Civil 3D', free: false, best: 'Drafting (AutoCAD) and survey, corridor, earthwork and canal/road design (Civil 3D).', url: 'https://www.autodesk.com/products/civil-3d' },
    { name: 'STAAD.Pro', free: false, best: 'Structural analysis and design of frames: box culverts, aqueduct troughs, buildings, bridges.', url: 'https://www.bentley.com/software/staad/' },
    { name: 'ETABS', free: false, best: 'Building analysis and design (multi-storey RCC and steel).', url: 'https://www.csiamerica.com/products/etabs' },
    { name: 'GeoStudio (SEEP/W, SLOPE/W)', free: false, best: 'Seepage through earth dams and foundations (SEEP/W), slope stability (SLOPE/W).', url: 'https://www.seequent.com/products-solutions/geostudio/' },
    { name: 'MIKE (DHI)', free: false, best: 'Advanced river, flood, coastal and water-resources modelling (MIKE HYDRO, MIKE 21, MIKE+).', url: 'https://www.dhigroup.com' }
  ];

  var WORKFLOWS = [
    { hi: 'सर्वे डेटा से नहर L-सेक्शन (QGIS → HEC-RAS)', en: 'Canal L-section from survey data (QGIS → HEC-RAS)', steps: [
      'Load survey points (CSV with x, y, level) and the canal alignment in QGIS; set the project CRS (e.g. UTM).',
      'Use this app’s QGIS page to make chainage points along the alignment; read ground levels at each chainage (QGIS point sampling or survey book).',
      'Paste chainage and ground level into “Canal longitudinal section”; adjust slope, depth and fall rules; check falls and bank heights.',
      'Download the HEC-RAS export from that page; paste each cross-section into the HEC-RAS geometry editor and the flows into the steady-flow editor.',
      'Run HEC-RAS and compare water levels with the design FSL; adjust bed levels or falls and repeat.'] },
    { hi: 'HEC-RAS में स्टिलिंग बेसिन की जाँच', en: 'Checking a stilling basin in HEC-RAS', steps: [
      'Design the basin on the “Hydraulic jump and stilling basin” page; note floor level, length and tail-water level.',
      'In HEC-RAS make cross-sections upstream of the crest, on the glacis, in the basin and downstream (use the basin drawing for levels).',
      'Run a mixed-flow-regime steady analysis (Flow regime: Mixed) for the design discharge with the observed tail-water rating as the downstream boundary.',
      'Check that the hydraulic jump forms inside the basin for the full range of discharges; compare sequent depth with tail-water depth.',
      'If the jump moves out, lower the apron, lengthen the basin or add appurtenances, and re-check.'] },
    { hi: 'STAAD.Pro में बॉक्स पुलिया विश्लेषण', en: 'Box-culvert analysis in STAAD.Pro using the exported .std', steps: [
      'Size the culvert on the “Culvert” page or enter dimensions on the “STAAD.Pro input” page.',
      'Download the .std file and open it in STAAD.Pro (licensed software, installed separately).',
      'Check geometry, soil springs and loads; set IRC:6 combination factors and replace the live-load UDL with the vehicle load case if required.',
      'Run the analysis; take moments and shears at the slab and wall faces from member forces.',
      'Design the sections (IS 456 / IRC:112) and keep the STAAD output with the design note.'] },
    { hi: 'AutoCAD में DXF का उपयोग', en: 'Using the DXF in AutoCAD', steps: [
      'Download “DXF (AutoCAD R12)” from any drawing panel. Units are metres; 1 drawing unit = 1 m.',
      'Open it in AutoCAD (or LibreCAD). Type ZOOM → Extents. Layers: CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR.',
      'Set INSUNITS to Meters if you insert the drawing into another file. Text heights suit the scale shown in the drawing title.',
      'Dimensions and hatching are plain lines and text (no AutoCAD associativity); re-dimension with your office dimension style if needed.',
      'Insert your office title block and plot at the scale given in the drawing (e.g. 1:100 on A3).'] }
  ];

  root.DS = root.DS || {};
  root.DS.guide = { SOFTWARE: SOFTWARE, WORKFLOWS: WORKFLOWS };
  root.DS.guideHTML = function () {
    var h = ['<section class="guide-page"><h1>सॉफ़्टवेयर गाइड <span class="en">/ Software guide</span></h1>',
      '<p>जल संसाधन विभाग के डिज़ाइन कार्य के लिए उपयोगी सॉफ़्टवेयर। <span class="en">Useful design software for WRD work. Links open the official websites in a new tab; this app itself makes no network calls.</span></p>',
      '<section><h2>सॉफ़्टवेयर सूची <span class="en">/ Software list</span></h2><div class="scroll"><table><thead><tr><th>Software</th><th>Licence</th><th>Best for / उपयोग</th><th>Official website</th></tr></thead><tbody>'];
    SOFTWARE.forEach(function (s) {
      h.push('<tr><td><b>' + esc(s.name) + '</b></td><td>' + (s.free ? '<span class="tag free">Free / निःशुल्क</span>' : '<span class="tag lic">Licensed / सशुल्क</span>') +
        '</td><td>' + esc(s.best) + '</td><td><a class="url" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer external">' + esc(s.url) + '</a></td></tr>');
    });
    h.push('</tbody></table></div></section>');
    h.push('<section><h2>कार्यप्रवाह <span class="en">/ Short workflows</span></h2>');
    WORKFLOWS.forEach(function (w) {
      h.push('<h3>' + esc(w.hi) + ' <span class="en">/ ' + esc(w.en) + '</span></h3><ol class="guide">' + w.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>');
    });
    h.push('</section><section><h2>इस ऐप से निर्यात <span class="en">/ Exports from this app</span></h2><ul>' +
      '<li><b>AutoCAD / LibreCAD / QGIS:</b> DXF R12 from every drawing (metres, standard layers).</li>' +
      '<li><b>STAAD.Pro:</b> .std files for box culvert, beam / portal and aqueduct trough (Software bridges → STAAD.Pro input; also on the culvert and cross-drainage pages).</li>' +
      '<li><b>HEC-RAS:</b> station–elevation tables, reach lengths and steady-flow tables (Software bridges → HEC-RAS; canal pages).</li>' +
      '<li><b>QGIS:</b> GeoJSON and CSV of the alignment, chainages and structures (Software bridges → QGIS).</li>' +
      '<li><b>Excel:</b> CSV of every calculation table (CSV buttons on each page).</li></ul></section></section>');
    return h.join('');
  };
})(typeof self !== 'undefined' ? self : this);
