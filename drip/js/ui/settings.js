// "सेटिंग / Settings": language, text size, lock, forget device, home-screen help, about.
import { h, L, clear, toast } from './dom.js';
import { state, allDocs } from '../data.js';
import { prefs, lsClearAll } from '../store.js';
import { DISCLAIMER } from './answer.js';

export function applyPrefs() {
  document.documentElement.style.setProperty('--fs', `${prefs.get().size}px`);
}

export function renderSettings(main, { onLock, onForget, onLang }) {
  const p = prefs.get();
  const lang = h('select', { id: 's-lang' },
    h('option', { value: 'hi-en', selected: p.lang !== 'en' }, 'हिंदी + English'),
    h('option', { value: 'en', selected: p.lang === 'en' }, 'English only'));
  lang.addEventListener('change', () => { prefs.set({ lang: lang.value }); onLang(); });
  const size = h('input', { id: 's-size', type: 'range', min: '14', max: '22', step: '1', value: p.size });
  size.addEventListener('input', () => { prefs.set({ size: +size.value }); applyPrefs(); });
  const docs = allDocs();
  const b = state.general;
  clear(main).append(h('section', { class: 'view' },
    h('h1', null, L('सेटिंग', 'Settings')),
    h('div', { class: 'card' },
      h('label', { class: 'field', for: 's-lang' }, h('span', null, L('भाषा', 'Language')), lang),
      h('label', { class: 'field', for: 's-size' }, h('span', null, L('अक्षर का आकार', 'Text size')), size)),
    h('div', { class: 'card' },
      h('h2', null, L('सुरक्षा', 'Security')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: onLock }, L('अभी लॉक करें', 'Lock now')),
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          if (!confirm(L('इस डिवाइस से कुंजियाँ, इतिहास, ड्राफ़्ट और टिक हटाएँ?', 'Remove keys, history, drafts and ticks from this device?'))) return;
          lsClearAll();
          onForget();
          toast(L('डिवाइस भुला दिया गया', 'This device was forgotten'));
        } }, L('यह डिवाइस भूल जाएँ', 'Forget this device'))),
      h('p', { class: 'small muted' }, L('पासकोड कभी सहेजा नहीं जाता। “याद रखें” चुनने पर केवल न खुलने वाली (non-extractable) कुंजियाँ इसी ब्राउज़र में रहती हैं।', 'The passcode is never stored. With “Remember” on, only non-extractable keys stay in this browser.'))),
    h('div', { class: 'card' },
      h('h2', null, L('होम स्क्रीन पर जोड़ें', 'Add to Home screen')),
      h('ul', null,
        h('li', null, L('WhatsApp में लिंक खोलें → ऊपर ⋮ → “Chrome में खोलें”।', 'In WhatsApp, open the link → ⋮ at the top → “Open in Chrome”.')),
        h('li', null, L('Chrome (Android): ⋮ → “होम स्क्रीन पर जोड़ें / Add to Home screen”।', 'Chrome (Android): ⋮ → “Add to Home screen”.')),
        h('li', null, L('Safari (iPhone): शेयर बटन → “Add to Home Screen”।', 'Safari (iPhone): Share button → “Add to Home Screen”.')),
        h('li', null, L('PC (Chrome/Edge): पता-पट्टी में install आइकन।', 'PC (Chrome/Edge): the install icon in the address bar.'))),
      h('p', { class: 'small muted' }, L('एक बार खोलने के बाद ऐप ऑफ़लाइन भी चलता है।', 'After the first unlock the app also works offline.'))),
    h('div', { class: 'card' },
      h('h2', null, L('परिचय', 'About')),
      h('p', null, L('खुला स्तर', 'Unlocked tier'), ': ', h('b', null, state.tier === 'office' ? L('कार्यालय (सभी सामग्री)', 'Office (everything)') : L('अतिथि (प्रशिक्षण स्लाइड)', 'Guest (training slides)'))),
      h('p', { class: 'small' }, L('संस्करण', 'Version'), `: ${b?.version || ''} · ${L('बिल्ड तिथि', 'Built')}: ${b?.built ? b.built.slice(0, 10).split('-').reverse().join('/') : ''}`),
      h('h3', null, L('स्रोत', 'Sources')),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('tr', null, h('th', null, L('दस्तावेज़', 'Document')), h('th', null, L('संख्या', 'Count'))),
        docs.map((d) => h('tr', null, h('td', null, h('b', null, d.short), h('div', { class: 'small' }, d.title)), h('td', null, `${d.count} ${d.unit === 'page' ? 'pages' : 'slides'}`))))),
      h('p', { class: 'small' }, `${state.engine?.faq.size || 0} ${L('तैयार प्रश्न-उत्तर', 'ready answers')}`),
      h('p', { class: 'small' }, DISCLAIMER))));
}
