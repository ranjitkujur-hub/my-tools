// "योजना सहायक / Plan helper" for the DRIP-MIS "Create Procurement Plan" form.
import { h, L, hiOn, clear, toast, copyText, waButton } from './dom.js';
import { state } from '../data.js';
import { classify, recommendationLines } from '../core/rules.js';
import { checkEntry } from '../core/checker.js';
import { misAutoDates, formatDmy, parseDmy, toIso, addDays, addBusinessDays, addMonths } from '../core/dates.js';
import { formatInr, formatLakh, formatCrore, formatUsdMillion } from '../core/money.js';
import { citeLine, disclaimer, justification, OFFICE_LABEL } from './answer.js';
import { lsGet, lsSet } from '../store.js';

const MIS_CATEGORY = { works: 'Works', goods: 'Goods', ncs: 'NCS', 'cs-firm': 'Consultant Services', 'cs-ind': 'Consultant Services' };
let plan = null;
let parts = {};

function newPlan() {
  const rate = state.general.rules.currency.inr_per_usd;
  const p = { id: `d${Date.now().toString(36)}`, name: '', category: 'works', unit: 'lakh', amountInput: '', rate, mis: {}, fromExample: false };
  const def = state.office?.office?.defaults;
  if (def?.dam) { p.mis.dam_general = 'Dam'; p.mis.dam = def.dam; }
  return p;
}

const rupees = () => {
  const v = parseFloat(String(plan.amountInput).replace(/,/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * ({ rupee: 1, lakh: 1e5, crore: 1e7 }[plan.unit] || 1));
};

function syncAmount() {
  const r = rupees();
  if (r) {
    plan.mis.amount_inr = r;
    plan.mis.amount_usd = Math.round((r / plan.rate) * 100) / 100;
  } else {
    delete plan.mis.amount_inr;
    delete plan.mis.amount_usd;
  }
}

function fieldDef(key) {
  return state.general.form.fields.find((f) => f.key === key) || { key, label: key, hi: key };
}

function input(key, { type = 'text', list } = {}) {
  const f = fieldDef(key);
  const id = `pf-${key}`;
  const el = h('input', { id, type, value: plan.mis[key] ?? '', list: list ? `${id}-l` : null, autocomplete: 'off' });
  el.addEventListener('input', () => { plan.mis[key] = el.value; refresh(); });
  return h('label', { class: 'field', for: id },
    h('span', null, L(f.hi, f.label), f.required ? ' *' : ''),
    el,
    list ? h('datalist', { id: `${id}-l` }, list.map((v) => h('option', { value: v }))) : null);
}

function result() {
  const r = rupees();
  if (!r) return null;
  return classify(state.general.rules, { category: plan.category, value: r, currency: 'INR', rate: plan.rate });
}

// ---------- sections
function recSection(res) {
  if (!res) return h('p', { class: 'muted' }, L('श्रेणी और राशि भरें।', 'Enter the category and the amount.'));
  const lines = recommendationLines(state.general.rules, res);
  return h('div', null,
    h('p', null, h('b', null, res.amountText)),
    h('ul', { class: 'rec' }, lines.map((l) => h('li', null, l.en,
      l.note ? h('div', { class: 'note info small' }, l.note) : null,
      l.conflict ? h('div', { class: 'note warn small' }, h('b', null, L('स्लाइडों में अंतर', 'Slides disagree') + ': '), l.conflict) : null,
      h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), l.citations.map(citeLine))))));
}

function warnSection(res) {
  const rules = state.general.rules;
  const out = [];
  if (res) {
    for (const n of res.near) {
      out.push(h('div', { class: 'note warn' },
        `${L('सीमा के पास', 'Close to a threshold')}: ${n.label} — “${n.wording}” = ${n.text} (${n.diffPct > 0 ? '+' : ''}${n.diffPct}%). `,
        L('क्या अनुमान में GST शामिल है? पैकेज मूल्य से ही विधि और समीक्षा तय होती है।', 'Is GST included in the estimate? The package value decides the method and the review.'),
        h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), [...n.citations, ...rules.cautions.find((c) => c.id === 'package-value').citations].map(citeLine))));
    }
  }
  for (const c of rules.cautions) {
    out.push(h('div', { class: 'note info' }, L(c.hi, c.en),
      h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), c.citations.map(citeLine))));
  }
  return h('div', null, out);
}

function checkSection() {
  const box = h('div');
  const run = () => {
    const rep = checkEntry(state.general.rules, state.general.form, plan.mis, { category: plan.category, rate: plan.rate, rfp: state.office?.office });
    plan.lastCheck = rep;
    clear(box);
    if (!rep.findings.length) box.append(h('div', { class: 'note info' }, L('कोई त्रुटि नहीं मिली।', 'No mistakes found.')));
    for (const f of rep.findings) {
      box.append(h('div', { class: `finding ${f.level}` },
        h('b', null, { error: L('त्रुटि', 'Mistake'), warn: L('जाँचें', 'Check'), info: L('सूचना', 'Note') }[f.level], ': '),
        f.office ? h('span', { class: 'badge office' }, L('RFP से तुलना', 'Compared with the RFP')) : null, f.office ? ' ' : null, f.en,
        f.hi && hiOn() ? h('div', { class: 'small', lang: 'hi' }, f.hi) : null,
        f.citations.length ? h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), f.citations.map(citeLine)) : null));
    }
    if (rep.recommended.length) {
      box.append(h('h3', null, L('सुझाई गई प्रविष्टियाँ', 'Recommended entries')),
        h('div', { class: 'table-wrap' }, h('table', null,
          h('tr', null, h('th', null, L('फ़ील्ड', 'Field')), h('th', null, L('मान', 'Value')), h('th', null, L('कारण', 'Why'))),
          rep.recommended.map((r) => h('tr', null, h('td', null, L(fieldDef(r.field).hi, fieldDef(r.field).label)), h('td', null, h('b', null, r.value || '—')), h('td', null, r.en,
            h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), r.citations.map(citeLine))))))));
    }
    renderSheet();
  };
  return { box, run };
}

function dateInput(key, auto) {
  const f = fieldDef(key);
  const cur = plan.mis[key] ? parseDmy(plan.mis[key]) : null;
  const el = h('input', { type: 'date', value: cur ? toIso(cur) : '', id: `pd-${key}` });
  el.addEventListener('change', () => {
    const d = parseDmy(el.value);
    plan.mis[key] = d ? formatDmy(d) : '';
    if (key === 'd_draft_bid_docs') recalcDates();
    refresh();
  });
  return h('label', { class: 'field', for: `pd-${key}` },
    h('span', null, L(f.hi, f.label), auto ? h('span', { class: 'auto-tag' }, ` (${L('DRIP-MIS में देखे अनुसार स्वतः', 'automatic, as observed in DRIP-MIS')})`) : null),
    el, h('span', { class: 'small muted' }, plan.mis[key] || ''));
}

function recalcDates() {
  const auto = misAutoDates(state.general.form, plan.mis.d_draft_bid_docs, plan.mis.completion_months);
  if (!auto) return;
  for (const [k, d] of Object.entries(auto)) plan.mis[k] = formatDmy(d);
}

function roadmapTable() {
  const rules = state.general.rules;
  const res = result();
  if (!res || !res.roadmapColumn) return null;
  const ci = rules.roadmap.columns.findIndex((c) => c.id === res.roadmapColumn);
  const col = rules.roadmap.columns[ci];
  let lo = 0; let hi = 0;
  const start = parseDmy(plan.mis.d_draft_bid_docs);
  const rows = rules.roadmap.steps.map((s, i) => {
    const w = s.weeks[ci];
    const m = /^(\d+)(?:-(\d+))?$/.exec(w || '');
    const a = m ? +m[1] : 0; const b = m ? +(m[2] || m[1]) : 0;
    lo += a; hi += b;
    // dates counted from the Draft Bid Documents date at the end of step 2
    let when = '';
    if (start && i >= 2) {
      const pre = rules.roadmap.steps.slice(0, 2).reduce((acc, x) => acc + (parseInt(x.weeks[ci], 10) || 0), 0);
      when = lo - pre === hi - pre ? formatDmy(addDays(start, (lo - pre) * 7)) : `${formatDmy(addDays(start, (lo - pre) * 7))} – ${formatDmy(addDays(start, (hi - pre) * 7))}`;
    }
    return h('tr', null, h('td', null, `${i + 1}`), h('td', null, s.en), h('td', null, w || '—'), h('td', null, lo === hi ? `${lo}` : `${lo}–${hi}`), h('td', null, when));
  });
  return h('div', null,
    h('h3', null, L('रोडमैप (सप्ताह)', 'Roadmap in weeks'), ` — ${col.en}`),
    h('div', { class: 'table-wrap' }, h('table', null, h('tr', null, h('th', null, '#'), h('th', null, L('चरण', 'Step')), h('th', null, L('सप्ताह', 'Weeks')), h('th', null, L('कुल', 'Total')), h('th', null, L('लगभग तिथि', 'About'))), rows)),
    h('p', { class: 'small muted' }, L('तिथियाँ: “Draft Bid Documents” तिथि को चरण 2 का अंत मानकर', 'Dates assume the Draft Bid Documents date is the end of step 2')),
    justification(rules.roadmap.citations));
}

function consultantTable() {
  const rules = state.general.rules;
  if (!plan.category.startsWith('cs')) return null;
  const cs = rules.consultant_steps;
  const rows = cs.map.map((m) => h('tr', null, h('td', null, L(fieldDef(m.field).hi, fieldDef(m.field).label)), h('td', null, plan.mis[m.field] || '—'), h('td', null, m.steps)));
  const out = [h('h3', null, L('परामर्शी चयन के चरण → DRIP-MIS तिथि फ़ील्ड', 'Consultant-selection steps → DRIP-MIS date fields')),
    h('div', { class: 'table-wrap' }, h('table', null, h('tr', null, h('th', null, L('DRIP-MIS फ़ील्ड', 'DRIP-MIS field')), h('th', null, L('तिथि', 'Date')), h('th', null, L('चरण', 'Step'))), rows)),
    justification(cs.citations)];
  const timings = state.office?.office?.rfp_timings;
  if (timings?.length) {
    const base = { issue: parseDmy(plan.mis.d_spn), submission: parseDmy(plan.mis.d_bid_submission), tech_notice: parseDmy(plan.mis.d_ter), award_notice: parseDmy(plan.mis.d_loa), signing: parseDmy(plan.mis.d_contract) };
    const trs = timings.map((t) => {
      const b = base[t.from];
      let d = null;
      if (b && Number.isFinite(t.days)) d = t.business_days ? addBusinessDays(b, t.days) : addDays(b, t.days);
      let flag = null;
      if (t.from === 'issue' && t.business_days && d && base.submission && base.submission < d) flag = L('DRIP-MIS की जमा तिथि इससे पहले है', 'The DRIP-MIS submission date is earlier than this');
      if (t.from === 'submission' && t.days >= 100 && d && base.signing && base.signing > d) flag = L('अनुबंध तिथि वैधता के बाद है', 'Contract signing falls after the validity');
      return h('tr', null, h('td', null, L(t.hi || t.en, t.en)), h('td', null, d ? formatDmy(d) : '—', t.business_days ? h('div', { class: 'small muted' }, L('कार्य दिवस (शनि-रवि छोड़कर)', 'business days, Sat/Sun skipped')) : null, flag ? h('div', { class: 'note warn small' }, flag) : null),
        h('td', null, h('details', null, h('summary', { class: 'small' }, L('आधार', 'Justification')), t.citations.map(citeLine))));
    });
    out.push(h('h3', null, L('RFP Data Sheet के समय (कार्यालय)', 'RFP Data Sheet timings (office)')),
      h('div', { class: 'office-label' }, OFFICE_LABEL),
      h('div', { class: 'table-wrap' }, h('table', null, h('tr', null, h('th', null, L('नियम', 'Rule')), h('th', null, L('तिथि', 'Date')), h('th', null, L('आधार', 'Source'))), trs)));
  }
  return h('div', null, out);
}

function datesSection() {
  const fields = state.general.form.fields.filter((f) => f.planned_date);
  const months = h('input', { type: 'number', min: '1', max: '120', value: plan.mis.completion_months ?? '', id: 'pd-months' });
  months.addEventListener('input', () => {
    plan.mis.completion_months = months.value;
    const c = parseDmy(plan.mis.d_contract);
    if (c && +months.value > 0) plan.mis.completion_date = formatDmy(addMonths(c, +months.value));
    refreshDates();
  });
  const obs = state.general.form.observed_auto_dates;
  return h('div', null,
    h('p', { class: 'small muted' }, L('“Draft Bid Documents” तिथि डालें; बाकी तिथियाँ DRIP-MIS में देखे गए अंतराल से भरती हैं। कोई भी तिथि बदल सकते हैं।', 'Enter the Draft Bid Documents date; the other dates follow the offsets observed in DRIP-MIS. You can change any date.')),
    h('div', { class: 'grid2' }, fields.map((f) => dateInput(f.key, f.auto)),
      h('label', { class: 'field', for: 'pd-months' }, h('span', null, L(fieldDef('completion_months').hi, fieldDef('completion_months').label), ' *'), months),
      h('div', { class: 'field' }, h('span', { class: 'small muted' }, L(fieldDef('completion_date').hi, fieldDef('completion_date').label)), h('div', null, h('b', null, plan.mis.completion_date || '—')))),
    h('div', { class: 'row noprint' }, h('button', { class: 'btn small', type: 'button', onclick: () => { recalcDates(); refreshDates(); } }, L('फिर से गणना', 'Recalculate from Draft date'))),
    h('details', null, h('summary', { class: 'small' }, L('देखे गए अंतराल', 'Observed offsets')),
      h('p', { class: 'small' }, obs.note),
      h('ul', { class: 'small' }, obs.offsets_days.map((o) => h('li', null, `${fieldDef(o.field).label} = ${fieldDef(o.from).label} + ${o.days} ${L('दिन', 'days')}`)))),
    roadmapTable(),
    consultantTable());
}

function sheetRows() {
  const rep = plan.lastCheck || checkEntry(state.general.rules, state.general.form, plan.mis, { category: plan.category, rate: plan.rate, rfp: state.office?.office });
  const rec = Object.fromEntries((rep.recommended || []).map((r) => [r.field, r]));
  return state.general.form.fields.map((f) => {
    let v = plan.mis[f.key];
    let note = '';
    if (f.key === 'amount_inr' && v) { note = `${formatLakh(+v)}; ${formatCrore(+v)}`; v = formatInr(+v); }
    if (f.key === 'amount_usd' && v) note = `${formatUsdMillion(+v)} @ ₹${plan.rate}`;
    if (rec[f.key]) {
      const r = rec[f.key];
      if ((v ?? '') === '' && r.value) { v = r.value; note = `${L('सुझाव', 'suggested')}: ${r.en}`; } else if (r.value && String(v).toLowerCase() !== String(r.value).toLowerCase()) note = `${L('सुझाव', 'suggested')}: ${r.value} — ${r.en}`;
      else if (!r.value) note = r.en;
    }
    if (f.planned_date && f.auto) note = note || L('DRIP-MIS में स्वतः (जैसा देखा गया)', 'automatic in DRIP-MIS (as observed)');
    const finding = (rep.findings || []).find((x) => x.field === f.key && x.level !== 'info');
    if (finding) note = `⚠ ${finding.en}${note ? ` — ${note}` : ''}`;
    return { label: f.label, hi: f.hi, value: v ?? '', note };
  });
}

function sheetText() {
  const rows = sheetRows();
  const head = '*DRIP-MIS प्रविष्टि पत्रक / DRIP-MIS entry sheet*';
  const body = rows.map((r) => `• ${r.label}: ${r.value || '—'}${r.note ? ` (${r.note})` : ''}`).join('\n');
  return `${head}\n${body}`;
}

function renderSheet() {
  const box = parts.sheet;
  if (!box) return;
  clear(box).append(
    h('div', { class: 'table-wrap' }, h('table', { class: 'sheet' },
      h('tr', null, h('th', null, L('फ़ील्ड', 'Field')), h('th', null, L('भरें', 'Enter')), h('th', null, L('टिप्पणी', 'Notes'))),
      sheetRows().map((r) => h('tr', null, h('td', null, L(r.hi, r.label)), h('td', null, h('b', null, String(r.value || '—'))), h('td', { class: 'small' }, r.note))))),
    h('div', { class: 'row noprint' },
      h('button', { class: 'btn small', type: 'button', onclick: () => copyText(sheetText()) }, L('कॉपी', 'Copy')),
      waButton(L('WhatsApp पर भेजें', 'Share on WhatsApp'), () => { const t = sheetText(); return t.length > 3500 ? `${t.slice(0, 3500)}…` : t; }),
      h('button', { class: 'btn small', type: 'button', onclick: () => window.print() }, L('प्रिंट (A4)', 'Print (A4)')),
      h('button', { class: 'btn small', type: 'button', onclick: saveDraft }, L('ड्राफ़्ट सहेजें', 'Save draft'))),
    disclaimer());
}

// ---------- drafts (on this device)
const drafts = () => lsGet('drafts', []) || [];
function saveDraft() {
  const list = drafts().filter((d) => d.id !== plan.id);
  const copy = JSON.parse(JSON.stringify({ ...plan, lastCheck: undefined }));
  copy.saved = new Date().toISOString();
  copy.name = plan.mis.name_of_work || plan.name || `${MIS_CATEGORY[plan.category]} ${formatDmy(new Date())}`;
  list.unshift(copy);
  if (lsSet('drafts', list.slice(0, 50))) toast(L('ड्राफ़्ट सहेजा गया', 'Draft saved')); else toast(L('सहेज नहीं सका', 'Could not save'));
  renderDrafts();
}

function renderDrafts() {
  const box = parts.drafts;
  if (!box) return;
  const list = drafts();
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true });
  fileIn.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await fileIn.files[0].text());
      const arr = Array.isArray(data) ? data : [data];
      const ok = arr.filter((d) => d && d.mis && d.category);
      lsSet('drafts', [...ok, ...drafts()].slice(0, 50));
      toast(`${ok.length} ${L('ड्राफ़्ट आयात', 'drafts imported')}`);
      renderDrafts();
    } catch { toast(L('फ़ाइल नहीं पढ़ी जा सकी', 'Could not read the file')); }
  });
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(drafts(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `drip-plan-drafts-${toIso(new Date())}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  clear(box).append(
    list.length ? h('ul', { class: 'list' }, list.map((d) => h('li', null, h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
      h('span', { class: 'grow' }, h('b', null, d.name || '—'), h('div', { class: 'small muted' }, `${MIS_CATEGORY[d.category] || ''} · ${d.mis?.amount_inr ? formatInr(+d.mis.amount_inr) : ''} · ${d.saved ? d.saved.slice(0, 10).split('-').reverse().join('/') : ''}`)),
      h('button', { class: 'btn small', type: 'button', onclick: () => { plan = JSON.parse(JSON.stringify(d)); draw(); } }, L('खोलें', 'Open')),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const c = JSON.parse(JSON.stringify(d)); c.id = `d${Date.now().toString(36)}`; c.name = `${d.name} (2)`; lsSet('drafts', [c, ...drafts()]); renderDrafts(); } }, L('प्रति', 'Duplicate')),
      h('button', { class: 'btn small danger', type: 'button', onclick: () => { if (confirm(L('यह ड्राफ़्ट हटाएँ?', 'Delete this draft?'))) { lsSet('drafts', drafts().filter((x) => x.id !== d.id)); renderDrafts(); } } }, L('हटाएँ', 'Delete')))))) : h('p', { class: 'muted small' }, L('कोई ड्राफ़्ट नहीं', 'No drafts yet')),
    h('div', { class: 'row noprint' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { plan = newPlan(); draw(); } }, L('नई योजना', 'New plan')),
      h('button', { class: 'btn small', type: 'button', onclick: exportAll, disabled: !list.length }, L('JSON निर्यात', 'Export JSON')),
      h('button', { class: 'btn small', type: 'button', onclick: () => fileIn.click() }, L('JSON आयात', 'Import JSON')), fileIn));
}

// ---------- main render
let mainEl;

function refresh() {
  const res = result();
  if (parts.amount) {
    const r = rupees();
    parts.amount.textContent = r ? `${formatInr(r)} = ${formatLakh(r)} = ${formatCrore(r)} = ${formatUsdMillion(r / plan.rate)}` : '';
  }
  if (parts.rec) clear(parts.rec).append(recSection(res));
  if (parts.warn) clear(parts.warn).append(warnSection(res));
  plan.lastCheck = null;
  renderSheet();
}

function refreshDates() {
  if (parts.dates) clear(parts.dates).append(datesSection());
  renderSheet();
}

function fillRecommended() {
  const r = rupees();
  if (!r) return toast(L('पहले राशि डालें', 'Enter the amount first'));
  const rep = checkEntry(state.general.rules, state.general.form, { ...plan.mis, category: MIS_CATEGORY[plan.category] }, { category: plan.category, rate: plan.rate });
  plan.mis.category = MIS_CATEGORY[plan.category];
  for (const x of rep.recommended) plan.mis[x.field] = x.value;
  draw();
}

function loadExample() {
  const ex = state.office?.example;
  if (!ex) return;
  plan = newPlan();
  plan.fromExample = true;
  plan.category = 'cs-firm';
  plan.unit = 'rupee';
  plan.amountInput = String(ex.amount_inr);
  for (const [k, v] of Object.entries(ex)) if (k !== 'note' && v !== undefined) plan.mis[k] = v;
  draw();
  setTimeout(() => {
    parts.runCheck?.();
    parts.checkCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

function draw() {
  parts = {};
  const rules = state.general.rules;
  syncAmount();
  const cat = h('select', { id: 'p-cat' }, rules.categories.map((c) => h('option', { value: c.id, selected: c.id === plan.category }, L(c.hi, c.en))));
  cat.addEventListener('change', () => { plan.category = cat.value; refresh(); refreshDates(); });
  const amt = h('input', { id: 'p-amt', type: 'text', inputmode: 'decimal', value: plan.amountInput, placeholder: '0', autocomplete: 'off' });
  const unitSel = h('select', { 'aria-label': L('इकाई', 'Unit') }, [['rupee', '₹'], ['lakh', L('लाख', 'lakh')], ['crore', L('करोड़', 'crore')]].map(([v, t]) => h('option', { value: v, selected: v === plan.unit }, t)));
  const rate = h('input', { id: 'p-rate', type: 'number', min: '1', step: '0.01', value: plan.rate });
  const onAmt = () => { plan.amountInput = amt.value; plan.unit = unitSel.value; plan.rate = +rate.value || rules.currency.inr_per_usd; syncAmount(); refresh(); };
  amt.addEventListener('input', onAmt);
  unitSel.addEventListener('change', onAmt);
  rate.addEventListener('input', onAmt);
  parts.amount = h('div', { class: 'small', 'aria-live': 'polite' });
  parts.rec = h('div');
  parts.warn = h('div');
  parts.sheet = h('div');
  parts.drafts = h('div');
  parts.dates = h('div');
  const check = checkSection();
  parts.runCheck = check.run;

  const form = state.general.form.fields.filter((f) => !f.planned_date && !['amount_inr', 'amount_usd', 'completion_months', 'completion_date'].includes(f.key));
  const office = Boolean(state.office);
  clear(mainEl).append(h('section', { class: 'view' },
    h('h1', null, L('योजना सहायक (DRIP-MIS / STEP)', 'Plan helper (DRIP-MIS / STEP)')),
    disclaimer(),
    plan.fromExample ? h('div', { class: 'office-label' }, OFFICE_LABEL) : null,
    h('div', { class: 'card' },
      h('h2', null, L('श्रेणी और राशि', 'Category and amount')),
      h('label', { class: 'field', for: 'p-cat' }, h('span', null, L('श्रेणी', 'Category')), cat),
      h('div', { class: 'row' },
        h('label', { class: 'field grow', for: 'p-amt' }, h('span', null, L('अनुमानित राशि', 'Estimated amount')), amt),
        h('label', { class: 'field' }, h('span', null, L('इकाई', 'Unit')), unitSel),
        h('label', { class: 'field', for: 'p-rate', style: 'max-width:110px' }, h('span', null, '₹ / US$'), rate)),
      parts.amount),
    h('div', { class: 'card' }, h('h2', null, L('सुझाव', 'Recommendations')), parts.rec),
    h('div', { class: 'card' }, h('h2', null, L('चेतावनियाँ', 'Warnings')), parts.warn),
    h('div', { class: 'card' },
      h('h2', null, L('DRIP-MIS फ़ॉर्म', 'DRIP-MIS form')),
      h('div', { class: 'row noprint' },
        h('button', { class: 'btn small', type: 'button', onclick: fillRecommended }, L('सुझाए मान भरें', 'Fill recommended values')),
        office ? h('button', { class: 'btn small', type: 'button', onclick: loadExample }, L('स्क्रीनशॉट वाला उदाहरण', 'Load the screenshot example')) : null),
      h('div', { class: 'grid2' }, form.map((f) => input(f.key, { list: f.options || f.seen_values })))),
    parts.checkCard = h('div', { class: 'card', id: 'plan-check' },
      h('h2', null, L('मेरी DRIP-MIS प्रविष्टि जाँचें', 'Check my DRIP-MIS entry')),
      h('p', { class: 'small muted' }, L('जो DRIP-MIS में चुना है वही ऊपर भरें, फिर जाँचें।', 'Fill in what you selected in DRIP-MIS above, then check.')),
      h('button', { class: 'btn primary noprint', type: 'button', onclick: check.run }, L('प्रविष्टि जाँचें', 'Check entry')),
      check.box),
    h('div', { class: 'card' }, h('h2', null, L('नियोजित तिथियाँ', 'Planned dates')), parts.dates),
    h('div', { class: 'card' }, h('h2', null, L('DRIP-MIS प्रविष्टि पत्रक', 'DRIP-MIS entry sheet')), parts.sheet),
    h('div', { class: 'card noprint' }, h('h2', null, L('इस डिवाइस पर ड्राफ़्ट', 'Drafts on this device')), parts.drafts)));
  refresh();
  refreshDates();
  renderDrafts();
}

export function renderPlan(main, { example = false } = {}) {
  mainEl = main;
  if (!plan) plan = newPlan();
  if (example) return loadExample();
  draw();
}

export function resetPlan() {
  plan = null;
}
