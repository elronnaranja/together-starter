// Optional browser check of the real server: first-run setup, add a bill, money in and out, balance, second person.
// Needs Playwright with Chromium (not a project dependency). Run after `npm run build`:
//   PLAYWRIGHT=/path/to/node_modules/playwright/index.js node tests/ui-flow.mjs
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const pw = await import(process.env.PLAYWRIGHT || 'playwright'), chromium = pw.chromium || pw.default.chromium;
const hash = s => createHash('sha256').update(s).digest('hex');
const port = 4338, origin = 'http://localhost:' + port, dir = mkdtempSync(tmpdir() + '/together-ui-');
const bun = spawnSync('bun', ['--version']).status === 0 ? ['bun'] : ['npx', '--yes', 'bun'];
const server = spawn(bun[0], [...bun.slice(1), 'dist/server.ts'], {env: {...process.env, PORT: String(port), APP_ORIGIN: origin, DATA_DIR: dir, SETUP_OWNER_HASH: hash('ui-owner'), SETUP_VIEWER_HASH: hash('ui-viewer')}, stdio: 'ignore'});
const results = [];
const check = (name, ok) => { results.push((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) process.exitCode = 1; };
let browser;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const setPassword = async (page, role) => {
    await page.goto(`${origin}/setup?role=${role}&token=ui-${role}`);
    await page.fill('#password', 'ui-test-password-1');
    await page.fill('#confirm', 'ui-test-password-1');
    await Promise.all([page.waitForURL(origin + '/'), page.click('button')]);
  };
  const text = (page, sel) => page.locator(sel).evaluate(e => e.textContent.trim());
  const visible = (page, sel) => page.locator(sel).isVisible();

  // The second person signs in before the owner has set anything up: they wait.
  const vctx = await browser.newContext(), vpage = await vctx.newPage();
  await setPassword(vpage, 'viewer');
  await vpage.waitForSelector('#loading-title:has-text("Almost ready")');
  check('second person waits while the owner has not finished setup', await visible(vpage, '#loading-overlay') && !(await vpage.locator('#setup-dialog').evaluate(d => d.open)));

  // Owner: first run opens the setup dialog, which cannot be skipped.
  const octx = await browser.newContext({viewport: {width: 400, height: 860}}), page = await octx.newPage();
  await setPassword(page, 'owner');
  await page.waitForSelector('#setup-dialog[open]');
  await page.keyboard.press('Escape');
  check('setup dialog opens on first run and Escape does not close it', await page.locator('#setup-dialog').evaluate(d => d.open));
  check('currency defaults to ₱ and the time zone to the browser zone', (await page.inputValue('#su-currency')) === '₱' && (await page.inputValue('#su-zone')).length > 0);
  check('setup dialog fits a 400px phone (no sideways scroll)', await page.evaluate(() => document.documentElement.scrollWidth <= 400 && document.getElementById('setup-dialog').scrollWidth <= document.getElementById('setup-dialog').clientWidth + 1));
  if (process.env.SHOTS) await page.screenshot({path: process.env.SHOTS + '/setup-400.png'});
  await page.fill('#su-household', 'Test home');
  await page.fill('#su-owner', 'Sam');
  await page.fill('#su-partner', 'Alex');
  await page.fill('#su-currency', '$');
  await page.fill('#su-balance', '1000');
  await page.click('#save-setup');
  await page.waitForSelector('#setup-dialog:not([open])', {state: 'attached'});
  await page.waitForFunction(() => document.getElementById('sync-status').textContent.includes('All changes saved'));
  await page.setViewportSize({width: 1280, height: 900});
  check('after setup: balance is the opening cash in the chosen currency', (await text(page, '#balance')) === '$1,000.00');
  check('after setup: household name and initials show', (await text(page, '#household-eyebrow')) === 'Test home' && (await text(page, '#avatar-owner')) === 'S' && (await text(page, '#avatar-partner')) === 'A');
  check('billable hours line is hidden with no hourly rate', !(await visible(page, '#hours-line')));
  const today = await page.evaluate(() => today());

  // Add a bill.
  await page.click('[data-page="expenses"]');
  await page.click('#add-out');
  await page.fill('#expense-name', 'Rent');
  await page.fill('#expense-amount', '300');
  await page.selectOption('#expense-frequency', 'monthly');
  await page.fill('#expense-start', today);
  await page.click('#expense-form button.submit');
  await page.waitForFunction(() => document.getElementById('sync-status').textContent.includes('All changes saved'));
  await page.click('[data-page="home"]');
  check('the new bill appears in Upcoming', (await text(page, '#upcoming')).includes('Rent'));

  // Money in.
  await page.click('#add-in');
  await page.fill('#name', 'Salary');
  await page.fill('#amount', '250');
  await page.click('#entry-form button.submit');
  await page.waitForFunction(() => document.getElementById('balance').textContent === '$1,250.00');
  check('money in raises the balance', (await text(page, '#balance')) === '$1,250.00');

  // Money out against the bill.
  await page.click('#add-out');
  const rentOption = await page.$$eval('#pay-item option', o => o.find(x => x.textContent.startsWith('Rent'))?.value);
  await page.selectOption('#pay-item', rentOption);
  check('paying the bill suggests the full amount', (await page.inputValue('#amount')) === '300');
  await page.click('#entry-form button.submit');
  await page.waitForFunction(() => document.getElementById('balance').textContent === '$950.00');
  check('money out lowers the balance and the bill is paid', (await text(page, '#balance')) === '$950.00' && !(await text(page, '#upcoming')).includes(new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'})));
  check('an entry before the opening date is refused', await page.evaluate(() => { openEntry('in'); $('name').value = 'Old'; $('amount').value = '5'; $('date').value = addDays(openingDate(), -1); const minOk = $('date').min === openingDate(); $('entry-form').onsubmit({preventDefault() {}}); const ok = minOk && $('toast').textContent.includes('opening balance'); $('entry-dialog').close(); return ok; }));

  // Hourly rate in Settings turns the billable hours line on.
  await page.click('[data-page="settings"]');
  await page.fill('#hh-rate', '50');
  await page.click('#save-household');
  await page.waitForFunction(() => document.getElementById('sync-status').textContent.includes('All changes saved'));
  await page.click('[data-page="home"]');
  check('setting an hourly rate shows billable hours', await visible(page, '#hours-line'));

  // Second person now sees the shared budget and can add money in, but not bills.
  await vpage.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('hidden'), null, {timeout: 20000});
  check('second person sees the same balance once setup is done', (await text(vpage, '#balance')) === '$950.00');
  await vpage.click('[data-page="expenses"]');
  check('second person cannot add bills', !(await visible(vpage, '#add-out')) || (await text(vpage, '#add-out')) !== 'Add expense');
  await vpage.click('[data-page="home"]');
  await vpage.click('#add-in');
  await vpage.fill('#name', 'Gift');
  await vpage.fill('#amount', '10');
  await vpage.click('#entry-form button.submit');
  await vpage.waitForFunction(() => document.getElementById('balance').textContent === '$960.00');
  check('second person can record money in', (await text(vpage, '#balance')) === '$960.00');
  await vpage.click('[data-page="settings"]');
  check('second person sees household settings locked', await vpage.locator('#hh-balance').isDisabled() && await visible(vpage, '#household-locked'));
  check('second person is shown by their own name', (await text(vpage, '#account-name')) === 'Alex');
  if (process.env.SHOTS) await page.screenshot({path: process.env.SHOTS + '/home.png'});
} finally {
  await browser?.close();
  server.kill();
  rmSync(dir, {recursive: true, force: true});
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
