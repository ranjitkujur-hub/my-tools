// Rules engine: applies kb/rules.json to a category and an amount.
// All thresholds, wordings and citations come from the rules data.
import { formatInr, formatCrore, formatLakh, formatUsdMillion, describeThreshold } from './money.js';

const r2 = (x) => Math.round(x * 100) / 100;

/** amount: {inr, usd, currency}; currency is what the user typed. */
export function makeAmount(value, currency, rate) {
  return currency === 'USD'
    ? { inr: r2(value * rate), usd: value, currency: 'USD', rate }
    : { inr: value, usd: value / rate, currency: 'INR', rate };
}

/** Threshold of a bound expressed in the user's currency (rupees or dollars). */
function thresholdIn(b, unit, amt) {
  const { rate } = amt;
  if (unit === 'usd') return amt.currency === 'USD' ? r2(b.value * 1e6) : r2(b.value * 1e6 * rate);
  if (unit === 'inr') return amt.currency === 'INR' ? r2(b.value * 1e7) : r2((b.value * 1e7) / rate);
  if (unit === 'inr_abs') return amt.currency === 'INR' ? b.value : r2(b.value / rate);
  throw new Error(`unknown unit ${unit}`);
}

function cmp(x, op, t) {
  switch (op) {
    case '>': return x > t;
    case '>=': return x >= t;
    case '<': return x < t;
    case '<=': return x <= t;
    default: throw new Error(`bad op ${op}`);
  }
}

/** Which bound set to use: the column in the user's own currency when the slide gives one. */
function pickBounds(bounds, amt) {
  if (!bounds) return null;
  if (amt.currency === 'INR' && bounds.inr) return ['inr', bounds.inr];
  if (amt.currency === 'INR' && bounds.inr_abs) return ['inr_abs', bounds.inr_abs];
  if (bounds.usd) return ['usd', bounds.usd];
  if (bounds.inr) return ['inr', bounds.inr];
  if (bounds.inr_abs) return ['inr_abs', bounds.inr_abs];
  return null;
}

export function evalBounds(bounds, amt) {
  const picked = pickBounds(bounds, amt);
  if (!picked) return { ok: true, unit: null, parts: [] };
  const [unit, list] = picked;
  const x = amt.currency === 'USD' ? amt.usd : amt.inr;
  const parts = list.map((b) => {
    const t = thresholdIn(b, unit, amt);
    return { ...b, unit, threshold: t, ok: cmp(x, b.op, t), at: x === t };
  });
  return { ok: parts.every((p) => p.ok), unit, parts };
}

function amountText(amt) {
  const inr = amt.inr >= 1e7 ? `${formatInr(amt.inr)} (${formatCrore(amt.inr)})` : amt.inr >= 1e5 ? `${formatInr(amt.inr)} (${formatLakh(amt.inr)})` : formatInr(amt.inr);
  return `${inr} = ${formatUsdMillion(amt.usd)} at ₹${amt.rate} per US$`;
}

function thresholdText(p, amt) {
  const money = p.unit === 'usd' ? describeThreshold(p.value, 'usd') : p.unit === 'inr' ? describeThreshold(p.value, 'inr') : formatInr(p.value);
  const other = p.unit === 'usd'
    ? ` (${formatCrore(p.value * 1e6 * amt.rate)})`
    : p.unit === 'inr' ? ` (${formatUsdMillion((p.value * 1e7) / amt.rate)})` : '';
  return `${money}${other}`;
}

function factsFor(rules, ctx, field) {
  return (rules.facts || []).filter((f) => {
    if (f.field !== field) return false;
    const a = f.applies || {};
    if (a.categories && !a.categories.includes(ctx.category)) return false;
    if (a.methods && !a.methods.includes(ctx.method)) return false;
    if (a.markets && !a.markets.includes(ctx.market)) return false;
    return true;
  });
}

function reviewFor(rules, category, body, amt, method) {
  const rule = rules.review_rules.find((r) => r.category === category && r.body === body);
  if (method === 'DS') {
    return { prior: true, ds: true, rule, citations: rules.direct_selection.citations };
  }
  if (!rule) return null;
  const ev = evalBounds(rule.bounds, amt);
  const p = ev.parts[0];
  let boundaryNote = null;
  if (rule.bounds.usd && rule.bounds.inr) {
    const u = rule.bounds.usd[0];
    const i = rule.bounds.inr[0];
    if (u.op !== i.op) {
      const atBoundary = Math.abs(amt.usd - u.value * 1e6) < 0.5 || Math.abs(amt.inr - i.value * 1e7) < 0.5;
      if (atBoundary) boundaryNote = `At exactly this value the slide's US$ column ("${u.wording}") and ₹ column ("${i.wording}") disagree; the ${ev.unit === 'inr' ? '₹' : 'US$'} column was used because the amount was entered in ${amt.currency === 'INR' ? 'rupees' : 'dollars'}.`;
    }
  }
  return { prior: ev.ok, rule, part: p, unit: ev.unit, boundaryNote, citations: rule.citations, conflict: rule.conflict || null, note: null };
}

/** Main entry: {category, value, currency, rate, method?} -> recommendation object. */
export function classify(rules, { category, value, currency = 'INR', rate, method: forced } = {}) {
  rate = rate || rules.currency.inr_per_usd;
  const amt = makeAmount(value, currency, rate);
  const out = { category, amt, amountText: amountText(amt), near: [], conflicts: [] };
  const catRules = rules.method_rules.filter((m) => m.category === category);

  // --- method and market approach
  if (forced === 'DS') {
    out.method = { status: 'ok', method: 'DS', en: 'Direct Selection', citations: rules.direct_selection.citations, text: rules.direct_selection.en };
  } else if (category === 'cs-firm') {
    const qcbs = catRules.find((r) => r.id === 'cs-qcbs');
    const cqs = catRules.find((r) => r.id === 'cs-cqs');
    const lcs = catRules.find((r) => r.id === 'cs-lcs-fbs');
    const cqsEv = evalBounds(cqs.bounds, amt);
    out.method = { status: 'ok', method: 'QCBS', rule: qcbs, en: qcbs.en, hi: qcbs.hi, citations: qcbs.citations, conflict: qcbs.conflict };
    out.options = [
      { method: 'CQS', allowed: cqsEv.ok, rule: cqs, wording: cqs.bounds.usd[0].wording, threshold: cqsEv.parts[0], citations: cqs.citations, conflict: cqs.conflict },
      { method: 'LCS/FBS', allowed: 'justified', rule: lcs, citations: lcs.citations },
    ];
    const cm = rules.consulting_market;
    const nat = amt.usd < cm.national_below_usd_m * 1e6;
    out.market = { value: nat ? 'Open – National' : 'Open – International', en: nat ? cm.en_national : cm.en_international, citations: cm.citations };
    const eoi = evalBounds(rules.rfp_without_eoi.bounds, amt);
    out.eoi = { withoutEoi: eoi.ok, en: eoi.ok ? rules.rfp_without_eoi.en_yes : rules.rfp_without_eoi.en_no, citations: rules.rfp_without_eoi.citations, part: eoi.parts[0] };
    const mou = evalBounds(rules.mou.bounds, amt);
    out.mou = { allowed: mou.ok, en: rules.mou.en, citations: rules.mou.citations };
  } else if (category === 'cs-ind') {
    const ic = catRules[0];
    out.method = { status: 'ok', method: 'IC', rule: ic, en: ic.en, hi: ic.hi, citations: ic.citations };
    out.market = { value: 'Open – National', en: 'Open competitive selection (REoI) or comparison of known qualified individuals', citations: rules.facts.find((f) => f.id === 'doc-ind').citations };
  } else {
    const hits = catRules.filter((r) => evalBounds(r.bounds, amt).ok);
    if (hits.length === 1) {
      const r = hits[0];
      out.method = { status: 'ok', method: r.method, rule: r, en: r.en, hi: r.hi, citations: r.citations, conflict: r.conflict || null };
      out.market = { value: r.market, en: r.market, citations: r.citations };
    } else {
      // value not covered by the wording (a "less than" bound meeting a "more than" bound)
      const sorted = catRules.map((r) => ({ r, ev: evalBounds(r.bounds, amt) }));
      const touching = sorted.filter(({ ev }) => ev.parts.some((p) => p.at));
      const words = touching.map(({ r, ev }) => `${r.en}: "${ev.parts.find((p) => p.at).wording}"`).join('; ');
      const higher = touching.map(({ r }) => r).find((r) => r.method === 'RFB') || touching[0]?.r || catRules[0];
      out.method = {
        status: 'gap', method: higher.method, rule: higher, en: higher.en, hi: higher.hi,
        text: `This exact value is not covered by the slide wording (${words}). Confirm the method with CPMU before entering it.`,
        alternatives: touching.map(({ r }) => r),
        citations: touching.flatMap(({ r }) => r.citations),
        conflict: touching.map(({ r }) => r.conflict).filter(Boolean).join(' ') || null,
      };
      out.market = { value: higher.market, en: higher.market, citations: higher.citations };
    }
  }
  const ctx = { category, method: out.method.method, market: out.market?.value };

  // --- reviews
  out.wb = reviewFor(rules, category, 'wb', amt, ctx.method);
  out.cpmu = reviewFor(rules, category, 'cpmu', amt, ctx.method);
  // notes that only apply to some cases (international works; CQS shown as NA in the review table)
  if (out.wb?.rule?.note && ((category === 'works' && /International/.test(ctx.market || '')) || ctx.method === 'CQS')) out.wb.note = out.wb.rule.note;

  // --- documents, process, timing, securities
  for (const field of ['document', 'process', 'min_time', 'bid_security', 'validity', 'prebid', 'note']) {
    out[field] = factsFor(rules, ctx, field);
  }

  // --- GeM (goods only, in lieu of RFQ/shopping)
  if (category === 'goods') {
    out.gem = rules.gem.filter((g) => evalBounds(g.bounds, amt).ok);
    out.gemCaution = rules.gem_caution;
  }

  // --- roadmap column (S5 slide 48) for goods/works/NCS
  if (['works', 'goods', 'ncs'].includes(category)) {
    const review = out.wb?.prior ? 'prior' : 'post';
    const col = rules.roadmap.columns.find((c) => c.method === ctx.method && (!c.market || c.market === ctx.market) && c.review === review)
      || rules.roadmap.columns.find((c) => c.method === ctx.method && (!c.market || c.market === ctx.market));
    out.roadmapColumn = col ? col.id : null;
  }

  // --- near a threshold (±n %)
  out.near = nearThresholds(rules, category, amt);
  out.cautions = rules.cautions;
  out.conflicts = [out.method.conflict, out.wb?.conflict, out.cpmu?.conflict, ...(out.options || []).map((o) => o.conflict), ...out.min_time.map((f) => f.conflict)].filter(Boolean);
  return out;
}

function boundSources(rules, category) {
  const src = [];
  for (const r of rules.method_rules.filter((m) => m.category === category)) if (r.bounds) src.push({ label: `Method: ${r.en}`, bounds: r.bounds, citations: r.citations });
  for (const r of rules.review_rules.filter((m) => m.category === category)) src.push({ label: r.body === 'wb' ? 'World Bank prior review' : 'CPMU review', bounds: r.bounds, citations: r.citations });
  if (category === 'cs-firm') {
    src.push({ label: 'National market approach / RFP without EOI', bounds: rules.rfp_without_eoi.bounds, citations: rules.rfp_without_eoi.citations });
  }
  if (category === 'goods') for (const g of rules.gem) src.push({ label: `GeM: ${g.en.split(' (')[0]}`, bounds: g.bounds, citations: g.citations });
  return src;
}

export function nearThresholds(rules, category, amt) {
  const pct = rules.near_threshold_pct ?? 10;
  const x = amt.currency === 'USD' ? amt.usd : amt.inr;
  const seen = new Set();
  const out = [];
  for (const s of boundSources(rules, category)) {
    const picked = pickBounds(s.bounds, amt);
    if (!picked) continue;
    const [unit, list] = picked;
    for (const b of list) {
      const t = thresholdIn(b, unit, amt);
      const diff = ((x - t) / t) * 100;
      if (Math.abs(diff) <= pct) {
        const key = `${s.label}|${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ label: s.label, wording: b.wording, unit, value: b.value, threshold: t, diffPct: Math.round(diff * 10) / 10, text: thresholdText({ ...b, unit }, amt), citations: s.citations });
      }
    }
  }
  return out;
}

/** Plain lines (English) used by the answer card and the plan helper. */
export function recommendationLines(rules, res) {
  const L = [];
  const cat = rules.categories.find((c) => c.id === res.category);
  const add = (key, en, citations, extra = {}) => L.push({ key, en, citations: citations || [], ...extra });
  if (res.method.status === 'gap') add('method', `Method: ${res.method.text}`, res.method.citations, { warn: true, conflict: res.method.conflict });
  else add('method', `Method: ${res.method.en}`, res.method.citations, { conflict: res.method.conflict });
  if (res.options) {
    for (const o of res.options) {
      if (o.method === 'CQS') add('cqs', o.allowed ? `CQS is allowed below ${describeThreshold(o.threshold.value, 'usd')} ("${o.wording}") for small assignments.` : `CQS is not allowed above ${describeThreshold(o.threshold.value, 'usd')} ("${o.wording}").`, o.citations, { conflict: o.conflict });
      else add('lcs', 'LCS / FBS only in justified cases.', o.citations);
    }
  }
  if (res.market) add('market', `Market approach: ${res.market.en}`, res.market.citations);
  if (res.eoi) add('eoi', res.eoi.en, res.eoi.citations);
  const rv = (r, who) => {
    if (!r) return;
    const label = who === 'wb' ? 'World Bank review' : 'CPMU review';
    if (r.ds) return add(who, `${label}: ${who === 'wb' ? 'Prior (all direct-selection contracts)' : 'all contracts, with justification'}`, r.citations);
    const thr = r.part ? thresholdText(r.part, res.amt) : '';
    const wording = r.part ? `"${r.part.wording}"` : '';
    const en = who === 'wb'
      ? `${label}: ${r.prior ? 'Prior' : 'Post'} (prior-review threshold for ${cat.en.toLowerCase()}: ${wording} = ${thr})`
      : `${label}: ${r.prior ? 'required' : 'not required'} (threshold ${wording} = ${thr})`;
    add(who, en, r.citations, { conflict: r.conflict, note: [r.boundaryNote, r.note].filter(Boolean).join(' ') || null });
  };
  rv(res.wb, 'wb');
  rv(res.cpmu, 'cpmu');
  for (const f of res.document) add('document', `Document: ${f.en}`, f.citations);
  for (const f of res.process) add('process', `Process: ${f.en}`, f.citations);
  for (const f of res.min_time) add('min_time', `Minimum time: ${f.en}`, f.citations, { conflict: f.conflict });
  for (const f of res.bid_security) add('bid_security', `Bid security: ${f.en}`, f.citations);
  for (const f of res.validity) add('validity', f.en, f.citations);
  for (const f of res.prebid) add('prebid', f.en, f.citations);
  for (const f of res.note) add('note', f.en, f.citations);
  if (res.gem && res.gem.length) add('gem', `GeM option: ${res.gem.map((g) => g.en).join('; or ')}. ${res.gemCaution.en}`, [...res.gem.flatMap((g) => g.citations), ...res.gemCaution.citations]);
  return L;
}
