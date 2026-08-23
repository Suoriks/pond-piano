'use strict';
// Instrumented headless-Chromium smoke for iteration 0037: the two shore
// popovers (diary + volume) finally behave like real dialogs. The trigger's
// aria-expanded is honest (only true while the panel is actually open),
// opening moves focus into the panel, Tab is trapped inside an open panel,
// Esc returns focus to the trigger stone, and opening a panel with rows
// lands the keyboard player on the first surviving row.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4281;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'shore-a11y-37.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let p = url.pathname; if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({ executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const focusId = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.className || '');
  const expanded = () => page.evaluate(() => document.querySelector('#diary-stone').getAttribute('aria-expanded'));

  // Initial: both stones report closed honestly.
  const initialDiaryExpanded = await expanded();
  const initialVolumeExpanded = await page.evaluate(() => document.querySelector('#volume-stone').getAttribute('aria-expanded'));

  // Open the volume stone by click: panel becomes open, expanded true, and
  // focus moves onto the range (not the trigger).
  await page.locator('#volume-stone').click();
  await page.waitForTimeout(120);
  const volumeExpanded = await page.evaluate(() => document.querySelector('#volume-stone').getAttribute('aria-expanded'));
  const volumeFocus = await focusId();

  // Tab trap inside the open volume panel: range -> mute -> range.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(60);
  const volTab1 = await focusId();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(60);
  const volTab2 = await focusId();

  // Esc closes the volume panel and returns focus to its stone.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const volClosedExpanded = await page.evaluate(() => document.querySelector('#volume-stone').getAttribute('aria-expanded'));
  const volAfterEsc = await focusId();

  // Open the diary stone; with no ink yet the panel shows the empty note and
  // focus stays on the stone (no tabbable row), but expanded must be true.
  await page.locator('#diary-stone').click();
  await page.waitForTimeout(120);
  const diaryExpanded = await expanded();
  const diaryFocusEmpty = await focusId();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const diaryClosedExpanded = await expanded();
  const diaryAfterEsc = await focusId();

  // Draw two finished phrases so the diary has rows, then open it: focus
  // must land on the first row's action (not stay on the stone), and Escape
  // must return focus to the trigger with the panel honestly closed.
  const sweep = async (startX, startY, amp, phase) => {
    await page.mouse.move(startX, startY); await page.mouse.down();
    for (let step = 0; step <= 22; step += 1) {
      await page.mouse.move(startX + step * 9, startY + Math.sin(step / 4 + phase) * amp);
      await page.waitForTimeout(36);
    }
    await page.mouse.up(); await page.waitForTimeout(650);
  };
  await sweep(70, 430, 20, 0);
  await sweep(120, 360, 17, 2.2);
  await page.locator('#diary-stone').click();
  await page.waitForTimeout(260);
  const diaryFocusWithRows = await focusId();
  const diaryRows = await page.locator('.diary-row').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const diaryRowsClosedExpanded = await page.evaluate(() => document.querySelector('#diary-stone').getAttribute('aria-expanded'));
  const diaryAfterEscLive = await focusId();

  await page.screenshot({ path: OUT });
  await browser.close(); await context.close(); server.close();
  console.log(JSON.stringify({
    initialDiaryExpanded, initialVolumeExpanded,
    volumeExpanded, volumeFocus, volTab1, volTab2,
    volClosedExpanded, volAfterEsc,
    diaryExpanded, diaryFocusEmpty, diaryClosedExpanded, diaryAfterEsc,
    diaryRows, diaryFocusWithRows, diaryRowsClosedExpanded, diaryAfterEscLive,
    honestClosed: initialDiaryExpanded === 'false' && initialVolumeExpanded === 'false' && volClosedExpanded === 'false' && diaryClosedExpanded === 'false' && diaryRowsClosedExpanded === 'false',
    focusMovesInOnOpen: volumeFocus === 'master-volume',
    trapWraps: volTab1 === 'mute-water' && volTab2 === 'master-volume',
    escReturns: volAfterEsc === 'volume-stone' && diaryAfterEsc === 'diary-stone' && diaryAfterEscLive === 'diary-stone',
    diaryOpensOntoRow: diaryFocusWithRows.startsWith('diary-entry') && diaryRows === 2,
    errors
  }, null, 2));
  const pass = (initialDiaryExpanded === 'false' && initialVolumeExpanded === 'false' && volClosedExpanded === 'false' && diaryClosedExpanded === 'false' && diaryRowsClosedExpanded === 'false') && volumeFocus === 'master-volume' && volTab1 === 'mute-water' && volTab2 === 'master-volume' && volAfterEsc === 'volume-stone' && diaryAfterEsc === 'diary-stone' && diaryAfterEscLive === 'diary-stone' && diaryFocusWithRows.startsWith('diary-entry') && diaryRows === 2;
  if (!pass) process.exitCode = 1;
})().catch(err => { console.error(err); process.exit(1); });