// "पूछें / Ask": chat with typed questions, topic → question dropdowns and popular chips.
import { h, L, clear, toast } from './dom.js';
import { state, allFaq, allCategories } from '../data.js';
import { answerCard, rulesCard, sourcesBlock, disclaimer } from './answer.js';
import { lsGet, lsSet } from '../store.js';

const chat = []; // kept for the session: [{type:'q'|'faq'|'search', ...}]
let root;

function remember(q) {
  const list = (lsGet('history', []) || []).filter((x) => x !== q);
  list.unshift(q);
  lsSet('history', list.slice(0, 30));
}

/** Bring the newest question bubble to the top, just below the sticky header (see .msg scroll-margin-top). */
function scrollToLatest() {
  requestAnimationFrame(() => {
    const qs = root?.querySelectorAll('.chat .msg.q');
    qs?.[qs.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function askFaq(id) {
  const item = state.engine.faq.get(id);
  if (!item) return false;
  chat.push({ type: 'q', text: item.q_en, hi: item.q_hi });
  chat.push({ type: 'faq', id });
  remember(item.q_en);
  renderChat();
  scrollToLatest();
  return true;
}

export function askText(q) {
  q = String(q || '').trim();
  if (!q) return;
  const t0 = performance.now();
  const r = state.engine.ask(q);
  const ms = Math.round(performance.now() - t0);
  chat.push({ type: 'q', text: q });
  chat.push({ type: 'search', q, r, ms });
  remember(q);
  renderChat();
  scrollToLatest();
}

function renderEntry(e) {
  if (e.type === 'q') return h('div', { class: 'msg q' }, e.text);
  if (e.type === 'faq') return answerCard(state.engine.faq.get(e.id), { onAsk: askFaq });
  const { r, q } = e;
  const out = [];
  if (r.rules) out.push(rulesCard({ ...r.rules, question: q }));
  if (r.best) out.push(answerCard(r.best, { kicker: L('सामग्री से सबसे उपयुक्त उत्तर', 'Best answer from the material'), onAsk: askFaq }));
  const box = h('article', { class: 'msg a' });
  if (!r.best && !r.rules) box.append(h('div', { class: 'kicker' }, L('तैयार उत्तर नहीं मिला — ये स्लाइड/पृष्ठ आपके प्रश्न से मेल खाते हैं', 'No ready answer; these slides/pages match your question')));
  if (r.related.length) {
    box.append(h('div', { class: 'small muted' }, L('संबंधित प्रश्न', 'Related questions')),
      h('div', { class: 'chips' }, r.related.map((f) => h('button', { class: 'chip', type: 'button', onclick: () => askFaq(f.id) }, f.q_en))));
  }
  if (r.sources.length) {
    box.append(h('div', { class: 'small muted' }, L('मेल खाते स्रोत', 'Matching sources')), sourcesBlock(r.sources, q));
  } else if (!r.best && !r.rules) {
    box.append(h('p', null, L('सामग्री में इसका उत्तर नहीं मिला। शब्द बदलकर पूछें या विषय सूची से प्रश्न चुनें।', 'The material does not seem to answer this. Try other words or pick a question from the topic list.')));
  }
  box.append(h('div', { class: 'small muted' }, `${e.ms} ms`), disclaimer());
  if (box.childNodes.length > 2 || !r.best) out.push(box);
  return out;
}

function renderChat() {
  const c = root?.querySelector('.chat');
  if (!c) return;
  clear(c);
  if (!chat.length) {
    c.append(h('div', { class: 'msg a' },
      h('div', { class: 'kicker' }, L('नमस्ते', 'Hello')),
      h('p', null, L('DRIP Phase II/III अधिप्राप्ति पर प्रश्न लिखें, या नीचे विषय और प्रश्न चुनें। हर उत्तर के साथ स्लाइड/पृष्ठ का आधार दिखेगा।', 'Type a question on DRIP Phase II/III procurement, or pick a topic and a question. Every answer shows the slide or page it comes from.')),
      h('p', { class: 'small muted' }, L('उदाहरण', 'Example') + ': “works 2.5 crore method”, “बयाना राशि कितनी”, “standstill kitne din”')));
    return;
  }
  for (const e of chat) c.append(...[renderEntry(e)].flat());
}

function topicSelects() {
  const cats = allCategories();
  const faqs = allFaq();
  const topic = h('select', { 'aria-label': L('विषय', 'Topic') },
    h('option', { value: '' }, `— ${L('विषय', 'Topic')} —`),
    cats.map((c) => h('option', { value: c.id }, L(c.hi, c.en))));
  const question = h('select', { 'aria-label': L('प्रश्न', 'Question'), disabled: true }, h('option', { value: '' }, `— ${L('प्रश्न', 'Question')} —`));
  topic.addEventListener('change', () => {
    clear(question).append(h('option', { value: '' }, `— ${L('प्रश्न', 'Question')} —`));
    const list = faqs.filter((f) => f.category === topic.value);
    for (const f of list) question.append(h('option', { value: f.id }, f.q_en));
    question.disabled = !list.length;
  });
  question.addEventListener('change', () => {
    if (question.value) askFaq(question.value);
    question.value = '';
  });
  return h('div', { class: 'selects' },
    h('label', null, h('span', { class: 'small muted' }, L('विषय', 'Topic')), topic),
    h('label', null, h('span', { class: 'small muted' }, L('प्रश्न', 'Question')), question));
}

function popular() {
  const items = allFaq().filter((f) => f.popular && f.bundle === 'general').slice(0, 6);
  if (!items.length) return null;
  return h('div', { class: 'chips' }, items.map((f) => h('button', { class: 'chip', type: 'button', onclick: () => askFaq(f.id) }, f.q_en)));
}

export function renderAsk(main, { prefill } = {}) {
  root = h('section', { class: 'view' },
    h('h1', null, L('प्रश्न पूछें', 'Ask')),
    topicSelects(),
    popular(),
    h('div', { class: 'chat', 'aria-live': 'polite' }));
  const input = h('input', { type: 'search', name: 'q', placeholder: L('अपना प्रश्न लिखें', 'Type your question'), 'aria-label': L('अपना प्रश्न लिखें', 'Type your question'), enterkeyhint: 'send', autocomplete: 'off', value: prefill || '' });
  const send = () => { askText(input.value); input.value = ''; };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  const recent = (lsGet('history', []) || []).slice(0, 5);
  root.append(
    recent.length ? h('details', { class: 'noprint' }, h('summary', { class: 'small muted' }, L('हाल के प्रश्न', 'Recent questions')),
      h('div', { class: 'chips' }, recent.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => askText(q) }, q)))) : null,
    h('div', { class: 'askbar noprint' }, input, h('button', { class: 'btn primary', type: 'button', onclick: send }, L('भेजें', 'Send'))));
  clear(main).append(root);
  renderChat();
  if (prefill) input.focus();
  return { input };
}

export function clearChat() {
  chat.length = 0;
}

export { toast };
