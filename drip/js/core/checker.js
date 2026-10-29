// Checks a DRIP-MIS "Create Procurement Plan" entry against kb/rules.json.
import { classify, recommendationLines } from './rules.js';
import { formatInr, formatCrore, formatUsdMillion, describeThreshold } from './money.js';
import { misAutoDates, formatDmy, parseDmy, addMonths } from './dates.js';

const lc = (s) => String(s ?? '').toLowerCase();
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

function detect(list, text) {
  const t = lc(text);
  if (!t.trim()) return null;
  for (const [key, terms] of list) if (terms.some((w) => t.includes(w))) return key;
  return null;
}

/** 'works' | 'goods' | 'ncs' | 'cs' from a DRIP-MIS category text. */
export function misCategory(rules, text) {
  return detect(rules.mis.category_terms, text);
}

function shownWhenOk(field, entry) {
  if (!field.shown_when) return true;
  const m = /^(\w+)\s*=\s*(.+)$/.exec(field.shown_when);
  return !m || lc(entry[m[1]]) === lc(m[2].trim());
}

const GROUP_LABEL = { works: 'works', goods: 'goods', ncs: 'non-consulting services', cs: 'consulting services', rfq: 'quotation' };

function catThr(rules, res, who) {
  const r = res[who];
  if (!r || !r.part) return '';
  const p = r.part;
  const main = p.unit === 'usd' ? describeThreshold(p.value, 'usd') : describeThreshold(p.value, 'inr');
  const other = p.unit === 'usd' ? formatCrore(p.value * 1e6 * res.amt.rate) : formatUsdMillion((p.value * 1e7) / res.amt.rate);
  return `"${p.wording}" = ${main} / ${other}`;
}

/**
 * entry: DRIP-MIS field values (keys as in corpus/drip_mis_form.json)
 * opts: {category: 'works'|'goods'|'ncs'|'cs-firm'|'cs-ind' (plan helper choice), rate}
 */
export function checkEntry(rules, form, entry, opts = {}) {
  const findings = [];
  const add = (level, code, en, hi, citations = [], extra = {}) => findings.push({ level, code, en, hi, citations, ...extra });
  const rate = +opts.rate || rules.currency.inr_per_usd;
  const C = rules.checker_citations;

  // 1. empty required fields
  for (const f of form.fields) {
    if (!f.required || f.auto || !shownWhenOk(f, entry)) continue;
    if (isEmpty(entry[f.key])) add('error', 'empty', `"${f.label}" is empty.`, `"${f.hi}" खाली है।`, C.plan_fields, { field: f.key });
  }

  // 2. category
  const group = misCategory(rules, entry.category) || (opts.category ? (opts.category.startsWith('cs') ? 'cs' : opts.category) : null);
  let category = opts.category;
  if (!category && group) category = group === 'cs' ? 'cs-firm' : group;
  const methodText = String(entry.method ?? '');
  const methodGroup = detect(rules.mis.category_terms, methodText);
  const methodType = detect(rules.mis.method_terms, methodText);
  if (!opts.category && group === 'cs' && methodType === 'IC') category = 'cs-ind';
  const isCs = group === 'cs';

  // 3. method vs category
  if (!isEmpty(entry.method) && group) {
    const wrongGroup = methodGroup && methodGroup !== group;
    const wrongType = methodType && (isCs ? !rules.mis.consulting_methods.includes(methodType) : !rules.mis.gwncs_methods.includes(methodType));
    if (wrongGroup || wrongType) {
      const why = isCs
        ? 'consultants are selected with QCBS, QBS, FBS, LCS, CQS, direct selection or individual-consultant selection, not with a works/goods method'
        : `${GROUP_LABEL[group]} are procured with RFB, RFQ or direct selection`;
      add('error', 'method-category', `Method ${methodText} does not match category ${entry.category}: ${why}.`,
        `अधिप्राप्ति विधि ${methodText} श्रेणी ${entry.category} से मेल नहीं खाती।`, C.consulting_methods, { field: 'method' });
    }
  }

  // 4. document type vs category
  if (!isEmpty(entry.doc_type) && group) {
    const docGroup = detect(rules.mis.doc_terms, entry.doc_type);
    if (isCs && docGroup && docGroup !== 'cs') {
      add('error', 'doc-category', `"${entry.doc_type}" is a ${GROUP_LABEL[docGroup]} document; consultants are selected with a Request for Proposals (RFP).`,
        `"${entry.doc_type}" ${GROUP_LABEL[docGroup]} का दस्तावेज़ है; परामर्शी का चयन Request for Proposals (RFP) से होता है।`, C.consulting_document, { field: 'doc_type' });
    } else if (!isCs && docGroup && docGroup !== 'rfq' && docGroup !== group) {
      add('error', 'doc-category', `"${entry.doc_type}" is a ${GROUP_LABEL[docGroup]} document but the category is ${entry.category}.`,
        `"${entry.doc_type}" ${GROUP_LABEL[docGroup]} का दस्तावेज़ है, जबकि श्रेणी ${entry.category} है।`, C.category_definitions, { field: 'doc_type' });
    }
  }

  // 5. type of works only for works
  if (!isEmpty(entry.type_of_works) && group && group !== 'works') {
    add('error', 'type-of-works', `"Type of Works" (${entry.type_of_works}) is filled, but it applies only to works; this entry is ${entry.category}.`,
      `"Type of Works" केवल कार्य (works) के लिए है; यह प्रविष्टि ${entry.category} की है।`, C.category_definitions, { field: 'type_of_works' });
  }

  // 6. amounts, reviews and recommendations
  const amountInr = Number(entry.amount_inr);
  let res = null;
  if (category && Number.isFinite(amountInr) && amountInr > 0) {
    res = classify(rules, { category, value: amountInr, currency: 'INR', rate, method: methodType === 'DS' ? 'DS' : undefined });
    const amtText = `${formatInr(amountInr)} (${formatCrore(amountInr)}; ${formatUsdMillion(amountInr / rate)})`;
    if (Number.isFinite(Number(entry.amount_usd)) && entry.amount_usd !== '' && Math.abs(Number(entry.amount_usd) - amountInr / rate) > 1) {
      add('info', 'usd', `Estimated amount in US$ (${entry.amount_usd}) is not ₹ amount ÷ ${rate} (${(amountInr / rate).toFixed(2)}).`, `US$ राशि ₹ राशि ÷ ${rate} के बराबर नहीं है।`, rules.currency.citations, { field: 'amount_usd' });
    }
    const rt = lc(entry.review_type);
    const wb = res.wb;
    const cpmuNear = res.near.find((n) => /CPMU/.test(n.label));
    const reviewCites = [...(wb?.citations || []), ...(res.cpmu?.citations || []), ...rules.review_general.citations, ...rules.cautions.find((c) => c.id === 'package-value').citations];
    if (wb && rt === 'prior' && !wb.prior) {
      const cpmuPart = res.cpmu
        ? (res.cpmu.prior ? `; it is above the CPMU threshold (${catThr(rules, res, 'cpmu')}), so CPMU review applies`
          : cpmuNear ? ` and just under the CPMU threshold (${catThr(rules, res, 'cpmu')})` : ` and below the CPMU threshold (${catThr(rules, res, 'cpmu')})`)
        : '';
      add('warn', 'review', `Review type "Prior" while ${amtText} is below the World Bank prior-review threshold for ${rules.categories.find((c) => c.id === category).en.toLowerCase()} (${catThr(rules, res, 'wb')})${cpmuPart}. Confirm the review type against the approved Procurement Plan, and check whether GST is included in the estimate (the package value decides).`,
        `Review type "Prior" चुना है, जबकि राशि World Bank की prior-review सीमा से कम है${cpmuNear ? ' और CPMU सीमा के ठीक नीचे है' : ''}। स्वीकृत Procurement Plan से पुष्टि करें और देखें कि अनुमान में GST शामिल है या नहीं।`,
        reviewCites, { field: 'review_type' });
    } else if (wb && rt === 'post' && wb.prior) {
      add('error', 'review', `Review type "Post" while ${amtText} is above the World Bank prior-review threshold (${catThr(rules, res, 'wb')}); it should be "Prior" unless the approved Procurement Plan says otherwise.`,
        `राशि World Bank की prior-review सीमा से अधिक है; Review type "Prior" होना चाहिए।`, reviewCites, { field: 'review_type' });
    } else if (wb && rt && !['prior', 'post'].includes(rt)) {
      add('error', 'review', `Review type "${entry.review_type}" is not Prior or Post.`, 'Review type Prior या Post होना चाहिए।', C.plan_fields, { field: 'review_type' });
    }

    // method vs amount
    if (category === 'cs-firm' && methodType === 'CQS' && res.options && !res.options[0].allowed) {
      add('error', 'cqs', `CQS is not allowed at ${amtText} ("${res.options[0].wording}" US$ million).`, 'इस राशि पर CQS की अनुमति नहीं है।', res.options[0].citations, { field: 'method' });
    }
    if (!isCs && methodType === 'RFQ' && res.method.method !== 'RFQ') {
      const rfq = rules.method_rules.find((r) => r.category === category && r.method === 'RFQ');
      const lim = rfq ? `"${rfq.bounds.usd[0].wording}"` : '';
      add('error', 'rfq', `RFQ is only for small packages (${lim}); ${amtText} needs ${res.method.en}.`, `RFQ केवल छोटे पैकेज के लिए है (${lim})।`, [...(rfq?.citations || []), ...res.method.citations], { field: 'method' });
    }

    // market approach
    const mkt = detect(rules.mis.market_terms, entry.market_approach);
    const wantIntl = /International/.test(res.market?.value || '');
    if (mkt && res.market && ((mkt === 'international') !== wantIntl)) {
      add('warn', 'market', `Market approach "${entry.market_approach}" — for this value the material indicates ${res.market.en}.`, `इस राशि के लिए बाज़ार दृष्टिकोण: ${res.market.value}`, res.market.citations, { field: 'market_approach' });
    }

    // process
    const proc = detect(rules.mis.process_terms, entry.process);
    const expectTwo = (category === 'cs-firm' && res.method.method !== 'CQS') || (!isCs && res.method.method === 'RFB');
    if (proc === 'one' && expectTwo) {
      add('warn', 'process', `Procurement process "${entry.process}": the material describes separate technical and financial envelopes for this method.`, 'इस विधि में तकनीकी और वित्तीय प्रस्ताव अलग लिफ़ाफ़ों में होते हैं।', res.process[0]?.citations || [], { field: 'process' });
    }

    for (const n of res.near) {
      if (/CPMU|World Bank/.test(n.label) && findings.some((f) => f.code === 'review')) continue;
      add('warn', 'near', `${formatInr(amountInr)} is within ${rules.near_threshold_pct}% of a threshold (${n.label}: "${n.wording}" = ${n.text}). Check whether GST is included — the package value decides the method and review.`,
        `राशि एक सीमा के ${rules.near_threshold_pct}% के भीतर है (${n.label})। देखें कि GST शामिल है या नहीं।`, [...n.citations, ...rules.cautions.find((c) => c.id === 'package-value').citations]);
    }
  }

  // 7. planned dates vs the DRIP-MIS automatic dates
  if (!isEmpty(entry.d_draft_bid_docs) && parseDmy(entry.d_draft_bid_docs)) {
    const auto = misAutoDates(form, entry.d_draft_bid_docs, entry.completion_months);
    for (const [k, d] of Object.entries(auto || {})) {
      if (k === 'd_draft_bid_docs' || isEmpty(entry[k])) continue;
      if (formatDmy(d) !== String(entry[k]).trim()) {
        const f = form.fields.find((x) => x.key === k) || { label: k };
        add('info', 'date', `"${f.label}" is ${entry[k]}; the DRIP-MIS automatic date (as observed in DRIP-MIS) would be ${formatDmy(d)}.`, `"${f.hi || f.label}" की DRIP-MIS स्वचालित तिथि ${formatDmy(d)} होगी।`, [], { field: k });
      }
    }
  }

  // 8. office tier: compare the entry with the office's RFP (only for the RFP's own consultancy)
  if (opts.rfp) findings.push(...compareWithRfp(entry, opts.rfp, group));

  return { category, group, res, findings, recommended: res ? recommendedEntries(rules, res) : [], lines: res ? recommendationLines(rules, res) : [] };
}

/**
 * Office data `entry_checks` holds the RFP's own values (completion period, estimate) with citations.
 * Applies when the entry is for the same dam and is a consulting entry.
 */
export function compareWithRfp(entry, office, group) {
  const ec = office?.entry_checks;
  if (!ec) return [];
  const w = ec.applies_when || {};
  if (w.dam && lc(entry.dam) !== lc(w.dam)) return [];
  if (w.category && group && group !== w.category) return [];
  const out = [];
  for (const c of ec.checks) {
    const v = entry[c.field];
    if (isEmpty(v)) continue;
    const n = Number(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n === c.value) continue;
    let en;
    let hi;
    if (c.kind === 'months') {
      const contract = parseDmy(entry.d_contract);
      const alt = contract ? ` With ${c.value} months the scheduled completion date would be ${formatDmy(addMonths(contract, c.value))}.` : '';
      en = `${c.label_en} is ${n} months, but the RFP sets ${c.rfp_en}.${alt} Check which is right before saving the plan.`;
      hi = `${c.label_hi} ${n} माह है, जबकि RFP में ${c.value} माह है। योजना सहेजने से पहले पुष्टि करें।`;
    } else {
      const diff = Math.abs(n - c.value);
      en = `${c.label_en} ${formatInr(n)} differs from the RFP estimate ${formatInr(c.value)} (${c.rfp_en}) by ${formatInr(diff)}. Check which figure is right and whether GST is included.`;
      hi = `${c.label_hi} ${formatInr(n)} है, जबकि RFP का अनुमान ${formatInr(c.value)} है (अंतर ${formatInr(diff)})। सही राशि और GST की पुष्टि करें।`;
    }
    out.push({ level: 'warn', code: `rfp-${c.field}`, en, hi, citations: c.citations, field: c.field, office: true });
  }
  return out;
}

/** What to enter in DRIP-MIS for this category and amount. */
export function recommendedEntries(rules, res) {
  const out = [];
  const add = (field, value, en, citations) => out.push({ field, value, en, citations });
  const m = res.method;
  if (res.category === 'cs-firm') {
    const cqs = res.options.find((o) => o.method === 'CQS');
    const lim = describeThreshold(cqs.threshold.value, 'usd');
    add('method', m.method, cqs.allowed ? `${m.en}; CQS is also allowed below ${lim}` : `${m.en} (CQS is not allowed above ${lim})`, [...m.citations, ...cqs.citations]);
  } else {
    add('method', m.method, m.status === 'gap' ? m.text : m.en, m.citations);
  }
  if (res.market) add('market_approach', res.market.value.replace('–', '-'), res.market.en, res.market.citations);
  if (res.category === 'cs-firm') add('doc_type', res.eoi.withoutEoi ? 'Request for Proposals (RFP) – without EOI' : 'Request for Proposals (RFP) after REoI and shortlist', res.eoi.withoutEoi ? `RFP (no EOI needed below ${describeThreshold(res.eoi.part.value, 'usd')})` : res.eoi.en, [...res.document.flatMap((f) => f.citations), ...res.eoi.citations]);
  else if (res.document[0]) add('doc_type', res.document[0].en.split(' (')[0], res.document[0].en, res.document[0].citations);
  if (res.process[0]) add('process', /Two Envelope/.test(res.process[0].en) ? 'Single Stage Two Envelope' : res.process[0].en.split(';')[0], res.process[0].en, res.process[0].citations);
  if (res.wb) add('review_type', res.wb.prior ? 'Prior' : 'Post', res.wb.ds ? 'Prior (direct selection)' : `World Bank ${res.wb.prior ? 'prior' : 'post'} review${res.cpmu ? `; CPMU review ${res.cpmu.prior ? 'required' : 'not required'}` : ''}`, [...(res.wb.citations || []), ...(res.cpmu?.citations || [])]);
  if (res.category !== 'works') add('type_of_works', '', 'Leave "Type of Works" empty (it applies only to works).', rules.checker_citations.category_definitions);
  return out;
}
