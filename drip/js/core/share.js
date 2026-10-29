// WhatsApp share text and links.

export const SHARE_LIMIT = 1500;
const MORE = '… (पूरा उत्तर लिंक पर / full answer at the link)';

/** Strip the small markdown used in answers to plain WhatsApp text. */
export function plainText(md) {
  return String(md ?? '')
    .split('\n')
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) => (/^\s*\|/.test(l) ? l.replace(/^\s*\|\s*|\s*\|\s*$/g, '').split(/\s*\|\s*/).join(' – ') : l))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .trim();
}

/**
 * Build the WhatsApp message.
 * {q, a, hi, sources: ['Proc. Manual Sec-4, slide 9', ...], link, office}
 */
export function buildShareText({ q, a, hi, sources = [], link = '', office = false }) {
  const head = `*प्रश्न / Q:* ${q}\n`;
  const src = sources.length ? `\n*आधार / Source:* ${sources.join('; ')}` : '';
  const tag = office ? '\n_कार्यालय की आंतरिक जानकारी — केवल कार्यालय में साझा करें / Internal office information — share only within the office_' : '';
  const tail = `${src}${tag}${link ? `\n${link}` : ''}`;
  let body = plainText(a);
  if (hi) body += `\n${hi}`;
  const fixed = head.length + '*उत्तर / A:* '.length + tail.length;
  const room = SHARE_LIMIT - fixed;
  if (body.length > room) body = body.slice(0, Math.max(0, room - MORE.length)).replace(/\s+\S*$/, '') + MORE;
  return `${head}*उत्तर / A:* ${body}${tail}`;
}

export function waLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** App link without any query string (never carries secrets): base + '#/q/<id>' etc. */
export function deepLink(base, route) {
  const clean = String(base).split('#')[0].split('?')[0];
  return `${clean}#/${route.replace(/^#?\/?/, '')}`;
}
