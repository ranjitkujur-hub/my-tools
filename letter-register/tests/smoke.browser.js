/*
 * Browser smoke test (optional, not part of `npm test`). Needs Playwright with Chromium:
 *   node tests/smoke.browser.js            (uses `playwright` from node_modules or the global install)
 * Opens index.html from disk, loads samples, adds an entry by keyboard, builds a chronology,
 * downloads .docx/.xlsx, backs up, restores, imports a CSV and checks there were no errors or network calls.
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e2) { console.log('Playwright not found — skipping smoke test'); process.exit(0); }
}
const os = require('os');
const fs = require('fs');
const path = require('path');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-smoke-'));
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) errors.push('NETWORK: ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-register:not([hidden])');
  await page.click('#empty-samples');
  await page.waitForTimeout(300);
  console.log('rows after samples', await page.locator('#reg-body tr').count());
  await page.fill('#f-q', 'बांध प्राक्कलन');
  await page.waitForTimeout(300);
  console.log('search rows', await page.locator('#reg-body tr').count());
  await page.fill('#f-q', 'भू अर्जन');
  await page.waitForTimeout(300);
  console.log('search2 rows', await page.locator('#reg-body tr').count());
  await page.click('#f-clear');
  await page.screenshot({ path: path.join(OUT, 'register.png'), fullPage: true });

  // add entry with keyboard
  await page.goto(URL + '#add');
  await page.waitForSelector('#screen-add:not([hidden])');
  await page.focus('input[name=letterNo]');
  await page.keyboard.type('परीक्षण-9/2026'); await page.keyboard.press('Enter');
  await page.keyboard.type('05092026'); await page.keyboard.press('Enter');
  console.log('date field', await page.inputValue('input[name=date]'), '| hint', await page.textContent('[data-hint=date]'));
  console.log('focused', await page.evaluate(() => document.activeElement.name));
  await page.keyboard.type('06.09.2026'); await page.keyboard.press('Enter');
  await page.keyboard.type('काल्पनिक प्रेषक'); await page.keyboard.press('Enter');
  await page.keyboard.type('काल्पनिक प्राप्तकर्ता'); await page.keyboard.press('Enter');
  await page.keyboard.type('परीक्षण विषय'); await page.keyboard.press('Enter');
  await page.keyboard.type('नमूना — बकाया वसूली'); await page.keyboard.press('Enter');
  console.log('chips', await page.locator('#matter-chips .chip').count());
  await page.keyboard.press('Enter');
  console.log('focused after tags', await page.evaluate(() => document.activeElement.name || document.activeElement.id));
  await page.fill('textarea[name=summary]', 'राशि रु. 1,000');
  await page.fill('input[name=dueDate]', '1.10.2026');
  // link reference
  await page.fill('#ref-picker input', 'नमूना-101');
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  console.log('ref chips', await page.locator('#ref-picker .chip').count());
  await page.click('#btn-save');
  await page.waitForTimeout(300);
  console.log('hash after save', await page.evaluate(() => location.hash.slice(0, 7)), 'relations', (await page.textContent('#form-relations')).slice(0, 80));
  await page.click('#btn-duplicate');
  await page.fill('input[name=letterNo]', 'परीक्षण-10/2026');
  await page.click('#btn-save-new');
  await page.waitForTimeout(300);
  console.log('total after dup', await page.evaluate(() => document.querySelector('#reg-count') && 1), );

  // in-reply-to check on sample-3
  await page.goto(URL + '#edit/sample-3');
  await page.waitForTimeout(200);
  console.log('sample-3 relations:', (await page.textContent('#form-relations')).slice(0, 120));
  await page.screenshot({ path: path.join(OUT, 'form.png'), fullPage: true });

  // pending
  await page.goto(URL + '#pending');
  await page.waitForTimeout(200);
  console.log('pending overdue', await page.locator('.pitem.overdue').count(), 'soon', await page.locator('.pitem.soon').count(), 'badge', await page.textContent('#pending-badge'));

  // chronology
  await page.goto(URL + '#chronology');
  await page.waitForTimeout(200);
  await page.selectOption('#ch-matter', 'नमूना — भू-अर्जन (काल्पनिक गाँव)');
  await page.waitForTimeout(200);
  console.log('chrono rows', await page.locator('#ch-preview tbody tr').count(), '| first:', await page.textContent('#ch-preview tbody tr:first-child'));
  await page.screenshot({ path: path.join(OUT, 'chrono.png'), fullPage: true });
  for (const id of ['#ch-docx', '#ch-xlsx']) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(id)]);
    const p = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(p);
    console.log('downloaded', dl.suggestedFilename(), fs.statSync(p).size);
  }
  // print emulation
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#ch-print');
  await page.waitForTimeout(100);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(OUT, 'chrono.pdf'), format: 'A4' });
  await page.emulateMedia({ media: 'screen' });

  // annexure from register selection
  await page.goto(URL + '#register');
  await page.waitForTimeout(200);
  await page.locator('#reg-body input[type=checkbox]').nth(0).check();
  await page.locator('#reg-body input[type=checkbox]').nth(2).check();
  await page.click('#reg-annex');
  await page.waitForTimeout(200);
  console.log('annex:', await page.locator('#annex-items li').allTextContents());

  // backup + restore
  await page.goto(URL + '#data');
  await page.waitForTimeout(200);
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#btn-backup')]);
  const bkPath = path.join(OUT, 'backup.json'); await bk.saveAs(bkPath);
  const nBackup = JSON.parse(fs.readFileSync(bkPath, 'utf8')).entries.length;
  console.log('backup entries', nBackup, '| status:', (await page.textContent('#backup-status')).slice(0, 60));
  console.log('filesync text:', (await page.textContent('#filesync')).slice(0, 60));
  await page.click('#btn-unsamples'); await page.click('#dlg-actions button[value=yes]'); await page.waitForTimeout(200);
  console.log('after remove samples', await page.evaluate(() => document.querySelectorAll('#matters-list .mrow').length));
  await page.setInputFiles('#restore-file', bkPath);
  await page.waitForSelector('dialog[open]');
  console.log('restore preview:', (await page.textContent('#dlg-body')).slice(0, 150));
  const [safety] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-actions button[value=replace]')]);
  console.log('safety copy', safety.suggestedFilename());
  await page.waitForTimeout(300);

  // import csv
  const csv = '﻿क्रम,पत्रांक,दिनांक,प्रेषक,विषय,मामला,स्थिति\n1,आयात-1,12/08/2026,क,आयातित पहला,आयात मामला,लंबित\n2,आयात-2,2019,ख,आयातित दूसरा,आयात मामला,\n';
  fs.writeFileSync(path.join(OUT, 'imp.csv'), csv);
  await page.goto(URL + '#import');
  await page.setInputFiles('#imp-file', path.join(OUT, 'imp.csv'));
  await page.waitForSelector('#imp-step2:not([hidden])');
  console.log('import preview:', (await page.textContent('#imp-preview')).slice(0, 120));
  await page.click('#imp-go'); await page.click('#dlg-actions button[value=yes]'); await page.waitForTimeout(300);
  console.log('count after import', await page.textContent('#reg-count'));

  // reload persists
  await page.reload(); await page.waitForTimeout(400);
  console.log('after reload', await page.textContent('#reg-count'));

  // phone
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p2 = await ph.newPage();
  p2.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await p2.goto(URL);
  await p2.waitForTimeout(300);
  await p2.click('#empty-samples'); await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(OUT, 'phone.png'), fullPage: false });
  console.log('phone horiz overflow', await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  console.log('ERRORS', errors);
  if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
