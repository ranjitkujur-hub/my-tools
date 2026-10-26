/*
 * Browser smoke test (optional, not part of `node --test`). Needs Playwright with Chromium:
 *   node tests/smoke.browser.js
 * Serves the repository on a local port, opens every module page at 375 px and 1280 px,
 * checks there are no script errors, no network calls outside this server, no horizontal
 * scrolling on a phone, that results and drawings render, and that DXF / SVG / PNG / CSV /
 * software exports download. Also saves a design, checks the projects page, backup and
 * the print views.
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.log('Playwright not found — skipping smoke test'); process.exit(0); }
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/design-studio/index.html`;
  const browser = await chromium.launch();
  const problems = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => problems.push(`${tag} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${tag} console: ${m.text()}`); });
    page.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost') && !u.startsWith('blob:') && !u.startsWith('data:')) problems.push(`${tag} NETWORK: ${u}`); });
  };

  // phone width: every page renders without horizontal scroll
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true });
  const pp = await phone.newPage(); watch(pp, '375');
  await pp.goto(base);
  await pp.waitForSelector('.home');
  const ids = await pp.$$eval('#side a[data-id]', as => as.map(a => a.dataset.id));
  console.log('pages:', ids.length);
  for (const id of ids) {
    await pp.goto(base + '#/m/' + id);
    await pp.waitForSelector('#p-results h2');
    await pp.waitForTimeout(400);
    const st = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, svg: !!document.querySelector('#p-drawing svg'), nok: !!document.querySelector('#p-results p.status.nok:not(:only-of-type)'), err: (document.querySelector('#p-results .status.nok') || {}).textContent || '' }));
    if (st.sw > st.w + 1) problems.push(`375 ${id}: horizontal scroll ${st.sw} > ${st.w}`);
    if (!st.svg) problems.push(`375 ${id}: no drawing (${st.err})`);
  }
  await pp.click('#menu-btn');
  if (!(await pp.evaluate(() => document.body.classList.contains('menu-open')))) problems.push('menu does not open');
  await pp.screenshot({ path: path.join(require('os').tmpdir(), 'ds-phone-menu.png') });

  // desktop: drawings, downloads and exports on every page
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const dp = await desk.newPage(); watch(dp, '1280');
  await dp.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  let downloads = 0;
  for (const id of ids) {
    await dp.goto(base + '#/m/' + id);
    await dp.waitForSelector('#p-drawing svg', { timeout: 5000 }).catch(() => problems.push(`1280 ${id}: no drawing`));
    for (const act of ['dxf', 'svg', 'png', 'csv-all']) {
      const btn = await dp.$(`[data-act="${act}"]`);
      if (!btn) { problems.push(`1280 ${id}: no ${act} button`); continue; }
      const [dl] = await Promise.all([dp.waitForEvent('download', { timeout: 5000 }).catch(() => null), btn.click()]);
      if (!dl) { problems.push(`1280 ${id}: ${act} did not download`); continue; }
      const f = await dl.path();
      const text = fs.readFileSync(f, act === 'png' ? null : 'utf8');
      if (act === 'dxf' && !(text.includes('AC1009') && text.trim().endsWith('EOF'))) problems.push(`${id}: bad DXF`);
      if (act === 'png' && text.slice(1, 4).toString() !== 'PNG') problems.push(`${id}: bad PNG`);
      downloads++;
    }
    for (const btn of await dp.$$('[data-act="export"]')) {
      const [dl] = await Promise.all([dp.waitForEvent('download', { timeout: 5000 }).catch(() => null), btn.click()]);
      if (!dl) problems.push(`1280 ${id}: export did not download`); else downloads++;
    }
    await dp.click('[data-act="print-A3"]');
    await dp.waitForTimeout(150);
    if (!(await dp.evaluate(() => document.querySelector('#print-root svg') !== null))) problems.push(`${id}: print sheet empty`);
    await dp.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
  console.log('downloads:', downloads);

  // design note, save, projects, backup
  await dp.goto(base + '#/m/canal-lined');
  await dp.waitForSelector('#p-drawing svg');
  await dp.click('[data-act="note"]');
  await dp.waitForTimeout(150);
  const note = await dp.evaluate(() => document.querySelector('#print-root').textContent);
  for (const k of ['Design note', 'Inputs', 'Step-by-step working', 'Results and checks', 'Designed', 'Preliminary design aid']) if (!note.includes(k)) problems.push('design note missing ' + k);
  await dp.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await dp.fill('#f-Q', '15');
  await dp.waitForTimeout(400);
  await dp.click('[data-act="save"]');
  await dp.fill('#dlg input[name=project]', 'Sample Project');
  await dp.fill('#dlg input[name=structure]', 'Distributary 1 Ch 0+000');
  await dp.click('#dlg button[value=new]');
  await dp.waitForTimeout(300);
  await dp.goto(base + '#/projects');
  await dp.waitForSelector('ul.designs li');
  const [bk] = await Promise.all([dp.waitForEvent('download'), dp.click('[data-pact="backup"]')]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
  if (backup.designs.length !== 1 || backup.designs[0].inputs.Q !== 15) problems.push('backup content wrong');
  await dp.click('ul.designs a');
  await dp.waitForSelector('#loaded:not([hidden])');
  if ((await dp.inputValue('#f-Q')) !== '15') problems.push('saved inputs not restored');
  await dp.goto(base + '#/guide');
  await dp.waitForSelector('.guide-page');
  const sw = await dp.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r));
  if (!sw) problems.push('service worker not registered');
  await dp.screenshot({ path: path.join(require('os').tmpdir(), 'ds-guide.png'), fullPage: true });

  await browser.close();
  server.close();
  if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
  console.log('Smoke test OK');
})().catch(e => { console.error(e); server.close(); process.exit(1); });
