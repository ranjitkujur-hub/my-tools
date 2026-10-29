// Dates in DD/MM/YYYY (as DRIP-MIS uses). Calculations are done in UTC to avoid DST surprises.

export function parseDmy(s) {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(String(s ?? ''));
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1) return d;
    return null;
  }
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(s ?? ''));
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
export function formatDmy(d) {
  return d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '';
}
export function toIso(d) {
  return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : '';
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

/** Calendar months, same day of month; clamps to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(d, n) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

/** Adds working days, skipping Saturdays and Sundays (public holidays are not known to the app). */
export function addBusinessDays(d, n) {
  let x = new Date(d.getTime());
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    x = addDays(x, step);
    const wd = x.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return x;
}

export function weeksBetween(a, b) {
  return (b.getTime() - a.getTime()) / (7 * 86400000);
}

/** DRIP-MIS automatic dates from "Draft Bid Documents" using the observed offsets in the form definition. */
export function misAutoDates(form, draft, months) {
  const start = typeof draft === 'string' ? parseDmy(draft) : draft;
  if (!start) return null;
  const out = { d_draft_bid_docs: start };
  for (const o of form.observed_auto_dates.offsets_days) {
    const base = out[o.from];
    if (!base) continue;
    out[o.field] = addDays(base, o.days);
  }
  if (Number.isFinite(+months) && +months > 0 && out.d_contract) out.completion_date = addMonths(out.d_contract, +months);
  return out;
}
