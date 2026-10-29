// Tiny DOM helpers and bilingual labels.
import { escapeHtml } from '../core/text.js';
import { prefs } from '../store.js';
import { waLink } from '../core/share.js';

/** h('div', {class: 'x', onclick}, child, 'text', [more]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Bilingual label: "हिंदी / English", or English only when the user chose so. */
export function hiOn() {
  return prefs.get().lang !== 'en';
}

export function L(hi, en) {
  return prefs.get().lang === 'en' ? en : `${hi} / ${en}`;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  toast(L('कॉपी हो गया', 'Copied'));
}

/** Render the small markdown used in answers: tables (| a | b |), bullets (- ), **bold**, paragraphs. */
export function md(text) {
  const lines = String(text ?? '').split('\n');
  let html = '';
  let i = 0;
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      html += '<div class="table-wrap"><table>';
      rows.forEach((r, ri) => {
        html += `<tr>${r.map((c) => (ri === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`;
      });
      html += '</table></div>';
      continue;
    }
    if (/^\s*[-•]\s+/.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*[-•]\s+/, ''))}</li>`;
      html += '</ul>';
      continue;
    }
    if (line.trim()) html += `<p>${inline(line)}</p>`;
    i++;
  }
  return html;
}

/** Highlight query words in a snippet (safe HTML). */
export function highlight(text, words) {
  let s = escapeHtml(text);
  const ws = [...new Set(words.filter((w) => w && w.length > 2))].sort((a, b) => b.length - a.length).slice(0, 8);
  for (const w of ws) {
    const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    s = s.replace(re, '<mark>$1</mark>');
  }
  return s;
}

/** WhatsApp share button: a real wa.me link (works in in-app browsers); text refreshed on tap. */
export function waButton(label, getText, cls = 'btn small primary') {
  const a = h('a', { class: cls, href: waLink(getText()), target: '_blank', rel: 'noopener', 'data-share': 'wa' }, label);
  a.addEventListener('click', () => { a.href = waLink(getText()); });
  return a;
}
