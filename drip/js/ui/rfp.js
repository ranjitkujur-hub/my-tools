// "RFP जाँच / RFP check" (office tier only): key facts, pending TBC items, reviewer comments
// and points to verify, with ticks saved on this device.
import { h, L, clear, copyText, waButton } from './dom.js';
import { state } from '../data.js';
import { citeLine, justification, disclaimer, viewLink, OFFICE_LABEL } from './answer.js';
import { lsGet, lsSet } from '../store.js';

function table(rows) {
  if (!rows?.length) return null;
  return h('div', { class: 'table-wrap' }, h('table', null, rows.map((r, i) => h('tr', null, r.map((c) => h(i === 0 ? 'th' : 'td', null, c))))));
}

export function renderRfp(main) {
  const off = state.office;
  if (!off) { location.hash = '#/ask'; return; }
  const o = off.office;
  const d = off.docs[0];
  const ticks = lsGet('rfpTicks', {}) || {};
  const pointsBox = h('div');
  const drawPoints = () => {
    clear(pointsBox);
    for (const p of o.points_to_check) {
      const cb = h('input', { type: 'checkbox', id: `pc-${p.id}`, checked: Boolean(ticks[p.id]) });
      cb.addEventListener('change', () => { ticks[p.id] = cb.checked; lsSet('rfpTicks', ticks); drawPoints(); });
      pointsBox.append(h('div', { class: 'card', style: ticks[p.id] ? 'opacity:.6' : '' },
        h('label', { class: 'check', for: `pc-${p.id}` }, cb, h('b', null, p.q_en)),
        h('div', { class: 'small', lang: 'hi' }, p.q_hi),
        p.detail_en ? h('p', { class: 'small' }, p.detail_en) : null,
        h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), p.citations.map(citeLine))));
    }
  };
  drawPoints();
  const openText = () => {
    const open = o.points_to_check.filter((p) => !ticks[p.id]);
    return `*${d.short} — ${L('जाँच के खुले बिंदु', 'open points to check')} (${open.length})*\n_${OFFICE_LABEL}_\n${open.map((p, i) => `${i + 1}. ${p.q_en}`).join('\n')}`;
  };
  clear(main).append(h('section', { class: 'view' },
    h('h1', null, L('RFP जाँच', 'RFP check'), ' — ', d.short),
    h('div', { class: 'office-label' }, OFFICE_LABEL),
    h('h2', null, L('मुख्य तथ्य', 'Key facts')),
    o.key_facts.map((k) => h('div', { class: 'card' },
      h('div', { class: 'small muted' }, L(k.label_hi, k.label_en)),
      h('div', null, k.value_en),
      table(k.table),
      justification(k.citations))),
    h('h2', null, L('लंबित “TBC” बिंदु', 'Pending “TBC” items'), ` (${off.tbc.length})`),
    h('div', { class: 'card' }, h('ol', null, off.tbc.map((t) => h('li', { style: 'margin:6px 0' },
      h('div', { class: 'small muted' }, `Page ${t.page} · ${t.label}`), h('div', null, t.text), viewLink(d.id, t.page))))),
    h('h2', null, L('समीक्षक की टिप्पणियाँ', 'Reviewer comments'), ` (${off.comments.length})`),
    off.comments.map((c) => h('div', { class: 'card' },
      h('div', { class: 'small muted' }, `Page ${c.page} · ${c.author}${c.date ? ` · ${c.date.slice(0, 10).split('-').reverse().join('/')}` : ''}`),
      h('div', { class: 'small' }, L('जिस पाठ पर', 'On the text'), ': ', h('q', null, c.anchor)),
      h('p', null, h('b', null, c.comment)),
      viewLink(d.id, c.page))),
    h('h2', null, L('जाँच के बिंदु', 'Points to check')),
    h('p', { class: 'small muted' }, L('ये निष्कर्ष नहीं, सत्यापन हेतु प्रश्न हैं। हो जाने पर टिक करें (इस डिवाइस पर सहेजा जाता है)।', 'These are questions to verify, not conclusions. Tick when done (saved on this device).')),
    pointsBox,
    h('div', { class: 'row noprint' },
      waButton(L('खुले बिंदु WhatsApp पर भेजें', 'Share open items on WhatsApp'), openText, 'btn primary'),
      h('button', { class: 'btn', type: 'button', onclick: () => copyText(openText()) }, L('कॉपी', 'Copy'))),
    disclaimer()));
}
