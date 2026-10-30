// Answer cards, citations ("आधार / Justification") and source lists.
import { h, L, hiOn, md, copyText, highlight, waButton } from './dom.js';
import { docMeta, state } from '../data.js';
import { buildShareText, deepLink } from '../core/share.js';
import { tokenize } from '../core/search.js';

export const DISCLAIMER = 'यह सहायक केवल प्रशिक्षण स्लाइडों और उपलब्ध दस्तावेज़ों पर आधारित है; अंतिम निर्णय से पहले नवीनतम Procurement Regulations, स्वीकृत PPSD/Procurement Plan और CPMU/World Bank निर्देश देखें। / This assistant is based only on the training slides and documents provided; before deciding, check the latest Procurement Regulations, the approved PPSD/Procurement Plan and CPMU/World Bank instructions.';

export const OFFICE_LABEL = 'कार्यालय की आंतरिक जानकारी — केवल कार्यालय में साझा करें / Internal office information — share only within the office';

export function disclaimer() {
  return h('div', { class: 'disclaimer' }, DISCLAIMER);
}

export function unitWord(doc, n) {
  const d = docMeta(doc);
  return d?.unit === 'page' ? `Page ${n}` : `Slide ${n}`;
}

export function viewLink(doc, n) {
  const d = docMeta(doc);
  const label = d?.unit === 'page' ? L('पृष्ठ देखें', 'View page') : L('स्लाइड देखें', 'View slide');
  return h('a', { class: 'btn small', href: `#/doc/${encodeURIComponent(doc)}/${n}` }, label);
}

/** One justification line: "Proc. Manual Sec-4 · Slide 9 · 'quote'" + view button */
export function citeLine(c) {
  const d = docMeta(c.doc);
  const short = d?.short || c.doc;
  const parts = [short, unitWord(c.doc, c.unit)];
  if (c.ref) parts.push(c.ref);
  return h('div', { class: 'cite' },
    h('span', { class: 'src' }, parts.join(' · ')), ' · ',
    h('q', null, c.quote.replace(/\s+/g, ' ').trim()),
    c.src === 'ocr' ? h('span', { class: 'ocr' }, ` (${L('चित्र से पढ़ा', 'read from the slide picture')})`) : null,
    ' ', viewLink(c.doc, c.unit));
}

export function justification(citations, title = L('आधार', 'Justification')) {
  if (!citations?.length) return null;
  return h('div', { class: 'just' }, h('h3', null, title), citations.map(citeLine));
}

export function sourceLabel(c) {
  const d = docMeta(c.doc);
  return `${d?.short || c.doc}, ${d?.unit === 'page' ? 'page' : 'slide'} ${c.unit}`;
}

function uniqSources(citations) {
  return [...new Set(citations.map(sourceLabel))];
}

export function shareTextFor(item) {
  const link = deepLink(location.href, `q/${item.id}`);
  return buildShareText({ q: item.q_en, a: item.answer_en, hi: item.summary_hi, sources: uniqSources(item.citations), link, office: item.bundle === 'office' });
}

function actions(getText) {
  return h('div', { class: 'row noprint', style: 'margin-top:8px' },
    waButton(L('WhatsApp पर भेजें', 'Share on WhatsApp'), getText),
    h('button', { class: 'btn small', type: 'button', onclick: () => copyText(getText()) }, L('कॉपी', 'Copy')));
}

/** FAQ answer card. opts: {kicker, onAsk(id)} */
export function answerCard(item, { kicker, onAsk } = {}) {
  const related = (item.related || []).map((id) => state.engine.faq.get(id)).filter(Boolean);
  return h('article', { class: 'msg a' },
    kicker ? h('div', { class: 'kicker' }, kicker) : null,
    item.bundle === 'office' ? h('div', { class: 'office-label' }, OFFICE_LABEL) : null,
    h('div', { style: 'font-weight:700' }, item.q_en),
    hiOn() ? h('div', { class: 'small muted', lang: 'hi' }, item.q_hi) : null,
    h('div', { class: 'answer', html: md(item.answer_en) }),
    hiOn() ? h('div', { class: 'hi', lang: 'hi' }, item.summary_hi) : null,
    justification(item.citations),
    item.caveat_en ? h('div', { class: 'note info' }, h('b', null, L('ध्यान दें', 'Note') + ': '), item.caveat_en) : null,
    item.conflict ? h('div', { class: 'note warn conflict' }, h('b', null, L('स्लाइडों में अंतर', 'Slides disagree') + ': '), item.conflict) : null,
    actions(() => shareTextFor(item)),
    related.length && onAsk ? h('div', { class: 'chips noprint' }, h('span', { class: 'small muted' }, L('संबंधित', 'Related') + ':'), related.map((r) => h('button', { class: 'chip', type: 'button', onclick: () => onAsk(r.id) }, r.q_en))) : null,
    disclaimer());
}

export const PHOTO_Q = 'फ़ोटो/फ़ाइल के पाठ से प्रश्न / Question from the text of a photo or file';

/** Answer from the rules engine for a question that names an amount. */
export function rulesCard(ra) {
  const rules = state.general.rules;
  const cat = rules.categories.find((c) => c.id === ra.category);
  const lines = ra.lines;
  const text = () => {
    const body = [`For ${cat.en.toLowerCase()} of ${ra.res.amountText}:`, ...lines.map((l) => `- ${l.en}`)].join('\n');
    const src = [...new Set(lines.flatMap((l) => l.citations).map(sourceLabel))].slice(0, 6);
    // text read from a photo or a file never goes into a link
    return buildShareText({ q: ra.origin ? PHOTO_Q : ra.question, a: body, sources: src, link: ra.origin ? deepLink(location.href, '') : deepLink(location.href, `ask/${encodeURIComponent(ra.question)}`) });
  };
  return h('article', { class: 'msg a' },
    h('div', { class: 'kicker' }, L('नियमों से उत्तर (इस राशि के लिए)', 'Answer from the rules for this amount')),
    h('div', { style: 'font-weight:700' }, `${cat.en} — ${ra.res.amountText}`),
    ra.amount.assumed ? h('div', { class: 'note info small' }, L('मुद्रा नहीं लिखी थी, ₹ माना गया', 'No currency was given; rupees assumed')) : null,
    ra.amount.modifier ? h('div', { class: 'small muted' }, ra.amount.modifier === 'below' ? L('“से कम” के लिए जाँचा गया', 'Checked for a value just below the amount') : L('“से अधिक” के लिए जाँचा गया', 'Checked for a value just above the amount')) : null,
    h('ul', { class: 'rec' }, lines.map((l) => h('li', null,
      h('span', null, l.en),
      l.note ? h('div', { class: 'note info small' }, l.note) : null,
      l.conflict ? h('div', { class: 'note warn small' }, h('b', null, L('स्लाइडों में अंतर', 'Slides disagree') + ': '), l.conflict) : null,
      h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), l.citations.map(citeLine))))),
    ra.res.near.length ? h('div', { class: 'note warn' }, L('सीमा के पास', 'Close to a threshold') + ': ', ra.res.near.map((n) => `${n.label} (“${n.wording}” = ${n.text}, ${n.diffPct > 0 ? '+' : ''}${n.diffPct}%)`).join('; '), '. ', rules.cautions.find((c) => c.id === 'package-value').en) : null,
    h('div', { class: 'note info small' }, rules.cautions.find((c) => c.id === 'eighteen-months').en),
    actions(text),
    disclaimer());
}

/** "आपके दस्तावेज़ों से / From your documents": matches in the user's own files (ranked on their own). */
export function userSourcesBlock(list, query, { question = '', origin = null } = {}) {
  if (!list?.length) return null;
  const words = tokenize(query).concat(String(query).toLowerCase().split(/\s+/));
  const share = () => buildShareText({
    q: origin ? PHOTO_Q : question,
    a: 'Matches in your own files on this device (not from the official material).',
    hi: 'आपकी अपनी फ़ाइलों में मिले मिलान (आधिकारिक सामग्री से नहीं)।',
    sources: [...new Set(list.map(userSourceLabel))],
    link: origin ? deepLink(location.href, '') : deepLink(location.href, `ask/${encodeURIComponent(question)}`),
  });
  return h('div', { class: 'user-sources', 'data-user-sources': '' },
    h('div', { class: 'small muted' }, h('b', null, L('आपके दस्तावेज़ों से', 'From your documents')), ' · ', L('आपकी फ़ाइलें, आधिकारिक सामग्री नहीं', 'your files, not the official material')),
    h('ol', { class: 'sources' }, list.map((s) => h('li', null,
      h('div', null, h('b', null, `📄 ${s.path || s.name}`), ` · ${s.label}`),
      h('div', { class: 'small', html: highlight(s.snippet, words) }),
      h('a', { class: 'btn small', href: `#/mydoc/${encodeURIComponent(s.docId)}/${s.i}` }, L('देखें', 'View'))))),
    h('div', { class: 'row noprint' }, waButton(L('WhatsApp पर भेजें', 'Share on WhatsApp'), share, 'btn small')));
}

/** "आपकी फ़ाइल / your file: <name>, <unit>" — the file name and unit only, never its contents. */
export function userSourceLabel(s) {
  return `आपकी फ़ाइल / your file: ${s.name}, ${s.label}`;
}

export function sourcesBlock(sources, query) {
  if (!sources.length) return null;
  const words = tokenize(query).concat(String(query).toLowerCase().split(/\s+/));
  return h('ol', { class: 'sources' }, sources.map((s) => {
    const d = docMeta(s.doc);
    return h('li', null,
      h('div', null, h('b', null, `${d?.short || s.doc} · ${unitWord(s.doc, s.n)}`), s.clause ? ` · ${s.clause}` : '', s.kind === 'page' && s.section ? h('span', { class: 'small muted' }, ` · ${s.section}`) : null),
      h('div', { class: 'small', html: highlight(s.snippet, words) }),
      viewLink(s.doc, s.n));
  }));
}
