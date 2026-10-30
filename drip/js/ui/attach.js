// Camera (📷), attach (📎 files / folder) controls, the photo review step and the per-file progress list.
// Photos and files are processed in this browser and kept only on this device.
import { h, L, clear, toast } from './dom.js';
import { preparePhoto } from '../imageprep.js';
import { recognize, tooLittleText, ocrLangs, setOcrHindi } from '../ocr.js';
import { ingestFiles, secPerPage } from '../ingest.js';
import { addDoc, newId } from '../mydocs.js';
import { MESSAGES, TYPE_LABEL } from '../core/files/detect.js';
import { parseMisForm } from '../core/misform.js';
import { state } from '../data.js';
import { checkEntryLater } from './plan.js';

export const PRIVACY = () => L('आपकी फ़ोटो और फ़ाइलें इसी फ़ोन/कंप्यूटर में रहती हैं; कहीं अपलोड नहीं होतीं।', 'Your photos and files stay on this device; nothing is uploaded.');
const msg = (m) => (m ? L(m.hi, m.en) : '');
export const folderSupported = () => {
  try { return 'webkitdirectory' in document.createElement('input'); } catch { return false; }
};

const p2 = (n) => String(n).padStart(2, '0');
/** Local date DD/MM/YYYY (and time HHMM) for names and lists. */
export function localDmy(d, time = false) {
  const x = d instanceof Date ? d : new Date(d);
  return `${p2(x.getDate())}/${p2(x.getMonth() + 1)}/${x.getFullYear()}${time ? ` ${p2(x.getHours())}${p2(x.getMinutes())}` : ''}`;
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
}

export function unitWords(type, n) {
  const w = { pptx: ['स्लाइड', 'slides'], pdf: ['पृष्ठ', 'pages'], docx: ['भाग', 'sections'], xlsx: ['पंक्ति-खंड', 'row blocks'], image: ['फ़ोटो', 'photo'] }[type] || ['भाग', 'parts'];
  return `${n} ${L(w[0], w[1])}`;
}

/** Hidden file inputs. Camera: accept=image/* capture=environment; gallery: the same without capture. */
export function fileInputs({ onPhoto, onFiles }) {
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'data-input': 'camera' });
  const gal = h('input', { type: 'file', accept: 'image/*', hidden: true, 'data-input': 'gallery' });
  const files = h('input', { type: 'file', multiple: true, hidden: true, 'data-input': 'files' });
  const folder = h('input', { type: 'file', multiple: true, hidden: true, 'data-input': 'folder' });
  if (folderSupported()) { folder.webkitdirectory = true; folder.setAttribute('webkitdirectory', ''); }
  const take = (el, fn) => el.addEventListener('change', () => {
    const list = [...(el.files || [])];
    el.value = '';
    if (list.length) fn(list);
  });
  take(cam, (l) => onPhoto(l[0]));
  take(gal, (l) => onPhoto(l[0]));
  take(files, onFiles);
  take(folder, onFiles);
  return { cam, gal, files, folder, all: [cam, gal, files, folder] };
}

function hint() {
  return h('p', { class: 'small muted' }, L('यदि कैमरा नहीं खुलता: ⋮ → Chrome में खोलें', "If the camera doesn't open: ⋮ → Open in Chrome"));
}

function hindiToggle() {
  const box = h('input', { type: 'checkbox', checked: ocrLangs().includes('hin'), 'data-ocr-hindi': '' });
  box.addEventListener('change', () => {
    setOcrHindi(box.checked);
    toast(box.checked ? L('फ़ोटो में हिंदी + English पढ़ी जाएगी', 'Photos will be read as Hindi + English') : L('फ़ोटो में English पढ़ी जाएगी', 'Photos will be read as English'));
  });
  return h('label', { class: 'check small' }, box, 'हिंदी + English');
}

/** A small pop-up menu attached to a button. items: [[label, onClick] | Node] */
function menu(btn, items, { cls = '' } = {}) {
  const box = h('div', { class: `menu ${cls}`, role: 'menu', hidden: true });
  const close = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  for (const it of items) {
    if (!it) continue;
    if (it instanceof Node) box.append(it);
    else box.append(h('button', { type: 'button', role: 'menuitem', class: 'menu-item', 'data-menu': it[2] || null, onclick: () => { close(); it[1](); } }, it[0]));
  }
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = box.hidden;
    document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return box;
}

/** 📎 and 📷 buttons for the Ask composer. */
export function composerButtons(inputs) {
  const clip = h('button', { class: 'icon-btn2', type: 'button', 'aria-label': L('फ़ाइल / फ़ोल्डर जोड़ें', 'Attach files or a folder'), title: L('फ़ाइल / फ़ोल्डर जोड़ें', 'Attach files or a folder'), 'data-btn': 'attach' }, '📎');
  const clipMenu = menu(clip, [
    [`📄 ${L('फ़ाइलें', 'Files')}`, () => inputs.files.click(), 'files'],
    folderSupported() ? [`📁 ${L('फ़ोल्डर', 'Folder')}`, () => inputs.folder.click(), 'folder'] : null,
    [`📷 ${L('कैमरा', 'Camera')}`, () => inputs.cam.click(), 'camera'],
    h('p', { class: 'small muted' }, PRIVACY()),
  ]);
  const cam = h('button', { class: 'icon-btn2', type: 'button', 'aria-label': L('कैमरा से पूछें', 'Ask with camera'), title: L('कैमरा से पूछें', 'Ask with camera'), 'data-btn': 'camera' }, '📷');
  const camMenu = menu(cam, [
    [`📷 ${L('कैमरा से पूछें', 'Ask with camera')}`, () => inputs.cam.click(), 'camera'],
    [`🖼️ ${L('गैलरी से', 'From gallery')}`, () => inputs.gal.click(), 'gallery'],
    hindiToggle(),
    hint(),
    h('p', { class: 'small muted' }, PRIVACY()),
  ], { cls: 'right' });
  return { clip: h('span', { class: 'menu-anchor' }, clip, clipMenu), cam: h('span', { class: 'menu-anchor' }, cam, camMenu) };
}

/** Buttons for the My documents card: Files, Folder (when supported), Camera. */
export function libraryButtons(inputs) {
  return h('div', { class: 'row noprint' },
    h('button', { class: 'btn small', type: 'button', 'data-btn': 'lib-files', onclick: () => inputs.files.click() }, `📄 ${L('फ़ाइलें', 'Files')}`),
    folderSupported()
      ? h('button', { class: 'btn small', type: 'button', 'data-btn': 'lib-folder', onclick: () => inputs.folder.click() }, `📁 ${L('फ़ोल्डर', 'Folder')}`)
      : h('span', { class: 'small muted' }, L('(इस ब्राउज़र में फ़ोल्डर नहीं चुना जा सकता — कई फ़ाइलें चुनें)', '(this browser cannot pick a folder — select several files instead)')),
    h('button', { class: 'btn small', type: 'button', 'data-btn': 'lib-camera', onclick: () => inputs.cam.click() }, `📷 ${L('कैमरा', 'Camera')}`));
}

// ---------------------------------------------------------------- DRIP-MIS screen

const NUMERIC = new Set(['amount_inr', 'amount_usd', 'completion_months']);

/** "यह DRIP-MIS प्रविष्टि लगती है / This looks like a DRIP-MIS entry": the values read, editable. */
export function misCard(mis) {
  const form = state.general.form;
  const card = h('div', { class: 'card mis', 'data-mis': mis.blank ? 'blank' : 'filled' },
    h('div', { class: 'kicker' }, `📋 ${L('यह DRIP-MIS प्रविष्टि लगती है', 'This looks like a DRIP-MIS entry')}`));
  if (mis.blank) {
    card.append(h('p', { class: 'small' }, L('फ़ॉर्म में कोई भरा हुआ मान नहीं मिला (खाली फ़ॉर्म)। योजना सहायक में श्रेणी और राशि डालकर सही प्रविष्टियाँ देखें।', 'No filled-in values were found (a blank form). Enter the category and amount in the Plan helper to see the right entries.')),
      h('a', { class: 'btn small primary', href: '#/plan', 'data-btn': 'mis-plan' }, L('योजना सहायक खोलें', 'Open the Plan helper')));
    return card;
  }
  const inputs = new Map();
  const row = (f) => {
    const id = `mis-${f.key}`;
    const el = h('input', { id, type: 'text', value: mis.entry[f.key] ?? '', autocomplete: 'off', 'data-field': f.key });
    inputs.set(f.key, el);
    return h('label', { class: 'field', for: id }, h('span', null, L(f.hi, f.label)), el);
  };
  const check = () => {
    const entry = {};
    for (const [k, el] of inputs) {
      const v = el.value.trim();
      if (!v) continue;
      entry[k] = NUMERIC.has(k) && Number.isFinite(+v.replace(/,/g, '')) ? +v.replace(/,/g, '') : v;
    }
    checkEntryLater(entry);
    location.hash = '#/plan/check';
  };
  const checkBtn = (top = false) => h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', 'data-btn': top ? 'mis-check-top' : 'mis-check', onclick: check }, L('प्रविष्टि जाँचें', 'Check this entry')));
  const fields = form.fields.filter((f) => !['comment', 'send_to', 'cc'].includes(f.key));
  const read = fields.filter((f) => mis.found.includes(f.key));
  const unread = fields.filter((f) => !mis.found.includes(f.key));
  card.append(
    h('p', { class: 'small' }, L(`फ़ोटो से ${read.length} मान पढ़े गए — जाँचें और ज़रूरत हो तो सुधारें; जो नहीं पढ़े गए वे खाली हैं।`, `${read.length} values were read from the photo — check and correct them; anything not read is left empty.`)),
    mis.notes.map((n) => h('div', { class: 'note warn small' }, L(n.hi, n.en))),
    checkBtn(true),
    h('div', { class: 'grid2' }, read.map(row)),
    unread.length ? h('details', null, h('summary', { class: 'small' }, L(`न पढ़े गए फ़ील्ड (${unread.length})`, `Fields not read (${unread.length})`)), h('div', { class: 'grid2' }, unread.map(row))) : null,
    checkBtn());
  return card;
}

function readMis(text) {
  if (!state.general?.form) return null;
  try {
    const dam = state.office?.office?.defaults?.dam;
    const r = parseMisForm(text, { form: state.general.form, dams: dam ? [dam] : [], rate: state.general.rules.currency.inr_per_usd });
    return r.isForm ? r : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- photo review

/**
 * Read a photo and show the review card in `slot`.
 * onAsk(text, thumb) asks with the (possibly corrected or selected) text.
 */
export async function photoReview(file, slot, { onAsk, onSaved } = {}) {
  const ctrl = new AbortController();
  const card = h('article', { class: 'msg a review', 'data-review': '' });
  clear(slot).append(card);
  const close = () => { ctrl.abort(); slot.contains(card) && card.remove(); };
  const status = h('div', { class: 'small', 'aria-live': 'polite' }, L('फ़ोटो खुल रही है…', 'Opening the photo…'));
  const bar = h('progress', { max: '100', value: '0' });
  const cancel = h('button', { class: 'btn small', type: 'button', onclick: close }, L('रद्द करें', 'Cancel'));
  card.append(h('div', { class: 'kicker' }, `📷 ${L('फ़ोटो से प्रश्न', 'Question from a photo')}`), h('p', { class: 'small muted' }, PRIVACY()), status, bar, h('div', { class: 'row' }, cancel));
  slot.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  let ph;
  try {
    if (/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '')) throw Object.assign(new Error('heic'), { code: 'heic' });
    ph = await preparePhoto(file);
  } catch (e) {
    clear(card).append(h('div', { class: 'note err' }, msg(MESSAGES[e.code === 'heic' ? 'heic' : 'corrupt'])), h('button', { class: 'btn small', type: 'button', onclick: close }, L('बंद करें', 'Close')));
    return null;
  }
  const thumb = h('img', { class: 'thumb', src: ph.thumb, alt: L('फ़ोटो', 'Photo') });
  card.insertBefore(thumb, status);
  let r;
  try {
    r = await recognize(ph.ocr, {
      signal: ctrl.signal,
      onProgress: (p) => {
        bar.value = p.pct;
        status.textContent = p.stage === 'load'
          ? L(`OCR तैयार हो रहा है… ${p.pct}%`, `Getting OCR ready… ${p.pct}%`)
          : L(`फ़ोटो पढ़ी जा रही है… ${p.pct}%`, `Reading the photo… ${p.pct}%`);
      },
    });
  } catch (e) {
    if (e.code === 'cancelled') return null;
    clear(card).append(h('div', { class: 'note err' }, L('फ़ोटो पढ़ी नहीं जा सकी। इंटरनेट न हो तो पहले सेटिंग में “ऑफ़लाइन के लिए OCR डाउनलोड करें” चुनें।', 'Could not read the photo. If you are offline, first use “Download OCR for offline use” in Settings.')), h('button', { class: 'btn small', type: 'button', onclick: close }, L('बंद करें', 'Close')));
    return null;
  }
  const ta = h('textarea', { id: 'ocr-text', rows: '6', 'aria-label': L('पढ़ा गया पाठ', 'Text read from the photo') }, r.text);
  const little = tooLittleText(r.text);
  const pick = () => {
    const sel = ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ta.value;
    return sel.trim();
  };
  const save = async () => {
    const text = ta.value.trim();
    if (!text) return toast(L('पहले पाठ लिखें', 'Type the text first'));
    const now = new Date();
    const name = file.name && !/^image\.\w+$/i.test(file.name) ? file.name : `Photo ${localDmy(now, true).replace(/\//g, '-')}.jpg`;
    try {
      const doc = await addDoc({ id: newId(), name, path: name, type: 'image', size: file.size, added: now.toISOString(), source: 'camera', units: [{ n: 1, label: 'Photo', text, ocr: true }], width: ph.width, height: ph.height }, { image: ph.keep });
      toast(L('मेरे दस्तावेज़ों में सहेजा गया', 'Saved to My documents'));
      saveBtn.disabled = true;
      onSaved?.(doc);
    } catch (e) {
      toast(msg(MESSAGES[e.code === 'storage-full' ? 'storage-full' : 'storage']));
    }
  };
  const saveBtn = h('button', { class: 'btn small', type: 'button', 'data-btn': 'save-photo', onclick: save }, L('मेरे दस्तावेज़ों में सहेजें', 'Save to My documents'));
  const mis = readMis(r.text);
  clear(card).append(
    h('div', { class: 'kicker' }, `📷 ${L('फ़ोटो से प्रश्न', 'Question from a photo')}`),
    thumb,
    mis ? misCard(mis) : '',
    h('label', { class: 'field', for: 'ocr-text' }, h('span', null, L('ऐप ने यह पढ़ा — ज़रूरत हो तो सुधारें', 'This is what the app read — correct it if needed')), ta),
    h('p', { class: 'small muted' }, L('केवल एक भाग से पूछना हो तो उसे चुनें (select) करें।', 'To ask with only part of it, select that part.'), ` · ${(r.ms / 1000).toFixed(1)} s`),
    little ? h('div', { class: 'note warn', 'data-little': '' }, L('फ़ोटो में लगभग कोई पाठ नहीं मिला। फिर से फ़ोटो लें: हाथ स्थिर रखें, अच्छी रोशनी, पाठ से पूरा फ़्रेम भरें।', 'Almost no text was found in the photo. Please retake it: hold steady, use good light, fill the frame with the text.')) : '',
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', type: 'button', 'data-btn': 'ask-photo', onclick: () => {
        const text = pick();
        if (!text) return toast(L('पहले पाठ लिखें', 'Type the text first'));
        card.remove();
        onAsk?.(text, ph.thumb);
      } }, L('इससे पूछें', 'Ask with this text')),
      saveBtn,
      h('button', { class: 'btn small', type: 'button', onclick: close }, L('रद्द करें', 'Cancel'))),
    h('p', { class: 'small muted' }, PRIVACY()));
  // the finished card is much taller than the progress card: bring its top into view
  requestAnimationFrame(() => card.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  return { text: r.text, ms: r.ms, mis };
}

// ---------------------------------------------------------------- files and folders

function itemLine(it) {
  const icon = { wait: '•', read: '⏳', ocr: '🔎', added: '✓', skipped: '✗' }[it.state] || '•';
  let detail = '';
  if (it.state === 'read') detail = it.pages ? L(`पढ़ रहे हैं… पृष्ठ ${it.page}/${it.pages}`, `reading… page ${it.page}/${it.pages}`) : L('पढ़ रहे हैं…', 'reading…');
  else if (it.state === 'ocr') detail = L(`OCR… ${it.pct || 0}%`, `OCR… ${it.pct || 0}%`);
  else if (it.state === 'added') detail = `${TYPE_LABEL[it.doc?.type] || ''} · ${unitWords(it.doc?.type, it.units)}`;
  else if (it.state === 'skipped') detail = msg(it.message);
  return h('li', { class: `file-item ${it.state}`, 'data-state': it.state }, h('span', { class: 'ico', 'aria-hidden': 'true' }, icon), h('span', { class: 'grow' }, h('span', { class: 'fname' }, it.path), h('span', { class: 'small muted' }, ` — ${detail}`)));
}

export function summaryText(r) {
  const why = r.unsupported ? (r.unsupported === r.skipped ? ['असमर्थित', 'unsupported'] : [`${r.unsupported} असमर्थित`, `${r.unsupported} unsupported`]) : null;
  return L(`${r.added} जोड़ी गईं, ${r.skipped} छोड़ी गईं${why ? ` (${why[0]})` : ''}`, `${r.added} added, ${r.skipped} skipped${why ? ` (${why[1]})` : ''}`);
}

/** Add files to My documents with a per-file progress list in `slot`. Resolves with the summary. */
export async function addFiles(files, slot, { onDone } = {}) {
  const ctrl = new AbortController();
  const list = h('ul', { class: 'file-list' });
  const head = h('div', { class: 'small', 'aria-live': 'polite' }, L(`${files.length} फ़ाइलें पढ़ी जा रही हैं…`, `Reading ${files.length} file(s)…`));
  const stop = h('button', { class: 'btn small', type: 'button', onclick: () => ctrl.abort() }, L('रोकें', 'Stop'));
  const card = h('div', { class: 'card ingest', 'data-ingest': '' }, h('div', { class: 'kicker' }, `📎 ${L('मेरे दस्तावेज़ों में जोड़ रहे हैं', 'Adding to My documents')}`), h('p', { class: 'small muted' }, PRIVACY()), head, list, h('div', { class: 'row' }, stop));
  clear(slot).append(card);
  let last = 0;
  const draw = (items, force) => {
    const now = performance.now();
    if (!force && now - last < 120) return;
    last = now;
    clear(list).append(...items.map(itemLine));
  };
  const r = await ingestFiles(files, {
    signal: ctrl.signal,
    onUpdate: (items) => draw(items),
    confirmOcr: async (pages, secs) => confirm(L(
      `${pages} पृष्ठों पर पाठ नहीं है (स्कैन किए हुए)। इन्हें OCR से पढ़ें? लगभग ${Math.max(1, Math.round(secs / 60))} मिनट लगेंगे।`,
      `${pages} pages have no text (scanned). Read them with OCR? This takes about ${Math.max(1, Math.round(secs / 60))} min.`)),
  });
  draw(r.items, true);
  head.textContent = summaryText(r);
  head.setAttribute('data-summary', '');
  stop.replaceWith(h('button', { class: 'btn small', type: 'button', onclick: () => card.remove() }, L('बंद करें', 'Close')));
  onDone?.(r);
  return r;
}

export { secPerPage };
