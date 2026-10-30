// "मेरे दस्तावेज़ / My documents": the library (top of Sources) and one document's view with
// "इस फ़ाइल से पूछें / Ask about this file" and "मुख्य बातें / Key facts".
import { h, L, clear, toast, highlight } from './dom.js';
import { state } from '../data.js';
import { getDocs, getDoc, userIndex, usage, deleteDoc, deleteAll, docBlobs, onDocsChange, exportJson, importJson, isPersistent } from '../mydocs.js';
import { extractFacts } from '../core/facts.js';
import { tokenize } from '../core/search.js';
import { normalize } from '../core/text.js';
import { MAX_TOTAL_BYTES, TYPE_LABEL } from '../core/files/detect.js';
import { formatInr } from '../core/money.js';
import { PRIVACY, fileInputs, libraryButtons, photoReview, addFiles, fmtBytes, unitWords, localDmy } from './attach.js';
import { askText } from './ask.js';
import { disclaimer } from './answer.js';
import { loadPdfjs, PDF_EXTRA } from '../libs.js';
import { openPdf } from '../core/files/pdf.js';
import { renderPdfPage } from '../ingest.js';

const go = (hash) => { location.hash = hash; };
let objectUrls = [];
function trackUrl(u) { objectUrls.push(u); return u; }
export function releaseUrls() {
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls = [];
}

function askAndGo(text, origin) {
  askText(text, { origin });
  go('#/ask');
}

// ---------------------------------------------------------------- library

function docRow(d, hit) {
  return h('li', null, h('a', { href: `#/mydoc/${encodeURIComponent(d.id)}`, 'data-doc': d.name },
    h('span', { class: 'num', 'aria-hidden': 'true' }, { pdf: '📕', docx: '📘', pptx: '📙', xlsx: '📗', image: '🖼️' }[d.type] || '📄'),
    h('span', { class: 'grow' },
      h('b', { class: 'fname' }, d.path || d.name),
      h('div', { class: 'small muted' }, [TYPE_LABEL[d.type] || d.type, fmtBytes(d.size), localDmy(d.added), unitWords(d.type, d.units.length)].filter(Boolean).join(' · ')),
      hit ? h('div', { class: 'small', html: highlight(`${hit.label}: ${hit.snippet}`, hit.words) }) : null)));
}

/** The "My documents" card at the top of Sources. */
export function myDocsSection() {
  const slot = h('div', { class: 'review-slot' });
  const list = h('ul', { class: 'list card', style: 'padding:0', 'data-mydocs': '' });
  const filter = h('input', { type: 'search', placeholder: L('मेरे दस्तावेज़ों में खोजें', 'Search My documents'), 'aria-label': L('मेरे दस्तावेज़ों में खोजें', 'Search My documents'), 'data-mydocs-search': '' });
  const used = h('div', { class: 'small' });
  const inputs = fileInputs({
    onPhoto: (file) => photoReview(file, slot, { onAsk: (text, thumb) => { askText(text, { origin: 'photo', photo: thumb }); go('#/ask'); } }),
    onFiles: (files) => addFiles(files, slot),
  });
  const importIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  importIn.addEventListener('change', async () => {
    const f = importIn.files?.[0];
    importIn.value = '';
    if (!f) return;
    try {
      const r = await importJson(await f.text());
      toast(L(`${r.added} दस्तावेज़ आयात हुए${r.skipped ? `, ${r.skipped} छोड़े` : ''}`, `${r.added} document(s) imported${r.skipped ? `, ${r.skipped} skipped` : ''}`));
    } catch {
      toast(L('यह मेरे दस्तावेज़ों का बैकअप नहीं है', 'This is not a My documents backup'));
    }
  });
  const exportBtn = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const blob = new Blob([await exportJson()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `my-documents-${localDmy(new Date()).split('/').reverse().join('')}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } }, L('JSON निर्यात (बैकअप)', 'Export JSON (backup)'));
  const delAll = h('button', { class: 'btn small danger', type: 'button', 'data-btn': 'delete-all', onclick: async () => {
    if (!confirm(L('मेरे दस्तावेज़ों से सभी दस्तावेज़ हटाएँ? यह वापस नहीं होगा।', 'Delete all documents from My documents? This cannot be undone.'))) return;
    await deleteAll();
    toast(L('सब हटा दिए गए', 'All deleted'));
  } }, L('सब हटाएँ', 'Delete all'));

  const draw = () => {
    const docs = getDocs();
    const q = filter.value.trim();
    clear(list);
    let hits = new Map();
    if (q) {
      const words = tokenize(q).concat(q.toLowerCase().split(/\s+/));
      for (const r of userIndex()?.search(q, { limit: 50, minCoverage: 0.3 }) || []) if (!hits.has(r.docId)) hits.set(r.docId, { ...r, words });
    }
    const nq = normalize(q);
    let shown = 0;
    for (const d of docs) {
      const nameHit = nq && normalize(`${d.path} ${d.name}`).includes(nq);
      if (q && !nameHit && !hits.has(d.id)) continue;
      list.append(docRow(d, hits.get(d.id)));
      shown++;
    }
    if (!docs.length) list.append(h('li', { class: 'pad muted' }, L('अभी कोई दस्तावेज़ नहीं। ऊपर के बटन से फ़ाइलें, फ़ोल्डर या फ़ोटो जोड़ें।', 'No documents yet. Add files, a folder or a photo with the buttons above.')));
    else if (!shown) list.append(h('li', { class: 'pad muted' }, L('कुछ नहीं मिला', 'Nothing found')));
    const u = usage();
    clear(used).append(L('संग्रह', 'Storage'), `: ${fmtBytes(u)} / ${fmtBytes(MAX_TOTAL_BYTES)} · ${docs.length} ${L('दस्तावेज़', 'documents')}`,
      h('progress', { max: String(MAX_TOTAL_BYTES), value: String(u), style: 'width:100%' }),
      u > MAX_TOTAL_BYTES * 0.9 ? h('div', { class: 'note warn small' }, L('संग्रह लगभग भर गया है — कुछ दस्तावेज़ हटाएँ।', 'Storage is nearly full — delete some documents.')) : '');
    delAll.disabled = !docs.length;
    exportBtn.disabled = !docs.length;
  };
  filter.addEventListener('input', draw);
  const card = h('section', { class: 'card mydocs', id: 'mydocs' },
    h('h2', null, `📁 ${L('मेरे दस्तावेज़', 'My documents')}`),
    h('p', { class: 'small' }, PRIVACY()),
    isPersistent() ? null : h('div', { class: 'note warn small' }, L('इस ब्राउज़र में संग्रह उपलब्ध नहीं — दस्तावेज़ केवल इस सत्र तक रहेंगे।', 'Storage is not available in this browser — documents are kept for this session only.')),
    libraryButtons(inputs), inputs.all,
    h('p', { class: 'small muted' }, L('PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX), फ़ोटो (JPG/PNG/WebP), TXT/CSV/MD। फ़ाइल 50 MB तक, कुल लगभग 300 MB। ब्राउज़र “Upload” लिख सकता है — फ़ाइलें फिर भी इसी डिवाइस में रहती हैं।', 'PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX), photos (JPG/PNG/WebP), TXT/CSV/MD. Up to 50 MB per file, about 300 MB in all. The browser may say “Upload” — the files still stay on this device.')),
    h('p', { class: 'small muted' }, L('सबके लिए दस्तावेज़ जोड़ना हो तो उसे ऐप के रखरखावकर्ता को भेजें; यहाँ जोड़ी गई फ़ाइलें केवल इसी फ़ोन पर हैं।', 'To add a document for everyone, send it to the app maintainer; files added here are only on this phone.')),
    slot, used, filter, list,
    h('div', { class: 'row noprint' }, exportBtn, h('button', { class: 'btn small', type: 'button', onclick: () => importIn.click() }, L('JSON आयात', 'Import JSON')), importIn, delAll));
  const off = onDocsChange(() => { if (!card.isConnected) { off(); return; } draw(); });
  draw();
  return card;
}

// ---------------------------------------------------------------- one document

const FACT_LABEL = { amount: ['राशि', 'Amount'], percent: ['प्रतिशत', 'Percentage'], period: ['अवधि', 'Period'], date: ['तिथि', 'Date'] };

function factItem(doc, f, idxOf) {
  const i = idxOf(f.unit.n);
  const actions = [];
  if (f.type === 'amount') {
    const rate = state.general.rules.currency.inr_per_usd;
    const inr = Math.round(f.currency === 'USD' ? f.value * rate : f.value);
    actions.push(h('a', { class: 'btn small', href: `#/plan/amount/${inr}`, 'data-btn': 'check-rules' }, L('नियम देखें', 'Check with the rules')), h('span', { class: 'small muted' }, ` ${formatInr(inr)}`));
  }
  const r = state.engine.ask(f.sentence);
  if (r.best) actions.push(h('a', { class: 'btn small', href: `#/q/${encodeURIComponent(r.best.id)}`, 'data-btn': 'fact-faq' }, `${L('सामग्री का उत्तर', 'Answer from the material')}: ${r.best.q_en}`));
  return h('li', { class: 'fact', 'data-fact': f.type },
    h('div', null, h('span', { class: 'badge' }, L(...FACT_LABEL[f.type])), ' ', h('b', null, f.type === 'date' ? f.value : f.text)),
    h('div', { class: 'small', html: highlight(f.sentence, [f.text]) }),
    h('div', { class: 'cite' }, h('span', { class: 'src' }, `📄 ${doc.name} · ${f.unit.label}`), ' ', i >= 0 ? h('a', { class: 'btn small', href: `#/mydoc/${encodeURIComponent(doc.id)}/${i}` }, L('देखें', 'View')) : null),
    actions.length ? h('div', { class: 'row' }, actions) : null);
}

function factsPanel(doc) {
  const facts = extractFacts(doc);
  const idxOf = (n) => doc.units.findIndex((u) => u.n === n);
  const list = h('ul', { class: 'facts' });
  const counts = Object.fromEntries(Object.keys(FACT_LABEL).map((t) => [t, facts.filter((f) => f.type === t).length]));
  let type = 'all';
  let limit = 30;
  const more = h('button', { class: 'btn small', type: 'button', onclick: () => { limit += 30; draw(); } }, L('और दिखाएँ', 'Show more'));
  const seg = h('div', { class: 'chips', role: 'group' });
  const draw = () => {
    const sel = facts.filter((f) => type === 'all' || f.type === type);
    clear(list).append(...sel.slice(0, limit).map((f) => factItem(doc, f, idxOf)));
    if (!sel.length) list.append(h('li', { class: 'muted' }, L('इस फ़ाइल में राशि, प्रतिशत, अवधि या तिथि नहीं मिली।', 'No amounts, percentages, periods or dates were found in this file.')));
    more.hidden = sel.length <= limit;
    clear(seg).append(...[['all', ['सभी', 'All'], facts.length], ...Object.entries(FACT_LABEL).map(([t, lab]) => [t, lab, counts[t]])].map(([t, lab, c]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(type === t), onclick: () => { type = t; limit = 30; draw(); } }, `${L(...lab)} (${c})`)));
  };
  draw();
  return h('section', { class: 'card', id: 'keyfacts', 'data-keyfacts': '' },
    h('h2', null, L('मुख्य बातें', 'Key facts')),
    h('p', { class: 'note info small' }, L('ये जाँचने के बिंदु हैं, निर्णय नहीं। हर बात के साथ फ़ाइल का भाग दिया है; राशि को नियमों से जाँचें।', 'These are points to check, not verdicts. Each shows the part of the file it comes from; check amounts against the rules.')),
    seg, list, more);
}

function askPanel(doc) {
  const input = h('input', { type: 'search', placeholder: L('इस फ़ाइल से पूछें', 'Ask about this file'), 'aria-label': L('इस फ़ाइल से पूछें', 'Ask about this file'), 'data-file-search': '', enterkeyhint: 'search' });
  const out = h('ol', { class: 'sources' });
  const run = () => {
    const q = input.value.trim();
    clear(out);
    if (!q) return;
    const res = userIndex()?.search(q, { docId: doc.id, limit: 8 }) || [];
    const words = tokenize(q).concat(q.toLowerCase().split(/\s+/));
    if (!res.length) out.append(h('li', { class: 'muted' }, L('इस फ़ाइल में नहीं मिला', 'Not found in this file')));
    for (const s of res) {
      out.append(h('li', null, h('div', null, h('b', null, `📄 ${doc.name}`), ` · ${s.label}`), h('div', { class: 'small', html: highlight(s.snippet, words) }),
        h('a', { class: 'btn small', href: `#/mydoc/${encodeURIComponent(doc.id)}/${s.i}` }, L('देखें', 'View'))));
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  input.addEventListener('input', () => { if (!input.value.trim()) clear(out); });
  return h('section', { class: 'card', id: 'askfile' },
    h('h2', null, L('इस फ़ाइल से पूछें', 'Ask about this file')),
    h('div', { class: 'askbar static' }, input, h('button', { class: 'btn primary', type: 'button', 'data-btn': 'file-search', onclick: run }, L('खोजें', 'Search'))),
    h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => input.value.trim() && askAndGo(input.value.trim(), null) }, L('यही प्रश्न सामग्री से पूछें', 'Ask the material this question'))),
    out);
}

function unitBlock(doc, u, i, { open, pdfHolder }) {
  const pic = doc.type === 'pdf' ? h('div', { class: 'pagepic' }) : null;
  const picBtn = doc.type === 'pdf' ? h('button', { class: 'btn small', type: 'button', onclick: async () => {
    picBtn.disabled = true;
    clear(pic).append(h('div', { class: 'small muted' }, L('पृष्ठ का चित्र बन रहा है…', 'Drawing the page…')));
    try {
      const pdf = await pdfHolder.get();
      const c = await renderPdfPage(pdf, u.n, { scale: 1.5, maxSide: 1800 });
      c.className = 'pagecanvas';
      clear(pic).append(c);
    } catch {
      clear(pic).append(h('div', { class: 'small muted' }, L('चित्र नहीं बन सका', 'Could not draw the page')));
    }
    picBtn.disabled = false;
  } }, L('पृष्ठ का चित्र', 'Page picture')) : null;
  const body = [u.text, u.notes ? `\n— ${L('वक्ता नोट्स', 'Speaker notes')} —\n${u.notes}` : ''].join('');
  return h('details', { class: 'unit', id: `unit-${i}`, open: open || null, 'data-unit': u.label },
    h('summary', null, h('b', null, u.label), u.title && !u.label.includes(u.title) ? h('span', { class: 'small muted' }, ` · ${u.title}`) : null, u.ocr ? h('span', { class: 'badge' }, ' OCR') : null, u.hidden ? h('span', { class: 'badge' }, ' hidden') : null),
    body.trim() ? h('pre', { class: 'text' }, body.trim()) : h('p', { class: 'muted small' }, L('(पाठ नहीं)', '(no text)')),
    h('div', { class: 'row noprint' },
      body.trim() ? h('button', { class: 'btn small', type: 'button', onclick: () => askAndGo(body.trim(), 'file') }, L('इस पाठ से सामग्री में पूछें', 'Ask the material with this text')) : null,
      picBtn),
    pic);
}

export function renderMyDoc(main, id, unitIndex = null) {
  releaseUrls();
  const doc = getDoc(id);
  if (!doc) {
    clear(main).append(h('section', { class: 'view' }, h('p', null, h('a', { href: '#/sources' }, `← ${L('स्रोत', 'Sources')}`)), h('p', { class: 'muted' }, L('यह दस्तावेज़ इस डिवाइस पर नहीं मिला।', 'This document is not on this device.'))));
    return;
  }
  let pdfP = null;
  const pdfHolder = {
    get: () => {
      pdfP ||= (async () => {
        const b = await docBlobs(doc.id);
        if (!b?.file) throw new Error('no file');
        const pdfjs = await loadPdfjs();
        return openPdf(pdfjs, new Uint8Array(await b.file.arrayBuffer()), PDF_EXTRA());
      })();
      return pdfP;
    },
  };
  const photo = doc.type === 'image' ? h('div', { class: 'photo' }) : null;
  if (photo) {
    docBlobs(doc.id).then((b) => {
      if (b?.image) photo.append(h('img', { src: trackUrl(URL.createObjectURL(b.image)), alt: doc.name, class: 'docphoto' }));
    }).catch(() => {});
  }
  const target = unitIndex !== null && Number.isFinite(unitIndex) ? unitIndex : null;
  let shown = Math.max(20, target !== null ? target + 1 : 0);
  const units = h('div', { class: 'units' });
  const moreBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { shown += 40; drawUnits(); } }, L('और भाग दिखाएँ', 'Show more parts'));
  const drawUnits = () => {
    clear(units).append(...doc.units.slice(0, shown).map((u, i) => unitBlock(doc, u, i, { open: i === target || doc.units.length <= 3, pdfHolder })));
    moreBtn.hidden = doc.units.length <= shown;
  };
  drawUnits();
  const del = h('button', { class: 'btn small danger', type: 'button', 'data-btn': 'delete-doc', onclick: async () => {
    if (!confirm(L(`“${doc.name}” हटाएँ?`, `Delete “${doc.name}”?`))) return;
    await deleteDoc(doc.id);
    toast(L('हटा दिया गया', 'Deleted'));
    go('#/sources');
  } }, L('यह दस्तावेज़ हटाएँ', 'Delete this document'));
  clear(main).append(h('section', { class: 'view mydoc' },
    h('p', null, h('a', { href: '#/sources' }, `← ${L('मेरे दस्तावेज़', 'My documents')}`)),
    h('h1', { class: 'fname' }, doc.name),
    h('p', { class: 'small muted' }, [TYPE_LABEL[doc.type] || doc.type, fmtBytes(doc.size), `${L('जोड़ा', 'added')} ${localDmy(doc.added)}`, unitWords(doc.type, doc.units.length)].join(' · '), doc.path && doc.path !== doc.name ? h('div', null, doc.path) : null),
    h('p', { class: 'small' }, PRIVACY()),
    doc.type === 'docx' ? h('div', { class: 'note info small' }, L('Word फ़ाइल: पृष्ठ संख्या उपलब्ध नहीं; हवाला शीर्षक और अनुच्छेद से दिया गया है।', 'Word file: page numbers are not available; citations give the heading and paragraph.')) : null,
    doc.scanned ? h('div', { class: 'note info small' }, L(`${doc.scanned} स्कैन किए पृष्ठ थे; जहाँ पढ़े गए वहाँ “OCR” लिखा है।`, `${doc.scanned} scanned page(s); those read with OCR are marked “OCR”.`)) : null,
    photo,
    askPanel(doc),
    factsPanel(doc),
    h('section', { class: 'card' }, h('h2', null, L('भाग', 'Parts')), units, moreBtn),
    h('div', { class: 'row noprint' }, del),
    disclaimer()));
  if (target !== null) {
    requestAnimationFrame(() => {
      const el = document.getElementById(`unit-${target}`);
      if (el) { el.classList.add('target'); el.scrollIntoView({ block: 'start' }); }
    });
  }
}
