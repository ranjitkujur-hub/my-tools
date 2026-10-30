// Boot, unlock screen, navigation and hash routes:
// #/ask, #/ask/<text>, #/q/<id>, #/sources, #/doc/<DOC>[/<n>], #/mydoc/<id>[/<i>], #/plan, #/plan/example,
// #/plan/amount/<rupees>, #/plan/check (an entry read from a DRIP-MIS photo), #/rfp, #/settings
import { h, L, clear, toast } from './ui/dom.js';
import { state, unlock, restore, lock, lockoutRemaining } from './data.js';
import { renderAsk, askFaq, askText, clearChat } from './ui/ask.js';
import { renderDocList, renderDoc, renderViewer } from './ui/sources.js';
import { renderPlan, resetPlan } from './ui/plan.js';
import { renderRfp } from './ui/rfp.js';
import { renderSettings, applyPrefs } from './ui/settings.js';
import { forgetKeys } from './store.js';
import { renderMyDoc, releaseUrls } from './ui/mydocs.js';
import { loadMyDocs, deleteAll } from './mydocs.js';
import { terminateOcr } from './ocr.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let pendingRoute = null;

const NAV = [
  ['ask', '💬', 'पूछें', 'Ask'],
  ['sources', '📚', 'स्रोत', 'Sources'],
  ['plan', '🗂️', 'योजना सहायक', 'Plan helper'],
  ['rfp', '📝', 'RFP जाँच', 'RFP check', 'office'],
  ['settings', '⚙️', 'सेटिंग', 'Settings'],
];

function drawNav(active) {
  clear(nav);
  for (const [id, ico, hi, en, tier] of NAV) {
    if (tier === 'office' && state.tier !== 'office') continue;
    nav.append(h('a', { href: `#/${id}`, 'aria-current': active === id ? 'page' : null }, h('span', { class: 'ico', 'aria-hidden': 'true' }, ico), h('span', null, L(hi, en))));
  }
  nav.hidden = false;
}

function drawHeader() {
  const t = document.getElementById('tier');
  const lb = document.getElementById('lockBtn');
  if (state.tier) {
    t.hidden = false;
    t.textContent = state.tier === 'office' ? L('कार्यालय', 'Office') : L('अतिथि', 'Guest');
    lb.hidden = false;
  } else {
    t.hidden = true;
    lb.hidden = true;
  }
}

async function doLock() {
  await terminateOcr();
  releaseUrls();
  await lock(true);
  clearChat();
  resetPlan();
  drawHeader();
  nav.hidden = true;
  showUnlock();
  toast(L('लॉक हो गया', 'Locked'));
}

function showUnlock(message) {
  nav.hidden = true;
  const pass = h('input', { type: 'password', id: 'passcode', autocomplete: 'current-password', 'aria-label': L('पासकोड', 'Passcode'), placeholder: L('पासकोड', 'Passcode') });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
  const msg = h('div', { role: 'alert', 'aria-live': 'assertive' }, message ? h('div', { class: 'note info' }, message) : null);
  const btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, L('खोलें', 'Unlock'));
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (!pass.value) return;
    btn.disabled = true;
    clear(msg).append(h('div', { class: 'note info' }, L('खोल रहे हैं…', 'Unlocking…')));
    const r = await unlock(pass.value, remember.checked);
    btn.disabled = false;
    if (r.ok) {
      pass.value = '';
      afterUnlock();
      return;
    }
    clear(msg);
    if (r.reason === 'wait') msg.append(h('div', { class: 'note err' }, L(`कई गलत प्रयास। ${Math.ceil(r.wait / 1000)} सेकंड बाद फिर कोशिश करें।`, `Too many wrong tries. Try again in ${Math.ceil(r.wait / 1000)} seconds.`)));
    else if (r.reason === 'network') msg.append(h('div', { class: 'note err' }, L('डेटा लोड नहीं हुआ। इंटरनेट जाँचें।', 'Could not load the data. Check the connection.')));
    else {
      msg.append(h('div', { class: 'note err' }, L('पासकोड सही नहीं है। फिर से कोशिश करें।', 'That passcode is not right. Please try again.')));
      if (r.wait > 0) msg.append(h('div', { class: 'note warn small' }, L(`अगला प्रयास ${Math.ceil(r.wait / 1000)} सेकंड बाद।`, `Next try in ${Math.ceil(r.wait / 1000)} seconds.`)));
    }
    pass.select();
  } },
  h('label', { class: 'field', for: 'passcode' }, h('span', null, L('पासकोड', 'Passcode')), pass),
  h('label', { class: 'check', for: 'remember' }, remember, L('इस डिवाइस पर याद रखें', 'Remember on this device')),
  btn, msg);
  clear(main).append(h('section', { class: 'unlock' }, h('div', { class: 'card' },
    h('h1', null, L('सहायक खोलें', 'Open the assistant')),
    h('p', { class: 'small muted' }, L('कार्यालय पासकोड = सारी सामग्री; अतिथि पासकोड = केवल प्रशिक्षण स्लाइड।', 'Office passcode = everything; guest passcode = training slides only.')),
    form)));
  const wait = lockoutRemaining();
  if (wait > 0) msg.append(h('div', { class: 'note warn small' }, L(`अगला प्रयास ${Math.ceil(wait / 1000)} सेकंड बाद।`, `Next try in ${Math.ceil(wait / 1000)} seconds.`)));
  setTimeout(() => pass.focus(), 50);
}

async function afterUnlock() {
  drawHeader();
  await loadMyDocs();
  const r = pendingRoute;
  pendingRoute = null;
  if (r && r !== location.hash) location.hash = r;
  else route();
}

function route() {
  if (!state.tier) {
    pendingRoute = location.hash || pendingRoute;
    showUnlock();
    return;
  }
  const hash = location.hash || '#/ask';
  const [, name = 'ask', a, b] = hash.split('/');
  const dec = (s) => { try { return decodeURIComponent(s || ''); } catch { return s || ''; } };
  let active = name;
  switch (name) {
    case 'q':
      active = 'ask';
      renderAsk(main);
      if (!askFaq(dec(a))) toast(L('यह प्रश्न इस स्तर में उपलब्ध नहीं', 'This question is not available here'));
      break;
    case 'ask':
      renderAsk(main);
      if (a) askText(dec(hash.slice('#/ask/'.length)));
      break;
    case 'sources':
      renderDocList(main);
      break;
    case 'doc':
      active = 'sources';
      if (b) renderViewer(main, dec(a), +b);
      else renderDoc(main, dec(a));
      break;
    case 'mydoc':
      active = 'sources';
      renderMyDoc(main, dec(a), b !== undefined && b !== '' ? +b : null);
      break;
    case 'plan':
      renderPlan(main, { example: a === 'example' && state.tier === 'office', amount: a === 'amount' ? +b : null, fromEntry: a === 'check' });
      break;
    case 'rfp':
      if (state.tier !== 'office') { location.hash = '#/ask'; return; }
      renderRfp(main);
      break;
    case 'settings':
      renderSettings(main, { onLock: doLock, onForget: async () => { await deleteAll(); await forgetKeys(); await doLock(); }, onLang: () => { drawNav('settings'); drawHeader(); route(); } });
      break;
    default:
      location.hash = '#/ask';
      return;
  }
  drawNav(active);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const banner = document.getElementById('update');
  const reloadBtn = document.getElementById('reloadBtn');
  let waiting = null;
  const offer = (w) => {
    waiting = w;
    banner.hidden = false;
  };
  let wantReload = false;
  reloadBtn.addEventListener('click', () => {
    wantReload = true;
    if (waiting) waiting.postMessage({ type: 'skipWaiting' });
    else location.reload();
  });
  // reload only when the user accepted a new version (not when the first worker takes control)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wantReload) return;
    wantReload = false;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => { /* offline support unavailable */ });
}

async function boot() {
  applyPrefs();
  document.getElementById('lockBtn').addEventListener('click', doLock);
  window.addEventListener('hashchange', route);
  setupServiceWorker();
  pendingRoute = location.hash || null;
  let ok = false;
  try { ok = await restore(); } catch { ok = false; }
  if (ok) afterUnlock();
  else showUnlock();
}

boot();
