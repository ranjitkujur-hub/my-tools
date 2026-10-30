// "स्रोत / Sources": documents → slides/pages → viewer with zoom, swipe and text.
import { h, L, clear, toast, copyText, highlight, waButton } from './dom.js';
import { state, allDocs, docMeta, unit, picture } from '../data.js';
import { normalize } from '../core/text.js';
import { deepLink } from '../core/share.js';
import { OFFICE_LABEL } from './answer.js';
import { myDocsSection } from './mydocs.js';

const navigate = (hash) => { location.hash = hash; };

function unitsOf(doc) {
  return (state.general?.units[doc] || state.office?.units[doc] || []);
}

function unitTitle(d, u) {
  if (d.unit === 'page') return u.label || '';
  const first = (u.title || (u.text || '').split('\n').find((l) => l.trim()) || '').trim();
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

export function renderDocList(main) {
  const docs = allDocs();
  clear(main).append(h('section', { class: 'view' },
    h('h1', null, L('स्रोत', 'Sources')),
    myDocsSection(),
    h('h2', null, `📚 ${L('सामग्री', 'The material')}`),
    h('p', { class: 'small muted' }, L('दस्तावेज़ चुनें, फिर स्लाइड या पृष्ठ।', 'Pick a document, then a slide or page.')),
    h('ul', { class: 'list card', style: 'padding:0' }, docs.map((d) => h('li', null,
      h('a', { href: `#/doc/${encodeURIComponent(d.id)}` },
        h('span', { class: 'grow' }, h('b', null, d.short), h('div', { class: 'small muted' }, d.title)),
        h('span', { class: 'small muted' }, `${d.count} ${d.unit === 'page' ? L('पृष्ठ', 'pages') : L('स्लाइड', 'slides')}`)))))));
}

export function renderDoc(main, docId) {
  const d = docMeta(docId);
  if (!d) return renderDocList(main);
  const units = unitsOf(docId);
  const list = h('ul', { class: 'list card', style: 'padding:0' });
  const search = h('input', { type: 'search', placeholder: L('इस दस्तावेज़ में खोजें', 'Search in this document'), 'aria-label': L('इस दस्तावेज़ में खोजें', 'Search in this document') });
  const draw = () => {
    const q = normalize(search.value);
    const words = q.split(' ').filter(Boolean);
    clear(list);
    let shown = 0;
    for (const u of units) {
      const hay = normalize(`${u.title || ''} ${u.text || ''} ${u.notes || ''} ${u.ocr || ''} ${u.label || ''}`);
      if (words.length && !words.every((w) => hay.includes(w))) continue;
      shown++;
      let snip = null;
      if (words.length) {
        const raw = `${u.text || ''} ${u.notes || ''} ${u.ocr || ''}`.replace(/\s+/g, ' ');
        const i = raw.toLowerCase().indexOf(words[0]);
        snip = h('div', { class: 'small', html: highlight(raw.slice(Math.max(0, i - 60), i + 140), words) });
      }
      list.append(h('li', null, h('a', { href: `#/doc/${encodeURIComponent(docId)}/${u.n}` },
        h('span', { class: 'num' }, `${d.unit === 'page' ? 'p.' : '#'}${u.n}`),
        h('span', { class: 'grow' }, unitTitle(d, u) || h('span', { class: 'muted' }, '—'), u.hidden ? h('span', { class: 'badge' }, ' hidden') : null, snip))));
    }
    if (!shown) list.append(h('li', { class: 'pad muted' }, L('कुछ नहीं मिला', 'Nothing found')));
  };
  search.addEventListener('input', draw);
  clear(main).append(h('section', { class: 'view' },
    h('p', null, h('a', { href: '#/sources' }, `← ${L('सभी दस्तावेज़', 'All documents')}`)),
    h('h1', null, d.short),
    h('p', { class: 'small muted' }, d.title),
    d.page_note ? h('p', { class: 'small muted' }, d.page_note) : null,
    docId in (state.office?.units || {}) ? h('div', { class: 'office-label' }, OFFICE_LABEL) : null,
    search, list));
  draw();
}

/** Pinch-zoom, double-tap zoom and swipe for the picture viewer. */
function attachGestures(box, img, { onPrev, onNext }) {
  let scale = 1; let tx = 0; let ty = 0;
  const pts = new Map();
  let start = null;
  let lastTap = 0;
  const apply = () => {
    const w = box.clientWidth; const hgt = img.clientHeight;
    tx = Math.min(0, Math.max(w - w * scale, tx));
    ty = Math.min(0, Math.max(hgt - hgt * scale, ty));
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const zoomAt = (x, y, s) => {
    const ns = Math.min(5, Math.max(1, s));
    tx = x - ((x - tx) * ns) / scale;
    ty = y - ((y - ty) * ns) / scale;
    scale = ns;
    if (scale === 1) { tx = 0; ty = 0; }
    apply();
  };
  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = box.getBoundingClientRect();
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() };
      const now = Date.now();
      if (now - lastTap < 300) { zoomAt(e.clientX - r.left, e.clientY - r.top, scale > 1 ? 1 : 2.5); lastTap = 0; } else lastTap = now;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      start = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && start?.dist) {
      const [a, b] = [...pts.values()];
      zoomAt(start.cx, start.cy, (start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / start.dist);
    } else if (pts.size === 1 && start && scale > 1) {
      tx = start.tx + (e.clientX - start.x);
      ty = start.ty + (e.clientY - start.y);
      apply();
    }
  });
  const end = (e) => {
    if (pts.size === 1 && start && !start.dist && scale === 1) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && Date.now() - start.t < 800) (dx < 0 ? onNext : onPrev)();
    }
    pts.delete(e.pointerId);
    if (pts.size < 2 && start?.dist) start = null;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  box.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
}

export function renderViewer(main, docId, n, { tab = 'pic' } = {}) {
  const d = docMeta(docId);
  const u = unit(docId, n);
  if (!d || !u) return renderDoc(main, docId);
  const units = unitsOf(docId);
  const idx = units.findIndex((x) => x.n === u.n);
  const prev = units[idx - 1];
  const next = units[idx + 1];
  const go = (x) => x && navigate(`#/doc/${encodeURIComponent(docId)}/${x.n}`);
  const img = h('img', { alt: `${d.short} – ${d.unit === 'page' ? 'page' : 'slide'} ${u.n}`, draggable: 'false' });
  const box = h('div', { class: 'viewer' }, h('div', { class: 'loading' }, L('चित्र खुल रहा है…', 'Opening picture…')));
  const textPane = h('div', null);
  const isPage = d.unit === 'page';
  const blocks = [];
  if (isPage) {
    blocks.push(h('div', { class: 'tabs' }), h('pre', { class: 'text layout' }, u.layout || u.text || ''));
    if (u.tbc?.length) blocks.push(h('div', { class: 'note warn' }, h('b', null, 'TBC: '), u.tbc.join(' · ')));
    if (u.note) blocks.push(h('div', { class: 'note info' }, u.note));
  } else {
    if (u.text) blocks.push(h('h2', null, L('पाठ', 'Text')), h('pre', { class: 'text' }, u.text));
    if (u.notes) blocks.push(h('h2', null, L('वक्ता नोट्स', 'Speaker notes')), h('pre', { class: 'text' }, u.notes));
    if (u.ocr) blocks.push(h('h2', null, L('चित्र से पढ़ा', 'Read from the slide picture')), h('pre', { class: 'text' }, u.ocr));
    if (!blocks.length) blocks.push(h('p', { class: 'muted' }, L('इस स्लाइड पर पाठ नहीं है — चित्र देखें।', 'No text on this slide — see the picture.')));
  }
  textPane.append(...blocks.filter((b) => !b.classList?.contains('tabs')));
  const picBtn = h('button', { type: 'button', role: 'tab' }, L('चित्र', 'Picture'));
  const txtBtn = h('button', { type: 'button', role: 'tab' }, L('पाठ', 'Text'));
  const setTab = (t) => {
    picBtn.setAttribute('aria-selected', String(t === 'pic'));
    txtBtn.setAttribute('aria-selected', String(t === 'text'));
    box.hidden = t !== 'pic';
    textPane.hidden = t !== 'text';
  };
  picBtn.onclick = () => setTab('pic');
  txtBtn.onclick = () => setTab('text');
  const askAbout = () => {
    const q = isPage ? `${u.label || ''} page ${u.n}` : (u.title || (u.text || '').split('\n')[0] || '');
    navigate(`#/ask/${encodeURIComponent(q.slice(0, 120))}`);
  };
  const share = () => {
    const link = deepLink(location.href, `doc/${encodeURIComponent(docId)}/${u.n}`);
    const text = `*${d.short} · ${isPage ? 'Page' : 'Slide'} ${u.n}*${state.office?.units[docId] ? `\n_${OFFICE_LABEL}_` : ''}\n${link}`;
    return text;
  };
  const shareRow = h('div', { class: 'row noprint' },
    h('button', { class: 'btn small', type: 'button', onclick: askAbout }, L('इस पर प्रश्न पूछें', 'Ask about this')),
    waButton(L('लिंक साझा करें', 'Share link'), share, 'btn small'),
    h('button', { class: 'btn small', type: 'button', onclick: () => copyText(share()) }, L('लिंक कॉपी', 'Copy link')));
  clear(main).append(h('section', { class: 'view' },
    h('p', null, h('a', { href: `#/doc/${encodeURIComponent(docId)}` }, `← ${d.short}`)),
    h('h1', null, `${d.short} · ${isPage ? 'Page' : 'Slide'} ${u.n}`, u.hidden ? h('span', { class: 'badge' }, ' hidden slide') : null),
    isPage ? h('p', { class: 'small muted' }, u.label) : (u.title ? h('p', { class: 'small muted' }, u.title) : null),
    state.office?.units[docId] ? h('div', { class: 'office-label' }, OFFICE_LABEL) : null,
    h('div', { class: 'seg', role: 'tablist', 'aria-label': L('दृश्य', 'View') }, picBtn, txtBtn),
    h('div', { class: 'row prevnext' },
      h('button', { class: 'btn small', type: 'button', disabled: !prev, onclick: () => go(prev), 'aria-label': L('पिछला', 'Previous') }, '‹ ', L('पिछला', 'Prev')),
      h('button', { class: 'btn small', type: 'button', disabled: !next, onclick: () => go(next), 'aria-label': L('अगला', 'Next') }, L('अगला', 'Next'), ' ›')),
    box, textPane, shareRow,
    h('p', { class: 'small muted noprint' }, L('ज़ूम: दो उँगलियों से या दो बार टैप करें; स्वाइप करके आगे/पीछे', 'Zoom: pinch or double-tap; swipe for next/previous'))));
  setTab(tab);
  attachGestures(box, img, { onPrev: () => go(prev), onNext: () => go(next) });
  picture(docId, u.n).then((url) => {
    clear(box).append(img);
    img.src = url;
  }).catch(() => {
    clear(box).append(h('div', { class: 'loading' }, L('चित्र नहीं खुला (ऑफ़लाइन?) — पाठ देखें।', 'Could not open the picture (offline?) — see the text.')));
    toast(L('चित्र उपलब्ध नहीं', 'Picture not available'));
  });
}
